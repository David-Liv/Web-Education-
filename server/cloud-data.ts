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
  billing_accounts:['user_id','body'],credit_operations:['id','user_id','period','status','created_at','body'],
  billing_orders:['id','user_id','request_key','status','created_at','body'],billing_audit:['id','actor_id','created_at','body'],
  ai_usage_logs:['id','user_id','operation_id','started_at','status','body','content'],
  forum_profiles:['user_id','nickname','muted_until','mute_reason','updated_at'],
  forum_posts:['id','board_id','author_id','is_official','is_anonymous','visibility','flair','title','body','question_ref','poll_body','image_ids','pinned','locked','status','upvote_count','comment_count','created_at','updated_at'],
  forum_post_boosts:['post_id','boosted_until'],
  forum_images:['id','author_id','post_id','mime_type','size','data','created_at'],
  forum_comments:['id','post_id','parent_id','author_id','is_official','is_anonymous','anon_index','body','status','upvote_count','created_at','updated_at'],
  forum_reactions:['target_type','target_id','user_id','kind','created_at'],
  forum_poll_votes:['post_id','user_id','option_id','created_at'],
  forum_reports:['id','target_type','target_id','reporter_id','reason','details','status','created_at','resolved_at','resolved_by'],
  forum_notifications:['id','recipient_id','post_id','comment_id','actor_label','post_title','excerpt','is_read','created_at'],
  partner_tutors:['id','status','created_at','updated_at','body'],
  teaching_playbooks:['id','version','partner_tutor_id','topic_id','subject_id','status','created_at','updated_at','body'],
  playbook_sandbox_runs:['id','playbook_id','version','actor_id','passed','created_at','body'],
  user_consents:['user_id','terms_version','accepted_at','share_partner_chats','updated_at'],
  playbook_events:['id','playbook_id','version','partner_tutor_id','topic_id','kind','created_at','body'],
  tutor_export_audit:['id','partner_tutor_id','playbook_id','actor_id','chat_count','created_at','body'],
  partner_accounts:['user_id','partner_tutor_id','created_at'],
} as const;
type Table=keyof typeof columns;
interface Archive {format:'hokse-cloud-v1'|'hokse-cloud-v2'|'hokse-cloud-v3'|'hokse-cloud-v4'|'hokse-cloud-v5';createdAt:string;keyFingerprint:string;tables:Record<Table,unknown[][]>}
const fingerprint=(store:Store)=>createHash('sha256').update(store.key).digest('hex');
const isBinaryColumn=(table:Table,column:string)=>(table==='files'||table==='forum_images')&&column==='data';

export async function exportCloud(store:Store,destination:string){
  if(store.db.kind!=='postgres')throw new Error('此命令只適用於 PostgreSQL。');
  const archive=await store.transaction(async()=>{
    await store.db.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables={} as Archive['tables'];
    for(const table of Object.keys(columns) as Table[]){
      const rows=await store.db.prepare(`SELECT ${columns[table].join(',')} FROM ${table}`).all();
      tables[table]=rows.map(row=>columns[table].map(column=>isBinaryColumn(table,column)?Buffer.from(row[column]).toString('base64'):row[column]));
    }
    return {format:'hokse-cloud-v5' as const,createdAt:new Date().toISOString(),keyFingerprint:fingerprint(store),tables};
  });
  mkdirSync(dirname(destination),{recursive:true});
  writeFileSync(destination,gzipSync(JSON.stringify(archive)),{flag:'wx',mode:0o600});
  return Object.fromEntries(Object.entries(archive.tables).map(([table,rows])=>[table,rows.length]));
}

// Restore to a separate empty database only. Never overwrites live students.
export async function restoreCloud(store:Store,source:string){
  if(store.db.kind!=='postgres')throw new Error('此命令只適用於 PostgreSQL。');
  const archive=JSON.parse(gunzipSync(readFileSync(source),{maxOutputLength:256*1024*1024}).toString()) as Archive;
  if(!['hokse-cloud-v1','hokse-cloud-v2','hokse-cloud-v3','hokse-cloud-v4','hokse-cloud-v5'].includes(archive.format)||archive.keyFingerprint!==fingerprint(store))throw new Error('備份版本或加密密鑰不匹配。');
  if(archive.format==='hokse-cloud-v1')for(const table of ['billing_accounts','credit_operations','billing_orders','billing_audit','ai_usage_logs'] as Table[])archive.tables[table]??=[];
  if(archive.format==='hokse-cloud-v1'||archive.format==='hokse-cloud-v2')for(const table of ['forum_profiles','forum_posts','forum_images','forum_comments','forum_reactions','forum_poll_votes','forum_reports','forum_notifications'] as Table[])archive.tables[table]??=[];
  if(archive.format==='hokse-cloud-v1'||archive.format==='hokse-cloud-v2'||archive.format==='hokse-cloud-v3')for(const table of ['partner_tutors','teaching_playbooks','playbook_sandbox_runs','user_consents','playbook_events','tutor_export_audit','partner_accounts'] as Table[])archive.tables[table]??=[];
  if(archive.format!=='hokse-cloud-v5')archive.tables.forum_post_boosts??=[];
  for(const table of Object.keys(columns) as Table[])if(!Array.isArray(archive.tables?.[table])||archive.tables[table].some(row=>!Array.isArray(row)||row.length!==columns[table].length))throw new Error('備份資料結構無效。');
  return store.transaction(async()=>{
    await store.db.exec('LOCK TABLE users,students,sessions,packs,previews,files,settings,migrations,billing_accounts,credit_operations,billing_orders,billing_audit,ai_usage_logs,forum_profiles,forum_posts,forum_post_boosts,forum_images,forum_comments,forum_reactions,forum_poll_votes,forum_reports,forum_notifications,partner_tutors,teaching_playbooks,playbook_sandbox_runs,user_consents,playbook_events,tutor_export_audit,partner_accounts IN ACCESS EXCLUSIVE MODE');
    if(await store.userCount()!==0)throw new Error('目標已有帳戶，拒絕覆寫；請改用全新的空資料庫。');
    for(const table of ['partner_accounts','tutor_export_audit','playbook_events','user_consents','playbook_sandbox_runs','teaching_playbooks','partner_tutors','forum_notifications','forum_reports','forum_poll_votes','forum_reactions','forum_comments','forum_images','forum_post_boosts','forum_posts','forum_profiles','ai_usage_logs','credit_operations','billing_orders','billing_accounts','billing_audit','sessions','previews','files','students','users','packs','settings','migrations'])await store.db.exec(`DELETE FROM ${table}`);
    for(const table of Object.keys(columns) as Table[]){
      for(const row of archive.tables[table]){
        const values=row.map((value,index)=>isBinaryColumn(table,columns[table][index])?Buffer.from(String(value),'base64'):value);
        await store.db.prepare(`INSERT INTO ${table} (${columns[table].join(',')}) VALUES (${values.map(()=>'?').join(',')})`).run(...values);
      }
    }
    const check=await store.db.prepare("SELECT body FROM settings WHERE id='encryption-check'").get();
    if(!check||store.decrypt(check.body)!=='hokse-key-v1')throw new Error('還原密鑰檢查失敗。');
    return {users:await store.userCount()};
  });
}
