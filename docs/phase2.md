# Phase 2 実装・検証・設定ガイド

実装日: 2026-10-17（日本時間）。AGENTS.mdと前段階の設計を参照。
本番DBへの適用・デプロイ・既存データ移行・キーの変更は行っていません。

## 実装範囲

- Supabase Authのメール/パスワード、Google、メールリンクを再利用。cookieでブラウザ/サーバー間のセッション共有、更新、ログアウトに対応。
- `/app`以下をProxyで誘導し、ページのデータアクセス層・APIでも`getUser()`で認証を再検証。匿名ログインは拒否。認証エラー、メール確認待ち、設定不足を表示。
- ワークスペース作成、名前/説明の編集、切替、メンバー一覧、招待リンクの作成/再発行/取消、招待先本人の参加、役割変更、メンバー除外。
- Owner/Admin/Member/Viewer。AdminはMember/Viewerの管理のみ。最後のOwnerの降格・除外を拒否。Owner移譲は相手をOwnerにしてから自分の役割を変更。
- サイドバー、ヘッダー、WS切替、ユーザーメニュー、モバイルメニュー、ライト/ダーク切替と設定保持、ボタン/入力/モーダル、ローディング/エラー/空状態。
- HomeとSettingsを提供。Issues / Projects / Wiki / Flow Map / Handoffは「準備中」と明示。旧ノートURLを維持し、旧tasks/search/flow URLはWS選択へ誘導。元の試作コンポーネントは残しています。

招待リンクはメール送信サービスを追加せず管理者が共有する方式です。トークンはURL fragmentに置き、ログインへの遷移中は同一タブのsessionStorageへ一時保存し、復帰先のクエリには載せません。別タブ/ブラウザでメール確認した場合は、ログイン後に元の招待リンクを開き直せます。DBはハッシュだけを保持し、参加時は確認済みメール、有効期限、未使用/未取消、招待者の現時点の権限を検証します。既存activeメンバーの権限を招待受諾で上書きしません。

## DBマイグレーション

追加ファイル: `supabase/migrations/20261017072651_phase2_workspaces.sql`
Supabase CLIで生成した日時付きファイルです。旧`supabase-migrations/`の001/002は変更していません。

追加表:

| 分類 | テーブル |
| --- | --- |
| WS基盤 | workspaces / workspace_members / workspace_invitations / workspace_audit_events |
| 将来機能の共通基盤 | resources / resource_relations |
| 将来機能のデータ構造 | projects / issues / wiki_pages / wiki_revisions / handoffs / handoff_items / handoff_versions |

すべてRLSを有効化。所属・WS・最近更新・関連先等の索引を追加。関連先/プロジェクト/担当の複合FKでWS越境を禁止し、resource kindとサブタイプの整合性・サブタイプ必須を保証します。

将来機能の表は**読み取りのみ**を許可し、業務書込みAPI/ポリシーは公開していません。Wiki/Handoffの下書きに備え、resources.visibilityの初期値はprivateです。resourcesの可視性を親として関連・版にも適用。公開時の状態/visibility連動、担当のactive確認、関連の循環検証、Handoffのチェックリスト/受領表・送信版検証・不変性は各機能の実装時に追加します。Phase 2で業務機能が完成したという扱いにはしません。

WSの直接INSERT/UPDATE/DELETEは通常ユーザーへ許可せず、専用コマンドを使用。公開関数はSECURITY INVOKER、privateスキーマの制限付き関数だけがSECURITY DEFINERです。必要性は最初のOwner所属作成とRLS再帰の回避・権限変更の原子性。全コマンドで検証済みJWTのユーザーID・role・DB所属を検査し、search_pathを固定、PUBLIC/anonのEXECUTEを剥奪します。privateスキーマはData APIに公開しないでください。

通常アプリコードはService Role Keyを読みません。公開設定にservice keyが誤って設定された場合も拒否します。ただしSupabaseのservice_role自体がRLSをバイパスできる管理資格である性質は変えられません。管理キーを持つ主体のDB直接操作まで防ぐという意味ではありません。

