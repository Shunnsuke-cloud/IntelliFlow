import 'server-only';
import { redirect } from 'next/navigation';
import { serverSupabase } from '../supabase/server';
import { sameOrigin, validatedUser } from './policy';
import { NextResponse } from 'next/server';
import { BodyError, readJsonBody } from './body';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function requirePageUser() {
  const client = await serverSupabase();
  const user = validatedUser(await client.auth.getUser());
  if (!user) redirect('/login');
  return { client, user };
}
export async function requireApiUser(req: Request) {
  if (!['GET', 'HEAD'].includes(req.method) && !sameOrigin(req)) throw new HttpError(403, 'この送信元からは操作できません。');
  const authorization = req.headers.get('authorization');
  if (authorization !== null && !/^Bearer \S+$/.test(authorization)) throw new HttpError(401, 'ログインし直してください。');
  const client = await serverSupabase(authorization === null ? undefined : authorization.slice(7));
  const user = validatedUser(await client.auth.getUser());
  if (!user) throw new HttpError(401, 'ログインが必要です。');
  return { client, user };
}
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try { return await readJsonBody(req); }
  catch (error) { if (error instanceof BodyError) throw new HttpError(error.status, error.message); throw error; }
}
export function textField(value: unknown, max: number, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new HttpError(400, '入力内容・文字数を確認してください。');
  return value.trim();
}
export function apiError(error: unknown) {
  return NextResponse.json({ error: error instanceof HttpError ? error.message : '処理に失敗しました。設定と接続を確認して再度お試しください。' }, { status: error instanceof HttpError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
}
