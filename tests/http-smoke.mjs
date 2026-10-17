// Run against Next started with the local fixture env; never against production.
import assert from 'node:assert/strict';
import { createBrowserClient } from '@supabase/ssr';
const base='http://localhost:4100';
const jar=new Map();
const client=createBrowserClient('http://127.0.0.1:4400','sb_publishable_fixture',{isSingleton:false,auth:{autoRefreshToken:false},cookies:{
  getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>{if(value)jar.set(name,value);else jar.delete(name);}),
}});
const headers=()=>({cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')});
async function post(body,extra={}){return fetch(base+'/api/workspaces',{method:'POST',headers:{...headers(),origin:base,'content-type':'application/json',...extra},body:JSON.stringify(body)});}
const anonymous=await fetch(base+'/app',{redirect:'manual'});
assert.equal(anonymous.status,307);assert.ok(anonymous.headers.get('location').includes('/login'));
const denied=await fetch(base+'/api/notes');assert.equal(denied.status,401);
const invalid=await client.auth.signInWithPassword({email:'user1@test.invalid',password:'wrong'});assert.ok(invalid.error);
const login=await client.auth.signInWithPassword({email:'user1@test.invalid',password:'Test-password-123'});assert.equal(login.error,null);
let page=await fetch(base+'/app',{headers:headers()});assert.equal(page.status,200);assert.match(await page.text(),/ワークスペースを作成/);
let response=await post({operation:'create',name:'HTTPテストの活動',description:'隔離DBの検証'});assert.equal(response.status,200);
const id=(await response.json()).data.workspace_id;assert.ok(id);
page=await fetch(base+`/app/w/${id}`,{headers:headers()});assert.equal(page.status,200);assert.match(await page.text(),/HTTPテストの活動/);
response=await post({operation:'update',workspace_id:id,name:'HTTP更新',description:'保存確認'});assert.equal(response.status,200);
page=await fetch(base+`/app/w/${id}/settings`,{headers:headers()});assert.equal(page.status,200);assert.match(await page.text(),/メンバー一覧/);
response=await post({operation:'invite',workspace_id:id,email:'user2@test.invalid',role:'viewer'});assert.equal(response.status,200);const invitation=(await response.json()).inviteToken;assert.match(invitation,/^[a-f0-9]{64}$/);
response=await post({operation:'update',workspace_id:id,name:'CSRF',description:''},{origin:'https://attacker.test'});assert.equal(response.status,403);
response=await post({operation:'update',workspace_id:id,name:'Invalid token',description:''},{authorization:'Bearer invalid'});assert.equal(response.status,401);
await client.auth.signOut();
await client.auth.signInWithPassword({email:'user2@test.invalid',password:'Test-password-123'});
response=await post({operation:'update',workspace_id:id,name:'Cross workspace',description:''});assert.equal(response.status,403);
page=await fetch(base+`/app/w/${id}`,{headers:headers()});assert.doesNotMatch(await page.text(),/HTTP更新/);
response=await post({operation:'accept',token:invitation});assert.equal(response.status,200);
page=await fetch(base+`/app/w/${id}`,{headers:headers()});assert.match(await page.text(),/HTTP更新/);
response=await post({operation:'update',workspace_id:id,name:'Viewer write',description:''});assert.equal(response.status,403);
await client.auth.signOut();
page=await fetch(base+'/app',{headers:headers(),redirect:'manual'});assert.equal(page.status,307);
await client.auth.stopAutoRefresh();
console.log('HTTP smoke passed: auth, cookies, create/update, settings, invite/accept, CSRF, invalid token, cross-workspace, viewer denial, logout.');
