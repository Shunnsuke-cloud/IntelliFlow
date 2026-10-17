import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './supabase/database';
import { workError } from './work-items';
import { HttpError } from './auth/server';
export function handoffError(error: { code?: string }) {
  if (error.code === '42501') return new HttpError(403, 'この操作は許可されていません。編集・送信は引き継ぎ元、受領・完了は指定された相手だけが行えます。受取人の所属と関連資料の共有状態も確認してください。');
  if (error.code === '23514') return new HttpError(409, '現在の状態ではこの操作ができません。最新の状態を確認してください。送信済みの内容は改訂して再送できます。');
  if (error.code === '22023') return new HttpError(400, 'タイトル・作業概要・関連情報・改訂理由を確認してください。');
  return workError(error);
}
export async function handoffQuery<T>(client: SupabaseClient<Database>, workspaceId: string, collection: string, filters: Record<string, Json> = {}): Promise<T> {
  const { data, error } = await client.rpc('handoff_query', { target_workspace: workspaceId, collection, filters });
  if (error) throw handoffError(error); return data as T;
}
