import { createBrowserClient } from '@supabase/ssr';
import { publicKey } from './supabase/config';
import type { Database } from './supabase/database';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = url && publicKey(key) ? createBrowserClient<Database>(url, key!) : null;
export default supabase;
export { supabase };
