# Phase 4 — Wiki

実装日: 2026-10-17。AGENTS.md、リニューアル設計、Phase 2・3の認証・ワークスペース・課題管理を確認して実装。
本番DBへのマイグレーション適用、デプロイ、環境変数・APIキーの変更は行っていません。

## 利用できる機能

- `/app/w/[workspaceId]/wiki`：一覧、タイトル・本文のキーワード検索、カテゴリ・公開状態・削除状態での絞り込み、ページング、ページ階層。
- `/wiki/new`、`/wiki/[id]/edit`：タイトル、カテゴリ、親ページ、下書き/ワークスペース共有、文章編集、関連Issue・Projectの選択。
- `/wiki/[id]`：本文、親子階層、関連情報、更新履歴、削除・復元。
- `/wiki/[id]/history/[revision]`：過去の版を読み取り専用で表示。
- Issue・Projectの詳細画面にも「関連Wiki」を表示。本文をコピーせず、共通の`resource_relations`にWiki→Issue/Projectの`references`辺を保存。

削除はアーカイブです。子ページ、関連先、履歴、添付画像は消さず、削除済み一覧から復元できます。共有ページの削除も閲覧権限自体は変えません。非公開にする場合は、公開状態を下書きに変更してください。
Flow Map・Handoff・AIには機能を追加していません。

## 文章エディタと表示

既存依存に文章エディタがなかったため、Tiptap 3.32.0を固定して追加しました。`core/react/pm/starter-kit/extension-list`を利用し、既存のボタン・入力・モーダル・テーマ・レイアウトを再利用しています。

- 本文、大/中/小見出し、太字、斜体、箇条書き、番号付きリスト、チェックリスト、リンク、画像、取り消し/やり直し。
- Markdownの知識は不要。リンクは選択した文章に設定します。
- 画像は一度ページを保存した後に追加できます。PNG/JPEG/WebP、1枚3MiB（UI表記3MB）、1ページ200件まで。SVG・外部画像URLは受け付けません。
- 新規ページは下書きが初期値。下書きは作成者とOwner/Adminのみ閲覧できます。
- 本文は最大60,000文字、4,000ノード、文章構造20段、JSON 200,000文字。関連情報は50件まで。検索候補は30件、履歴一覧は直近100版（過去版自体は保持）。
- スマートフォンでは階層・本文を縦に配置し、ツールバーを折り返します。ライト/ダークの共通テーマに対応。

本文はHTML文字列ではなく、検証したJSON構造で保存します。APIとDBでノード・属性・リンクを検証し、閲覧画面ではReactの許可リスト方式で描画します。`dangerouslySetInnerHTML`は使用せず、入力中のHTML文字列は文字として表示します。リンクはhttp/https/mailtoのみ許可し、画像の保存値は添付IDと代替テキストだけです。

