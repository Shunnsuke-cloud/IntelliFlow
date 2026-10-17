"use client";
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/controls';
import type { FlowNode } from '@/features/flow/types';
import { contentFields, type HandoffContent } from '@/features/handoffs/types';
import type { AIResult } from '../types';
import { AIConsent, AIDisclosure, AISources, AISettings, aiPost } from './AIControls';
export default function HandoffAIDraft({ workspaceId, related, onApply, disabled = false }: { workspaceId: string; related: FlowNode[]; onApply: (content: HandoffContent, sources: FlowNode[]) => void; disabled?: boolean }) {
  const [selected, setSelected] = useState<string[]>([]); const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [result, setResult] = useState<AIResult | null>(null); const [settings, setSettings] = useState(false);
  const sending = useRef(false); const chosen = selected.filter(id => related.some(r => r.id === id));
  const [applyConfirmed, setApplyConfirmed] = useState(false);
  async function generate() {
    if (sending.current || !consent || !chosen.length) return; sending.current = true; setBusy(true); setError(''); setResult(null); setApplyConfirmed(false);
    try { setResult(await aiPost(workspaceId, { operation: 'generate', feature: 'handoff', question: '選択した資料から引き継ぎの下書きを作成してください。概要、進捗、完了済み、未完了、注意事項、次の行動と要確認事項を整理してください。担当者・期限が不明なら未確認としてください。', source_ids: chosen, request_id: crypto.randomUUID(), consent })); }
    catch (e) { setError(e instanceof Error ? e.message : '下書きを生成できませんでした。'); } finally { setBusy(false); sending.current = false; }
  }
  return <section className="ai-draft-controls" aria-label="引き継ぎのAI支援"><h2>AIで下書きを作成</h2><p>参照する資料を最大8件選んでください。直接つながる資料も上限内で参照します。生成後にプレビューを確認し、フォームへ反映できます。担当者や期限は元の資料で確認してください。</p>
    {related.length ? related.map(r => <label className="ai-consent" key={r.id}><input type="checkbox" checked={chosen.includes(r.id)} disabled={busy || disabled || (!chosen.includes(r.id) && chosen.length >= 8)} onChange={e => { setResult(null); setSelected(old => e.target.checked ? [...old, r.id] : old.filter(id => id !== r.id)); }} />{r.title}</label>) : <p>先に関連Issue・Project・Wikiを追加してください。</p>}
    <AIDisclosure /><AIConsent checked={consent} onChange={setConsent} /><div className="work-actions"><Button type="button" disabled={busy || disabled || !consent || !chosen.length} onClick={generate}>{busy ? 'AIが下書きを作成中…' : '選択した資料からAIで下書きを作成'}</Button><Button type="button" aria-expanded={settings} onClick={() => setSettings(v => !v)}>自分のAI利用設定</Button></div>{settings && <AISettings workspaceId={workspaceId} />}
    {error && <p className="if-error" role="alert">{error}</p>}{result && <div className="ai-draft-preview"><h3>AIの提案 · まだ保存されていません</h3><p>{result.answer}</p>{result.draft && <>{Object.entries(contentFields).map(([key, label]) => <section key={key}><h4>{label}</h4><pre>{result.draft?.[key as keyof HandoffContent]}</pre></section>)}<h4>確認が必要な事項</h4><ul>{result.draft.review_questions.map((q, i) => <li key={i}>{q}</li>)}</ul><label className="ai-consent"><input type="checkbox" checked={applyConfirmed} onChange={e => setApplyConfirmed(e.target.checked)} />本文6項目の置き換えと、根拠資料のリンクの追加を確認しました</label><Button type="button" data-apply-draft disabled={!applyConfirmed || disabled || busy} onClick={() => { const d = result.draft; if (d) { onApply({ summary: d.summary, current_state: d.current_state, completed_work: d.completed_work, pending_work: d.pending_work, risks: `${d.risks}${d.review_questions.length ? '\n\n確認が必要な事項：\n' + d.review_questions.map(q => '・' + q).join('\n') : ''}`, next_actions: d.next_actions }, result.sources); setResult(null); } }}>確認してフォームに反映</Button></>}
      <AISources workspaceId={workspaceId} sources={result.sources} /><p className="work-subtle">関連資料はIDによるリンクです。残り：自分 {result.status.user_remaining}回 / ワークスペース {result.status.workspace_remaining}回。保存は下の保存ボタンで行います。</p>
    </div>}
  </section>;
}
