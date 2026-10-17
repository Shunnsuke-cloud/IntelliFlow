# Phase 5 — Flow Map

実装日: 2026-10-17。AGENTS.mdとPhase 2〜4、リニューアル設計の共通resource/関連モデルを確認して実装しました。
本番DBへの適用・デプロイ・環境変数やAPIキーの変更は行っていません。AI・Handoffの新規機能は今回の範囲に含めていません。

## 利用方法

ワークスペースのサイドバーまたはHomeから「Flow Map」を開きます。URLは`/app/w/[workspaceId]/flow`です。

1. 「イベント 混雑」のように短いキーワードを入力して検索します。タイトルと現在の本文を部分一致で検索し、空白区切りはAND条件になります。自然文の意味検索は行いません。
2. 種類、更新日の開始・終了、Project、削除済みを含めるかを指定できます。日付は日本時間で両端を含みます。完了済みIssue・Projectも通常の検索対象です。
3. 検索結果を10件ずつ表示し、直接のつながりを最大20本取得します。初期ノードは最大30件です。検索条件は検索結果の中心ノードに適用し、関連ノードは条件外の種類・日付・Projectからも表示します。
4. 検索結果またはマップのノードを選ぶと、種類・状態・タイトル・本文の抜粋・更新日・元ページへのリンクを表示します。
5. 「関連情報を追加でたどる」で選んだノードの関連線を20本ずつ追加します。追加したノードからも同じ操作ができます。
6. PCは検索結果・中央マップ・詳細を表示します。画面幅に応じて詳細を下へ移し、スマートフォンは一覧を初期表示にして必要時だけマップを読み込みます。

React Flow（`@xyflow/react@12.12.0`固定）でズーム、ドラッグ、全体表示、ノード選択、直接関連するノードと線の強調に対応しました。種類ごとの色と日本語の種類名、検索結果の点線枠、関連線の説明で区別します。関連付けは詳細パネルから明示的に保存します。ノード位置を動かしてもデータの所属や関連は変更せず、座標は保存しません。

## 関連情報の保存と再利用

| 関係 | 正本と変更方法 |
| --- | --- |
| Issue → Project所属 | 既存の`issues.project_id`を参照。変更は元のIssue編集画面 |
| Issue ↔ Issue | 既存の`resource_relations.related_to`。Flow Mapから追加・解除可能 |
| Wiki ↔ Issue / Project | 既存のWiki起点の`references`辺。Flow Mapからどちら側を選択しても追加・解除可能 |
| Wiki → 親Wiki | 既存の`wiki_pages.parent_id`を参照。変更はWiki編集画面 |
| 将来のHandoff | 共通`resources`/`resource_relations`を拡張して参照可能。現在のFlow検索と関連編集では対象外 |

IssueからWikiを関連付ける場合も、Phase 4と同じWiki→IssueのID参照を保存します。Wikiの既存逆引きや編集画面と食い違わないようにし、本文をコピーしません。Project所属や親ページの辺を別テーブルに二重保存しません。既存の`blocks`/`follows`などの可視な辺も表示できますが、それらの新規編集機能は追加していません。

保存は新規の`flow_relation_command`から既存の`work_item_command`/`wiki_command`へ委譲します。これによりIssueの操作履歴、Wikiの版履歴、更新版番号、既存画面の逆引きを維持します。Wikiの他の参照・本文・カテゴリ・親を維持して、対象IDだけを追加/解除します。

## 権限と入力検証

- 既存のSupabase Authを使用し、APIで認証・現在の所属を確認。通常操作にService Role Keyを使用しません。
- 検索RPCとビューは`security invoker`。既存テーブルのRLSと両端の閲覧権限を適用し、読めないノード・関連線・件数を返しません。過去のWiki版は検索せず、現在の閲覧可能な本文のみを検索します。
- Owner/Admin/Member/Viewerは読める情報を検索・探索できます。Viewerは関連を変更できません。MemberのWiki編集は既存の下書き権限を守ります。
- 更新用の限定されたprivate関数では、認証・匿名/特権JWTの拒否・現在の役割・両端の同一WS・削除状態・両端の版を検証します。所属変更と同じWS行ロックを取り、既存の更新コマンドを呼びます。
- 不可視な参照を持つWikiを関連編集する場合は、隠れた参照を落としたり漏らしたりせず拒否します。共有Wikiへの非公開Issue/Project参照も既存の検証で拒否します。
- APIのPOSTでは既存のOrigin検証を再利用。検索語200文字/8語、実在する日付、UUID、ページ上限、更新版、本文サイズを検証します。`%`/`_`/バックスラッシュは検索ワイルドカードにせず、文字どおりに扱います。
- 抜粋・タイトルはReactの文字列として表示します。本文HTMLの直接挿入は行いません。

## 追加マイグレーション

`supabase/migrations/20261017105423_phase5_flow_map.sql`を追加しました。過去のマイグレーション、既存データ、RLSポリシーは変更・削除していません。

| 追加対象 | 内容 |
| --- | --- |
| `flow_records`ビュー | Issues・Projects・Wikiを統合するRLS付きの投影。レコードの複製なし |
| `flow_edges`ビュー | 保存済みの参照、Issueの所属、Wikiの親子を統合。両端のRLSを維持 |
| `flow_query` RPC | 検索、隣接取得、詳細、Project候補のページ取得 |
| `flow_relation_command` RPC | 既存の更新コマンドに委譲する関連操作 |
| `intelliflow_private.flow_relation` | 認証・役割・同一WS・版の検証と原子的な委譲 |
| `pg_trgm` | Supabase内のPostgreSQL拡張。既存の導入スキーマを尊重 |
| GINインデックス | `resources.title`、`issues.description`、`projects.description`、`wiki_pages.body` |
| B-tree/部分インデックス | WS/更新日/ID、WS/関連の起点/終点（有効な関連のみ）、WikiのWS/Project |

