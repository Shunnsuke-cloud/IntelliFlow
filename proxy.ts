import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { serverConfig } from './lib/supabase/config';
import { validatedUser } from './lib/auth/policy';
export async function proxy(req: NextRequest) {
  let response = NextResponse.next({ request: req });
  try {
    const { url, key } = serverConfig();
    const client = createServerClient(url, key, { cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: values => {
        values.forEach(({ name, value }) => req.cookies.set(name, value));
        response = NextResponse.next({ request: req });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    } });
    const user = validatedUser(await client.auth.getUser());
    if (!user && req.nextUrl.pathname.startsWith('/app')) {
      const dest = new URL('/login', req.url);
      dest.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
      const redirect = NextResponse.redirect(dest);
      response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
      redirect.headers.set('Cache-Control', 'private, no-store');
      return redirect;
    }
  } catch {
    if (req.nextUrl.pathname.startsWith('/app')) return NextResponse.redirect(new URL('/login?error=config', req.url));
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/app/:path*', '/login', '/auth/:path*', '/api/:path*', '/invite'] };
