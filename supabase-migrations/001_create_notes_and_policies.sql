-- 001_create_notes_and_policies.sql
-- Create `notes` table and recommended RLS policies for safe access.
-- Run this in Supabase SQL editor (Project -> SQL -> New query).

-- 1) Create table if not exists
create table if not exists public.notes (
  id text primary key,
  input text not null,
  saved_at timestamptz not null default now()
);

-- 2) Ensure row level security is enabled
alter table public.notes enable row level security;

-- 3) Policy: allow service_role to bypass (service_role always bypasses RLS)
-- No explicit policy required for service_role but keep comment for operators.

-- 4) Policy: allow authenticated users to insert/select/update their own notes
-- Note: This example assumes you will add a `owner` column (auth uid) to tie records to users.
-- If you want per-user access control, alter the table and add `owner text` then
-- use policies that compare auth.uid() with owner.

-- 5) Simple policy for demo: allow inserts and selects for authenticated role
create policy authenticated_select on public.notes
  for select using (auth.role() = 'authenticated');

create policy authenticated_insert on public.notes
  for insert with check (auth.role() = 'authenticated');

-- 6) (Optional) If you want to allow anonymous reads (public read):
-- create policy public_select on public.notes
--   for select using (true);

-- 7) Index to speed text search on `input` (optional)
create index if not exists idx_notes_input_text on public.notes using gin (to_tsvector('simple', input));

-- Notes:
-- - For production, prefer per-user `owner` column and policies using `auth.uid()`.
-- - Never grant broad insert/update/delete permissions to the `anon` role in production.