先頭キーワードの候補IDをタイトル・各本文から個別に取得するため、各表のtrigramインデックスを利用可能です。その後、残りの語がタイトルまたは本文に存在するか検証します。[PostgreSQLのpg_trgm仕様](https://www.postgresql.org/docs/current/pgtrgm.html)
1〜2文字などtrigramを取り出しにくい語や、非常に多くの情報に共通する語は検索コストが増えます。大規模実データでの速度は未測定です。

## 取得量と画面の上限

- 検索とProject候補は10件、隣接線は20本、続きの有無は1件余分に調べて判断。全件カウントや全データ取得は行いません。
- 初期の線は20本までなので、中心ノードにすべての関連が最初から出るとは限りません。選択して追加取得できます。
- マップは最大120ノード/240本。上限に達すると追加取得を止め、検索の絞り込みを案内します。
- 検索はページ切替時にグラフを置き換えます。隣接取得はIDで重複を除去して追加します。
- 一覧・ノード用の抜粋は320文字、選択詳細は1,600文字。全文は元ページから閲覧します。
- ページングは既存機能に合わせてoffset方式を使用し、最大10,000件の位置までに制限します。大量データで深いページの利用が増えた場合はカーソル方式への移行を検討してください。同時更新があるとページ間の並びが変わるため、必要時は再検索してください。
- ノード/線の変換や隣接強調はメモ化し、ドラッグ後の座標を追加取得時に維持します。可視範囲を描画し、スマートフォンではマップ部品を必要になるまで読み込みません。[React Flowの公式資料](https://reactflow.dev/learn)

## 変更ファイル

- `features/flow/types.ts`、`validation.ts`：API型、表示名、リンク、関連の組合せ、入力検証、グラフの重複除去・上限。
- `features/flow/components/FlowExplorer.tsx`、`FlowCanvas.tsx`、`flow.css`：検索・フィルター・一覧・マップ・詳細・関連編集・モバイル表示。
- `app/app/w/[workspaceId]/flow/`：画面、ローディング、エラー表示。
- `app/api/workspaces/[workspaceId]/flow/route.ts`、`lib/flow.ts`、`lib/supabase/database.ts`：ユーザー権限によるAPI/RPC呼出し。
- `components/layout/AppShell.tsx`、ワークスペースHome、`app/layout.tsx`：導線とCSS読み込み。
- `supabase/migrations/20261017105423_phase5_flow_map.sql`：上記DB定義。
- `tests/flow.test.mjs`、`flow-validation.test.mjs`：検索・権限・関連保存・段階取得・入力/表示上限。
- `tests/fixtures/supabase.mjs`、`tests/http-smoke.mjs`：隔離DBと実SDK/APIの統合テストを拡張。
- `package.json`、`package-lock.json`：固定したReact Flow依存。
- `README.md`、本書：現在の実装状況と適用手順。

## 検証結果

- `npm test`：62件成功（既存49件＋Flow関連13件）。日本語・複数語・記号検索、種類/Project/日付、完了済み、下書き、アーカイブ、関連保存/解除、履歴、版競合、取得上限とページングを検証。
- 同テストでViewer・別WS・未認証・匿名・特権ロール・脱退後の拒否、不可視ノードと線の非開示、直接書込み拒否を確認。
- `node tests/http-smoke.mjs`：ローカルNext.js/隔離DBで成功。Issue作成→Wiki関連→Flow検索→IDで結ばれたノード取得→詳細→元ページの表示、関連の解除/再保存、入力検証、CSRF、Viewer/別WSの拒否を確認。既存Phases 2〜4も回帰確認。
- `npm run lint`、`npm run typecheck`、`npm run build`：成功。
- DBテストはPGliteに全マイグレーションとpg_trgmを適用して実際のSQL/RLSを実行します。Storageカタログ・HTTP側はテスト用アダプターです。

操作可能なブラウザーが提供されていないため、ノードのクリック/ドラッグ/ズーム、キーボード操作、レスポンシブ表示の実機確認は未実施です。API・SSR・純粋関数テストと区別してください。実Supabaseへの接続確認、実データでのクエリ計画・負荷測定も未実施です。

## 手動設定とリリース順序

1. 承認された対象環境でPhase 2→3→4の適用状況、バックアップ、拡張作成権限を確認します。追加の環境変数・外部サービス・グラフDBは不要です。
2. 承認後、Phase 5の追加マイグレーションを一度だけ適用します。トランザクションで追加しますが、GINインデックス作成時は書込みロックと構築時間が発生するため、既存データ量に応じた適用時間帯を選んでください。
3. Data APIの`public`で新しいビュー/RPCが利用可能か確認します。`intelliflow_private`を公開しません。追加GRANTはSQLに含まれています。
4. Owner/Member/Viewerと別WSのテスト利用者を使い、上記の完了条件と下書き・脱退後の拒否を確認します。
5. PC/スマートフォン、ライト/ダーク、キーボードで検索→選択→展開→元ページ移動を確認します。マップ移動やズーム、関連保存失敗時の表示も確認します。
6. 対象環境の実データで`EXPLAIN (ANALYZE, BUFFERS)`を使い、WS・日付・日本語キーワード・多くの関連を持つノードの計画を確認してから、別途承認してデプロイします。

切戻しが必要な場合はアプリ側のFlow Map導線を止めます。新たに保存した関連・履歴・既存データは保持し、DBの削除や過去マイグレーションの書換えで戻さないでください。