旧`public.notes`がある場合はowner列を必要に応じて追加し、ポリシーを所有者限定に置き換えます。uuid/text比較は双方をtextとして比較し、列の型や所有者値は変えません。owner不明データは保持しますが、通常ユーザーには公開しません。カスタムの既存notesポリシーは置換対象になるため、適用前に必ず確認してください。

旧ノートAPIのサービスロール・共有JSONフォールバックを除去し、認証とowner条件を必須にしました。`data/notes.json`の既存内容は変更していません。そこにしかないデータの移行は別途、所有者確認後に実施します。旧Geminiエンドポイントも認証必須・入力上限・非公開エラーにしました。モデル/共有レート制限等のAI本体刷新は後続フェーズです。

## 必要な手動設定（本番は承認後）

1. 既存DBのバックアップを取り、隔離環境で復元を確認。notesの列/型/ポリシー、所有者不明行、既存テーブル名との衝突を確認する。
2. 新規の検証DBでは旧001でnotesを作った後に本Phase 2 SQLを実行可能。旧002はuuid/textの不整合があるためそのまま再実行しない。既存DBでは001/002を再実行せず、実状態を確認してPhase 2 SQLだけを適用する。
3. 追加SQLはbegin/commitを含む単一のマイグレーションで、一度だけ実行する。既存のmigration履歴と旧ディレクトリの運用が異なるため、無確認で`supabase db push`しない。ステージングで適用し、結果確認後に承認を得て本番へ進む。
4. Data APIの公開スキーマにpublicが含まれ、intelliflow_privateが含まれないことを確認。SQLはauthenticatedに必要なSELECT/EXECUTEを明示的に付与する。
5. 既存変数`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`をブラウザ用に設定。サーバーは`SUPABASE_URL` / `SUPABASE_ANON_KEY`を優先し、なければ公開設定を利用する。両者は同じプロジェクトを指すこと。キーはpublishableまたは旧anonのみ。`SUPABASE_SERVICE_ROLE_KEY`は通常処理には不要で、既存値を変更する必要はない。
6. `SUPABASE_NOTES_TABLE`が既定のnotes以外なら、その表にも別途同等のowner RLSを準備する。今回のSQLの旧ノート補正対象はpublic.notesのみ。
7. Supabase AuthのSite URLとRedirect URLsに開発/本番の`/auth/callback`を登録する。Google providerとGoogle側のSupabase callback設定は既存構成を維持して確認する。
8. メール確認・メールリンクはPKCEのcodeをcallbackへ戻す設定を使用する。token_hash形式のメールテンプレートなら`/auth/callback?token_hash=...&type=email&next=...`を利用可能。招待から新規登録する場合はnextの保持も確認する。メール確認リンクを別ブラウザで開くPKCE制約は実環境で確認する。
9. cookie方式への切替後、既存localStorageセッションだけの利用者は再ログインが必要。Google/メールリンク/確認メールの実送信・実プロバイダ疎通は手動確認項目。
10. ステージングで複数ユーザー/WSによるアクセス拒否、招待/Owner移譲を確認し、Supabase Advisorsも実施してから適用判断する。

既存キー名は維持。新しい外部サービスは不要。GEMINI_API_KEYとGEMINI_RATE_LIMIT_PER_MINは既存名を維持し、AIが使えなくてもWS機能は利用できます。

## テストと検証

Node.js 22.15以降で実行:

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

`npm test`はPGliteの実PostgreSQLでSQL/GRANT/RLS/制約/招待コマンドを実行します。authスキーマとユーザーはテスト専用のものを構築し、Auth HTTPサービスもローカルのfixtureです。実SupabaseのAuth設定やPostgREST全体を検証したものではありません。

HTTPスモークテストの再現方法（ローカル専用、3ターミナル）:

```powershell
# 1: Auth HTTP fixture + 隔離DB
node tests/fixtures/supabase.mjs

# 2: Next。既存環境ファイルを書き換えず、このプロセスだけ上書き
$env:SUPABASE_URL='http://127.0.0.1:4400'
$env:SUPABASE_ANON_KEY='sb_publishable_fixture'
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:4400'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='sb_publishable_fixture'
node node_modules/next/dist/bin/next dev --port 4100

# 3: 実Next API・ページへのHTTP検証
node tests/http-smoke.mjs
```

