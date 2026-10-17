import Link from 'next/link';
import { workspaceDetail } from '@/lib/workspaces';
export default async function Home({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspace, role } = await workspaceDetail((await params).workspaceId);
  return <><p className="if-kicker">HOME</p><h1>{workspace.name}</h1><p>{workspace.description || 'このワークスペースの説明はまだありません。'}</p><span className="if-badge">あなたの権限: {role}</span>
    <div className="if-grid"><Link className="if-card" href={`/app/w/${workspace.id}/issues`}><p className="if-kicker">ISSUES</p><h2>Issue（課題）を整理する</h2><p>担当・期限・進捗を共有し、次の行動を明確にしましょう。</p><span>課題を開く →</span></Link><Link className="if-card" href={`/app/w/${workspace.id}/projects`}><p className="if-kicker">PROJECTS</p><h2>プロジェクトを進める</h2><p>課題をまとめ、チームの活動と進捗を見渡しましょう。</p><span>プロジェクトを開く →</span></Link></div>
    <div className="if-card"><h2>ワークスペースの管理</h2><p>設定から説明の編集・メンバー招待・権限管理ができます。</p><Link href={`/app/w/${workspace.id}/settings`}>設定を開く →</Link></div>
    <div className="if-grid">{['Wiki — 資料・手順', 'Flow Map — 関連マップ', 'Handoff — 引き継ぎ'].map(name => <section className="if-card" key={name}><span className="if-badge">準備中</span><h2>{name}</h2><p>今後のフェーズで追加します。</p></section>)}</div>
  </>;
}
