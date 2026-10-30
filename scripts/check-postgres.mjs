import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
if(Number(process.versions.node.split('.')[0])<24)throw new Error('PostgreSQL checks require Node 24.12+; use the bundled runtime, not system Node 20.');

// This command owns exactly one disposable, labelled container and no volumes.
// It never points a destructive test at a configured cloud/student database.
const name='hokse-pg-check-'+randomBytes(5).toString('hex'),password=randomBytes(24).toString('hex');
const envFile=resolve('.data',name+'.env');mkdirSync(resolve('.data'),{recursive:true});
writeFileSync(envFile,`POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=hokse_check_suite\n`,{mode:0o600});
function docker(args,allowedFailure=false){const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true});if(r.status&&!allowedFailure)throw new Error('Docker check operation failed: '+r.stderr.replaceAll(password,'[redacted]'));return r.stdout.trim()}
let started=false;
try{
 docker(['run','--detach','--name',name,'--label','com.hokse.fixture=postgres','--env-file',envFile,'--publish','127.0.0.1::5432','--tmpfs','/var/lib/postgresql/data','postgres:17-alpine']);started=true;
 let ready=false;for(let i=0;i<45;i++){if(docker(['exec',name,'pg_isready','-U','postgres','-d','hokse_check_suite'],true).includes('accepting connections')){ready=true;break}await new Promise(r=>setTimeout(r,500))}if(!ready)throw new Error('Temporary PostgreSQL did not become ready.');
 const port=docker(['port',name,'5432/tcp']).split(':').at(-1),encryptionKey=randomBytes(32).toString('base64');
 docker(['exec',name,'createdb','-U','postgres','hokse_check_race']);
 docker(['exec',name,'createdb','-U','postgres','hokse_check_restore']);
 for(const [database,file] of [['hokse_check_suite','server/pilot.check.ts'],['hokse_check_store','server/postgres.check.ts']]){
  if(database!=='hokse_check_suite')docker(['exec',name,'createdb','-U','postgres',database]);
  const result=spawnSync(process.execPath,['--test',file],{stdio:'inherit',windowsHide:true,env:{...process.env,HOKSE_CHECK_DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/${database}`,HOKSE_CHECK_ENCRYPTION_KEY:encryptionKey}});
  if(result.status)throw new Error(`PostgreSQL checks failed: ${file}`);
 }
 console.log('PostgreSQL integration checks passed against a real isolated database.');
}finally{
 if(started&&docker(['inspect','--format','{{index .Config.Labels "com.hokse.fixture"}}',name],true)==='postgres')docker(['rm','--force',name],true);
 unlinkSync(envFile);
}
