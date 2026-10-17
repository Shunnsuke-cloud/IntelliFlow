import Link from 'next/link';
import { workspaceList } from '@/lib/workspaces';
import { WorkspaceEditor } from '@/features/workspaces/components/WorkspaceForms';
import { State } from '@/components/ui/controls';
export default async function AppPage() {
  const { workspaces } = await workspaceList();
  return <><p className="if-kicker">YOUR WORKSPACES</p><h1>情報をつなぎ、次の人へ。</h1><p>個人の活動からチームの仕事まで。ワークスペースを選んで始めましょう。</p><WorkspaceEditor />{workspaces.length ? <div className="if-grid">{workspaces.map(w => <Link className="if-card" key={w.id} href={`/app/w/${w.id}`}><h2>{w.name}</h2><p>{w.description || '説明はまだありません。'}</p><span>ワークスペースを開く →</span></Link>)}</div> : <State title="最初のワークスペースを作成しましょう"><p>個人用は1人で利用できます。チーム用は作成後にメンバーを招待できます。</p></State>}</>;
}
