# LP・認証画面のリニューアル

## 対象

- `/`：インタラクティブなグラフ、課題提示、Before/After、機能タブ、5段階の体験デモ、最終CTA。
- `/login`：メール・パスワード、Google認証、既存のメールリンク認証。
- `/signup`：表示名・メール・パスワード登録、Google登録、確認メールの案内。

LPとブランドグラフのデータはすべて架空の固定データ。SupabaseやGeminiを呼び出さない。認証API・callback・`safeNext`・ワークスペース機能は既存の方式を維持する。パスワードを忘れた場合は既存のメールリンク認証へ案内し、パスワード再設定機能は追加しない。

CSSはpublic画面のクラスに限定。既存のMotionを再利用し、追加ライブラリ・環境変数・マイグレーションはない。動きを減らす設定ではアニメーションを停止する。

## ローカル確認

通常は `npm run dev` で `/`、`/login`、`/signup` を確認できる。ただし、認証操作はローカルで設定されたSupabaseに接続する。テストデータ作成には以下の隔離環境を使用する。

PowerShellの別ターミナルで：

```powershell
node tests/fixtures/supabase.mjs
```

別のPowerShellで、プロセス内の環境変数だけを設定する（`.env.local`は変更しない）：

```powershell
$env:SUPABASE_URL='http://127.0.0.1:4400'
$env:SUPABASE_ANON_KEY='sb_publishable_fixture'
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:4400'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='sb_publishable_fixture'
$env:GEMINI_API_KEY='fixture-google-key-not-real'
$env:NODE_OPTIONS='--import ./tests/fixtures/google.mjs'
node node_modules/next/dist/bin/next dev --port 4100
```

一時的なPlaywrightとインストール済みのChromeを使用する。Playwrightはアプリの依存関係には含めない。

```powershell
npx --offline --package=playwright -c "node tests/marketing-browser.mjs"
# 主要画面の既存回帰テスト（新しいfixtureプロセスを推奨）
npx --offline --package=playwright -c "node tests/browser-e2e.mjs"
```

初回のみPlaywrightがローカルのnpmキャッシュに必要。Chromeのパスはテスト内でWindowsの既定パスを指定している。

UIテストは外部通信を遮断し、LPのAPI呼び出しが0件であること、グラフ・タブ・デモ・CTA・入力・エラー・送信中の無効化・モバイル・reduced-motionを検証する。Googleとメールリンクはリクエスト開始時に捕捉してcallback等を検証する。実際のGoogleログイン完了・メール配信はこのテストの対象外。

スクリーンショットはGit対象外の `test-results/` に保存する。本番デプロイ・pushは行わず、画面レビュー後の承認を待つ。
