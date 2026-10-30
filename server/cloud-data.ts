import { gzipSync, gunzipSync } from 'node:zlib';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { Store } from './store.ts';

const columns={
  migrations:['version'],users:['id','username','name','role','password'],
  students:['user_id','revision','body'],sessions:['token','user_id','expires'],
  packs:['id','version','body'],previews:['id','user_id','body'],
  files:['id','user_id','name','type','data'],settings:['id','body'],
} as const;
type Table=keyof typeof columns;
interface Archive {format:'hokse-cloud-v1';createdAt:string;keyFingerprint:string;tables:Record<Table,unknown[][]>}
const fingerprint=(store:Store)=>createHash('sha256').update(store.key).digest('hex');

export async function exportCloud(store:Store,destination:string){
  if(store.db.kind!=='postgres')throw new Error('此命令只適用於 PostgreSQL。');
  const archive=await store.transaction(async()=>{
    await store.db.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables={} as Archive['tables'];
    for(const table of Object.keys(columns) as Table[]){
      const rows=await store.db.prepare(`SELECT ${columns[table].join(',')} FROM ${table}`).all();
      tables[table]=rows.map(row=>columns[table].map(column=>table==='files'&&column==='data'?Buffer.from(row[column]).toString('base64'):row[column]));
    }
    return {format:'hokse-cloud-v1' as const,createdAt:new Date().toISOString(),keyFingerprint:fingerprint(store),tables};
  });
  mkdirSync(dirname(destination),{recursive:true});
  writeFileSync(destination,gzipSync(JSON.stringify(archive)),{flag:'wx',mode:0o600});
  return Object.fromEntries(Object.entries(archive.tables).map(([table,rows])=>[table,rows.length]));
}

// Restore to a separate empty database only. Never overwrites live students.
export async function restoreCloud(store:Store,source:string){
  if(store.db.kind!=='postgres')throw new Error('此命令只適用於 PostgreSQL。');
  const archive=JSON.parse(gunzipSync(readFileSync(source),{maxOutputLength:256*1024*1024}).toString()) as Archive;
  if(archive.format!=='hokse-cloud-v1'||archive.keyFingerprint!==fingerprint(store))throw new Error('備份版本或加密密鑰不匹配。');
  for(const table of Object.keys(columns) as Table[])if(!Array.isArray(archive.tables?.[table])||archive.tables[table].some(row=>!Array.isArray(row)||row.length!==columns[table].length))throw new Error('備份資料結構無效。');
  return store.transaction(async()=>{
    await store.db.exec('LOCK TABLE users,students,sessions,packs,previews,files,settings,migrations IN ACCESS EXCLUSIVE MODE');
    if(await store.userCount()!==0)throw new Error('目標已有帳戶，拒絕覆寫；請改用全新的空資料庫。');
    for(const table of ['sessions','previews','files','students','users','packs','settings','migrations'])await store.db.exec(`DELETE FROM ${table}`);
    for(const table of Object.keys(columns) as Table[]){
      for(const row of archive.tables[table]){
        const values=row.map((value,index)=>table==='files'&&columns[table][index]==='data'?Buffer.from(String(value),'base64'):value);
        await store.db.prepare(`INSERT INTO ${table} (${columns[table].join(',')}) VALUES (${values.map(()=>'?').join(',')})`).run(...values);
      }
    }
    const check=await store.db.prepare("SELECT body FROM settings WHERE id='encryption-check'").get();
    if(!check||store.decrypt(check.body)!=='hokse-key-v1')throw new Error('還原密鑰檢查失敗。');
    return {users:await store.userCount()};
  });
}
