"use client";
import { useId, useState, type CSSProperties, type PointerEvent } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
export const features = [
  { id: 'issues', name: 'Issues', jp: '課題を、次の行動に。', label: '課題・タスク管理', icon: '◉', color: '#4277aa', title: 'イベント準備の進捗が分からない', text: '担当者、期限、進捗をひと目で。解決までの経緯も、関連する知識も、ひとつの課題からたどれます。' },
  { id: 'projects', name: 'Projects', jp: 'チームの今を、見渡す。', label: 'プロジェクト管理', icon: '▤', color: '#8b6b39', title: '秋の交流イベント', text: '課題をプロジェクトにまとめて、進み具合を共有。一覧とカンバンで、チームが次に取り組むことを見つけます。' },
  { id: 'wiki', name: 'Wiki', jp: '経験を、みんなの知識に。', label: '知識・マニュアル共有', icon: '▧', color: '#8070a7', title: 'イベント運営マニュアル', text: 'マニュアルも議事録も、書きやすく、探しやすく。課題やプロジェクトとつなげて、知識を使える場所に残します。' },
  { id: 'flow', name: 'Flow Map', jp: 'つながりから、答えを探す。', label: '情報の関連性を可視化', icon: '⌘', color: '#24695d', title: '準備の背景をたどる', text: '過去の課題、資料、引き継ぎをつながりで探索。「なぜこうなった？」を、情報の関係から理解できます。' },
  { id: 'handoff', name: 'Handoff', jp: '次の人が、迷わない。', label: '作業と知識の引き継ぎ', icon: '↗', color: '#ae623e', title: '次の担当者への引き継ぎ', text: '現在の状況、残った作業、注意点を関連資料と一緒に。引き継いだ時点の記録と受領確認まで、ひとつにまとめます。' },
  { id: 'ai', name: 'Gemini AI', jp: '探す・まとめるを、お手伝い。', label: '検索・下書き支援', icon: '✧', color: '#5d729b', title: '必要な情報を、根拠とともに', text: '登録された情報をもとに検索や引き継ぎの下書きを支援。根拠を確かめて、人が判断する。AIを使わずに基本機能も利用できます。' },
] as const;
export type FeatureId = typeof features[number]['id'];
const positions: Record<FeatureId, [number, number]> = { projects: [24, 16], issues: [18, 48], wiki: [76, 25], flow: [54, 52], handoff: [74, 80], ai: [25, 85] };
const edges: [FeatureId, FeatureId][] = [['projects', 'issues'], ['projects', 'wiki'], ['issues', 'wiki'], ['issues', 'flow'], ['wiki', 'flow'], ['flow', 'handoff'], ['ai', 'flow'], ['issues', 'handoff']];
export default function FlowGraph({ compact = false, selected: controlled, onSelect }: { compact?: boolean; selected?: FeatureId; onSelect?: (id: FeatureId) => void }) {
  const [local, setLocal] = useState<FeatureId>('issues'); const selected = controlled ?? local;
  const reduce = useReducedMotion(); const x = useMotionValue(0); const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 90, damping: 25 }); const sy = useSpring(y, { stiffness: 90, damping: 25 }); const id = useId();
  function move(e: PointerEvent<HTMLDivElement>) {
    if (compact || reduce || e.pointerType !== 'mouse') return;
    const box = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - box.left - box.width / 2) * .018); y.set((e.clientY - box.top - box.height / 2) * .018);
  }
  const feature = features.find(f => f.id === selected)!;
  return <div className={`m-graph ${compact ? 'm-graph-compact' : ''}`} onPointerMove={move} onPointerLeave={() => { x.set(0); y.set(0); }}>
    <div className="m-graph-bar"><span><i /> CONNECTION VIEW</span><span>機能デモ</span></div>
    <motion.div className="m-graph-canvas" style={{ x: sx, y: sy }}><div className="m-graph-orbit" aria-hidden="true" />
      <svg className="m-graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id={id}><stop stopColor="#75ac9b"/><stop offset="1" stopColor="#b7a37f"/></linearGradient></defs>{edges.map(([a, b]) => <g key={a + b} className={a === selected || b === selected || selected === 'flow' ? 'is-connected' : ''}><path d={`M${positions[a][0]} ${positions[a][1]} Q${positions[a][0]} ${positions[b][1]} ${positions[b][0]} ${positions[b][1]}`} stroke={`url(#${id})`} /><path className="m-edge-pulse" d={`M${positions[a][0]} ${positions[a][1]} Q${positions[a][0]} ${positions[b][1]} ${positions[b][0]} ${positions[b][1]}`} /></g>)}</svg>
      {features.map(f => { const linked = f.id === selected || edges.some(([a, b]) => (a === selected && b === f.id) || (b === selected && a === f.id));
        return <button key={f.id} type="button" className={`m-node m-node-${f.id} ${selected === f.id ? 'is-selected' : ''} ${linked ? 'is-linked' : ''}`} style={{ left: `${positions[f.id][0]}%`, top: `${positions[f.id][1]}%`, '--node-color': f.color } as CSSProperties} aria-pressed={selected === f.id} aria-label={`${f.name}のつながりを見る`} onClick={() => { setLocal(f.id); onSelect?.(f.id); }}><span className="m-node-icon" aria-hidden="true">{f.icon}</span><span><strong>{f.name}</strong><small>{f.id === 'flow' ? '情報のつながり' : f.label}</small></span><span className="m-node-dot" aria-hidden="true"/></button>;
      })}</motion.div>
    <div className="m-graph-caption" aria-live="polite"><span style={{ color: feature.color }}>{feature.icon} {feature.name}</span><strong>{feature.title}</strong><small>ノードをクリックして、つながりをたどる</small></div>
    {!compact && <p className="m-demo-note">架空のイベント運営を使ったデモです。実際の登録情報ではありません。</p>}
  </div>;
}
