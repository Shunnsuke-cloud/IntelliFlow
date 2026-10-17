-- Phase 6: immutable send versions and recipient-bound receipts. No legacy rows deleted.
begin;
alter table public.handoffs add column completed_work text not null default '';
alter table public.handoffs add column pending_work text not null default '';
alter table public.handoffs drop constraint handoffs_status_check;
alter table public.handoffs add constraint handoffs_status_check check(status in ('draft','sent','accepted','completed','cancelled'));
alter table public.handoff_versions add column sender_id uuid;
alter table public.handoff_versions add column recipient_id uuid;
alter table public.handoff_versions add column change_reason text not null default '';
alter table public.handoff_versions add constraint handoff_version_identity unique(workspace_id,handoff_id,version);
alter table public.handoff_versions add constraint handoff_version_sender foreign key(workspace_id,sender_id) references public.workspace_members(workspace_id,user_id);
alter table public.handoff_versions add constraint handoff_version_recipient foreign key(workspace_id,recipient_id) references public.workspace_members(workspace_id,user_id);
create table public.handoff_receipts (
 workspace_id uuid not null,handoff_id uuid not null,version integer not null,recipient_id uuid not null,accepted_at timestamptz not null default now(),completed_at timestamptz,
 primary key(handoff_id,version),
 foreign key(workspace_id,handoff_id,version) references public.handoff_versions(workspace_id,handoff_id,version),
 foreign key(workspace_id,recipient_id) references public.workspace_members(workspace_id,user_id)
);
alter table public.handoff_receipts enable row level security;
revoke all on public.handoff_receipts from public,anon,authenticated;
grant select on public.handoff_receipts to authenticated;
create policy handoff_receipt_read on public.handoff_receipts for select to authenticated using(intelliflow_private.can_read_resource(workspace_id,handoff_id));
create index handoffs_inbox on public.handoffs(workspace_id,recipient_id,status);
create index handoffs_sender on public.handoffs(workspace_id,sender_id,status);
create index handoff_items_target on public.handoff_items(workspace_id,resource_id,handoff_id);
create index handoff_versions_recent on public.handoff_versions(workspace_id,handoff_id,version desc);
-- Legacy draft visibility is normalized conservatively; content and old snapshots are retained.
update public.resources r set visibility=case when h.status in ('draft','cancelled') then 'private' else 'workspace' end from public.handoffs h where h.resource_id=r.id;

create view public.handoff_records with(security_invoker=true) as
 select r.id,r.workspace_id,r.title,r.version,r.created_at,r.updated_at,r.archived_at,h.sender_id,h.recipient_id,h.summary,h.current_state,h.completed_work,h.pending_work,h.risks,h.next_actions,h.status,h.current_version
 from public.resources r join public.handoffs h on h.resource_id=r.id and h.workspace_id=r.workspace_id;
revoke all on public.handoff_records from public,anon;
grant select on public.handoff_records to authenticated;

