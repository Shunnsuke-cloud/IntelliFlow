-- Phase 3: additive Issues/Projects. Apply after Phase 2, only in an approved environment.
begin;
alter table public.issues add column issue_number bigint;
with numbered as (
 select i.resource_id,row_number() over(partition by i.workspace_id order by r.created_at,i.resource_id) as n
 from public.issues i join public.resources r on r.id=i.resource_id
) update public.issues i set issue_number=n.n from numbered n where i.resource_id=n.resource_id;
-- Flush Phase 2 deferred subtype checks before ALTER TABLE on populated databases.
set constraints all immediate;
alter table public.issues alter column issue_number set not null;
alter table public.issues add constraint issues_workspace_number unique(workspace_id,issue_number);
alter table public.issues add constraint issues_number_positive check(issue_number>0);
alter table public.issues drop constraint issues_status_check;
-- Preserve old blocked rows; all new commands offer the four Phase 3 statuses only.
alter table public.issues add constraint issues_status_check check(status in ('open','in_progress','review','done','blocked'));
alter table public.issues add constraint issues_workspace_resource unique(workspace_id,resource_id);
alter table public.projects add column start_on date;
alter table public.projects add constraint projects_date_order check(start_on is null or due_on is null or start_on<=due_on);
create table public.issue_counters (
 workspace_id uuid primary key references public.workspaces(id),last_number bigint not null default 0 check(last_number>=0)
);
insert into public.issue_counters(workspace_id,last_number) select workspace_id,max(issue_number) from public.issues group by workspace_id;
create table public.workspace_labels (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 name text not null check(length(btrim(name)) between 1 and 30),unique(workspace_id,name),unique(workspace_id,id)
);
create table public.issue_labels (
 workspace_id uuid not null,issue_id uuid not null,label_id uuid not null,primary key(issue_id,label_id),
 foreign key(workspace_id,issue_id) references public.issues(workspace_id,resource_id),
 foreign key(workspace_id,label_id) references public.workspace_labels(workspace_id,id)
);
create table public.project_members (
 workspace_id uuid not null,project_id uuid not null,user_id uuid not null,primary key(project_id,user_id),
 foreign key(workspace_id,project_id) references public.projects(workspace_id,resource_id),
 foreign key(workspace_id,user_id) references public.workspace_members(workspace_id,user_id)
);
create table public.issue_comments (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,issue_id uuid not null,
 author_id uuid not null references auth.users(id),body text not null check(length(btrim(body)) between 1 and 5000),
 version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),archived_at timestamptz,
 foreign key(workspace_id,issue_id) references public.issues(workspace_id,resource_id),
 foreign key(workspace_id,author_id) references public.workspace_members(workspace_id,user_id)
);
create table public.resource_events (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,resource_id uuid not null,
 actor_id uuid not null references auth.users(id),action text not null,
 before_data jsonb,after_data jsonb,created_at timestamptz not null default now(),
 foreign key(workspace_id,resource_id) references public.resources(workspace_id,id)
);
create index issues_workspace_status on public.issues(workspace_id,status,issue_number);
create index issues_workspace_assignee on public.issues(workspace_id,assignee_id,due_on);
create index issues_workspace_priority on public.issues(workspace_id,priority);
create index issue_labels_label on public.issue_labels(workspace_id,label_id,issue_id);
create index project_members_user on public.project_members(workspace_id,user_id,project_id);
create index issue_comments_recent on public.issue_comments(workspace_id,issue_id,created_at);
create index resource_events_recent on public.resource_events(workspace_id,resource_id,created_at desc);

alter table public.issue_counters enable row level security;
alter table public.workspace_labels enable row level security;
alter table public.issue_labels enable row level security;
alter table public.project_members enable row level security;
alter table public.issue_comments enable row level security;
alter table public.resource_events enable row level security;
revoke all on public.issue_counters,public.workspace_labels,public.issue_labels,public.project_members,public.issue_comments,public.resource_events from public,anon,authenticated;
grant select on public.workspace_labels,public.issue_labels,public.project_members,public.issue_comments,public.resource_events to authenticated;
create policy labels_read on public.workspace_labels for select to authenticated using(
 intelliflow_private.my_role(workspace_id) is not null and exists(
  select 1 from public.issue_labels il where il.workspace_id=workspace_labels.workspace_id and il.label_id=workspace_labels.id
  and intelliflow_private.can_read_resource(il.workspace_id,il.issue_id)
 )
);
create policy issue_labels_read on public.issue_labels for select to authenticated using(intelliflow_private.can_read_resource(workspace_id,issue_id));
create policy project_members_read on public.project_members for select to authenticated using(intelliflow_private.can_read_resource(workspace_id,project_id));
create policy comments_read on public.issue_comments for select to authenticated using(intelliflow_private.can_read_resource(workspace_id,issue_id));
create policy events_read on public.resource_events for select to authenticated using(intelliflow_private.can_read_resource(workspace_id,resource_id));

