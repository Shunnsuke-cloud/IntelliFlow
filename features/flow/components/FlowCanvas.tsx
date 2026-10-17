"use client";
import { useCallback, useEffect, useMemo } from 'react';
import { ReactFlow, Background, Controls, useNodesState, type Node, type Edge, type OnNodesChange } from '@xyflow/react';
import type { FlowBatch } from '../types';
import { edgeLabels, flowKinds } from '../types';

function layoutNodes(graph: FlowBatch, current: Node[] = []): Node[] {
  const prior = new Map(current.map(node => [node.id, node]));
  return graph.nodes.map((node, index) => ({
    id: node.id, position: prior.get(node.id)?.position ?? { x: graph.result_ids.includes(node.id) ? 40 : 390 + Math.floor(index / 8) * 330, y: graph.result_ids.includes(node.id) ? graph.result_ids.indexOf(node.id) * 145 : (index % 8) * 145 + 45 },
    data: { label: <div className="flow-node-label" title={node.title}><small>{flowKinds[node.kind]}{node.issue_number && ` · ISSUE-${String(node.issue_number).padStart(3, '0')}`}</small><strong>{node.title}</strong>{node.archived_at && <small>削除済み</small>}</div> },
    className: `flow-node flow-node-${node.kind}`, ariaLabel: `${flowKinds[node.kind]}：${node.title}`, style: { width: 250 },
  }));
}
export default function FlowCanvas({ graph, selectedId, onSelect, highlightIds }: { graph: FlowBatch; selectedId: string | null; onSelect: (id: string) => void; highlightIds: string[] }) {
  const [layout, setLayout, onNodesChange] = useNodesState<Node>(layoutNodes(graph));
  useEffect(() => {
    setLayout(current => layoutNodes(graph, current));
  }, [graph, setLayout]);
  const neighbors = useMemo(() => new Set(graph.edges.filter(e => e.source_id === selectedId || e.target_id === selectedId).flatMap(e => [e.source_id, e.target_id])), [graph.edges, selectedId]);
  const nodes = useMemo(() => layout.map(node => ({ ...node, selected: node.id === selectedId, className: node.className + (graph.result_ids.includes(node.id) ? ' is-result' : '') + (highlightIds.includes(node.id) ? ' ai-highlight' : selectedId && node.id !== selectedId && !neighbors.has(node.id) ? ' is-dimmed' : '') })), [layout, graph.result_ids, selectedId, neighbors, highlightIds]);
  const edges: Edge[] = useMemo(() => graph.edges.map(edge => ({ id: edge.id, source: edge.source_id, target: edge.target_id, label: edgeLabels[edge.relation_type] ?? '関連', type: 'smoothstep', style: { stroke: edge.source_id === selectedId || edge.target_id === selectedId ? 'var(--if-accent)' : 'var(--if-muted)', strokeWidth: edge.source_id === selectedId || edge.target_id === selectedId ? 2.5 : 1, opacity: selectedId && edge.source_id !== selectedId && edge.target_id !== selectedId ? 0.25 : 1 }, labelStyle: { fill: 'var(--if-text)', fontSize: 10 }, labelBgStyle: { fill: 'var(--if-surface)' } })), [graph.edges, selectedId]);
  const click = useCallback((_: React.MouseEvent, node: Node) => onSelect(node.id), [onSelect]);
  const change: OnNodesChange = useCallback(changes => { onNodesChange(changes); for (const change of changes) if (change.type === 'select' && change.selected && change.id !== selectedId) onSelect(change.id); }, [onNodesChange, selectedId, onSelect]);
  return <div className="flow-canvas" aria-label="情報の関連マップ"><ReactFlow nodes={nodes} edges={edges} onNodesChange={change} onNodeClick={click} nodesConnectable={false} edgesReconnectable={false} edgesFocusable={false} deleteKeyCode={null} minZoom={0.15} maxZoom={2} fitView fitViewOptions={{ maxZoom: 0.8, padding: 0.2 }} onlyRenderVisibleElements ariaLabelConfig={{ 'node.a11yDescription.default': 'Enterまたは空白で選択、矢印キーで移動、Escapeで選択を解除します。', 'controls.ariaLabel': 'マップの操作', 'controls.zoomIn.ariaLabel': '拡大', 'controls.zoomOut.ariaLabel': '縮小', 'controls.fitView.ariaLabel': '全体を表示', 'controls.interactive.ariaLabel': '移動操作の切り替え' }}><Background gap={24} /><Controls showInteractive={false} /></ReactFlow></div>;
}
