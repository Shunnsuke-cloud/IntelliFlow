-- Phase 2. Additive schema. Apply only after review/backup in an approved environment.
-- No user data is reassigned, copied, or removed. Legacy 002 is not rerun.
begin;
create schema if not exists intelliflow_private;
revoke all on schema intelliflow_private from public;
grant usage on schema intelliflow_private to authenticated;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','admin','member','viewer')),
  joined_at timestamptz not null default now(), left_at timestamptz,
  primary key (workspace_id,user_id)
);
create index workspace_members_active_user on public.workspace_members(user_id,workspace_id) where left_at is null;
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  email_normalized text not null check (length(email_normalized) between 3 and 254),
  role text not null check (role in ('admin','member','viewer')),
  token_hash text not null unique check (length(token_hash)=64),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '7 days'),
  accepted_at timestamptz, revoked_at timestamptz
);
create index workspace_invitations_pending on public.workspace_invitations(workspace_id,expires_at) where accepted_at is null and revoked_at is null;
create table public.workspace_audit_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  actor_id uuid not null references auth.users(id), action text not null,
  target_user_id uuid references auth.users(id), created_at timestamptz not null default now()
);
create index workspace_audit_recent on public.workspace_audit_events(workspace_id,created_at desc);

-- Future feature foundation. No feature writes are exposed in Phase 2.
-- Visibility is authoritative here; later feature commands must atomically maintain it.
create table public.resources (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  kind text not null check(kind in ('issue','project','wiki','handoff')),
  title text not null check(length(btrim(title)) between 1 and 200),
  visibility text not null default 'private' check(visibility in ('private','workspace')),
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  unique(workspace_id,id), unique(workspace_id,id,kind),
  foreign key(workspace_id,created_by) references public.workspace_members(workspace_id,user_id),
  foreign key(workspace_id,updated_by) references public.workspace_members(workspace_id,user_id)
);
create index resources_workspace_recent on public.resources(workspace_id,updated_at desc);
create index resources_workspace_kind on public.resources(workspace_id,kind) where archived_at is null;
create table public.projects (
  resource_id uuid primary key, workspace_id uuid not null,
  kind text not null default 'project' check(kind='project'), description text not null default '',
  status text not null default 'planned' check(status in ('planned','active','completed')),
  due_on date, unique(workspace_id,resource_id),
  foreign key(workspace_id,resource_id,kind) references public.resources(workspace_id,id,kind)
);
create table public.issues (
  resource_id uuid primary key, workspace_id uuid not null,
  kind text not null default 'issue' check(kind='issue'), project_id uuid,
  description text not null default '', status text not null default 'open' check(status in ('open','in_progress','blocked','done')),
  priority text not null default 'normal' check(priority in ('low','normal','high')), assignee_id uuid, due_on date,
  foreign key(workspace_id,resource_id,kind) references public.resources(workspace_id,id,kind),
  foreign key(workspace_id,project_id) references public.projects(workspace_id,resource_id),
  foreign key(workspace_id,assignee_id) references public.workspace_members(workspace_id,user_id)
);
create index issues_workspace_project on public.issues(workspace_id,project_id);
create table public.wiki_pages (
  resource_id uuid primary key, workspace_id uuid not null,
  kind text not null default 'wiki' check(kind='wiki'), project_id uuid, body text not null default '',
  status text not null default 'draft' check(status in ('draft','published')), current_revision integer not null default 1 check(current_revision>0),
  unique(workspace_id,resource_id),
  foreign key(workspace_id,resource_id,kind) references public.resources(workspace_id,id,kind),
  foreign key(workspace_id,project_id) references public.projects(workspace_id,resource_id)
);
create table public.wiki_revisions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, wiki_id uuid not null,
  revision integer not null check(revision>0), title text not null, body text not null,
  edited_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(wiki_id,revision), foreign key(workspace_id,wiki_id) references public.wiki_pages(workspace_id,resource_id)
);
create table public.handoffs (
  resource_id uuid primary key, workspace_id uuid not null,
  kind text not null default 'handoff' check(kind='handoff'), project_id uuid,
  sender_id uuid not null, recipient_id uuid, summary text not null default '',
  current_state text not null default '', next_actions text not null default '', risks text not null default '',
  status text not null default 'draft' check(status in ('draft','sent','accepted','cancelled')),
  current_version integer not null default 0 check(current_version>=0), due_on date,
  unique(workspace_id,resource_id),
  foreign key(workspace_id,resource_id,kind) references public.resources(workspace_id,id,kind),
  foreign key(workspace_id,project_id) references public.projects(workspace_id,resource_id),
  foreign key(workspace_id,sender_id) references public.workspace_members(workspace_id,user_id),
  foreign key(workspace_id,recipient_id) references public.workspace_members(workspace_id,user_id),
  check(status in ('draft','cancelled') or (recipient_id is not null and current_version>0))
);
create table public.handoff_items (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, handoff_id uuid not null, resource_id uuid not null,
  note text not null default '', sort_order integer not null default 0,
  unique(handoff_id,resource_id), check(handoff_id<>resource_id),
  foreign key(workspace_id,handoff_id) references public.handoffs(workspace_id,resource_id),
  foreign key(workspace_id,resource_id) references public.resources(workspace_id,id)
);
create table public.handoff_versions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, handoff_id uuid not null,
  version integer not null check(version>0), snapshot jsonb not null check(jsonb_typeof(snapshot)='object'), sent_at timestamptz not null default now(),
  unique(handoff_id,version), foreign key(workspace_id,handoff_id) references public.handoffs(workspace_id,resource_id)
);
create table public.resource_relations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null, source_id uuid not null, target_id uuid not null,
  relation_type text not null check(relation_type in ('references','blocks','follows','related_to')),
  origin text not null default 'manual' check(origin in ('manual','ai_accepted')), created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), archived_at timestamptz,
  check(source_id<>target_id), check(relation_type<>'related_to' or source_id<target_id),
  unique(workspace_id,source_id,target_id,relation_type),
  foreign key(workspace_id,source_id) references public.resources(workspace_id,id),
  foreign key(workspace_id,target_id) references public.resources(workspace_id,id)
);
create index resource_relations_target on public.resource_relations(workspace_id,target_id);

