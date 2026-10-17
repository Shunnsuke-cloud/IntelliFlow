import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const uid = n => `20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const denies = code => error => error.code === code;
let ws, otherWS, project, issue, second;
async function user(n, query, params = [], role = 'authenticated', extra = {}) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:n?uid(n):null,role,...extra})]);
  try {return await db.query(query,params);}finally{await db.exec('reset role');}
}
async function workspace(n,operation,payload) { return (await user(n,'select public.workspace_command($1,$2::jsonb) as value',[operation,JSON.stringify(payload)])).rows[0].value; }
async function cmd(n,operation,payload,w=ws,role='authenticated',extra={}) { return (await user(n,'select public.work_item_command($1,$2,$3::jsonb) as value',[w,operation,JSON.stringify(payload)],role,extra)).rows[0].value; }
async function query(n,collection,filters={},w=ws) { return (await user(n,'select public.work_items_query($1,$2,$3::jsonb) as value',[w,collection,JSON.stringify(filters)])).rows[0].value; }
const issueBody=(extra={})=>({title:'会議の資料を準備',description:'次の担当者への説明',status:'open',priority:'normal',labels:[],...extra});
const projectBody=(extra={})=>({title:'学園祭の準備',description:'チームで活動',status:'active',member_ids:[],start_on:'2026-10-01',due_on:'2026-10-31',...extra});
async function update(n,item,extra={},kind='issue') { return cmd(n,`${kind}_update`,{...item,...extra,id:item.id,expected_version:item.version}); }
async function detail(id,kind='issue',n=1) { return query(n,'detail',{id,kind}); }
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
 grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
 for(let n=1;n<=6;n++)await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid(n),`member${n}@test.invalid`]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261017072651_phase2_workspaces.sql',import.meta.url),'utf8'));
 ws=(await workspace(1,'create',{name:'チームA'})).workspace_id;
 otherWS=(await workspace(2,'create',{name:'チームB'})).workspace_id;
 for(const [n,role]of [[3,'member'],[4,'viewer'],[5,'admin']]){
   const token=n.toString(16).padStart(64,'0');
   await workspace(1,'invite',{workspace_id:ws,email:`member${n}@test.invalid`,role,token});await workspace(n,'accept',{token});
 }
 // Existing Phase 2 preparatory records must survive the migration unchanged.
 await db.exec(`begin;insert into public.resources(id,workspace_id,kind,title,visibility,created_by,updated_by) values('${uid(90)}','${ws}','issue','既存の保留課題','workspace','${uid(1)}','${uid(1)}');insert into public.issues(resource_id,workspace_id,status)values('${uid(90)}','${ws}','blocked');commit;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261017080005_phase3_issues_projects.sql',import.meta.url),'utf8'));
});
after(async()=>{await db.close();});
test('Phase3移行: 旧課題・ステータスを保持し、番号を追加',async()=>{
 const old=(await detail(uid(90))).item;assert.equal(old.title,'既存の保留課題');assert.equal(old.status,'blocked');assert.equal(old.code,'ISSUE-001');
});
test('CRUD: Project作成・メンバー・日程、Issue採番と関連付け',async()=>{
 project=await cmd(1,'project_create',projectBody({member_ids:[uid(1),uid(3)]}));
 issue=await cmd(3,'issue_create',issueBody({project_id:project.id,assignee_id:uid(3),labels:['広報','会議'],due_on:'2026-10-20'}));
 const p=(await detail(project.id,'project')).item;const i=(await detail(issue.id)).item;
 assert.equal(p.member_ids.length,2);assert.equal(p.issue_count,1);assert.equal(p.completed_count,0);assert.equal(i.code,'ISSUE-002');assert.equal(i.project_id,p.id);assert.deepEqual(i.labels,['会議','広報']);
 second=await cmd(1,'issue_create',issueBody({title:'会場の予約',priority:'high',project_id:project.id,status:'done',labels:['会議'],due_on:'2026-10-18'}));
 assert.equal((await detail(second.id)).item.code,'ISSUE-003');
 const isolated=await cmd(2,'issue_create',issueBody(),otherWS);assert.equal((await query(2,'detail',{id:isolated.id,kind:'issue'},otherWS)).item.code,'ISSUE-001');
});
test('CRUD: 編集の保存、4ステータス、実課題から進捗計算',async()=>{
 let i=(await detail(issue.id)).item;
 for(const status of ['in_progress','review','done','open']){await update(3,i,{title:'共有用の資料',status,priority:'low'});i=(await detail(issue.id)).item;assert.equal(i.status,status);}
 const p=(await detail(project.id,'project')).item;assert.equal(p.issue_count,2);assert.equal(p.completed_count,1);assert.equal(Math.round(p.completed_count/p.issue_count*100),50);
 await update(1,p,{title:'文化祭',status:'completed',member_ids:[uid(3)]},'project');
 const updated=(await detail(project.id,'project')).item;assert.equal(updated.title,'文化祭');assert.equal(updated.status,'completed');assert.equal(updated.completed_count,1); // Project status never fabricates issue progress.
});
test('検索・複合フィルター・ソート・ページングはDBで実行',async()=>{
 const all=await query(4,'issues',{project:project.id,sort:'priority'});assert.equal(all.total,2);assert.equal(all.items[0].id,second.id);
 const filtered=await query(4,'issues',{q:'共有用',status:'open',assignee:uid(3),project:project.id,label:'広報',priority:'low',due_before:'2026-10-20'});assert.equal(filtered.total,1);assert.equal(filtered.items[0].id,issue.id);
 assert.equal((await query(4,'issues',{assignee:'none',status:'done'})).items[0].id,second.id);
 const due=await query(4,'issues',{project:project.id,sort:'due',limit:1});assert.equal(due.items[0].id,second.id);assert.equal(due.total,2);
 const page=await query(4,'issues',{project:project.id,sort:'due',limit:1,offset:1});assert.equal(page.items[0].id,issue.id);
 assert.equal((await query(4,'issues',{q:'ISSUE-002'})).total,1);
 assert.equal((await query(4,'projects',{q:'文化祭',member:uid(3),status:'completed'})).total,1);
 assert.equal((await query(4,'issues',{q:"%' OR true --"})).total,0);
});
test('権限: Viewer/別WS/未認証/匿名/特権トークンで更新不可',async()=>{
 await assert.rejects(cmd(4,'issue_create',issueBody()),denies('42501'));
 await assert.rejects(cmd(2,'issue_create',issueBody()),denies('42501'));
 await assert.rejects(query(2,'issues'),denies('42501'));
 assert.equal((await user(2,'select * from public.issue_records where workspace_id=$1',[ws])).rows.length,0);
 await assert.rejects(cmd(null,'issue_create',issueBody(),ws,'anon'),denies('42501'));
 await assert.rejects(cmd(1,'issue_create',issueBody(),ws,'authenticated',{is_anonymous:true}),denies('42501'));
 await db.exec('grant execute on function public.work_item_command(uuid,text,jsonb) to service_role;grant usage on schema intelliflow_private to service_role;grant execute on function intelliflow_private.work_item_command(uuid,text,jsonb) to service_role');
 await assert.rejects(cmd(1,'issue_create',issueBody(),ws,'service_role'),denies('42501'));
 await assert.rejects(user(3,"update public.issues set status='done' where resource_id=$1",[issue.id]),denies('42501'));
});
test('整合性: 担当・Project・メンバーの越境、日付逆転、不正状態を拒否し採番をrollback',async()=>{
 const foreign=await cmd(2,'project_create',projectBody(),otherWS);
 const before=(await db.query('select last_number from public.issue_counters where workspace_id=$1',[ws])).rows[0].last_number;
 await assert.rejects(cmd(3,'issue_create',issueBody({assignee_id:uid(2)})),denies('42501'));
 await assert.rejects(cmd(3,'issue_create',issueBody({project_id:foreign.id})),denies('42501'));
 await assert.rejects(cmd(3,'project_create',projectBody({member_ids:[uid(2)]})),denies('42501'));
 await assert.rejects(cmd(3,'project_create',projectBody({start_on:'2026-11-01',due_on:'2026-10-01'})),denies('23514'));
 await assert.rejects(cmd(3,'issue_create',issueBody({status:'made_up'})),denies('22023'));
 const after=(await db.query('select last_number from public.issue_counters where workspace_id=$1',[ws])).rows[0].last_number;assert.equal(after,before);
});
test('競合: 古い版の編集・削除を拒否、履歴と本文を保持',async()=>{
 const old=(await detail(issue.id)).item;await update(3,old,{description:'更新後の説明'});
 await assert.rejects(update(3,old,{description:'古い版の上書き'}),denies('40001'));
 await assert.rejects(cmd(3,'archive',{id:issue.id,expected_version:old.version}),denies('40001'));
 const d=await detail(issue.id);assert.equal(d.item.description,'更新後の説明');assert.ok(d.events.some(e=>e.action==='issue_update'&&e.after_data.description==='更新後の説明'));
});
test('コメントCRUD: 本人編集、他人編集拒否、管理者削除、履歴追記',async()=>{
 let d=await detail(issue.id);const saved=await cmd(3,'comment_create',{id:issue.id,expected_version:d.item.version,body:'確認をお願いします'});
 d=await detail(issue.id);let c=d.comments[0];assert.equal(c.author_id,uid(3));assert.equal(c.id,saved.comment_id);
 await assert.rejects(cmd(1,'comment_update',{id:issue.id,expected_version:d.item.version,comment_id:c.id,comment_version:c.version,body:'他人編集'}),denies('42501'));
 await cmd(3,'comment_update',{id:issue.id,expected_version:d.item.version,comment_id:c.id,comment_version:c.version,body:'確認しました'});
 d=await detail(issue.id);c=d.comments[0];assert.equal(c.body,'確認しました');
 await cmd(5,'comment_archive',{id:issue.id,expected_version:d.item.version,comment_id:c.id,comment_version:c.version});
 d=await detail(issue.id);assert.equal(d.comments.length,0);assert.ok(d.events.some(e=>e.action==='comment_archive'&&e.before_data.comment.body==='確認しました'));
 await assert.rejects(user(3,'delete from public.resource_events where resource_id=$1',[issue.id]),denies('42501'));
});
test('関連付け: 双方向表示・重複防止・解除・自己参照/越境拒否',async()=>{
 let a=(await detail(issue.id)).item;await cmd(3,'link',{id:a.id,expected_version:a.version,other_id:second.id});
 let d=await detail(a.id);assert.equal(d.relations.length,1);assert.equal(d.relations[0].id,second.id);assert.equal((await detail(second.id)).relations[0].id,a.id);
 await cmd(3,'link',{id:a.id,expected_version:d.item.version,other_id:second.id});d=await detail(a.id);assert.equal(d.relations.length,1);
 await assert.rejects(cmd(3,'link',{id:a.id,expected_version:d.item.version,other_id:a.id}),denies('42501'));
 const foreign=(await query(2,'issues',{},otherWS)).items[0];await assert.rejects(cmd(3,'link',{id:a.id,expected_version:d.item.version,other_id:foreign.id}),denies('42501'));
 await cmd(3,'unlink',{id:a.id,expected_version:d.item.version,other_id:second.id});assert.equal((await detail(a.id)).relations.length,0);assert.ok((await detail(second.id)).events.some(e=>e.action==='unlink'));
});
test('削除/復元: Memberは他人を削除不可、進捗再計算、番号再利用なし',async()=>{
 let item=(await detail(second.id)).item;
 await assert.rejects(cmd(3,'archive',{id:item.id,expected_version:item.version}),denies('42501'));
 await cmd(5,'archive',{id:item.id,expected_version:item.version});
 assert.equal((await query(1,'issues',{project:project.id})).total,1);
 assert.equal((await detail(project.id,'project')).item.completed_count,0);
 assert.equal((await query(1,'issues',{archived:true})).items[0].id,item.id);
 const archived=(await detail(item.id)).item;await assert.rejects(update(1,archived),denies('23514'));
 await cmd(1,'restore',{id:item.id,expected_version:archived.version});assert.equal((await detail(project.id,'project')).item.completed_count,1);
 const created=await cmd(3,'issue_create',issueBody({title:'削除後の新規課題'}));assert.equal((await detail(created.id)).item.code,'ISSUE-004');
});
test('Project削除/復元: 関連Issueを保持し、新しい関連付けを拒否',async()=>{
 let p=(await detail(project.id,'project')).item;await cmd(1,'archive',{id:p.id,expected_version:p.version});
 assert.equal((await query(1,'projects')).total,0);assert.equal((await detail(issue.id)).item.project_id,p.id);
 const existing=(await detail(issue.id)).item;await update(3,existing,{title:'所属を保った編集'});
 await assert.rejects(cmd(3,'issue_create',issueBody({project_id:p.id})),denies('42501'));
 p=(await detail(p.id,'project')).item;await cmd(1,'restore',{id:p.id,expected_version:p.version});assert.equal((await query(1,'projects')).total,1);
});
test('脱退: 即時認可失効、担当に再指定できない、履歴は残る',async()=>{
 await workspace(1,'remove',{workspace_id:ws,user_id:uid(3)});
 await assert.rejects(query(3,'issues'),denies('42501'));
 await assert.rejects(cmd(1,'issue_create',issueBody({assignee_id:uid(3)})),denies('42501'));
 assert.ok((await detail(issue.id)).events.some(e=>e.actor_id===uid(3)));
});
test('採番: 999を超えても番号を切り詰めない',async()=>{
 await db.query('update public.issue_counters set last_number=999 where workspace_id=$1',[ws]);
 const result=await cmd(1,'issue_create',issueBody());assert.equal((await detail(result.id)).item.code,'ISSUE-1000');
});
test('新規表・view: RLS有効、直接書込み拒否、security_invokerを維持',async()=>{
 for(const table of ['issue_counters','workspace_labels','issue_labels','project_members','issue_comments','resource_events']){
  const row=(await db.query("select relrowsecurity from pg_class where oid=$1::regclass",[`public.${table}`])).rows[0];assert.equal(row.relrowsecurity,true,table);
  assert.equal((await db.query("select has_table_privilege('authenticated',$1,'INSERT') as allowed",[`public.${table}`])).rows[0].allowed,false,table);
 }
 for(const view of ['issue_records','project_records'])assert.ok((await db.query('select reloptions from pg_class where oid=$1::regclass',[`public.${view}`])).rows[0].reloptions.includes('security_invoker=true'));
});
test('集計: 非公開の旧課題をViewerの進捗・Memberの更新履歴に漏らさない',async()=>{
 const hidden=uid(120);
 await db.exec(`begin;insert into public.resources(id,workspace_id,kind,title,visibility,created_by,updated_by) values('${hidden}','${ws}','issue','非公開の旧課題','private','${uid(1)}','${uid(1)}');insert into public.issues(resource_id,workspace_id,issue_number,project_id,status) values('${hidden}','${ws}',2000,'${project.id}','done');commit;`);
 const privateIssue=(await detail(hidden)).item;await update(1,privateIssue,{labels:['非公開専用ラベル']});
 assert.equal((await query(4,'options')).labels.includes('非公開専用ラベル'),false);
 assert.equal((await query(1,'options')).labels.includes('非公開専用ラベル'),true);
 const viewer=await detail(project.id,'project',4);assert.equal(viewer.item.issue_count,2);assert.equal(viewer.item.completed_count,1);
 const owner=await detail(project.id,'project',1);assert.equal(owner.item.issue_count,3);
 // Rejoin member3 with a new invitation, then edit the shared project.
 const token='e'.repeat(64);await workspace(1,'invite',{workspace_id:ws,email:'member3@test.invalid',role:'member',token});await workspace(3,'accept',{token});
 const p=(await detail(project.id,'project',3)).item;await update(3,p,{description:'共有範囲の集計'},'project');
 const events=(await detail(project.id,'project',4)).events;
 const latest=events.find(e=>e.action==='project_update'&&e.after_data.description==='共有範囲の集計');assert.equal('issue_count' in latest.after_data,false);assert.equal('completed_count' in latest.after_data,false);
 const ownerProject=(await detail(project.id,'project',1)).item;await update(1,ownerProject,{description:'管理者が変更'},'project');
 const ownerEvent=(await detail(project.id,'project',4)).events.find(e=>e.after_data?.description==='管理者が変更');assert.equal('issue_count' in ownerEvent.after_data,false);
});
