import { apiError, HttpError } from '@/lib/auth/server';
import { wikiContext } from '@/lib/wiki';
import { uuid, InputError } from '@/features/work-items/validation';
import type { SupabaseClient } from '@supabase/supabase-js';
export async function GET(req: Request, context: { params: Promise<{ workspaceId: string; id: string }> }) {
  try {
    const { workspaceId, id } = await context.params; uuid(id); const { client } = await wikiContext(req, workspaceId);
    const { data, error } = await (client as SupabaseClient).from('wiki_attachments').select('object_path,mime_type').eq('workspace_id', workspaceId).eq('id', id).eq('state', 'ready').maybeSingle();
    if (error || !data || !['image/png', 'image/jpeg', 'image/webp'].includes(data.mime_type)) throw new HttpError(404, '画像が見つかりません。');
    const file = await client.storage.from('intelliflow-wiki').download(data.object_path);
    if (file.error) throw new HttpError(404, '画像が見つかりません。');
    return new Response(file.data, { headers: { 'Content-Type': data.mime_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) { return apiError(error instanceof InputError ? new HttpError(404, '画像が見つかりません。') : error); }
}
