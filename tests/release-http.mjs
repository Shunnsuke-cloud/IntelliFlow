// Against isolated localhost Next/Supabase only. No production requests.
import assert from 'node:assert/strict';
import {createBrowserClient} from '@supabase/ssr';
const base='http://localhost:4100',jar=new Map();
const client=createBrowserClient('http://127.0.0.1:4400','sb_publishable_fixture',{isSingleton:false,auth:{autoRefreshToken:false},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>value?jar.set(name,value):jar.delete(name))}});
try{
 const page=await fetch(base+'/login');assert.equal(page.status,200);
 assert.equal(page.headers.get('x-content-type-options'),'nosniff');assert.equal(page.headers.get('x-frame-options'),'DENY');assert.equal(page.headers.get('x-powered-by'),null);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal((await client.auth.signInWithPassword({email:'user1@test.invalid',password:'Test-password-123'})).error,null);
 const headers={cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),origin:base,'content-type':'application/json'};
 const post=(body,extra={})=>fetch(base+'/api/workspaces',{method:'POST',headers:{...headers,...extra},body});
 assert.equal((await post(JSON.stringify({operation:'create',name:'cross-site'}),{origin:'https://attacker.invalid'})).status,403);
 assert.equal((await post('[]')).status,400);assert.equal((await post('{invalid')).status,400);
 assert.equal((await post(JSON.stringify({operation:'create',name:'x'.repeat(100000)}))).status,413);
 console.log('Release HTTP passed: security headers, authenticated input limits, malformed JSON, CSRF denial.');
}finally{await client.auth.signOut();await client.auth.stopAutoRefresh();}