-- Called only from the authorized, workspace-locked send command.
create function intelliflow_private.handoff_snapshot(w uuid,target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; links jsonb; h public.handoffs%rowtype; r public.resources%rowtype;
begin
 if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or coalesce(intelliflow_private.my_role(w),'') not in ('owner','admin','member') then raise exception 'not authorized' using errcode='42501'; end if;
 select * into h from public.handoffs where workspace_id=w and resource_id=target;
 if not found or h.sender_id<>auth.uid() then raise exception 'not authorized' using errcode='42501'; end if;
 select * into r from public.resources where id=target;
 if exists(select 1 from public.handoff_items hi join public.resources rr on rr.id=hi.resource_id left join public.wiki_pages p on p.resource_id=rr.id
  where hi.handoff_id=target and (rr.workspace_id<>w or rr.archived_at is not null or rr.visibility<>'workspace' or (rr.kind='wiki' and p.status<>'published') or rr.kind not in ('issue','project','wiki'))) then raise exception 'only shared active resources can be sent' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',rr.id,'kind',rr.kind,'title',rr.title,'version',rr.version,'updated_at',rr.updated_at,'note',hi.note,
  'body',left(coalesce(i.description,p.description,wi.body,''),6000),'truncated',length(coalesce(i.description,p.description,wi.body,''))>6000,
  'status',coalesce(i.status,p.status,wi.status),'issue_number',i.issue_number,'priority',i.priority,'due_on',coalesce(i.due_on,p.due_on)) order by hi.sort_order,rr.id),'[]') into links
 from public.handoff_items hi join public.resources rr on rr.id=hi.resource_id left join public.issues i on i.resource_id=rr.id left join public.projects p on p.resource_id=rr.id left join public.wiki_pages wi on wi.resource_id=rr.id where hi.workspace_id=w and hi.handoff_id=target;
 result:=jsonb_build_object('title',r.title,'sender_id',h.sender_id,'recipient_id',h.recipient_id,
  'sender_name',(select display_name from public.workspace_people(w) where user_id=h.sender_id),'recipient_name',(select display_name from public.workspace_people(w) where user_id=h.recipient_id),
  'summary',h.summary,'current_state',h.current_state,'completed_work',h.completed_work,'pending_work',h.pending_work,'risks',h.risks,'next_actions',h.next_actions,'related',links);
 return result;
end $$;
-- Internal snapshot helper must not be callable by application roles.
revoke all on function intelliflow_private.handoff_snapshot(uuid,uuid) from public,anon,authenticated;

