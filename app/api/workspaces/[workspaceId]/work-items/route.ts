import { NextResponse } from 'next/server';
import { requireApiUser, readBody, apiError, HttpError } from '@/lib/auth/server';
import { InputError, uuid, validateCommand, validateFilters } from '@/features/work-items/validation';
import { queryItems, workError } from '@/lib/work-items';
type Context = { params: Promise<{ workspaceId: string }> };
async function context(req: Request, route: Context) {
  const { client, user } = await requireApiUser(req); const workspaceId = uuid((await route.params).workspaceId);
  const { data, error } = await client.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).is('left_at', null).single();
  if (error || !data) throw new HttpError(403, 'このワークスペースにはアクセスできません。');
  return { client, workspaceId, role: data.role };
}
function errorResponse(error: unknown) { return apiError(error instanceof InputError ? new HttpError(400, error.message) : error); }
export async function GET(req: Request, route: Context) {
  try {
    const { client, workspaceId } = await context(req, route); const params = new URL(req.url).searchParams;
    const collection = params.get('collection') ?? 'issues';
    if (!['issues', 'projects', 'detail', 'options'].includes(collection)) throw new HttpError(400, '取得対象を確認してください。');
    const filters = validateFilters(params);
    if (collection === 'detail') { filters.id = uuid(params.get('id')); filters.kind = params.get('kind') ?? ''; }
    const result = await queryItems(client, workspaceId, collection, filters);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(req: Request, route: Context) {
  try {
    const { client, workspaceId, role } = await context(req, route);
    if (role === 'viewer') throw new HttpError(403, 'Viewerは閲覧のみ利用できます。');
    const { operation, payload } = validateCommand(await readBody(req));
    const { data, error } = await client.rpc('work_item_command', { target_workspace: workspaceId, operation, payload });
    if (error) throw workError(error);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
