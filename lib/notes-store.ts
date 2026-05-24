import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";

export type SavedNote = {
  id: string;
  input: string;
  savedAt: string;
};

type NotesRow = {
  id: string;
  input: string;
  saved_at: string;
};

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "notes.json");

function formatSavedAt(value: string) {
  try {
    return new Date(value).toLocaleString("ja-JP");
  } catch {
    return value;
  }
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_NOTES_TABLE ?? "notes";

  if (!url || !serviceKey) {
    return null;
  }

  return {
    table,
    client: createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }),
  };
}

export function createSupabaseClientWithToken(token?: string) {
  const url = process.env.SUPABASE_URL;
  if (!url || !token) return null;
  return createClient(url, token, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensureFile() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, "[]", "utf8");
  }
}

async function readLocalNotes(): Promise<SavedNote[]> {
  await ensureFile();
  const raw = await fs.readFile(dataFile, "utf8");
  try {
    const parsed = JSON.parse(raw) as SavedNote[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalNotes(notes: SavedNote[]) {
  await ensureFile();
  await fs.writeFile(dataFile, JSON.stringify(notes, null, 2), "utf8");
}

async function readSupabaseNotes(query?: string, clientOverride?: ReturnType<typeof createClient>): Promise<SavedNote[]> {
  const config = getSupabaseConfig();
  const client = clientOverride ?? config?.client;

  if (!client) {
    return readLocalNotes();
  }

  let request = client.from(config?.table ?? (process.env.SUPABASE_NOTES_TABLE ?? "notes")).select("id,input,saved_at").order("saved_at", {
    ascending: false,
  });

  if (query) {
    request = request.ilike("input", `%${query}%`);
  }

  const { data, error } = await request;

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    input: row.input,
    savedAt: formatSavedAt(row.saved_at),
  }));
}

async function saveSupabaseNote(input: string, id?: string, owner?: string, clientOverride?: ReturnType<typeof createClient>): Promise<SavedNote> {
  const config = getSupabaseConfig();
  const client = clientOverride ?? config?.client;
  const savedAtIso = new Date().toISOString();
  const noteId = id ?? `${Date.now()}-${input.slice(0, 12).replace(/\s+/g, "-")}`;

  if (!config) {
    const notes = await readLocalNotes();
    const note: SavedNote = { id: noteId, input, savedAt: new Date().toLocaleString("ja-JP") };
    const next = id ? [note, ...notes.filter((current) => current.id !== id)] : [note, ...notes.filter((current) => current.input !== input)];
    await writeLocalNotes(next);
    return note;
  }

  const payload = {
    id: noteId,
    input,
    saved_at: savedAtIso,
    ...(owner ? { owner } : {}),
  };

  if (!client) {
    throw new Error("Supabase client not configured");
  }

  const { data, error } = await client.from(config?.table ?? (process.env.SUPABASE_NOTES_TABLE ?? "notes")).upsert(payload).select("id,input,saved_at").single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    input: data.input,
    savedAt: formatSavedAt(data.saved_at),
  };
}

async function deleteSupabaseNote(id: string) {
  const config = getSupabaseConfig();

  if (!config) {
    const notes = await readLocalNotes();
    await writeLocalNotes(notes.filter((note) => note.id !== id));
    return;
  }

  const { error } = await config.client.from(config.table).delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function getNotes(query?: string) {
  return readSupabaseNotes(query);
}

export async function createNote(input: string, owner?: string, clientOverride?: ReturnType<typeof createClient>) {
  return saveSupabaseNote(input, undefined, owner, clientOverride);
}

export async function updateNote(id: string, input: string, owner?: string, clientOverride?: ReturnType<typeof createClient>) {
  return saveSupabaseNote(input, id, owner, clientOverride);
}

export async function removeNote(id: string) {
  return deleteSupabaseNote(id);
}
