# Phase 8 公開前検証・準備報告

この文書はPhase 8時点の記録です。続く本番公開準備で、実PostgreSQL検証・本番バックアップ・Git連携の確認を追加しました。最新の判断と承認対象は[本番公開手順](production-launch.md)を参照してください。

確認期間：2026-10-17〜18（日本時間）。基点コミット：`fca021f`。今回のPhase 8差分は未コミット・未デプロイ。本番SQL適用・設定変更・データ削除は実施していません。

## 1. 公開判定

**本番公開不可（現時点）**。コードのビルド・隔離テスト・Gemini接続は成功しましたが、下記の公開条件が未達です。既存の本番サービスは維持しています。

| 公開条件 | 結果 |
|---|---|
| Production Build / 型 / lint | 成功。Node 22とVercelと同じNode 24.22.0でビルド成功 |
| ユニット・隔離DB / API / ブラウザ | 成功。実環境での認証・RLS検証とは区別 |
| Gemini | 指定モデルの取得と3用途の実生成成功。架空資料のみ |
| 本番DB | Phase 2〜8の7本が未適用。新機能の実テーブル・RPCは未導入 |
| Auth | Site URLがlocalhost、本番の新callbackが未登録 |
| 環境分離 | PreviewとProductionの同じ変数設定を確認。検証DBの分離未確認 |
| バックアップ / 復元 | 利用可能なバックアップの識別・復元リハーサルが未完了 |
| セキュリティ | 隔離検証成功。本番RLS実シナリオ未検証、開発依存の監査指摘あり |

公開条件を満たしてから、DB適用とVercel本番デプロイを**それぞれ個別に承認**してください。今回の検証は適用・公開の承認には代えません。

## 2. 実装状況と今回の修正

既存の実装として、認証（パスワード/登録/Google/メールリンク）、WS作成・切替・招待・4役割、IssuesのCRUD/採番/コメント/履歴/関連、Projectsの進捗/カンバン、Wikiのリッチ編集/階層/画像/履歴、Flow Map検索/段階展開、Handoffの版/送信/受領/再確認、任意のAIチャット/Flow質問/Handoff下書きを確認しました。

これらは「リポジトリに存在し隔離環境で動作確認済み」であり、「現本番DBで稼働済み」ではありません。新規登録からのシナリオは隔離Authと実SQLで検証し、実メール配信・Googleログインは未実施です。招待は管理者がリンクを共有する方式です。

今回の修正：

- 旧ノートが編集後に古い整理対象の文章を保存していた問題を修正。同文の別レコードを画面で消さず、取得/保存/削除失敗と処理中を表示。
- 旧ノート/検索/タスクを簡易ルール・キーワード検索と明記。初期サンプルを保存データと混同しない表示、Landing/metadataを現在のコンセプトに整合。
- 共通JSON入力をストリームの読込中に制限（96KB、24,000文字）。巨大な本文を全量読み込んでから拒否する動作を改善。不正UTF-8/JSON/配列を拒否。
- セキュリティヘッダー（nosniff / frame-ancestors / X-Frame-Options / Referrer-Policy / Permissions-Policy）を追加。`X-Powered-By`を停止。CSPは埋込/ベース/オブジェクトの制限であり、完全なscript-src制限ではありません。
- WS一覧・所属取得をReactの**リクエスト単位**のcacheで重複排除。他ユーザーと共有する永続キャッシュは追加していません。
- 旧notesの不要なTRUNCATE/REFERENCES/TRIGGER権限を除去し、notes_backupへのアプリ用ロールのアクセスを閉じる追加SQLを作成。
- 既存間接依存を互換範囲内でセキュリティ更新。直接依存の追加・Next.jsの強制変更なし。
- `.env.*`と`.vercel/`をGit対象外に補強。`.env.local`は変更していません。

