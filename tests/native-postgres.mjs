// Disposable native PostgreSQL. Default: synthetic data. Explicit flag: private offline backup restore.
import assert from 'node:assert/strict';
import {spawnSync,spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {installStorageSchema} from './helpers/storage.mjs';
const restoreProduction=process.argv.includes('--restore-production-backup');
const bin='C:/Program Files/PostgreSQL/18/bin',port=restoreProduction?16439:16438;
const root=resolve(restoreProduction?'.release-private':'.release-local'),dir=join(root,'run-'+randomUUID()),data=join(dir,'data');
assert.ok(dir.startsWith(root+'\\'));assert.ok(!existsSync(data));mkdirSync(dir,{recursive:true});
const password=randomBytes(32).toString('hex'),pw=join(dir,'init-password');writeFileSync(pw,password,{flag:'wx'});
const inherited=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/^PG/i.test(name)));
const env={...inherited,PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:'intelliflow_release_test',PGPASSWORD:password,PGDATABASE:'postgres',PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8'};
function command(name,args,input){const r=spawnSync(join(bin,name+'.exe'),args,{env,input,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4e6});if(r.status!==0)throw new Error(`${name} failed (${r.status}); details withheld`);return r.stdout;}
function sql(query,database='postgres'){const r=spawnSync(join(bin,'psql.exe'),['-X','-qAt','-v','ON_ERROR_STOP=1','-d',database],{env,input:'\\set VERBOSITY sqlstate\n'+query,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4e6});if(r.status!==0){const e=new Error('isolated SQL rejected');e.code=r.stderr.match(/ERROR:\s+([0-9A-Z]{5})/)?.[1];throw e;}return r.stdout.trim();}
const literal=v=>v===null?'null':typeof v==='object'?`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`:`'${String(v).replaceAll("'","''")}'`;
const uid=n=>`91000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const as=(n,query,role='authenticated')=>`set role ${role};set "request.jwt.claims"=${literal(JSON.stringify({sub:n?uid(n):null,role}))};${query}`;
const rpc=(n,name,args,role='authenticated')=>JSON.parse(sql(as(n,`select public.${name}(${args.map(literal).join(',')});`,role)));
const deny=fn=>assert.throws(fn,e=>e.code==='42501');
let started=false;
try{
 command('initdb',['-D',data,'--username=intelliflow_release_test','--auth=scram-sha-256','--pwfile='+pw,'--encoding=UTF8','--no-locale','--no-sync']);rmSync(pw);
 command('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -c log_min_error_statement=panic`,'-w','start']);started=true;
 console.log(JSON.stringify({check:'native_postgres',version:command('postgres',['--version']).trim(),host:'127.0.0.1',port,production:false}));
 if(restoreProduction){
  const manifests=readdirSync(root).filter(f=>f.endsWith('.dump.manifest.json')).sort();assert.ok(manifests.length);
  const manifestPath=join(root,manifests.at(-1)),manifest=JSON.parse(readFileSync(manifestPath,'utf8'));assert.equal(manifest.ref,'pocjzzekfupjqcwdfkan');assert.ok(resolve(manifest.file).startsWith(root+'\\'));
  assert.equal(createHash('sha256').update(readFileSync(manifest.file)).digest('hex'),manifest.sha256);
  for(const role of ['anon','authenticated','service_role','supabase_auth_admin','supabase_storage_admin','authenticator','dashboard_user','pgbouncer','supabase_admin','supabase_read_only_user'])sql(`create role ${role};`);
  sql('create schema extensions;create extension pgcrypto with schema extensions;create extension "uuid-ossp" with schema extensions;');
  // Only this freshly initialized local database: remove its empty default schema before restore.
  assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public';"),'0');sql('drop schema public;');
  // Intentionally omit production ownership/ACLs: this validates records/definitions in an isolated cluster.
  // Migration/RLS authorization is separately tested in the synthetic branch below.
  command('pg_restore',['--exit-on-error','--no-owner','--no-privileges','--dbname=postgres',manifest.file]);
  // Recreate the Supabase base Auth grants omitted intentionally by --no-privileges.
  sql('grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt(),auth.role() to anon,authenticated,service_role;');
  const counts=JSON.parse(sql("select json_build_object('notes',(select count(*) from public.notes),'notes_backup',(select count(*) from public.notes_backup),'auth_users',(select count(*) from auth.users),'storage_objects',(select count(*) from storage.objects));"));
  assert.deepEqual(counts,{notes:1,notes_backup:0,auth_users:5,storage_objects:0});
  const unmapped=Number(sql('select count(*) from public.notes n where n.owner is null or not exists(select 1 from auth.users u where u.id::text=n.owner);'));assert.equal(unmapped,0);
  assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;"),'0');
  const fingerprints=JSON.parse(sql("set timezone='UTC';select json_build_object('notes',(select md5(coalesce(string_agg(to_jsonb(n)::text,'' order by id),''))from public.notes n),'notes_backup',(select md5(coalesce(string_agg(to_jsonb(n)::text,'' order by id),''))from public.notes_backup n),'auth_users',(select md5(coalesce(string_agg(to_jsonb(u)::text,'' order by id),''))from auth.users u));"));
  if(manifest.expected_fingerprints)assert.deepEqual(fingerprints,manifest.expected_fingerprints);
  const folder=new URL('../supabase/migrations/',import.meta.url);let applied=0;
  for(const file of readdirSync(folder).filter(f=>f.endsWith('.sql')).sort()){sql(readFileSync(new URL(file,folder),'utf8'));applied++;}
  assert.equal(applied,7);
  const after=JSON.parse(sql("set timezone='UTC';select json_build_object('notes',(select md5(coalesce(string_agg(to_jsonb(n)::text,'' order by id),''))from public.notes n),'notes_backup',(select md5(coalesce(string_agg(to_jsonb(n)::text,'' order by id),''))from public.notes_backup n),'auth_users',(select md5(coalesce(string_agg(to_jsonb(u)::text,'' order by id),''))from auth.users u));"));assert.deepEqual(after,fingerprints);
  assert.equal(sql("do $$begin perform set_config('request.jwt.claims',json_build_object('sub',(select owner from public.notes limit 1),'role','authenticated')::text,false);end$$;set role authenticated;select count(*) from public.notes;"),'1');
  manifest.restored=true;manifest.restore_verified_at=new Date().toISOString();manifest.restore_version=command('postgres',['--version']).trim();manifest.restore_counts=counts;manifest.restore_fingerprints=fingerprints;manifest.fingerprints_match=!!manifest.expected_fingerprints;manifest.migrations_rehearsed=applied;manifest.migrations_preserve_records=true;manifest.restore_scope='Local record/schema restore; ownership/ACL omitted, no live Auth login';writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({check:'production_backup_local_restore',success:true,counts,owners_valid:true,public_rls_enabled:true,production_database_changed:false,ownership_acl_restore_tested:false}));
 }else{
 sql(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
 create table public.notes(id text primary key,input text not null,saved_at timestamptz not null default now(),owner text);
 create table public.notes_backup(id text,input text,saved_at timestamptz);
 alter table public.notes enable row level security;alter table public.notes_backup enable row level security;
 create policy notes_select_owner on public.notes for select using(auth.uid()::text=owner);
 grant all on public.notes,public.notes_backup to anon,authenticated;
 insert into public.notes(id,input,owner)values('legacy','架空の保存対象',${literal(uid(1))}),('unowned','架空の所有者不明',null);`);
 await installStorageSchema({exec:async query=>sql(query)});
 for(let n=1;n<=5;n++)sql(`insert into auth.users(id,email,email_confirmed_at)values(${literal(uid(n))},'native${n}@test.invalid',now());`);
 const before=sql('select jsonb_agg(to_jsonb(n)order by id)from public.notes n;');
 const folder=new URL('../supabase/migrations/',import.meta.url);const migrations=readdirSync(folder).filter(f=>f.endsWith('.sql')).sort();assert.equal(migrations.length,7);
 for(const file of migrations)sql(readFileSync(new URL(file,folder),'utf8'));
 assert.equal(sql('select jsonb_agg(to_jsonb(n)order by id)from public.notes n;'),before);
 console.log('PASS 7 migrations applied; legacy rows/owners preserved');
 const ws=rpc(1,'workspace_command',['create',{name:'Native検証'}]).workspace_id;
 const other=rpc(5,'workspace_command',['create',{name:'別WS'}]).workspace_id;
 for(const [n,role]of [[2,'admin'],[3,'member'],[4,'viewer']]){const token=randomBytes(32).toString('hex');rpc(1,'workspace_command',['invite',{workspace_id:ws,email:`native${n}@test.invalid`,role,token}]);rpc(n,'workspace_command',['accept',{token}]);}
 const work=(n,operation,payload)=>rpc(n,'work_item_command',[ws,operation,payload]);
 const project=work(1,'project_create',{title:'受付Project',description:'架空',status:'active',member_ids:[uid(3)]}).id;
 const issue=work(3,'issue_create',{title:'受付Issue',description:'受付の課題',status:'open',priority:'normal',labels:[],project_id:project}).id;
 const wiki=rpc(3,'wiki_command',[ws,'create',{title:'受付手順',category:'手順',status:'published',body_doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'受付を分ける'}]}]},related_ids:[issue,project]}]).id;
 const found=rpc(4,'flow_query',[ws,'search',{q:'受付'}]);assert.ok(found.nodes.some(n=>n.id===wiki));assert.ok(found.edges.some(e=>e.source_id===wiki&&e.target_id===issue));
 assert.equal(sql(as(5,`select count(*) from public.issues where resource_id=${literal(issue)};`)),'0');
 deny(()=>sql(as(0,'select count(*) from public.workspaces;','anon')));
 deny(()=>work(4,'issue_create',{title:'拒否',status:'open',priority:'normal',labels:[]}));
 deny(()=>rpc(5,'work_items_query',[ws,'detail',{id:issue,kind:'issue'}]));
 deny(()=>rpc(0,'work_items_query',[ws,'issues',{}],'anon'));
 deny(()=>rpc(1,'work_items_query',[ws,'issues',{}],'service_role'));
 assert.equal(sql(as(1,'select count(*) from public.notes;')),'1');
 deny(()=>sql(as(1,'select * from public.notes_backup;')));
 assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;"),'0');
 console.log('PASS invitations, four roles, Issue/Project/Wiki/Flow, RLS, unauthenticated/service-role/cross-workspace denial');
 const h=rpc(1,'handoff_command',[ws,'create',{title:'受付引き継ぎ',recipient_id:uid(4),summary:'受付を引き継ぐ',current_state:'進行中',completed_work:'準備',pending_work:'案内',risks:'未確認',next_actions:'確認する',related_ids:[issue,wiki,project]}]).id;
 let hd=rpc(1,'handoff_query',[ws,'detail',{id:h}]);rpc(1,'handoff_command',[ws,'send',{id:h,expected_version:hd.item.version}]);hd=rpc(4,'handoff_query',[ws,'detail',{id:h}]);
 deny(()=>rpc(3,'handoff_command',[ws,'accept',{id:h,expected_version:hd.item.version,content_version:1}]));
 rpc(4,'handoff_command',[ws,'accept',{id:h,expected_version:hd.item.version,content_version:1}]);assert.equal(rpc(4,'handoff_query',[ws,'detail',{id:h}]).receipts.length,1);
 console.log('PASS designated Viewer receipt; non-recipient denied');
 const ai=(n,op,p)=>rpc(n,'ai_command',[ws,op,p]);
 deny(()=>ai(4,'settings',{enabled:true,user_limit:1,workspace_limit:1,consent:true}));
 ai(2,'settings',{enabled:true,user_limit:1,workspace_limit:1,consent:true});ai(1,'preference',{enabled:true,consent:true});
 const reserve=()=>as(1,`select public.ai_command(${literal(ws)},'reserve',${literal({request_id:randomUUID(),run_id:randomUUID(),feature:'chat',model:'fixture-model',consent:true})});`);
 const results=await Promise.all(Array.from({length:8},()=>new Promise(resolve=>{const child=spawn(join(bin,'psql.exe'),['-X','-qAt','-v','ON_ERROR_STOP=1'],{env,windowsHide:true,stdio:['pipe','pipe','pipe'],timeout:30000});let output='';child.stderr.resume();child.stdout.on('data',d=>output+=d);child.on('close',code=>{if(code!==0)return resolve({error:true});try{resolve(JSON.parse(output.trim()));}catch{resolve({error:true});}});child.stdin.end(reserve());})));
 assert.equal(results.filter(r=>r.allowed===true).length,1);assert.equal(results.filter(r=>r.allowed===false&&['busy','limit'].includes(r.reason)).length,7);assert.equal(sql(`select used from public.ai_workspace_daily_usage where workspace_id=${literal(ws)};`),'1');
 console.log('PASS eight real concurrent PostgreSQL connections reserve at most one AI request');
 const dump=join(dir,'synthetic.dump');command('pg_dump',['-Fc','-f',dump]);sql('create database release_restore;');sql('drop schema public;','release_restore');command('pg_restore',['--exit-on-error','--no-owner','--dbname=release_restore',dump]);
 assert.equal(sql('select count(*) from public.issues;','release_restore'),'1');assert.equal(sql('select count(*) from auth.users;','release_restore'),'5');assert.equal(sql('select jsonb_agg(to_jsonb(n)order by id)from public.notes n;','release_restore'),before);
 assert.equal(sql(as(5,`select count(*) from public.issues where resource_id=${literal(issue)};`),'release_restore'),'0');
 console.log('PASS native dump/restore of synthetic Auth/catalog/application records and restored RLS');
 assert.ok(other);console.log('Native PostgreSQL release verification passed. This does not test Supabase GoTrue/email/OAuth or restore production data.');
 }
}finally{if(existsSync(pw))rmSync(pw);if(started)command('pg_ctl',['-D',data,'-m','fast','-w','stop']);}
