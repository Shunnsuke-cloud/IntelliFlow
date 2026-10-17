import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { serverConfig } from './config';
import type { Database } from './database';
export async function serverSupabase(bearer?: string) {
  const { url, key } = serverConfig();
  if (bearer !== undefined) return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const jar = await cookies();
  return createServerClient<Database>(url, key, { cookies: {
    getAll: () => jar.getAll(),
    setAll: values => {
      // Server Components cannot write cookies; proxy refreshes before render.
      try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* read-only render */ }
    },
  } });
}
