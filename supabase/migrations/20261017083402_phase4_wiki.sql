-- Phase 4. Apply after Phases 2/3, in an approved environment. No data or files deleted.
begin;
alter table public.wiki_pages add column body_doc jsonb;
alter table public.wiki_pages add column parent_id uuid;
alter table public.wiki_pages add column category text not null default '未分類' check(length(btrim(category)) between 1 and 40);
alter table public.wiki_pages add constraint wiki_parent_workspace foreign key(workspace_id,parent_id) references public.wiki_pages(workspace_id,resource_id);
alter table public.wiki_pages add constraint wiki_parent_not_self check(parent_id is null or parent_id<>resource_id);
alter table public.wiki_revisions add column body_doc jsonb;
alter table public.wiki_revisions add column metadata jsonb not null default '{"status":"draft"}';
-- Legacy body is preserved as literal text, never interpreted as HTML.
update public.wiki_pages set body_doc=jsonb_build_object('type','doc','content',jsonb_build_array(jsonb_build_object('type','paragraph','content',case when body='' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('type','text','text',body)) end)));
update public.wiki_revisions set body_doc=jsonb_build_object('type','doc','content',jsonb_build_array(jsonb_build_object('type','paragraph','content',case when body='' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('type','text','text',body)) end)));
set constraints all immediate;
alter table public.wiki_pages alter column body_doc set not null;
alter table public.wiki_revisions alter column body_doc set not null;
insert into public.wiki_revisions(workspace_id,wiki_id,revision,title,body,body_doc,edited_by,metadata)
 select p.workspace_id,p.resource_id,p.current_revision,r.title,p.body,p.body_doc,r.updated_by,jsonb_build_object('status',p.status,'category',p.category,'parent_id',p.parent_id,'action','baseline')
 from public.wiki_pages p join public.resources r on r.id=p.resource_id on conflict(wiki_id,revision) do nothing;
update public.resources r set visibility=case when p.status='published' then 'workspace' else 'private' end from public.wiki_pages p where r.id=p.resource_id;
insert into public.resource_relations(workspace_id,source_id,target_id,relation_type,created_by)
 select p.workspace_id,p.resource_id,p.project_id,'references',r.created_by from public.wiki_pages p join public.resources r on r.id=p.resource_id where p.project_id is not null on conflict do nothing;
create index wiki_parent_index on public.wiki_pages(workspace_id,parent_id);
create index wiki_category_index on public.wiki_pages(workspace_id,category,status);
create index wiki_revision_recent on public.wiki_revisions(workspace_id,wiki_id,revision desc);

