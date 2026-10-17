"use client";
import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button, Modal } from '@/components/ui/controls';
import type { AIFeature, AIResult } from '../types';
import { aiLimits } from '../config';
import { AIDisclosure, AIConsent, AISettings, AISources, aiPost } from './AIControls';
type Options = { feature?: AIFeature; sourceIds?: string[]; question?: string; filters?: Record<string, string>; onResult?: (result: AIResult) => void };
const Context = createContext<{ open: (options?: Options) => void } | null>(null);
export function useAI() { return useContext(Context); }
export default function AIProvider({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const [options, setOptions] = useState<Options | null>(null); const pathname = usePathname();
  const segments = pathname.split('/'); const kind = segments[4]; const id = segments[5];
  const currentIds = ['issues', 'projects', 'wiki', 'handoffs'].includes(kind) && /^[\da-f-]{36}$/i.test(id ?? '') ? [id] : [];
  return <Context.Provider value={{ open: value => setOptions({ sourceIds: currentIds, ...value }) }}>{children}<Button className="ai-launch" aria-label="AIアシスタントを開く" aria-haspopup="dialog" onClick={() => setOptions({ sourceIds: currentIds })}>✦ AIに相談</Button>{options && <Assistant key={`${workspaceId}-${pathname}`} workspaceId={workspaceId} options={options} onClose={() => setOptions(null)} />}</Context.Provider>;
}
function Assistant({ workspaceId, options, onClose }: { workspaceId: string; options: Options; onClose: () => void }) {
  const [question, setQuestion] = useState(options.question ?? ''); const [messages, setMessages] = useState<{ question: string; result: AIResult }[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [consent, setConsent] = useState(false); const [settings, setSettings] = useState(false);
  const sending = useRef(false); const end = useRef<HTMLDivElement>(null);
  const [useCurrent, setUseCurrent] = useState(true);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }, [messages, busy]);
  async function send(e: FormEvent) {
    e.preventDefault(); if (sending.current || !question.trim() || !consent) return;
    sending.current = true; setBusy(true); setError(''); const asked = question.trim();
    try {
      const data = await aiPost(workspaceId, { operation: 'generate', feature: options.feature ?? 'chat', question: asked, source_ids: useCurrent ? options.sourceIds ?? [] : [], filters: options.filters, request_id: crypto.randomUUID(), consent });
      setMessages(previous => [...previous.slice(-5), { question: asked, result: data }]); setQuestion('');
    } catch (e) { setMessages([]); setError(e instanceof Error ? e.message : 'AIを利用できませんでした。'); }
    finally { setBusy(false); sending.current = false; }
  }
  return <Modal title={options.feature === 'flow' ? 'Flow MapでAIに質問' : 'IntelliFlow AIアシスタント'} onClose={() => { if (!sending.current) onClose(); }}><div className="ai-panel">
    <p>登録された情報を探し、根拠と一緒に回答します。AIは保存・変更を行いません。</p><p className="work-subtle">この画面を閉じると会話は消えます。各質問を独立して検索するため、資料名やキーワードを添えてください。</p>
    <Button type="button" aria-expanded={settings} onClick={() => setSettings(v => !v)}>AIの利用設定・残り回数</Button>{settings && <AISettings workspaceId={workspaceId} />}
    <div className="ai-messages" aria-label="会話履歴" aria-live="polite">{!messages.length && <p className="if-state">例：「自分が対応すべきIssueは？」「イベントで発生した問題は？」{options.sourceIds?.length ? ' 表示中の情報と関連資料を参照します。' : ''}</p>}{messages.map((m, index) => <article key={index}><div className="ai-question"><strong>あなた</strong><p>{m.question}</p></div><div className="ai-answer"><strong>IntelliFlow AI · 要確認</strong>{m.result.unknown && <p className="if-badge">不明な点があります</p>}<p className="ai-body">{m.result.answer}</p><AISources workspaceId={workspaceId} sources={m.result.sources} /><p className="work-subtle">{m.result.search_note}</p><p className="work-subtle">残り：自分 {m.result.status.user_remaining}回 / ワークスペース {m.result.status.workspace_remaining}回</p>{options.onResult && m.result.sources.length > 0 && <Button type="button" onClick={() => { options.onResult?.(m.result); onClose(); }}>根拠をマップに表示</Button>}</div></article>)}{busy && <p role="status">閲覧できる情報を検索し、回答を作成しています…</p>}<div ref={end} /></div>
    {error && <p className="if-error" role="alert">{error}</p>}
    {options.sourceIds?.length ? <label className="ai-consent"><input type="checkbox" disabled={busy} checked={useCurrent} onChange={e => setUseCurrent(e.target.checked)} />表示中の情報と関連資料に絞って質問する</label> : null}
    <form onSubmit={send}><label className="if-field"><span>保存された情報について質問（{question.length}/{aiLimits.input}文字）</span><textarea autoFocus value={question} maxLength={aiLimits.input} rows={3} disabled={busy} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} /></label><AIDisclosure /><AIConsent checked={consent} onChange={setConsent} /><div className="work-actions"><Button disabled={busy || !consent || !question.trim()}>{busy ? '回答を作成中…' : 'AIに送信'}</Button><Button type="button" disabled={busy || !messages.length} onClick={() => setMessages([])}>会話を消去</Button></div><small>Enterで送信 / Shift＋Enterで改行</small></form><Link href={`/app/w/${workspaceId}/settings`}>ワークスペースのAI設定を開く →</Link>
  </div></Modal>;
}
