# 既存リポジトリ調査

調査日: 2026-10-17（日本時間）
対象: https://github.com/Shunnsuke-cloud/IntelliFlow
ローカルHEAD: `23b318c`（UIアニメーションを追加）。originは上記リポジトリ。開始時の作業ツリーはクリーン。

本資料はローカルチェックアウトの静的調査を主な根拠とする。GitHub公開ページの構成も照合したが、fetchしていないためリモート最新HEADとの一致は保証しない。本番DB、適用済みSQL、Supabase設定、Vercel設定、APIキーの有効性、本番の再現性は未確認。環境ファイルの値や既存ノート本文を調査資料へ転記していない。外部APIへの実データ送信・DB操作・管理スクリプト実行は行っていない。

## 1. ディレクトリと技術構成

```text
app/
  page.tsx, layout.tsx, globals.css, landing.css
  app/{page.tsx,layout.tsx,notes/,tasks/,flow/,search/}
  api/{notes/route.ts,gemini/route.ts}
  components/
    AppHeader, AppWorkspace, SupabaseAuth
    NotesWorkspace, TasksWorkspace, SearchWorkspace
    GeminiAction, IntelliFlowInputDemo, LandingStory
lib/
  supabaseClient.ts, notes-store.ts
  gemini.ts, useGemini.ts, rateLimiter.ts, note-analysis.ts
supabase-migrations/{001_create_notes_and_policies.sql,002_add_owner_and_strict_rls.sql}
scripts/    # 認証・RLS調査、サンプル挿入、所有者バックフィル
data/notes.json
```

- Next.js App Router + React + TypeScript。lockfileの解決版はNext 16.2.6、React 19.2.6、Supabase JS 2.106.1、TypeScript 6.0.3。package.jsonには複数の`latest`指定がある。
- CSSは独自CSS、アニメーションはmotion。READMEにあるTailwind・Firebase・Firestoreの実装依存は確認できない。
- Vercelへの手順はREADMEにあるが、接続済みプロジェクト・実環境は未確認。
- npm scriptsはdev/build/start/lint。自動テスト・CI定義は追跡ファイル一覧では確認できない。

## 2. 実装済み機能と実際の動作

| 画面・機能 | 確認した実装 | 制約 |
| --- | --- | --- |
| `/` | motionを使うLP、ログイン | 旧AI中心コンセプト |
| 認証 | メール/パスワード登録・ログイン、Magic Link、Google OAuth、ログアウト | サーバーのアプリ全体保護はない。プロバイダ設定の実態は未確認 |
| `/app` | 4機能へのリンク | 集計データはない |
| `/app/notes` | ノート作成・更新・削除・一覧 | 保存対象は原文。解析結果を独立保存していない |
| ノート整理 | `analyzeNote`による文字切り詰め・句点分割・語句抽出 | Geminiではない。担当者や確定期限の抽出なし |
| `/app/tasks` | ノートから毎回簡易抽出した一覧、Gemini提案UI | タスクの独立ID、状態・担当・期限更新・永続化なし |
| `/app/flow` | 入力→AI整理→実行の固定3カード | データの関連・検索・履歴グラフはない |
| `/app/search` | ノート全件取得後にブラウザで部分一致 | AI検索・意味検索ではない。ページングなし |
| `/api/notes?q=` | Supabaseの`ilike`検索 | ローカルJSON経路ではqueryが反映されない |
| `/api/gemini` | サーバープロキシとメモリ上のレート制限 | 認証必須ではない。古いAPI形式 |
| Projects / Wiki / Handoff / WS | 専用実装なし | 新設が必要 |

`IntelliFlowInputDemo.tsx`はノートCRUD・検索・遅延削除を持つ旧デモ。現行ページからの参照は確認できず、削除・再利用前に参照を再確認する。`LandingStory.tsx`のデモはLP演出で、実データの機能とは区別する。

## 3. 再利用方針

