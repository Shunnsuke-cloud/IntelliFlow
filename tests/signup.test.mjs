import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {startFixture} from './fixtures/supabase.mjs';
test('新規利用者: 登録→確認前拒否→確認→ログイン→WS/Project/Issue/Wiki→Flow関連（隔離Auth/DB）',async()=>{
 const fixture=await startFixture();const client=createClient(fixture.url,'sb_publishable_fixture',{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const email='new-user@test.invalid',password='Test-password-123';
  const registered=await client.auth.signUp({email,password,options:{data:{full_name:'新規利用者'}}});assert.equal(registered.error,null);assert.equal(registered.data.session,null);
  assert.ok((await client.auth.signInWithPassword({email,password})).error);
  await fixture.confirmUser(registered.data.user.id);assert.equal((await client.auth.signInWithPassword({email,password})).error,null);
  async function rpc(name,args){const r=await client.rpc(name,args);assert.equal(r.error,null);return r.data;}
  const ws=(await rpc('workspace_command',{operation:'create',payload:{name:'新規の活動'}})).workspace_id;
  const project=(await rpc('work_item_command',{target_workspace:ws,operation:'project_create',payload:{title:'新規Project',status:'active',member_ids:[]}})).id;
  const issue=(await rpc('work_item_command',{target_workspace:ws,operation:'issue_create',payload:{title:'受付の課題',description:'混雑への対応',status:'open',priority:'normal',project_id:project,labels:[]}})).id;
  const wiki=(await rpc('wiki_command',{target_workspace:ws,operation:'create',payload:{title:'受付の手順',status:'published',category:'手順',body_doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'窓口を分ける'}]}]},related_ids:[issue,project]}})).id;
  const found=await rpc('flow_query',{target_workspace:ws,collection:'search',filters:{q:'混雑'}});assert.ok(found.result_ids.includes(issue));assert.ok(found.nodes.some(n=>n.id===wiki));assert.ok(found.edges.some(e=>e.source_id===wiki&&e.target_id===issue));
 }finally{await client.auth.signOut();await fixture.close();}
});
