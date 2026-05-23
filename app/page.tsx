import { IntelliFlowInputDemo } from "./components/IntelliFlowInputDemo";

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

export default function Home() {
  return (
    <main className="page-shell" id="top">
      <header className="topbar">
        <div>
          <p className="eyebrow">IntelliFlow</p>
          <p className="topbar-note">AIで業務の流れを整える小規模事業者向けプラットフォーム</p>
        </div>
        <nav className="topnav" aria-label="ページ内ナビゲーション">
          <a href="#demo">使い方</a>
          <a href="#challenges">課題</a>
          <a href="#features">機能</a>
          <a href="#stack">技術</a>
          <a href="#roadmap">今後</a>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">業務支援プラットフォーム</p>
          <h1>情報を、業務の流れに変える。</h1>
          <p className="lead">
            IntelliFlowは、会議メモ、チャット、業務指示などの非構造データをAIで整理し、
            「やるべきこと」と「意思決定」を明確にする小規模事業者向けの業務支援サービスです。
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#features">
              主な機能を見る
            </a>
            <a className="secondary-button" href="#stack">
              技術スタック
            </a>
          </div>
          <dl className="metrics" aria-label="サービスの特徴">
            <div>
              <dt>対象</dt>
              <dd>中小企業・飲食店・小規模チーム</dd>
            </div>
            <div>
              <dt>入力</dt>
              <dd>文章・メモ・自然言語</dd>
            </div>
            <div>
              <dt>出力</dt>
              <dd>要約・タスク・決定事項</dd>
            </div>
          </dl>
        </div>

        <aside className="hero-panel" aria-label="IntelliFlowの流れの概念図">
          <div className="panel-card accent">
            <span>Input</span>
            <strong>メモ / チャット / 指示</strong>
          </div>
          <div className="flow-arrow">↓</div>
          <div className="panel-card">
            <span>AI Processing</span>
            <strong>要約 / 構造化 / 分類</strong>
          </div>
          <div className="flow-arrow">↓</div>
          <div className="panel-card highlight">
            <span>Output</span>
            <strong>タスク / 決定事項 / 検索</strong>
          </div>
        </aside>
      </section>

      <section className="content-grid">
        <article className="section-card">
          <p className="section-kicker">開発背景</p>
          <h2>情報はあるのに、活用できない。</h2>
          <p>
            中小企業では、情報が複数のツールに分散し、会議内容が記録されないままタスクが曖昧になりがちです。
            IntelliFlowは、こうした状態をAIで解消し、情報を流れるように整理する仕組みを提供します。
          </p>
        </article>

        <article className="section-card">
          <p className="section-kicker">ターゲット</p>
          <h2>現場に定着する、自然な使い方。</h2>
          <ul className="bullet-list">
            <li>飲食店オーナー: 口頭指示が多く、メモ管理が苦手</li>
            <li>中小企業管理者: 会議が多く、情報共有が分散しやすい</li>
            <li>小規模チーム: SlackやLINE中心でタスクが流れやすい</li>
          </ul>
        </article>
      </section>

      <section className="section-block" id="challenges">
        <div className="section-heading">
          <p className="section-kicker">解決する課題</p>
          <h2>業務のボトルネックを、AIでほどく。</h2>
        </div>
        <div className="card-grid">
          {challengeItems.map((item) => (
            <article className="info-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block" id="demo">
        <div className="section-heading">
          <p className="section-kicker">使い方</p>
          <h2>入力した文章が、そのまま業務に変わる。</h2>
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
        <a className="primary-button" href="#top">
          トップへ戻る
        </a>
      </footer>
    </main>
  );
}
