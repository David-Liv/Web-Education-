import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
const source=resolve(process.env.HOKSE_DATABASE??'.data/pilot.sqlite');
if(!existsSync(source))throw new Error('Pilot database does not exist.');
const destination=resolve(process.argv[2]??`.data/backups/${new Date().toISOString().replace(/[:.]/g,'-')}`);
if(existsSync(destination))throw new Error('Backup destination already exists; choose a new folder.');
mkdirSync(destination,{recursive:true});const db=new DatabaseSync(source);try{db.prepare('VACUUM INTO ?').run(join(destination,'pilot.sqlite'))}finally{db.close()}
copyFileSync(join(dirname(source),'secret.key'),join(destination,'secret.key'));
console.log(`Backup saved: ${destination}. Keep database and secret.key together.`);