create view public.issue_records with (security_invoker=true) as
 select r.id,r.workspace_id,r.title,r.created_by,r.updated_by,r.version,r.created_at,r.updated_at,r.archived_at,
 i.issue_number,'ISSUE-'||lpad(i.issue_number::text,greatest(3,length(i.issue_number::text)),'0') as code,
 i.description,i.status,i.priority,i.assignee_id,i.due_on,i.project_id,
 coalesce((select jsonb_agg(l.name order by l.name) from public.issue_labels il join public.workspace_labels l on l.id=il.label_id where il.issue_id=i.resource_id),'[]'::jsonb) as labels
 from public.issues i join public.resources r on r.id=i.resource_id and r.workspace_id=i.workspace_id;
create view public.project_records with (security_invoker=true) as
 select r.id,r.workspace_id,r.title,r.created_by,r.updated_by,r.version,r.created_at,r.updated_at,r.archived_at,
 p.description,p.status,p.start_on,p.due_on,
 coalesce((select jsonb_agg(m.user_id order by m.user_id) from public.project_members m where m.project_id=p.resource_id),'[]'::jsonb) as member_ids,
 (select count(*)::integer from public.issues i join public.resources ir on ir.id=i.resource_id where i.project_id=p.resource_id and ir.archived_at is null and intelliflow_private.can_read_resource(i.workspace_id,i.resource_id)) as issue_count,
 (select count(*)::integer from public.issues i join public.resources ir on ir.id=i.resource_id where i.project_id=p.resource_id and ir.archived_at is null and i.status='done' and intelliflow_private.can_read_resource(i.workspace_id,i.resource_id)) as completed_count
 from public.projects p join public.resources r on r.id=p.resource_id and r.workspace_id=p.workspace_id;
revoke all on public.issue_records,public.project_records from public,anon;
grant select on public.issue_records,public.project_records to authenticated;