Vercel Functionsの送受信上限4.5MBに余裕を持たせて画像上限を3MiBとしました。[Vercel公式仕様](https://vercel.com/docs/functions/limitations#request-body-size)
TiptapはSSR時の即時描画を無効にしています。[TiptapのNext.jsガイド](https://tiptap.dev/docs/editor/getting-started/install/nextjs)

## DBと権限

追加マイグレーション: `supabase/migrations/20261017083402_phase4_wiki.sql`。

| 対象 | 変更 |
| --- | --- |
| `wiki_pages` | `body_doc`、同一WS外部キー付き`parent_id`、`category`。本文検索用の`body`も更新 |
| `wiki_revisions` | `body_doc`、`metadata`。本文・タイトル・状態・カテゴリ・親・関連ID・操作者を版ごとに記録 |
| `wiki_attachments` | 新規。WS/ページ/アップロード者/Storageパス/MIME/サイズ/準備状態 |
| `wiki_records` | `security_invoker`ビュー。呼出者のRLSを維持 |
| `wiki_command` | 作成・編集・アーカイブ・復元・添付予約/完了の原子的RPC |
| `wiki_query` | 一覧・詳細・過去版・階層候補・関連候補・逆引きRPC |
| インデックス | WS/親、WS/カテゴリ/状態、WS/ページ/版、添付のWS/ページ |
| Storage | 非公開`intelliflow-wiki`バケットと読み書きポリシー |

Phase 2・3のマイグレーションは変更していません。既存Wiki本文・履歴はHTMLとして解釈せず、そのまま文字列ノードに移します。元の`body`は移行時に保持し、基準版がなければ追加します。旧Project参照を共通の関連辺に移し、以後の保存でも互換用の`project_id`に最初の関連Projectを反映します。
既存履歴は公開状態を断定できないため下書き扱いにし、作成者・管理者に限定します。既存ページの現在の公開状態は維持します。

| 役割 | 共有Wiki | 下書き | 削除・復元/共有の解除 |
| --- | --- | --- | --- |
| Owner/Admin | 作成・閲覧・編集 | WS内の下書きも閲覧・編集 | WS内の対象で可能 |
| Member | 作成・閲覧・編集 | 自分の作成した下書きのみ | 自分の作成したページのみ |
| Viewer | 閲覧 | 不可 | 不可 |

- 通常操作は既存Supabase Authのユーザーセッションを使用。Service Role Keyを使用せず、匿名/特権JWTによる更新も拒否します。
- サーバー側の所属確認とDBのRLSを併用。WSロックで所属変更との競合を制御し、関連先・親・画像の同一WS/ページを検証します。
- ページ階層の循環を拒否。共有するページの親は共有ページに限定し、共有された子を持つ親の下書き化も拒否します。
- 共有ページから非公開Issue/Projectへの新しい参照は拒否し、参照IDを漏らしません。
- 編集・削除・復元は`expected_version`を検証。古い版による上書きはエラーとなり、入力は画面に残ります。
- 公開後も過去の下書き版は作成者・管理者だけが閲覧できます。履歴表への直接更新・削除は許可しません。

## 画像のアクセス制御

画像はユーザーの権限で予約→Storageアップロード→完了確認を行います。完了時に実オブジェクトのMIMEと予約サイズが一致することを確認します。APIでMIMEとファイル先頭のシグネチャも照合します。

非公開バケットの画像は、同一オリジンの認証付きAPIから配信します。長期の公開URLや署名URLを本文に保存しません。APIは現在の所属とページ権限を確認し、`private, no-store`、`nosniff`を付けます。Storage側にも同じ境界を設定しています。[Supabase Storageのアクセス制御](https://supabase.com/docs/guides/storage/security/access-control)

画像は、閲覧可能な現在版または公開履歴に参照されているものだけを他のメンバーが読めます。下書き履歴にしか残っていない画像は公開版から見えません。予約者は編集権限がある間、挿入前の自分の画像をプレビューできます。別ページの画像IDは保存できません。
既存の広いStorageポリシーがあってもWikiバケットが開かないよう、制限ポリシーを追加しています。利用者によるオブジェクトの上書き・削除は禁止し、過去版の画像を保持します。

アップロード途中の失敗や未保存の画像は自動削除しません。予約を含め200件で制限するため、長期運用時の孤立ファイル整理は履歴参照を調べる別の承認済み保守作業として扱ってください。

## 主な変更ファイル

- `features/wiki/`：本文型/検証、文章エディタ、閲覧表示、一覧/フォーム/詳細/階層/履歴、サーバー画面処理、CSS。
- `app/app/w/[workspaceId]/wiki/`：一覧、新規、詳細、編集、過去版、404。
- `app/api/workspaces/[workspaceId]/wiki/`：検索/CRUD/履歴/関連API、画像アップロード・配信。
- `lib/wiki.ts`、`lib/supabase/database.ts`：既存認証を使うDBアクセス、RPC型、入力サイズ制限。
- `features/work-items/server-pages.tsx`、`components/WorkUI.tsx`：Issue/Project詳細にWiki逆引き。Wiki用DB未適用時も既存画面は利用可能で、関連欄に設定エラーを表示。
- `components/layout/AppShell.tsx`、ワークスペースHome、`app/layout.tsx`：WikiナビゲーションとCSS読み込み。
- `package.json`、`package-lock.json`：固定したTiptap依存。
- `tests/wiki-document.test.mjs`、`tests/wiki.test.mjs`、`tests/helpers/storage.mjs`：文章・権限・履歴・Storageのテスト。
- `tests/fixtures/supabase.mjs`、`tests/http-smoke.mjs`：ローカル限定の実SDK/API統合テストを拡張。
- `README.md`、本書：現在の実装状況と設定手順。

## 検証結果

- `npm test`：49件成功（既存35件とWiki関連14件）。CRUD、検索、カテゴリ、階層、ID関連と逆引き、過去版、競合、アーカイブ/復元、既存本文保持、XSS入力拒否を検証。
- 同テストでOwner/Admin/Member/Viewer・別WS・匿名・未認証・特権ロールの認可、直接書込み拒否、Storageの越境・上書き・削除・下書き画像の漏洩防止を検証。
- `node tests/http-smoke.mjs`：ローカルNext.jsと隔離DBアダプターで成功。既存の認証/WS/課題/プロジェクトの回帰、Wiki保存・検索・関連/逆引き・SSR画面・過去版・画像アップロード/配信・偽装SVG拒否・Viewer制限を検証。
- `npm run lint`、`npm run typecheck`、`npm run build`：成功。
- `git diff --check`：成功。

DBテストはPGliteに全マイグレーションを適用し、実際のPostgreSQLロール/RLSを実行します。StorageのカタログとHTTP通信はテスト用アダプターです。実Supabase Storageサービス・本番DBでは未検証です。
操作可能なブラウザーが提供されていないため、エディタのマウス/キーボード操作・ハイドレーション・モバイル画面の目視確認は未実施です。HTTPテストはブラウザー操作テストの代わりではありません。

## 必要な手動設定・リリース順序

1. 承認された対象環境で、Phase 2→3の適用状況とバックアップを確認します。新規バケット名`intelliflow-wiki`が未使用であること、既存Wikiの件数・本文・履歴件数を記録します。同名バケットがある場合は無断で上書きせず、この追加SQLの適用前に差異を確認してください。
2. 承認後、Phase 4マイグレーションを適用します。追加SQLはトランザクション単位・一回適用が前提です。既適用ファイルを再実行したり、旧マイグレーションの履歴を変更したりしないでください。
3. SupabaseのData APIで`public`のRPC/テーブル/ビューが利用可能か確認。非公開スキーマ`intelliflow_private`を公開しません。新規GRANT/RLSとStorageポリシーはマイグレーションに含まれています。
4. Storageが有効で、作成されたバケットが非公開、PNG/JPEG/WebP、上限3MiBであることを確認します。ダッシュボードから公開に変更しないでください。
5. テスト用のWSと複数役割の利用者で、作成→画像添付→共有→別利用者閲覧→過去版→関連Issue/Projectの逆引き→削除/復元を確認します。別WS・脱退後・下書き版へのアクセス拒否も確認します。
6. ブラウザーでPC/スマートフォン、ライト/ダーク、文章の貼り付け、リスト/チェック/リンク、アップロード中の保存防止、競合時の入力保持を確認後、別途承認してデプロイします。

追加の環境変数、外部サービス、AI設定は不要です。切戻しが必要な場合も新しい本文・履歴・画像を削除せず、アプリ側のWiki導線を止めてDBを保持してください。
