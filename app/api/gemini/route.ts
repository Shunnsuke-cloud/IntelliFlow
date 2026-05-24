import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/gemini";
import { checkRateLimit } from "@/lib/rateLimiter";
import { createSupabaseClientWithToken } from "@/lib/notes-store";

async function getClientKey(req: NextRequest) {
  // If Authorization Bearer present, validate token with Supabase and use user id
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    try {
      const client = createSupabaseClientWithToken(token);
      if (client) {
        const { data, error } = await client.auth.getUser();
        if (!error && data?.user?.id) {
          return `user:${data.user.id}`;
        }
      }
      // fallback to token fingerprint
      return `user:token:${token.slice(0, 32)}`;
    } catch (e) {
      return `user:token:${token.slice(0, 32)}`;
    }
  }

  const xff = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
  const ip = xff.split(',')[0].trim();
  return `ip:${ip}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt = (body.prompt || "").toString();

  if (!prompt) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  // rate limit check
  try {
    const key = await getClientKey(req);
    const limit = Number(process.env.GEMINI_RATE_LIMIT_PER_MIN) || undefined;
    const { allowed, remaining, resetSeconds } = checkRateLimit(key, limit);
    if (!allowed) {
      return NextResponse.json(
        { error: 'rate limit exceeded' },
        {
          status: 429,
          headers: {
            'Retry-After': String(resetSeconds),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(resetSeconds),
          },
        }
      );
    }
  } catch (e) {
    // on limiter failure, continue (fail open)
    console.warn('rate limiter error', e);
  }

  try {
    const text = await generateText(prompt, { temperature: 0.2, maxOutputTokens: 300 });
    return NextResponse.json({ text });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
