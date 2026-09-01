const steps = [
  { label: "1", title: "ノートを入力", description: "会議メモ、チャット、業務指示をそのまま記録します。" },
  { label: "2", title: "AIが整理", description: "要約、重要ポイント、決定事項、タスク候補を抽出します。" },
  { label: "3", title: "タスクを実行", description: "期限とともに整理されたタスクを確認し、次の行動につなげます。" },
];

export default function FlowPage() {
  return <main className="page-shell"><section className="section-block"><div className="section-heading"><p className="section-kicker">Flow View</p><h1>Flowビュー</h1><p>入力された情報がAI整理からタスク化されるまでの流れを確認できます。</p></div><div className="flow-grid">{steps.map((step) => <article className="flow-card" key={step.label}><span>{step.label}</span><h3>{step.title}</h3><p>{step.description}</p></article>)}</div></section></main>;
}