create function intelliflow_private.wiki_doc_text(node jsonb,depth integer default 0) returns text
language plpgsql immutable set search_path='' as $$
declare t text:=node->>'type'; child jsonb; mark jsonb; result text:=''; k text; attrs jsonb:=coalesce(node->'attrs','{}'); allowed text[];
begin
 if depth>20 or jsonb_typeof(node) is distinct from 'object' or t is null or t not in ('doc','paragraph','heading','bulletList','orderedList','listItem','taskList','taskItem','text','hardBreak','image') then raise exception 'invalid document' using errcode='22023'; end if;
 for k in select jsonb_object_keys(node) loop if k not in ('type','attrs','content','marks','text') then raise exception 'invalid attribute' using errcode='22023'; end if; end loop;
 if jsonb_typeof(attrs)<>'object' then raise exception 'invalid attributes' using errcode='22023'; end if;
 allowed:=case t when 'heading' then array['level'] when 'orderedList' then array['start'] when 'taskItem' then array['checked'] when 'image' then array['attachmentId','alt'] else array[]::text[] end;
 for k in select jsonb_object_keys(attrs) loop if not(k=any(allowed)) then raise exception 'invalid attribute' using errcode='22023'; end if; end loop;
 if t='heading' and coalesce(attrs->>'level','') not in ('1','2','3') then raise exception 'invalid heading' using errcode='22023'; end if;
 if t='taskItem' and jsonb_typeof(attrs->'checked') is distinct from 'boolean' then raise exception 'invalid task' using errcode='22023'; end if;
 if t='orderedList' and (coalesce(attrs->>'start','1') !~ '^[0-9]{1,6}$' or coalesce((attrs->>'start')::integer,1) not between 1 and 100000) then raise exception 'invalid list' using errcode='22023'; end if;
 if t='image' and (coalesce(attrs->>'attachmentId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or length(coalesce(attrs->>'alt',''))>300) then raise exception 'invalid image' using errcode='22023'; end if;
 if t='text' then
  if jsonb_typeof(node->'text') is distinct from 'string' or length(node->>'text')=0 then raise exception 'invalid text' using errcode='22023'; end if;
  result:=node->>'text';
  if node ? 'marks' then
   if jsonb_typeof(node->'marks')<>'array' or jsonb_array_length(node->'marks')>5 then raise exception 'invalid marks' using errcode='22023'; end if;
   for mark in select * from jsonb_array_elements(node->'marks') loop
    if coalesce(mark->>'type','') not in ('bold','italic','strike','underline','link') then raise exception 'invalid mark' using errcode='22023'; end if;
    for k in select jsonb_object_keys(mark) loop if k not in ('type','attrs') then raise exception 'invalid mark' using errcode='22023'; end if; end loop;
    if mark->>'type'='link' then
     if coalesce(mark->'attrs'->>'href','') !~* '^(https?://|mailto:)[^[:space:][:cntrl:]]+$' or length(mark->'attrs'->>'href')>2000 or (mark->'attrs')-'href'<>'{}'::jsonb then raise exception 'unsafe link' using errcode='22023'; end if;
    elsif coalesce(mark->'attrs','{}')<>'{}'::jsonb then raise exception 'invalid mark attrs' using errcode='22023'; end if;
   end loop;
  end if;
 elsif node ? 'text' or node ? 'marks' then raise exception 'invalid text' using errcode='22023'; end if;
 if node ? 'content' then
  if jsonb_typeof(node->'content')<>'array' or t in ('text','image','hardBreak') then raise exception 'invalid children' using errcode='22023'; end if;
  for child in select * from jsonb_array_elements(node->'content') loop
   if (t='doc' and child->>'type' not in ('paragraph','heading','bulletList','orderedList','taskList','image')) or
      (t in ('paragraph','heading') and child->>'type' not in ('text','hardBreak')) or
      (t in ('bulletList','orderedList') and child->>'type'<>'listItem') or (t='taskList' and child->>'type'<>'taskItem') or
      (t in ('listItem','taskItem') and child->>'type' not in ('paragraph','heading','bulletList','orderedList','taskList','image')) then raise exception 'invalid nesting' using errcode='22023'; end if;
   result:=result||intelliflow_private.wiki_doc_text(child,depth+1)||case when t in ('doc','listItem','taskItem','bulletList','orderedList','taskList') then E'\n' else '' end;
  end loop;
 end if;
 if t in ('doc','bulletList','orderedList','taskList','listItem','taskItem') and coalesce(jsonb_array_length(node->'content'),0)=0 then raise exception 'empty container' using errcode='22023'; end if;
 if t in ('listItem','taskItem') and node->'content'->0->>'type'<>'paragraph' then raise exception 'invalid list item' using errcode='22023'; end if;
 return result;
end $$;

-- Draft revisions stay private even when a later version is published.
drop policy feature_read on public.wiki_revisions;
create policy wiki_revision_read on public.wiki_revisions for select to authenticated using(
 intelliflow_private.can_read_resource(workspace_id,wiki_id) and
 (metadata->>'status'='published' or exists(select 1 from public.resources r where r.id=wiki_id and r.created_by=(select auth.uid())) or intelliflow_private.my_role(workspace_id) in ('owner','admin'))
);
create view public.wiki_records with(security_invoker=true) as
 select r.id,r.workspace_id,r.title,r.created_by,r.version,r.updated_at,r.archived_at,p.body,p.body_doc,p.category,p.parent_id,p.status,p.current_revision
 from public.wiki_pages p join public.resources r on r.id=p.resource_id and r.workspace_id=p.workspace_id;
revoke all on public.wiki_records from public,anon;grant select on public.wiki_records to authenticated;

create function intelliflow_private.can_edit_wiki(w uuid,page_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wiki_pages p join public.resources r on r.id=p.resource_id where p.workspace_id=w and p.resource_id=page_id and r.archived_at is null
 and intelliflow_private.my_role(w) in ('owner','admin','member') and (p.status='published' or r.created_by=auth.uid() or intelliflow_private.my_role(w) in ('owner','admin')))
$$;
create table public.wiki_attachments (
 id uuid primary key,workspace_id uuid not null,wiki_id uuid not null,uploaded_by uuid not null references auth.users(id),
 object_path text not null unique,mime_type text not null check(mime_type in ('image/png','image/jpeg','image/webp')),
 byte_size integer not null check(byte_size between 1 and 3145728),state text not null default 'pending' check(state in ('pending','ready')),
 created_at timestamptz not null default now(),foreign key(workspace_id,wiki_id) references public.wiki_pages(workspace_id,resource_id)
);
create index wiki_attachments_page on public.wiki_attachments(workspace_id,wiki_id);
alter table public.wiki_attachments enable row level security;
revoke all on public.wiki_attachments from public,anon,authenticated;
grant select on public.wiki_attachments to authenticated;
create function intelliflow_private.can_read_wiki_attachment(path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wiki_attachments a join public.wiki_pages p on p.resource_id=a.wiki_id
 where a.object_path=path and intelliflow_private.can_read_resource(a.workspace_id,a.wiki_id) and (
 (a.uploaded_by=auth.uid() and intelliflow_private.can_edit_wiki(a.workspace_id,a.wiki_id)) or
 (a.state='ready' and (jsonb_path_exists(p.body_doc,'$.** ? (@.type == "image" && @.attrs.attachmentId == $id)',jsonb_build_object('id',a.id::text)) or exists(
  select 1 from public.wiki_revisions v where v.wiki_id=a.wiki_id and (v.metadata->>'status'='published' or exists(select 1 from public.resources r where r.id=a.wiki_id and r.created_by=auth.uid()) or intelliflow_private.my_role(a.workspace_id) in ('owner','admin'))
  and jsonb_path_exists(v.body_doc,'$.** ? (@.type == "image" && @.attrs.attachmentId == $id)',jsonb_build_object('id',a.id::text))
 )))
 ))
$$;
create policy wiki_attachment_read on public.wiki_attachments for select to authenticated using(intelliflow_private.can_read_wiki_attachment(object_path));

create function intelliflow_private.wiki_command(w uuid,operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); role_name text; target uuid; r public.resources%rowtype; page public.wiki_pages%rowtype; parent uuid; linked uuid; old_links uuid[]; status_name text; plain text; revision_number integer; image jsonb; a public.wiki_attachments%rowtype;
begin
 if u is null or auth.jwt()->>'role' is distinct from 'authenticated' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'authentication required' using errcode='42501'; end if;
 perform 1 from public.workspaces where id=w for update;
 role_name:=intelliflow_private.my_role(w);
 if role_name is null or role_name not in ('owner','admin','member') then raise exception 'not authorized' using errcode='42501'; end if;
 if operation is null or operation not in ('create','update','archive','restore','attachment_reserve','attachment_finish') or jsonb_typeof(payload) is distinct from 'object' then raise exception 'invalid operation' using errcode='22023'; end if;
 if operation='create' then
  target:=gen_random_uuid();
  insert into public.resources(id,workspace_id,kind,title,visibility,created_by,updated_by) values(target,w,'wiki',btrim(payload->>'title'),'private',u,u) returning * into r;
  insert into public.wiki_pages(resource_id,workspace_id,body_doc) values(target,w,'{"type":"doc","content":[{"type":"paragraph"}]}') returning * into page;
 else
  target:=(payload->>'id')::uuid;
  select rr.* into r from public.resources rr where rr.workspace_id=w and rr.id=target and rr.kind='wiki' for update;
  if not found or not intelliflow_private.can_read_resource(w,target) then raise exception 'not found' using errcode='P0002'; end if;
  select * into page from public.wiki_pages where resource_id=target;
  if operation='restore' then
   if role_name not in ('owner','admin') and r.created_by<>u then raise exception 'not authorized' using errcode='42501'; end if;
  elsif not intelliflow_private.can_edit_wiki(w,target) then raise exception 'not authorized' using errcode='42501'; end if;
  if operation not like 'attachment_%' and coalesce((payload->>'expected_version')::integer,0)<>r.version then raise exception 'version conflict' using errcode='40001'; end if;
 end if;
 if operation in ('attachment_reserve','attachment_finish') then
  if operation='attachment_reserve' then
   if (select count(*) from public.wiki_attachments where wiki_id=target)>=200 then raise exception 'attachment limit' using errcode='23514'; end if;
   insert into public.wiki_attachments(id,workspace_id,wiki_id,uploaded_by,object_path,mime_type,byte_size)
   values((payload->>'attachment_id')::uuid,w,target,u,w::text||'/'||target::text||'/'||(payload->>'attachment_id'),payload->>'mime_type',(payload->>'byte_size')::integer) returning * into a;
  else
   select * into a from public.wiki_attachments where id=(payload->>'attachment_id')::uuid and workspace_id=w and wiki_id=target and uploaded_by=u for update;
   if not found then raise exception 'not found' using errcode='P0002'; end if;
   if not exists(select 1 from storage.objects o where o.bucket_id='intelliflow-wiki' and o.name=a.object_path and (o.metadata->>'size')::bigint=a.byte_size and o.metadata->>'mimetype'=a.mime_type) then raise exception 'upload incomplete' using errcode='23514'; end if;
   update public.wiki_attachments set state='ready' where id=a.id returning * into a;
  end if;
  return to_jsonb(a);
 elsif operation in ('archive','restore') then
  if role_name not in ('owner','admin') and r.created_by<>u then raise exception 'not authorized' using errcode='42501'; end if;
  if (operation='restore')<>(r.archived_at is not null) then raise exception 'invalid archive state' using errcode='23514'; end if;
  update public.resources set archived_at=case when operation='archive' then now() else null end where id=target;
 else
  if length(btrim(coalesce(payload->>'title',''))) not between 1 and 200 or length(btrim(coalesce(payload->>'category',''))) not between 1 and 40 then raise exception 'invalid text' using errcode='22023'; end if;
  status_name:=payload->>'status';
  if status_name is null or status_name not in ('draft','published') then raise exception 'invalid status' using errcode='22023'; end if;
  if page.status='published' and status_name='draft' and r.created_by<>u and role_name not in ('owner','admin') then raise exception 'cannot unpublish another author' using errcode='42501'; end if;
  if payload->'body_doc'->>'type' is distinct from 'doc' or length((payload->'body_doc')::text)>200000 then raise exception 'invalid document' using errcode='22023'; end if;
  plain:=intelliflow_private.wiki_doc_text(payload->'body_doc');
  if length(plain)>60000 then raise exception 'document too long' using errcode='22023'; end if;
  for image in select * from jsonb_path_query(payload->'body_doc','$.** ? (@.type == "image")') loop
   if not exists(select 1 from public.wiki_attachments where id=(image->'attrs'->>'attachmentId')::uuid and workspace_id=w and wiki_id=target and state='ready') then raise exception 'invalid attachment' using errcode='42501'; end if;
  end loop;
  parent:=nullif(payload->>'parent_id','')::uuid;
  if parent is not null then
   if not exists(select 1 from public.wiki_pages p join public.resources pr on pr.id=p.resource_id where p.resource_id=parent and p.workspace_id=w and (pr.archived_at is null or (operation='update' and page.parent_id=parent)) and intelliflow_private.can_read_resource(w,parent) and (status_name='draft' or p.status='published')) then raise exception 'invalid parent' using errcode='42501'; end if;
   if exists(with recursive ancestors as (select p.resource_id,p.parent_id from public.wiki_pages p where p.resource_id=parent union select p.resource_id,p.parent_id from public.wiki_pages p join ancestors ancestor on p.resource_id=ancestor.parent_id) select 1 from ancestors where resource_id=target) then raise exception 'parent cycle' using errcode='23514'; end if;
  end if;
  if status_name='draft' and exists(select 1 from public.wiki_pages p where p.parent_id=target and p.status='published') then raise exception 'published children exist' using errcode='23514'; end if;
  if jsonb_typeof(coalesce(payload->'related_ids','[]'))<>'array' or jsonb_array_length(coalesce(payload->'related_ids','[]'))>50 then raise exception 'invalid relations' using errcode='22023'; end if;
  -- Only Wiki-origin reference edges are updated; Issue/Project contents are not copied.
  select coalesce(array_agg(target_id),array[]::uuid[]) into old_links from public.resource_relations where workspace_id=w and source_id=target and relation_type='references' and archived_at is null;
  update public.resource_relations set archived_at=now() where workspace_id=w and source_id=target and relation_type='references' and archived_at is null;
  for linked in select distinct value::uuid from jsonb_array_elements_text(coalesce(payload->'related_ids','[]')) loop
   if not exists(select 1 from public.resources rr where rr.id=linked and rr.workspace_id=w and rr.kind in ('issue','project') and (rr.archived_at is null or (operation='update' and linked=any(old_links))) and intelliflow_private.can_read_resource(w,linked) and (status_name='draft' or rr.visibility='workspace')) then raise exception 'invalid relation' using errcode='42501'; end if;
   insert into public.resource_relations(workspace_id,source_id,target_id,relation_type,created_by) values(w,target,linked,'references',u) on conflict(workspace_id,source_id,target_id,relation_type) do update set archived_at=null;
  end loop;
  update public.wiki_pages set body=plain,body_doc=payload->'body_doc',category=btrim(payload->>'category'),parent_id=parent,status=status_name,
   project_id=(select rel.target_id from public.resource_relations rel join public.projects p on p.resource_id=rel.target_id where rel.source_id=target and rel.relation_type='references' and rel.archived_at is null order by rel.target_id limit 1)
   where resource_id=target returning * into page;
  update public.resources set title=btrim(payload->>'title'),visibility=case when status_name='published' then 'workspace' else 'private' end where id=target;
 end if;
 revision_number:=case when operation='create' then page.current_revision else page.current_revision+1 end;
 update public.wiki_pages set current_revision=revision_number where resource_id=target returning * into page;
 update public.resources set version=case when operation='create' then version else version+1 end,updated_by=u,updated_at=now() where id=target returning * into r;
 insert into public.wiki_revisions(workspace_id,wiki_id,revision,title,body,body_doc,edited_by,metadata)
 values(w,target,revision_number,r.title,page.body,page.body_doc,u,jsonb_build_object('status',page.status,'category',page.category,'parent_id',page.parent_id,'action',operation,'related_ids',(select coalesce(jsonb_agg(target_id order by target_id),'[]') from public.resource_relations where source_id=target and relation_type='references' and archived_at is null)));
 return jsonb_build_object('id',target,'version',r.version,'revision',revision_number);
end $$;
create function public.wiki_command(target_workspace uuid,operation text,payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select intelliflow_private.wiki_command(target_workspace,operation,payload) $$;

create function public.wiki_query(target_workspace uuid,collection text,filters jsonb default '{}') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; found_page jsonb; q text:=btrim(coalesce(filters->>'q','')); offset_n integer:=greatest(0,coalesce((filters->>'offset')::integer,0)); limit_n integer:=least(100,greatest(1,coalesce((filters->>'limit')::integer,50))); target uuid; total bigint;
begin
 if intelliflow_private.my_role(target_workspace) is null then raise exception 'not authorized' using errcode='42501'; end if;
 if length(q)>200 or collection is null or collection not in ('list','detail','revision','options','backlinks','targets') then raise exception 'invalid query' using errcode='22023'; end if;
 if collection='options' then
  return jsonb_build_object('pages',(select coalesce(jsonb_agg(to_jsonb(p)-'body_doc'-'body' order by p.title),'[]') from public.wiki_records p where workspace_id=target_workspace and archived_at is null),
   'categories',(select coalesce(jsonb_agg(distinct category),'[]') from public.wiki_records where workspace_id=target_workspace and archived_at is null));
 elsif collection='targets' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'kind',r.kind) order by r.title),'[]') from (select * from public.resources where workspace_id=target_workspace and kind in ('issue','project') and archived_at is null and (q='' or strpos(lower(title),lower(q))>0) order by title,id limit 30) r);
 elsif collection='backlinks' then
  target:=(filters->>'id')::uuid;
  if not intelliflow_private.can_read_resource(target_workspace,target) then raise exception 'not found' using errcode='P0002'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(p)-'body_doc'-'body' order by p.updated_at desc),'[]') from public.resource_relations rel join public.wiki_records p on p.id=rel.source_id where rel.workspace_id=target_workspace and rel.target_id=target and rel.relation_type='references' and rel.archived_at is null and p.archived_at is null);
 elsif collection in ('detail','revision') then
  target:=(filters->>'id')::uuid;select to_jsonb(p) into found_page from public.wiki_records p where workspace_id=target_workspace and id=target;
  if found_page is null then raise exception 'not found' using errcode='P0002'; end if;
  if collection='revision' then
   select to_jsonb(v) into result from public.wiki_revisions v where workspace_id=target_workspace and wiki_id=target and revision=(filters->>'revision')::integer;
   if result is null then raise exception 'not found' using errcode='P0002'; end if;return result;
  end if;
  return jsonb_build_object('page',found_page,
   'relations',(select coalesce(jsonb_agg(jsonb_build_object('id',rr.id,'title',rr.title,'kind',rr.kind,'archived_at',rr.archived_at) order by rr.title),'[]') from public.resource_relations rel join public.resources rr on rr.id=rel.target_id where rel.source_id=target and rel.workspace_id=target_workspace and rel.relation_type='references' and rel.archived_at is null),
   'revisions',(select coalesce(jsonb_agg(to_jsonb(v)-'body_doc'-'body' order by v.revision desc),'[]') from (select * from public.wiki_revisions where workspace_id=target_workspace and wiki_id=target order by revision desc limit 100) v));
 end if;
 with matching as (select p.* from public.wiki_records p where workspace_id=target_workspace and (archived_at is not null)=coalesce((filters->>'archived')::boolean,false)
  and (q='' or strpos(lower(title||' '||body),lower(q))>0) and (coalesce(filters->>'category','')='' or category=filters->>'category') and (coalesce(filters->>'status','')='' or status=filters->>'status')),
 page as (select * from matching order by updated_at desc,id limit limit_n offset offset_n)
 select coalesce((select jsonb_agg(to_jsonb(page)-'body_doc'-'body') from page),'[]'),(select count(*) from matching) into result,total;
 return jsonb_build_object('items',result,'total',total,'offset',offset_n,'limit',limit_n);
