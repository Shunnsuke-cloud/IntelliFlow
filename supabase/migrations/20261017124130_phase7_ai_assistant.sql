-- Phase 7: opt-in AI, atomic daily budgets, metadata-only audit. No existing data changes.
begin;
create table public.workspace_ai_settings (
 workspace_id uuid primary key references public.workspaces(id), enabled boolean not null default false,
 user_daily_limit integer not null default 10 check(user_daily_limit between 1 and 100),
 workspace_daily_limit integer not null default 50 check(workspace_daily_limit between 1 and 500),
 revision integer not null default 1, updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table public.ai_user_preferences (
 user_id uuid primary key references auth.users(id), enabled boolean not null default false,
 revision integer not null default 1, updated_at timestamptz not null default now()
);
create table public.ai_user_daily_usage (
 user_id uuid references auth.users(id), day date not null, used integer not null default 0 check(used>=0), primary key(user_id,day)
);
create table public.ai_workspace_daily_usage (
 workspace_id uuid references public.workspaces(id), day date not null, used integer not null default 0 check(used>=0), primary key(workspace_id,day)
);
create table public.ai_runs (
 id uuid primary key, client_request_id uuid not null, user_id uuid not null references auth.users(id), workspace_id uuid not null references public.workspaces(id),
 model text not null check(length(model) between 1 and 100), feature text not null check(feature in ('chat','flow','handoff')),
 status text not null default 'reserved' check(status in ('reserved','succeeded','failed')),
 settings_revision integer not null, preference_revision integer not null,
 error_code text check(error_code in ('rate_limit','timeout','upstream','invalid_output','access_changed','internal')),
 input_tokens integer check(input_tokens between 0 and 2000000), output_tokens integer check(output_tokens between 0 and 2000000), thinking_tokens integer check(thinking_tokens between 0 and 2000000),
 created_at timestamptz not null default now(), finished_at timestamptz, unique(user_id,client_request_id)
);
create index ai_runs_user_recent on public.ai_runs(user_id,created_at desc);
create index ai_runs_workspace_recent on public.ai_runs(workspace_id,created_at desc);
do $$ declare t text; begin
 foreach t in array array['workspace_ai_settings','ai_user_preferences','ai_user_daily_usage','ai_workspace_daily_usage','ai_runs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
-- Actual run IDs are server-generated and never exposed to the client. Only database
-- administrators can inspect this audit table; a browser cannot finish a live API run.
grant select on public.workspace_ai_settings,public.ai_user_preferences to authenticated;
create policy ai_settings_read on public.workspace_ai_settings for select to authenticated using(intelliflow_private.my_role(workspace_id) is not null);
create policy ai_preferences_read on public.ai_user_preferences for select to authenticated using(user_id=(select auth.uid()) and auth.jwt()->>'role'='authenticated' and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
create policy ai_runs_read on public.ai_runs for select to authenticated using(user_id=(select auth.uid()) and intelliflow_private.my_role(workspace_id) is not null);

create function intelliflow_private.ai_status(w uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); r text; s public.workspace_ai_settings%rowtype; user_used integer; workspace_used integer; day_utc date:=(now() at time zone 'UTC')::date;
begin
 r:=intelliflow_private.my_role(w);
 if u is null or r is null or auth.jwt()->>'role' is distinct from 'authenticated' then raise exception 'not authorized' using errcode='42501'; end if;
 select * into s from public.workspace_ai_settings where workspace_id=w;
 select used into user_used from public.ai_user_daily_usage where user_id=u and day=day_utc;
 select used into workspace_used from public.ai_workspace_daily_usage where workspace_id=w and day=day_utc;
 return jsonb_build_object('enabled',coalesce(s.enabled,false),'personal_enabled',coalesce((select enabled from public.ai_user_preferences where user_id=u),false),
 'can_manage',r in ('owner','admin'),'user_limit',coalesce(s.user_daily_limit,10),'workspace_limit',coalesce(s.workspace_daily_limit,50),
 'user_remaining',greatest(0,coalesce(s.user_daily_limit,10)-coalesce(user_used,0)),
 'workspace_remaining',greatest(0,coalesce(s.workspace_daily_limit,50)-coalesce(workspace_used,0)),
 'settings_revision',coalesce(s.revision,0),'preference_revision',coalesce((select revision from public.ai_user_preferences where user_id=u),0),
 'resets_at',((day_utc+1)::timestamp at time zone 'UTC'));
end $$;

create function intelliflow_private.ai_command(w uuid,op text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r text; state jsonb; run public.ai_runs%rowtype; day_utc date:=(now() at time zone 'UTC')::date; request_id uuid;
begin
 if u is null or auth.jwt()->>'role' is distinct from 'authenticated' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'authentication required' using errcode='42501'; end if;
 -- Same order for every reservation: global per-user lock, then workspace row.
 -- This serializes simultaneous requests across workspaces as well as within one workspace.
 perform pg_advisory_xact_lock(hashtextextended(u::text,717));
 perform 1 from public.workspaces where id=w for update;
 r:=intelliflow_private.my_role(w);
 if r is null and op<>'finish' then raise exception 'not authorized' using errcode='42501'; end if;
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'invalid payload' using errcode='22023'; end if;
 if op='settings' then
  if r not in ('owner','admin') then raise exception 'not authorized' using errcode='42501'; end if;
  if jsonb_typeof(p->'enabled') is distinct from 'boolean' or jsonb_typeof(p->'user_limit') is distinct from 'number' or jsonb_typeof(p->'workspace_limit') is distinct from 'number' or (p->>'user_limit')!~'^[0-9]+$' or (p->>'workspace_limit')!~'^[0-9]+$' or (p->>'enabled')::boolean and p->'consent' is distinct from 'true'::jsonb then raise exception 'invalid settings or missing consent' using errcode='22023'; end if;
  insert into public.workspace_ai_settings(workspace_id,enabled,user_daily_limit,workspace_daily_limit,updated_by)
  values(w,(p->>'enabled')::boolean,(p->>'user_limit')::integer,(p->>'workspace_limit')::integer,u)
  on conflict(workspace_id) do update set enabled=excluded.enabled,user_daily_limit=excluded.user_daily_limit,workspace_daily_limit=excluded.workspace_daily_limit,updated_by=u,updated_at=now(),revision=workspace_ai_settings.revision+1;
 elsif op='preference' then
  if jsonb_typeof(p->'enabled') is distinct from 'boolean' or (p->>'enabled')::boolean and p->'consent' is distinct from 'true'::jsonb then raise exception 'missing consent' using errcode='22023'; end if;
  insert into public.ai_user_preferences(user_id,enabled)values(u,(p->>'enabled')::boolean)
  on conflict(user_id) do update set enabled=excluded.enabled,revision=ai_user_preferences.revision+1,updated_at=now();
 elsif op='reserve' then
  state:=intelliflow_private.ai_status(w);
  if state->'enabled'<>'true'::jsonb or state->'personal_enabled'<>'true'::jsonb or p->'consent' is distinct from 'true'::jsonb then raise exception 'AI disabled or no consent' using errcode='42501'; end if;
  if p->>'feature' is null or p->>'feature' not in ('chat','flow','handoff') or p->>'feature'='handoff' and r='viewer' or coalesce(length(p->>'model'),0) not between 1 and 100 then raise exception 'invalid feature' using errcode='42501'; end if;
  request_id:=(p->>'request_id')::uuid; if request_id is null then raise exception 'missing request id' using errcode='22023'; end if;
  if exists(select 1 from public.ai_runs where user_id=u and client_request_id=request_id) then return jsonb_build_object('allowed',false,'reason','duplicate'); end if;
  if exists(select 1 from public.ai_runs where user_id=u and (status='reserved' and created_at>now()-interval '60 seconds' or error_code='rate_limit' and finished_at>now()-interval '60 seconds')) then return jsonb_build_object('allowed',false,'reason','busy'); end if;
  if (state->>'user_remaining')::integer=0 or (state->>'workspace_remaining')::integer=0 then return jsonb_build_object('allowed',false,'reason','limit'); end if;
  insert into public.ai_user_daily_usage(user_id,day,used) values(u,day_utc,1) on conflict(user_id,day) do update set used=ai_user_daily_usage.used+1;
  insert into public.ai_workspace_daily_usage(workspace_id,day,used) values(w,day_utc,1) on conflict(workspace_id,day) do update set used=ai_workspace_daily_usage.used+1;
  insert into public.ai_runs(id,client_request_id,user_id,workspace_id,model,feature,settings_revision,preference_revision)
  values((p->>'run_id')::uuid,request_id,u,w,p->>'model',p->>'feature',(state->>'settings_revision')::integer,(state->>'preference_revision')::integer);
  return jsonb_build_object('allowed',true,'status',intelliflow_private.ai_status(w));
 elsif op='finish' then
  select * into run from public.ai_runs where id=(p->>'run_id')::uuid and workspace_id=w and user_id=u for update;
  if run.id is null then raise exception 'not found' using errcode='P0002'; end if;
  if run.status<>'reserved' then raise exception 'already finished' using errcode='40001'; end if;
  if p->>'status' is null or p->>'status' not in ('succeeded','failed') then raise exception 'invalid status' using errcode='22023'; end if;
  if p->>'status'='succeeded' then
   -- Close the gap between post-generation revalidation and finalization while
   -- holding the same workspace lock used by membership and settings changes.
   state:=intelliflow_private.ai_status(w);
   if state->'enabled'<>'true'::jsonb or state->'personal_enabled'<>'true'::jsonb or (state->>'settings_revision')::integer<>run.settings_revision or (state->>'preference_revision')::integer<>run.preference_revision then raise exception 'AI access changed' using errcode='42501'; end if;
  end if;
  update public.ai_runs set status=p->>'status',error_code=p->>'error_code',input_tokens=(p->>'input_tokens')::integer,output_tokens=(p->>'output_tokens')::integer,thinking_tokens=(p->>'thinking_tokens')::integer,finished_at=now() where id=run.id;
 else raise exception 'invalid operation' using errcode='22023';
 end if;
 if r is null then return '{}'::jsonb; end if;
 return intelliflow_private.ai_status(w);
end $$;
create function public.ai_status(target_workspace uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select intelliflow_private.ai_status(target_workspace) $$;
create function public.ai_command(target_workspace uuid,operation text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select intelliflow_private.ai_command(target_workspace,operation,payload) $$;

-- A bounded projection under the caller's RLS. Never send revision snapshots or raw audit JSON.
create function public.ai_context(target_workspace uuid,source_ids uuid[],intent text default 'ids',query_filters jsonb default '{}') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare ids uuid[]:=coalesce(source_ids,array[]::uuid[]); result jsonb;
 kind_filter text:=coalesce(query_filters->>'kind',''); project_filter uuid:=nullif(query_filters->>'project','')::uuid;
 start_date date:=nullif(query_filters->>'from','')::date; end_date date:=nullif(query_filters->>'to','')::date;
begin
 if intelliflow_private.my_role(target_workspace) is null then raise exception 'not authorized' using errcode='42501'; end if;
 if intent not in ('ids','mine','handoffs_mine','assignments') or intent is null or cardinality(ids)>8 then raise exception 'invalid context' using errcode='22023'; end if;
 if jsonb_typeof(query_filters) is distinct from 'object' or kind_filter not in ('','issue','project','wiki','handoff') or (start_date is not null and end_date is not null and start_date>end_date) then raise exception 'invalid filters' using errcode='22023'; end if;
 if project_filter is not null and not exists(select 1 from public.flow_records f where f.id=project_filter and f.workspace_id=target_workspace and f.kind='project' and f.archived_at is null) then raise exception 'not found' using errcode='P0002'; end if;
 if intent='ids' then
  if exists(select 1 from unnest(ids) as requested(id) where not exists(select 1 from public.flow_records f where f.id=requested.id and f.workspace_id=target_workspace and f.archived_at is null)) then raise exception 'not found' using errcode='P0002'; end if;
 else
  select coalesce(array_agg(id),array[]::uuid[]) into ids from (
   select f.id from public.flow_records f where f.workspace_id=target_workspace and f.archived_at is null
   and (kind_filter='' or f.kind=kind_filter)
   and (start_date is null or f.updated_at >= (start_date::timestamp at time zone 'Asia/Tokyo'))
   and (end_date is null or f.updated_at < ((end_date+1)::timestamp at time zone 'Asia/Tokyo'))
   and (project_filter is null or f.id=project_filter or exists(select 1 from public.flow_edges e where e.workspace_id=target_workspace and ((e.source_id=f.id and e.target_id=project_filter) or (e.target_id=f.id and e.source_id=project_filter))))
   and (intent='mine' and exists(select 1 from public.issues i where i.resource_id=f.id and i.assignee_id=auth.uid() and i.status<>'done')
    or intent='handoffs_mine' and exists(select 1 from public.handoffs h where h.resource_id=f.id and h.recipient_id=auth.uid())
    or intent='assignments' and f.kind='issue' and exists(select 1 from public.resource_events e where e.resource_id=f.id and e.action='issue_update' and e.before_data->'assignee_id' is distinct from e.after_data->'assignee_id'))
   order by case when intent='mine' then (select i.due_on from public.issues i where i.resource_id=f.id) end nulls last,f.updated_at desc,f.id limit 8
  ) q;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',f.id,'workspace_id',f.workspace_id,'kind',f.kind,'title',f.title,'excerpt',left(f.body,1200),'version',f.version,'status',f.status,'issue_number',f.issue_number,'created_at',f.created_at,'updated_at',f.updated_at,'archived_at',f.archived_at,
  'details',case when f.kind='issue' then (select jsonb_build_object('priority',i.priority,'due_on',i.due_on,'assigned_to_me',i.assignee_id=auth.uid(),'project_id',case when i.project_id=any(ids) and exists(select 1 from public.flow_records p where p.id=i.project_id) then i.project_id else null end,
   'assignment_changes',(select coalesce(jsonb_agg(e.created_at),'[]') from (select e.created_at from public.resource_events e where e.resource_id=f.id and e.action='issue_update' and e.before_data->'assignee_id' is distinct from e.after_data->'assignee_id' order by e.created_at desc limit 5) e)) from public.issues i where i.resource_id=f.id)
  when f.kind='project' then (select jsonb_build_object('visible_issue_count',count(*),'visible_completed_count',count(*) filter(where i.status='done')) from public.issues i join public.resources r on r.id=i.resource_id where i.project_id=f.id and r.archived_at is null)
  when f.kind='handoff' then (select jsonb_build_object('addressed_to_me',h.recipient_id=auth.uid(),'content_version',h.current_version,'note','現在の本文の抜粋。送信当時のスナップショットは元ページで確認。') from public.handoffs h where h.resource_id=f.id)
  else '{}'::jsonb end || jsonb_build_object('relations',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from (
   select e.source_id,e.target_id,e.relation_type from public.flow_edges e where e.workspace_id=target_workspace and (e.source_id=f.id or e.target_id=f.id) and e.source_id=any(ids) and e.target_id=any(ids) order by e.id limit 4
  ) e))
 ) order by array_position(ids,f.id)),'[]') into result from public.flow_records f where f.workspace_id=target_workspace and f.id=any(ids) and f.archived_at is null;
 return result;
end $$;
revoke all on function intelliflow_private.ai_status(uuid),intelliflow_private.ai_command(uuid,text,jsonb),public.ai_status(uuid),public.ai_command(uuid,text,jsonb),public.ai_context(uuid,uuid[],text,jsonb) from public,anon,service_role;
grant execute on function intelliflow_private.ai_status(uuid),intelliflow_private.ai_command(uuid,text,jsonb),public.ai_status(uuid),public.ai_command(uuid,text,jsonb),public.ai_context(uuid,uuid[],text,jsonb) to authenticated;
commit;
