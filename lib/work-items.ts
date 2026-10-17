import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './supabase/database';
import { HttpError } from './auth/server';
export function workError(error: { code?: string }) {
  if (error.code === '42501') return new HttpError(403, '権限がないか、担当者・関連先がこのワークスペースの有効なメンバー／情報ではありません。');
  if (error.code === 'P0002') return new HttpError(404, '対象が見つかりません。削除済みか、アクセス権がありません。');
  if (error.code === '40001') return new HttpError(409, 'ほかの操作で更新されています。再読み込みして最新の内容を確認してください。');
  if (['23514', '23505'].includes(error.code ?? '')) return new HttpError(409, '削除済みの情報、日付の前後関係、入力内容を確認してください。');
  if (['22023', '22P02', '22007', '22008', '23502'].includes(error.code ?? '')) return new HttpError(400, '入力内容・日付・IDを確認してください。');
  return new HttpError(503, 'データを読み書きできませんでした。接続・DBマイグレーションの適用状況をご確認ください。');
}
export async function queryItems<T>(client: SupabaseClient<Database>, workspaceId: string, collection: string, filters: Record<string, Json> = {}): Promise<T> {
  const { data, error } = await client.rpc('work_items_query', { target_workspace: workspaceId, collection, filters });
  if (error) throw workError(error);
  return data as T;
}