end $$;

-- Private Storage bucket. Normal clients cannot replace/delete historical objects.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('intelliflow-wiki','intelliflow-wiki',false,3145728,array['image/png','image/jpeg','image/webp']);
create policy intelliflow_wiki_upload on storage.objects for insert to authenticated with check(
 bucket_id='intelliflow-wiki' and exists(select 1 from public.wiki_attachments a where a.object_path=name and a.uploaded_by=(select auth.uid()) and a.state='pending' and intelliflow_private.can_edit_wiki(a.workspace_id,a.wiki_id))
);
create policy intelliflow_wiki_download on storage.objects for select to authenticated using(bucket_id='intelliflow-wiki' and intelliflow_private.can_read_wiki_attachment(name));
-- Restrictive guards prevent broad existing permissive policies from opening this bucket.
create policy intelliflow_wiki_read_guard on storage.objects as restrictive for select to anon,authenticated using(bucket_id<>'intelliflow-wiki' or intelliflow_private.can_read_wiki_attachment(name));
create policy intelliflow_wiki_insert_guard on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'intelliflow-wiki' or exists(select 1 from public.wiki_attachments a where a.object_path=name and a.uploaded_by=auth.uid() and a.state='pending' and intelliflow_private.can_edit_wiki(a.workspace_id,a.wiki_id)));
create policy intelliflow_wiki_update_guard on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'intelliflow-wiki') with check(bucket_id<>'intelliflow-wiki');
create policy intelliflow_wiki_delete_guard on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'intelliflow-wiki');
revoke all on function intelliflow_private.wiki_doc_text(jsonb,integer),intelliflow_private.can_edit_wiki(uuid,uuid),intelliflow_private.can_read_wiki_attachment(text),intelliflow_private.wiki_command(uuid,text,jsonb) from public,anon;
grant execute on function intelliflow_private.wiki_doc_text(jsonb,integer),intelliflow_private.can_edit_wiki(uuid,uuid),intelliflow_private.can_read_wiki_attachment(text),intelliflow_private.wiki_command(uuid,text,jsonb) to authenticated;
revoke all on function public.wiki_command(uuid,text,jsonb),public.wiki_query(uuid,text,jsonb) from public,anon;
grant execute on function public.wiki_command(uuid,text,jsonb),public.wiki_query(uuid,text,jsonb) to authenticated;
commit;
