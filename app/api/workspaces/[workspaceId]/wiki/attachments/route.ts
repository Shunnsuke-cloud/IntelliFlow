import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { apiError, HttpError } from '@/lib/auth/server';
import { wikiContext, limitedRequest } from '@/lib/wiki';
import { uuid, InputError } from '@/features/work-items/validation';
import { imageType } from '@/features/wiki/document';
import { workError } from '@/lib/work-items';
export async function POST(req: Request, context: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await context.params; const { client } = await wikiContext(req, workspaceId, true);
    const form = await (await limitedRequest(req, 3500000)).formData(); const pageId = uuid(form.get('page_id')); const file = form.get('image');
    if (!(file instanceof File) || file.size < 1 || file.size > 3145728) throw new HttpError(400, '画像は3MB以下のPNG・JPEG・WebPを選んでください。');
    const bytes = new Uint8Array(await file.arrayBuffer()); const mime = imageType(bytes);
    if (!mime || mime !== file.type) throw new HttpError(400, 'PNG・JPEG・WebPの有効な画像を選んでください。SVGは添付できません。');
    const id = randomUUID();
    const reserved = await client.rpc('wiki_command', { target_workspace: workspaceId, operation: 'attachment_reserve', payload: { id: pageId, attachment_id: id, mime_type: mime, byte_size: file.size } });
    if (reserved.error) throw workError(reserved.error);
    const path = `${workspaceId}/${pageId}/${id}`;
    const upload = await client.storage.from('intelliflow-wiki').upload(path, bytes, { contentType: mime, upsert: false });
    if (upload.error) throw new HttpError(503, '画像を保存できませんでした。Storageの設定・接続を確認してください。');
    const finished = await client.rpc('wiki_command', { target_workspace: workspaceId, operation: 'attachment_finish', payload: { id: pageId, attachment_id: id } });
    if (finished.error) throw workError(finished.error);
    return NextResponse.json({ id }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error instanceof InputError ? new HttpError(400, error.message) : error); }
}
