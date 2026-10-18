import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {installStorageSchema} from './helpers/storage.mjs';
test('公開準備: 本番と同じ旧テーブル/権限から全移行してもデータと所有者が残り、バックアップへの直接アクセスを拒否',async()=>{
 const db=new PGlite({extensions:{pg_trgm}});
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
  create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  create function auth.uid() returns uuid language sql stable as $$select(auth.jwt()->>'sub')::uuid$$;
  grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;
  create table public.notes(id text primary key,input text not null,saved_at timestamptz not null default now(),owner text);
  create table public.notes_backup(id text,input text,saved_at timestamptz);
  alter table public.notes enable row level security;alter table public.notes_backup enable row level security;
  create policy notes_select_owner on public.notes for select using(auth.uid()::text=owner);
  grant all on public.notes,public.notes_backup to anon,authenticated;
  insert into auth.users values('80000000-0000-4000-8000-000000000001','release@test.invalid',now(),'{}');
  insert into public.notes(id,input,owner)values('owned','保存対象','80000000-0000-4000-8000-000000000001'),('unmapped','変更禁止','historic-owner'),('unowned','所有者不明',null);
  insert into public.notes_backup values('backup','旧バックアップの行',now());`);
  await installStorageSchema(db);
  const before=(await db.query('select * from public.notes order by id')).rows;
  const backupBefore=(await db.query('select * from public.notes_backup')).rows;
  const folder=new URL('../supabase/migrations/',import.meta.url);
  for(const file of(await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
  assert.deepEqual((await db.query('select * from public.notes order by id')).rows,before);
  assert.deepEqual((await db.query('select * from public.notes_backup')).rows,backupBefore);
  for(const role of ['anon','authenticated']){
   for(const privilege of ['TRUNCATE','TRIGGER','REFERENCES'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',[role,'public.notes',privilege])).rows[0].allowed,false);
   assert.equal((await db.query("select has_table_privilege($1,'public.notes_backup','SELECT') as allowed",[role])).rows[0].allowed,false);
  }
  await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:'80000000-0000-4000-8000-000000000001',role:'authenticated'})]);
  assert.equal((await db.query('select id from public.notes')).rows[0].id,'owned');
  await assert.rejects(db.exec("update public.notes set owner='other' where id='owned'"));
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:'80000000-0000-4000-8000-000000000001',role:'authenticated',is_anonymous:true})]);assert.equal((await db.query('select * from public.notes')).rows.length,0);
  await db.exec('reset role');
 }finally{await db.close();}
});
