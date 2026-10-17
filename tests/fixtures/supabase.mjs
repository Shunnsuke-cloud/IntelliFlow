// Local-only HTTP adapter for UI/Auth integration tests. Never uses environment credentials.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { installStorageSchema } from '../helpers/storage.mjs';
export async function startFixture(port = 0) {
  const db = new PGlite({ extensions: { pg_trgm } });
  const userId = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const users = [1,2,3].map(n => ({ id: userId(n), email: `user${n}@test.invalid`, aud:'authenticated', role:'authenticated', email_confirmed_at: new Date().toISOString(), app_metadata:{provider:'email'}, user_metadata:{full_name:`テスト利用者 ${n}`}, created_at:new Date().toISOString() }));
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;`);
  for (const user of users) await db.query('insert into auth.users values($1,$2,$3,$4)',[user.id,user.email,user.email_confirmed_at,JSON.stringify(user.user_metadata)]);
  await installStorageSchema(db);
  const migrations = new URL('../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file,migrations),'utf8'));
  const sessions = new Map(); const refreshes = new Map();
  const files = new Map();
  function session(user) {
    const now = Math.floor(Date.now()/1000);
    const access_token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',iat:now,exp:now+3600,jti:randomUUID()})).toString('base64url')}.fixture`;
    const refresh_token = randomUUID(); sessions.set(access_token,user); refreshes.set(refresh_token,user);
    return {access_token,refresh_token,expires_in:3600,expires_at:now+3600,token_type:'bearer',user};
  }
  let queue = Promise.resolve();
  const server = createServer((req,res) => {
    // Serialize because the embedded DB connection has connection-local role settings.
    queue = queue.then(async () => {
      const origin=req.headers.origin;
      if (origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) res.setHeader('Access-Control-Allow-Origin',origin);
      res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer');
      res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
      res.setHeader('Content-Type','application/json');
      if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
      const send=(status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));};
      const url=new URL(req.url,'http://127.0.0.1');
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks);
      const body=raw.length && !url.pathname.startsWith('/storage/')?JSON.parse(raw.toString('utf8')):{};
      const access=req.headers.authorization?.replace(/^Bearer /,''); const user=sessions.get(access);
      if(url.pathname==='/auth/v1/token'){
        const found=url.searchParams.get('grant_type')==='refresh_token'?refreshes.get(body.refresh_token):body.password==='Test-password-123'?users.find(u=>u.email===body.email):null;
        return found?send(200,session(found)):send(400,{error:'invalid_grant',error_code:'invalid_credentials',msg:'Invalid login credentials'});
      }
      if(url.pathname==='/auth/v1/user')return user?send(200,user):send(401,{msg:'Invalid token'});
      if(url.pathname==='/auth/v1/logout'){
        if(user){for(const [key,value] of sessions)if(value.id===user.id)sessions.delete(key);for(const [key,value] of refreshes)if(value.id===user.id)refreshes.delete(key);}
        return send(204,null);
      }
      if(!user)return send(401,{message:'Authentication required',code:'42501'});
      try{
        await db.exec('set role authenticated');
        await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user.id,role:'authenticated'})]);
        if(url.pathname==='/rest/v1/rpc/workspace_command'){
          const result=await db.query('select public.workspace_command($1,$2::jsonb) as value',[body.operation,JSON.stringify(body.payload)]);
          return send(200,result.rows[0].value);
        }
        if(url.pathname==='/rest/v1/rpc/ai_status')return send(200,(await db.query('select public.ai_status($1) as value',[body.target_workspace])).rows[0].value);
        if(url.pathname==='/rest/v1/rpc/ai_command')return send(200,(await db.query('select public.ai_command($1,$2,$3::jsonb) as value',[body.target_workspace,body.operation,JSON.stringify(body.payload)])).rows[0].value);
        if(url.pathname==='/rest/v1/rpc/ai_context')return send(200,(await db.query('select public.ai_context($1,$2::uuid[],$3,$4::jsonb) as value',[body.target_workspace,body.source_ids,body.intent,JSON.stringify(body.query_filters??{})])).rows[0].value);
        if(url.pathname==='/rest/v1/rpc/work_item_command')return send(200,(await db.query('select public.work_item_command($1,$2,$3::jsonb) as value',[body.target_workspace,body.operation,JSON.stringify(body.payload)])).rows[0].value);
        if(url.pathname==='/rest/v1/rpc/work_items_query')return send(200,(await db.query('select public.work_items_query($1,$2,$3::jsonb) as value',[body.target_workspace,body.collection,JSON.stringify(body.filters)])).rows[0].value);
        if(url.pathname==='/rest/v1/rpc/wiki_command')return send(200,(await db.query('select public.wiki_command($1,$2,$3::jsonb) as value',[body.target_workspace,body.operation,JSON.stringify(body.payload)])).rows[0].value);
        if(url.pathname==='/rest/v1/rpc/wiki_query')return send(200,(await db.query('select public.wiki_query($1,$2,$3::jsonb) as value',[body.target_workspace,body.collection,JSON.stringify(body.filters)])).rows[0].value);
        if(url.pathname==='/rest/v1/rpc/flow_query')return send(200,(await db.query('select public.flow_query($1,$2,$3::jsonb) as value',[body.target_workspace,body.collection,JSON.stringify(body.filters)])).rows[0].value);
        if(url.pathname==='/rest/v1/rpc/handoff_query')return send(200,(await db.query('select public.handoff_query($1,$2,$3::jsonb) as value',[body.target_workspace,body.collection,JSON.stringify(body.filters)])).rows[0].value);
        if(url.pathname==='/rest/v1/rpc/handoff_command')return send(200,(await db.query('select public.handoff_command($1,$2,$3::jsonb) as value',[body.target_workspace,body.operation,JSON.stringify(body.payload)])).rows[0].value);
        if(url.pathname==='/rest/v1/rpc/flow_relation_command')return send(200,(await db.query('select public.flow_relation_command($1,$2,$3::jsonb) as value',[body.target_workspace,body.operation,JSON.stringify(body.payload)])).rows[0].value);
        if(url.pathname==='/rest/v1/wiki_attachments'){
          const workspace=url.searchParams.get('workspace_id')?.slice(3);const id=url.searchParams.get('id')?.slice(3);
          const rows=(await db.query("select object_path,mime_type from public.wiki_attachments where workspace_id=$1 and id=$2 and state='ready'",[workspace,id])).rows;
          return send(200,req.headers.accept?.includes('vnd.pgrst.object')?rows[0]??null:rows);
        }
        if(url.pathname.startsWith('/storage/v1/object/')){
          const pieces=url.pathname.slice('/storage/v1/object/'.length).split('/').map(decodeURIComponent);
          if(pieces[0]==='authenticated')pieces.shift();const bucket=pieces.shift();const path=pieces.join('/');const key=bucket+'/'+path;
          if(req.method==='POST'){
            const mime=req.headers['content-type'];
            const settings=(await db.query('select allowed_mime_types,file_size_limit from storage.buckets where id=$1',[bucket])).rows[0];
            if(!settings || !settings.allowed_mime_types.includes(mime) || raw.length>Number(settings.file_size_limit))return send(400,{message:'Invalid file'});
            const row=(await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3) returning id',[bucket,path,JSON.stringify({size:raw.length,mimetype:mime})])).rows[0];files.set(key,{bytes:raw,mime});return send(200,{Id:row.id,Key:key});
          }
          const rows=(await db.query('select id from storage.objects where bucket_id=$1 and name=$2',[bucket,path])).rows;
          const file=files.get(key);if(!rows.length||!file)return send(404,{message:'Object not found'});
          res.writeHead(200,{'Content-Type':file.mime});res.end(file.bytes);return;
        }
        if(url.pathname==='/rest/v1/rpc/workspace_people')return send(200,(await db.query('select * from public.workspace_people($1)',[body.target_workspace])).rows);
        if(url.pathname==='/rest/v1/rpc/workspace_pending_invitations')return send(200,(await db.query('select * from public.workspace_pending_invitations($1)',[body.target_workspace])).rows);
        if(url.pathname==='/rest/v1/workspaces')return send(200,(await db.query('select * from public.workspaces order by created_at')).rows);
        if(url.pathname==='/rest/v1/workspace_members'){
          const filters=[];const values=[];
          for(const column of ['workspace_id','user_id']){const value=url.searchParams.get(column);if(value?.startsWith('eq.')){values.push(value.slice(3));filters.push(`${column}=$${values.length}`);}}
          filters.push('left_at is null');
          const rows=(await db.query(`select * from public.workspace_members where ${filters.join(' and ')}`,values)).rows;
          return send(200,req.headers.accept?.includes('vnd.pgrst.object')?rows[0]??null:rows);
        }
        return send(404,{message:'Not implemented in fixture'});
      }catch(error){return send(error.code==='42501'?403:400,{message:'Test database rejected command',code:error.code});}
      finally{await db.exec('reset role');}
    }).catch(()=>{if(!res.writableEnded){res.writeHead(500);res.end('{}');}});
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  return {url:`http://127.0.0.1:${server.address().port}`,close:async()=>{await new Promise(resolve=>server.close(resolve));await db.close();}};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const fixture=await startFixture(4400);console.log('Local test fixture ready: '+fixture.url+' (PID '+process.pid+')');
  process.stdin.on('data',async chunk=>{if(String(chunk).trim()==='stop'){await fixture.close();process.exit(0);}});
  process.on('SIGINT',async()=>{await fixture.close();process.exit(0);});
}
