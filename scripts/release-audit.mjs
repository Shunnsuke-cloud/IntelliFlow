// Read-only external inventory. Never runs deploy, link, env pull, db push, or config push.
// CLI JSON may contain secrets: only explicit metadata fields below reach stdout.
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile,rm} from 'node:fs/promises';
const project='intelli-flow',scope='shunnsuke-clouds-projects',ref='pocjzzekfupjqcwdfkan';
function cli(command){
 const result=spawnSync(command,{shell:true,encoding:'utf8',timeout:45000,windowsHide:true,maxBuffer:4*1024*1024});
 if(result.status!==0)return {unavailable:true,reason:/No existing credentials|login|authenticate|credentials/i.test(result.stderr??'')?'authentication_required':'command_failed'};
 try{return JSON.parse(result.stdout);}catch{return {unavailable:true,reason:'unrecognized_output'};}
}
function safeURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.origin+u.pathname:null;}catch{return null;}}
function shape(value,depth=0){if(value===null)return null;if(Array.isArray(value))return {type:'array',length:value.length,item:depth<3&&value.length?shape(value[0],depth+1):undefined};if(typeof value==='object'&&depth<3)return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,shape(v,depth+1)]));return typeof value==='boolean'?value:typeof value;}
if(!process.argv.includes('--auth-only')){
const inspected=cli(`npx --yes vercel project inspect ${project} --scope ${scope} --json --non-interactive`);
console.log(JSON.stringify({section:'vercel_project',data:inspected.unavailable?inspected:{id:inspected.id,name:inspected.name,framework:inspected.framework,rootDirectory:inspected.rootDirectory,buildCommand:inspected.buildCommand?'custom (redacted)':null,outputDirectory:inspected.outputDirectory?'custom (redacted)':null,nodeVersion:inspected.nodeVersion,productionDeployment:inspected.targets?.production?{id:inspected.targets.production.id,url:safeURL('https://'+inspected.targets.production.url),readyState:inspected.targets.production.readyState}:null}}));
const deployment=cli(`npx --yes vercel inspect https://intelli-flow-pi.vercel.app --scope ${scope} --json --non-interactive`);
console.log(JSON.stringify({section:'vercel_deployment',data:deployment.unavailable?deployment:{id:deployment.id,url:safeURL('https://'+deployment.url),target:deployment.target,readyState:deployment.readyState,createdAt:deployment.createdAt,gitCommitSha:deployment.meta?.githubCommitSha,aliases:deployment.alias}}));
for(const target of ['production','preview']){
 const data=cli(`npx --yes vercel env ls ${target} --project ${project} --scope ${scope} --json --non-interactive`);
 const envs=data.envs??data.environmentVariables??data.variables;
 console.log(JSON.stringify({section:'vercel_env_'+target,data:data.unavailable?data:Array.isArray(envs)?envs.map(e=>({name:e.key??e.name,type:e.type,targets:e.target,gitBranch:e.gitBranch??null,...(['SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL'].includes(e.key??e.name)?{url:safeURL(e.value)}:{})})):{fields:Object.keys(data)}}));
}
const backups=cli(`npx supabase backups list --project-ref ${ref} --output json`);
const list=Array.isArray(backups)?backups:backups.backups;
console.log(JSON.stringify({section:'supabase_backups',data:backups.unavailable?backups:Array.isArray(list)?{count:list.length,backups:list.map(b=>({status:b.status,created_at:b.created_at,inserted_at:b.inserted_at})),pitr_enabled:backups.pitr_enabled}:shape(backups)}));
}
const directory=new URL('../.phase8-audit/supabase/',import.meta.url);
await mkdir(directory,{recursive:true});
let created=false;
try{
 await writeFile(new URL('config.toml',directory),`project_id = "IntelliFlow"\n[auth]\nsite_url = "https://intelli-flow-pi.vercel.app"\nadditional_redirect_urls = ["https://intelli-flow-pi.vercel.app/auth/callback"]\n`,{flag:'wx'});created=true;
 const diff=cli(`npx supabase config diff --project-ref ${ref} --workdir .phase8-audit --output-format json`);
 const urls=[];
 function visit(value,path=''){
  if(!value||typeof value!=='object')return;
  if(typeof value.path==='string'&&/site_url|additional_redirect_urls|redirect_urls/.test(value.path)){
   const remote=value.remote??value.remote_value??value.remoteValue;urls.push({field:value.path,remote:Array.isArray(remote)?remote.map(safeURL):safeURL(remote)});
  }
  for(const [key,child]of Object.entries(value)){
   if(/^(site_url|additional_redirect_urls|redirect_urls)$/.test(key))urls.push({field:path+'.'+key,value:Array.isArray(child)?child.map(safeURL):safeURL(child)});
   visit(child,path+'.'+key);
  }
 }
 visit(diff);
 const urlChanges=[];
 function findURLs(value,path='changes') { if(typeof value==='string'&&/^https?:\/\//.test(value)){urlChanges.push({field:path,url:safeURL(value)});return;}if(value&&typeof value==='object')for(const [key,child] of Object.entries(value))findURLs(child,path+'.'+key); }
 findURLs(diff.changes);
 console.log(JSON.stringify({section:'supabase_auth_config',data:diff.unavailable?diff:{urls,urlChanges,changeShape:shape(diff.changes),fields:Object.keys(diff)}}));
}finally{if(created)await rm(new URL('config.toml',directory));}
if(!process.argv.includes('--auth-only'))for(const path of ['/','/login','/app']){
 try{const r=await fetch('https://intelli-flow-pi.vercel.app'+path,{redirect:'manual',signal:AbortSignal.timeout(15000)});const html=await r.text();console.log(JSON.stringify({section:'production_http',path,status:r.status,location:safeURL(r.headers.get('location')),title:html.match(/<title>([^<]{0,120})<\/title>/)?.[1]??null,cacheControl:r.headers.get('cache-control')}));}catch{console.log(JSON.stringify({section:'production_http',path,unavailable:true}));}
}
