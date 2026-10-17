// Real Next routes + isolated Supabase/Postgres + Google transport fixture. Never live data.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createBrowserClient} from '@supabase/ssr';
const base='http://localhost:4100';const jar=new Map();
const client=createBrowserClient('http://127.0.0.1:4400','sb_publishable_fixture',{isSingleton:false,auth:{autoRefreshToken:false},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>{if(value)jar.set(name,value);else jar.delete(name);})}});
const headers=()=>({cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),origin:base,'content-type':'application/json'});
async function post(path,p){return fetch(base+path,{method:'POST',headers:headers(),body:JSON.stringify(p)});}
async function body(response,expected=200){assert.equal(response.status,expected,await response.clone().text());return response.json();}
assert.equal((await fetch(base+'/api/gemini?workspace_id='+randomUUID())).status,401);
await client.auth.signInWithPassword({email:'user1@test.invalid',password:'Test-password-123'});
const ws=(await body(await post('/api/workspaces',{operation:'create',name:'AI HTTP検証'}))).data.workspace_id;
const work=`/api/workspaces/${ws}/work-items`,wiki=`/api/workspaces/${ws}/wiki`,handoff=`/api/workspaces/${ws}/handoffs`;
const project=(await body(await post(work,{operation:'project_create',title:'受付Project',description:'受付の実施',status:'active',member_ids:[]}))).id;
const issue=(await body(await post(work,{operation:'issue_create',title:'イベントの受付の問題',description:'受付に人が集中した',status:'open',priority:'high',project_id:project,labels:[]}))).id;
const doc={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'受付を分散する手順'}]}]};
const page=(await body(await post(wiki,{operation:'create',title:'受付の手順',body_doc:doc,status:'published',category:'手順',related_ids:[issue,project]}))).id;
const ai=p=>post('/api/gemini',{workspace_id:ws,...p});
const question=(extra={})=>({operation:'generate',feature:'chat',question:'イベントで発生した問題は？',source_ids:[],request_id:randomUUID(),consent:true,...extra});
await body(await ai(question()),403);
await body(await ai({operation:'settings',enabled:true,user_limit:10,workspace_limit:50,consent:true}));
await body(await ai(question()),403);
await body(await ai({operation:'preference',enabled:true,consent:true}));
const original=question();let result=await body(await ai(original));assert.ok(result.sources.some(s=>s.id===issue));assert.ok(result.sources.some(s=>s.id===page));assert.ok(result.source_ids.every(id=>result.sources.some(s=>s.id===id)));assert.equal(result.status.user_remaining,9);assert.ok(!JSON.stringify(result).includes('fixture-google-key'));
await body(await ai(original),429);
let before=await body(await fetch(base+`/api/gemini?workspace_id=${ws}`,{headers:headers()}));result=await body(await ai(question({question:'存在しない特定情報abcdefgh'})));assert.equal(result.unknown,true);assert.equal(result.sources.length,0);assert.equal(result.status.user_remaining,before.status.user_remaining);
result=await body(await ai(question({feature:'flow',question:'受付の問題は？'})));assert.ok(result.sources.some(s=>s.kind==='wiki'));assert.ok(result.sources.some(s=>s.kind==='issue'));
result=await body(await ai(question({feature:'handoff',question:'受付を引き継ぐ下書き',source_ids:[issue,page]})));assert.ok(result.draft);assert.match(result.draft.risks,/未確認/);assert.ok(result.sources.some(s=>s.id===page));
// Generating a draft did not create a Handoff; the user explicitly saves the reviewed draft.
let list=await body(await fetch(base+handoff+'?collection=list',{headers:headers()}));assert.equal(list.items.length,0);
const h=await body(await post(handoff,{operation:'create',title:'AI案を確認した引き継ぎ',...result.draft,related_ids:result.source_ids.filter(id=>[issue,page,project].includes(id))}));assert.ok(h.id);
for(const [path,text]of [['','AI HTTP検証'],['/settings','ワークスペースのAI設定'],['/flow','AIに質問'],['/handoffs/new','AIで下書きを作成']]){const r=await fetch(base+`/app/w/${ws}`+path,{headers:headers()});assert.equal(r.status,200);const html=await r.text();assert.match(html,new RegExp(text));assert.ok(!html.includes('fixture-google-key'));}
await body(await ai(question({question:'simulate hallucination',source_ids:[issue]})),502);
await body(await ai(question({question:'simulate invalid',source_ids:[issue]})),502);
await body(await ai(question({question:'simulate 500',source_ids:[issue]})),502);
// Revalidate opt-in and source versions after an in-flight model response.
const pending=ai(question({question:'simulate delay',source_ids:[issue]}));await new Promise(resolve=>setTimeout(resolve,300));
await body(await ai({operation:'preference',enabled:false}));await body(await pending,403);
await body(await ai({operation:'preference',enabled:true,consent:true}));
const updating=ai(question({question:'simulate delay',source_ids:[project]}));await new Promise(resolve=>setTimeout(resolve,300));
await body(await post(work,{operation:'issue_create',title:'受付の追加作業',description:'追加の進捗',project_id:project,status:'open',priority:'normal',labels:[]}));
await body(await updating,409);
const rate=await ai(question({question:'simulate 429',source_ids:[issue]}));assert.equal(rate.status,429);assert.equal(rate.headers.get('retry-after'),'60');assert.ok(!(await rate.text()).includes('private upstream'));
await body(await ai(question({question:'受付',source_ids:[issue]})),429);
await client.auth.signOut();await client.auth.signInWithPassword({email:'user2@test.invalid',password:'Test-password-123'});
await body(await ai(question({source_ids:[issue]})),403);
await body(await fetch(base+`/api/gemini?workspace_id=${ws}`,{headers:headers()}),403);
await client.auth.signOut();await client.auth.stopAutoRefresh();console.log('AI HTTP integration passed: authenticated RAG, links, drafts, opt-in, limits, errors, source isolation; no live Gemini calls.');
