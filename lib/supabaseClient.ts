import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

let supabase: ReturnType<typeof createClient> | null = null;

if (url && anonKey) {
  try {
    supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (e) {
    // If createClient throws in the browser for any reason, fall back to stub to avoid runtime crash
    // eslint-disable-next-line no-console
    console.warn('createClient failed, falling back to stub supabase client', { url, anonKey, error: String(e) });
    supabase = null;
  }
}

if (!supabase) {
  // fallback stub so importing modules during SSR doesn't crash.
  // Methods return empty/neutral responses; client components should still work when run in browser with NEXT_PUBLIC vars.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase = {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (_: any) => ({ subscription: { unsubscribe: () => {} } }),
      signInWithOtp: async (_: any) => ({ data: null, error: null }),
      signInWithOAuth: async (_: any) => ({ data: null, error: null }),
      signOut: async () => ({ error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  } as any;
}

export default supabase;
export { supabase };
