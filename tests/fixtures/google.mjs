// Explicit test-process preload only. Production code has no configurable Gemini endpoint.
// Refuse to load unless all Supabase endpoints and Google credentials are fixtures.
if(process.env.GEMINI_API_KEY!=='fixture-google-key-not-real' || process.env.SUPABASE_URL!=='http://127.0.0.1:4400' || process.env.NEXT_PUBLIC_SUPABASE_URL!=='http://127.0.0.1:4400')throw new Error('Google fixture requires isolated test credentials');
const realFetch=globalThis.fetch;
globalThis.fetch=async function(input,init){
 const url=String(input instanceof Request?input.url:input);
 if(!url.startsWith('https://generativelanguage.googleapis.com/'))return realFetch(input,init);
 const request=JSON.parse(init.body);const payload=JSON.parse(request.contents[0].parts[0].text);
 if(init.headers['x-goog-api-key']!==process.env.GEMINI_API_KEY)throw new Error('Fixture key mismatch');
 if(payload.question.includes('simulate 429'))return new Response('private upstream error',{status:429});
 if(payload.question.includes('simulate 500'))return new Response('private upstream error',{status:500});
 if(payload.question.includes('simulate delay'))await new Promise(resolve=>setTimeout(resolve,600));
 if(payload.question.includes('simulate invalid'))return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'not json'}]}}]}));
 let answer={answer:'資料に記録された受付の課題を確認してください。担当者・期限が不明な部分は未確認です。',source_ids:payload.sources.map(s=>s.id),unknown:false};
 if(payload.question.includes('simulate hallucination'))answer.source_ids=['00000000-0000-4000-8000-000000000001'];
 if(payload.feature==='handoff')answer.draft={summary:'受付を次の担当者へ引き継ぎます。',current_state:'資料の状態を確認してください。',completed_work:'未確認',pending_work:'受付の改善',risks:'期限は未確認',next_actions:'提案：受付の担当者と期限を確認してください。',review_questions:['担当者と期限は未確認です。']};
 return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(answer)}]}}],usageMetadata:{promptTokenCount:300,candidatesTokenCount:120,thoughtsTokenCount:25}}),{headers:{'Content-Type':'application/json'}});
};
