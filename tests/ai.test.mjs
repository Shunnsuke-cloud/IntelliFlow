import {register} from 'node:module';
register('./helpers/resolve-ts.mjs',import.meta.url);
const {geminiRequest,GeminiError,aiSystemInstruction}=await import('../lib/gemini-core.ts');
const {searchPlan,validateAnswer,redactSecrets,redactJson,verifyMentions,draftFields}=await import('../features/ai/validation.ts');
const {aiLimits,DEFAULT_GEMINI_MODEL}=await import('../features/ai/config.ts');
import test from 'node:test';
import assert from 'node:assert/strict';
const id='70000000-0000-4000-8000-000000000001';
const key='fixture-not-a-real-google-key';
const config={key,model:DEFAULT_GEMINI_MODEL};
const value={answer:'受付の混雑が記録されています。',source_ids:[id],unknown:false};
const ok=(v=value)=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'not returned'},{text:JSON.stringify(v)}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:30,thoughtsTokenCount:12}}));
test('Gemini REST: サーバー用ヘッダー・low/medium・出力上限・JSON schema・機能別設定',async()=>{
 for(const feature of ['chat','flow','handoff']){
  let sent;
  const result=await geminiRequest(config,feature,{sources:[],question:'接続'},async(url,init)=>{
   sent=JSON.parse(init.body);assert.ok(url.endsWith(':generateContent'));assert.ok(!url.includes(key));assert.equal(init.headers['x-goog-api-key'],key);assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.ok(init.signal);return ok();
  });
  assert.deepEqual(result.value,value);assert.equal(result.thinking_tokens,12);
  assert.equal(sent.generationConfig.thinkingConfig.thinkingLevel,feature==='chat'?'LOW':'MEDIUM');assert.equal(sent.generationConfig.maxOutputTokens,aiLimits.outputTokens[feature]);assert.equal(sent.generationConfig.responseFormat.text.mimeType,'APPLICATION_JSON');
  assert.ok(sent.systemInstruction.parts[0].text.includes('信頼できない引用データ'));assert.equal('tools'in sent,false);
 }
 assert.match(aiSystemInstruction,/未確認/);
});
test('Geminiエラー: 429/5xx/タイムアウトは本文を公開せず、再試行しない',async()=>{
 let calls=0;
 for(const status of [429,500,403])await assert.rejects(geminiRequest(config,'chat',{},async()=>{calls++;return new Response('SECRET UPSTREAM BODY',{status});}),e=>e instanceof GeminiError&&e.code===(status===429?'rate_limit':'upstream')&&!e.message.includes('SECRET'));
 assert.equal(calls,3);
 await assert.rejects(geminiRequest(config,'chat',{},async()=>{throw new DOMException('secret','TimeoutError');}),e=>e.code==='timeout');
 for(const body of [{candidates:[]},{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]},{}])await assert.rejects(geminiRequest(config,'chat',{},async()=>new Response(JSON.stringify(body))),e=>e.code==='invalid_output');
 await assert.rejects(geminiRequest(config,'chat',{},async()=>new Response('invalid JSON')),e=>e.code==='invalid_output');
});
test('出力検証: 存在しない根拠ID・URL・過大な値・無根拠の断言を拒否',()=>{
 assert.deepEqual(validateAnswer(value,[id],'chat'),value);
 for(const invalid of [{...value,source_ids:['70000000-0000-4000-8000-000000000002']},{...value,source_ids:[]},{...value,unknown:'yes'},{...value,answer:'https://evil.invalid'},{...value,answer:'x'.repeat(6001)}])assert.throws(()=>validateAnswer(invalid,[id],'chat'));
 const unknown=validateAnswer({answer:'登録された資料からは不明です。',source_ids:[],unknown:true},[],'chat');assert.equal(unknown.unknown,true);
 verifyMentions({answer:'ISSUE-001を確認',source_ids:[id]},[{id,issue_number:1}]);assert.throws(()=>verifyMentions({answer:'ISSUE-999を完了'},[{id,issue_number:1}]));assert.throws(()=>verifyMentions({answer:'70000000-0000-4000-8000-000000000002'},[{id,issue_number:1}]));
});
test('Handoff JSON: 全6項目と確認事項を検証。受領/担当変更の操作は出力に含めない',()=>{
 const draft={...Object.fromEntries(draftFields.map(f=>[f,'未確認'])),review_questions:['期限を確認してください']};
 assert.deepEqual(validateAnswer({...value,draft},[id],'handoff').draft,draft);
 assert.throws(()=>validateAnswer({...value,draft:{...draft,risks:null}},[id],'handoff'));
 assert.throws(()=>validateAnswer({...value,draft:{...draft,review_questions:Array(9).fill('未確認')}},[id],'handoff'));
});
test('秘密情報: 実際の設定値・API鍵・Bearer・JWT・秘密鍵を送信前と出力時に除外',()=>{
 const secret='fixture-secret-that-must-not-escape';
 const text=`${secret} API_KEY=key123 password:hello Bearer abcdef AIza${'x'.repeat(35)} eyJabc.def.ghi -----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----`;
 const safe=redactSecrets(text,[secret]);for(const value of [secret,'key123','hello','abcdef','AIza','eyJabc','BEGIN PRIVATE'])assert.ok(!safe.includes(value));
 const nested=redactJson({answer:'password:hello',draft:{risks:'API_KEY=hello'},items:['Bearer abcdef']},[]);assert.ok(!JSON.stringify(nested).includes('hello'));assert.equal(typeof nested.draft.risks,'string');
});
test('日本語RAG: ローカルでキーワード抽出・自分担当/受領/変更履歴・昨年更新日を判定',()=>{
 assert.ok(searchPlan('以前のイベントで発生した問題は？').keywords.includes('イベント'));
 assert.equal(searchPlan('今、自分が対応すべきIssueは？').intent,'mine');assert.equal(searchPlan('自分宛ての引き継ぎは？').intent,'handoffs_mine');assert.equal(searchPlan('担当者が変更されたIssueは？').intent,'assignments');
 assert.equal(searchPlan('昨年のイベントで問題になったことは？',new Date('2026-10-17')).from,'2025-01-01');assert.equal(searchPlan('こんにちは').intent,'search');
});