create function intelliflow_private.handoff_command(w uuid,operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); role_name text; target uuid; h public.handoffs%rowtype; r public.resources%rowtype; recipient uuid; linked uuid; ids uuid[]; snapshot jsonb; key text; sent_version integer; reason text;
begin
 if u is null or auth.jwt()->>'role' is distinct from 'authenticated' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'authentication required' using errcode='42501'; end if;
 perform 1 from public.workspaces where id=w for update;
 role_name:=intelliflow_private.my_role(w);
 if role_name is null then raise exception 'not authorized' using errcode='42501'; end if;
 if operation is null or operation not in ('create','update','send','revise','accept','complete') or jsonb_typeof(payload) is distinct from 'object' then raise exception 'invalid operation' using errcode='22023'; end if;
 if operation='create' then
  if role_name='viewer' then raise exception 'not authorized' using errcode='42501'; end if;
  target:=gen_random_uuid();
  insert into public.resources(id,workspace_id,kind,title,visibility,created_by,updated_by) values(target,w,'handoff',btrim(payload->>'title'),'private',u,u) returning * into r;
  insert into public.handoffs(resource_id,workspace_id,sender_id) values(target,w,u) returning * into h;
 else
  target:=(payload->>'id')::uuid;
  select * into r from public.resources where workspace_id=w and id=target and kind='handoff' and archived_at is null for update;
  if not found or not intelliflow_private.can_read_resource(w,target) then raise exception 'not found' using errcode='P0002'; end if;
  select * into h from public.handoffs where resource_id=target;
  if r.version is distinct from (payload->>'expected_version')::integer then raise exception 'version conflict' using errcode='40001'; end if;
 end if;
 if operation in ('accept','complete') then
  sent_version:=(payload->>'content_version')::integer;
  if h.recipient_id is distinct from u then raise exception 'only recipient can acknowledge' using errcode='42501'; end if;
  if h.current_version is distinct from sent_version or not exists(select 1 from public.handoff_versions v where v.handoff_id=target and v.version=sent_version and v.recipient_id=u) then raise exception 'version conflict' using errcode='40001'; end if;
  if operation='accept' then
   if h.status<>'sent' then raise exception 'not awaiting confirmation' using errcode='23514'; end if;
   insert into public.handoff_receipts(workspace_id,handoff_id,version,recipient_id) values(w,target,sent_version,u);
   update public.handoffs set status='accepted' where resource_id=target;
  else
   if h.status<>'accepted' then raise exception 'not accepted' using errcode='23514'; end if;
   update public.handoff_receipts set completed_at=now() where workspace_id=w and handoff_id=target and version=sent_version and recipient_id=u and completed_at is null;
   if not found then raise exception 'receipt not found' using errcode='P0002'; end if;
   update public.handoffs set status='completed' where resource_id=target;
  end if;
 else
  if role_name='viewer' or h.sender_id<>u then raise exception 'only sender can edit or send' using errcode='42501'; end if;
  if operation in ('update','send') and h.status<>'draft' or operation='revise' and h.status not in ('sent','accepted') then raise exception 'invalid state' using errcode='23514'; end if;
  if operation in ('create','update','revise') then
   if length(btrim(coalesce(payload->>'title',''))) not between 1 and 200 then raise exception 'invalid title' using errcode='22023'; end if;
   foreach key in array array['summary','current_state','completed_work','pending_work','risks','next_actions'] loop
    if jsonb_typeof(payload->key) is distinct from 'string' or length(payload->>key)>10000 then raise exception 'invalid text' using errcode='22023'; end if;
   end loop;
   recipient:=nullif(payload->>'recipient_id','')::uuid;
   if recipient is not null and (recipient=u or not exists(select 1 from public.workspace_members where workspace_id=w and user_id=recipient and left_at is null)) then raise exception 'invalid recipient' using errcode='42501'; end if;
   if jsonb_typeof(payload->'related_ids') is distinct from 'array' or jsonb_array_length(payload->'related_ids')>30 then raise exception 'invalid links' using errcode='22023'; end if;
   select coalesce(array_agg(distinct id::uuid),array[]::uuid[]) into ids from jsonb_array_elements_text(payload->'related_ids') id;
   foreach linked in array ids loop
    if not exists(select 1 from public.resources rr where rr.workspace_id=w and rr.id=linked and rr.kind in ('issue','project','wiki') and rr.archived_at is null and intelliflow_private.can_read_resource(w,linked)) then raise exception 'invalid related resource' using errcode='42501'; end if;
   end loop;
   if operation<>'create' and exists(select 1 from public.handoff_items hi where hi.handoff_id=target and not intelliflow_private.can_read_resource(w,hi.resource_id)) then raise exception 'related information is no longer readable' using errcode='42501'; end if;
   update public.handoffs set recipient_id=recipient,summary=payload->>'summary',current_state=payload->>'current_state',completed_work=payload->>'completed_work',pending_work=payload->>'pending_work',risks=payload->>'risks',next_actions=payload->>'next_actions',
    project_id=(select rr.id from public.resources rr where rr.id=any(ids) and rr.kind='project' order by rr.id limit 1) where resource_id=target returning * into h;
   update public.resources set title=btrim(payload->>'title') where id=target returning * into r;
   delete from public.handoff_items where workspace_id=w and handoff_id=target and not(resource_id=any(ids));
   insert into public.handoff_items(workspace_id,handoff_id,resource_id) select w,target,id from unnest(ids) id on conflict(handoff_id,resource_id) do nothing;
  end if;
  if operation in ('send','revise') then
   if h.recipient_id is null or h.recipient_id=u or not exists(select 1 from public.workspace_members where workspace_id=w and user_id=h.recipient_id and left_at is null) then raise exception 'invalid recipient' using errcode='42501'; end if;
   if btrim(h.summary)='' then raise exception 'summary required' using errcode='22023'; end if;
   reason:=btrim(coalesce(payload->>'change_reason',''));
   if length(reason)>1000 or (operation='revise' and reason='') then raise exception 'change reason required' using errcode='22023'; end if;
   snapshot:=intelliflow_private.handoff_snapshot(w,target);
   sent_version:=h.current_version+1;
   insert into public.handoff_versions(workspace_id,handoff_id,version,snapshot,sender_id,recipient_id,change_reason) values(w,target,sent_version,snapshot,u,h.recipient_id,reason);
   update public.handoffs set current_version=sent_version,status='sent' where resource_id=target;
   update public.resources set visibility='workspace' where id=target;
  end if;
 end if;
 update public.resources set version=case when operation='create' then version else version+1 end,updated_by=u,updated_at=now() where id=target returning * into r;
 insert into public.resource_events(workspace_id,resource_id,actor_id,action,after_data) values(w,target,u,'handoff_'||operation,jsonb_build_object('content_version',coalesce(sent_version,h.current_version),'change_reason',coalesce(reason,'')));
 return jsonb_build_object('id',target,'version',r.version,'content_version',coalesce(sent_version,h.current_version));
