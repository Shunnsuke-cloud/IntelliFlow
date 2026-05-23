-- 002_add_owner_and_strict_rls.sql
-- Add `owner` column and create strict per-user RLS policies using auth.uid().
-- Intended for production: ties each row to the authenticated user's `auth.uid()`.
-- Run after 001_create_notes_and_policies.sql and after reviewing existing rows.

-- 1) Add `owner` column (nullable to avoid blocking existing data). Backfill as needed before making NOT NULL.
alter table public.notes add column if not exists owner text;

-- 2) Optional: index the owner column for faster lookups
create index if not exists idx_notes_owner on public.notes (owner);

-- 3) Drop permissive demo policies if they exist (safe to run)
drop policy if exists authenticated_select on public.notes;
drop policy if exists authenticated_insert on public.notes;

-- 4) Enable row level security (idempotent)
alter table public.notes enable row level security;

-- 5) Create strict per-user policies. These require the client's JWT to be present and
--    for auth.uid() to equal the owner column on the row.

-- SELECT: users may only select their own rows
create policy notes_select_owner on public.notes
  for select using (auth.uid() = owner);

-- INSERT: allow insert only when the client-supplied `owner` matches auth.uid()
create policy notes_insert_owner on public.notes
  for insert with check (auth.uid() = owner);

-- UPDATE: allow updating only rows owned by the caller, and ensure owner stays the same
create policy notes_update_owner on public.notes
  for update using (auth.uid() = owner) with check (auth.uid() = owner);

-- DELETE: allow deleting only rows owned by the caller
create policy notes_delete_owner on public.notes
  for delete using (auth.uid() = owner);

-- 6) Notes for operators:
-- - Existing rows without `owner` will become inaccessible to authenticated users until backfilled.
-- - To backfill existing rows to a specific admin account, run (service_role):
--     update public.notes set owner = '<ADMIN_UID>' where owner is null;
-- - After backfilling, you can make the column NOT NULL:
--     alter table public.notes alter column owner set not null;
-- - Service role (the database service key) bypasses RLS and can perform admin operations.
-- - Client applications must set the `owner` field to `auth.user().id` (or equivalent) when inserting.
-- - Alternatively, perform inserts/updates server-side using the user's JWT or a trusted server
--   process that enforces owner assignment.

-- End of migration
