import { NextResponse } from 'next/server';
import { requireApiUser, readBody, textField, HttpError, apiError } from '@/lib/auth/server';
import { generateText } from '@/lib/gemini';
import { checkRateLimit } from '@/lib/rateLimiter';
export async function POST(req: Request) {
  try {
    const { user } = await requireApiUser(req); const body = await readBody(req);
    const prompt = textField(body.prompt, 6000);
    if (!process.env.GEMINI_API_KEY) throw new HttpError(503, 'AI補助は現在利用できません。');
    const { allowed, resetSeconds } = checkRateLimit(`user:${user.id}`);
    if (!allowed) return NextResponse.json({ error: '時間をおいて再度お試しください。' }, { status: 429, headers: { 'Retry-After': String(resetSeconds) } });
    const text: unknown = await generateText(prompt, { temperature: 0.2, maxOutputTokens: 300 });
    if (typeof text !== 'string') throw new HttpError(502, 'AI応答を読み取れませんでした。');
    return NextResponse.json({ text });
  } catch (error) { return apiError(error); }
}