未使用の旧`lib/useGemini.ts`、`lib/rateLimiter.ts`は参照がないことを確認。現AIは前者の汎用prompt形式や後者のメモリ内回数制限を使用せず、DBの予約処理を使用します。既存APIに汎用promptの互換経路は追加していません。不要ファイルの大規模削除は避けました。アプリ本体にデバッグconsoleや本番データに見せるモックは見つかっていません。

## 3. 変更ファイル

| 分類 | ファイル |
|---|---|
| UI・説明 | `app/components/LandingStory.tsx`, `NotesWorkspace.tsx`, `SearchWorkspace.tsx`, `TasksWorkspace.tsx`, `app/layout.tsx`, `app/page.tsx` |
| 共通入力・取得 | `lib/auth/body.ts`（追加）, `lib/auth/server.ts`, `lib/workspaces.ts` |
| 設定・依存 | `.gitignore`, `next.config.mjs`, `package-lock.json` |
| DB追加 | `supabase/migrations/20261017134159_phase8_release_hardening.sql` |
| テスト | `tests/body.test.mjs`, `release.test.mjs`, `signup.test.mjs`, `release-http.mjs`, `browser-e2e.mjs`（追加）, `tests/fixtures/supabase.mjs` |
| 読取監査・接続 | `scripts/release-audit.mjs`, `scripts/gemini-release-check.mjs`（追加） |
| 文書 | `README.md`, `docs/phase8.md` |

lockfileはbaseline-browser-mapping 2.10.32→2.11.29、@babel/core 7.29.0→7.29.7と関連Babel群、browserslist 4.28.2→4.29.3と関連データ、brace-expansion 1.1.14→1.1.21 / 5.0.6→5.0.12、js-yaml 4.1.1→4.3.2を固定しています。25の既存間接依存が更新され、新しい直接依存はありません。

## 4. テスト結果

| チェック | 結果と範囲 |
|---|---|
| `npm run lint` | 成功 |
| `npm run typecheck` | 成功 |
| `npm test` | **95/95成功**。認証/招待/全役割/RLS/越境/CRUD/フィルター/関連/版/添付/AI/SQL再適用・rollback等。今回4件追加 |
| `npm run build` | 成功（Node22）。更新後のNode24.22.0で同じNext Production Buildも成功 |
| `node tests/http-smoke.mjs` | 成功。実Nextルート+Supabase SDK+隔離DB。課題→Wiki→Flow、Handoff送信→指定Viewer受領→改訂→再受領→完了と不変の旧版、XSS/添付/越境 |
| `node tests/ai-http.mjs` | 成功。3用途、根拠、AI無効/同意/回数/二重送信/429/5xx/不正出力/生成中の権限・資料変化を確認 |
| `node tests/release-http.mjs` | 成功。ヘッダー、CSRF拒否、認証済みの巨大入力413、不正JSON400 |
| Chrome E2E | 成功。ログイン/ログアウト、WS作成、Home/Issues/Projects/Wiki/Flow/Handoff/Settings、ライト・ダーク、1440px/390px、スマホの全7画面の横溢れ、検索、AI3操作、確認して下書きを反映・保存。旧ノートは専用のメモリ内応答fixtureで現在の入力を保存すること、同文2件の保持、失敗表示も検証。未処理pageerrorなし |
| 通常操作でのAI | E2E中のページ遷移・検索で生成POSTは0回、チャット/Flow/Handoffの明示操作で合計3回 |
| 実Gemini | models.get HTTP200。chat/flow/handoff各1回、スキーマ/根拠ID検証成功。外部AIに実業務データを送信していません |
| `npm audit --omit=dev` | **0件**（修正前はmoderate 1件） |
| `npm audit`全体 | **high 5件残存**。braces→micromatch→fast-glob→@next/eslint-plugin-next→eslint-config-nextの開発ツール経路。強制ダウングレードは未実施 |

HTTP3種類はNode24のローカル本番ビルドでも成功。Chromeは一時取得のPlaywright 1.64.1と既存Chromeを使用し、package.json/lockfileにPlaywrightは追加していません。画像は`test-results/`（Git対象外）に保存。テストDB/Google応答fixtureを本番データと混同しないでください。