-- User-scoped reads. RLS applies to every underlying table/view, including aggregates.
create function public.work_items_query(target_workspace uuid,collection text,filters jsonb default '{}') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; total bigint; max_rows integer:=50; skip_rows integer:=0; needle text; sort_by text; show_archived boolean;
begin
 if intelliflow_private.my_role(target_workspace) is null then raise exception 'not authorized' using errcode='42501'; end if;
 if collection is null or collection not in ('issues','projects','detail','options') then raise exception 'invalid collection' using errcode='22023'; end if;
 if jsonb_typeof(filters) is distinct from 'object' then raise exception 'invalid filters' using errcode='22023'; end if;
 if collection='options' then
   return jsonb_build_object(
    'projects',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title) order by title),'[]') from public.resources where workspace_id=target_workspace and kind='project' and archived_at is null),
    'labels',(select coalesce(jsonb_agg(name order by name),'[]') from public.workspace_labels where workspace_id=target_workspace));
 elsif collection='detail' then
   if filters->>'kind'='issue' then select to_jsonb(i) into result from public.issue_records i where workspace_id=target_workspace and id=(filters->>'id')::uuid;
   elsif filters->>'kind'='project' then select to_jsonb(p) into result from public.project_records p where workspace_id=target_workspace and id=(filters->>'id')::uuid;
   else raise exception 'invalid kind' using errcode='22023'; end if;
   if result is null then raise exception 'not found' using errcode='P0002'; end if;
   return jsonb_build_object('item',result,
    'comments',(select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at,c.id),'[]') from public.issue_comments c where c.workspace_id=target_workspace and c.issue_id=(filters->>'id')::uuid and c.archived_at is null),
    'relations',(select coalesce(jsonb_agg(jsonb_build_object('relation_id',rel.id,'id',other.id,'code',other.code,'title',other.title) order by other.issue_number),'[]') from public.resource_relations rel join public.issue_records other on other.id=case when rel.source_id=(filters->>'id')::uuid then rel.target_id else rel.source_id end where rel.workspace_id=target_workspace and rel.relation_type='related_to' and rel.archived_at is null and other.archived_at is null and (rel.source_id=(filters->>'id')::uuid or rel.target_id=(filters->>'id')::uuid)),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id),'[]') from (select * from public.resource_events where workspace_id=target_workspace and resource_id=(filters->>'id')::uuid order by created_at desc,id limit 100) e));
 end if;
 max_rows:=least(100,greatest(1,coalesce((filters->>'limit')::integer,50)));
 skip_rows:=greatest(0,coalesce((filters->>'offset')::integer,0));
 needle:=btrim(coalesce(filters->>'q',''));sort_by:=coalesce(filters->>'sort','updated');show_archived:=coalesce((filters->>'archived')::boolean,false);
 if length(needle)>200 or sort_by not in ('updated','created','title','due','priority','number') then raise exception 'invalid search' using errcode='22023'; end if;
 if collection='issues' then
   with matching as (
    select i.* from public.issue_records i where workspace_id=target_workspace and (archived_at is not null)=show_archived
    and (needle='' or strpos(lower(title||' '||description||' '||code),lower(needle))>0)
    and (coalesce(filters->>'status','')='' or status=filters->>'status')
    and (coalesce(filters->>'priority','')='' or priority=filters->>'priority')
    and (coalesce(filters->>'assignee','')='' or (filters->>'assignee'='none' and assignee_id is null) or assignee_id::text=filters->>'assignee')
    and (coalesce(filters->>'project','')='' or (filters->>'project'='none' and project_id is null) or project_id::text=filters->>'project')
    and (coalesce(filters->>'label','')='' or labels ? lower(filters->>'label'))
    and (coalesce(filters->>'due_before','')='' or due_on<=nullif(filters->>'due_before','')::date)
   ), page as (
    select * from matching order by
     case when sort_by='title' then lower(title) end asc,
     case when sort_by='due' then due_on end asc nulls last,
     case when sort_by='priority' then case priority when 'high' then 0 when 'normal' then 1 else 2 end end asc,
     case when sort_by='created' then created_at end desc,
     case when sort_by='number' then issue_number end asc,
     case when sort_by='updated' then updated_at end desc,id
    limit max_rows offset skip_rows
   ) select coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),(select count(*) from matching) into result,total;
 else
   with matching as (
    select p.* from public.project_records p where workspace_id=target_workspace and (archived_at is not null)=show_archived
    and (needle='' or strpos(lower(title||' '||description),lower(needle))>0)
    and (coalesce(filters->>'status','')='' or status=filters->>'status')
    and (coalesce(filters->>'member','')='' or member_ids ? (filters->>'member'))
   ), page as (
    select * from matching order by
     case when sort_by='title' then lower(title) end asc,
     case when sort_by='due' then due_on end asc nulls last,
     case when sort_by='created' then created_at end desc,
     case when sort_by='updated' then updated_at end desc,id
    limit max_rows offset skip_rows
   ) select coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),(select count(*) from matching) into result,total;
 end if;
 return jsonb_build_object('items',result,'total',total,'offset',skip_rows,'limit',max_rows);
end $$;

-- Atomic authorized commands. Direct writes remain revoked; no service key is used.
create function intelliflow_private.work_item_command(target_workspace uuid,operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); actor_role text; r public.resources%rowtype; target uuid; kind text;
 before_snapshot jsonb; after_snapshot jsonb; n bigint; p uuid; assignee uuid; member uuid; label_name text; label_id uuid;
 c public.issue_comments%rowtype; other uuid; relation uuid; before_comment jsonb;