end $$;
create function public.handoff_command(target_workspace uuid,operation text,payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select intelliflow_private.handoff_command(target_workspace,operation,payload) $$;
revoke all on function intelliflow_private.handoff_command(uuid,text,jsonb) from public,anon;
grant execute on function intelliflow_private.handoff_command(uuid,text,jsonb) to authenticated;
revoke all on function public.handoff_command(uuid,text,jsonb) from public,anon;
grant execute on function public.handoff_command(uuid,text,jsonb) to authenticated;

create function public.handoff_query(target_workspace uuid,collection text,filters jsonb default '{}') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare target uuid; q text:=btrim(coalesce(filters->>'q','')); pattern text; offset_n integer:=coalesce((filters->>'offset')::integer,0); results jsonb; more boolean; data jsonb; refs jsonb; source public.flow_records%rowtype; candidates uuid[]; states text[]:=array['draft','sent','accepted','completed','cancelled'];
begin
 if intelliflow_private.my_role(target_workspace) is null then raise exception 'not authorized' using errcode='42501'; end if;
 if jsonb_typeof(filters) is distinct from 'object' or collection is null or collection not in ('list','detail','version','seed','backlinks') or length(q)>200 or offset_n not between 0 and 10000 or coalesce(filters->>'status','')<>'' and not(filters->>'status'=any(states)) then raise exception 'invalid filter' using errcode='22023'; end if;
 pattern:='%'||replace(replace(replace(q,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%';
 if collection in ('detail','version') then
  target:=(filters->>'id')::uuid;
  select to_jsonb(h) into data from public.handoff_records h where workspace_id=target_workspace and id=target;
  if data is null then raise exception 'not found' using errcode='P0002'; end if;
  if collection='version' then
   select to_jsonb(v) into results from public.handoff_versions v where workspace_id=target_workspace and handoff_id=target and version=(filters->>'version')::integer;
   if results is null then raise exception 'not found' using errcode='P0002'; end if;return results;
  end if;
  return jsonb_build_object('item',data,
   'related',(select coalesce(jsonb_agg((to_jsonb(r)-'body')||jsonb_build_object('excerpt',left(r.body,320)) order by r.kind,r.title),'[]') from public.handoff_items hi join public.flow_records r on r.id=hi.resource_id where hi.workspace_id=target_workspace and hi.handoff_id=target),
   'current_snapshot',(select to_jsonb(v) from public.handoff_versions v where v.workspace_id=target_workspace and v.handoff_id=target and v.version=(data->>'current_version')::integer),
   'versions',(select coalesce(jsonb_agg(to_jsonb(v)-'snapshot' order by v.version desc),'[]') from (select * from public.handoff_versions where workspace_id=target_workspace and handoff_id=target order by version desc limit 100) v),
   'receipts',(select coalesce(jsonb_agg(to_jsonb(c) order by c.version desc),'[]') from (select * from public.handoff_receipts where workspace_id=target_workspace and handoff_id=target order by version desc limit 100) c),
   'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]') from (select id,actor_id,action,after_data,created_at from public.resource_events where workspace_id=target_workspace and resource_id=target order by created_at desc limit 100) e));
 elsif collection='seed' then
  target:=(filters->>'source_id')::uuid;
  select * into source from public.flow_records where workspace_id=target_workspace and id=target and kind in ('issue','project') and archived_at is null;
  if not found then raise exception 'not found' using errcode='P0002'; end if;
  select array[target]||coalesce(array_agg(id),array[]::uuid[]) into candidates from (
   select distinct rr.id from public.flow_edges e join public.flow_records rr on rr.id=case when e.source_id=target then e.target_id else e.source_id end where e.workspace_id=target_workspace and (e.source_id=target or e.target_id=target) and rr.kind in ('issue','project','wiki') and rr.archived_at is null order by rr.id limit 29
  ) linked;
  select coalesce(jsonb_agg((to_jsonb(r)-'body')||jsonb_build_object('excerpt',left(r.body,320)) order by r.kind,r.title),'[]') into refs from public.flow_records r where r.workspace_id=target_workspace and r.id=any(candidates) and r.archived_at is null and r.kind in ('issue','project','wiki');
  return jsonb_build_object('title',left(source.title||'の引き継ぎ',200),'summary',source.body,
   'current_state',case when source.kind='project' then (select '完了 '||completed_count||'件 / 全'||issue_count||'件（閲覧可能な課題）' from public.project_records where id=target) else source.status end,
   'completed_work',case when source.kind='project' then coalesce((select string_agg(title,E'\n') from public.flow_records where id=any(candidates) and kind='issue' and status='done'),'') when source.status='done' then source.title else '' end,
   'pending_work',case when source.kind='project' then coalesce((select string_agg(title,E'\n') from public.flow_records where id=any(candidates) and kind='issue' and status<>'done'),'') when source.status<>'done' then source.title else '' end,'risks','','next_actions','','related',refs);
 end if;
 if collection='backlinks' then
  target:=(filters->>'id')::uuid;
  if not intelliflow_private.can_read_resource(target_workspace,target) then raise exception 'not found' using errcode='P0002'; end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(h)-'summary'-'current_state'-'completed_work'-'pending_work'-'risks'-'next_actions' order by h.updated_at desc,h.id desc),'[]'),count(*)>20 into results,more from (
  select h.* from public.handoff_records h where h.workspace_id=target_workspace and h.archived_at is null
  and (q='' or (h.title||' '||h.summary||' '||h.current_state||' '||h.completed_work||' '||h.pending_work||' '||h.risks||' '||h.next_actions) ilike pattern
   or exists(select 1 from public.handoff_versions v where v.workspace_id=target_workspace and v.handoff_id=h.id and (
    (coalesce(v.snapshot->>'title','')||' '||coalesce(v.snapshot->>'summary','')||' '||coalesce(v.snapshot->>'sender_name','')||' '||coalesce(v.snapshot->>'recipient_name','')) ilike pattern
    or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(v.snapshot->'related')='array' then v.snapshot->'related' else '[]' end) link where link->>'title' ilike pattern))))
  and (coalesce(filters->>'status','')='' or h.status=filters->>'status')
  and (coalesce(filters->>'sender','')='' or h.sender_id=(filters->>'sender')::uuid)
  and (coalesce(filters->>'recipient','')='' or h.recipient_id=(filters->>'recipient')::uuid or exists(select 1 from public.handoff_versions v where v.workspace_id=target_workspace and v.handoff_id=h.id and v.recipient_id=(filters->>'recipient')::uuid))
  and (not coalesce((filters->>'mine')::boolean,false) or h.recipient_id=auth.uid())
  and (collection<>'backlinks' or exists(select 1 from public.handoff_items hi where hi.workspace_id=target_workspace and hi.handoff_id=h.id and hi.resource_id=target))
  order by h.updated_at desc,h.id desc offset offset_n limit 21
 ) h;
 return jsonb_build_object('items',coalesce((select jsonb_agg(value) from jsonb_array_elements(results) with ordinality x(value,position) where position<=20),'[]'),'has_more',more,'offset',offset_n,'limit',20);