-- Deferred enforcement allows resource + subtype to be created in one transaction.
create function intelliflow_private.require_subtype() returns trigger
language plpgsql set search_path='' as $$
declare r uuid; w uuid; k text; subtype_table text; present boolean;
begin
 if tg_table_name='resources' then r:=new.id; w:=new.workspace_id;
 else r:=coalesce(new.resource_id,old.resource_id); w:=coalesce(new.workspace_id,old.workspace_id); end if;
 select kind into k from public.resources where workspace_id=w and id=r;
 if not found then return null; end if;
 subtype_table:=case k when 'project' then 'projects' when 'issue' then 'issues' when 'wiki' then 'wiki_pages' when 'handoff' then 'handoffs' end;
 execute format('select exists(select 1 from public.%I where workspace_id=$1 and resource_id=$2)',subtype_table) into present using w,r;
 if not present then raise exception 'resource subtype is required' using errcode='23514'; end if;
 return null;
end $$;
create constraint trigger resource_subtype_required after insert or update on public.resources deferrable initially deferred for each row execute function intelliflow_private.require_subtype();
do $$ declare t text; begin
 foreach t in array array['projects','issues','wiki_pages','handoffs'] loop
  execute format('create constraint trigger subtype_required after insert or update or delete on public.%I deferrable initially deferred for each row execute function intelliflow_private.require_subtype()',t);
 end loop;
end $$;

-- Only internal lookups/control operations use DEFINER, to break membership RLS recursion
-- and atomically bootstrap ownership. No service key is used; every call checks auth.uid().
create function intelliflow_private.my_role(w uuid) returns text
language sql stable security definer set search_path='' as $$
 select role from public.workspace_members
 where workspace_id=w and user_id=(select auth.uid()) and left_at is null
 and (select auth.jwt()->>'role')='authenticated'
 and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false)
$$;
create function intelliflow_private.can_read_resource(w uuid,r uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.resources where workspace_id=w and id=r
 and intelliflow_private.my_role(w) is not null
 and (visibility='workspace' or created_by=(select auth.uid()) or intelliflow_private.my_role(w) in ('owner','admin')))
$$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.workspace_audit_events enable row level security;
create policy workspaces_read on public.workspaces for select to authenticated using(intelliflow_private.my_role(id) is not null);
create policy members_read on public.workspace_members for select to authenticated using(intelliflow_private.my_role(workspace_id) is not null);
-- Invitations are accessible only through commands; even their hashes are not exposed.
create policy audit_read on public.workspace_audit_events for select to authenticated using(intelliflow_private.my_role(workspace_id) in ('owner','admin'));

