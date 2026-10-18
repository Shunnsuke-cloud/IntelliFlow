import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { requirePageUser } from './auth/server';
export const workspaceList = cache(async function workspaceList() {
  const { client, user } = await requirePageUser();
  const { data, error } = await client.from('workspaces').select('*').order('created_at');
  if (error) throw new Error('ワークスペースを取得できません。DBの設定・マイグレーションを確認してください。');
  return { client, user, workspaces: data ?? [] };
});
export const workspaceDetail = cache(async function workspaceDetail(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const { client, user, workspaces } = await workspaceList();
  const workspace = workspaces.find(w => w.id === id);
  if (!workspace) notFound();
  const { data, error } = await client.from('workspace_members').select('*').eq('workspace_id', id).eq('user_id', user.id).is('left_at', null).single();
  if (error || !data) notFound();
  return { client, user, workspace, role: data.role, workspaces };
});