未実施：実Supabaseでの複数接続ロック競合・負荷試験、実メール/OAuth、隔離されたVercel Preview、実バックアップの復元、実データの回答品質、全操作の支援技術/IME/実機タッチ検証。Dockerデーモンは利用不能でした。PGliteは単一接続のため同時予約のテスト成功だけで実PostgreSQLの並列負荷を保証しません。

### 再現時の注意

HTTP/E2Eの準備は[Phase 7の隔離環境手順](phase7.md)と同じです。**AI HTTPとブラウザE2Eは、それぞれ新しく空のfixtureから実行**してください。AI HTTPは意図的に429クールダウンと個人設定を残します。共有した場合に初期状態/回数のテストが失敗することを確認し、空のfixtureで再実行して成功しました。

本番ビルドをローカルでテストする場合、ビルド時の`NEXT_PUBLIC_SUPABASE_*`もfixtureに設定します。起動時だけ切り替えてもブラウザ用URLは置き換わりません。`.env.local`には書き込まず、専用プロセスの環境変数だけを使います。

```powershell
# localhostのfixture/Nextが起動済みであることを確認してから実行
node tests/http-smoke.mjs
node tests/release-http.mjs
# AIテストごとにfixtureを新しく起動する
node tests/ai-http.mjs
npx --yes --package=playwright -c "node tests/browser-e2e.mjs"
```

`scripts/gemini-release-check.mjs`は通常テストから実行しません。無料枠・課金未設定と利用者が確認した場合に限り`--free-tier-confirmed`で実行する明示的な外部接続です。3回の最小限の生成、タイムアウト、エラー時中断、再試行なし。キー/本文/回答を出力しません。今回の成功後に再実行は不要です。

## 5. セキュリティ・性能

- API RouteはSupabase `getUser`、WS所属、操作権限を検証。通常操作にService Roleを使用せず、設定時もsecret/service_roleキーを拒否します。
- SQLでWS境界、関連先、担当者、受領者、版を検証。直接ID偽装、Viewer編集、別WS/脱退/匿名/Service RoleのRPC操作拒否は隔離テスト済み。
- Wikiは検証した構造化文書をReactで描画。任意HTMLを挿入せず、危険リンク・画像形式を拒否。非公開Storage、サイズ/MIME/内容検証とRLSを使用。現本番にはバケット未作成です。
- AIは引用を信頼しないsystem instruction、資料/質問の秘密値除外、RLS検索、根拠ID/課題番号の再検証、サーバー側リンク生成、生成後の所属/公開状態/版の再確認。対策は漏えい防止の完全保証ではなく、送信前同意と管理者の情報管理判断が必要です。
- AI監査はユーザー/WS/モデル/用途/日時/成否/トークン数のみ。本文/質問/出力/キーの永続ログ・共有回答キャッシュなし。
- AIは既定でユーザー10回/日（全WS合算）、WS50回/日。UTC日境界。Owner/Adminが上限を変更可能。DB予約はユーザーのadvisory lockとWS行ロック、重複ID/処理中拒否、429後cooldown。全体のGoogleプロジェクト上限とは別です。
- 上限：質問1,200文字、資料8件、本文各1,200文字、文脈12,000文字、出力chat1,536 / flow2,560 / handoff4,096トークン、25秒タイムアウト。自動再試行なし。
- Flowは初期10検索結果＋制限された直接関連、関連20件ずつ、UI最大120ノード/240辺。無制限の全件取得や外部グラフDBなし。Wiki/課題/Handoffはページ取得、RAGは少数の抜粋。既存のpg_trgm部分一致インデックスを使用。
- WSの同一リクエスト内の重複認証/一覧取得を削減。実データ大量件数のEXPLAIN/負荷・Core Web Vitalsは未検証であり、高速性の保証はしません。
- Git追跡中のenvファイルなし。秘密形式の検査で検出した`tests/ai.test.mjs`は除外処理検証用の偽の値です。実キーやトークンを報告/成果物に転記していません。
- ビルド後のブラウザ用静的ファイル32件を実キーとメモリ内照合し、Geminiキーの混入なしを確認しました。
- [baseline-browser-mappingの既知問題](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv)は更新で修正。残る開発依存の[braces問題](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)は、修正版とNext ESLint側の対応を再確認して解消するまで、未信頼リポジトリ/パターンをCIで処理しない運用が必要です。アプリ実行時の到達経路は確認されていません。

