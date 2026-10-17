-- Phase 5: search and graph projections over existing records. No data is copied/deleted.
begin;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
-- Respect the extension's existing schema on upgraded projects.
do $$ declare ext_schema text; item record; begin
 select n.nspname into ext_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm';
 for item in select * from (values ('resources','title'),('issues','description'),('projects','description'),('wiki_pages','body')) as columns(table_name,column_name) loop
  execute format('create index %I on public.%I using gin (%I %I.gin_trgm_ops)', 'flow_'||item.table_name||'_'||item.column_name, item.table_name,item.column_name,ext_schema);
 end loop;
end $$;
create index flow_resources_date on public.resources(workspace_id,updated_at desc,id desc);
create index flow_relations_source on public.resource_relations(workspace_id,source_id,target_id) where archived_at is null;
create index flow_wiki_project on public.wiki_pages(workspace_id,project_id);

create view public.flow_records with(security_invoker=true) as
 select r.id,r.workspace_id,r.kind,r.title,i.description as body,i.status,i.issue_number,r.version,r.created_at,r.updated_at,r.archived_at
 from public.resources r join public.issues i on i.resource_id=r.id and i.workspace_id=r.workspace_id
 union all
 select r.id,r.workspace_id,r.kind,r.title,p.description,p.status,null::bigint,r.version,r.created_at,r.updated_at,r.archived_at
 from public.resources r join public.projects p on p.resource_id=r.id and p.workspace_id=r.workspace_id
 union all
 select r.id,r.workspace_id,r.kind,r.title,p.body,p.status,null::bigint,r.version,r.created_at,r.updated_at,r.archived_at
 from public.resources r join public.wiki_pages p on p.resource_id=r.id and p.workspace_id=r.workspace_id;

create view public.flow_edges with(security_invoker=true) as
 select 'relation:'||rel.id::text as id,rel.workspace_id,rel.source_id,rel.target_id,rel.relation_type
 from public.resource_relations rel join public.flow_records s on s.id=rel.source_id join public.flow_records t on t.id=rel.target_id where rel.archived_at is null
 union all
 select 'belongs:'||i.resource_id::text,i.workspace_id,i.resource_id,i.project_id,'belongs_to'
 from public.issues i join public.flow_records s on s.id=i.resource_id join public.flow_records t on t.id=i.project_id
 union all
 select 'parent:'||p.resource_id::text,p.workspace_id,p.resource_id,p.parent_id,'child_of'
 from public.wiki_pages p join public.flow_records s on s.id=p.resource_id join public.flow_records t on t.id=p.parent_id;
revoke all on public.flow_records,public.flow_edges from public,anon;
grant select on public.flow_records,public.flow_edges to authenticated;

create function public.flow_query(target_workspace uuid,collection text,filters jsonb default '{}') returns jsonb
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
 if jsonb_typeof(filters) is distinct from 'object' or collection is null or collection not in ('search','neighbors','detail','projects') or length(q)>200 or kind_name not in ('','issue','project','wiki') or offset_n not between 0 and 10000 or (start_date is not null and end_date is not null and start_date>end_date) then raise exception 'invalid filters' using errcode='22023'; end if;
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

-- Delegate writes to existing domain commands so Wiki revisions/Issue history are preserved.
create function intelliflow_private.flow_relation(w uuid,operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a public.resources%rowtype; b public.resources%rowtype; wiki public.wiki_pages%rowtype; ids uuid[]; item jsonb;
begin
 if u is null or auth.jwt()->>'role' is distinct from 'authenticated' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'authentication required' using errcode='42501'; end if;
 perform 1 from public.workspaces where id=w for update;
 if coalesce(intelliflow_private.my_role(w),'') not in ('owner','admin','member') then raise exception 'not authorized' using errcode='42501'; end if;
 if operation is null or operation not in ('link','unlink') or jsonb_typeof(payload) is distinct from 'object' then raise exception 'invalid operation' using errcode='22023'; end if;
 select * into a from public.resources where workspace_id=w and id=(payload->>'source_id')::uuid and archived_at is null;
 select * into b from public.resources where workspace_id=w and id=(payload->>'target_id')::uuid and archived_at is null;
 if a.id is null or b.id is null or not intelliflow_private.can_read_resource(w,a.id) or not intelliflow_private.can_read_resource(w,b.id) then raise exception 'not found' using errcode='P0002'; end if;
 if a.id=b.id or a.kind='handoff' or b.kind='handoff' then raise exception 'unsupported relation' using errcode='22023'; end if;
 if a.version is distinct from (payload->>'source_version')::integer or b.version is distinct from (payload->>'target_version')::integer then raise exception 'version conflict' using errcode='40001'; end if;
 if a.kind='issue' and b.kind='issue' then
  return public.work_item_command(w,operation,jsonb_build_object('id',a.id,'expected_version',a.version,'other_id',b.id));
 elsif a.kind='wiki' and b.kind in ('issue','project') or b.kind='wiki' and a.kind in ('issue','project') then
  if b.kind='wiki' then select * into a from public.resources where id=b.id; select * into b from public.resources where id=(payload->>'source_id')::uuid; end if;
  if not intelliflow_private.can_edit_wiki(w,a.id) then raise exception 'not authorized' using errcode='42501'; end if;
  select * into wiki from public.wiki_pages where resource_id=a.id;
  -- Do not read through an invisible existing endpoint while retaining Wiki references.
  select coalesce(array_agg(target_id),array[]::uuid[]) into ids from public.resource_relations where workspace_id=w and source_id=a.id and relation_type='references' and archived_at is null;
  if exists(select 1 from unnest(ids) id where not intelliflow_private.can_read_resource(w,id)) then raise exception 'hidden reference' using errcode='42501'; end if;
  if operation='link' and not(b.id=any(ids)) then ids:=array_append(ids,b.id);
  elsif operation='unlink' then
   if not(b.id=any(ids)) then raise exception 'not found' using errcode='P0002'; end if; ids:=array_remove(ids,b.id);
  end if;
  item:=jsonb_build_object('id',a.id,'expected_version',a.version,'title',a.title,'category',wiki.category,'status',wiki.status,'parent_id',wiki.parent_id,'body_doc',wiki.body_doc,'related_ids',to_jsonb(ids));
  return public.wiki_command(w,'update',item);
 else raise exception 'use issue project field' using errcode='22023';
 end if;
end $$;
create function public.flow_relation_command(target_workspace uuid,operation text,payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select intelliflow_private.flow_relation(target_workspace,operation,payload) $$;
revoke all on function intelliflow_private.flow_relation(uuid,text,jsonb) from public,anon;
grant execute on function intelliflow_private.flow_relation(uuid,text,jsonb) to authenticated;
revoke all on function public.flow_query(uuid,text,jsonb),public.flow_relation_command(uuid,text,jsonb) from public,anon;
grant execute on function public.flow_query(uuid,text,jsonb),public.flow_relation_command(uuid,text,jsonb) to authenticated;
commit;