| 対象 | 再利用できる要素 | 改修・扱い |
| --- | --- | --- |
| AppHeader / AppWorkspace | ナビゲーション、カード、画面枠 | WS切替と新6機能の導線へ |
| NotesWorkspace | 入力・一覧・編集UI | Wikiの下書き/旧ノート閲覧に活用。保存対象の混乱と無言の失敗を改善 |
| SearchWorkspace | 入力、空状態、結果カード | サーバー検索・ページング・種類フィルタへ |
| TasksWorkspace | 一覧カード | Issues一覧へ。抽出結果は作成候補として扱う |
| SupabaseAuth | サインイン方式とフォーム | セッション検証、callback、エラー処理、ラベルを改善 |
| GeminiAction / useGemini | 生成中・結果表示、サーバー呼出し境界 | 用途別の操作にし、型検証・引用・採用確認を追加 |
| note-analysis | AIなしで動く簡易処理 | 決定事項と断言せず参考情報へ。業務データ生成はユーザー確認必須 |
| globals.css / LandingStory | 基本スタイル、レスポンシブ、reduced motion対応 | 色・余白・ボタンを共通化。LPの文言と例を新コンセプトへ |
| notes-store | 旧ノート互換形式・接続分岐の把握 | 特権フォールバックを含むためアクセス層をそのまま流用しない |

## 4. 認証・データアクセスの経路

ブラウザの`lib/supabaseClient.ts`はPKCE、セッション永続化・更新・URL検出を設定。公開環境変数→サーバー用環境変数→コード内の接続先/公開キーの順で選ぶ。設定エラー時にスタブへ切り替わる。

通常ノートUIはAuthorizationヘッダーを送っていない。`GET /api/notes`は認証ヘッダー自体を扱わず、サービスロール設定があれば全件取得。POST/PUTはBearerがある場合だけ`getUser()`を試すが、失敗を401で止めない。DELETEはBearerがないとサービスロール経路へ。`notes-store.ts`はサービスロール未設定時に共有`data/notes.json`へ保存する。読み書きで分岐条件も異なり、読み込みがユーザー接続でも保存がJSONへ向かうケースがある。

`createSupabaseClientWithToken`はアクセストークンを`createClient(url, token)`の第2引数に使用している。公開APIキーとAuthorizationのユーザーJWTを分ける形へ改修し、実際のSDK/環境で認証を検証する。ブラウザでのgetSessionはUI用途、サーバーは検証済みユーザーを使う。現行にはSSR用cookieクライアント・専用auth callback・保護処理が見当たらない。

## 5. 既存マイグレーション

| ファイル | 定義 | 注意 |
| --- | --- | --- |
| 001 | notes(id text PK, input text NOT NULL, saved_at timestamptz)、RLS、authenticated SELECT/INSERT、simple辞書のFTS索引 | 認証済みなら他人のノートも読めるデモポリシー。APIのilikeはこのFTS索引を直接利用しない |
| 002 | nullable owner text追加、owner索引、デモポリシー削除、所有者別CRUDポリシー | `auth.uid()`はuuid、ownerはtextで、`auth.uid() = owner`は型不整合。新規環境での適用に失敗する可能性が高い。適用済みと仮定しない |

両ファイルともCREATE POLICYが再実行可能な形ではない。002はownerのNOT NULL化や既存行への割当を実施しない。過去SQLを本番へ再実行するのでなく、実スキーマと適用履歴を確認し、検証した補正マイグレーションを追加する。

`backfill_owner.js`はdry-run/yesを持つが、count値ではなく返された配列長を件数にするため取得上限の影響を受ける。更新後の件数表示もselectがなく不正確。任意の`sql` RPCを前提とするNOT NULL化も未保証。READMEの`public.notes_backup`コピーはRLSを複製しないので、そのまま公開スキーマに作るバックアップ方式は採用しない。

## 6. Gemini呼出し

```text
GeminiAction → useGemini（sessionからBearer付与）
  → POST /api/gemini（prompt、レート制限）
  → lib/gemini.ts → Google Generative Language API
```

キーはサーバーの`GEMINI_API_KEY`。既存実装は`v1/models/text-bison-001:generateText`、`prompt.text`、`candidates[0].output`という旧形式。現在のGemini API形式への移行が必要で、モデル名は実装時の公式仕様・利用可能モデルを確認して決定する。キーは維持する。未設定時は入力を含むモックを返す。候補なし時に生JSONを返すため、クライアントの`{text:string}`契約とも一致しない。タイムアウト・出力検証・引用元・再試行方針がない。