## 6. 本番Supabaseの読み取り結果

対象は既存`IntelliFlow`、ref `pocjzzekfupjqcwdfkan`、ACTIVE_HEALTHY、Seoul、Postgres17.6.1.166、Free。ローカルURLのプロジェクトrefと一致を確認しました。内容本文・ユーザーのメールは取得していません。

| 項目 | 現在の状態 |
|---|---|
| publicテーブル | `notes`, `notes_backup`のみ |
| 件数 | notes 1、notes_backup 0、Authユーザー5（確認済み1）、Storageオブジェクト0 |
| 既存所有者 | notesにowner未設定・不明ユーザー参照なし。書換えなし |
| RLS | 両表有効。notesは旧owner用4ポリシー、backupはポリシーなしでデフォルト拒否 |
| 権限 | 旧表にanon/authenticatedの広いALL GRANTが残る。Phase8で不要権限を縮小予定 |
| インデックス | notes PK、owner btree、simple全文GIN。未使用情報だけで削除しない |
| FK / RPC / バケット | 新機能のものは未作成 |
| 適用履歴 | 空。旧表は履歴管理外の既存構造として存在 |
| Advisor | backup RLSポリシーなしINFO、漏えいパスワード保護無効WARN。notesの旧auth initplan警告はPhase2のポリシーで改善予定 |

漏えいパスワード保護は有料プラン条件も確認し、勝手にアップグレードしません。バックアップ表は通常APIから公開する必要がありません。

### 未適用マイグレーション（適用順）

1. `20261017072651_phase2_workspaces.sql`
2. `20261017080005_phase3_issues_projects.sql`
3. `20261017083402_phase4_wiki.sql`
4. `20261017105423_phase5_flow_map.sql`
5. `20261017113749_phase6_handoff.sql`
6. `20261017124130_phase7_ai_assistant.sql`
7. `20261017134159_phase8_release_hardening.sql`

接続先refを確認後、次の**読み取りdry-runのみ**を成功させ、7本/seedなし/rolesなしを確認しました。

```powershell
npx supabase db push --dry-run --skip-vault --project-ref pocjzzekfupjqcwdfkan
```

CLI 2.121.0の`--skip-vault`を指定してVaultへの暗黙更新も回避しています。このコマンドのdry-runを外して自動実行しないでください。

テーブル/データのDROP/TRUNCATEや移行時の一括削除はありません。Phase2は既存notesのポリシーを置換し、Phase4は初期Wikiポリシーを置換します。RPC内のDELETEは利用者による関連/ラベル変更時の処理で、マイグレーション適用時には実行されません。Phase8は旧表のGRANT変更だけですが、旧APIのアクセス経路に影響するため検証・承認が必要です。旧表形状/広いGRANT/所有者不明を含む架空データで、全7本適用後の全行/所有者保持を確認しました。

### Authの必要な手動設定（今回は変更なし）

