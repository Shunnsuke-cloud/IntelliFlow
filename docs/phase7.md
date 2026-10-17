# Phase 7 — Gemini AI支援

2026-10-17。ローカル実装と隔離DBで検証。本番Supabaseへの適用・Vercelへのデプロイは行っていません。

## 実装した機能

- ワークスペース内のHome / Issues / Projects / Wiki / Flow Map / Handoff / Settingsに右下のAI起動ボタンを追加。チャットの開閉、会話表示、Enter送信・Shift+Enter改行、IME入力、送信中表示、エラー、会話消去に対応。
- 会話はパネル内のメモリに最大6往復保持。閉じる・ページを変える・WSを変えると消え、DB・localStorageには保存しない。各質問は独立して検索する。表示中の資料を優先するか、ワークスペース全体から検索するかを選べる。
- Flow Mapに明示的な「AIに質問」。種類・Project・更新日を引き継いで検索し、回答の根拠をマップに取り込み・強調できる。線は既存の関連付けだけを取得し、AIの推測で保存しない。
- Handoffで資料を最大8件選び、AI下書きの6項目・要確認事項・根拠リンクをプレビュー。確認チェック後に本文を置き換え、根拠資料をIDで追加。保存・送信・受領・完了は既存の人による操作のまま。担当者や期限はAIで変更しない。
- ワークスペースのAI設定とユーザー自身のAI設定。いずれも初期無効。Owner/AdminのみWSの有効化・上限変更が可能。個人の有効/無効は本人だけが変更でき、生成時にも外部送信への同意が必要。
- 新規依存・外部サービス・ベクトルDBは追加していない。旧ワークスペース未指定の汎用生成APIは閉じ、旧ノート側のAIボタンはワークスペース利用へ案内する。

## Gemini接続・仕様

モデルの既定値は `features/ai/config.ts` の1箇所。既存の `GEMINI_API_KEY` / `GEMINI_MODEL` を使用し、環境ファイルは変更していない。モデル値が想定と異なる場合やキーが未設定の場合はAIだけを停止し、ダミー応答にしない。

Google公式 `v1beta/models/{model}:generateContent` をサーバーのfetchで使用。キーは `x-goog-api-key` ヘッダーにのみ付与し、URL・ブラウザ・ログへ出さない。公式SDKは `@google/genai` 2.30.0を確認したが、既存のREST構成で現行仕様を利用できるため追加しなかった。`responseFormat.text` のJSON Schemaと `thinkingConfig.thinkingLevel` を使用する。

| 用途 | モデル | 思考レベル | 最大出力トークン |
| --- | --- | --- | --- |
| 通常チャット・要約 | gemini-3.8-flash | LOW | 1,536 |
| Flow MapのAI質問 | 同上 | MEDIUM | 2,560 |
| Handoff下書き | 同上 | MEDIUM | 4,096 |

接続確認：公式のモデル情報取得はHTTP 200、`generateContent` 対応を確認。利用者から「無料枠・課金未設定」の回答を得た後、実データを含めない生成を**1回だけ**実行し、LOWとJSON応答が成功した。使用量は入力266、出力35、思考50トークン。応答本文とキーは出力していない。MEDIUM・各業務機能の統合はテスト用のGoogle応答で検証し、実データをGoogleへ送っていない。

公式仕様・料金・規約（確認日2026-10-17）：

