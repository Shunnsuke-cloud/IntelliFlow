// Explicit live opt-in. Synthetic sources only; no Supabase reads or environment writes.
// Run with --experimental-strip-types --import ./tests/helpers/register-ts.mjs.
import nextEnv from '@next/env';
import {geminiRequest} from '../lib/gemini-core.ts';
import {validateAnswer,verifyMentions} from '../features/ai/validation.ts';
import {DEFAULT_GEMINI_MODEL} from '../features/ai/config.ts';
if(!process.argv.includes('--free-tier-confirmed'))throw new Error('Requires confirmed unbilled Free tier; do not run on a billed project.');
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const env=process.env;
const key=env.GEMINI_API_KEY,model=env.GEMINI_MODEL||DEFAULT_GEMINI_MODEL;
if(!/^[\x21-\x7e]{20,256}$/.test(key??'')||model!==DEFAULT_GEMINI_MODEL)throw new Error('Gemini configuration format invalid (values withheld).');
try{
 const meta=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`,{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(25000)});
 console.log(JSON.stringify({check:'models.get',model,status:meta.status}));if(!meta.ok)process.exit(1);
 const data=await meta.json();if(!data.supportedGenerationMethods?.includes('generateContent'))throw new Error('generateContent unavailable');
 const id='90000000-0000-4000-8000-000000000001';const sources=[{id,kind:'issue',title:'架空の受付確認',excerpt:'架空テスト。受付確認は未着手。担当者と期限は未確認。',issue_number:1}];
 for(const feature of ['chat','flow','handoff']){
  const result=await geminiRequest({key,model},feature,{feature,question:'この架空の受付確認の状態と不明な事項を短く整理してください。',sources});
  const valid=validateAnswer(result.value,[id],feature);verifyMentions(valid,sources);
  console.log(JSON.stringify({check:'generateContent',feature,model,schema_valid:true,source_ids_valid:true,input_tokens:result.input_tokens,output_tokens:result.output_tokens,thinking_tokens:result.thinking_tokens}));
 }
}catch(e){console.log(JSON.stringify({check:'failed',code:['rate_limit','timeout','upstream','invalid_output'].includes(e?.code)?e.code:'connection_or_validation',status:Number.isInteger(e?.status)?e.status:null}));process.exitCode=1;}
