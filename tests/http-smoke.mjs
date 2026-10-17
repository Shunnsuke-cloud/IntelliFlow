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
const updatedName='HTTP更新-'+Date.now();
response=await post({operation:'update',workspace_id:id,name:updatedName,description:'保存確認'});assert.equal(response.status,200);
const workUrl=base+`/api/workspaces/${id}/work-items`;
async function work(body,extra={}){return fetch(workUrl,{method:'POST',headers:{...headers(),origin:base,'content-type':'application/json',...extra},body:JSON.stringify(body)});}
async function items(collection,filter={}){const r=await fetch(workUrl+'?'+new URLSearchParams({collection,...filter}),{headers:headers()});assert.equal(r.status,200);return r.json();}
response=await work({operation:'project_create',title:'HTTP Project',description:'実APIで検証',status:'active',member_ids:[],start_on:'2026-10-01',due_on:'2026-10-31'});assert.equal(response.status,200);const project=(await response.json()).id;
response=await work({operation:'issue_create',title:'HTTP Issue',description:'本文の保存',status:'open',priority:'high',project_id:project,labels:['広報'],due_on:'2026-10-20'});assert.equal(response.status,200);const issue=(await response.json()).id;
let d=await items('detail',{kind:'issue',id:issue});assert.equal(d.item.code,'ISSUE-001');
response=await work({...d.item,operation:'issue_update',expected_version:d.item.version,status:'done'});assert.equal(response.status,200);
let pd=await items('detail',{kind:'project',id:project});assert.equal(pd.item.completed_count,1);assert.equal(pd.item.issue_count,1);
assert.equal((await items('issues',{label:'広報',status:'done',project})).total,1);
d=await items('detail',{kind:'issue',id:issue});response=await work({operation:'comment_create',id:issue,expected_version:d.item.version,body:'APIコメント'});assert.equal(response.status,200);
d=await items('detail',{kind:'issue',id:issue});assert.equal(d.comments[0].body,'APIコメント');assert.ok(d.events.length>=3);
for(const path of [`/issues`,`/issues/${issue}`,`/projects?view=kanban`,`/projects/${project}`]){page=await fetch(base+`/app/w/${id}`+path,{headers:headers()});assert.equal(page.status,200);const html=await page.text();assert.match(html,path.startsWith('/issues')?/HTTP Issue/:/HTTP Project/);assert.doesNotMatch(html,/データを読み込めませんでした/);}
response=await work({operation:'archive',id:issue,expected_version:d.item.version});assert.equal(response.status,200);assert.equal((await items('issues')).total,0);assert.equal((await items('detail',{kind:'project',id:project})).item.issue_count,0);
d=await items('detail',{kind:'issue',id:issue});response=await work({operation:'restore',id:issue,expected_version:d.item.version});assert.equal(response.status,200);assert.equal((await items('issues')).total,1);
page=await fetch(base+`/app/w/${id}/settings`,{headers:headers()});assert.equal(page.status,200);assert.match(await page.text(),/メンバー一覧/);
response=await post({operation:'invite',workspace_id:id,email:'user2@test.invalid',role:'viewer'});assert.equal(response.status,200);const invitation=(await response.json()).inviteToken;assert.match(invitation,/^[a-f0-9]{64}$/);
response=await post({operation:'update',workspace_id:id,name:'CSRF',description:''},{origin:'https://attacker.test'});assert.equal(response.status,403);
response=await post({operation:'update',workspace_id:id,name:'Invalid token',description:''},{authorization:'Bearer invalid'});assert.equal(response.status,401);
await client.auth.signOut();
await client.auth.signInWithPassword({email:'user2@test.invalid',password:'Test-password-123'});
response=await post({operation:'update',workspace_id:id,name:'Cross workspace',description:''});assert.equal(response.status,403);
response=await work({operation:'issue_create',title:'forbidden',status:'open',priority:'normal',labels:[]});assert.equal(response.status,403);
page=await fetch(base+`/app/w/${id}`,{headers:headers()});assert.equal((await page.text()).includes(updatedName),false);
response=await post({operation:'accept',token:invitation});assert.equal(response.status,200);
page=await fetch(base+`/app/w/${id}`,{headers:headers()});assert.equal((await page.text()).includes(updatedName),true);
response=await post({operation:'update',workspace_id:id,name:'Viewer write',description:''});assert.equal(response.status,403);
response=await work({operation:'issue_create',title:'viewer forbidden',status:'open',priority:'normal',labels:[]});assert.equal(response.status,403);
await client.auth.signOut();
page=await fetch(base+'/app',{headers:headers(),redirect:'manual'});assert.equal(page.status,307);
await client.auth.stopAutoRefresh();
console.log('HTTP smoke passed: Phase 2 auth/workspaces regression; Phase 3 projects/issues CRUD, filters, progress, comments/history, rendered pages, archive/restore, cross-workspace and viewer denial.');
