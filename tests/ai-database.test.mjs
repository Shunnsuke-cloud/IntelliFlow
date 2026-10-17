import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {installStorageSchema} from './helpers/storage.mjs';
const db=new PGlite({extensions:{pg_trgm}});
const uid=n=>`70000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const denied=code=>e=>e.code===code;
let ws,other,issue,wiki,secret,project,foreign;
async function asUser(n,sql,values=[],role='authenticated',extra={}){
 await db.exec(`set role ${role}`);
 try{await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:n?uid(n):null,role,...extra})]);return await db.query(sql,values);}finally{await db.exec('reset role');}
}
const rpc=async(n,name,args,role='authenticated',extra={})=>(await asUser(n,`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as value`,args,role,extra)).rows[0].value;
const runs=new Map();
const command=(n,op,p,w=ws)=>rpc(n,'ai_command',[w,op,JSON.stringify(op==='finish'?{...p,run_id:runs.get(p.request_id)??p.request_id}:p)]);
const status=(n,w=ws)=>rpc(n,'ai_status',[w]);
const context=(n,ids=[],intent='ids',w=ws,filters={})=>rpc(n,'ai_context',[w,ids,intent,JSON.stringify(filters)]);
const work=(n,op,p,w=ws)=>rpc(n,'work_item_command',[w,op,JSON.stringify(p)]);
const reserve=(n,extra={},w=ws)=>{const request_id=extra.request_id??randomUUID(),run_id=randomUUID();if(!runs.has(request_id))runs.set(request_id,run_id);return command(n,'reserve',{request_id,run_id,feature:'chat',model:'fixture-model',consent:true,...extra},w);};
const settings=(n,p={},w=ws)=>command(n,'settings',{enabled:true,user_limit:10,workspace_limit:50,consent:true,...p},w);
const doc=text=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to authenticated,anon,service_role;grant execute on all functions in schema auth to authenticated,anon,service_role;`);
 await installStorageSchema(db);
 for(let n=1;n<=6;n++)await db.query('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())',[uid(n),`ai${n}@test.invalid`]);
 const folder=new URL('../supabase/migrations/',import.meta.url);for(const f of(await readdir(folder)).filter(f=>f.endsWith('.sql')).sort()){
  const sql=await readFile(new URL(f,folder),'utf8');
  if(f.includes('phase7')){
   await db.exec('begin');await db.exec(sql.replace(/^begin;$/m,'').replace(/^commit;$/m,''));await db.exec('rollback');
   assert.equal((await db.query("select to_regclass('public.ai_runs') as t")).rows[0].t,null);
   assert.ok((await db.query("select to_regclass('public.issues') as t")).rows[0].t);
  }
  await db.exec(sql);
 }
 ws=(await rpc(1,'workspace_command',['create',JSON.stringify({name:'AIチーム'})])).workspace_id;
 other=(await rpc(2,'workspace_command',['create',JSON.stringify({name:'別WS'})])).workspace_id;
 for(const w of [ws,other])for(const[n,role]of(w===ws?[[3,'member'],[4,'viewer'],[5,'admin'],[6,'member']]:[[6,'member']])){
  const owner=w===ws?1:2,token=randomUUID().replaceAll('-','').repeat(2);await rpc(owner,'workspace_command',['invite',JSON.stringify({workspace_id:w,email:`ai${n}@test.invalid`,role,token})]);await rpc(n,'workspace_command',['accept',JSON.stringify({token})]);
 }
 project=await work(1,'project_create',{title:'昨年イベント',description:'報告',status:'completed',member_ids:[]});
 issue=await work(1,'issue_create',{title:'受付の問題',description:'受付で混雑した',assignee_id:uid(3),status:'open',priority:'high',project_id:project.id});
 const wikiBody={title:'受付マニュアル',body_doc:doc('受付を分散する'),category:'手順',status:'published',related_ids:[issue.id,project.id]};
 wiki=await rpc(1,'wiki_command',[ws,'create',JSON.stringify(wikiBody)]);
 secret=await rpc(1,'wiki_command',[ws,'create',JSON.stringify({...wikiBody,title:'秘密の下書き',status:'draft',body_doc:doc('非公開メモ')})]);
 foreign=await work(2,'issue_create',{title:'別の課題',status:'open',priority:'normal'},other);
});
after(()=>db.close());
test('AI設定: 初期無効、明示同意、Owner/AdminだけがWS設定を変更、ユーザーの無効化',async()=>{
 assert.equal((await status(3)).enabled,false);assert.equal((await status(3)).personal_enabled,false);
 await assert.rejects(reserve(3),denied('42501'));
 await assert.rejects(settings(3),denied('42501'));await assert.rejects(settings(4),denied('42501'));await assert.rejects(settings(1,{consent:false}),denied('22023'));
 await settings(5);await command(3,'preference',{enabled:true,consent:true});assert.equal((await status(3)).personal_enabled,true);
 await command(3,'preference',{enabled:false});assert.equal((await status(3)).personal_enabled,false);await assert.rejects(reserve(3),denied('42501'));await command(3,'preference',{enabled:true,consent:true});
 await assert.rejects(settings(1,{workspace_limit:501}),denied('23514'));
});
test('認証/RLS: 別WS、未認証・匿名・Service Roleを拒否、全AI表の直接書込みを拒否',async()=>{
 await assert.rejects(status(2),denied('42501'));await assert.rejects(context(2,[issue.id]),denied('42501'));
 for(const[n,role,extra]of [[null,'anon',{}],[null,'authenticated',{}],[3,'authenticated',{is_anonymous:true}],[3,'service_role',{}]])await assert.rejects(rpc(n,'ai_status',[ws],role,extra),denied('42501'));
 await assert.rejects(asUser(3,'update public.workspace_ai_settings set enabled=false where workspace_id=$1',[ws]),denied('42501'));
 const tables=['workspace_ai_settings','ai_user_preferences','ai_user_daily_usage','ai_workspace_daily_usage','ai_runs'];
 for(const t of tables){assert.equal((await db.query('select relrowsecurity from pg_class where relname=$1',[t])).rows[0].relrowsecurity,true);await assert.rejects(asUser(3,`delete from public.${t}`),denied('42501'));}
});
test('RAG: 本文1200文字・関連ID参照・公開/非公開・Project進捗をRLS下で取得',async()=>{
 const found=await context(4,[issue.id,wiki.id,project.id]);assert.equal(found.length,3);assert.match(found[0].excerpt,/混雑/);assert.ok(found.every(n=>n.excerpt.length<=1200&&!('body'in n)&&!('snapshot'in n)));
 assert.equal(found[2].details.visible_issue_count,1);assert.equal(found[2].details.visible_completed_count,0);
 assert.ok(found[0].details.relations.some(e=>e.source_id===wiki.id&&e.target_id===issue.id));
 await assert.rejects(context(3,[secret.id]),denied('P0002'));await assert.rejects(context(4,[foreign.id]),denied('P0002'));assert.equal((await context(1,[secret.id])).length,1);
 await assert.rejects(context(1,Array(9).fill(issue.id)),denied('22023'));
 const graph=await rpc(4,'flow_query',[ws,'search',JSON.stringify({q:'混雑'})]);assert.ok(graph.nodes.some(n=>n.id===wiki.id));assert.ok(graph.edges.some(e=>e.source_id===wiki.id&&e.target_id===issue.id));
});
test('RAG: 自分の未完了課題・担当者変更の履歴を検索し、監査JSONの本文を送らない',async()=>{
 assert.equal((await context(3,[],'mine'))[0].id,issue.id);assert.equal((await context(4,[],'mine')).length,0);
 assert.equal((await context(3,[],'mine',ws,{project:project.id}))[0].id,issue.id);
 assert.equal((await context(3,[],'mine',ws,{kind:'wiki'})).length,0);assert.equal((await context(3,[],'mine',ws,{from:'2099-01-01'})).length,0);
 await assert.rejects(context(3,[],'mine',ws,{project:foreign.id}),denied('P0002'));
 let detail=(await rpc(1,'work_items_query',[ws,'detail',JSON.stringify({kind:'issue',id:issue.id})])).item;
 await work(1,'issue_update',{...detail,expected_version:detail.version,assignee_id:uid(4)});
 const changed=await context(3,[],'assignments');assert.equal(changed[0].id,issue.id);assert.equal(changed[0].details.assignment_changes.length,1);assert.ok(!JSON.stringify(changed).includes('before_data'));assert.ok(!JSON.stringify(changed).includes(uid(4)));
});
test('Handoff: ViewerのAI下書き生成を拒否、自分宛てと未送信下書きの可視性を守る',async()=>{
 await command(4,'preference',{enabled:true,consent:true});await assert.rejects(reserve(4,{feature:'handoff'}),denied('42501'));
 const h=await rpc(1,'handoff_command',[ws,'create',JSON.stringify({title:'イベントの引き継ぎ',summary:'受付の改善',current_state:'進行中',completed_work:'調査',pending_work:'確認',risks:'未確認',next_actions:'確認',recipient_id:uid(3),related_ids:[issue.id,wiki.id]})]);
 await assert.rejects(context(3,[h.id]),denied('P0002'));assert.equal((await context(3,[],'handoffs_mine')).length,0);
 const detail=await rpc(1,'handoff_query',[ws,'detail',JSON.stringify({id:h.id})]);await rpc(1,'handoff_command',[ws,'send',JSON.stringify({id:h.id,expected_version:detail.item.version})]);
 assert.equal((await context(3,[],'handoffs_mine'))[0].id,h.id);
});
test('回数: 原子的予約・二重送信拒否・処理中拒否・失敗も消費・metadataのみ保存',async()=>{
 await settings(1,{user_limit:2,workspace_limit:50});const id=randomUUID();const first=await reserve(3,{request_id:id});assert.equal(first.allowed,true);
 // Knowing the browser's idempotency key cannot finish the server's opaque live run.
 await assert.rejects(rpc(3,'ai_command',[ws,'finish',JSON.stringify({run_id:id,status:'succeeded'})]),denied('P0002'));
 assert.equal((await reserve(3,{request_id:id})).reason,'duplicate');assert.equal((await reserve(3)).reason,'busy');
 await command(3,'finish',{request_id:id,status:'failed',error_code:'timeout',input_tokens:120,output_tokens:0});
 const second=randomUUID();assert.equal((await reserve(3,{request_id:second})).allowed,true);await command(3,'finish',{request_id:second,status:'succeeded',input_tokens:100,output_tokens:40,thinking_tokens:20});
 assert.equal((await reserve(3)).reason,'limit');assert.equal((await status(3)).user_remaining,0);
 const logs=(await db.query('select * from public.ai_runs where user_id=$1 order by created_at',[uid(3)])).rows;assert.equal(logs.length,2);assert.ok(logs.every(l=>!('prompt'in l)&&!('response'in l)&&!('api_key'in l)));assert.equal(logs[1].output_tokens,40);
 await assert.rejects(asUser(3,'select * from public.ai_runs'),denied('42501'));await assert.rejects(asUser(4,'select * from public.ai_runs'),denied('42501'));await assert.rejects(command(4,'finish',{request_id:id,status:'succeeded'}),denied('P0002'));
});
test('回数: 全WSをまたぐユーザー合算・WS合算・429後cooldown・UTCリセット境界',async()=>{
 await settings(2,{user_limit:2,workspace_limit:2},other);await command(6,'preference',{enabled:true,consent:true});await settings(1,{user_limit:2,workspace_limit:50});
 let id=randomUUID();await reserve(6,{request_id:id});await command(6,'finish',{request_id:id,status:'succeeded'});
 id=randomUUID();await reserve(6,{request_id:id},other);await command(6,'finish',{request_id:id,status:'succeeded'},other);
 assert.equal((await reserve(6)).reason,'limit');assert.equal((await reserve(6,{},other)).reason,'limit');
 await command(2,'preference',{enabled:true,consent:true},other);id=randomUUID();await reserve(2,{request_id:id},other);await command(2,'finish',{request_id:id,status:'failed',error_code:'rate_limit'},other);
 assert.equal((await reserve(2,{},other)).reason,'busy');assert.equal((await status(2,other)).workspace_remaining,0);
 const s=await status(6);assert.equal(new Date(s.resets_at).getUTCHours(),0);assert.equal(new Date(s.resets_at).getUTCMinutes(),0);
});
test('同時要求: 上限1を複数の要求が同時に確保しようとしても1件だけ予約される（隔離DB）',async()=>{
 await settings(1,{user_limit:1,workspace_limit:50});await command(5,'preference',{enabled:true,consent:true});
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid(5),role:'authenticated'})]);
 let responses;
 try{responses=await Promise.all(Array.from({length:12},()=>db.query('select public.ai_command($1,$2,$3::jsonb) as value',[ws,'reserve',JSON.stringify({request_id:randomUUID(),run_id:randomUUID(),feature:'chat',model:'fixture',consent:true})])));}finally{await db.exec('reset role');}
 assert.equal(responses.filter(r=>r.rows[0].value.allowed).length,1);
});
test('失効: 処理後の再検証で資料の非公開化・脱退を検出、メタデータだけは失敗記録可能',async()=>{
 assert.equal((await context(4,[issue.id])).length,1);
 await db.query("update public.resources set visibility='private' where id=$1",[issue.id]);
 await assert.rejects(context(4,[issue.id]),denied('P0002'));assert.equal((await context(1,[issue.id])).length,1);
 await settings(1);const id=randomUUID();await reserve(4,{request_id:id});
 await rpc(1,'workspace_command',['remove',JSON.stringify({workspace_id:ws,user_id:uid(4)})]);
 await assert.rejects(status(4),denied('42501'));await assert.rejects(context(4,[issue.id]),denied('42501'));
 await assert.rejects(command(4,'finish',{request_id:id,status:'succeeded'}),denied('42501'));
 await command(4,'finish',{request_id:id,status:'failed',error_code:'access_changed'});assert.equal((await db.query('select status from public.ai_runs where client_request_id=$1',[id])).rows[0].status,'failed');
});