end $$;
revoke all on function public.handoff_query(uuid,text,jsonb) from public,anon;
grant execute on function public.handoff_query(uuid,text,jsonb) to authenticated;
-- Extend the existing projection; graph data still refers to canonical resource IDs.
create or replace view public.flow_records with(security_invoker=true) as
 select r.id,r.workspace_id,r.kind,r.title,i.description as body,i.status,i.issue_number,r.version,r.created_at,r.updated_at,r.archived_at from public.resources r join public.issues i on i.resource_id=r.id and i.workspace_id=r.workspace_id
 union all select r.id,r.workspace_id,r.kind,r.title,p.description,p.status,null::bigint,r.version,r.created_at,r.updated_at,r.archived_at from public.resources r join public.projects p on p.resource_id=r.id and p.workspace_id=r.workspace_id
 union all select r.id,r.workspace_id,r.kind,r.title,p.body,p.status,null::bigint,r.version,r.created_at,r.updated_at,r.archived_at from public.resources r join public.wiki_pages p on p.resource_id=r.id and p.workspace_id=r.workspace_id
 union all select r.id,r.workspace_id,r.kind,r.title,h.summary||' '||h.current_state||' '||h.completed_work||' '||h.pending_work||' '||h.risks||' '||h.next_actions,h.status,null::bigint,r.version,r.created_at,r.updated_at,r.archived_at from public.resources r join public.handoffs h on h.resource_id=r.id and h.workspace_id=r.workspace_id;
