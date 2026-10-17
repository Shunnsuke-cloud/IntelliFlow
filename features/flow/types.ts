export const flowKinds = { issue: 'Issue（課題）', project: 'Project', wiki: 'Wiki', handoff: 'Handoff（引き継ぎ）' } as const;
export type FlowKind = keyof typeof flowKinds;
export type FlowNode = {
  id: string; workspace_id: string; kind: FlowKind; title: string; excerpt: string;
  status: string; issue_number: number | null; version: number; created_at: string; updated_at: string; archived_at: string | null;
};
export type FlowEdge = { id: string; workspace_id: string; source_id: string; target_id: string; relation_type: string };
export type FlowBatch = { nodes: FlowNode[]; edges: FlowEdge[]; result_ids: string[]; has_more: boolean; offset: number; limit: number };
export type FlowFilters = { q: string; kind: string; project: string; from: string; to: string; archived: boolean };
export const defaultFilters: FlowFilters = { q: '', kind: '', project: '', from: '', to: '', archived: false };
export const edgeLabels: Record<string, string> = { references: '参照・関連資料', related_to: '関連する課題', belongs_to: 'Projectに所属', child_of: '親ページ', blocks: '妨げている', follows: '続く', hands_over: '引き継ぎに含まれる' };
export const flowStatuses: Record<string, string> = { open: '未着手', in_progress: '進行中', review: '確認待ち', done: '完了', blocked: '保留（旧データ）', planned: '計画中', active: '進行中', completed: '完了', draft: '下書き', published: '共有中', sent: '確認待ち', accepted: '受領済み', cancelled: '取消済み' };
export function flowHref(workspaceId: string, node: Pick<FlowNode, 'kind' | 'id'>) {
  return `/app/w/${workspaceId}/${node.kind === 'issue' ? 'issues' : node.kind === 'project' ? 'projects' : node.kind === 'handoff' ? 'handoffs' : 'wiki'}/${node.id}`;
}
export function canLink(a: FlowNode, b: FlowNode) {
  return a.kind !== 'handoff' && b.kind !== 'handoff' && a.id !== b.id && !a.archived_at && !b.archived_at && ((a.kind === 'issue' && b.kind === 'issue') || (a.kind === 'wiki' && b.kind !== 'wiki') || (b.kind === 'wiki' && a.kind !== 'wiki'));
}
export const MAX_NODES = 120;
export const MAX_EDGES = 240;
export function mergeGraph(current: FlowBatch, incoming: FlowBatch): FlowBatch {
  const nodes = new Map(current.nodes.map(n => [n.id, n]));
  for (const node of incoming.nodes) { if (nodes.has(node.id) || nodes.size < MAX_NODES) nodes.set(node.id, node); }
  const edges = new Map(current.edges.map(e => [e.id, e]));
  for (const edge of incoming.edges) if (nodes.has(edge.source_id) && nodes.has(edge.target_id) && (edges.has(edge.id) || edges.size < MAX_EDGES)) edges.set(edge.id, edge);
  return { ...current, nodes: [...nodes.values()], edges: [...edges.values()] };
}
