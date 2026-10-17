import type { WorkspaceRole } from '../auth/policy';
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type Workspace = { id: string; name: string; description: string; created_by: string; created_at: string; updated_at: string };
export type Member = { workspace_id: string; user_id: string; role: WorkspaceRole; joined_at: string; left_at: string | null };
export type Invitation = { id: string; email: string; role: WorkspaceRole; expires_at: string };
type LegacyNote = { id: string; input: string; saved_at: string; owner: string };
type Table<Row> = { Row: Row; Insert: never; Update: never; Relationships: [] };
export type Database = { public: {
  Tables: { workspaces: Table<Workspace>; workspace_members: Table<Member>; notes: { Row: LegacyNote; Insert: Pick<LegacyNote, 'id' | 'input' | 'owner'>; Update: { input?: string }; Relationships: [] } };
  Views: Record<string, never>;
  Functions: {
    workspace_command: { Args: { operation: string; payload: Json }; Returns: Json };
    workspace_people: { Args: { target_workspace: string }; Returns: { user_id: string; display_name: string; role: WorkspaceRole; joined_at: string }[] };
    workspace_pending_invitations: { Args: { target_workspace: string }; Returns: Invitation[] };
    work_items_query: { Args: { target_workspace: string; collection: string; filters: Json }; Returns: Json };
    work_item_command: { Args: { target_workspace: string; operation: string; payload: Json }; Returns: Json };
  };
  Enums: Record<string, never>; CompositeTypes: Record<string, never>;
} };
