# IntelliFlow

本番公開に向けた最新の確認結果と、DB・認証設定・デプロイを個別承認する手順は [本番公開手順](docs/production-launch.md) を参照してください。

## Phase 8: 公開前検証・準備

主要機能の隔離DB・API・Chrome E2E検証、Gemini実接続、既存Supabase/Vercelの読み取り調査を実施しました。**現時点の判定は本番公開不可**です。本番AuthのURL、未適用マイグレーション、検証環境の分離、バックアップ復元確認が残っています。
修正ファイル・テスト結果・環境変数・公開/復旧手順は [Phase 8検証報告](docs/phase8.md) を参照してください。本番DB変更・設定変更・デプロイは行っていません。

## Phase 7: AIアシスタント・検索・引き継ぎ支援

Geminiによる権限付き検索と根拠リンク、Flow MapのAI質問、確認して反映するHandoff下書きを追加しました。AIはワークスペース/本人とも初期無効で、通常機能はAIなしで動作します。
変更ファイル・マイグレーション・利用回数・無料枠のデータ取り扱い・テスト・公開前の作業は [Phase 7ガイド](docs/phase7.md) を参照してください。本番DB適用・デプロイは未実施です。

## Phase 6: Handoff

Issue/Projectからの候補作成、手動の引き継ぎ編集・送信、受領・完了、版ごとのスナップショット・受領履歴、改訂後の再確認、Flow Map連携を追加しました。
変更ファイル・権限・DB追加定義・検証範囲は [Phase 6ガイド](docs/phase6.md) を参照してください。本番DBへの適用・デプロイは未実施です。Phase 6時点ではAI生成はありません。現在のAI支援は上記Phase 7を参照してください。

## Phase 5: Flow Map

過去のIssue・Project・Wikiの検索、種類/更新日/Projectの絞り込み、関連マップ、段階的な探索、元ページへの移動、関連付けの保存・解除を追加しました。
変更ファイル・権限・DB追加定義・検証結果は [Phase 5ガイド](docs/phase5.md) を参照してください。本番DBへの適用・デプロイは未実施です。Phase 5時点ではAIとHandoffの新規実装はありません。Handoffの現在の状態は上記Phase 6を参照してください。

## Phase 4: Wiki

文章エディタ、ページ階層、検索・カテゴリ、画像添付、更新履歴・過去版表示、Issues / ProjectsとのIDによる関連付けを追加しました。
変更ファイル・権限・DB / Storage設定・検証結果は [Phase 4ガイド](docs/phase4.md) を参照してください。本番DBへの適用・デプロイは未実施です。Phase 4時点ではFlow Map / Handoff / AIの新規実装はありません。Flow Mapの現在の状態は上記Phase 5を参照してください。

## Phase 3: Issues / Projects

Issue（課題）のCRUD・担当/期限/状態/ラベル・コメント・関連付け・検索・履歴と、ProjectsのCRUD・メンバー/日程・実課題に基づく進捗・一覧/カンバンを追加しました。
設定・権限・変更ファイル・マイグレーションは [Phase 3ガイド](docs/phase3.md) を参照してください。削除は復元可能なアーカイブです。本番DBへの適用・デプロイは未実施です。
Phase 3時点ではWiki / Flow Map / Handoff / AIの新規実装はありません。Wikiの現在の状態は上記Phase 4を参照してください。

## Phase 2: 認証・ワークスペース基盤

新しいコンセプトは **IntelliFlow — 情報をつなぎ、次の人へ。** です。
認証、個人/チーム用ワークスペース、招待と4段階の権限、共通UIを追加しました。
Phase 2時点ではIssues / Projects / Wiki / Flow Map / Handoffの業務機能は準備中です。現在の状態は上記Phase 3・4を参照してください。

**現在の設定・DB適用手順は [Phase 2実装・検証・設定ガイド](docs/phase2.md) を参照してください。**
下記の旧説明は試作時の記録です。特に旧002マイグレーションの再実行、公開スキーマへのバックアップコピー、所有者の一括割当、旧Gemini仕様はそのまま使用しないでください。本番DBへの適用・デプロイは個別の承認後に行います。

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

