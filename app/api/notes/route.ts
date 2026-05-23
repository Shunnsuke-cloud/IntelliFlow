import { NextRequest, NextResponse } from "next/server";
import { createNote, getNotes, removeNote, updateNote, createSupabaseClientWithToken } from "@/lib/notes-store";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";

  const notes = await getNotes(q);
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const input = (body.input || "").toString().trim();

  if (!input) {
    return NextResponse.json({ error: "input required" }, { status: 400 });
  }
  // Try to extract user id from Authorization header and create a user-scoped supabase client
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const client = token ? createSupabaseClientWithToken(token) : undefined;
  let owner: string | undefined = undefined;
  if (client) {
    try {
      const userRes = await (client as any).auth.getUser();
      owner = userRes?.data?.user?.id ?? undefined;
    } catch {
      owner = undefined;
    }
  }

  const newNote = await createNote(input, owner, client as any);
  return NextResponse.json(newNote, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = (body.id || "").toString();
  const input = (body.input || "").toString().trim();

  if (!id || !input) {
    return NextResponse.json({ error: "id and input required" }, { status: 400 });
  }

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const client = token ? createSupabaseClientWithToken(token) : undefined;
  let owner: string | undefined = undefined;
  if (client) {
    try {
      const userRes = await (client as any).auth.getUser();
      owner = userRes?.data?.user?.id ?? undefined;
    } catch {
      owner = undefined;
    }
  }

  const nextNote = await updateNote(id, input, owner, client as any);
  return NextResponse.json(nextNote);
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = (body.id || "").toString();

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const client = token ? createSupabaseClientWithToken(token) : undefined;

  // Prefer delete via user-scoped client so RLS enforces ownership. If no token, fallback to service-role (notes-store will handle).
  if (client) {
    // removeNote currently uses service config; call delete directly via client to ensure RLS
    await client.from(process.env.SUPABASE_NOTES_TABLE ?? "notes").delete().eq("id", id);
  } else {
    await removeNote(id);
  }

  return NextResponse.json({ success: true, id });
}
