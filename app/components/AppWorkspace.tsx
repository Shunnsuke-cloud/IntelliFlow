import { IntelliFlowInputDemo } from "./IntelliFlowInputDemo";
import GeminiAction from "./GeminiAction";

const challengeItems = [
  {
    title: "情報の分散",
    description: "LINE、メール、紙、Excelに情報が散らばり、必要な情報をすぐに見つけられない。",
  },
  {
    title: "会議内容の未活用",
    description: "議事録が残らず、決定事項や次のアクションが曖昧になりやすい。",
  },
  {
    title: "タスク管理の属人化",
    description: "誰が何をやるのかが見えにくく、引き継ぎが不安定になる。",
  },
  {
    title: "ITツールの複雑さ",
    description: "高機能なツールほど現場で使い切れず、定着しない。",
  },
];

const featureItems = [
  {
    number: "01",
    title: "AIノート整理",
    description: "文章をAIが自動で構造化し、要約、重要ポイント、決定事項を整理します。",
  },
  {
    number: "02",
    title: "AIタスク生成",
    description: "文章からタスクを抽出し、責任者や期限付きの実行単位に変換します。",
  },
  {
    number: "03",
    title: "Flowビュー",
    description: "メモから処理、タスク化までの流れを可視化し、業務の動きを把握しやすくします。",
  },
  {
    number: "04",
    title: "AI検索",
    description: "自然言語で過去データを検索し、必要な情報にすばやくたどり着けます。",
  },
];

const stackItems = [
  ["フロントエンド", "Next.js / React"],
  ["UI", "CSS Modules / カスタムCSS"],
  ["バックエンド", "Firebase / Supabase"],
  ["DB", "Firestore / PostgreSQL"],
  ["AI", "Gemini API"],
  ["認証", "Google Authentication"],
  ["デプロイ", "Vercel"],
];

const flowSteps = [
  {
    label: "入力",
    title: "来週までに在庫確認とSNS投稿",
    description: "会議メモや口頭指示をそのまま入力します。",
  },
  {
    label: "AI処理",
    title: "要約・タスク抽出・責任分担",
    description: "文章を整理し、実行単位へ変換します。",
  },
  {
    label: "出力",
    title: "在庫確認 / SNS投稿",
    description: "期限付きのタスクとしてそのまま動かせます。",
  },
];

export default function AppWorkspace() {
  return (
    <div className="page-shell app-workspace" id="top">
      <section className="workspace-hero section-card strong-card">
        <div className="workspace-hero-copy">
          <p className="section-kicker">Workspace</p>
          <h1>AIが整理してくれる、業務の入口。</h1>
          <p className="workspace-lead">
            メモを貼るだけで、要約・タスク・会議内容がひと目で整理される。NotionやLinearのように、
            シンプルで業務に集中できる画面を目指しています。
          </p>
          <div className="workspace-pills" aria-label="主な操作">
            <span>要約</span>
            <span>タスク</span>
            <span>会議内容</span>
            <span>保存</span>
          </div>
        </div>

        <div className="workspace-stats">
          <article>
            <span>AI整理</span>
            <strong>入力をそのまま構造化</strong>
          </article>
          <article>
            <span>タスク化</span>
            <strong>実行単位まで変換</strong>
          </article>
          <article>
            <span>検索</span>
            <strong>あとからすぐ見つかる</strong>
          </article>
        </div>
      </section>

      <section className="section-block" id="demo">
        <div className="section-heading">
          <p className="section-kicker">AI入力</p>
          <h2>入力欄を大きくして、AIが整理してくれる。</h2>
        </div>
        <div className="flow-grid">
          {flowSteps.map((step) => (
            <article className="flow-card" key={step.label}>
              <span>{step.label}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <IntelliFlowInputDemo />

      <section className="section-block ai-callout" style={{ padding: "24px" }}>
        <div className="section-heading">
          <p className="section-kicker">AI補助</p>
          <h2>必要なときだけ、Gemini に補足を頼む。</h2>
        </div>

        <div style={{ maxWidth: 760 }}>
          <GeminiAction initialPrompt="会議メモから実行可能なタスクを3つ抽出してください。各タスクに簡単な期限案を付けてください。" />
        </div>
      </section>

      <section className="section-block" id="features">
        <div className="section-heading">
          <p className="section-kicker">主な機能</p>
          <h2>メモを、動く業務に変換する。</h2>
        </div>
        <div className="feature-grid">
          {featureItems.map((item) => (
            <article className="feature-card" key={item.number}>
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block split-block">
        <article className="section-card strong-card">
          <p className="section-kicker">サービスの特徴</p>
          <h2>複雑さを減らし、現場で使える形へ。</h2>
          <ul className="bullet-list">
            <li>AIで業務を流れ化し、単なるメモ管理にとどめない</li>
            <li>非IT企業でも使いやすい、直感的でシンプルなUI</li>
            <li>自然言語や音声入力を中心にした操作設計</li>
            <li>既存業務を大きく変えずに導入しやすい</li>
          </ul>
        </article>

        <article className="section-card strong-card" id="stack">
          <p className="section-kicker">技術スタック</p>
          <h2>今後の実装方針</h2>
          <div className="stack-list">
            {stackItems.map(([label, value]) => (
              <div className="stack-row" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="section-block" id="roadmap">
        <div className="section-heading">
          <p className="section-kicker">今後の展開</p>
          <h2>まずは、現場で使える最小構成から。</h2>
        </div>
        <div className="roadmap-grid">
          <article className="roadmap-card">
            <span>Phase 1</span>
            <h3>MVP</h3>
            <p>ノート整理、タスク抽出、検索の基本フローを確実に使える状態にします。</p>
          </article>
          <article className="roadmap-card">
            <span>Phase 2</span>
            <h3>運用定着</h3>
            <p>店舗別・チーム別の整理、共有導線、通知連携を加えて日常運用に馴染ませます。</p>
          </article>
          <article className="roadmap-card">
            <span>Phase 3</span>
            <h3>AI拡張</h3>
            <p>音声入力、より高度な要約、意思決定支援まで広げていきます。</p>
          </article>
        </div>
      </section>

      <footer className="footer">
        <div>
          <p className="eyebrow">Next Step</p>
          <h2>PoCに向けた実装を進める準備ができています。</h2>
        </div>
      </footer>
    </div>
  );
}
