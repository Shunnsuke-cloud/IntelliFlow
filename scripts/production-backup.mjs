// Read-only export of the existing Supabase project. Never restores or writes to production.
// CLI-generated credentials stay in memory and are never printed or persisted.
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const ref='pocjzzekfupjqcwdfkan',bin='C:/Program Files/PostgreSQL/18/bin';
const generated=spawnSync('npx supabase db dump --dry-run --schema public,auth,storage --project-ref '+ref,{shell:true,encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:4e6});
if(generated.status!==0)throw new Error('CLI read-only connection preparation failed (details withheld).');
const connection={};
for(const line of generated.stdout.split(/\r?\n/)){
 const match=line.match(/^\s*export (PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)=(.*?)\s*;?\s*$/);if(!match)continue;
 let value=match[2];if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);connection[match[1]]=value;
}
if(process.argv.includes('--inspect')){console.log(JSON.stringify({ref,connection_fields:Object.keys(connection),all_fields_available:['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'].every(k=>connection[k])}));process.exit(0);}
if(!['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'].every(k=>connection[k]))throw new Error('Unsupported CLI connection format; no backup attempted.');
if(!connection.PGUSER.includes(ref)&&!connection.PGHOST.includes(ref)&&!/pooler\.supabase\.com$/.test(connection.PGHOST))throw new Error('Unexpected connection destination.');
const folder=resolve('.release-private');mkdirSync(folder,{recursive:true});
const protect=`$ErrorActionPreference='Stop';$d=[IO.Path]::GetFullPath('.release-private');$a=Get-Acl -LiteralPath $d;$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;if($a.AreAccessRulesProtected -and $a.Access.Count -eq 1 -and $a.Access[0].IdentityReference.Translate([Security.Principal.SecurityIdentifier]) -eq $s -and $a.Access[0].FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl){exit 0};$a.SetAccessRuleProtection($true,$false);$r=New-Object Security.AccessControl.FileSystemAccessRule($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r);Set-Acl -LiteralPath $d -AclObject $a`;
const acl=spawnSync('powershell',['-NoProfile','-NonInteractive','-Command',protect],{windowsHide:true,encoding:'utf8'});if(acl.status!==0)throw new Error('Cannot protect local backup directory; export cancelled.');
const id=new Date().toISOString().replace(/[:.]/g,'-'),file=join(folder,`${ref}-${id}.dump`);
const inherited=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/^PG/i.test(name)));
const env={...inherited,...connection,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'15',PGOPTIONS:'-c default_transaction_read_only=on'};
const dump=spawnSync(join(bin,'pg_dump.exe'),['--role=postgres','--format=custom','--schema=public','--schema=auth','--schema=storage','--lock-wait-timeout=5s','--file='+file],{env,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4e6});
if(dump.status!==0){const message=dump.stderr??'';const reason=/permission denied/i.test(message)?'permission_denied':/password authentication failed/i.test(message)?'authentication_failed':/could not translate|could not connect|connection.*failed/i.test(message)?'connection_failed':/read.only/i.test(message)?'read_only_conflict':/ssl|certificate/i.test(message)?'tls_failed':'pg_dump_failed';console.log(JSON.stringify({ref,backup_success:false,reason,partial_file_must_not_be_used:true}));process.exit(1);}
const listing=spawnSync(join(bin,'pg_restore.exe'),['--list',file],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:4e6});
const manifest={ref,created_at:new Date().toISOString(),file,bytes:statSync(file).size,sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),archive_readable:listing.status===0,schemas:['public','auth','storage'],scope:'Database schema/data only; excludes Storage object bytes, passwords of cluster roles and dashboard/provider settings',restored:false};
writeFileSync(file+'.manifest.json',JSON.stringify(manifest,null,2),{flag:'wx'});
console.log(JSON.stringify(manifest));