- 現在のSite URLは`http://localhost:3000/`。本番では`https://intelli-flow-pi.vercel.app`にする必要があります。
- 許可済みはlocalhost:3000/app、localhost:3001/app、本番の`/`と`/app`。新実装の`/auth/callback`がありません。
- 本番の`https://intelli-flow-pi.vercel.app/auth/callback`と、その`?next=...`を含む認証遷移が許可されるよう、[公式Redirect URLs仕様](https://supabase.com/docs/guides/auth/redirect-urls)に従って最小範囲の許可を設定し、登録確認/メールリンク/Googleを実ブラウザで検証します。パス限定のワイルドカードが必要な場合も本番ホスト全体の`/**`へ拡大しないでください。
- メール/Google有効、登録許可、メール確認必須は確認済み。Google側Authorized redirect URI（既存Supabaseの`/auth/v1/callback`）とメールテンプレート/配信成功は未確認。
- ログイン後は安全な内部next（既定`/app`）、ログアウト後は`/login`。外部next拒否はテスト済み。既存`/app`の許可を消さず、新callbackを追加して互換性を確認します。

## 7. Vercelと環境変数

既存プロジェクト：`shunnsuke-clouds-projects/intelli-flow`、ID `prj_dTnr56e8RZEYW3wGz8rAJ1KNLA5Z`。
本番URL：<https://intelli-flow-pi.vercel.app>。
読み取りでREADYを確認した既存Production：`dpl_BLxqwpy2oona4T86E4i5rc8pih12`（[管理画面](https://vercel.com/shunnsuke-clouds-projects/intelli-flow/BLxqwpy2oona4T86E4i5rc8pih12)）。ローカルに`.vercel/project.json`なし。紐付け・再デプロイはしていません。

Framework Next.js、Rootはリポジトリルート、Build/OutputはFramework既定、Node24.x。既存本番GETは`/`200、`/login`200、未認証`/app`307でした。これは新機能の稼働確認ではありません。

| 実コードで参照する変数 | 用途・本番設定状況 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ブラウザ用URL。Production/Preview登録あり。暗号化値のため実接続先は未確認 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公開可能なpublishable/anonのみ。両環境登録あり。secret/service_role不可 |
| `GEMINI_API_KEY` | サーバー専用。両環境登録あり。実値は非表示・本番での接続未検証 |
| `GEMINI_MODEL` | サーバー用。**Vercel未登録**。現コードは一元管理の指定モデルへ既定fallback。公開時は`gemini-3.8-flash`を明示設定することを推奨 |
| `SUPABASE_URL` | 任意のサーバー側優先URL。未登録ならNEXT_PUBLICへfallback。同じDBを指定する |
| `SUPABASE_ANON_KEY` | 任意のサーバー側優先anon。未登録ならNEXT_PUBLICへfallback。ローカルはlegacy anonとpublishableの違いがあり、両方Auth設定取得200を確認 |
| `SUPABASE_NOTES_TABLE` | 旧ノートの任意テーブル名。未登録なら`notes` |
| `GEMINI_RATE_LIMIT_PER_MIN` | 未使用`lib/rateLimiter.ts`内だけの旧設定。現AIの日次制限には効かず、登録不要 |

Vercelには上3変数だけがあり、**同じ設定エントリがProductionとPreviewを対象**にしています。値の読み取り出力はせず、暗号化されているためDB分離を証明できません。検証用Supabaseが特定できるまでPreviewにデプロイしないでください。

設定時は既存ProjectのSettings→Environment Variablesで環境を選び、管理者が接続先refとキー種別を値を公開せず照合します。Previewには独立した検証DB/キーを指定し、本番用設定の対象を分離します。今回のコード/マイグレーションをPreviewへ外部公開する場合も別途事前承認が必要です。Production変数やAuth URLの変更も本番影響操作として承認前に行いません。

## 8. Gemini確認結果

指定モデルを変更していません。`gemini-3.8-flash`は[公式モデル仕様](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)で有効なID、構造化出力とlow/medium/highに対応。minimalは不使用。[公式料金](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash)にStandardの無料入力/出力枠を確認しました。プロジェクト固有のRPM/TPM/RPDはAI Studioでの確認が別途必要です。

利用者から「無料枠・課金未設定」と確認済みのローカルキーで、models.get 200 / generateContent対応を確認し、現サーバーREST実装で下記だけを実行しました。

| 用途 | 思考 | 入力 / 出力 / 思考トークン | 検証 |
|---|---|---|---|
| chat | LOW | 364 / 102 / 未提供 | JSONと根拠ID成功 |
| flow | MEDIUM | 364 / 106 / 222 | JSONと根拠ID成功 |
| handoff | MEDIUM | 365 / 291 / 478 | 6本文項目・確認事項のスキーマと根拠ID成功 |

本番キーや業務資料での生成は未実施。無料枠では送信内容が製品改善に使われる条件があり、企業の機密情報/個人情報を無条件で送信できません。AIはWS/本人とも初期無効、管理者の有効化と利用者の同意を維持します。AIが停止しても通常操作は独立しています。

## 9. 公開前に必要な操作と依存関係

1. 今回の差分をレビューしてGitの対象コミットSHAと7本のSQLを固定。実行時に対象プロジェクト/ref・件数・履歴を再確認する。
2. 独立した検証用SupabaseとPreview設定の分離を確保する。新サービス/有料契約は勝手に作らない。承認された検証環境で7本を順番に適用し、実Auth/Storage/RLS/並列競合を検証する。
3. 認証URL/Google callback/メールの必要設定をレビューし、**設定変更の承認後に**反映・実確認。Vercel Production/Preview変数の接続先を照合、GEMINI_MODELを明示する。
4. 残存の開発依存脆弱性を解消または到達範囲と運用制限をレビュー。未確認の実シナリオ/負荷/アクセシビリティを検証する。
5. 本番バックアップを取得・安全な保存先に保管し、**別環境で復元して**所有者/件数/権限/ログイン/添付を照合する。個人情報を含むためGitや公開成果物に入れない。
6. 全ゲートが通ったら本番DB変更を個別承認。上の7本・接続ref・バックアップ日時/復元検証・旧ノートへの影響を提示して承認を得る。適用途中で失敗したら中断して履歴を確認し、先へ進めない。
7. DB後の読み取り/認証/RLSチェック成功後、**固定した対象SHAを既存Vercelへ公開する別の承認**を得る。既存URLを維持し、AI初期無効のままヘルス/ログ/主要機能を確認する。

バックアップ取得・本番設定反映・DB適用・Preview/Productionデプロイはこの順序の計画であり、今回未実行です。現状では公開承認を求める段階には到達していません。

## 10. バックアップと復旧

本番のバックアップ一覧は`backups:null`、PITR false、walg_enabled trueでした。復元に使えるバックアップの識別子・日時は取得できておらず、**復元可能と判断していません**。空のnotes_backupをバックアップの証拠にはしません。

[公式バックアップ仕様](https://supabase.com/docs/guides/platform/backups)に従い、Freeでは定期的な論理エクスポートと外部の保護された保管先を用意します。スキーマ・データ・必要ロール・マイグレーション履歴・Authユーザーを含む復元範囲を確認し、DBだけでは戻らないStorageの実ファイルとAuth/Provider/URL設定も別に保護します。CLI既定dumpがauth/storageを除外する場合があるため、既定コマンド1本の成功を完全バックアップとは扱いません。サービス側管理スキーマの復元は公式手順と対象環境の互換性を確認してください。

復旧手順：

1. 更新を止めて対象リリース/SQL履歴/エラー時刻を保存。キー・本文・個人情報をログに出さない。
2. アプリだけの障害なら、承認した既存の正常Vercelデプロイへ戻す。候補は上の現Production。新テーブルをDROPせず、必要な追加修正SQLは別途レビューする。
3. AIだけの問題ならWSのAIを管理者が無効にし、通常機能を維持。キー削除/モデルの無断変更はしない。
4. DB障害は自動でdb resetや逆向きDROPをしない。失敗マイグレーションはトランザクションと適用履歴を照合し、成功済みの前段を再適用しない。必要に応じて追加の修正マイグレーションを作る。
5. データ復元が必要なら、バックアップを隔離先へ復元→所有者/件数/履歴/権限/Storage/Authを照合→復元後に失われる更新を特定→影響と停止時間を提示し**本番復元の別承認**を得る。切替後にも確認する。

今回、実バックアップの取得/復元、本番の切戻し操作は実施していません。
