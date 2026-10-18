# IntelliFlow 本番公開手順・承認対象

2026-10-18（日本時間）。個人開発ポートフォリオ向けに、既存Vercel/Supabaseだけで公開する計画です。新規有料サービス・常設ステージングは追加しません。**本番DBへの7本の適用、Auth/Vercel設定変更、Git push、デプロイは未実施**です。

## 確認済みの対象

| 項目 | 結果 |
|---|---|
| リポジトリ | `Shunnsuke-cloud/IntelliFlow` |
| 作業ブランチ | `Preparation-for-Production-Launch-&-Final-Verification`（基点`fca021f`、Phase8差分は未コミット） |
| Vercel | `shunnsuke-clouds-projects/intelli-flow` / `prj_dTnr56e8RZEYW3wGz8rAJ1KNLA5Z` |
| 本番ブランチ | **main**。GitHubのmainと現在の本番はともに`7a63fc7bd11a4e3fac9473f8f39b26fa8cb20ae3` |
| 本番URL | `https://intelli-flow-pi.vercel.app` |
| 現在の本番デプロイ | `dpl_BLxqwpy2oona4T86E4i5rc8pih12`、READY |
| Supabase | `pocjzzekfupjqcwdfkan`。旧notes 1件、notes_backup 0件、Authユーザー5件、Storageオブジェクト0件 |
| Gemini | `gemini-3.8-flash`。Phase8で架空資料による3用途の実接続成功。今回の調査では生成を追加していない |

