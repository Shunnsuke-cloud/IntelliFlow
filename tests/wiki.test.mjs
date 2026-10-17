import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {installStorageSchema} from './helpers/storage.mjs';
const db=new PGlite();const uid=n=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const denies=code=>error=>error.code===code;
const doc=text=>({type:'doc',content:[{type:'paragraph',content:text?[{type:'text',text}]:[]} ]});
const body=(extra={})=>({title:'活動マニュアル',category:'手順',status:'draft',parent_id:null,related_ids:[],body_doc:doc('活動の準備と注意点'),...extra});
let ws,other,page,project,issue,child;
async function user(n,sql,params=[],role='authenticated',extra={}){await db.exec(`set role ${role}`);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:n?uid(n):null,role,...extra})]);try{return await db.query(sql,params);}finally{await db.exec('reset role');}}
async function command(n,operation,payload,w=ws,role='authenticated',extra={}){return (await user(n,'select public.wiki_command($1,$2,$3::jsonb) as value',[w,operation,JSON.stringify(payload)],role,extra)).rows[0].value;}
async function query(n,collection,filters={},w=ws){return (await user(n,'select public.wiki_query($1,$2,$3::jsonb) as value',[w,collection,JSON.stringify(filters)])).rows[0].value;}
async function detail(n,id){return query(n,'detail',{id});}
async function edit(n,id,changes={}){const d=await detail(n,id);return command(n,'update',{...body(),...d.page,...changes,id,expected_version:d.page.version,related_ids:changes.related_ids??d.relations.map(r=>r.id)});}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
 grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
 await installStorageSchema(db);for(let n=1;n<=5;n++)await db.query('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())',[uid(n),`wiki${n}@test.invalid`]);
 for(const name of ['20261017072651_phase2_workspaces.sql','20261017080005_phase3_issues_projects.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 async function workspace(n,operation,payload){return (await user(n,'select public.workspace_command($1,$2::jsonb) as value',[operation,JSON.stringify(payload)])).rows[0].value;}
 ws=(await workspace(1,'create',{name:'Wikiチーム'})).workspace_id;other=(await workspace(2,'create',{name:'別WS'})).workspace_id;
 for(const [n,role]of [[3,'member'],[4,'viewer'],[5,'admin']]){const token=String(n).repeat(64);await workspace(1,'invite',{workspace_id:ws,email:`wiki${n}@test.invalid`,role,token});await workspace(n,'accept',{token});}
 await db.exec(`begin;insert into public.resources(id,workspace_id,kind,title,created_by,updated_by)values('${uid(90)}','${ws}','wiki','既存の資料','${uid(1)}','${uid(1)}');insert into public.wiki_pages(resource_id,workspace_id,body)values('${uid(90)}','${ws}','<script>旧本文</script>');commit;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261017083402_phase4_wiki.sql',import.meta.url),'utf8'));
 async function work(operation,payload){return (await user(1,'select public.work_item_command($1,$2,$3::jsonb) as value',[ws,operation,JSON.stringify(payload)])).rows[0].value;}
 project=await work('project_create',{title:'活動プロジェクト',status:'active',member_ids:[]});issue=await work('issue_create',{title:'準備の課題',status:'open',priority:'normal',labels:[],project_id:project.id});
});
after(async()=>{await db.close();});
test('移行: 旧本文をHTML解釈せず保持し、版を追加',async()=>{const d=await detail(1,uid(90));assert.equal(d.page.body,'<script>旧本文</script>');assert.equal(d.page.body_doc.content[0].content[0].text,d.page.body);assert.equal(d.revisions.length,1);});
test('CRUD・検索・カテゴリ: 下書き作成、編集、共有、キーワード検索',async()=>{
 page=await command(3,'create',body());assert.equal((await query(4,'list')).total,0);await assert.rejects(detail(4,page.id),denies('P0002'));
 await edit(3,page.id,{title:'公開マニュアル',status:'published',body_doc:doc('学校の活動・FAQを検索できます')});
 const d=await detail(4,page.id);assert.equal(d.page.current_revision,2);assert.equal(d.page.title,'公開マニュアル');assert.equal((await query(4,'list',{q:'FAQ',category:'手順',status:'published'})).total,1);assert.equal((await query(4,'list',{q:"%' OR true --"})).total,0);
});
test('版履歴: 公開後も下書き版は非公開、過去本文は不変',async()=>{
 await assert.rejects(query(4,'revision',{id:page.id,revision:1}),denies('P0002'));assert.equal((await query(3,'revision',{id:page.id,revision:1})).body_doc.content[0].content[0].text,'活動の準備と注意点');
 await edit(3,page.id,{body_doc:doc('新しい本文')});assert.equal((await query(4,'revision',{id:page.id,revision:2})).body_doc.content[0].content[0].text,'学校の活動・FAQを検索できます');
 await assert.rejects(user(3,'delete from public.wiki_revisions where wiki_id=$1',[page.id]),denies('42501'));
});
test('関連付け: Issue/ProjectにID参照、逆引き、解除、本文コピーなし',async()=>{
 await edit(3,page.id,{related_ids:[issue.id,project.id]});assert.equal((await detail(4,page.id)).relations.length,2);assert.equal((await query(4,'backlinks',{id:issue.id}))[0].id,page.id);assert.equal((await query(4,'backlinks',{id:project.id}))[0].id,page.id);
 const original=(await user(4,'select title from public.resources where id=$1',[issue.id])).rows[0].title;assert.equal(original,'準備の課題');await edit(3,page.id,{related_ids:[project.id]});assert.equal((await query(4,'backlinks',{id:issue.id})).length,0);
});
test('階層: 親子設定、循環/自己/別WSの親と関連を拒否',async()=>{
 child=await command(3,'create',body({title:'子ページ',status:'published',parent_id:page.id}));assert.equal((await detail(4,child.id)).page.parent_id,page.id);
 await assert.rejects(edit(3,page.id,{parent_id:child.id}),denies('23514'));await assert.rejects(edit(3,page.id,{parent_id:page.id}),denies('23514'));
 const external=await command(2,'create',body({status:'published'}),other);await assert.rejects(edit(3,page.id,{parent_id:external.id}),denies('42501'));
 await assert.rejects(edit(3,page.id,{related_ids:[external.id]}),denies('42501'));await assert.rejects(edit(3,page.id,{status:'draft'}),denies('23514'));
});
test('権限: Viewer/未認証/匿名/別WSの書込み・検索・下書きを拒否',async()=>{
 await assert.rejects(command(4,'create',body()),denies('42501'));await assert.rejects(query(2,'list'),denies('42501'));await assert.rejects(command(2,'create',body()),denies('42501'));
 await assert.rejects(command(null,'create',body(),ws,'anon'),denies('42501'));await assert.rejects(command(3,'create',body(),ws,'authenticated',{is_anonymous:true}),denies('42501'));
 await assert.rejects(command(3,'create',body(),ws,'service_role'),denies('42501'));
 await assert.rejects(user(3,"update public.wiki_pages set body='override' where resource_id=$1",[page.id]),denies('42501'));
 await assert.rejects(edit(3,uid(90)),denies('P0002'));
});
test('本文セキュリティ: スクリプトノード・危険リンク・イベント属性・画像偽装をDBでも拒否',async()=>{
 const bad=[{type:'script',text:'alert(1)'},{type:'paragraph',attrs:{onclick:'x'}},{type:'paragraph',content:[{type:'text',text:'x',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]},{type:'image',attrs:{src:'https://evil.test'}}];
 for(const node of bad)await assert.rejects(command(3,'create',body({body_doc:{type:'doc',content:[node]}})),denies('22023'));
 await assert.rejects(command(3,'create',body({body_doc:{type:'doc',content:[{type:'image',attrs:{attachmentId:uid(300),alt:''}}]}})),denies('42501'));
});
test('競合と削除: 古い版を拒否、親削除で子/履歴を保持、復元可能',async()=>{
 const old=(await detail(3,page.id)).page;await edit(3,page.id,{title:'最新版'});await assert.rejects(command(3,'update',{...body(),id:page.id,expected_version:old.version}),denies('40001'));
 let d=await detail(3,page.id);await assert.rejects(command(1,'archive',{id:page.id,expected_version:d.page.version+1}),denies('40001'));
 await command(3,'archive',{id:page.id,expected_version:d.page.version});assert.equal((await query(4,'list',{archived:true})).items[0].id,page.id);assert.equal((await detail(4,child.id)).page.parent_id,page.id);
 d=await detail(3,page.id);await command(3,'restore',{id:page.id,expected_version:d.page.version});assert.ok((await detail(3,page.id)).revisions.some(v=>v.metadata.action==='restore'));
});
test('画像Storage: 予約者だけアップロード、同WSでも未参照画像は非公開',async()=>{
 const reserved=await command(3,'attachment_reserve',{id:page.id,attachment_id:uid(301),mime_type:'image/png',byte_size:8});
 await assert.rejects(user(1,"insert into storage.objects(bucket_id,name,metadata)values('intelliflow-wiki',$1,$2)",[reserved.object_path,JSON.stringify({size:8,mimetype:'image/png'})]),denies('42501'));
 await user(3,"insert into storage.objects(bucket_id,name,metadata)values('intelliflow-wiki',$1,$2)",[reserved.object_path,JSON.stringify({size:8,mimetype:'image/png'})]);
 await command(3,'attachment_finish',{id:page.id,attachment_id:uid(301)});assert.equal((await user(4,'select * from storage.objects where name=$1',[reserved.object_path])).rows.length,0);
 await edit(3,page.id,{body_doc:{type:'doc',content:[{type:'image',attrs:{attachmentId:uid(301),alt:'資料の画像'}}]}});
 assert.equal((await user(4,'select * from storage.objects where name=$1',[reserved.object_path])).rows.length,1);
 await assert.rejects(user(2,"insert into storage.objects(bucket_id,name,metadata)values('intelliflow-wiki',$1,$2)",[`${other}/${page.id}/${uid(302)}`,JSON.stringify({size:8,mimetype:'image/png'})]),denies('42501'));
});
test('Storage防御: 広い既存ポリシーがあっても別WSの読取・上書き・削除を拒否',async()=>{
 await db.exec('create policy legacy_broad on storage.objects for all to authenticated using(true) with check(true)');
 assert.equal((await user(2,"select * from storage.objects where bucket_id='intelliflow-wiki'")).rows.length,0);
 assert.equal((await user(3,"delete from storage.objects where bucket_id='intelliflow-wiki' returning id")).rows.length,0);
 assert.equal((await user(3,"update storage.objects set metadata='{}' where bucket_id='intelliflow-wiki' returning id")).rows.length,0);
 await assert.rejects(command(3,'attachment_reserve',{id:page.id,attachment_id:uid(303),mime_type:'image/svg+xml',byte_size:100}),denies('23514'));
});
test('画像履歴: 下書きだけにある画像を公開版から漏らさず、公開履歴の画像は保持',async()=>{
 const draft=await command(3,'create',body());const attachment=uid(304);
 const reserved=await command(3,'attachment_reserve',{id:draft.id,attachment_id:attachment,mime_type:'image/png',byte_size:8});
 await user(3,"insert into storage.objects(bucket_id,name,metadata)values('intelliflow-wiki',$1,$2)",[reserved.object_path,JSON.stringify({size:8,mimetype:'image/png'})]);
 await command(3,'attachment_finish',{id:draft.id,attachment_id:attachment});
 const imageDoc={type:'doc',content:[{type:'image',attrs:{attachmentId:attachment,alt:'下書きの画像'}}]};
 await edit(3,draft.id,{body_doc:imageDoc});await edit(3,draft.id,{status:'published',body_doc:doc('共有する文章だけ')});
 assert.equal((await user(4,'select * from storage.objects where name=$1',[reserved.object_path])).rows.length,0);
 assert.equal((await user(3,'select * from storage.objects where name=$1',[reserved.object_path])).rows.length,1);
 await assert.rejects(edit(3,page.id,{body_doc:imageDoc}),denies('42501'));
 await edit(3,draft.id,{body_doc:imageDoc});await edit(3,draft.id,{body_doc:doc('画像を除いた最新版')});
 assert.equal((await user(4,'select * from storage.objects where name=$1',[reserved.object_path])).rows.length,1);
 const another=await command(1,'create',body({status:'published'}));const current=(await detail(3,another.id)).page;
 await assert.rejects(command(3,'archive',{id:another.id,expected_version:current.version}),denies('42501'));
 await assert.rejects(edit(3,another.id,{status:'draft'}),denies('42501'));
});
