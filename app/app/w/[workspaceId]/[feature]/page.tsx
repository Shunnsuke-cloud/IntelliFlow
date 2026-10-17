import { notFound } from 'next/navigation';
import { workspaceDetail } from '@/lib/workspaces';
import { State } from '@/components/ui/controls';
const names: Record<string, string> = { issues: 'Issues — 課題', projects: 'Projects — プロジェクト', wiki: 'Wiki — 資料・手順', flow: 'Flow Map — 関連マップ', handoffs: 'Handoff — 引き継ぎ' };
export default async function Preparing({ params }: { params: Promise<{ workspaceId: string; feature: string }> }) {
  const { workspaceId, feature } = await params; await workspaceDetail(workspaceId);
  if (!names[feature]) notFound();
  return <><h1>{names[feature]}</h1><State title="準備中です"><p>この機能はまだ利用できません。今後のフェーズで追加します。</p></State></>;
}