Vercel APIでProductionブランチとGit連携を確認し、`git ls-remote`でもmainのSHAを照合しました。**mainへのpushはProductionデプロイにつながる操作**です。非mainへのpushもPreviewを作り得るため、現段階では行いません。[公式Gitデプロイ仕様](https://vercel.com/docs/git)

## 差分・秘密情報・品質

Phase8の修正は[Phase8報告](phase8.md)に記載。今回追加したのは公開前の読み取り検査/バックアップ/ネイティブPostgreSQL検証、Git除外とESLint除外、手順文書です。アプリの機能や過去の6本のSQLを再設計していません。

- `scripts/production-preflight.mjs --local-only`で追跡中・未追跡のGit対象ファイルを検査。実GEMINI_API_KEYの一致なし、envファイルなし。形式検出の`tests/ai.test.mjs`はレビュー済みの偽値です。
- `.release-private/`（バックアップ/復元データ）は本人専用ACL、Git除外・lint除外。`.release-local/`（架空DB）と`.phase8-audit/`も除外。秘密の値・本文・ユーザーのメールを報告に出していません。
- lint、型チェック、95/95テスト、Production Buildを再実行して成功。Phase8のAPI/Chrome E2Eも成功済みです。
- 本番依存の既知脆弱性はPhase8更新後0件。開発ツールの`braces`経由のhigh 5件は残存します。未信頼のリポジトリやglobパターンをビルドに持ち込まず、Next ESLintの対応版を別途追跡します。重大なアプリ実行時脆弱性を発見した場合は公開を止めます。

## バックアップと復元の範囲

2026-10-18 **00:31 JST頃**にネイティブ`pg_dump`で取得しました。CLIが生成する短時間の接続情報はメモリだけに置き、SSL接続とread-only設定を使用。本番のデータ・APIキー・ユーザーは変更していません。

- アーカイブ：`.release-private/pocjzzekfupjqcwdfkan-2026-10-17T15-31-42-687Z.dump`
- サイズ：248,419 bytes。SHA-256：`e99824780e3b043f8d0bef268e022c48ab010c1e179d7f5ac71425327e689b49`
- 同名の`.manifest.json`に検証メタデータを保存。アーカイブ内容は表示しないでください。初期の失敗で作られたmanifestのない部分ファイルは使用不可です。
- `public`・`auth`・`storage`のスキーマ/データを含みます。ノート本文/所有者、Authユーザーの保護された情報も含むため、Gitや公開共有先に置かないでください。
- 独立したローカルPostgreSQL 18.3へ復元し、件数・所有者・RLS定義を確認しました。本番PostgreSQL 17から18への復元検証であり、Supabase管理画面から本番復元したものではありません。
- 本番との本文を含む内容ハッシュ照合が成功し、復元先への7本適用後もnotes・notes_backup・Authユーザーの内容ハッシュが一致しました。所有者による旧ノート1件の参照も成功。manifestの`fingerprints_match=true` / `migrations_rehearsed=7` / `migrations_preserve_records=true`を確認しています。

ローカルの復元ではクラスタ所有者・ACLを省略し、必要なSupabase標準Auth参照権限を補っています。**本番用ロール/ACLの完全復元、GoTrueのログイン、OAuth設定の復元を保証する検証ではありません**。Storage実ファイルとダッシュボード/Provider設定はこのDBアーカイブには含まれません。現時点でStorage実ファイルは0件です。[公式バックアップ仕様](https://supabase.com/docs/guides/platform/backups)

適用直前に件数・内容の変化を確認し、変わっていればバックアップを取り直します。既存ノートは書換えません。ユーザーはこのバックアップとmanifestを、本人だけがアクセスできる別の保存先にもコピーしてください。常設の有料バックアップサービスは不要です。

## 独立した実PostgreSQLでの検証

既存インストールのPostgreSQL 18.3を使用し、localhost:16438の使い捨てクラスタを新規初期化しました。既存ローカルDBや本番DBには接続しません。

`node tests/native-postgres.mjs`で以下が成功しました。

- 7本の適用、旧ノート/所有者不明の架空行の保持。
- 招待・参加、Owner/Admin/Member/Viewer、Issue/Project/Wiki保存とFlowの関連検索。
- 未認証、別WS、Viewer書込、Service Roleの通常RPC、backup表の参照を拒否。
- Handoffを指定Viewerが受領、別受領者を拒否。
- **実際の8つのPostgreSQL接続**から同時予約し、allowed=trueは1件、残り7件拒否、使用回数は1。
- 架空DBのdump→別DBへのrestore、復元後のRLS。

`node tests/native-postgres.mjs --restore-production-backup`は本人専用フォルダの別クラスタ（localhost:16439）にバックアップを復元する明示操作です。本番の接続情報を読まず、本番には書き込みません。AuthのDB関数/claimsとRLSを検証しており、実メール/Googleのログイン検証とは区別します。ローカル検証は終了時に停止します。今回の一時クラスタは後片付けし、バックアップとmanifestを残しました。

## 承認1：本番DBの7本を適用

対象：Supabase **pocjzzekfupjqcwdfkan**。本番の現在のマイグレーション履歴は空。dry-run（`--skip-vault`）で下記7本のみ、seedなし・追加ロール定義なしを再確認しました。

| 順番 | マイグレーション | 影響 |
|---|---|---|
| 1 | `20261017072651_phase2_workspaces.sql` | WS/所属/招待/権限基盤と機能の基礎表、旧notesのRLS置換 |
| 2 | `20261017080005_phase3_issues_projects.sql` | Issues/Projectsの列・履歴・関連・操作RPC |
| 3 | `20261017083402_phase4_wiki.sql` | Wiki/版/関連/Storageポリシーと非公開バケット |
| 4 | `20261017105423_phase5_flow_map.sql` | Flow検索/関係/索引/RPC |
| 5 | `20261017113749_phase6_handoff.sql` | Handoff/スナップショット/受領履歴/RPC |
| 6 | `20261017124130_phase7_ai_assistant.sql` | AI設定/日次回数/監査/RAG/RPC。AIは初期無効 |
| 7 | `20261017134159_phase8_release_hardening.sql` | 旧notesの不要権限除去、backup表のアプリ向け権限除去 |

既存ノート/ユーザーの削除・内容更新・所有者変更、DBリセット、seed投入は行いません。旧notesのポリシー/GRANTは変わります。所有者の正当なログインで読めることを確認し、所有者不明データを他人へ再割当しません。

承認時に用いるSQLのハッシュは`docs/release-migrations.json`に固定しています。実行前にファイルのSHA-256を再照合し、差分があれば承認を取り直します。適用は各ファイルのトランザクション単位。途中失敗時は停止し、適用済み履歴を読んでから修正します。

承認後の実行予定：

```powershell
npx supabase db push --skip-vault --project-ref pocjzzekfupjqcwdfkan
```

**上記はまだ実行していません。** 実行前にバックアップ/復元メタデータ、対象ref、件数、7本のhashを確認します。適用後はRLS有効、RPC/バケット作成、履歴7件、旧ノート/ユーザー数と内容不変、anon/別WS拒否を確認します。認証を使った本番での新規データ作成は自動で行いません。

## 承認2：Supabase Auth設定

対象：同じSupabaseのAuthentication→URL Configuration。設定のみの個別承認です。

| 設定 | 現状 | 変更案 |
|---|---|---|
| Site URL | `http://localhost:3000/` | `https://intelli-flow-pi.vercel.app` |
| Redirect URLs | localhost:3000/app、localhost:3001/app、本番`/`、本番`/app` | **既存4件を維持**し、下記callbackを追加 |

追加案：

```text
https://intelli-flow-pi.vercel.app/auth/callback
https://intelli-flow-pi.vercel.app/auth/callback?next=**
```

`next`付きの遷移に対応するためquery部分だけにワイルドカードを限定します。アプリ側でも外部nextを拒否します。ホスト全体のワイルドカードには拡大しません。[公式Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

メール確認必須・Google有効・既存OAuth資格情報は変更しません。Google側の既存Authorized redirect URIは`https://pocjzzekfupjqcwdfkan.supabase.co/auth/v1/callback`と整合しているかユーザーが確認してください。実ログイン/メール配信は公開後に本人が確認します。

## 承認3：Vercel Productionのモデル設定

既存変数は削除・上書きしません。既存のSupabase公開URL/キー、GEMINI_API_KEYはProduction/Previewに登録済みです。公開済みブラウザのJavaScriptを検査し、Supabase refが`pocjzzekfupjqcwdfkan`のみであることと、公開キーでAuth設定取得HTTP200を確認しました。

`GEMINI_MODEL`は未登録なので、既存Projectの**Productionだけ**にConfig変数として`gemini-3.8-flash`を追加する案です。現コードにも同じ既定値があり、追加は設定の明確化です。キーは変更しません。

既存のSensitive/Secret値は保存後に読み戻せない仕様です。ProductionのGEMINI_API_KEYがローカルのキーと同一かは確認できず、**本番での実動作は公開後の明示AI操作で確認**します。値を取得するために既存キーを置換/Secret→Config変更しません。[Vercel公式仕様](https://vercel.com/docs/environment-variables/sensitive-environment-variables)

ProductionとPreviewは同じ設定エントリです。ポートフォリオの初回公開で常設Preview用DBを新設することは必須にしません。その代わり、**今回はPreviewをデプロイせず**、将来Previewを使う際に検証DBへ分離します。

## 承認4：コード固定・mainへのpush・Production公開

DB適用と設定確認が終わるまで、mainへのpushもVercelのDeploy/Redeployも行いません。Vercelの設定保存後に表示されるRedeployボタンも、この段階まで押さないでください。

公開対象はPhase7の`fca021f`＋レビュー済みPhase8差分と今回の検証/手順です。ローカル作業ブランチでコミットを作り、最終SHAとmainへの変更一覧を提示します。未コミット状態のまま公開しません。

推奨は既存Git連携を使う方法です。mainとの統合結果をローカルで作成・検証してSHAを確定し、**そのSHAをmainへpushして自動Production公開することに個別承認**を得ます。force pushは行いません。承認対象が変わる競合解決や追加変更が生じたら、再度レビューします。プルリクエスト機能をアプリに実装する話ではなく、リポジトリの公開手順です。

代替のCLI Productionデプロイは今回の推奨経路にはせず、実行する場合も既存Project ID/固定SHA/既存URLを提示して承認を得ます。新しいProjectやドメインは作りません。

## 公開後の動作確認

公開直後は読み取り確認を先に行います。

1. 既存URLの`/`と`/login`が200、未認証`/app`はログインへ転送、未認証APIは401。
2. 本人が既存アカウントでログイン/ログアウト、メールリンク/Googleログインのcallbackを確認。旧ノート1件が本人だけに見えることを確認。
3. Homeと各機能・Settingsの空状態、スマホ、ライト/ダーク、エラー表示を確認。ページ遷移や通常検索でAI生成が発生しないことを確認。
4. 本人が許可した専用の非公開「公開確認」WSでProject→Issue→Wiki→関連→Flow検索→元ページを確認。別アカウントは明示招待し、Viewer編集不可・別WS拒否を確認。**自動で本番テストデータを投入しません**。
5. Handoffを指定相手へ送信→受領→版/日時保存、非受領者の拒否、Flow検索を確認。
6. 架空資料だけを使いWSと本人のAIを有効化・同意して、チャット/Flow/Handoff各1回。根拠リンク、下書きの確認後保存、利用回数を確認。429なら再試行を連打せず通常機能を継続し、必要ならAIを無効化。
7. Vercelログで5xx/タイムアウト、SupabaseのRLS/Storageエラーを確認。キーや本文はログへ追加しない。確認用レコードを削除する場合もユーザーが対象を確認する。

## 復旧・中断条件

- 既存データ/ユーザー数・内容hashが意図せず変わる、越境閲覧、キー露出、主要認証失敗なら中断。
- アプリの問題は、承認の上で既存の正常デプロイ`dpl_BLxqwpy2oona4T86E4i5rc8pih12`へ切り戻す。URLは維持する。新テーブルをDROPしない。
- DBだけ適用済みで公開を止める場合、追加テーブルを維持して旧サービスの所有者アクセスを確認する。巻き戻しのためにユーザー/テーブルを削除しない。
- DB復元が必要なら、このバックアップと最新更新の差分を確認し、別環境で復元を再検証してから**本番復元を別途承認**する。今回のローカル復元から本番復元へ自動で進まない。
- Auth URLの変更だけを戻す場合も、保存した変更前の4リダイレクトとSite URLを提示して承認を得る。APIキーを削除/再発行しない。

ユーザーの承認例（各段階を一括承認にしない）：

1. 「対象refと記載の7本のDB適用を承認します」
2. 「記載のSupabase Auth URL変更を承認します」
3. 「ProductionのGEMINI_MODEL追加を承認します」
4. 最終SHA提示後に「そのSHAのmainへのpushとProduction公開を承認します」