create or replace view public.flow_edges with(security_invoker=true) as
 select 'relation:'||rel.id::text as id,rel.workspace_id,rel.source_id,rel.target_id,rel.relation_type from public.resource_relations rel join public.flow_records s on s.id=rel.source_id join public.flow_records t on t.id=rel.target_id where rel.archived_at is null
 union all select 'belongs:'||i.resource_id::text,i.workspace_id,i.resource_id,i.project_id,'belongs_to' from public.issues i join public.flow_records s on s.id=i.resource_id join public.flow_records t on t.id=i.project_id
 union all select 'parent:'||p.resource_id::text,p.workspace_id,p.resource_id,p.parent_id,'child_of' from public.wiki_pages p join public.flow_records s on s.id=p.resource_id join public.flow_records t on t.id=p.parent_id
 union all select 'handoff:'||hi.id::text,hi.workspace_id,hi.handoff_id,hi.resource_id,'hands_over' from public.handoff_items hi join public.flow_records s on s.id=hi.handoff_id join public.flow_records t on t.id=hi.resource_id;
do $$ declare ext_schema text; begin
 select n.nspname into ext_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm';
 execute format('create index handoff_body_search on public.handoffs using gin ((summary||'' ''||current_state||'' ''||completed_work||'' ''||pending_work||'' ''||risks||'' ''||next_actions) %I.gin_trgm_ops)',ext_schema);
end $$;
create or replace function public.flow_query(target_workspace uuid,collection text,filters jsonb default '{}') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare
 q text:=btrim(coalesce(filters->>'q','')); words text[]; patterns text[]; word text;
 kind_name text:=coalesce(filters->>'kind',''); project uuid:=nullif(filters->>'project','')::uuid;
 start_date date:=nullif(filters->>'from','')::date; end_date date:=nullif(filters->>'to','')::date;
 include_archived boolean:=coalesce((filters->>'archived')::boolean,false);
 offset_n integer:=coalesce((filters->>'offset')::integer,0); target uuid;
 seed_ids uuid[]; neighbor_ids uuid[]; all_ids uuid[]; chosen_edges text[]; more boolean;
 nodes jsonb; edges jsonb; results jsonb;
