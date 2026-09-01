import Link from "next/link";

const shortcuts = [
  { href: "/app/notes", label: "AIノート整理", description: "メモを要約・重要ポイント・決定事項に整理します。", number: "01" },
  { href: "/app/tasks", label: "AIタスク生成", description: "保存済みノートから実行タスクを確認します。", number: "02" },
  { href: "/app/flow", label: "Flowビュー", description: "入力からタスク化までの流れを可視化します。", number: "03" },
  { href: "/app/search", label: "AI検索", description: "保存したノートをキーワードで探します。", number: "04" },
];

export default function AppWorkspace() {
  return (
    <div className="page-shell app-workspace" id="top">
      <section className="workspace-hero section-card strong-card">
        <div className="workspace-hero-copy">
          <p className="section-kicker">Dashboard</p>
          <h1>今日の業務を、AIとひとつの流れに。</h1>
          <p className="workspace-lead">ノートの整理、タスクの確認、過去情報の検索を、それぞれの目的に合った画面から始められます。</p>
          <div className="workspace-pills" aria-label="主な操作"><span>ノート</span><span>タスク</span><span>Flow</span><span>検索</span></div>
        </div>
        <div className="workspace-stats">
          <article><span>AIノート</span><strong>入力をそのまま構造化</strong></article>
          <article><span>タスク</span><strong>実行単位に変換</strong></article>
          <article><span>検索</span><strong>必要な情報へすぐ到達</strong></article>
        </div>
      </section>
      <section className="section-block">
        <div className="section-heading"><p className="section-kicker">Shortcuts</p><h2>機能を選んで始める</h2></div>
        <div className="feature-grid">
          {shortcuts.map((item) => <Link className="feature-card" href={item.href} key={item.href}><span>{item.number}</span><h3>{item.label}</h3><p>{item.description}</p></Link>)}
        </div>
      </section>
    </div>
  );
}
