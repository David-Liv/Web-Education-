import { DatabaseSync } from 'node:sqlite';
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
  db:DatabaseSync;key:Buffer;
  constructor(path:string){
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO migrations VALUES(1);
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS students(user_id TEXT PRIMARY KEY REFERENCES users(id),revision INTEGER NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS packs(id TEXT NOT NULL,version INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,version));
      CREATE TABLE IF NOT EXISTS previews(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),name TEXT,type TEXT,data BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY,body TEXT NOT NULL);`);
    const keyPath=path===':memory:'?null:join(dirname(path),'secret.key');
    this.key=keyPath&&existsSync(keyPath)?readFileSync(keyPath):randomBytes(32);
    if(keyPath&&!existsSync(keyPath))writeFileSync(keyPath,this.key,{mode:0o600});
    for(const pack of initialPacks()){
      this.db.prepare('INSERT OR IGNORE INTO packs VALUES(?,?,?)').run(pack.id,pack.version,JSON.stringify(pack));
      // Before first setup only: keep machine-authored initial drafts current. Never replace reviewed or user-created versions.
      if(this.userCount()===0){const old=this.packs().find(p=>p.id===pack.id&&p.version===pack.version);if(old?.status==='draft'&&!old.reviews.length)this.putPack(pack)}
    }
  }
  close(){this.db.close()}
  transaction<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result}catch(e){this.db.exec('ROLLBACK');throw e}}
  userCount(){return Number((this.db.prepare('SELECT count(*) as n FROM users').get() as any).n)}
  createUser(username:string,password:string,name:string,role:Role):Identity{
    const id=crypto.randomUUID();const hash=passwordHash(password);
    return this.transaction(()=>{this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,username.toLowerCase(),name,role,hash);this.db.prepare('INSERT INTO students VALUES(?,?,?)').run(id,0,JSON.stringify(newState(name)));return {id,username:username.toLowerCase(),name,role}});
  }
  authenticate(username:string,password:string):Identity|null{const row=this.db.prepare('SELECT * FROM users WHERE username=?').get(username.toLowerCase()) as any;if(!row||!passwordMatches(password,row.password))return null;return {id:row.id,username:row.username,name:row.name,role:row.role}}
  session(user:Identity){const token=randomBytes(32).toString('hex');this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),user.id,Date.now()+7*86400000);return token}
  identity(token:string):Identity|null{const row=this.db.prepare('SELECT u.id,u.username,u.name,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(digest(token),Date.now()) as any;return row??null}
  logout(token:string){this.db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token))}
  state(userId:string):StudentState{const row=this.db.prepare('SELECT body FROM students WHERE user_id=?').get(userId) as any;if(!row)throw new Error('Student missing');const data=JSON.parse(row.body);data.profile.date=hkToday();return data}
  save(userId:string,state:StudentState){const expected=state.revision;state.revision++;const result=this.db.prepare('UPDATE students SET body=?,revision=? WHERE user_id=? AND revision=?').run(JSON.stringify(state),state.revision,userId,expected);if(result.changes!==1)throw new Error('資料版本衝突，請重新載入')}
  packs(publishedOnly=false):ContentPack[]{const rows=this.db.prepare('SELECT body FROM packs ORDER BY id,version DESC').all() as any[];return rows.map(r=>JSON.parse(r.body)).filter(p=>!publishedOnly||p.status==='published')}
  latestPacks(publishedOnly=true){const seen=new Set<string>();return this.packs(publishedOnly).filter(p=>{if(seen.has(p.id))return false;seen.add(p.id);return true})}
  putPack(pack:ContentPack){this.db.prepare('INSERT INTO packs VALUES(?,?,?) ON CONFLICT(id,version) DO UPDATE SET body=excluded.body').run(pack.id,pack.version,JSON.stringify(pack))}
  putPreview(userId:string,preview:VersionedPreview){this.db.prepare('INSERT INTO previews VALUES(?,?,?)').run(preview.previewId,userId,JSON.stringify(preview))}
  preview(userId:string,id:string):VersionedPreview|null{const row=this.db.prepare('SELECT body FROM previews WHERE id=? AND user_id=?').get(id,userId) as any;return row?JSON.parse(row.body):null}
  private seal(value:string,iv:Buffer){const c=createCipheriv('aes-256-gcm',this.key,iv);const encrypted=Buffer.concat([c.update(value,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),encrypted]).toString('base64')}
  decrypt(value:string){const buf=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',this.key,buf.subarray(0,12));d.setAuthTag(buf.subarray(12,28));return Buffer.concat([d.update(buf.subarray(28)),d.final()]).toString('utf8')}
  model():ModelConfig|null{const row=this.db.prepare("SELECT body FROM settings WHERE id='model'").get() as any;if(!row)return null;const value=JSON.parse(row.body);value.secret=this.decrypt(value.secret);return value}
  putModel(config:ModelConfig){const value={...config,secret:this.seal(config.secret,randomBytes(12))};this.db.prepare("INSERT INTO settings VALUES('model',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(JSON.stringify(value))}
}