fixtureとNextは検証後Ctrl+Cで終了します。fixtureのユーザーとワークスペースはメモリ上のみで、終了すると消えます。実サービスでテストユーザーを作成しません。

自動テスト対象は認証成功/失敗、cookie保存・再読込・更新・ログアウト、未認証/匿名/無効token、WS作成・編集、招待先/確認済みメール/期限/取消/再利用/招待者降格、役割管理、最後のOwner、脱退、別WS拒否、RLS/GRANT、下書きの関連情報非公開、旧データ保持です。HTTPスモークではCSRFと実APIの認可も確認します。

今回の結果:

| 検証 | 結果 |
| --- | --- |
| npm test | 17件成功、失敗0（隔離DB・ローカルAuth fixture） |
| HTTP smoke | 成功。実Nextサーバー→API→隔離DBで作成/編集/招待/参加/アクセス拒否を確認 |
| npm run lint | 成功、エラー0・警告0 |
| npm run typecheck | 成功 |
| npm run build | Next.js 16.4.2で成功 |
| git diff --check | 成功 |
| npm audit | 10件残存（High 8 / Moderate 1 / Low 1、Critical 0） |
| npm audit --omit=dev | Moderate 1（baseline-browser-mapping）、High/Critical 0 |

Node.js 22の型除去テスト実行にはExperimentalWarningが出ます。上記lint警告とは別のNode実行時通知です。今回のテストは隔離環境のみで、本番DBのSQL適用や実Authプロバイダの疎通を実施したものではありません。

今回のブラウザ接続ツールには利用可能なブラウザがなかったため、画面の目視・モバイル実機・キーボードフォーカスの実操作は未確認です。公開前にライト/ダーク、狭い画面、モーダルのTab/Escape、Googleログイン/メールリンクを確認してください。

## 変更ファイル（機能別）

| 分類 | 主な変更 |
| --- | --- |
| 認証 | proxy.ts、lib/auth/{policy,server}.ts、lib/supabase/{config,database,server}.ts、lib/supabaseClient.ts、app/components/SupabaseAuth.tsx、app/login/page.tsx、app/auth/callback/route.ts |
| WS | lib/workspaces.ts、app/api/workspaces/route.ts、features/workspaces/components/WorkspaceForms.tsx、app/app/page.tsx、app/app/w/[workspaceId]以下 |
| 共通UI | components/layout/AppShell.tsx、components/ui/controls.tsx、app/app/layout.tsx、app/app/workspace.css、app/layout.tsx、app/error.tsx、app/app/{error,loading,not-found}.tsx、app/invite/page.tsx |
| 旧機能の互換・保護 | app/api/{notes,gemini}/route.ts、lib/notes-store.ts、app/app/{notes,tasks,search,flow}/page.tsx |
| DB | supabase/migrations/20261017072651_phase2_workspaces.sql |
| テスト | tests/{auth,database,policy}.test.mjs、tests/http-smoke.mjs、tests/fixtures/supabase.mjs |
| 設定・資料 | package.json/lock、next.config.mjs、next-env.d.ts（Next生成）、.gitignore、README.md、本資料 |

新規依存は認証cookie共有用の`@supabase/ssr@0.12.7`と開発テスト専用の`@electric-sql/pglite@0.5.10`。SSRのpeer要件に合わせSupabase JSを2.106.1から2.118.0へ更新・固定しました。既存Next.jsを16.2.6から16.4.2に更新し対応ESLint設定も固定しました。理由は[公式のProxy回避アドバイザリ](https://github.com/vercel/next.js/security/advisories/GHSA-6gpp-xcg3-4w24)等。通常の機能改修とは分けて差分を確認できるようpackageファイルと本節に整理しています。NextによるAGENTS.mdの自動追記はagentRules:falseで抑止しています。

依存監査で残った開発ツールのHighとbaseline-browser-mappingのModerateは、別途互換性を検証して更新する課題です。アプリが安全であることを監査件数だけで保証するものではありません。
