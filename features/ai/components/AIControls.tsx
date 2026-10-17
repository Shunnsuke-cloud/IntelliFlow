"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Field } from '@/components/ui/controls';
import { flowHref, flowKinds, type FlowNode } from '@/features/flow/types';
import type { AIResult, AIStatus } from '../types';
export async function aiPost(workspaceId: string, payload: Record<string, unknown>) {
  const response = await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: workspaceId, ...payload }), signal: AbortSignal.timeout(35000) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'AIを利用できませんでした。');
  return data as AIResult & { status: AIStatus };
}
export function AIDisclosure() {
  return <p className="ai-disclosure">質問と、閲覧権限のある資料の抜粋をGoogle Geminiへ送信します。無料枠では送信内容が製品改善に使われる場合があります。機密情報・個人情報を含む内容は送信しないでください。秘密情報の自動除外には限界があります。<a href="https://ai.google.dev/gemini-api/terms#unpaid-services" target="_blank" rel="noreferrer">Googleの利用条件</a></p>;
}
export function AIConsent({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="ai-consent"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />質問・参照資料に機密情報や個人情報を含めず、外部送信に同意します</label>;
}
export function AISources({ workspaceId, sources }: { workspaceId: string; sources: FlowNode[] }) {
  return sources.length > 0 && <div className="ai-sources"><strong>回答の根拠</strong><ul>{sources.map(source => <li key={source.id}><Link href={flowHref(workspaceId, source)}>{flowKinds[source.kind]}：{source.title}</Link><small>参照時の版 {source.version}</small></li>)}</ul></div>;
}
export function AISettings({ workspaceId, workspace = false }: { workspaceId: string; workspace?: boolean }) {
  const [status, setStatus] = useState<AIStatus | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false); const [saved, setSaved] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/gemini?workspace_id=${workspaceId}`, { cache: 'no-store', signal: controller.signal }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setStatus(data.status); }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'AI設定を読み込めませんでした。'); });
    return () => controller.abort();
  }, [workspaceId]);
  async function change(payload: Record<string, unknown>) {
    if (busy) return; setBusy(true); setError(''); setSaved('');
    try { const data = await aiPost(workspaceId, payload); setStatus(data.status); setSaved('AI設定を保存しました。'); }
    catch (e) { setError(e instanceof Error ? e.message : '設定を保存できませんでした。'); } finally { setBusy(false); }
  }
  return <section className="if-card ai-settings"><h2>{workspace ? 'ワークスペースのAI設定' : '自分のAI利用設定'}</h2><AIDisclosure />{error && <p className="if-error" role="alert">{error}</p>}{!status && !error && <p role="status">設定を読み込んでいます…</p>}{status && <>
    <p>ワークスペース：{status.enabled ? '有効' : '無効'} / 自分のAI利用：{status.personal_enabled ? '有効' : '無効'}</p>
    <p className="work-subtle">本日の残り：自分 {status.user_remaining}/{status.user_limit} 回 · ワークスペース {status.workspace_remaining}/{status.workspace_limit} 回。毎日UTC 0時（日本時間9時）にリセットします。送信した失敗分も含みます。Google側の上限とは別です。</p>
    <AIConsent checked={consent} onChange={setConsent} />
    <Button type="button" disabled={busy || (!status.personal_enabled && !consent)} onClick={() => change({ operation: 'preference', enabled: !status.personal_enabled, consent })}>{status.personal_enabled ? '自分のAI利用を無効にする' : '自分のAI利用を有効にする'}</Button>
    {workspace && (status.can_manage ? <form key={`${status.user_limit}-${status.workspace_limit}-${status.enabled}`} onSubmit={e => { e.preventDefault(); const values = new FormData(e.currentTarget); void change({ operation: 'settings', enabled: values.get('enabled') === 'on', user_limit: Number(values.get('user_limit')), workspace_limit: Number(values.get('workspace_limit')), consent }); }}>
      <label className="ai-consent"><input type="checkbox" name="enabled" defaultChecked={status.enabled} />ワークスペースのAIを有効にする</label><div className="work-form-grid"><Field label="1ユーザーの1日上限（全ワークスペース合算）" name="user_limit" type="number" min={1} max={100} defaultValue={status.user_limit} required /><Field label="ワークスペースの1日上限" name="workspace_limit" type="number" min={1} max={500} defaultValue={status.workspace_limit} required /></div><Button disabled={busy}>ワークスペースのAI設定を保存</Button><p className="work-subtle">有効化には上の外部送信への同意が必要です。無効化は同意せずに保存できます。</p>
    </form> : <p>AIの有効化と回数上限はOwner・Adminが設定できます。</p>)}
  </>}{saved && <p role="status">{saved}</p>}</section>;
}
