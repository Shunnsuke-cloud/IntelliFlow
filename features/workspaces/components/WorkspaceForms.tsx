"use client";
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Modal } from '@/components/ui/controls';
import { canAssign, canManage, roles, type WorkspaceRole } from '@/lib/auth/policy';
import type { Workspace, Invitation } from '@/lib/supabase/database';
type CommandResponse = { data: { workspace_id?: string }; inviteToken?: string; error?: string };
async function command(body: Record<string, string>): Promise<CommandResponse> {
  const response = await fetch('/api/workspaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json() as CommandResponse;
  if (!response.ok) throw new Error(result.error ?? '処理に失敗しました。'); return result;
}
function ErrorText({ value }: { value: string }) { return value ? <p className="if-error" role="alert">{value}</p> : null; }
export function WorkspaceEditor({ workspace }: { workspace?: Workspace }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setError('');
    try {
      const result = await command({ operation: workspace ? 'update' : 'create', workspace_id: workspace?.id ?? '', name: String(form.get('name')), description: String(form.get('description')) });
      setOpen(false); setMessage('保存しました。');
      if (!workspace && result.data.workspace_id) router.push(`/app/w/${result.data.workspace_id}`);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : '保存できませんでした。'); } finally { setBusy(false); }
  }
  return <><Button onClick={() => { setError(''); setOpen(true); }}>{workspace ? '名前・説明を変更' : 'ワークスペースを作成'}</Button>{message && <p role="status">{message}</p>}{open && <Modal title={workspace ? 'ワークスペースを変更' : 'ワークスペースを作成'} onClose={() => { if (!busy) setOpen(false); }}><form onSubmit={submit}><p>個人用もチーム用も、ここから作成できます。</p><Field label="名前" name="name" required maxLength={80} defaultValue={workspace?.name} /><label className="if-field"><span>説明（任意）</span><textarea name="description" maxLength={2000} rows={4} defaultValue={workspace?.description} /></label><ErrorText value={error} /><Button disabled={busy}>{busy ? '保存中…' : '保存する'}</Button></form></Modal>}</>;
}
export function InvitationForm({ workspaceId, role }: { workspaceId: string; role: WorkspaceRole }) {
  const router = useRouter(); const [error, setError] = useState(''); const [link, setLink] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const values = new FormData(e.currentTarget); setBusy(true); setError(''); setLink('');
    try {
      const result = await command({ operation: 'invite', workspace_id: workspaceId, email: String(values.get('email')), role: String(values.get('role')) });
      if (!result.inviteToken) throw new Error('招待を作成できませんでした。');
      setLink(`${window.location.origin}/invite#${result.inviteToken}`); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : '招待できませんでした。'); } finally { setBusy(false); }
  }
  return <section className="if-card"><h2>メンバーを招待</h2><p>招待先本人だけが参加できる、7日間有効のリンクを作成します。メールは自動送信されません。</p><form onSubmit={submit}><Field label="招待先のメールアドレス" name="email" type="email" maxLength={254} required /><label className="if-field"><span>参加時の権限</span><select name="role" defaultValue="member">{roles.filter(r => r !== 'owner' && (role === 'owner' || r !== 'admin')).map(r => <option key={r} value={r}>{r.toUpperCase()[0] + r.slice(1)}</option>)}</select></label><ErrorText value={error} /><Button disabled={busy}>{busy ? '作成中…' : '招待リンクを作成'}</Button></form>{link && <label className="if-field"><span>このリンクを招待先に共有してください（この画面でのみ表示）</span><input readOnly value={link} onFocus={e => e.currentTarget.select()} /></label>}</section>;
}
export type Person = { user_id: string; display_name: string; role: WorkspaceRole; joined_at: string };
export function MemberActions({ person, actorRole, workspaceId, self }: { person: Person; actorRole: WorkspaceRole; workspaceId: string; self: boolean }) {
  const router = useRouter(); const [next, setNext] = useState<WorkspaceRole>(person.role); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  if (!canManage(actorRole) || (actorRole === 'admin' && !['member', 'viewer'].includes(person.role))) return <span>{person.role}</span>;
  async function update(operation: 'set_role' | 'remove') {
    setBusy(true); setError('');
    try { await command({ operation, workspace_id: workspaceId, user_id: person.user_id, role: next }); setConfirm(false); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : '変更できませんでした。'); } finally { setBusy(false); }
  }
  return <div><div className="if-row"><select aria-label={`${person.display_name}の権限`} value={next} disabled={busy} onChange={e => setNext(e.target.value as WorkspaceRole)}>{roles.filter(r => canAssign(actorRole, person.role, r)).map(r => <option key={r}>{r}</option>)}</select><Button disabled={busy || next === person.role} onClick={() => update('set_role')}>変更</Button>{!self && <Button disabled={busy} onClick={() => setConfirm(true)}>メンバーから外す</Button>}</div><ErrorText value={error} />{confirm && <Modal title="メンバーから外しますか？" onClose={() => { if (!busy) setConfirm(false); }}><p>{person.display_name}はこのワークスペースを利用できなくなります。作成したデータは残ります。</p><Button disabled={busy} onClick={() => update('remove')}>メンバーから外す</Button><ErrorText value={error} /></Modal>}</div>;
}
export function AcceptInvitation() {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function accept() {
    let token = window.location.hash.slice(1);
    try { token ||= sessionStorage.getItem('intelliflow-pending-invitation') ?? ''; } catch { /* original fragment remains usable */ }
    if (!/^[a-f0-9]{64}$/.test(token)) { setError('招待リンクが無効です。共有されたリンクを開き直してください。'); return; }
    setBusy(true); setError('');
    try {
      const result = await command({ operation: 'accept', token });
      if (!result.data.workspace_id) throw new Error('参加できませんでした。');
      try { sessionStorage.removeItem('intelliflow-pending-invitation'); } catch { /* optional storage */ }
      window.history.replaceState(null, '', '/invite'); router.push(`/app/w/${result.data.workspace_id}`); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : '参加できませんでした。'); } finally { setBusy(false); }
  }
  function login() {
    const token = window.location.hash.slice(1);
    try { if (/^[a-f0-9]{64}$/.test(token)) sessionStorage.setItem('intelliflow-pending-invitation', token); }
    catch { setError('このブラウザでは招待を一時保存できません。ログイン後、元の招待リンクを開き直してください。'); }
    router.push('/login?next=/invite');
  }
  return <><p>招待先と同じメールアドレスでログインし、メール確認を完了してから参加してください。</p><Button onClick={login}>ログイン・新規登録へ</Button><ErrorText value={error} /><Button disabled={busy} onClick={accept}>{busy ? '確認中…' : 'このアカウントで参加する'}</Button><p>別のブラウザで認証した場合や、別のアカウントを使う場合は、ログイン後に元の招待リンクを開き直してください。</p></>;
}

export function PendingInvitations({ invitations, workspaceId }: { invitations: Invitation[]; workspaceId: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  async function revoke(id: string) {
    setBusy(id); setError('');
    try { await command({ operation: 'revoke', workspace_id: workspaceId, invitation_id: id }); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : '取消できませんでした。'); } finally { setBusy(''); }
  }
  return <section className="if-card"><h2>参加待ちの招待</h2><ErrorText value={error} />{invitations.length ? <ul className="if-members">{invitations.map(i => <li key={i.id}><div><strong>{i.email}</strong><p>{i.role} / 有効期限: {new Date(i.expires_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })}（日本時間）</p></div><Button disabled={!!busy} onClick={() => revoke(i.id)}>{busy === i.id ? '取消中…' : '招待を取り消す'}</Button></li>)}</ul> : <p>有効な招待はありません。</p>}</section>;
}