begin
 if intelliflow_private.my_role(target_workspace) is null then raise exception 'not authorized' using errcode='42501'; end if;
 if jsonb_typeof(filters) is distinct from 'object' or collection is null or collection not in ('search','neighbors','detail','projects') or length(q)>200 or kind_name not in ('','issue','project','wiki','handoff') or offset_n not between 0 and 10000 or (start_date is not null and end_date is not null and start_date>end_date) then raise exception 'invalid filters' using errcode='22023'; end if;
 words:=case when q='' then array[]::text[] else regexp_split_to_array(q,'[[:space:]　]+') end;
 if cardinality(words)>8 then raise exception 'too many keywords' using errcode='22023'; end if;
 patterns:=array[]::text[];
 foreach word in array words loop patterns:=array_append(patterns,'%'||replace(replace(replace(word,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%'); end loop;
 if project is not null and not exists(select 1 from public.flow_records p where p.id=project and p.workspace_id=target_workspace and p.kind='project') then raise exception 'not found' using errcode='P0002'; end if;
 if collection in ('neighbors','detail') then
  target:=(filters->>'id')::uuid;
  if not exists(select 1 from public.flow_records r where r.workspace_id=target_workspace and r.id=target and (include_archived or r.archived_at is null)) then raise exception 'not found' using errcode='P0002'; end if;
  if collection='detail' then return (select (to_jsonb(r)-'body')||jsonb_build_object('excerpt',left(r.body,1600)) from public.flow_records r where r.id=target); end if;
  seed_ids:=array[target];
  select coalesce(array_agg(e.id order by e.id),array[]::text[]),count(*)>20 into chosen_edges,more from (
   select e.id from public.flow_edges e join public.flow_records s on s.id=e.source_id join public.flow_records t on t.id=e.target_id
   where e.workspace_id=target_workspace and (e.source_id=target or e.target_id=target) and (include_archived or (s.archived_at is null and t.archived_at is null)) order by e.id offset offset_n limit 21
  ) e;
  chosen_edges:=chosen_edges[1:20];
 else
  select coalesce(array_agg(r.id order by r.updated_at desc,r.id desc),array[]::uuid[]),count(*)>10 into seed_ids,more from (
   select r.id,r.updated_at from public.flow_records r where r.workspace_id=target_workspace
   and (include_archived or r.archived_at is null) and (case when collection='projects' then r.kind='project' else (kind_name='' or r.kind=kind_name) end)
   -- Positive first-term candidate scans can use each table's trigram index.
   -- The remaining terms below may match across title and body.
   and (cardinality(patterns)=0 or r.id in (
    select id from public.resources where workspace_id=target_workspace and title ilike patterns[1]
    union select resource_id from public.issues where workspace_id=target_workspace and description ilike patterns[1]
    union select resource_id from public.projects where workspace_id=target_workspace and description ilike patterns[1]
    union select resource_id from public.wiki_pages where workspace_id=target_workspace and body ilike patterns[1]
    union select resource_id from public.handoffs where workspace_id=target_workspace and (summary||' '||current_state||' '||completed_work||' '||pending_work||' '||risks||' '||next_actions) ilike patterns[1]
   ))
   and not exists(select 1 from unnest(patterns) p where not (r.title ilike p or r.body ilike p))
   and (start_date is null or r.updated_at >= (start_date::timestamp at time zone 'Asia/Tokyo'))
   and (end_date is null or r.updated_at < ((end_date+1)::timestamp at time zone 'Asia/Tokyo'))
   and (project is null or r.id=project or exists(select 1 from public.flow_edges e where e.workspace_id=target_workspace and ((e.source_id=r.id and e.target_id=project) or (e.target_id=r.id and e.source_id=project))))
   order by r.updated_at desc,r.id desc offset offset_n limit 11
  ) r;
  seed_ids:=seed_ids[1:10];
  select coalesce(array_agg(e.id),array[]::text[]) into chosen_edges from (
   select e.id from public.flow_edges e join public.flow_records s on s.id=e.source_id join public.flow_records t on t.id=e.target_id
   where collection='search' and e.workspace_id=target_workspace and (e.source_id=any(seed_ids) or e.target_id=any(seed_ids)) and (include_archived or (s.archived_at is null and t.archived_at is null)) order by e.id limit 20
  ) e;
 end if;
 select coalesce(array_agg(distinct v),array[]::uuid[]) into neighbor_ids from public.flow_edges e cross join lateral unnest(array[e.source_id,e.target_id]) v where e.workspace_id=target_workspace and e.id=any(chosen_edges);
 all_ids:=seed_ids||neighbor_ids;
 select coalesce(jsonb_agg((to_jsonb(r)-'body')||jsonb_build_object('excerpt',left(r.body,320)) order by r.updated_at desc,r.id desc),'[]') into nodes from public.flow_records r where r.workspace_id=target_workspace and r.id=any(all_ids);
 select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') into edges from public.flow_edges e where e.workspace_id=target_workspace and e.id=any(chosen_edges);
 results:=to_jsonb(seed_ids);
 return jsonb_build_object('nodes',nodes,'edges',edges,'result_ids',results,'has_more',more,'offset',offset_n,'limit',case when collection='neighbors' then 20 else 10 end);
end $$;

commit;

