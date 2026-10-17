import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const token = n => n.toString(16).padStart(64,'0');
let first, second;
async function asUser(n, query, params = [], role = 'authenticated', extra = {}) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: n ? uid(n) : null, role, ...extra })]);
  try { return await db.query(query, params); } finally { await db.exec('reset role'); }
}
async function cmd(n, operation, payload, role = 'authenticated', extra = {}) {
  const result = await asUser(n, 'select public.workspace_command($1,$2::jsonb) as result', [operation, JSON.stringify(payload)], role, extra);
  return result.rows[0].result;
}
const rejectCode = code => error => error.code === code;
async function invite(inviter, workspace, recipient, role, number = recipient) {
  await cmd(inviter, 'invite', { workspace_id: workspace, email: `user${recipient}@test.invalid`, role, token: token(number) });
  return token(number);
}
before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
  `);
  for (let n=1;n<=9;n++) await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)', [uid(n), `user${n}@test.invalid`, n === 9 ? null : new Date().toISOString()]);
  await db.exec(await readFile(new URL('../supabase-migrations/001_create_notes_and_policies.sql',import.meta.url),'utf8'));
  await db.query("insert into public.notes(id,input) values('legacy-unowned','preserve me')");
  await db.exec(await readFile(new URL('../supabase/migrations/20261017072651_phase2_workspaces.sql',import.meta.url),'utf8'));
});
after(async () => { await db.close(); });
test('DB: ワークスペース作成とOwner所属が原子的に成立', async () => {
  first = (await cmd(1,'create',{name:'個人の活動',description:'説明'})).workspace_id;
  second = (await cmd(2,'create',{name:'別チーム'})).workspace_id;
  const { rows } = await asUser(1,'select * from public.workspace_members');
  assert.equal(rows.length,1); assert.equal(rows[0].role,'owner');
  await assert.rejects(cmd(1,'create',{name:''}),rejectCode('22023'));
  assert.equal((await db.query('select count(*)::int as count from public.workspaces')).rows[0].count,2);
});
test('DB: 未認証・匿名・サービスロールでの管理呼出しを拒否', async () => {
  await assert.rejects(cmd(null,'create',{name:'invalid'},'anon'),rejectCode('42501'));
  await assert.rejects(cmd(1,'create',{name:'invalid'},'authenticated',{is_anonymous:true}),rejectCode('42501'));
  // Even accidentally granting the RPC to service_role cannot bypass its identity guard.
  await db.exec('grant execute on function public.workspace_command(text,jsonb) to service_role; grant usage on schema intelliflow_private to service_role; grant execute on function intelliflow_private.command(text,jsonb) to service_role');
  await assert.rejects(cmd(1,'create',{name:'invalid'},'service_role'),rejectCode('42501'));
});
test('DB: 別WSの読み取り・編集・招待・メンバー一覧を拒否', async () => {
  assert.equal((await asUser(1,'select * from public.workspaces where id=$1',[second])).rows.length,0);
  assert.equal((await asUser(1,'select * from public.workspace_members where workspace_id=$1',[second])).rows.length,0);
  await assert.rejects(cmd(1,'update',{workspace_id:second,name:'stolen'}),rejectCode('42501'));
  await assert.rejects(invite(1,second,3,'member'),rejectCode('42501'));
  await assert.rejects(asUser(1,'select * from public.workspace_people($1)',[second]),rejectCode('42501'));
});
test('DB: 招待先・確認済みメールを検証、トークンの再使用を拒否', async () => {
  const raw = await invite(1,first,3,'member');
  await assert.rejects(cmd(4,'accept',{token:raw}),rejectCode('42501'));
  await cmd(3,'accept',{token:raw});
  await assert.rejects(cmd(3,'accept',{token:raw}),rejectCode('P0002'));
  const invitation = (await db.query('select token_hash,accepted_at from public.workspace_invitations where email_normalized=$1',['user3@test.invalid'])).rows[0];
  assert.notEqual(invitation.token_hash,raw); assert.ok(invitation.accepted_at);
  const unconfirmed = await invite(1,first,9,'viewer');
  await assert.rejects(cmd(9,'accept',{token:unconfirmed}),rejectCode('42501'));
  await assert.rejects(asUser(3,'select token_hash from public.workspace_invitations'),rejectCode('42501'));
});
test('DB: Admin/Member/Viewerの操作範囲と直接書込み拒否', async () => {
  await cmd(1,'set_role',{workspace_id:first,user_id:uid(3),role:'admin'});
  await cmd(3,'update',{workspace_id:first,name:'共同作業',description:'更新'});
  await cmd(4,'accept',{token:await invite(3,first,4,'viewer')});
  await assert.rejects(cmd(4,'update',{workspace_id:first,name:'viewer変更'}),rejectCode('42501'));
  await cmd(5,'accept',{token:await invite(3,first,5,'member')});
  await assert.rejects(cmd(5,'invite',{workspace_id:first,email:'user6@test.invalid',role:'member',token:token(6)}),rejectCode('42501'));
  await assert.rejects(cmd(3,'set_role',{workspace_id:first,user_id:uid(3),role:'owner'}),rejectCode('42501'));
  await assert.rejects(cmd(3,'set_role',{workspace_id:first,user_id:uid(1),role:'member'}),rejectCode('42501'));
  await assert.rejects(invite(3,first,6,'admin'),rejectCode('42501'));
  await cmd(3,'set_role',{workspace_id:first,user_id:uid(4),role:'member'});
  await assert.rejects(asUser(4,'update public.workspace_members set role=\'owner\' where user_id=$1',[uid(4)]),rejectCode('42501'));
  await assert.rejects(asUser(4,'insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,\'owner\')',[second,uid(4)]),rejectCode('42501'));
});
test('DB: 最後のOwner保護とOwner移譲', async () => {
  await assert.rejects(cmd(1,'set_role',{workspace_id:first,user_id:uid(1),role:'member'}),rejectCode('23514'));
  await assert.rejects(cmd(1,'remove',{workspace_id:first,user_id:uid(1)}),rejectCode('23514'));
  await cmd(1,'set_role',{workspace_id:first,user_id:uid(3),role:'owner'});
  await cmd(1,'set_role',{workspace_id:first,user_id:uid(1),role:'admin'});
  await assert.rejects(cmd(1,'set_role',{workspace_id:first,user_id:uid(1),role:'owner'}),rejectCode('42501'));
});
test('DB: 期限切れ・取消・再発行した古い招待・招待者降格を拒否', async () => {
  const expired = await invite(3,first,6,'member',60);
  await db.query("update public.workspace_invitations set expires_at=now()-interval '1 minute' where email_normalized='user6@test.invalid'");
  await assert.rejects(cmd(6,'accept',{token:expired}),rejectCode('P0002'));
  const revoked = await invite(3,first,6,'member',61);
  const id = (await db.query("select id from public.workspace_invitations where token_hash=encode(sha256(convert_to($1,'UTF8')),'hex')",[revoked])).rows[0].id;
  await cmd(3,'revoke',{workspace_id:first,invitation_id:id});
  await assert.rejects(cmd(6,'accept',{token:revoked}),rejectCode('P0002'));
  const old = await invite(3,first,6,'member',62); await invite(3,first,6,'viewer',63);
  await assert.rejects(cmd(6,'accept',{token:old}),rejectCode('P0002'));
  const deauthorized = await invite(1,first,7,'member',70);
  await cmd(3,'set_role',{workspace_id:first,user_id:uid(1),role:'member'});
  await assert.rejects(cmd(7,'accept',{token:deauthorized}),rejectCode('42501'));
});
test('DB: 脱退後のアクセスと関連データの越境を拒否', async () => {
  await cmd(3,'remove',{workspace_id:first,user_id:uid(5)});
  assert.equal((await asUser(5,'select * from public.workspaces where id=$1',[first])).rows.length,0);
  await assert.rejects(cmd(5,'update',{workspace_id:first,name:'changed'}),rejectCode('42501'));
  // Seed future feature resources as the isolated DB administrator, not via app rights.
  const a=uid(101), b=uid(102);
  await db.exec(`begin;
    insert into public.resources(id,workspace_id,kind,title,visibility,created_by,updated_by) values('${a}','${first}','project','Project A','workspace','${uid(3)}','${uid(3)}'),('${b}','${second}','project','Project B','workspace','${uid(2)}','${uid(2)}');
    insert into public.projects(resource_id,workspace_id) values('${a}','${first}'),('${b}','${second}'); commit;`);
  assert.equal((await asUser(4,'select * from public.resources')).rows.length,1);
  await assert.rejects(db.query("insert into public.resource_relations(workspace_id,source_id,target_id,relation_type,created_by) values($1,$2,$3,'references',$4)",[first,a,b,uid(3)]),rejectCode('23503'));
  await assert.rejects(asUser(4,"insert into public.resources(workspace_id,kind,title,created_by,updated_by) values($1,'issue','Not enabled',$2,$2)",[first,uid(4)]),rejectCode('42501'));
});
test('DB: 旧ノートの原文と所有者不明行を保持し、他人には公開しない', async () => {
  assert.equal((await db.query("select input,owner from public.notes where id='legacy-unowned'")).rows[0].input,'preserve me');
  assert.equal((await asUser(4,'select * from public.notes')).rows.length,0);
  await asUser(4,"insert into public.notes(id,input,owner) values('mine','private',$1)",[uid(4)]);
  assert.equal((await asUser(4,'select * from public.notes')).rows.length,1);
  assert.equal((await asUser(3,'select * from public.notes')).rows.length,0);
  await assert.rejects(asUser(3,"insert into public.notes(id,input,owner) values('forged','x',$1)",[uid(4)]),rejectCode('42501'));
});
test('DB: 全新規表のRLS・GRANT・公開関数の最小権限', async () => {
  const tables=await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
  for(const row of tables.rows)assert.equal(row.relrowsecurity,true,row.relname);
  for(const name of ['workspaces','workspace_members','workspace_invitations','resources','issues','projects','wiki_pages','handoffs']){
    const result=await db.query('select has_table_privilege(\'authenticated\',$1,\'INSERT\') as writable',[`public.${name}`]);
    assert.equal(result.rows[0].writable,false,name);
  }
  const functions=await db.query("select has_function_privilege('anon','public.workspace_command(text,jsonb)','EXECUTE') as callable");
  assert.equal(functions.rows[0].callable,false);
});
test('DB: 下書きとその関連を非作成者に漏らさない、サブタイプ必須', async () => {
  const resource=uid(110),visible=uid(101);
  await db.exec(`begin;insert into public.resources(id,workspace_id,kind,title,created_by,updated_by) values('${resource}','${first}','wiki','下書き','${uid(3)}','${uid(3)}');insert into public.wiki_pages(resource_id,workspace_id) values('${resource}','${first}');commit;`);
  await db.query("insert into public.resource_relations(workspace_id,source_id,target_id,relation_type,created_by) values($1,$2,$3,'references',$4)",[first,visible,resource,uid(3)]);
  assert.equal((await asUser(4,'select * from public.wiki_pages')).rows.length,0);
  assert.equal((await asUser(4,'select * from public.resource_relations')).rows.length,0);
  assert.equal((await asUser(3,'select * from public.wiki_pages')).rows.length,1);
  await assert.rejects(db.query("insert into public.resources(workspace_id,kind,title,created_by,updated_by) values($1,'issue','子テーブルなし',$2,$2)",[first,uid(3)]),rejectCode('23514'));
});
test('DB: 参加待ち招待は管理者だけに公開し、ハッシュを返さない', async () => {
  await invite(3,first,8,'viewer');
  const pending=await asUser(3,'select * from public.workspace_pending_invitations($1)',[first]);
  assert.ok(pending.rows.some(row=>row.email==='user8@test.invalid'));
  for(const row of pending.rows)assert.equal('token_hash' in row,false);
  await assert.rejects(asUser(4,'select * from public.workspace_pending_invitations($1)',[first]),rejectCode('42501'));
});