do $$ declare t text; parent_col text; begin
 foreach t in array array['resources','projects','issues','wiki_pages','wiki_revisions','handoffs','handoff_items','handoff_versions','resource_relations'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from anon, authenticated',t);
   execute format('grant select on public.%I to authenticated',t);
   if t='resources' then
     execute 'create policy resource_read on public.resources for select to authenticated using(intelliflow_private.can_read_resource(workspace_id,id))';
   elsif t='resource_relations' then
     execute 'create policy relation_read on public.resource_relations for select to authenticated using(intelliflow_private.can_read_resource(workspace_id,source_id) and intelliflow_private.can_read_resource(workspace_id,target_id))';
   elsif t='handoff_items' then
     execute 'create policy item_read on public.handoff_items for select to authenticated using(intelliflow_private.can_read_resource(workspace_id,handoff_id) and intelliflow_private.can_read_resource(workspace_id,resource_id))';
   else
     parent_col := case when t='wiki_revisions' then 'wiki_id' when t='handoff_versions' then 'handoff_id' else 'resource_id' end;
     execute format('create policy feature_read on public.%I for select to authenticated using(intelliflow_private.can_read_resource(workspace_id,%I))',t,parent_col);
   end if;
 end loop;
end $$;
revoke all on public.workspaces,public.workspace_members,public.workspace_invitations,public.workspace_audit_events from anon,authenticated;
grant select on public.workspaces,public.workspace_members,public.workspace_audit_events to authenticated;

create function intelliflow_private.command(operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid := auth.uid(); w uuid; target uuid; actor_role text; target_role text; next_role text;
 invitation public.workspace_invitations%rowtype; user_email text; confirmed timestamptz;
begin
 if u is null or (auth.jwt()->>'role') is distinct from 'authenticated' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
   raise exception 'authentication required' using errcode='42501';
 end if;
 if operation='create' then
   if length(btrim(coalesce(payload->>'name',''))) not between 1 and 80 or length(coalesce(payload->>'description',''))>2000 then raise exception 'invalid input' using errcode='22023'; end if;
   insert into public.workspaces(name,description,created_by) values(btrim(payload->>'name'),coalesce(payload->>'description',''),u) returning id into w;
   insert into public.workspace_members(workspace_id,user_id,role) values(w,u,'owner');
 elsif operation='accept' then
   if coalesce(payload->>'token','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid token' using errcode='22023'; end if;
   select * into invitation from public.workspace_invitations where token_hash=encode(sha256(convert_to(payload->>'token','UTF8')),'hex');
   if not found then raise exception 'invitation not found' using errcode='P0002'; end if;
   w := invitation.workspace_id;
   perform 1 from public.workspaces where id=w for update;
   select * into invitation from public.workspace_invitations where id=invitation.id for update;
   if invitation.accepted_at is not null or invitation.revoked_at is not null or invitation.expires_at<=now() then raise exception 'invitation expired' using errcode='P0002'; end if;
   select lower(btrim(email)),email_confirmed_at into user_email,confirmed from auth.users where id=u;
   if confirmed is null or user_email is distinct from invitation.email_normalized then raise exception 'invitation identity mismatch' using errcode='42501'; end if;
   select role into actor_role from public.workspace_members where workspace_id=w and user_id=invitation.invited_by and left_at is null;
   if actor_role is null or actor_role not in ('owner','admin') or (actor_role='admin' and invitation.role='admin') then raise exception 'inviter no longer authorized' using errcode='42501'; end if;
   if exists(select 1 from public.workspace_members where workspace_id=w and user_id=u and left_at is null) then raise exception 'already a member' using errcode='23505'; end if;
   insert into public.workspace_members(workspace_id,user_id,role) values(w,u,invitation.role)
   on conflict(workspace_id,user_id) do update set role=excluded.role,left_at=null,joined_at=now();
   update public.workspace_invitations set accepted_at=now() where id=invitation.id;
 else
   w := (payload->>'workspace_id')::uuid;
   perform 1 from public.workspaces where id=w for update;
   actor_role := intelliflow_private.my_role(w);
   if actor_role is null or actor_role not in ('owner','admin') then raise exception 'not authorized' using errcode='42501'; end if;
   if operation='update' then
     if length(btrim(coalesce(payload->>'name',''))) not between 1 and 80 or length(coalesce(payload->>'description',''))>2000 then raise exception 'invalid input' using errcode='22023'; end if;
     update public.workspaces set name=btrim(payload->>'name'),description=coalesce(payload->>'description',''),updated_at=now() where id=w;
   elsif operation='invite' then
     next_role := payload->>'role';
     if next_role is null or next_role not in ('admin','member','viewer') or (actor_role='admin' and next_role='admin') then raise exception 'invalid role' using errcode='42501'; end if;
     if coalesce(payload->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(payload->>'email')>254 or coalesce(payload->>'token','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid invitation' using errcode='22023'; end if;
     -- Reissuing a link invalidates the previous pending link for that email.
     update public.workspace_invitations set revoked_at=now() where workspace_id=w and email_normalized=lower(btrim(payload->>'email')) and accepted_at is null and revoked_at is null;
     insert into public.workspace_invitations(workspace_id,email_normalized,role,token_hash,invited_by)
       values(w,lower(btrim(payload->>'email')),next_role,encode(sha256(convert_to(payload->>'token','UTF8')),'hex'),u);
   elsif operation in ('set_role','remove') then
     target := (payload->>'user_id')::uuid;
     select role into target_role from public.workspace_members where workspace_id=w and user_id=target and left_at is null;
     if not found then raise exception 'member not found' using errcode='P0002'; end if;
     next_role := case when operation='remove' then target_role else payload->>'role' end;
     if next_role is null or next_role not in ('owner','admin','member','viewer') then raise exception 'invalid role' using errcode='22023'; end if;
     if actor_role='admin' and (target_role in ('owner','admin') or next_role in ('owner','admin')) then raise exception 'cannot manage elevated role' using errcode='42501'; end if;
     if target_role='owner' and (operation='remove' or next_role<>'owner') and (select count(*) from public.workspace_members where workspace_id=w and role='owner' and left_at is null)<=1 then raise exception 'last owner' using errcode='23514'; end if;
     update public.workspace_members set role=next_role,left_at=case when operation='remove' then now() else null end where workspace_id=w and user_id=target;
   elsif operation='revoke' then
     select * into invitation from public.workspace_invitations where id=(payload->>'invitation_id')::uuid and workspace_id=w for update;
     if not found then raise exception 'invitation not found' using errcode='P0002'; end if;
     if actor_role='admin' and invitation.role='admin' then raise exception 'cannot revoke elevated invitation' using errcode='42501'; end if;
     update public.workspace_invitations set revoked_at=now() where id=invitation.id;
   else raise exception 'invalid operation' using errcode='22023';
   end if;
 end if;
 insert into public.workspace_audit_events(workspace_id,actor_id,action,target_user_id) values(w,u,operation,target);
 return jsonb_build_object('workspace_id',w);
end $$;

create function public.workspace_command(operation text,payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select intelliflow_private.command(operation,payload) $$;
create function intelliflow_private.people(w uuid) returns table(user_id uuid,display_name text,role text,joined_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if intelliflow_private.my_role(w) is null then raise exception 'not authorized' using errcode='42501'; end if;
 return query select m.user_id,
   coalesce(nullif(left(u.raw_user_meta_data->>'full_name',80),''),'ユーザー '||left(m.user_id::text,8)),m.role,m.joined_at
   from public.workspace_members m join auth.users u on u.id=m.user_id where m.workspace_id=w and m.left_at is null order by m.joined_at;
end $$;
create function public.workspace_people(target_workspace uuid) returns table(user_id uuid,display_name text,role text,joined_at timestamptz)
language sql stable security invoker set search_path='' as $$ select * from intelliflow_private.people(target_workspace) $$;

create function intelliflow_private.pending_invitations(w uuid) returns table(id uuid,email text,role text,expires_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare actor_role text := intelliflow_private.my_role(w);
begin
 if actor_role is null or actor_role not in ('owner','admin') then raise exception 'not authorized' using errcode='42501'; end if;
 return query select i.id,i.email_normalized,i.role,i.expires_at from public.workspace_invitations i
 where i.workspace_id=w and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()
 and (actor_role='owner' or i.role in ('member','viewer')) order by i.created_at desc;
end $$;
create function public.workspace_pending_invitations(target_workspace uuid) returns table(id uuid,email text,role text,expires_at timestamptz)
language sql stable security invoker set search_path='' as $$ select * from intelliflow_private.pending_invitations(target_workspace) $$;

revoke all on all functions in schema intelliflow_private from public,anon;
grant execute on all functions in schema intelliflow_private to authenticated;
revoke all on function public.workspace_command(text,jsonb),public.workspace_people(uuid),public.workspace_pending_invitations(uuid) from public,anon;
grant execute on function public.workspace_command(text,jsonb),public.workspace_people(uuid),public.workspace_pending_invitations(uuid) to authenticated;

-- Legacy notes: fix uuid/text comparison without converting/reassigning any owner.
-- Replace all old policies (permissive policies combine with OR).
do $$ declare p record; begin
 if to_regclass('public.notes') is not null then
   alter table public.notes add column if not exists owner text;
   alter table public.notes enable row level security;
   for p in select policyname from pg_policies where schemaname='public' and tablename='notes' loop
     execute format('drop policy %I on public.notes',p.policyname);
   end loop;
   create policy phase2_notes_owner on public.notes for all to authenticated
     using(owner::text=(select auth.uid())::text and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false))
     with check(owner::text=(select auth.uid())::text and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));
   revoke all on public.notes from anon;
   grant select,insert,update,delete on public.notes to authenticated;
 end if;
end $$;
commit;
