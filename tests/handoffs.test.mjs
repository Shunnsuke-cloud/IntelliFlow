import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {installStorageSchema} from './helpers/storage.mjs';
const db=new PGlite({extensions:{pg_trgm}});const uid=n=>`60000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const denied=code=>e=>e.code===code;
let ws,other,issue,project,wiki,privateWiki,foreign,handoff,firstSnapshot;
async function user(n,sql,values=[],role='authenticated',claims={}){await db.exec(`set role ${role}`);try{await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:n?uid(n):null,role,...claims})]);return await db.query(sql,values);}finally{await db.exec('reset role');}}
async function rpc(n,name,args){return (await user(n,`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as value`,args)).rows[0].value;}
const command=(n,op,payload,w=ws)=>rpc(n,'handoff_command',[w,op,JSON.stringify(payload)]);
const query=(n,collection='list',filters={},w=ws)=>rpc(n,'handoff_query',[w,collection,JSON.stringify(filters)]);
const flow=(n,collection,filters={})=>rpc(n,'flow_query',[ws,collection,JSON.stringify(filters)]);
const detail=(n,id=handoff.id)=>query(n,'detail',{id});
const body=(extra={})=>({title:'イベント受付の引き継ぎ',summary:'過去の経緯と受付の案内',current_state:'混雑を整理中',completed_work:'受付表を作成',pending_work:'案内の設置',risks:'雨天時は入口変更',next_actions:'朝に会場を確認',recipient_id:uid(4),related_ids:[issue.id,project.id,wiki.id],...extra});
async function operate(n,op,extra={},id=handoff.id){const d=await detail(n,id);return command(n,op,{id,expected_version:d.item.version,content_version:d.item.current_version,...extra});}
async function edit(n,extra={},id=handoff.id,op='update'){const d=await detail(n,id);return command(n,op,{...d.item,related_ids:d.related.map(r=>r.id),...extra,id,expected_version:d.item.version});}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to authenticated,anon,service_role;grant execute on all functions in schema auth to authenticated,anon,service_role;`);
 await installStorageSchema(db);for(let n=1;n<=5;n++)await db.query('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())',[uid(n),`handoff${n}@test.invalid`]);
 const folder=new URL('../supabase/migrations/',import.meta.url);for(const file of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
 ws=(await rpc(1,'workspace_command',['create',JSON.stringify({name:'引き継ぎチーム'})])).workspace_id;other=(await rpc(2,'workspace_command',['create',JSON.stringify({name:'別チーム'})])).workspace_id;
 for(const [n,role]of [[3,'member'],[4,'viewer'],[5,'admin']]){const token=String(n).repeat(64);await rpc(1,'workspace_command',['invite',JSON.stringify({workspace_id:ws,email:`handoff${n}@test.invalid`,role,token})]);await rpc(n,'workspace_command',['accept',JSON.stringify({token})]);}
 project=await rpc(3,'work_item_command',[ws,'project_create',JSON.stringify({title:'学校イベント',description:'会場運営',status:'active',member_ids:[]})]);
 issue=await rpc(3,'work_item_command',[ws,'issue_create',JSON.stringify({title:'受付の混雑',description:'当時の受付状況 <script>alert(1)</script>',status:'in_progress',priority:'high',labels:[],project_id:project.id})]);
 const wikiBody=status=>({title:'受付マニュアル',category:'手順',status,body_doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'当時の資料本文'}]}]},related_ids:[issue.id,project.id]});
 wiki=await rpc(3,'wiki_command',[ws,'create',JSON.stringify(wikiBody('published'))]);privateWiki=await rpc(3,'wiki_command',[ws,'create',JSON.stringify(wikiBody('draft'))]);
 foreign=await rpc(2,'work_item_command',[other,'issue_create',JSON.stringify({title:'別WSの課題',status:'open',priority:'normal',labels:[]})]);
});
after(()=>db.close());
test('候補: Issue/Projectから本文・進捗・関連WikiをRLS下で取得し、自動保存しない',async()=>{
 const seed=await query(3,'seed',{source_id:issue.id});assert.equal(seed.summary,'当時の受付状況 <script>alert(1)</script>');assert.ok(seed.related.some(r=>r.id===wiki.id));assert.ok(seed.related.some(r=>r.id===project.id));
 const p=await query(3,'seed',{source_id:project.id});assert.match(p.current_state,/完了 0件 \/ 全1件/);assert.match(p.pending_work,/受付の混雑/);assert.equal((await query(3)).items.length,0);
 await assert.rejects(query(3,'seed',{source_id:foreign.id}),denied('P0002'));
});
test('下書きCRUD: 本人だけ編集、管理者は閲覧のみ、受取人にも下書きを公開しない',async()=>{
 handoff=await command(3,'create',body());assert.equal((await detail(3)).item.status,'draft');assert.equal((await query(4)).items.length,0);
 await assert.rejects(detail(4),denied('P0002'));assert.equal((await detail(5)).item.sender_id,uid(3));await assert.rejects(edit(5,{title:'管理者の代理編集'}),denied('42501'));
 await db.query("update public.handoff_items set note='既存メモ',sort_order=5 where handoff_id=$1 and resource_id=$2",[handoff.id,wiki.id]);
 await edit(3,{summary:'変更した作業概要'});assert.equal((await detail(3)).item.summary,'変更した作業概要');assert.equal((await db.query('select note,sort_order from public.handoff_items where handoff_id=$1 and resource_id=$2',[handoff.id,wiki.id])).rows[0].note,'既存メモ');
 await assert.rejects(command(4,'create',body()),denied('42501'));await assert.rejects(command(3,'create',body({recipient_id:uid(2)})),denied('42501'));await assert.rejects(command(3,'create',body({related_ids:[foreign.id]})),denied('42501'));
});
test('送信: 同一WSの受取人・共有資料・概要を必須とし、失敗時の版/状態をrollback',async()=>{
 const withoutRecipient=await command(3,'create',body({recipient_id:null}));await assert.rejects(operate(3,'send',{},withoutRecipient.id),denied('42501'));
 const hidden=await command(3,'create',body({related_ids:[privateWiki.id]}));await assert.rejects(operate(3,'send',{},hidden.id),denied('42501'));assert.equal((await detail(3,hidden.id)).item.current_version,0);
 const empty=await command(3,'create',body({summary:''}));await assert.rejects(operate(3,'send',{},empty.id),denied('22023'));
 await operate(3,'send');const d=await detail(4);assert.equal(d.item.status,'sent');assert.equal(d.item.current_version,1);assert.equal(d.current_snapshot.snapshot.related.length,3);assert.equal(d.current_snapshot.recipient_id,uid(4));firstSnapshot=structuredClone(d.current_snapshot.snapshot);
});
test('スナップショット: 元Issueの更新後も当時の本文・版・人名を維持し、最新リンクと区別',async()=>{
 const record=(await rpc(3,'work_items_query',[ws,'detail',JSON.stringify({kind:'issue',id:issue.id})])).item;
 await rpc(3,'work_item_command',[ws,'issue_update',JSON.stringify({...record,title:'現在の受付対応',description:'更新後の状況',expected_version:record.version})]);
 const d=await detail(4);assert.deepEqual(d.current_snapshot.snapshot,firstSnapshot);assert.equal(d.related.find(r=>r.id===issue.id).title,'現在の受付対応');assert.equal(d.current_snapshot.snapshot.related.find(r=>r.id===issue.id).title,'受付の混雑');
 assert.ok(d.current_snapshot.snapshot.sender_name);assert.ok(d.current_snapshot.snapshot.recipient_name);
});
test('受領: 指名されたViewerのみ受領可能、受領者/日時/版を保存し二重受領を拒否',async()=>{
 await assert.rejects(operate(1,'accept'),denied('42501'));await assert.rejects(operate(3,'accept'),denied('42501'));await assert.rejects(operate(5,'accept'),denied('42501'));
 await operate(4,'accept');const d=await detail(4);assert.equal(d.item.status,'accepted');assert.equal(d.receipts.length,1);assert.equal(d.receipts[0].version,1);assert.equal(d.receipts[0].recipient_id,uid(4));assert.ok(d.receipts[0].accepted_at);
 await assert.rejects(operate(4,'accept'),denied('23514'));await assert.rejects(edit(3,{summary:'無版変更'}),denied('23514'));
});
test('重要変更: 理由付き改訂を第2版として再送し、旧受領を保持して再確認を要求',async()=>{
 await assert.rejects(edit(3,{summary:'改訂版',change_reason:''},handoff.id,'revise'),denied('22023'));
 await edit(3,{summary:'改訂した作業概要',change_reason:'会場の入口を変更'},handoff.id,'revise');let d=await detail(4);assert.equal(d.item.status,'sent');assert.equal(d.item.current_version,2);assert.equal(d.receipts[0].version,1);assert.equal(d.versions.length,2);
 assert.deepEqual((await query(4,'version',{id:handoff.id,version:1})).snapshot,firstSnapshot);
 await assert.rejects(operate(4,'accept',{content_version:1}),denied('40001'));await assert.rejects(operate(4,'complete'),denied('23514'));
 await operate(4,'accept');d=await detail(4);assert.equal(d.receipts.length,2);assert.equal(d.receipts[0].version,2);
});
test('完了: 現行版を受領した本人が完了し、最終内容・受領履歴を維持',async()=>{
 await assert.rejects(operate(3,'complete'),denied('42501'));await operate(4,'complete');const d=await detail(4);assert.equal(d.item.status,'completed');assert.ok(d.receipts[0].completed_at);assert.equal(d.receipts[1].completed_at,null);
 await assert.rejects(edit(3,{change_reason:'完了後の変更'},handoff.id,'revise'),denied('23514'));
});
test('Flow Map: Handoff検索とIssue/Wiki/ProjectへのID線、Issueからの逆引き',async()=>{
 const batch=await flow(4,'search',{kind:'handoff',q:'引き継ぎ'});assert.ok(batch.result_ids.includes(handoff.id));assert.ok(batch.nodes.some(n=>n.id===wiki.id));assert.ok(batch.edges.some(e=>e.source_id===handoff.id&&e.target_id===issue.id&&e.relation_type==='hands_over'));
 assert.ok((await flow(4,'neighbors',{id:issue.id})).nodes.some(n=>n.id===handoff.id));assert.equal((await query(4,'backlinks',{id:issue.id})).items[0].id,handoff.id);
 const unread=await query(3);const draftIds=unread.items.filter(h=>h.status==='draft').map(h=>h.id);assert.ok((await flow(4,'search',{kind:'handoff'})).nodes.every(n=>!draftIds.includes(n.id)));
});
test('履歴検索・自分宛て: 状態/送信者/受取人/本文とページングを実データで検索',async()=>{
 assert.equal((await query(4,'list',{mine:true,status:'completed',sender:uid(3),recipient:uid(4),q:'入口変更'})).items[0].id,handoff.id);
 assert.equal((await query(4,'list',{q:'受付の混雑'})).items[0].id,handoff.id);
 assert.equal((await query(1,'list',{mine:true})).items.length,0);
 for(let n=0;n<21;n++)await command(3,'create',body({title:`一覧ページ${n}`}));const first=await query(3,'list',{q:'一覧ページ'});const next=await query(3,'list',{q:'一覧ページ',offset:20});assert.equal(first.items.length,20);assert.equal(first.has_more,true);assert.equal(next.items.length,1);assert.ok(!first.items.some(h=>h.id===next.items[0].id));
});
test('改訂の原子性: 非公開資料を含む改訂は失敗し、本文・版・関連と受領記録が変わらない',async()=>{
 const h=await command(3,'create',body());await operate(3,'send',{},h.id);const prior=await detail(3,h.id);
 await assert.rejects(edit(3,{summary:'保存されてはいけない',related_ids:[privateWiki.id],change_reason:'失敗する改訂'},h.id,'revise'),denied('42501'));
 const after=await detail(3,h.id);assert.deepEqual(after,prior);
 await assert.rejects(command(4,'accept',{id:h.id,expected_version:prior.item.version-1,content_version:1}),denied('40001'));
});
test('権限とRLS: 越境・未認証・匿名・特権JWT・直接更新・履歴改ざんを拒否',async()=>{
 await assert.rejects(query(2),denied('42501'));await assert.rejects(command(2,'accept',{id:handoff.id,expected_version:1,content_version:1}),denied('42501'));
 for(const [n,role,claims]of [[null,'anon',{}],[null,'authenticated',{}],[3,'authenticated',{is_anonymous:true}],[3,'authenticated',{role:'service_role'}],[3,'service_role',{}]])await assert.rejects(user(n,'select public.handoff_command($1,$2,$3::jsonb)',[ws,'create',JSON.stringify(body())],role,claims),denied('42501'));
 for(const table of ['handoffs','handoff_items','handoff_versions','handoff_receipts'])await assert.rejects(user(4,`delete from public.${table} where workspace_id=$1`,[ws]),denied('42501'));
 assert.equal((await user(2,'select * from public.handoff_receipts where workspace_id=$1',[ws])).rows.length,0);
 await assert.rejects(user(3,'select intelliflow_private.handoff_snapshot($1,$2)',[ws,handoff.id]),denied('42501'));
});
test('受取人の脱退: 受領不可、送信者が新しい相手へ改訂して再確認、古い相手はアクセス失効',async()=>{
 const h=await command(3,'create',body({recipient_id:uid(1)}));await operate(3,'send',{},h.id);
 await rpc(1,'workspace_command',['set_role',JSON.stringify({workspace_id:ws,user_id:uid(5),role:'owner'})]);
 await rpc(5,'workspace_command',['remove',JSON.stringify({workspace_id:ws,user_id:uid(1)})]);
 await assert.rejects(operate(1,'accept',{},h.id),denied('42501'));
 await edit(3,{recipient_id:uid(4),change_reason:'担当者が脱退したため交代'},h.id,'revise');await operate(4,'accept',{},h.id);assert.equal((await detail(4,h.id)).receipts[0].version,2);
});
