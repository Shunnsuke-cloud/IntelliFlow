import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth/policy';
export async function GET(req: Request) {
  const url = new URL(req.url); const next = safeNext(url.searchParams.get('next'));
  try {
    const client = await serverSupabase(); const code = url.searchParams.get('code');
    const token = url.searchParams.get('token_hash'); const type = url.searchParams.get('type');
    const result = code ? await client.auth.exchangeCodeForSession(code) : token && ['email', 'signup', 'magiclink'].includes(type ?? '') ? await client.auth.verifyOtp({ token_hash: token, type: type as 'email' | 'signup' | 'magiclink' }) : null;
    if (result && !result.error) return NextResponse.redirect(new URL(next, url.origin), { headers: { 'Cache-Control': 'no-store' } });
  } catch { /* non-sensitive error */ }
  return NextResponse.redirect(new URL(`/login?error=callback&next=${encodeURIComponent(next)}`, url.origin));
}
