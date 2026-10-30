import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
if(existsSync('.env'))process.loadEnvFile('.env');
if(process.env.DATABASE_URL){
 const {Store}=await import('../server/store.ts'),{exportCloud,restoreCloud}=await import('../server/cloud-data.ts');
 const store=new Store(':memory:',{databaseUrl:process.env.DATABASE_URL,encryptionKey:process.env.HOKSE_ENCRYPTION_KEY});
 try{
  await store.ready;
  if(process.argv[2]==='--restore'){
   if(!process.argv[3]||process.argv[4]!=='--empty-target')throw new Error('還原需要備份檔及 --empty-target；僅全新空庫可用。');
   await restoreCloud(store,resolve(process.argv[3]));console.log('Cloud backup restored to empty database.');
  }else{
   const destination=resolve(process.argv[2]??`.data/backups/cloud-${new Date().toISOString().replace(/[:.]/g,'-')}.json.gz`);
   await exportCloud(store,destination);console.log(`Cloud backup saved: ${destination}. Keep the original encryption key separately.`);
  }
 }catch{console.error('Cloud backup/restore failed; check private configuration, destination and empty-target requirements. No credentials printed.');process.exitCode=1}
 finally{await store.close()}
}else{
const source=resolve(process.env.HOKSE_DATABASE??'.data/pilot.sqlite');
if(!existsSync(source))throw new Error('Pilot database does not exist.');
const destination=resolve(process.argv[2]??`.data/backups/${new Date().toISOString().replace(/[:.]/g,'-')}`);
if(existsSync(destination))throw new Error('Backup destination already exists; choose a new folder.');
mkdirSync(destination,{recursive:true});const db=new DatabaseSync(source);try{db.prepare('VACUUM INTO ?').run(join(destination,'pilot.sqlite'))}finally{db.close()}
copyFileSync(join(dirname(source),'secret.key'),join(destination,'secret.key'));
console.log(`Backup saved: ${destination}. Keep database and secret.key together.`);
}