テストはNode.js 22.15以降を使用し、実DB・実ユーザー・外部AIへ接続しません。

---

以下は旧コンセプトと試作の説明です。

IntelliFlowは、中小企業や飲食店などの小規模事業者向けに、散在した業務情報をAIで整理・要約・構造化し、業務の流れ（Flow）を最適化する業務支援プラットフォームです。

会議メモ、チャット、業務指示などの非構造データをAIが自動で整理し、「やるべきこと」と「意思決定」を明確にすることで、業務効率化とDX推進を支援します。

## 開発背景

中小企業では、情報がLINE・メール・紙・Excelなどに分散しやすく、会議内容が記録されないままタスクが曖昧になることがよくあります。引き継ぎの属人化や、ITツールの複雑さによる定着不足も、業務改善を妨げる大きな要因です。

IntelliFlowは、こうした「情報はあるのに活用できない状態」をAIで解消し、情報を流れるように整理する仕組みを提供します。

## Supabase setup (recommended)

1. Rotate Service Role Key

- If you exposed the `SUPABASE_SERVICE_ROLE_KEY`, rotate it immediately in the Supabase Project Settings -> API -> Service Role Key.

2. Run SQL migration

- Open Supabase Console -> SQL Editor and run the migration file `supabase-migrations/001_create_notes_and_policies.sql`.

3. Environment

- Keep sensitive keys out of the repository. Store `SUPABASE_SERVICE_ROLE_KEY` locally only in `.env.local` (which is already gitignored).

## 解決する課題

### 課題1: 情報の分散

複数ツールに情報が散らばり、検索性が低い。

### 課題2: 会議内容の未活用

議事録が作られず、決定事項が曖昧になる。

解決: AIによる要約、タスク抽出、決定事項整理。

### 課題3: タスク管理の属人化

誰が何をやるか不明確になる。

解決: AIが責任者・期限付きでタスク化。

### 課題4: ITツールの複雑さ

高機能ツールが現場に定着しない。

解決: シンプルUIと自然言語入力中心設計。

## ターゲットユーザー

### メインターゲット

- 中小企業
- 小規模事業者
- 飲食店
- スタートアップチーム

### 想定ユーザー像

- 飲食店オーナー: 口頭指示が多く、メモ管理が苦手。シフトや在庫管理に課題がある。
- 中小企業管理者: 会議が多く、情報共有が分散しやすい。DXを進めたいが人材不足。
- 小規模チーム: SlackやLINE中心で運用しており、タスクが流れやすい。

## 主な機能

### 1. AIノート整理

入力された文章をAIが自動で構造化し、要約、重要ポイント、決定事項を整理します。

### 2. AIタスク生成

文章からタスクを自動抽出し、責任者や期限付きのタスクに変換します。

例: 「来週までに在庫確認とSNS投稿」

- 在庫確認（期限: 来週）
- SNS投稿（期限: 来週）

### 3. Flowビュー

情報を「流れ」として可視化し、インプット、処理、アウトプットの関係を直感的に把握できます。

### 4. AI検索

自然言語で過去データを検索できます。

例:

- 先週の会議内容
- SNSの方針

### 5. プロジェクト管理

- 店舗別
- チーム別
- 案件別

で情報を整理できます。

## サービスの特徴

- AIで業務を流れ化し、単なるメモ管理にとどめない
- 非IT企業でも使いやすい、直感的でシンプルなUI
- 自然言語や音声入力を中心にした操作設計
- 既存業務を大きく変えずに導入しやすい

## 技術スタック

| 分野 | 技術 |
| --- | --- |
| フロントエンド | Next.js / React |
| UI | Tailwind CSS |
| バックエンド | Firebase / Supabase |
| DB | Firestore / PostgreSQL |
| AI | Gemini API |
| 認証 | Google Authentication |
| デプロイ | Vercel |

## Vercel へのデプロイ

このリポジトリは Next.js なので、Vercel にそのままデプロイできます。新しいプロジェクトを別途作る必要はありません。GitHub 連携済みなら、Vercel 側でこのリポジトリを Import するだけです。

