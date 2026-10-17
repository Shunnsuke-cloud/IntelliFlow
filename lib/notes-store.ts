import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
export type SavedNote = { id: string; input: string; savedAt: string };
export type NotesRow = { id: string; input: string; saved_at: string; owner: string };
export function noteTable() { return process.env.SUPABASE_NOTES_TABLE ?? 'notes'; }
export function savedNote(row: NotesRow): SavedNote { return { id: row.id, input: row.input, savedAt: row.saved_at }; }
export async function getNotes(client: SupabaseClient, owner: string, query: string) {
  let request = client.from(noteTable()).select('id,input,saved_at,owner').eq('owner', owner).order('saved_at', { ascending: false }).limit(100);
  if (query) request = request.ilike('input', `%${query.replace(/[\\%_]/g, '\\$&')}%`);
  const { data, error } = await request; if (error) throw error;
  return (data as NotesRow[]).map(savedNote);
}
