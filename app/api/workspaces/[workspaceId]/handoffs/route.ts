import { NextResponse } from 'next/server';
import { apiError, HttpError } from '@/lib/auth/server';
import { wikiContext, limitedRequest } from '@/lib/wiki';
import { handoffQuery, handoffError } from '@/lib/handoffs';
import { handoffFilters, handoffId, handoffInput, HandoffInputError } from '@/features/handoffs/validation';
function failure(error: unknown) { return apiError(error instanceof HandoffInputError || error instanceof SyntaxError ? new HttpError(400, error instanceof HandoffInputError ? error.message : '入力形式を確認してください。') : error); }
export async function GET(req: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const workspaceId = handoffId((await context.params).workspaceId); const { client } = await wikiContext(req, workspaceId);
    const params = new URL(req.url).searchParams; const collection = params.get('collection') ?? 'list'; const filters = handoffFilters(params);
    if (!['list', 'detail', 'version', 'seed', 'backlinks'].includes(collection)) throw new HandoffInputError('表示方法を確認してください。');
    if (['detail', 'version', 'backlinks'].includes(collection)) handoffId(filters.id);
    if (collection === 'seed') handoffId(filters.source_id);
    if (collection === 'version' && !filters.version) throw new HandoffInputError('版番号を確認してください。');
    return NextResponse.json(await handoffQuery(client, workspaceId, collection, filters), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const workspaceId = handoffId((await context.params).workspaceId);
    const { client } = await wikiContext(req, workspaceId); // A designated Viewer can accept/complete.
    const { operation, payload } = handoffInput(await (await limitedRequest(req, 250000)).json());
    const { data, error } = await client.rpc('handoff_command', { target_workspace: workspaceId, operation, payload });
    if (error) throw handoffError(error); return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