### 手順

1. Vercel Dashboard を開き、`Add New` -> `Project` を選びます。
2. GitHub 連携済みのこのリポジトリ `IntelliFlow` を Import します。
3. Framework は自動で `Next.js` になります。Build Command や Output Directory は基本的に自動設定のままで大丈
夫です。
4. 環境変数を Vercel の Project Settings -> Environment Variables に追加します。

### 必要な環境変数

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`

サーバー側で privileged な処理をする場合のみ追加:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_NOTES_TABLE`

### Supabase / Google OAuth の追加設定

Vercel の本番 URL が決まったら、Supabase Dashboard の Authentication -> URL Configuration で以下を追加してください。

- Site URL: `https://<your-vercel-project>.vercel.app`
- Redirect URLs: `https://<your-vercel-project>.vercel.app`
- Redirect URLs: `https://<your-vercel-project>.vercel.app/app`

Google OAuth を使う場合は、Google Cloud Console 側にも Supabase の callback を登録してください。

- `https://pocjzzekfupjqcwdfkan.supabase.co/auth/v1/callback`

### ローカル確認

デプロイ前にローカルで確認する場合は:

```bash
npm run build
npm run dev
```

### 補足

- Vercel にも `.env.local` は持ち込まれないので、必ず Project Settings で環境変数を登録してください。
- `NEXT_PUBLIC_*` はブラウザに公開されるため、公開してよい値だけを入れてください。
- Service Role Key は Vercel に入れる場合でも必要最小限の用途に限定してください。

## Backfill と NOT NULL 適用（本番手順）

`owner = auth.uid()` ベースの厳格な RLS を適用する前に、安全なバックフィルと確認を行ってください。

手順（要約）:

1. Supabase のバックアップまたはテーブルコピーを作成します。

```sql
create table if not exists public.notes_backup as table public.notes;
```

2. ステージングで `supabase-migrations/002_add_owner_and_strict_rls.sql` を適用して動作検証してください。

3. 本番で既存行を一括で管理者 UID にバックフィルするには、`scripts/backfill_owner.js` を使用します。

環境変数を設定し、まずはドライランで確認します:

```bash
SUPABASE_URL="https://your-project.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" \
ADMIN_UID="<ADMIN_UID_TO_ASSIGN>" \
node scripts/backfill_owner.js --dry-run
```

実行する場合（注意: --yes が必要）:

```bash
SUPABASE_URL="https://your-project.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" \
ADMIN_UID="<ADMIN_UID_TO_ASSIGN>" \
node scripts/backfill_owner.js --yes
```

NOT NULL に変更する場合は慎重に検証した上で `--set-not-null` を付けて実行するか、SQL エディタで直接実行してください。

注意:
- `scripts/backfill_owner.js` はサービスロールキーを使用します。キーは安全に管理してください。
- 本番適用前に必ずバックアップを取得し、保守時間内に実行してください。

Gemini (Generative Language) API 統合
-----------------------------------

サーバー側で Gemini（例: Google Generative Language API / text-bison-001）を呼び出すエンドポイントを用意しました。APIキーは環境変数 `GEMINI_API_KEY` に設定し、決してリポジトリにコミットしないでください。

使用方法（ローカル）:

1. `.env.local` に以下を追加（例）:

```
GEMINI_API_KEY="your_gemini_api_key_here"
```

2. サーバー側エンドポイントに POST でプロンプトを送信します（サーバー実装は `app/api/gemini/route.ts`）:

```bash
curl -X POST http://localhost:3000/api/gemini \
	-H "Content-Type: application/json" \
	-d '{"prompt":"今週やるべきタスクを3つ挙げて"}'
```

レスポンス例:

```json
{ "text": "1. ...\n2. ...\n3. ..." }
```

注意:
- APIキーはサーバー側でのみ使用してください。フロントエンドに直接公開しないでください。`app/api/gemini/route.ts` はサーバー経由のプロキシとして動作します。 
- 利用量や料金、APIの利用制限には注意してください。キーが漏れた場合は直ちにローテーションしてください。


