import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { startFixture } from './fixtures/supabase.mjs';
test('Auth統合: ログイン失敗・成功、cookie維持、サーバー検証、更新、ログアウト', async () => {
  const fixture=await startFixture();
  const jar=new Map();
  const cookies={getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>{if(value)jar.set(name,value);else jar.delete(name);})};
  const browser=createBrowserClient(fixture.url,'sb_publishable_fixture',{cookies,isSingleton:false,auth:{autoRefreshToken:false}});
  try{
    const invalid=await browser.auth.signInWithPassword({email:'user1@test.invalid',password:'incorrect'});
    assert.ok(invalid.error);assert.equal(invalid.data.session,null);assert.equal(jar.size,0);
    const login=await browser.auth.signInWithPassword({email:'user1@test.invalid',password:'Test-password-123'});
    assert.equal(login.error,null);assert.ok(jar.size>0);
    const server=createServerClient(fixture.url,'sb_publishable_fixture',{cookies});
    const current=await server.auth.getUser();assert.equal(current.data.user?.email,'user1@test.invalid');
    const refreshed=await server.auth.refreshSession();assert.equal(refreshed.error,null);
    const restored=createServerClient(fixture.url,'sb_publishable_fixture',{cookies});
    assert.equal((await restored.auth.getUser()).data.user?.id,current.data.user.id);
    const invalidBearer=createClient(fixture.url,'sb_publishable_fixture',{global:{headers:{Authorization:'Bearer invalid'}},auth:{persistSession:false,autoRefreshToken:false}});
    assert.ok((await invalidBearer.auth.getUser()).error);
    assert.equal((await browser.auth.signOut()).error,null);assert.equal(jar.size,0);
    const signedOut=createServerClient(fixture.url,'sb_publishable_fixture',{cookies});assert.equal((await signedOut.auth.getUser()).data.user,null);
  }finally{await browser.auth.stopAutoRefresh();await fixture.close();}
});