- [モデル仕様](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)：LOW/MEDIUM/HIGH、構造化出力に対応。MINIMALは利用しない。
- [generateContent API](https://ai.google.dev/api/generate-content)、[公式ライブラリ](https://ai.google.dev/gemini-api/docs/libraries)。
- [料金](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash)：Standardの無料枠では入力・出力無料。
- [利用制限](https://ai.google.dev/gemini-api/docs/rate-limits)：RPM/TPM/RPDはGoogleプロジェクト単位。利用プロジェクト固有の実際の上限はAI Studioで確認する。アプリの日次上限とは別。
- [無料サービスの規約](https://ai.google.dev/gemini-api/terms#unpaid-services)：送信内容の製品改善利用と、機密情報・個人情報の送信制限に注意。社内資料を扱う場合は運用方針の確認を先に行う。

## DB・利用回数

追加マイグレーション：`supabase/migrations/20261017124130_phase7_ai_assistant.sql`。CLIで作成。既存マイグレーション・既存データは変更しない。

| 新規テーブル | 用途 |
| --- | --- |
| workspace_ai_settings | WSの有効/無効、回数上限、設定版、更新者 |
| ai_user_preferences | 本人の有効/無効、設定版 |
| ai_user_daily_usage | ユーザーの日次使用数（全WS合算） |
| ai_workspace_daily_usage | WSの日次使用数 |
| ai_runs | リクエストID、利用者、WS、モデル、機能、日時、状態、エラー種別、トークン数のみ |

全表にRLSを有効化し、直接書込みを許可しない。管理・予約・完了記録は認証と所属を検証するRPCを経由する。検索はsecurity invokerで既存RLSに従う。Service Roleには新規表・RPCへの権限を付与せず、通常APIも本人のトークンでアクセスする。

実行ログのIDはサーバーが生成し、利用者の二重送信防止IDとは分離する。実行ログ表はブラウザから読み取れず、サーバーの実行IDも応答へ返さないため、利用者が進行中の実API呼出しを直接完了扱いに変更できない。ログ参照はDB管理者の作業とし、ユーザーUIへは残り回数だけを返す。

初期上限：**ユーザー1日10回 / WS1日50回**。Owner/AdminがSettingsでユーザー上限1〜100、WS上限1〜500に変更可能。ユーザーの使用数は全WS合算し、そのWSに設定されたユーザー上限と比較する。**UTC 0時（日本時間9時）リセット**。上限を下げても既に消費した回数は戻らない。

予約時にユーザー単位のトランザクションadvisory lock→WS行ロックの順で確保し、両カウンターと監査行を同一トランザクションで追加する。同一リクエストIDの再利用、同一利用者の処理中要求、上限超過は拒否。失敗・タイムアウトも予約1回分として残す。資料が見つからずGeminiを呼ばない場合は消費しない。処理中判定は60秒、Google 429後は同じ利用者を60秒待機させる。自動再試行・自動返金は行わない。プロセス強制終了時はreserved行が残るため、運用時はこれも未完了の試行として確認する。

入力1,200文字、HTTP本文12,000バイト、外部呼出し25秒。API全体の実行時間設定は40秒。プロンプト本文、資料本文、質問、生成本文、キー、認証トークンを監査表に保存しない。権限変更による漏えいを避けるため回答キャッシュは実装しない。

## RAG・権限・出力検証

1. 本人確認、WS所属・役割、WS/本人のAI設定、送信同意を検証。
2. 日本語の簡単な定型句を除き、最大3検索語を決定的に抽出。既存 `flow_query` の部分一致検索（空白AND・単語への緩和）を最大3回使用。既存trigramインデックスを利用し、全件をアプリへ取り込まない。
3. 自分の未完了Issue、自分宛てHandoff、担当者変更のあるIssueは用途別のSQLで最大8件取得。Project進捗は本人が読める実Issueの集計。元ページからは対象IDと既存の直接関連を優先。
4. 検索結果と関連資料から最大8件。本文は各1,200文字以下、資料JSON合計12,000文字以下へ追加切詰め。既存の関連線は選択資料間のものを1件あたり最大4本含める。Wikiの長文全体・添付・過去版・監査JSON本文は送らない。
5. 実際のサーバー秘密値と、認識可能なキー・JWT・Bearer・秘密鍵・パスワード表記を除外。資料の命令を引用データとして扱うシステム指示を設定。外部検索・ツール・DB変更は許可しない。
6. 回数予約後にだけGeminiを1回呼ぶ。JSONの型・項目・長さ・根拠ID・未知のUUID/Issue番号を検証。URLはモデルが返したものを採用せず、検証済みの資料IDからアプリが元ページのリンクを生成する。AI出力はHTMLとして解釈しない。
7. 応答後に認証/所属・AI設定版と、参照本文・版・関連・集計の投影全体を再取得して照合。失効・更新があれば回答を破棄し、成功扱いにしない。

検索失敗はエラー、該当情報なしは「不明」と区別する。キーワード抽出は形態素解析や意味検索ではなく、短い固有名詞の指定が有効。「昨年」等は日本時間の**更新日**に展開し、開催日とは異なることを回答欄に表示する。削除済み資料はAI対象外。長いページの後半・全件集計・過去の送信スナップショットまで網羅する回答は行わない。送信当時の内容はHandoffの元ページで確認する。

## 変更ファイル一覧

| 分類 | ファイル |
| --- | --- |
| Gemini API | app/api/gemini/route.ts、lib/gemini.ts、lib/gemini-core.ts |
| RAG・DB型 | lib/ai.ts、lib/supabase/database.ts |
| AI設定・検証・型 | features/ai/config.ts、validation.ts、types.ts |
| AI UI | features/ai/components/AIProvider.tsx、AIControls.tsx、HandoffAIDraft.tsx、features/ai/ai.css |
| 既存画面への組込 | app/app/w/[workspaceId]/layout.tsx、settings/page.tsx、app/layout.tsx |
| Flow Map | features/flow/components/FlowExplorer.tsx、FlowCanvas.tsx |
| Handoff | features/handoffs/components/HandoffUI.tsx |
| 旧AI画面 | app/components/GeminiAction.tsx |
| DB追加 | supabase/migrations/20261017124130_phase7_ai_assistant.sql |
| テスト | tests/ai.test.mjs、ai-database.test.mjs、ai-http.mjs |
| 隔離用fixture | tests/fixtures/google.mjs、supabase.mjs、tests/helpers/register-ts.mjs、resolve-ts.mjs |
| 文書 | AGENTS.md、README.md、docs/phase7.md |

## 検証結果と再現手順

- `npm test`：91件成功（既存76 + AI15）。認証、全役割、別WS・非公開・脱退、保存済みの関連、構造化出力、429/5xx/timeout、日次回数、二重要求、個人/WS設定、マイグレーションのトランザクションrollbackと再適用を隔離DBで検証。
- `npm run lint`、`npm run typecheck`、`npm run build`：成功。
- `node tests/ai-http.mjs`：実Next.jsルート＋Supabase SDK＋隔離PostgreSQL＋Google応答fixtureで成功。通常RAG/Flow/Handoff、存在しない根拠の拒否、外部エラー、生成中のAI無効化と進捗更新による応答破棄、別WS拒否、AI下書きが自動保存されないこと、明示保存を検証。
- `node tests/http-smoke.mjs`：Phases 2〜6の認証・WS・Issues・Projects・Wiki/添付・Flow・Handoff受領/再確認/履歴/SSRの回帰テスト成功。
- 実Geminiは上記の1回だけ。業務データでの回答品質・MEDIUM実生成は未実施。Google応答fixtureを本番データとして扱わない。
- 操作可能なブラウザが提供されていないため、実ブラウザのクリック/IME/フォーカス、スマートフォン、ライト/ダークの視覚検証は未実施。HTTPによる画面取得とレスポンシブCSSの実装まで。
- PGliteは単一接続で直列化するため、同時12要求の検証は隔離DB内の予約結果の確認。実PostgreSQLの複数接続ロック競合・負荷、実Supabaseの設定、Vercel環境は未検証。

通常の `npm test` は実キー・実DB・外部AIを使わない。HTTP統合は**空のfixtureを新しく起動して**実施する（複数回のAIテストで日次カウンターを持ち越さない）。

```powershell
# ターミナル1。ローカル4400番のみ・メモリ内の隔離DB
node tests/fixtures/supabase.mjs
# 終了時は標準入力で stop と入力するか、この検証プロセスだけを終了する。

# ターミナル2。このプロセスの環境だけをfixtureに切替。環境ファイルには書かない。
$env:SUPABASE_URL='http://127.0.0.1:4400'
$env:SUPABASE_ANON_KEY='sb_publishable_fixture'
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:4400'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='sb_publishable_fixture'
$env:GEMINI_API_KEY='fixture-google-key-not-real'
$env:NODE_OPTIONS='--import ./tests/fixtures/google.mjs'
node node_modules/next/dist/bin/next dev --port 4100

# ターミナル3。外部AIは上のテストプロセス内で応答を差し替える。
node tests/ai-http.mjs
node tests/http-smoke.mjs
```

Google fixtureは固定のテストキーとlocalhostのSupabase URLが揃わなければ起動を拒否する。本番コードにAPIホスト切替や認可回避のテストフラグを加えていない。

## 未実装・公開前の作業

- 回答キャッシュ、永続会話、意味/ベクトル検索、AIによる自動更新は追加していない。通常操作はAIに依存しない。
- まず開発Supabaseで追加マイグレーションを適用し、実PostgreSQLの複数接続、各役割・RLS・権限変更中の動作、PC/スマホ・ライト/ダーク・キーボード操作を確認する。
- AIを有効にするWSの情報管理方針、Google無料枠の利用条件、AI Studioの実際の利用上限を確認する。自動除外だけで秘密情報や個人情報を完全に検知できるとは扱わない。社内データの送信可否は管理者が判断する。
- 公開先に既存名の環境変数が設定されていることを、値を表示せず確認する。WS AIは初期無効のまま公開できる。Owner/Adminの有効化・本人の有効化・送信同意の3段階が必要。
- 本番適用はバックアップ/復元手順とステージング検証後、対象環境を明示して承認を得てから行う。今回は本番DBへのSQL適用・キー変更・データ削除・デプロイを実行していない。
