import { NextResponse } from 'next/server';
import { apiError, HttpError } from '@/lib/auth/server';
import { wikiContext, limitedRequest } from '@/lib/wiki';
import { workError } from '@/lib/work-items';
import { flowQuery } from '@/lib/flow';
import { flowFilters, flowId, relationInput, FlowInputError } from '@/features/flow/validation';
function failure(error: unknown) { return apiError(error instanceof FlowInputError || error instanceof SyntaxError ? new HttpError(400, error instanceof FlowInputError ? error.message : '入力形式を確認してください。') : error); }
export async function GET(req: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const workspaceId = flowId((await context.params).workspaceId);
    const { client } = await wikiContext(req, workspaceId);
    const params = new URL(req.url).searchParams; const collection = params.get('collection') ?? 'search';
    if (!['search', 'neighbors', 'detail', 'projects'].includes(collection)) throw new FlowInputError('検索方法を確認してください。');
    const filters = flowFilters(params); if (['neighbors', 'detail'].includes(collection)) flowId(filters.id);
    return NextResponse.json(await flowQuery(client, workspaceId, collection, filters), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const workspaceId = flowId((await context.params).workspaceId);
    const { client } = await wikiContext(req, workspaceId, true);
    const { operation, payload } = relationInput(await (await limitedRequest(req, 4096)).json());
    const { data, error } = await client.rpc('flow_relation_command', { target_workspace: workspaceId, operation, payload });
    if (error) throw workError(error);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
