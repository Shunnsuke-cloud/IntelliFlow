import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt = (body.prompt || "").toString();

  if (!prompt) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  try {
    const text = await generateText(prompt, { temperature: 0.2, maxOutputTokens: 300 });
    return NextResponse.json({ text });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