begin
 if u is null or (auth.jwt()->>'role') is distinct from 'authenticated' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'authentication required' using errcode='42501'; end if;
 -- Same lock as membership management: allocation and permissions cannot race role changes.
 perform 1 from public.workspaces where id=target_workspace for update;
 actor_role:=intelliflow_private.my_role(target_workspace);
 if actor_role is null or actor_role not in ('owner','admin','member') then raise exception 'not authorized' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' then raise exception 'invalid input' using errcode='22023'; end if;
 if operation is null or operation not in ('issue_create','issue_update','project_create','project_update','archive','restore','comment_create','comment_update','comment_archive','link','unlink') then raise exception 'invalid operation' using errcode='22023'; end if;
 kind:=case when operation like 'issue_%' then 'issue' when operation like 'project_%' then 'project' else null end;
 if operation in ('issue_create','project_create') then
  target:=gen_random_uuid();
  insert into public.resources(id,workspace_id,kind,title,visibility,created_by,updated_by) values(target,target_workspace,kind,btrim(payload->>'title'),'workspace',u,u) returning * into r;
  if kind='issue' then
   insert into public.issue_counters(workspace_id,last_number) values(target_workspace,1) on conflict(workspace_id) do update set last_number=public.issue_counters.last_number+1 returning last_number into n;
   insert into public.issues(resource_id,workspace_id,issue_number) values(target,target_workspace,n);
  else insert into public.projects(resource_id,workspace_id) values(target,target_workspace);
  end if;
 else
  target:=(payload->>'id')::uuid;
  select rr.* into r from public.resources rr where rr.workspace_id=target_workspace and rr.id=target and rr.kind in ('issue','project') for update;
  if not found or not intelliflow_private.can_read_resource(target_workspace,target) then raise exception 'not found' using errcode='P0002'; end if;
  if kind is not null and kind<>r.kind then raise exception 'wrong kind' using errcode='22023'; end if;
  kind:=r.kind;
  if operation<>'restore' and r.archived_at is not null then raise exception 'archived' using errcode='23514'; end if;
  if (payload->>'expected_version') is null or (payload->>'expected_version')::integer<>r.version then raise exception 'version conflict' using errcode='40001'; end if;
  if kind='issue' then select to_jsonb(i) into before_snapshot from public.issue_records i where id=target;
  else select to_jsonb(pj)-'issue_count'-'completed_count' into before_snapshot from public.project_records pj where id=target; end if;
 end if;
 if operation in ('issue_create','issue_update','project_create','project_update') then
  if length(btrim(coalesce(payload->>'title',''))) not between 1 and 200 or length(coalesce(payload->>'description',''))>10000 then raise exception 'invalid text' using errcode='22023'; end if;
  if kind='issue' then
   if coalesce(payload->>'status','open') not in ('open','in_progress','review','done') or coalesce(payload->>'priority','normal') not in ('low','normal','high') then raise exception 'invalid status' using errcode='22023'; end if;
   p:=nullif(payload->>'project_id','')::uuid; assignee:=nullif(payload->>'assignee_id','')::uuid;
   if p is not null and not exists(select 1 from public.projects pr join public.resources rr on rr.id=pr.resource_id where pr.workspace_id=target_workspace and pr.resource_id=p and (rr.archived_at is null or (operation='issue_update' and p=(select project_id from public.issues where resource_id=target))) and intelliflow_private.can_read_resource(target_workspace,p)) then raise exception 'invalid project' using errcode='42501'; end if;
   if assignee is not null and not exists(select 1 from public.workspace_members where workspace_id=target_workspace and user_id=assignee and left_at is null) then raise exception 'invalid assignee' using errcode='42501'; end if;
   update public.issues set description=coalesce(payload->>'description',''),status=coalesce(payload->>'status','open'),priority=coalesce(payload->>'priority','normal'),project_id=p,assignee_id=assignee,due_on=nullif(payload->>'due_on','')::date where resource_id=target;
   if jsonb_typeof(coalesce(payload->'labels','[]'))<>'array' or jsonb_array_length(coalesce(payload->'labels','[]'))>10 then raise exception 'invalid labels' using errcode='22023'; end if;
   delete from public.issue_labels where issue_id=target;
   for label_name in select distinct lower(btrim(value)) from jsonb_array_elements_text(coalesce(payload->'labels','[]')) loop
    if length(label_name) not between 1 and 30 then raise exception 'invalid label' using errcode='22023'; end if;
    insert into public.workspace_labels(workspace_id,name) values(target_workspace,label_name) on conflict(workspace_id,name) do update set name=excluded.name returning id into label_id;
    insert into public.issue_labels(workspace_id,issue_id,label_id) values(target_workspace,target,label_id);
   end loop;
  else
   if coalesce(payload->>'status','planned') not in ('planned','active','completed') then raise exception 'invalid status' using errcode='22023'; end if;
   update public.projects set description=coalesce(payload->>'description',''),status=coalesce(payload->>'status','planned'),start_on=nullif(payload->>'start_on','')::date,due_on=nullif(payload->>'due_on','')::date where resource_id=target;
   if jsonb_typeof(coalesce(payload->'member_ids','[]'))<>'array' or jsonb_array_length(coalesce(payload->'member_ids','[]'))>100 then raise exception 'invalid members' using errcode='22023'; end if;
   delete from public.project_members where project_id=target;
   for member in select distinct value::uuid from jsonb_array_elements_text(coalesce(payload->'member_ids','[]')) loop
    if not exists(select 1 from public.workspace_members where workspace_id=target_workspace and user_id=member and left_at is null) then raise exception 'invalid member' using errcode='42501'; end if;
    insert into public.project_members(workspace_id,project_id,user_id) values(target_workspace,target,member);
   end loop;
  end if;
  update public.resources set title=btrim(payload->>'title') where id=target;
 elsif operation in ('archive','restore') then
  if actor_role not in ('owner','admin') and r.created_by<>u then raise exception 'archive not authorized' using errcode='42501'; end if;
  if operation='restore' and r.archived_at is null then raise exception 'not archived' using errcode='23514'; end if;
  update public.resources set archived_at=case when operation='archive' then now() else null end where id=target;
 elsif operation like 'comment_%' then
  if kind<>'issue' then raise exception 'comments require an issue' using errcode='22023'; end if;
  if operation='comment_create' then
   insert into public.issue_comments(workspace_id,issue_id,author_id,body) values(target_workspace,target,u,btrim(payload->>'body')) returning * into c;
  else
   select * into c from public.issue_comments where workspace_id=target_workspace and issue_id=target and id=(payload->>'comment_id')::uuid and archived_at is null for update;
   if not found then raise exception 'comment not found' using errcode='P0002'; end if;
   if c.author_id<>u and (operation='comment_update' or actor_role not in ('owner','admin')) then raise exception 'comment not authorized' using errcode='42501'; end if;
   if c.version<>coalesce((payload->>'comment_version')::integer,0) then raise exception 'comment conflict' using errcode='40001'; end if;
   before_comment:=to_jsonb(c);
   update public.issue_comments set body=case when operation='comment_update' then btrim(payload->>'body') else body end,archived_at=case when operation='comment_archive' then now() else null end,version=version+1,updated_at=now() where id=c.id returning * into c;
  end if;
 elsif operation in ('link','unlink') then
  if kind<>'issue' then raise exception 'relations require issues' using errcode='22023'; end if;
  other:=(payload->>'other_id')::uuid;
  if other=target or not exists(select 1 from public.issues i join public.resources rr on rr.id=i.resource_id where i.resource_id=other and i.workspace_id=target_workspace and rr.archived_at is null and intelliflow_private.can_read_resource(target_workspace,other)) then raise exception 'invalid related issue' using errcode='42501'; end if;
  if operation='link' then
   insert into public.resource_relations(workspace_id,source_id,target_id,relation_type,created_by) values(target_workspace,least(target,other),greatest(target,other),'related_to',u)
   on conflict(workspace_id,source_id,target_id,relation_type) do update set archived_at=null returning id into relation;
  else
   update public.resource_relations set archived_at=now() where workspace_id=target_workspace and source_id=least(target,other) and target_id=greatest(target,other) and relation_type='related_to' and archived_at is null returning id into relation;
   if not found then raise exception 'relation not found' using errcode='P0002'; end if;
  end if;
  -- Both ends receive history and a version bump so open editors detect the change.
  update public.resources set version=version+1,updated_by=u,updated_at=now() where id=other;
  insert into public.resource_events(workspace_id,resource_id,actor_id,action,after_data) values(target_workspace,other,u,operation,jsonb_build_object('related_id',target,'relation_id',relation));
 end if;
 update public.resources set version=case when operation in ('issue_create','project_create') then version else version+1 end,updated_by=u,updated_at=now() where id=target;
 if kind='issue' then select to_jsonb(i) into after_snapshot from public.issue_records i where id=target;
 else select to_jsonb(pj)-'issue_count'-'completed_count' into after_snapshot from public.project_records pj where id=target; end if;
 if operation like 'comment_%' then
  before_snapshot:=jsonb_build_object('comment',before_comment);
  after_snapshot:=jsonb_build_object('comment',to_jsonb(c));
 elsif operation in ('link','unlink') then before_snapshot:=null; after_snapshot:=jsonb_build_object('related_id',other,'relation_id',relation); end if;
 insert into public.resource_events(workspace_id,resource_id,actor_id,action,before_data,after_data) values(target_workspace,target,u,operation,before_snapshot,after_snapshot);
 return jsonb_build_object('id',target,'version',(select version from public.resources where id=target),'comment_id',c.id);
end $$;
create function public.work_item_command(target_workspace uuid,operation text,payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select intelliflow_private.work_item_command(target_workspace,operation,payload) $$;
revoke all on function intelliflow_private.work_item_command(uuid,text,jsonb) from public,anon;
grant execute on function intelliflow_private.work_item_command(uuid,text,jsonb) to authenticated;
revoke all on function public.work_item_command(uuid,text,jsonb),public.work_items_query(uuid,text,jsonb) from public,anon;
grant execute on function public.work_item_command(uuid,text,jsonb),public.work_items_query(uuid,text,jsonb) to authenticated;
commit;
