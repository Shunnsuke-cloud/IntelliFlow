"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Button, Field, Modal } from '@/components/ui/controls';
import type { WorkspaceRole } from '@/lib/auth/policy';
import HandoffLinks from '@/features/handoffs/components/HandoffLinks';
import { canLink, defaultFilters, edgeLabels, flowHref, flowKinds, flowStatuses, MAX_EDGES, MAX_NODES, mergeGraph, type FlowBatch, type FlowFilters, type FlowNode } from '../types';
const FlowCanvas = dynamic(() => import('./FlowCanvas'), { ssr: false, loading: () => <p role="status">マップを準備しています…</p> });
const date = (value: string) => new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
export default function FlowExplorer({ workspaceId, role, initial, initialFilters }: { workspaceId: string; role: WorkspaceRole; initial: FlowBatch; initialFilters: FlowFilters }) {
  const [filters, setFilters] = useState(initialFilters); const [applied, setApplied] = useState(initialFilters); const [graph, setGraph] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null); const [detail, setDetail] = useState<FlowNode | null>(null);
  const [expanded, setExpanded] = useState<Record<string, { offset: number; more: boolean }>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [view, setView] = useState<'list' | 'map'>('list');
  const [desktop, setDesktop] = useState(false);
  const [projectQuery, setProjectQuery] = useState(''); const [projects, setProjects] = useState<FlowBatch | null>(null);
  const [projectOffset, setProjectOffset] = useState(0); const [projectName, setProjectName] = useState('');
  const [linking, setLinking] = useState(false); const [targetQuery, setTargetQuery] = useState(''); const [targets, setTargets] = useState<FlowBatch | null>(null); const [targetOffset, setTargetOffset] = useState(0);
  const [targetKind, setTargetKind] = useState('wiki');
  const selectionRequest = useRef(0); const currentSelected = useRef<string | null>(null);
  const root = `/api/workspaces/${workspaceId}/flow`;
  const selected = detail?.id === selectedId ? detail : graph.nodes.find(n => n.id === selectedId);
  const capped = graph.nodes.length >= MAX_NODES || graph.edges.length >= MAX_EDGES;
  async function get<T>(collection: string, values: Record<string, string | number | boolean>, signal?: AbortSignal): Promise<T> {
    const params = new URLSearchParams({ collection }); for (const [key, value] of Object.entries(values)) if (value !== '') params.set(key, String(value));
    const response = await fetch(`${root}?${params}`, { signal }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? '情報を取得できませんでした。'); return data as T;
  }
  // Clearing the graph on every workspace change is enforced by the page's key.
  useEffect(() => () => { selectionRequest.current++; currentSelected.current = null; }, []);
  useEffect(() => { const media = window.matchMedia('(min-width: 801px)'); const update = () => setDesktop(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  const select = useCallback(async (id: string) => {
    if (currentSelected.current === id) return;
    currentSelected.current = id; const request = ++selectionRequest.current; setSelectedId(id); setDetail(null); setError('');
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/flow?${new URLSearchParams({ collection: 'detail', id, archived: String(applied.archived) })}`); const data = await response.json();
      if (request !== selectionRequest.current) return;
      if (!response.ok) throw new Error(data.error ?? '詳細を取得できませんでした。'); setDetail(data as FlowNode);
    } catch (err) { if (request === selectionRequest.current) { currentSelected.current = null; setError(err instanceof Error ? err.message : '詳細を取得できませんでした。'); } }
  }, [workspaceId, applied.archived]);
  async function search(offset = 0, next = filters) {
    setBusy(true); setError('');
    try {
      const batch = await get<FlowBatch>('search', { ...next, offset }); setGraph(batch); setApplied(next); setExpanded({}); setSelectedId(null); setDetail(null); currentSelected.current = null; selectionRequest.current++;
      const params = new URLSearchParams(); for (const [key, value] of Object.entries(next)) if (value !== '' && value !== false) params.set(key, String(value)); if (offset) params.set('offset', String(offset));
      window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    } catch (err) { setError(err instanceof Error ? err.message : '検索できませんでした。'); } finally { setBusy(false); }
  }
  async function expand() {
    if (!selectedId || capped) return; const id = selectedId; setBusy(true); setError('');
    try { const batch = await get<FlowBatch>('neighbors', { id, archived: applied.archived, offset: expanded[id]?.offset ?? 0 }); setGraph(current => mergeGraph(current, batch)); setExpanded(current => ({ ...current, [id]: { offset: batch.offset + batch.limit, more: batch.has_more } })); }
    catch (err) { setError(err instanceof Error ? err.message : '関連情報を取得できませんでした。'); } finally { setBusy(false); }
  }
  async function findProjects(offset = 0) {
    setBusy(true); setError('');
    try { setProjects(await get<FlowBatch>('projects', { q: projectQuery, offset })); setProjectOffset(offset); }
    catch (err) { setError(err instanceof Error ? err.message : 'Projectを取得できませんでした。'); } finally { setBusy(false); }
  }
  async function findTargets(offset = 0) {
    setBusy(true); setError('');
    try { setTargets(await get<FlowBatch>('search', { q: targetQuery, offset, kind: targetKind })); setTargetOffset(offset); }
    catch (err) { setError(err instanceof Error ? err.message : '関連先を取得できませんでした。'); } finally { setBusy(false); }
  }
  async function relate(target: FlowNode, operation: 'link' | 'unlink') {
    if (!selected || busy) return; setBusy(true); setError('');
    try {
      const response = await fetch(root, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, source_id: selected.id, source_version: selected.version, target_id: target.id, target_version: target.version }) }); const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '関連付けを保存できませんでした。');
      setLinking(false); setTargets(null); await search(graph.offset, applied);
    } catch (err) { setError(err instanceof Error ? err.message : '関連付けを保存できませんでした。'); } finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); if (!busy) void search(); }
  const resultNodes = graph.result_ids.map(id => graph.nodes.find(n => n.id === id)).filter((node): node is FlowNode => !!node);
  const related = graph.edges.filter(e => e.source_id === selectedId || e.target_id === selectedId);
  return <>
    <header className="work-page-heading"><div><p className="if-kicker">FLOW MAP</p><h1>過去の情報から、次の手がかりへ。</h1><p>課題・資料・プロジェクト・引き継ぎを検索し、つながりをたどります。</p></div></header>
    <form className="flow-search" onSubmit={submit}><Field label="過去の情報を検索" name="q" type="search" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} maxLength={200} placeholder="例：イベント 問題（空白で複数語）" /><Button disabled={busy}>{busy ? '処理中…' : '検索する'}</Button>
      <div className="flow-filters"><label className="if-field"><span>情報の種類</span><select value={filters.kind} onChange={e => setFilters({ ...filters, kind: e.target.value })}><option value="">すべて</option>{Object.entries(flowKinds).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><Field label="更新日：開始" type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /><Field label="更新日：終了" type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /><label className="flow-checkbox"><input type="checkbox" checked={filters.archived} onChange={e => setFilters({ ...filters, archived: e.target.checked })} />削除済みも含める</label><Button type="button" disabled={busy} onClick={() => { setFilters(defaultFilters); setProjectName(''); void search(0, defaultFilters); }}>条件をリセット</Button></div>
      <details className="flow-project-filter"><summary>Projectで絞り込む：{filters.project ? projectName || '指定したProject' : '指定なし'}</summary><div className="flow-search"><Field label="Project名を探す" value={projectQuery} maxLength={200} onChange={e => setProjectQuery(e.target.value)} /><Button type="button" disabled={busy} onClick={() => findProjects()}>候補を探す</Button></div>{projects && <><div className="flow-options">{projects.nodes.map(p => <Button type="button" key={p.id} onClick={() => { setFilters({ ...filters, project: p.id }); setProjectName(p.title); }}>{p.title}</Button>)}</div>{!projects.nodes.length && <p>該当するProjectはありません。</p>}<div className="work-actions"><Button type="button" disabled={busy || !projectOffset} onClick={() => findProjects(projectOffset - 10)}>前へ</Button><Button type="button" disabled={busy || !projects.has_more} onClick={() => findProjects(projectOffset + 10)}>次へ</Button><Button type="button" onClick={() => { setFilters({ ...filters, project: '' }); setProjectName(''); }}>指定を外す</Button></div></>}</details>
    </form>
    {error && !linking && <p role="alert" className="if-error">{error}</p>}
    <p className="work-subtle" role="status">検索結果 {resultNodes.length}件{graph.has_more ? '（続きがあります）' : ''} · マップ {graph.nodes.length}件 / {MAX_NODES}件 · 線 {graph.edges.length}本 / {MAX_EDGES}本</p>
    <p className="work-subtle">タイトル・現在の本文を部分一致で検索します。日付は日本時間の更新日です。検索条件は検索結果に適用し、つながる情報は条件の外からも表示します。文章の意味を理解する検索はまだありません。</p>
    <div className="flow-view-toggle"><Button aria-pressed={view === 'list'} onClick={() => setView('list')}>検索結果一覧</Button><Button aria-pressed={view === 'map'} onClick={() => setView('map')}>マップを表示</Button></div>
    <div className={`flow-workbench flow-view-${view}`} aria-busy={busy}>
      <section className="flow-results" aria-label="検索結果"><h2>検索結果</h2>{resultNodes.length ? resultNodes.map(node => <button className={`flow-result flow-kind-${node.kind}`} key={node.id} aria-pressed={selectedId === node.id} onClick={() => select(node.id)}><span>{flowKinds[node.kind]}{node.archived_at && ' · 削除済み'}</span><strong>{node.title}</strong><p>{node.excerpt || '本文はありません'}</p><small>{date(node.updated_at)}</small></button>) : <div className="if-state"><h3>該当する情報はありません</h3><p>キーワードを短くするか、日付や種類の条件を変えてください。</p></div>}<div className="work-actions"><Button disabled={busy || !graph.offset} onClick={() => search(Math.max(0, graph.offset - 10), applied)}>前へ</Button><Button disabled={busy || !graph.has_more} onClick={() => search(graph.offset + 10, applied)}>次へ</Button></div></section>
      <section className="flow-map-section" aria-label="関連マップ"><div className="flow-legend">{Object.entries(flowKinds).map(([kind, label]) => <span key={kind} className={`flow-kind-${kind}`}>● {label}</span>)}<span>点線枠：検索結果</span></div>{graph.nodes.length ? (desktop || view === 'map') && <FlowCanvas graph={graph} selectedId={selectedId} onSelect={select} /> : <div className="if-state"><p>検索結果があるとマップが表示されます。</p></div>}<p className="work-subtle">ノードを移動・選択できます。拡大縮小と「全体を表示」で見やすく調整してください。配置の変更は保存されません。</p></section>
      <aside className="flow-detail" aria-label="選択した情報">{selected ? <><span className={`flow-kind-${selected.kind}`}>{flowKinds[selected.kind]} · {flowStatuses[selected.status] ?? '状態未設定'}</span><h2>{selected.title}</h2><p className="work-subtle">更新：{date(selected.updated_at)}{selected.archived_at && ' · 削除済み'}</p><p className="flow-excerpt">{selected.excerpt || '本文はありません'}</p><Link className="if-button" href={flowHref(workspaceId, selected)}>元の{flowKinds[selected.kind]}を開く →</Link><Button disabled={busy || capped || expanded[selected.id]?.more === false} onClick={expand}>{expanded[selected.id]?.more === false ? '関連情報をすべて取得しました' : '関連情報を追加でたどる'}</Button>{capped && <p role="status">表示上限に達しました。検索条件を絞ってください。</p>}
        <h3>表示中のつながり</h3>{related.length ? <ul className="flow-related">{related.map(edge => { const target = graph.nodes.find(n => n.id === (edge.source_id === selected.id ? edge.target_id : edge.source_id)); return target && <li key={edge.id}><small>{edgeLabels[edge.relation_type] ?? '関連'}</small><button onClick={() => select(target.id)}>{target.title}</button>{role !== 'viewer' && canLink(selected, target) && ['references', 'related_to'].includes(edge.relation_type) && <Button disabled={busy} onClick={() => relate(target, 'unlink')}>関連を外す</Button>}</li>; })}</ul> : <p>まだつながりが表示されていません。追加取得で確認できます。</p>}
        {selected.kind !== 'handoff' && <HandoffLinks key={selected.id} workspaceId={workspaceId} resourceId={selected.id} canCreate={role !== 'viewer' && !selected.archived_at && ['issue', 'project'].includes(selected.kind)} />}
        {role !== 'viewer' && selected.kind !== 'handoff' && !selected.archived_at && <Button disabled={busy} onClick={() => { setLinking(true); setError(''); setTargets(null); setTargetQuery(''); setTargetKind(selected.kind === 'wiki' ? 'issue' : 'wiki'); }}>情報を関連付ける</Button>}<p className="work-subtle">所属ProjectはIssueの編集画面、親ページはWikiの編集画面で変更できます。引き継ぎ資料はHandoffの編集画面で指定できます。</p>
      </> : <><h2>情報のつながりをたどる</h2><p>検索結果またはマップのノードを選ぶと、内容と元ページへのリンクが表示されます。</p></>}</aside>
    </div>
    {linking && selected && <Modal title="関連する情報を探す" onClose={() => { if (!busy) setLinking(false); }}><p>Issue同士、WikiとIssue・Projectを関連付けます。保存すると既存ページの履歴にも記録されます。</p><form onSubmit={e => { e.preventDefault(); if (!busy) void findTargets(); }}><label className="if-field"><span>関連先の種類</span><select disabled={busy} value={targetKind} onChange={e => { setTargetKind(e.target.value); setTargets(null); }}>{Object.entries(flowKinds).filter(([kind]) => kind !== 'handoff').filter(([kind]) => selected.kind === 'wiki' ? kind !== 'wiki' : selected.kind === 'issue' ? kind !== 'project' : kind === 'wiki').map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label><Field label="関連先のキーワード" type="search" value={targetQuery} maxLength={200} onChange={e => setTargetQuery(e.target.value)} /><Button disabled={busy}>探す</Button></form>{error && <p className="if-error" role="alert">{error}</p>}{targets && <><ul className="flow-targets">{targets.nodes.filter(node => targets.result_ids.includes(node.id)).map(target => <li key={target.id}><span>{flowKinds[target.kind]}：{target.title}</span><Button disabled={busy || !canLink(selected, target)} onClick={() => relate(target, 'link')}>関連付ける</Button></li>)}</ul>{!targets.result_ids.length && <p>該当する情報はありません。</p>}<div className="work-actions"><Button disabled={busy || !targetOffset} onClick={() => findTargets(targetOffset - 10)}>前へ</Button><Button disabled={busy || !targets.has_more} onClick={() => findTargets(targetOffset + 10)}>次へ</Button></div></>}</Modal>}
  </>;
}