## 7. セキュリティ上の問題（静的調査）

優先度は今後の修正順。実サービスでの攻撃検証・本番アクセスは行っていない。

| 優先 | 問題・根拠 | 推奨対策 |
| --- | --- | --- |
| P0 | notes GETと未認証CRUDがサービスロールへ到達しRLSを迂回（app/api/notes、notes-store） | 全操作で認証必須・通常処理はユーザーJWT・所属チェック。無効認証で終了 |
| P0 | 001の広範ポリシー、002のuuid/text比較、本番適用未確認 | ステージングで実定義確認・補正・越境テスト。サービスロール利用停止とセットで進める |
| P1 | JSON保存は利用者を分離せず、同時更新で上書き、Vercelの永続保存として成立しない | 本番は設定不足時に明示エラー。デモは独立したサンプルデータのみ |
| P1 | 公開Geminiプロキシ、任意Bearer先頭32文字による制限キー、任意IP、メモリ制限、fail open | 認証済みuser/WS単位で制限。Supabaseの原子的カウンタで複数インスタンス対応。利用量上限 |
| P1 | body/文字数上限なし、POST/PUTのupsertで作成と更新が混在 | サイズ制限、型検証、ID指定更新を分離、存在/権限/競合エラーを処理 |
| P1 | Gemini外部エラーをそのまま返す、認証スクリプトがtoken/ユーザー情報をログ出力 | 固定エラーコードと秘密を除いたログ。既存スクリプトは隔離・マスク |
| P2 | コード内の公開接続設定とスタブが設定ミスを隠す | 値を転載せず、環境設定必須・状態を明示。公開キー自体と特権秘密を区別 |
| P2 | DELETEがDB errorを無視して成功応答。UIが多くの失敗を無視 | 成功確認、エラー表示、0件更新の検知 |
| P2 | AuthのOTP/OAuth結果error未確認、登録userをsession成立と同一扱い | エラー・メール確認待ち・セッション成立を分離 |
| P2 | latest依存、テスト基盤未整備 | 固定版・lockfile同期・脆弱性確認を別工程で実施 |

`.env.local`は存在するが値は開いていない。`git ls-files '.env*'`には該当なし。秘密キーが漏れていないことやgit全履歴の安全性を保証する調査ではない。キーの変更はしていない。

## 8. 縮小・廃止候補と追加機能

廃止候補はAI前提の基本ナビ、固定Flow説明、汎用プロンプト中心UI、本番JSONフォールバック、重複解析デモ、通常処理のサービスロール。データやファイルは今回は削除しない。旧ノートとURLを残したうえで代替を用意し、参照・利用状況を確認して段階的に廃止する。

新規に必要なのはWS・メンバー/招待/役割、永続Issues、Projects、Wikiと版管理、横断検索、明示的な情報リンク、動的Flow Map、版付きHandoff・チェックリスト・受領、監査ログ、AIの用途別提案と出典表示。通知はまずアプリ内の引き継ぎ一覧で成立させ、外部通知・添付ファイル・音声・ベクトル検索は初期必須にしない。

## 9. 公式資料と未確認事項

- [対象リポジトリ](https://github.com/Shunnsuke-cloud/IntelliFlow): 公開構成を確認。
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): RLSとサービスロールの挙動確認。
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs): ブラウザ/サーバークライアント分離の参照。
- [Supabase changelog](https://supabase.com/changelog): 確認。markdown入口は取得失敗のためHTMLを参照。実装時は関連変更を再確認する。
- [Gemini text generation](https://ai.google.dev/gemini-api/docs/text-generation): 現行呼出し仕様の参照。旧形式の実疎通は未実施。

次の実装前に、本番スキーマ/RLS/GRANTとmigration履歴、ownerなし件数と所有者、OAuth callback、Supabaseバックアップ方式、Vercel環境設定、利用可能なGeminiモデルを確認する。今回アプリのlint/build・API疎通・SQL実行はしていない（文書のみの変更）。
