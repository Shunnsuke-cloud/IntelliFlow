import { workspaceDetail } from '@/lib/workspaces';
import { AISettings } from '@/features/ai/components/AIControls';
import { canManage } from '@/lib/auth/policy';
import { WorkspaceEditor, InvitationForm, MemberActions, PendingInvitations } from '@/features/workspaces/components/WorkspaceForms';
export default async function Settings({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { client, user, workspace, role } = await workspaceDetail((await params).workspaceId);
  const { data: people, error } = await client.rpc('workspace_people', { target_workspace: workspace.id });
  if (error) throw new Error('メンバーを読み込めませんでした。');
  const invitations = canManage(role) ? await client.rpc('workspace_pending_invitations', { target_workspace: workspace.id }) : null;
  if (invitations?.error) throw new Error('招待を読み込めませんでした。');
  return <><p className="if-kicker">SETTINGS</p><h1>ワークスペースの設定</h1><section className="if-card"><h2>{workspace.name}</h2><p>{workspace.description || '説明はありません。'}</p>{canManage(role) ? <WorkspaceEditor workspace={workspace} /> : <p>名前・説明の変更はOwner・Adminが行えます。</p>}</section><section className="if-card"><h2>メンバー一覧</h2><p>Owner: 全体管理 / Admin: 運用管理 / Member: 共同作業 / Viewer: 閲覧</p><p>Ownerを移譲する場合は、先に相手をOwnerにしてから自分の権限を変更してください。</p><ul className="if-members">{people?.map(person => <li key={person.user_id}><div><strong>{person.display_name}</strong>{person.user_id === user.id && <small>（あなた）</small>}<p>{person.role}</p></div><MemberActions person={person} actorRole={role} workspaceId={workspace.id} self={person.user_id === user.id} /></li>)}</ul></section>{canManage(role) && <><InvitationForm workspaceId={workspace.id} role={role} /><PendingInvitations invitations={invitations?.data ?? []} workspaceId={workspace.id} /></>}<AISettings workspaceId={workspace.id} workspace /></>;
}
