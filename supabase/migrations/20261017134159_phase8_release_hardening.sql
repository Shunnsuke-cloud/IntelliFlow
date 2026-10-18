-- Phase 8: remove non-CRUD privileges on legacy notes and close backup access.
-- Additive access hardening only: no row changes, ownership reassignment, or schema removal.
begin;
do $$ begin
 if to_regclass('public.notes') is not null then
  revoke all on public.notes from anon;
  revoke truncate,references,trigger on public.notes from authenticated;
  grant select,insert,update,delete on public.notes to authenticated;
 end if;
 if to_regclass('public.notes_backup') is not null then
  alter table public.notes_backup enable row level security;
  revoke all on public.notes_backup from anon,authenticated;
 end if;
end $$;
commit;
