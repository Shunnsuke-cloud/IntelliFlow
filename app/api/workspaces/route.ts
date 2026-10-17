import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireApiUser, apiError, HttpError, readBody, textField } from '@/lib/auth/server';
import { isRole, canManage } from '@/lib/auth/policy';
import type { Json } from '@/lib/supabase/database';
export async function POST(req: Request) {
  try {
    const { client, user } = await requireApiUser(req);
    const body = await readBody(req);
    const operation = textField(body.operation, 24);
    const payload: Record<string, Json> = {};
    let inviteToken: string | undefined;
    function uuid(value: unknown) {
      const result = textField(value, 36);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) throw new HttpError(400, 'IDの形式を確認してください。');
      return result;
    }
    if (!['create', 'update', 'invite', 'accept', 'set_role', 'remove', 'revoke'].includes(operation)) throw new HttpError(400, '操作を確認してください。');
    if (operation !== 'create' && operation !== 'accept') {
      payload.workspace_id = uuid(body.workspace_id);
      const { data, error } = await client.from('workspace_members').select('role').eq('workspace_id', payload.workspace_id).eq('user_id', user.id).is('left_at', null).single();
      if (error || !data || !canManage(data.role)) throw new HttpError(403, 'この操作を行う権限がありません。');
    }
    if (operation === 'create' || operation === 'update') {
      payload.name = textField(body.name, 80); payload.description = textField(body.description ?? '', 2000, false);
    }
    if (operation === 'invite' || operation === 'set_role') {
      if (!isRole(body.role)) throw new HttpError(400, '権限を確認してください。');
      payload.role = body.role;
    }
    if (operation === 'invite') {
      const email = textField(body.email, 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'メールアドレスを確認してください。');
      inviteToken = randomBytes(32).toString('hex'); payload.email = email; payload.token = inviteToken;
    }
    if (operation === 'accept') payload.token = textField(body.token, 64);
    if (operation === 'set_role' || operation === 'remove') payload.user_id = uuid(body.user_id);
    if (operation === 'revoke') payload.invitation_id = uuid(body.invitation_id);
    const { data, error } = await client.rpc('workspace_command', { operation, payload });
    if (error) {
      const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : ['23505', '23514'].includes(error.code) ? 409 : error.code === '22023' ? 400 : 503;
      throw new HttpError(status, status === 403 ? 'この操作は許可されていません。招待先・権限をご確認ください。' : status === 409 ? '最後のOwnerは変更できません。操作対象の状態も確認してください。' : status === 404 ? '対象または有効な招待が見つかりません。' : status === 400 ? '入力内容を確認してください。' : 'DB処理に失敗しました。マイグレーションの適用状況を確認してください。');
    }
    return NextResponse.json({ data, ...(inviteToken ? { inviteToken } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
