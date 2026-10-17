import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireApiUser, readBody, textField, HttpError, apiError } from '@/lib/auth/server';
import { getNotes, noteTable, savedNote, type NotesRow } from '@/lib/notes-store';
export async function GET(req: Request) {
  try {
    const { client, user } = await requireApiUser(req);
    const q = new URL(req.url).searchParams.get('q') ?? '';
    if (q.length > 200) throw new HttpError(400, '検索語が長すぎます。');
    return NextResponse.json(await getNotes(client, user.id, q), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
async function mutate(req: Request, method: 'POST' | 'PUT' | 'DELETE') {
  try {
    const { client, user } = await requireApiUser(req); const body = await readBody(req);
    // The legacy table is deliberately outside the new workspace schema.
    const table = (client as SupabaseClient).from(noteTable());
    const id = method === 'POST' ? crypto.randomUUID() : textField(body.id, 200);
    const input = method === 'DELETE' ? '' : textField(body.input, 10000);
    const result = method === 'POST' ? await table.insert({ id, input, owner: user.id }).select('id,input,saved_at,owner').single() : method === 'PUT' ? await table.update({ input }).eq('id', id).eq('owner', user.id).select('id,input,saved_at,owner').maybeSingle() : await table.delete().eq('id', id).eq('owner', user.id).select('id').maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new HttpError(404, 'ノートが見つかりません。');
    return NextResponse.json(method === 'DELETE' ? { success: true, id } : savedNote(result.data as NotesRow), { status: method === 'POST' ? 201 : 200 });
  } catch (error) { return apiError(error); }
}
export const POST = (req: Request) => mutate(req, 'POST');
export const PUT = (req: Request) => mutate(req, 'PUT');
export const DELETE = (req: Request) => mutate(req, 'DELETE');
