import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {installStorageSchema} from './helpers/storage.mjs';
const db=new PGlite({extensions:{pg_trgm}});
const uid=n=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const denied=code=>error=>error.code===code;
let ws,other,project,issue,wiki,draft,foreign,issue2;
async function asUser(n,sql,values=[],role='authenticated',extra={}) {
 await db.exec(`set role ${role}`);
 try {await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:n?uid(n):null,role,...extra})]);return await db.query(sql,values);} finally {await db.exec('reset role');}
}
async function rpc(n,name,args){const placeholders=args.map((_,i)=>`$${i+1}`).join(',');return (await asUser(n,`select public.${name}(${placeholders}) as value`,args)).rows[0].value;}
const work=(n,op,payload,w=ws)=>rpc(n,'work_item_command',[w,op,JSON.stringify(payload)]);
const command=(n,op,payload,w=ws)=>rpc(n,'wiki_command',[w,op,JSON.stringify(payload)]);
const search=(n,collection='search',filters={},w=ws)=>rpc(n,'flow_query',[w,collection,JSON.stringify(filters)]);
const doc=text=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
const wikiBody=(extra={})=>({title:'イベントの手引き',body_doc:doc('過去の運営ノウハウ'),category:'手順',status:'published',parent_id:null,related_ids:[],...extra});
async function relation(n,a,b,operation='link',w=ws,extra={}) {
 const [source,target]=await Promise.all([search(n,'detail',{id:a},w),search(n,'detail',{id:b},w)]);
 return rpc(n,'flow_relation_command',[w,operation,JSON.stringify({source_id:a,target_id:b,source_version:source.version,target_version:target.version,...extra})]);
}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to authenticated,anon,service_role;grant execute on all functions in schema auth to authenticated,anon,service_role;`);
 await installStorageSchema(db);
 for(let n=1;n<=5;n++)await db.query('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())',[uid(n),`flow${n}@test.invalid`]);
 const folder=new URL('../supabase/migrations/',import.meta.url);for(const file of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
 ws=(await rpc(1,'workspace_command',['create',JSON.stringify({name:'Flowチーム'})])).workspace_id;
 other=(await rpc(2,'workspace_command',['create',JSON.stringify({name:'別WS'})])).workspace_id;
 for(const [n,role]of [[3,'member'],[4,'viewer'],[5,'admin']]){const token=String(n).repeat(64);await rpc(1,'workspace_command',['invite',JSON.stringify({workspace_id:ws,email:`flow${n}@test.invalid`,role,token})]);await rpc(n,'workspace_command',['accept',JSON.stringify({token})]);}
 project=await work(1,'project_create',{title:'以前のイベント',description:'運営の振り返り',status:'completed',member_ids:[]});
 issue=await work(3,'issue_create',{title:'イベントの問題',description:'受付で混雑した。100%完了_チェック',status:'done',priority:'normal',labels:[],project_id:project.id});
 issue2=await work(1,'issue_create',{title:'次回への課題',description:'案内を増やす',status:'open',priority:'normal',labels:[]});
 wiki=await command(3,'create',wikiBody({related_ids:[issue.id,project.id]}));
 draft=await command(1,'create',wikiBody({title:'秘密の下書き',status:'draft',body_doc:doc('イベントの問題と内部メモ'),related_ids:[issue.id]}));
 foreign=await work(2,'issue_create',{title:'イベントの問題・別チーム',status:'open',priority:'normal',labels:[]},other);
});
after(()=>db.close());
test('検索: 日本語の部分一致・空白AND・タイトルと本文・種類・文字どおりの記号',async()=>{
 let found=await search(4,'search',{q:'イベント 混雑',kind:'issue'});assert.deepEqual(found.result_ids,[issue.id]);assert.ok(found.nodes.some(n=>n.id===wiki.id));
 assert.deepEqual((await search(4,'search',{q:'100%完了_'})).result_ids,[issue.id]);
 assert.equal((await search(4,'search',{q:"%' OR true --"})).result_ids.length,0);
 assert.equal((await search(4,'search',{q:'ノウハウ',kind:'wiki'})).result_ids[0],wiki.id);
 assert.ok((await search(4)).nodes.every(n=>!('body'in n)&&n.excerpt.length<=320));
});
test('完了条件: 作成したIssueとWikiがIDの線でつながり、クリック用詳細と元ページIDを取得',async()=>{
 const batch=await search(4,'search',{q:'受付'});assert.deepEqual(batch.result_ids,[issue.id]);
 assert.ok(batch.nodes.some(n=>n.id===wiki.id&&n.kind==='wiki'));
 assert.ok(batch.edges.some(e=>e.source_id===wiki.id&&e.target_id===issue.id&&e.relation_type==='references'));
 const detail=await search(4,'detail',{id:issue.id});assert.equal(detail.kind,'issue');assert.match(detail.excerpt,/混雑/);
 const linked=await search(4,'neighbors',{id:wiki.id});assert.ok(linked.nodes.some(n=>n.id===issue.id));
});
test('RLS: 別WS・未認証・匿名・特権トークン・下書きを検索/件数/端点に漏らさない',async()=>{
 const visible=await search(4);assert.ok(!visible.nodes.some(n=>[draft.id,foreign.id].includes(n.id)));assert.ok(!visible.edges.some(e=>e.source_id===draft.id||e.target_id===draft.id));
 assert.ok((await search(1)).nodes.some(n=>n.id===draft.id));assert.ok((await search(5)).nodes.some(n=>n.id===draft.id));
 await assert.rejects(search(3,'detail',{id:draft.id}),denied('P0002'));await assert.rejects(search(4,'neighbors',{id:draft.id}),denied('P0002'));
 await assert.rejects(search(2),denied('42501'));await assert.rejects(search(4,'detail',{id:foreign.id}),denied('P0002'));
 for(const [n,role,extra] of [[null,'anon',{}],[null,'authenticated',{}],[3,'authenticated',{is_anonymous:true}],[3,'service_role',{}]])await assert.rejects(asUser(n,'select public.flow_query($1,$2,$3::jsonb)',[ws,'search','{}'],role,extra),denied('42501'));
 const edges=(await asUser(4,'select * from public.flow_edges where workspace_id=$1',[ws])).rows;assert.ok(edges.every(e=>e.source_id!==draft.id&&e.target_id!==draft.id));
});
test('Project検索: 所属とWiki参照を統合、別Projectと不可視Projectを除外',async()=>{
 const batch=await search(4,'search',{project:project.id});assert.ok(batch.result_ids.includes(issue.id));assert.ok(batch.result_ids.includes(wiki.id));assert.ok(batch.result_ids.includes(project.id));assert.ok(!batch.result_ids.includes(issue2.id));
 assert.ok(batch.edges.some(e=>e.relation_type==='belongs_to'&&e.source_id===issue.id&&e.target_id===project.id));
 assert.equal((await search(4,'projects',{q:'以前'})).result_ids[0],project.id);
 await assert.rejects(search(4,'search',{project:foreign.id}),denied('P0002'));
});
test('日付: 日本時間の更新日範囲の両端、完了済みも検索',async()=>{
 await db.query("update public.resources set updated_at='2020-04-01T15:00:00Z' where id=$1",[issue.id]);
 assert.deepEqual((await search(4,'search',{from:'2020-04-02',to:'2020-04-02',kind:'issue'})).result_ids,[issue.id]);
 assert.equal((await search(4,'search',{to:'2020-04-01',kind:'issue'})).result_ids.length,0);
 await assert.rejects(search(4,'search',{from:'2026-12-01',to:'2020-01-01'}),denied('22023'));
});
test('関連付け: MemberがIssue→Wikiで保存でき、逆引きとWiki版履歴が更新される',async()=>{
 const before=(await rpc(3,'wiki_query',[ws,'detail',JSON.stringify({id:wiki.id})])).page;
 await relation(3,issue2.id,wiki.id);let detail=await rpc(4,'wiki_query',[ws,'detail',JSON.stringify({id:wiki.id})]);
 assert.equal(detail.page.current_revision,before.current_revision+1);assert.ok(detail.relations.some(r=>r.id===issue2.id));
 assert.ok((await rpc(4,'wiki_query',[ws,'backlinks',JSON.stringify({id:issue2.id})])).some(r=>r.id===wiki.id));
 await relation(3,issue2.id,wiki.id,'unlink');detail=await rpc(4,'wiki_query',[ws,'detail',JSON.stringify({id:wiki.id})]);assert.ok(!detail.relations.some(r=>r.id===issue2.id));assert.equal(detail.page.body,before.body);
});
test('関連付け: WikiとProject/Issue同士を保存、履歴記録、解除、古い版の拒否',async()=>{
 await relation(3,issue.id,issue2.id);const batch=await search(4,'neighbors',{id:issue2.id});assert.ok(batch.edges.some(e=>e.relation_type==='related_to'));
 assert.ok((await rpc(4,'work_items_query',[ws,'detail',JSON.stringify({kind:'issue',id:issue.id})])).events.some(e=>e.action==='link'));
 await relation(3,issue.id,issue2.id,'unlink');
 await relation(3,wiki.id,project.id,'unlink');await relation(3,project.id,wiki.id);
 await assert.rejects(relation(3,issue.id,wiki.id,'link',ws,{source_version:1}),denied('40001'));
});
test('関連付け権限: Viewer・越境・下書き・自己・不正種別・直接書込みを拒否',async()=>{
 await assert.rejects(relation(4,issue.id,wiki.id),denied('42501'));
 const a=await search(3,'detail',{id:issue.id});await assert.rejects(rpc(3,'flow_relation_command',[ws,'link',JSON.stringify({source_id:issue.id,target_id:foreign.id,source_version:a.version,target_version:1})]),denied('P0002'));
 await assert.rejects(relation(3,issue.id,issue.id),denied('22023'));await assert.rejects(relation(3,issue.id,project.id),denied('22023'));
 await assert.rejects(asUser(3,"insert into public.resource_relations(workspace_id,source_id,target_id,relation_type,created_by)values($1,$2,$3,'references',$4)",[ws,issue.id,wiki.id,uid(3)]),denied('42501'));
 const privateWiki=await command(1,'create',wikiBody({title:'管理者の下書き',status:'draft'}));await assert.rejects(rpc(3,'flow_relation_command',[ws,'link',JSON.stringify({source_id:issue.id,target_id:privateWiki.id,source_version:a.version,target_version:1})]),denied('P0002'));
});
test('段階取得: 検索10件+関連20本、隣接20本ずつ、重複なし、ページング',async()=>{
 for(let n=0;n<24;n++)await command(1,'create',wikiBody({title:`段階取得${n}`,related_ids:[issue.id]}));
 const first=await search(4,'search',{q:'段階取得',kind:'wiki'});assert.equal(first.result_ids.length,10);assert.equal(first.has_more,true);assert.ok(first.nodes.length<=30);assert.ok(first.edges.length<=20);
 const second=await search(4,'search',{q:'段階取得',kind:'wiki',offset:10});assert.ok(second.result_ids.every(id=>!first.result_ids.includes(id)));
 const neighbors=await search(4,'neighbors',{id:issue.id});assert.equal(neighbors.edges.length,20);assert.equal(neighbors.has_more,true);
 const next=await search(4,'neighbors',{id:issue.id,offset:20});assert.ok(next.edges.length>0);assert.ok(next.edges.every(e=>!neighbors.edges.some(prior=>prior.id===e.id)));
 await assert.rejects(search(4,'neighbors',{id:issue.id,offset:10001}),denied('22023'));
});
test('削除・脱退: アーカイブは指定時のみ表示し、関連線も同じ条件、脱退で即時失効',async()=>{
 const page=(await rpc(3,'wiki_query',[ws,'detail',JSON.stringify({id:wiki.id})])).page;await command(3,'archive',{id:wiki.id,expected_version:page.version});
 assert.ok(!(await search(4,'search',{q:'手引き'})).nodes.some(n=>n.id===wiki.id));
 assert.ok((await search(4,'search',{q:'手引き',archived:true})).nodes.some(n=>n.id===wiki.id));
 await assert.rejects(search(4,'detail',{id:wiki.id}),denied('P0002'));assert.ok((await search(4,'detail',{id:wiki.id,archived:true})).archived_at);
 await rpc(1,'workspace_command',['remove',JSON.stringify({workspace_id:ws,user_id:uid(3)})]);
 await assert.rejects(search(3),denied('42501'));
});
test('DB構成: invokerビュー、trigramインデックス、不正な種類の拒否',async()=>{
 const views=(await db.query("select reloptions from pg_class where relname in ('flow_records','flow_edges')")).rows;assert.equal(views.length,2);assert.ok(views.every(v=>v.reloptions.includes('security_invoker=true')));
 assert.equal((await db.query("select count(*)::int as count from pg_indexes where indexname in ('flow_resources_title','flow_issues_description','flow_projects_description','flow_wiki_pages_body') and indexdef ilike '%gin%'")).rows[0].count,4);
 await assert.rejects(search(4,'search',{kind:'unknown'}),denied('22023'));assert.equal((await search(4,'search',{kind:'handoff'})).result_ids.length,0);assert.ok((await search(4)).nodes.every(n=>['issue','project','wiki','handoff'].includes(n.kind)));
});
