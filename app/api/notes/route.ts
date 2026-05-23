import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

type SavedNote = {
  id: string;
  input: string;
  savedAt: string;
};

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "notes.json");

async function ensureFile() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, "[]", "utf8");
  }
}

async function readNotes(): Promise<SavedNote[]> {
  await ensureFile();
  const raw = await fs.readFile(dataFile, "utf8");
  try {
    const parsed = JSON.parse(raw) as SavedNote[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeNotes(notes: SavedNote[]) {
  await ensureFile();
  await fs.writeFile(dataFile, JSON.stringify(notes, null, 2), "utf8");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";

  const notes = await readNotes();

  if (!q) {
    return NextResponse.json(notes);
  }

  const normalized = q.toLowerCase();
  const filtered = notes.filter((n) => n.input.toLowerCase().includes(normalized));
  return NextResponse.json(filtered);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const input = (body.input || "").toString().trim();

  if (!input) {
    return NextResponse.json({ error: "input required" }, { status: 400 });
  }

  const notes = await readNotes();
  const savedAt = new Date().toLocaleString("ja-JP");
  const id = `${Date.now()}-${input.slice(0, 12).replace(/\s+/g, "-")}`;

  const newNote: SavedNote = { id, input, savedAt };
  const next = [newNote, ...notes.filter((n) => n.input !== input)];
  await writeNotes(next);

  return NextResponse.json(newNote, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = (body.id || "").toString();

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const notes = await readNotes();
  const next = notes.filter((n) => n.id !== id);
  await writeNotes(next);

  return NextResponse.json({ success: true, id });
}
