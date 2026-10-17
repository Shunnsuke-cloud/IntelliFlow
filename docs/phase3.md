# Phase 3 — Issues / Projects

実装日: 2026-10-17（日本時間）。AGENTS.md、前段階の設計、Phase 2の認証・ワークスペース実装を確認して実装。
本番DBへの適用・デプロイ・APIキーの変更は行っていません。

## 利用できる機能

### Issue（課題）

- 作成・編集・削除・復元、タイトル/説明、担当者、期限、優先度（高/中/低）。
- ステータスは未着手 / 進行中 / 確認待ち / 完了。
- ワークスペース単位の番号 `ISSUE-001`。1000以降は`ISSUE-1000`と表示し、削除した番号は再利用しません。
- ラベル（10個まで、各30文字）、コメント追加/編集/削除、課題同士の双方向の関連付け/解除。
- タイトル・説明・番号の検索、状態/担当者/プロジェクト/優先度/ラベル/期限/削除状態の絞り込み。
- 更新順・作成順・名前順・期限順・優先度順・番号順。サーバー側検索とページング。
- 操作者・時刻・変更前後を残す更新履歴。画面では日本語の項目名と人名を使って表示。

### Projects

- 作成・編集・削除・復元、名称/説明、WS内のメンバー、開始日/終了日。
- 一覧とカンバン（計画中 / 進行中 / 完了）。カンバンの選択欄から状態を保存できます。
- プロジェクトに所属するIssue一覧とIssueカンバン。Issueの状態も選択欄から更新できます。
- 完了率 = 閲覧可能・未削除の関連Issueの完了数 ÷ 全数。0件は0%。Project自体を「完了」にしてもIssueの進捗は書き換えません。
- メンバー/状態/キーワードの絞り込み、更新/作成/名前/期限による並び替え。

共通の余白・控えめな色・カード/一覧・見出しの階層を使用しています。スマートフォンではフォーム・詳細を1列にし、カンバンは横スクロールで利用します。ドラッグ＆ドロップは実装せず、タッチ・キーボードでも操作できる選択欄で状態を変更します。

Wiki / Flow Map / Handoff / AIは今回実装していません。HomeとサイドバーではIssues / Projectsのみ準備中表示を外し、残る機能は準備中のままです。

## データ保存・権限・削除

- 通常画面はSupabaseのユーザーセッションでAPIへ接続。DBの実テーブルに保存し、成功したらサーバーデータを再取得します。本番画面にサンプルデータを注入しません。
- Phase 2の認証、Origin検証、所属確認、RLSを継続。追加した表にもRLSを設定。
- Owner/Admin/Memberは共有課題・プロジェクトを作成/編集可能。Viewerは閲覧のみ。
- Memberによる削除/復元は自分が作成した情報のみ。Owner/AdminはWS内の対象を削除/復元可能。
- コメントは本人のみ編集、本人または管理者が削除可能。削除後も本文は監査履歴に残ります。
- 削除はresources.archived_atによるアーカイブです。通常一覧から外れ、「表示対象: 削除済み」で確認・復元できます。物理削除は提供しません。
- Projectを削除してもIssue・所属先・コメント・履歴は保持。新規Issueを削除済みProjectへ割り当てる操作は拒否。既に所属するIssueの編集では所属を維持できます。
- 担当者とProjectメンバーを新規指定/編集する際は、現在も同じWSに所属するメンバーであることをDBで確認。脱退済みの担当がある場合は、編集時に再割り当てを求めます。
- 課題同士の関連先も同じWSの閲覧可能な未削除Issueだけ。自己参照・重複・越境を拒否。今回の関連は「関連する課題」で、Flow Mapの実装ではありません。
- 変更は専用の原子的DBコマンドへ限定。通常ユーザーの直接INSERT/UPDATE/DELETEは許可しません。Service Role Keyを利用しません。
- 公開RPCはSECURITY INVOKER。private内の更新関数だけがSECURITY DEFINERで、検証済みJWTのrole/user、DB所属・役割、対象のWS、参照先、版を毎回検査。search_path固定・PUBLIC/anonのEXECUTE剥奪を行っています。
- 読み取りviewはsecurity_invoker=true。集計もRLSと閲覧権限を守り、非公開の旧課題の件数を他の利用者に漏らしません。履歴には利用者によって変わる進捗集計を保存しません。
- workspace行のロックにより採番・権限変更・更新を直列化。expected_versionを使い、古い画面からの上書きを409で拒否します。失敗時は本文/ラベル/採番/履歴をまとめてロールバックします。

## DBマイグレーション

`supabase/migrations/20261017080005_phase3_issues_projects.sql`

Phase 2 SQLは変更していません。追加内容:

| 種類 | 内容 |
| --- | --- |
| 既存表への追加 | issues.issue_number、review状態、projects.start_on、日付制約 |
| 新規表 | issue_counters、workspace_labels、issue_labels、project_members、issue_comments、resource_events |
| 読み取りview | issue_records、project_records（security_invoker） |
| RPC | work_items_query、work_item_command、およびprivate内の認可付き更新関数 |
| 索引 | WS/状態/番号、担当/期限、優先度、ラベル、メンバー、コメント、更新履歴 |

既存Issueがある場合は作成日時・ID順で番号だけを追加し、その最大値から次の採番を開始。既存タイトル・説明・所有者・状態を変更しません。旧`blocked`行は「保留（旧データ）」として保持し、新規作成では選べません。編集するときは利用者が新しい4状態から選択します。

マイグレーションは単一トランザクションです。既存データの番号追加に伴う遅延制約トリガーを検査してからALTER TABLEへ進むため、既存Issue入りDBでも適用を検証しています。

適用前の手順:

1. Phase 2のマイグレーション適用済みを確認。既存データのバックアップと復元方法を用意する。
2. 同名テーブル/列/view/RPCとの衝突、Issue件数・WS対応・既存ステータスを確認する。
3. ステージングでPhase 3 SQLを一度適用し、件数・原文・新規番号の一意性を照合。既存001/002/Phase 2を再実行しない。
4. `public`をData APIに公開し、`intelliflow_private`を公開しない設定を確認。Supabase Advisorsと実ユーザー権限でのアクセス拒否も確認する。
5. 本番は明示した承認後に適用・デプロイ。今回は未実施。

新しい環境変数や依存関係はありません。切戻す場合はアプリをPhase 2へ戻して新規情報を保持し、表/列の削除を自動実行しないでください。

## 変更ファイル

| 分類 | ファイル |
| --- | --- |
| 画面 | app/app/w/[workspaceId]/issues/{page.tsx,not-found.tsx,[id]/page.tsx}、projects以下の同構成 |
| ドメイン/UI | features/work-items/{types.ts,validation.ts,server-pages.tsx,work-items.css,components/WorkUI.tsx} |
| API・DBアクセス | app/api/workspaces/[workspaceId]/work-items/route.ts、lib/work-items.ts、lib/supabase/database.ts |
| 共通導線 | components/layout/AppShell.tsx、app/app/w/[workspaceId]/page.tsx、app/layout.tsx |
| SQL | supabase/migrations/20261017080005_phase3_issues_projects.sql |
| テスト | tests/work-items.test.mjs、tests/work-validation.test.mjs、tests/http-smoke.mjs、tests/fixtures/supabase.mjs |
| 文書 | docs/phase3.md、README.md |

認証・WS管理の既存実装と過去マイグレーションは維持。next-env.d.tsはNextが生成するファイルで、ビルド時の内容に従います。

## 検証

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

- 自動テスト35件: Phase 2回帰17件、新規18件。実PostgreSQLのPGliteでSQL・RLS・GRANT・制約・CRUD・フィルター・版競合・操作履歴を実行検証。
- HTTPスモーク: Phase 2のAuth/WS回帰に加え、実Next API→ローカルAuth fixture/隔離DBを通したIssue/Project作成・編集・検索・進捗・コメント・履歴・削除/復元・Viewer/別WS拒否・各画面のHTML描画を確認。
- ローカルHTTP検証の起動方法は[Phase 2のガイド](phase2.md#テストと検証)を参照。fixtureは全日時付きマイグレーションを順に読み込み、実DBや外部AIへ接続しません。
- Node.jsのExperimentalWarningは型除去による通知です。lintの警告とは別です。

実行結果:

| チェック | 結果 |
| --- | --- |
| npm test | 35件成功・失敗0（Phase 2回帰を含む） |
| HTTPスモーク | 成功。認証/WSの回帰、CRUD・フィルター・進捗・コメント・履歴・削除/復元・認可拒否・HTML描画 |
| npm run lint | 成功、エラー0・警告0 |
| npm run typecheck | 成功 |
| npm run build | Next.js 16.4.2で成功 |
| git diff --check | 成功 |

本番Supabaseへの接続・SQL適用、Supabase Advisors、実Authプロバイダ、複数DB接続での負荷試験は未実施です。利用可能なブラウザ接続がなかったため、実ブラウザでのクリック・モバイル実機・見た目/フォーカスの確認も未実施です。公開前にステージングで実操作を確認してください。

初期の上限: 一覧は50件/ページ（API最大100件）、Project詳細の課題カンバンは先頭100件と全件へのリンク、更新履歴表示は最近100件。履歴の保存自体は削除していません。日本語検索は部分一致で、意味検索・AI検索・全文索引による高速化は今回対象外です。
