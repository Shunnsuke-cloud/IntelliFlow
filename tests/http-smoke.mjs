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
const wikiUrl=base+`/api/workspaces/${id}/wiki`;
async function wiki(body){return fetch(wikiUrl,{method:'POST',headers:{...headers(),origin:base,'content-type':'application/json'},body:JSON.stringify(body)});}
async function wikiRead(collection,filter={}){const response=await fetch(wikiUrl+'?'+new URLSearchParams({collection,...filter}),{headers:headers()});assert.equal(response.status,200);return response.json();}
const wikiDoc={type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'FAQと手順'}]},{type:'paragraph',content:[{type:'text',text:'<img src=x onerror="alert(1)">'}]},{type:'taskList',content:[{type:'taskItem',attrs:{checked:true},content:[{type:'paragraph',content:[{type:'text',text:'準備完了'}]}]}]}]};
response=await wiki({operation:'create',title:'HTTP Wiki',category:'FAQ',status:'draft',body_doc:wikiDoc,related_ids:[issue,project]});assert.equal(response.status,200);const wikiId=(await response.json()).id;
const imageForm=new FormData();imageForm.set('page_id',wikiId);imageForm.set('image',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'test.png');
response=await fetch(wikiUrl+'/attachments',{method:'POST',headers:{...headers(),origin:base},body:imageForm});assert.equal(response.status,201);const attachment=(await response.json()).id;
const imageUrl=wikiUrl+'/attachments/'+attachment;response=await fetch(imageUrl,{headers:headers()});assert.equal(response.status,200);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
const wd=await wikiRead('detail',{id:wikiId});const publishedDoc={...wikiDoc,content:[...wikiDoc.content,{type:'image',attrs:{attachmentId:attachment,alt:'添付の確認'}}]};
response=await wiki({operation:'update',id:wikiId,expected_version:wd.page.version,title:'HTTP Wiki',category:'FAQ',status:'published',body_doc:publishedDoc,related_ids:[issue,project]});assert.equal(response.status,200);
assert.equal((await wikiRead('list',{q:'準備完了',category:'FAQ'})).total,1);assert.equal((await wikiRead('backlinks',{id:issue}))[0].id,wikiId);assert.equal((await wikiRead('backlinks',{id:project}))[0].id,wikiId);
for(const path of [`/wiki`,`/wiki/${wikiId}`,`/wiki/${wikiId}/edit`,`/wiki/${wikiId}/history/1`,`/wiki/new`,`/issues/${issue}`,`/projects/${project}`]){const response=await fetch(base+`/app/w/${id}`+path,{headers:headers()});assert.equal(response.status,200);const html=await response.text();assert.doesNotMatch(html,/データを読み込めませんでした/);if(!path.endsWith('/edit')&&!path.endsWith('/new'))assert.match(html,/HTTP Wiki/);if(path===`/wiki/${wikiId}`){assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img[^>]*onerror=/);}}
const badImage=new FormData();badImage.set('page_id',wikiId);badImage.set('image',new Blob(['<svg onload="alert(1)"></svg>'],{type:'image/png'}),'bad.png');response=await fetch(wikiUrl+'/attachments',{method:'POST',headers:{...headers(),origin:base},body:badImage});assert.equal(response.status,400);
const flowUrl=base+`/api/workspaces/${id}/flow`;
async function flow(collection='search',filter={}){const response=await fetch(flowUrl+'?'+new URLSearchParams({collection,...filter}),{headers:headers()});assert.equal(response.status,200);return response.json();}
const map=await flow('search',{q:'HTTP Issue',kind:'issue'});assert.deepEqual(map.result_ids,[issue]);assert.ok(map.nodes.some(n=>n.id===wikiId));assert.ok(map.edges.some(e=>e.source_id===wikiId&&e.target_id===issue));assert.ok(map.edges.some(e=>e.source_id===issue&&e.target_id===project&&e.relation_type==='belongs_to'));
const selectedNode=await flow('detail',{id:issue});assert.equal(selectedNode.id,issue);assert.equal(selectedNode.kind,'issue');assert.ok((await flow('neighbors',{id:wikiId})).nodes.some(n=>n.id===issue));
for(const suffix of ['/flow?q=HTTP','/flow?from=2023-02-29']){page=await fetch(base+`/app/w/${id}`+suffix,{headers:headers()});assert.equal(page.status,200);const html=await page.text();assert.match(html,suffix.includes('from=')?/検索条件を確認/:/過去の情報から/);assert.doesNotMatch(html,/Flow Mapを読み込めませんでした/);}
response=await fetch(flowUrl+'?q=x&q=y',{headers:headers()});assert.equal(response.status,400);
let source=await flow('detail',{id:issue}),target=await flow('detail',{id:wikiId});
async function flowRelation(operation,extra={}){return fetch(flowUrl,{method:'POST',headers:{...headers(),origin:base,'content-type':'application/json'},body:JSON.stringify({operation,source_id:issue,source_version:source.version,target_id:wikiId,target_version:target.version,...extra})});}
response=await flowRelation('unlink');assert.equal(response.status,200);assert.ok(!(await flow('neighbors',{id:issue})).edges.some(e=>e.source_id===wikiId&&e.target_id===issue));
source=await flow('detail',{id:issue});target=await flow('detail',{id:wikiId});response=await flowRelation('link');assert.equal(response.status,200);assert.ok((await flow('neighbors',{id:issue})).edges.some(e=>e.source_id===wikiId&&e.target_id===issue));
response=await fetch(flowUrl,{method:'POST',headers:{...headers(),origin:'https://attacker.test','content-type':'application/json'},body:JSON.stringify({operation:'link'})});assert.equal(response.status,403);
const handoffUrl=base+`/api/workspaces/${id}/handoffs`;
async function handoffRead(collection='list',filter={}){const response=await fetch(handoffUrl+'?'+new URLSearchParams({collection,...filter}),{headers:headers()});assert.equal(response.status,200);return response.json();}
async function handoffWrite(body){return fetch(handoffUrl,{method:'POST',headers:{...headers(),origin:base,'content-type':'application/json'},body:JSON.stringify(body)});}
const seed=await handoffRead('seed',{source_id:issue});assert.ok(seed.related.some(r=>r.id===wikiId));assert.ok(seed.related.some(r=>r.id===project));assert.equal((await handoffRead()).items.length,0);
const hBody={title:'HTTP Handoff',summary:'引き継ぎの概要 <script>handoff</script>',current_state:'現在の進捗',completed_work:'完了済み作業',pending_work:'未完了作業',risks:'注意事項',next_actions:'次に行うこと',recipient_id:null,related_ids:seed.related.map(r=>r.id)};
response=await handoffWrite({operation:'create',...hBody});assert.equal(response.status,200);const handoffId=(await response.json()).id;
for(const suffix of ['/handoffs',`/handoffs/new?source_id=${issue}`,`/handoffs/new?source_id=${project}`,`/handoffs/${handoffId}`,`/handoffs/${handoffId}/edit`]){page=await fetch(base+`/app/w/${id}`+suffix,{headers:headers()});assert.equal(page.status,200);const html=await page.text();assert.doesNotMatch(html,/引き継ぎを読み込めませんでした/);assert.match(html,suffix.includes('/new?')?/元の情報から作った候補/:/HTTP Handoff/);}
page=await fetch(base+`/app/w/${id}/settings`,{headers:headers()});assert.equal(page.status,200);assert.match(await page.text(),/メンバー一覧/);
response=await post({operation:'invite',workspace_id:id,email:'user2@test.invalid',role:'viewer'});assert.equal(response.status,200);const invitation=(await response.json()).inviteToken;assert.match(invitation,/^[a-f0-9]{64}$/);
response=await post({operation:'update',workspace_id:id,name:'CSRF',description:''},{origin:'https://attacker.test'});assert.equal(response.status,403);
response=await post({operation:'update',workspace_id:id,name:'Invalid token',description:''},{authorization:'Bearer invalid'});assert.equal(response.status,401);
await client.auth.signOut();
await client.auth.signInWithPassword({email:'user2@test.invalid',password:'Test-password-123'});
response=await post({operation:'update',workspace_id:id,name:'Cross workspace',description:''});assert.equal(response.status,403);
response=await work({operation:'issue_create',title:'forbidden',status:'open',priority:'normal',labels:[]});assert.equal(response.status,403);
response=await fetch(imageUrl,{headers:headers()});assert.equal(response.status,403);
response=await fetch(flowUrl,{headers:headers()});assert.equal(response.status,403);
response=await fetch(handoffUrl,{headers:headers()});assert.equal(response.status,403);
page=await fetch(base+`/app/w/${id}`,{headers:headers()});assert.equal((await page.text()).includes(updatedName),false);
response=await post({operation:'accept',token:invitation});assert.equal(response.status,200);
page=await fetch(base+`/app/w/${id}`,{headers:headers()});assert.equal((await page.text()).includes(updatedName),true);
response=await post({operation:'update',workspace_id:id,name:'Viewer write',description:''});assert.equal(response.status,403);
response=await work({operation:'issue_create',title:'viewer forbidden',status:'open',priority:'normal',labels:[]});assert.equal(response.status,403);
response=await wiki({operation:'create',title:'viewer forbidden',category:'FAQ',status:'published',body_doc:wikiDoc,related_ids:[]});assert.equal(response.status,403);
assert.ok((await flow('search',{q:'HTTP Issue'})).nodes.some(n=>n.id===wikiId));response=await flowRelation('unlink');assert.equal(response.status,403);
response=await fetch(imageUrl,{headers:headers()});assert.equal(response.status,200);response=await fetch(wikiUrl+'?'+new URLSearchParams({collection:'revision',id:wikiId,revision:'1'}),{headers:headers()});assert.equal(response.status,404);
const receiver=(await client.auth.getUser()).data.user.id;
response=await fetch(handoffUrl+'?'+new URLSearchParams({collection:'detail',id:handoffId}),{headers:headers()});assert.equal(response.status,404);
response=await handoffWrite({operation:'create',...hBody});assert.equal(response.status,403);
await client.auth.signOut();await client.auth.signInWithPassword({email:'user1@test.invalid',password:'Test-password-123'});
let hd=await handoffRead('detail',{id:handoffId});response=await handoffWrite({...hBody,operation:'update',id:handoffId,expected_version:hd.item.version,recipient_id:receiver});assert.equal(response.status,200);
hd=await handoffRead('detail',{id:handoffId});response=await handoffWrite({operation:'send',id:handoffId,expected_version:hd.item.version});assert.equal(response.status,200);
hd=await handoffRead('detail',{id:handoffId});assert.equal(hd.item.status,'sent');assert.equal(hd.current_snapshot.snapshot.related.length,3);const firstSend=hd.current_snapshot.snapshot;
response=await handoffWrite({operation:'accept',id:handoffId,expected_version:hd.item.version,content_version:1});assert.equal(response.status,403);
const hMap=await flow('search',{kind:'handoff',q:'HTTP Handoff'});assert.deepEqual(hMap.result_ids,[handoffId]);assert.ok(hMap.edges.some(e=>e.source_id===handoffId&&e.target_id===wikiId&&e.relation_type==='hands_over'));assert.ok((await flow('neighbors',{id:issue})).nodes.some(n=>n.id===handoffId));assert.equal((await handoffRead('backlinks',{id:issue})).items[0].id,handoffId);
await client.auth.signOut();await client.auth.signInWithPassword({email:'user2@test.invalid',password:'Test-password-123'});
assert.equal((await handoffRead('list',{mine:'true'})).items[0].id,handoffId);hd=await handoffRead('detail',{id:handoffId});
page=await fetch(base+`/app/w/${id}/handoffs/${handoffId}`,{headers:headers()});assert.equal(page.status,200);let hHtml=await page.text();assert.match(hHtml,/この版を受領する/);assert.match(hHtml,/&lt;script&gt;handoff/);assert.doesNotMatch(hHtml,/<script>handoff/);
response=await handoffWrite({operation:'accept',id:handoffId,expected_version:hd.item.version,content_version:1});assert.equal(response.status,200);hd=await handoffRead('detail',{id:handoffId});assert.equal(hd.receipts[0].recipient_id,receiver);assert.ok(hd.receipts[0].accepted_at);
await client.auth.signOut();await client.auth.signInWithPassword({email:'user1@test.invalid',password:'Test-password-123'});
hd=await handoffRead('detail',{id:handoffId});response=await handoffWrite({...hd.item,operation:'revise',expected_version:hd.item.version,related_ids:hd.related.map(r=>r.id),summary:'重要な改訂を確認してください',change_reason:'入口の変更'});assert.equal(response.status,200);
assert.deepEqual((await handoffRead('version',{id:handoffId,version:'1'})).snapshot,firstSend);
await client.auth.signOut();await client.auth.signInWithPassword({email:'user2@test.invalid',password:'Test-password-123'});
hd=await handoffRead('detail',{id:handoffId});assert.equal(hd.item.status,'sent');assert.equal(hd.item.current_version,2);assert.equal(hd.receipts[0].version,1);
response=await handoffWrite({operation:'accept',id:handoffId,expected_version:hd.item.version,content_version:1});assert.equal(response.status,409);
response=await handoffWrite({operation:'accept',id:handoffId,expected_version:hd.item.version,content_version:2});assert.equal(response.status,200);
hd=await handoffRead('detail',{id:handoffId});response=await handoffWrite({operation:'complete',id:handoffId,expected_version:hd.item.version,content_version:2});assert.equal(response.status,200);hd=await handoffRead('detail',{id:handoffId});assert.equal(hd.item.status,'completed');assert.equal(hd.receipts.length,2);assert.ok(hd.receipts[0].completed_at);
page=await fetch(base+`/app/w/${id}/handoffs/${handoffId}/history/1`,{headers:headers()});assert.equal(page.status,200);assert.match(await page.text(),/送信時点の記録/);
await client.auth.signOut();
page=await fetch(base+'/app',{headers:headers(),redirect:'manual'});assert.equal(page.status,307);
await client.auth.stopAutoRefresh();
console.log('HTTP smoke passed: Phases 2–5 regression; Handoff source candidates, draft/save/send, assigned Viewer receipt, immutable snapshots, revision/reconfirmation/completion, Flow nodes/links/search, SSR/XSS and workspace denial.');
