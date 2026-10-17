import { NextResponse } from 'next/server';
import { apiError, HttpError, textField } from '@/lib/auth/server';
import { wikiContext, wikiQuery, limitedRequest } from '@/lib/wiki';
import { InputError, uuid } from '@/features/work-items/validation';
import { validateDocument, WikiInputError } from '@/features/wiki/document';
import { workError } from '@/lib/work-items';
import type { Json } from '@/lib/supabase/database';
type Context = { params: Promise<{ workspaceId: string }> };
function failure(error: unknown) { return apiError(error instanceof WikiInputError || error instanceof InputError ? new HttpError(400, error.message) : error); }
export async function GET(req: Request, context: Context) {
  try {
    const { workspaceId } = await context.params; const { client } = await wikiContext(req, workspaceId);
    const params = new URL(req.url).searchParams; const collection = params.get('collection') ?? 'list'; const filters: Record<string, Json> = {};
    for (const key of ['q', 'category', 'status', 'archived', 'offset', 'limit']) if (params.has(key)) {
      const value = params.get(key)!;
      if (key === 'q') filters[key] = textField(value, 200, false);
      else if (key === 'category') filters[key] = textField(value, 40, false);
      else if (key === 'status') { if (!['draft', 'published', ''].includes(value)) throw new HttpError(400, '状態を確認してください。'); filters[key] = value; }
      else if (key === 'archived') { if (!['true', 'false'].includes(value)) throw new HttpError(400, '表示対象を確認してください。'); filters[key] = value === 'true'; }
      else { if (!/^\d{1,7}$/.test(value) || (key === 'limit' && (Number(value) < 1 || Number(value) > 100))) throw new HttpError(400, 'ページ指定を確認してください。'); filters[key] = Number(value); }
    }
    if (['detail', 'revision', 'backlinks'].includes(collection)) filters.id = uuid(params.get('id'));
    if (collection === 'revision') { const revision = params.get('revision') ?? ''; if (!/^[1-9]\d{0,7}$/.test(revision)) throw new HttpError(400, '版番号を確認してください。'); filters.revision = Number(revision); }
    return NextResponse.json(await wikiQuery(client, workspaceId, collection, filters), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request, context: Context) {
  try {
    const { workspaceId } = await context.params; const { client } = await wikiContext(req, workspaceId, true);
    const input: unknown = await (await limitedRequest(req, 250000)).json();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, '入力形式を確認してください。');
    const body = input as Record<string, unknown>; const operation = body.operation;
    if (typeof operation !== 'string' || !['create', 'update', 'archive', 'restore'].includes(operation)) throw new HttpError(400, '操作を確認してください。');
    const payload: Record<string, Json> = {};
    if (operation !== 'create') { payload.id = uuid(body.id); if (!Number.isSafeInteger(body.expected_version) || Number(body.expected_version) < 1) throw new HttpError(400, '版を確認してください。'); payload.expected_version = Number(body.expected_version); }
    if (operation === 'create' || operation === 'update') {
      payload.title = textField(body.title, 200); payload.category = textField(body.category ?? '未分類', 40);
      if (!['draft', 'published'].includes(String(body.status))) throw new HttpError(400, '公開状態を確認してください。'); payload.status = String(body.status);
      payload.parent_id = body.parent_id ? uuid(body.parent_id) : null; payload.body_doc = validateDocument(body.body_doc) as Json;
      if (!Array.isArray(body.related_ids) || body.related_ids.length > 50) throw new HttpError(400, '関連情報は50件以内で指定してください。'); payload.related_ids = [...new Set(body.related_ids.map(uuid))];
    }
    const { data, error } = await client.rpc('wiki_command', { target_workspace: workspaceId, operation, payload });
    if (error) throw workError(error); return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error instanceof SyntaxError ? new HttpError(400, '入力形式を確認してください。') : error); }
}
