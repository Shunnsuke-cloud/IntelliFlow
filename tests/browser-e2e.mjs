// Run with temporary Playwright and installed Chrome; only isolated localhost services.
// Start a fresh fixture first: ai-http intentionally leaves a 429 cooldown and disabled preferences.
import assert from 'node:assert/strict';
import {existsSync, mkdirSync} from 'node:fs';
import {delimiter, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const candidate=process.env.PATH.split(delimiter).map(p=>resolve(p,'../playwright/index.mjs')).find(existsSync);
if(!candidate)throw new Error('Run: npx --yes --package=playwright -c "node tests/browser-e2e.mjs"');
const {chromium}=await import(pathToFileURL(candidate).href);
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const base='http://localhost:4100'; const errors=[]; mkdirSync('test-results',{recursive:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route('**/*',route=>{const u=new URL(route.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)&&['4100','4400'].includes(u.port)?route.continue():route.abort();});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));let generations=0;
page.on('request',r=>{if(r.url().endsWith('/api/gemini')&&r.method()==='POST'&&r.postDataJSON()?.operation==='generate')generations++;});
page.setDefaultTimeout(30000);
async function post(path,data){const r=await context.request.post(base+path,{headers:{origin:base},data});assert.equal(r.status(),200,await r.text());return r.json();}
async function login(email){await page.goto(base+'/login');const f=page.locator('.auth-form');await f.getByLabel('メールアドレス').fill(email);await f.getByLabel('パスワード',{exact:true}).fill('Test-password-123');await f.getByRole('button',{name:'ログイン',exact:true}).click();await page.waitForURL('**/app');}
try{
 await page.goto(base+'/app');await page.waitForURL('**/login**');
 await login('user1@test.invalid');
 await page.getByRole('button',{name:'ワークスペースを作成',exact:true}).click();
 let dialog=page.getByRole('dialog');await dialog.getByLabel('名前',{exact:true}).fill('ブラウザ検証');await dialog.getByRole('button',{name:'保存する',exact:true}).click();
 await page.waitForURL(/\/app\/w\/[\w-]+$/);const ws=page.url().split('/').at(-1);const home=`/app/w/${ws}`;
 await page.getByRole('button',{name:'ダークモード',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.getByRole('button',{name:'ライトモード',exact:true}).click();
 const work=`/api/workspaces/${ws}/work-items`;
 const project=(await post(work,{operation:'project_create',title:'受付Project',description:'隔離ブラウザ検証',status:'active',member_ids:[]})).id;
 const issue=(await post(work,{operation:'issue_create',title:'受付の問題',description:'受付で混雑した。',status:'open',priority:'high',labels:['受付'],project_id:project})).id;
 const wiki=(await post(`/api/workspaces/${ws}/wiki`,{operation:'create',title:'受付の手順',body_doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'受付を二列に分ける。'}]}]},status:'published',category:'手順',related_ids:[issue,project]})).id;
 for(const path of ['','/issues','/projects','/wiki','/flow','/handoffs','/settings']){await page.goto(base+home+path);await page.locator('#workspace-content h1').waitFor();assert.equal(await page.locator('.if-error').count(),0,`${path}: ${await page.locator('.if-error').allTextContents()}`);}
 await page.goto(base+home+'/flow');await page.getByLabel('過去の情報を検索').fill('受付');await page.getByRole('button',{name:'検索する',exact:true}).click();await page.locator('.flow-result').first().waitFor();
 assert.equal(generations,0,'Normal navigation/search must not generate AI');
 await post('/api/gemini',{operation:'settings',workspace_id:ws,enabled:true,user_limit:100,workspace_limit:100,consent:true});
 await post('/api/gemini',{operation:'preference',workspace_id:ws,enabled:true,consent:true});
 await page.getByRole('button',{name:'AIアシスタントを開く'}).click();dialog=page.getByRole('dialog');
 await dialog.locator('textarea').fill('受付の問題は？');await dialog.getByRole('checkbox').check();await dialog.locator('textarea').press('Shift+Enter');assert.match(await dialog.locator('textarea').inputValue(),/\n$/);await dialog.locator('textarea').press('Enter');await dialog.locator('.ai-answer').waitFor();assert.ok(await dialog.locator('.ai-sources a').count()>0);await dialog.getByRole('button',{name:'閉じる',exact:true}).click();
 await page.getByRole('button',{name:/AIに質問/}).click();dialog=page.getByRole('dialog');await dialog.locator('textarea').fill('受付の問題は？');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'AIに送信',exact:true}).click();await dialog.locator('.ai-answer').waitFor();await dialog.getByRole('button',{name:'根拠をマップに表示'}).click();
 await page.goto(base+home+`/handoffs/new?source_id=${issue}`);const draft=page.getByRole('region',{name:'引き継ぎのAI支援'});await draft.getByLabel('受付の問題',{exact:true}).check();await draft.getByRole('checkbox').last().check();await draft.getByRole('button',{name:'選択した資料からAIで下書きを作成'}).click();await draft.getByRole('heading',{name:'AIの提案 · まだ保存されていません'}).waitFor();await draft.getByLabel('本文6項目の置き換えと、根拠資料のリンクの追加を確認しました').check();await draft.getByRole('button',{name:'確認してフォームに反映'}).click();assert.ok((await page.locator('textarea[name=summary]').inputValue()).length>0);await page.getByRole('button',{name:'下書きを保存する',exact:true}).click();await page.waitForURL(/\/handoffs\/[\w-]+$/);
 assert.equal(generations,3);await page.screenshot({path:'test-results/handoff-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'メニュー',exact:true}).click();await page.locator('.if-sidebar nav').getByRole('link',{name:/Wiki/}).click();await page.waitForURL('**/wiki');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'test-results/wiki-mobile.png',fullPage:true});
 for(const path of ['','/issues','/projects','/flow','/handoffs','/settings']){await page.goto(base+home+path);await page.locator('#workspace-content h1').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Mobile overflow: ${path}`);}
 // Isolated UI regression for the changed legacy editor; transport is an explicit in-memory fixture.
 let notes=[],failSave=false;await page.route('**/api/notes',async route=>{const r=route.request(),body=r.postDataJSON();if(r.method()==='GET')return route.fulfill({json:notes});if(failSave)return route.fulfill({status:503,json:{error:'Test failure'}});if(r.method()==='POST'){const note={id:crypto.randomUUID(),input:body.input,savedAt:'2026-10-18'};notes.unshift(note);return route.fulfill({status:201,json:note});}throw new Error('Unexpected legacy test operation');});
 await page.goto(base+'/app/notes');await page.locator('#note-input').fill('古い整理対象');await page.getByRole('button',{name:'整理の候補を見る'}).click();await page.locator('#note-input').fill('編集後の保存内容');await page.getByRole('button',{name:'保存する',exact:true}).click();await page.getByText('ノートを保存しました。',{exact:true}).waitFor();assert.equal(notes[0].input,'編集後の保存内容');await page.getByRole('button',{name:'保存する',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.saved-card').length===2);failSave=true;await page.getByRole('button',{name:'保存する',exact:true}).click();await page.getByRole('alert').filter({hasText:'保存できませんでした'}).waitFor();assert.equal(notes.length,2);
 await page.getByText('ユーザーメニュー',{exact:true}).click();await page.getByRole('button',{name:'ログアウト',exact:true}).click();await page.waitForURL('**/login');
 assert.deepEqual(errors,[]);console.log('Browser E2E passed: login/logout, workspace creation, seven screens, theme/mobile navigation, Flow search, AI chat/Flow, reviewed Handoff draft/save; synthetic sources only.');
}finally{await browser.close();}
