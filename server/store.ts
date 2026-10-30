import { SqliteDatabase, PostgresDatabase } from './database.ts';
import type { Database as StorageDatabase } from './database.ts';
import { randomBytes, scryptSync, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Database, Quiz } from '../src/types.ts';
import type { ContentPack, Cycle, ErrorCase, Identity, PilotEvidence, Role, VersionedPreview } from '../src/pilot-types.ts';
import { initialPacks } from './content.ts';
import { hkToday } from '../src/domain.ts';

export interface PrivateQuiz extends Quiz { snapshot: ContentPack['questions']; blueprints?:Pick<ContentPack,'id'|'version'|'topicId'|'skills'>[]; contentVersions:string[]; purpose:'formal'|'practice'; manualContinue?:boolean; response?:unknown; independence?:Record<string,boolean> }
export interface StudentState extends Omit<Database,'quizzes'|'evidence'> {
  revision:number; quizzes:PrivateQuiz[]; evidence:PilotEvidence[]; assists:{questionId:string;at:string;kind:string;quizId:string}[];
  errors:ErrorCase[]; cycles:Cycle[]; appliedPreviews:string[];
  reorders?:{taskId:string;before:string;after:string;at:string}[];
}
export interface ModelConfig { id:string; name:string; baseUrl:string; secret:string; model:string; protocol:'openai-chat'|'openai-responses'; enabled:boolean; tested?:{at:string;model:string;ok:boolean}; models?:string[] }
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function passwordHash(password:string){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`}
export function passwordMatches(password:string,hash:string){const [salt,value]=hash.split(':');const a=scryptSync(password,salt,64),b=Buffer.from(value,'hex');return a.length===b.length&&timingSafeEqual(a,b)}
export function newState(name:string):StudentState{return {version:2,revision:0,profile:{name,year:2028,teachingLanguage:'zh-HK',subjects:['chi','eng','maths','chem','csd'],mathModule:'none',chemistryElectives:[],grades:{},targetGrades:{},gradeSource:'尚未提供整科成績',primaryProgramme:null,backupProgrammes:[],dailyMinutes:[30,30,30,30,30,60,60],availability:['18:00','18:00','18:00','18:00','18:00','10:00','10:00'],reviewPercent:20,date:hkToday(),demo:false},events:[],evidence:[],reviews:[],reviewSessions:[],tasks:[],weeks:[],chats:[],quizzes:[],wrong:[],notes:[],bookmarks:[],resourceClicks:{},attachments:[],notificationsRead:false,assists:[],errors:[],cycles:[],appliedPreviews:[]}}
export class Store {
  db:StorageDatabase;key:Buffer;ready:Promise<void>;
  constructor(path:string,options:{databaseUrl?:string;encryptionKey?:string}={}){
    if(options.databaseUrl){
      if(!options.encryptionKey||! /^[A-Za-z0-9+/]{43}=$/.test(options.encryptionKey)||Buffer.from(options.encryptionKey,'base64').length!==32)throw new Error('雲端模式必須提供固定的 HOKSE_ENCRYPTION_KEY（32 bytes Base64），不能使用臨時本機密鑰。');
      this.key=Buffer.from(options.encryptionKey,'base64');this.db=new PostgresDatabase(options.databaseUrl);
    }else{
      if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
      this.db=new SqliteDatabase(path);
      const keyPath=path===':memory:'?null:join(dirname(path),'secret.key');
      this.key=keyPath&&existsSync(keyPath)?readFileSync(keyPath):randomBytes(32);
      if(keyPath&&!existsSync(keyPath))writeFileSync(keyPath,this.key,{mode:0o600});
    }
    this.ready=this.initialize();
  }
  private async initialize(){
    if(this.db.kind==='postgres')await this.db.exec('CREATE SCHEMA IF NOT EXISTS hokse; REVOKE ALL ON SCHEMA hokse FROM PUBLIC;');
    await this.db.exec(`CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY); INSERT INTO migrations VALUES(1) ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires BIGINT NOT NULL);
      CREATE TABLE IF NOT EXISTS students(user_id TEXT PRIMARY KEY REFERENCES users(id),revision INTEGER NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS packs(id TEXT NOT NULL,version INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,version));
      CREATE TABLE IF NOT EXISTS previews(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),name TEXT,type TEXT,data ${this.db.kind==='postgres'?'BYTEA':'BLOB'} NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY,body TEXT NOT NULL);`);
    const legacyModel=await this.db.prepare("SELECT body FROM settings WHERE id='model'").get();
    if(legacyModel)try{this.decrypt(JSON.parse(legacyModel.body).secret)}catch{throw new Error('資料庫密鑰不匹配，拒絕啟動；請恢復原有 HOKSE_ENCRYPTION_KEY／secret.key。')}
    await this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT DO NOTHING').run('encryption-check',this.seal('hokse-key-v1',randomBytes(12)));
    const check=await this.db.prepare('SELECT body FROM settings WHERE id=?').get('encryption-check');
    try{if(this.decrypt(check!.body)!=='hokse-key-v1')throw new Error()}catch{throw new Error('資料庫密鑰不匹配，拒絕啟動；請恢復原有 HOKSE_ENCRYPTION_KEY／secret.key。')}
    for(const pack of initialPacks()){
      await this.db.prepare('INSERT INTO packs VALUES(?,?,?) ON CONFLICT DO NOTHING').run(pack.id,pack.version,JSON.stringify(pack));
      // Before first setup only: keep machine-authored initial drafts current. Never replace reviewed or user-created versions.
      if(await this.userCount()===0){const old=(await this.packs()).find(p=>p.id===pack.id&&p.version===pack.version);if(old?.status==='draft'&&!old.reviews.length)await this.putPack(pack)}
    }
  }
  async close(){await this.ready.catch(()=>{});await this.db.close()}
  transaction<T>(fn:()=>T|Promise<T>):Promise<T>{return this.db.transaction(fn)}
  contentTransaction<T>(fn:()=>T|Promise<T>):Promise<T>{return this.transaction(async()=>{if(this.db.kind==='postgres')await this.db.exec('SELECT pg_advisory_xact_lock(1784236903)');return fn()})}
  async userCount(){return Number((await this.db.prepare('SELECT count(*) as n FROM users').get())!.n)}
  async createUser(username:string,password:string,name:string,role:Role,firstUserOnly=false):Promise<Identity>{
    const id=crypto.randomUUID();const hash=passwordHash(password);
    return this.transaction(async()=>{if(firstUserOnly&&this.db.kind==='postgres')await this.db.exec("SELECT pg_advisory_xact_lock(1784236901)");if(firstUserOnly&&await this.userCount()!==0)throw new Error('已有帳戶，拒絕重新初始化或覆寫管理員。');await this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,username.toLowerCase(),name,role,hash);await this.db.prepare('INSERT INTO students VALUES(?,?,?)').run(id,0,JSON.stringify(newState(name)));return {id,username:username.toLowerCase(),name,role}});
  }
  async authenticate(username:string,password:string):Promise<Identity|null>{const row=await this.db.prepare('SELECT * FROM users WHERE username=?').get(username.toLowerCase());if(!row||!passwordMatches(password,row.password))return null;return {id:row.id,username:row.username,name:row.name,role:row.role}}
  async session(user:Identity){const token=randomBytes(32).toString('hex');await this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());await this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),user.id,Date.now()+7*86400000);return token}
  async identity(token:string):Promise<Identity|null>{const row=await this.db.prepare('SELECT u.id,u.username,u.name,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(digest(token),Date.now());return row as Identity??null}
  async logout(token:string){await this.db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token))}
  async state(userId:string):Promise<StudentState>{const lock=this.db.kind==='postgres'&&this.db.inTransaction()?' FOR UPDATE':'';const row=await this.db.prepare('SELECT body FROM students WHERE user_id=?'+lock).get(userId);if(!row)throw new Error('Student missing');const data=JSON.parse(row.body);data.profile.date=hkToday();return data}
  async save(userId:string,state:StudentState){const expected=state.revision,next=expected+1;const result=await this.db.prepare('UPDATE students SET body=?,revision=? WHERE user_id=? AND revision=?').run(JSON.stringify({...state,revision:next}),next,userId,expected);if(result.changes!==1)throw Object.assign(new Error('資料版本衝突，請重新載入'),{status:409,code:'STALE_STATE'});state.revision=next}
  async packs(publishedOnly=false):Promise<ContentPack[]>{const rows=await this.db.prepare('SELECT body FROM packs ORDER BY id,version DESC').all();return rows.map(r=>JSON.parse(r.body) as ContentPack).filter(p=>!publishedOnly||p.status==='published')}
  async latestPacks(publishedOnly=true){const seen=new Set<string>();return (await this.packs(publishedOnly)).filter(p=>{if(seen.has(p.id))return false;seen.add(p.id);return true})}
  async putPack(pack:ContentPack){await this.db.prepare('INSERT INTO packs VALUES(?,?,?) ON CONFLICT(id,version) DO UPDATE SET body=excluded.body').run(pack.id,pack.version,JSON.stringify(pack))}
  async putPreview(userId:string,preview:VersionedPreview){await this.db.prepare('INSERT INTO previews VALUES(?,?,?)').run(preview.previewId,userId,JSON.stringify(preview))}
  async preview(userId:string,id:string):Promise<VersionedPreview|null>{const row=await this.db.prepare('SELECT body FROM previews WHERE id=? AND user_id=?').get(id,userId);return row?JSON.parse(row.body):null}
  private seal(value:string,iv:Buffer){const c=createCipheriv('aes-256-gcm',this.key,iv);const encrypted=Buffer.concat([c.update(value,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),encrypted]).toString('base64')}
  decrypt(value:string){const buf=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',this.key,buf.subarray(0,12));d.setAuthTag(buf.subarray(12,28));return Buffer.concat([d.update(buf.subarray(28)),d.final()]).toString('utf8')}
  async model():Promise<ModelConfig|null>{const row=await this.db.prepare("SELECT body FROM settings WHERE id='model'").get();if(!row)return null;const value=JSON.parse(row.body);value.secret=this.decrypt(value.secret);return value}
  async putModel(config:ModelConfig){const value={...config,secret:this.seal(config.secret,randomBytes(12))};await this.db.prepare("INSERT INTO settings VALUES('model',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(JSON.stringify(value))}
  async putFile(id:string,userId:string,name:string,type:string,bytes:Buffer){
    return this.transaction(async()=>{
    if(this.db.kind==='postgres'){
      await this.db.exec('SELECT pg_advisory_xact_lock(1784236902)');
      const used=Number((await this.db.prepare('SELECT COALESCE(SUM(LENGTH(data)),0) AS n FROM files').get())!.n);
      if(used+bytes.length>100*1024*1024)throw Object.assign(new Error('免費試用附件容量已滿，請聯絡維護者；本次未上傳。'),{status:413,code:'STORAGE_LIMIT'});
    }
    await this.db.prepare('INSERT INTO files VALUES(?,?,?,?,?)').run(id,userId,name,type,bytes);
    });
  }
}
