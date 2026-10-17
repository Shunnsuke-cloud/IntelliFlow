import Link from 'next/link';
import { workspaceDetail } from '@/lib/workspaces';
export default async function Home({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspace, role } = await workspaceDetail((await params).workspaceId);
  return <><p className="if-kicker">HOME</p><h1>{workspace.name}</h1><p>{workspace.description || 'このワークスペースの説明はまだありません。'}</p><span className="if-badge">あなたの権限: {role}</span>
    <div className="if-grid"><Link className="if-card" href={`/app/w/${workspace.id}/issues`}><p className="if-kicker">ISSUES</p><h2>Issue（課題）を整理する</h2><p>担当・期限・進捗を共有し、次の行動を明確にしましょう。</p><span>課題を開く →</span></Link><Link className="if-card" href={`/app/w/${workspace.id}/projects`}><p className="if-kicker">PROJECTS</p><h2>プロジェクトを進める</h2><p>課題をまとめ、チームの活動と進捗を見渡しましょう。</p><span>プロジェクトを開く →</span></Link></div>
    <div className="if-card"><h2>ワークスペースの管理</h2><p>設定から説明の編集・メンバー招待・権限管理ができます。</p><Link href={`/app/w/${workspace.id}/settings`}>設定を開く →</Link></div>
    <Link className="if-card wiki-home-link" href={`/app/w/${workspace.id}/wiki`}><p className="if-kicker">WIKI</p><h2>資料・手順を共有する</h2><p>マニュアル・議事録・ノウハウを残し、課題やプロジェクトにつなげましょう。</p><span>Wikiを開く →</span></Link>
    <Link className="if-card wiki-home-link" href={`/app/w/${workspace.id}/flow`}><p className="if-kicker">FLOW MAP</p><h2>過去の情報とつながりを探す</h2><p>以前の課題や資料を検索し、関連情報をたどりましょう。</p><span>Flow Mapを開く →</span></Link>
    <Link className="if-card wiki-home-link" href={`/app/w/${workspace.id}/handoffs`}><p className="if-kicker">HANDOFF</p><h2>状況と経緯を、次の担当者へ。</h2><p>課題・資料をまとめて渡し、受領と内容の版を記録します。</p><span>引き継ぎを開く →</span></Link>
  </>;
}
