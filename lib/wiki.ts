import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './supabase/database';
import { requireApiUser, HttpError } from './auth/server';
import { workError } from './work-items';
import { uuid } from '@/features/work-items/validation';
export async function wikiContext(req: Request, workspaceId: string, write = false) {
  const { client, user } = await requireApiUser(req); uuid(workspaceId);
  const { data, error } = await client.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).is('left_at', null).single();
  if (error || !data || (write && data.role === 'viewer')) throw new HttpError(403, 'このワークスペースの操作権限がありません。');
  return { client, user, role: data.role };
}
export async function wikiQuery<T>(client: SupabaseClient<Database>, workspaceId: string, collection: string, filters: Record<string, Json> = {}): Promise<T> {
  const { data, error } = await client.rpc('wiki_query', { target_workspace: workspaceId, collection, filters });
  if (error) throw workError(error); return data as T;
}
export async function limitedRequest(req: Request, limit: number) {
  if (Number(req.headers.get('content-length') ?? 0) > limit) throw new HttpError(413, 'ファイルまたは本文が大きすぎます。');
  const reader = req.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (reader) {
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > limit) { await reader.cancel(); throw new HttpError(413, 'ファイルまたは本文が大きすぎます。'); } chunks.push(part.value); } }
    finally { reader.releaseLock(); }
  }
  const body = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return new Request(req.url, { method: req.method, headers: req.headers, body });
}
