import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './supabase/database';
import { workError } from './work-items';
export async function flowQuery<T>(client: SupabaseClient<Database>, workspaceId: string, collection: string, filters: Record<string, Json> = {}): Promise<T> {
  const { data, error } = await client.rpc('flow_query', { target_workspace: workspaceId, collection, filters });
  if (error) throw workError(error); return data as T;
}
