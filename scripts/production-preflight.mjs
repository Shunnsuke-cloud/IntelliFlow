// Read-only: capture CLI JSON in memory, print metadata only. Never expose env values.
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import nextEnv from '@next/env';
function cmd(command){const r=spawnSync(command,{shell:true,encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:8e6});if(r.status!==0)return null;try{return JSON.parse(r.stdout);}catch{return null;}}
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const git=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',windowsHide:true});
const files=[...new Set(git.stdout.split('\0').filter(Boolean))];const key=process.env.GEMINI_API_KEY;
const exact=[],patterns=[];
for(const f of files){if(!existsSync(f))continue;const s=readFileSync(f,'utf8');if(key&&s.includes(key))exact.push(f);if(/AIza[\w-]{30,}|sb_secret_[\w-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(s))patterns.push(f);}
console.log(JSON.stringify({secret_scan:{files:files.length,exact_gemini_key_files:exact,pattern_review_files:patterns,env_files:files.filter(f=>/(^|\/)\.env(?:\.|$)/.test(f))}}));
const migrations=files.filter(f=>/^supabase\/migrations\/.*\.sql$/.test(f)).sort().map(file=>({file,sha256:createHash('sha256').update(readFileSync(file)).digest('hex')}));
console.log(JSON.stringify({migrations}));
if(process.argv.includes('--local-only'))process.exit(exact.length?1:0);
const project=cmd('npx --yes vercel api /v9/projects/intelli-flow --scope shunnsuke-clouds-projects --raw --non-interactive');
console.log(JSON.stringify({vercel_project:project?{id:project.id,name:project.name,framework:project.framework,nodeVersion:project.nodeVersion,git:project.link?{type:project.link.type,org:project.link.org,repo:project.link.repo,productionBranch:project.link.productionBranch}:null,productionBranch:project.productionBranch}:null}));
const deployment=cmd('npx --yes vercel api /v13/deployments/dpl_BLxqwpy2oona4T86E4i5rc8pih12 --scope shunnsuke-clouds-projects --raw --non-interactive');
console.log(JSON.stringify({current_production:deployment?{id:deployment.id,target:deployment.target,readyState:deployment.readyState,commit:deployment.meta?.githubCommitSha,branch:deployment.meta?.githubCommitRef,gitSource:deployment.gitSource?{type:deployment.gitSource.type,ref:deployment.gitSource.ref,sha:deployment.gitSource.sha}:null}:null}));
// The deployed browser config is public by design; inspect only project ref and key type.
try{
 const origin='https://intelli-flow-pi.vercel.app';const html=await(await fetch(origin,{signal:AbortSignal.timeout(15000)})).text();
 const paths=[...new Set([...html.matchAll(/(?:src|href)="([^"]+\.js(?:\?[^"]*)?)"/g)].map(m=>m[1]))].slice(0,30);
 let text='';for(const path of paths){const u=new URL(path,origin);if(u.origin!==origin)continue;const r=await fetch(u,{signal:AbortSignal.timeout(10000)});if(r.ok)text+=(await r.text()).slice(0,3e6);}
 const refs=[...new Set([...text.matchAll(/https:\/\/([a-z]{20})\.supabase\.co/g)].map(m=>m[1]))];
 const keys=[...new Set(text.match(/sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)??[])];
 let checked=0;for(const k of keys){let role=null;try{role=JSON.parse(Buffer.from(k.split('.')[1],'base64url')).role;}catch{}if(!k.startsWith('sb_publishable_')&&role!=='anon')continue;
  const r=await fetch('https://pocjzzekfupjqcwdfkan.supabase.co/auth/v1/settings',{headers:{apikey:k},signal:AbortSignal.timeout(15000)});console.log(JSON.stringify({public_auth_key_check:{type:role==='anon'?'legacy_anon':'publishable',status:r.status}}));checked++;}
 console.log(JSON.stringify({deployed_browser:{scripts:paths.length,supabase_refs:refs,key_candidates_checked:checked,expected_project:refs.length===1&&refs[0]==='pocjzzekfupjqcwdfkan'}}));
}catch{console.log(JSON.stringify({deployed_browser:{unavailable:true}}));}
