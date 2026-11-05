import {createHash} from 'node:crypto';
import type {ServerResponse} from 'node:http';
import type {Store,ModelConfig} from './store.ts';
import type {Identity,ContentPack} from '../src/pilot-types.ts';
import type {Chat,ChatMessage} from '../src/types.ts';
import {Billing,beginProvider,usageModel,discardUsage,deferUsageCheckpoint} from './billing.ts';
import {generate} from './models.ts';
import {reject} from './learning.ts';
import {CHAT_CONTENT_INSTRUCTIONS,chatHistoryText} from '../src/chat-content.ts';
import {splitReview,reviewedText,REVIEW_INSTRUCTIONS,usable} from './chat-review.ts';

type State='generating'|'reviewing'|'complete'|'failed'|'stopped';
interface Record {userId:string;chatId:string;messageId:string;requestId:string;signature:string;runId:string;operationId:string;revision:number;state:State;leaseUntil:number;retries:number;retryRequestId?:string;prompt:string;attachments:string[];body:string;draft:string;model:string;reviewModel?:string;history:{at:string;verdict:string;reason:string;before:string;after:string}[]}
interface Running {requestId:string;signature?:string;controller:AbortController;promise:Promise<void>;listeners:Set<(m:ChatMessage)=>void>;last?:ChatMessage;user?:ChatMessage;error?:unknown}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const validId=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(v);
const key=(userId:string,messageId:string)=>'chat-review:'+userId+':'+messageId;

export class ChatService {
 private running=new Map<string,Running>();
 private store:Store;private billing:Billing;
 constructor(store:Store,billing:Billing){this.store=store;this.billing=billing}
 private async record(userId:string,messageId:string):Promise<Record|null>{const row=await this.store.db.prepare('SELECT body FROM settings WHERE id=?').get(key(userId,messageId));return row?JSON.parse(this.store.decrypt(row.body)):null}
 private async put(record:Record){await this.store.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(key(record.userId,record.messageId),this.store.encrypt(JSON.stringify(record)));await this.store.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run('chat-review-operation:'+record.operationId,record.messageId)}
 private async write(record:Record,content:string,status:ChatMessage['status'],practice?:ChatMessage['practice']){
  let message:ChatMessage|undefined;
  await this.store.transaction(async()=>{
   const saved=await this.record(record.userId,record.messageId);if(!saved||saved.runId!==record.runId||saved.state==='stopped')return;
   const data=await this.store.state(record.userId),chat=data.chats.find(c=>c.id===record.chatId),m=chat?.messages.find(m=>m.id===record.messageId);
   if(!m||m.revision!==record.revision)return;
   m.content=content;m.status=status;m.practice=practice;m.model=record.model;m.revision=(m.revision??0)+1;record.revision=m.revision;chat!.updatedAt=new Date().toISOString();
   await this.put(record);
   deferUsageCheckpoint(!usable(content));try{await this.store.save(record.userId,data)}finally{deferUsageCheckpoint()}
   message=structuredClone(m);const running=this.running.get(record.userId+record.chatId);if(running)running.user=structuredClone(chat!.messages.find(m=>m.role==='user'&&m.requestId===record.requestId));
  });
  if(message){const job=this.running.get(record.userId+record.chatId);if(job){job.last=message;for(const notify of job.listeners)notify(message)}}
  if(!message)discardUsage();return !!message;
 }
 async read(userId:string,chatId:string):Promise<Chat>{
  // Expired leases are failed, never automatically re-sent to the provider.
  const expired:string[]=[];
  await this.store.transaction(async()=>{const data=await this.store.state(userId),chat=data.chats.find(c=>c.id===chatId)??reject('對話不存在',404);let changed=false;
   for(const m of chat.messages.filter(m=>m.role==='assistant'&&m.status==='streaming')){const r=await this.record(userId,m.id);if(!r&&!this.running.has(userId+chatId)){m.status='interrupted';m.revision=(m.revision??0)+1;changed=true}else if(r&&r.leaseUntil<Date.now()&&!this.running.has(userId+chatId)){r.state='failed';r.revision=(m.revision??0)+1;m.revision=r.revision;m.status='complete';m.practice={failed:true,retryAvailable:r.retries<1};await this.put(r);expired.push(r.operationId);changed=true}}
   if(changed)await this.store.save(userId,data);
  });
  for(const id of expired)await this.billing.settle(userId,id,false,null,[],'Chat review lease expired');
  return (await this.store.state(userId)).chats.find(c=>c.id===chatId)??reject('對話不存在',404);
 }
 async stop(userId:string,chatId:string){
  this.running.get(userId+chatId)?.controller.abort();
  await this.store.transaction(async()=>{const data=await this.store.state(userId),chat=data.chats.find(c=>c.id===chatId)??reject('對話不存在',404);
   for(const m of chat.messages.filter(m=>m.status==='streaming')){const r=await this.record(userId,m.id);if(r){r.state='stopped';r.revision=(m.revision??0)+1;await this.put(r);m.revision=r.revision}m.status='interrupted';delete m.practice}
   await this.store.save(userId,data);
  });return {ok:true};
 }
 async remove(userId:string,chatId:string){await this.stop(userId,chatId);const chat=await this.read(userId,chatId);for(const m of chat.messages){const r=await this.record(userId,m.id);if(r)await this.store.db.prepare('DELETE FROM settings WHERE id=?').run('chat-review-operation:'+r.operationId);await this.store.db.prepare('DELETE FROM settings WHERE id=?').run(key(userId,m.id))}}
 private async watch(job:Running,res:ServerResponse){
  const frame=(event:string,data:unknown)=>{if(res.destroyed||res.writableEnded)return;if(!res.headersSent){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'});res.flushHeaders()}res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n')};
  const notify=(message:ChatMessage)=>frame('message',{message,user:job.user});job.listeners.add(notify);if(job.last)notify(job.last);
  const timer=setInterval(()=>{if(res.headersSent&&!res.destroyed&&!res.writableEnded)res.write(': keepalive\n\n')},15000);timer.unref();
  const detach=()=>job.listeners.delete(notify);res.once('close',detach);
  try{await job.promise;if(job.error){if(!res.headersSent)throw job.error;frame('error',{message:'暫時未能完成操作，請重試'})}else{frame('done',{id:job.last?.id})}if(!res.destroyed&&!res.writableEnded)res.end()}
  finally{clearInterval(timer);detach();res.off('close',detach)}
 }
 async send(identity:Identity,chatId:string,input:any,packs:Pick<ContentPack,'topicId'|'lessons'>[],res:ServerResponse,retryMessageId?:string){
  if(!validId(input.requestId))reject('缺少有效的訊息請求 ID');
  const activeKey=identity.id+chatId,active=this.running.get(activeKey),signature=digest(JSON.stringify([String(input.content??'').trim(),input.attachmentIds??[],retryMessageId??null]));
  if(active){if(active.requestId!==input.requestId)reject('此對話仍在生成，請稍候或停止',409,'AI_IN_PROGRESS');if(active.signature!==signature)reject('訊息請求 ID 已用於不同內容',409,'REQUEST_CONFLICT');return this.watch(active,res)}
  const chat=await this.read(identity.id,chatId),data=await this.store.state(identity.id);
  if(data.quizzes.some(q=>!q.submittedAt&&q.topicIds.includes(chat.topicId)&&['timed','diagnostic'].includes(q.kind)))reject('請先提交或完成這個單元的摸底／限時測驗，再開始 AI 教學',409,'ASSESSMENT_IN_PROGRESS');
  const pack=packs.find(p=>p.topicId===chat.topicId)??reject('內容未發布',422);
  let record:Record|null=null;
  if(retryMessageId){record=await this.record(identity.id,retryMessageId);if(!record||record.chatId!==chatId)reject('找不到這道練習',404);
   if(record.retryRequestId===input.requestId&&(record.state!=='failed'||record.retries>=1)){const m=chat.messages.find(m=>m.id===record!.messageId);if(m){const done:Running={requestId:input.requestId,controller:new AbortController(),promise:Promise.resolve(),listeners:new Set(),last:m};return this.watch(done,res)}}
   if(record.state!=='failed'||record.retries>=1)reject('這道練習已使用免費重試，請另開新請求',409,'RETRY_EXHAUSTED');
  }else{
   const content=String(input.content??'').trim();if(!content||content.length>12000)reject('請輸入 1–12000 字元；附件暫供人工查看，請同時寫下問題');
   const attachments=Array.isArray(input.attachmentIds)?input.attachmentIds:[];if(attachments.some((a:string)=>!data.attachments.some(f=>f.id===a)))reject('附件不屬於此帳戶',404);
   const previous=chat.messages.find(m=>m.requestId===input.requestId&&m.role==='assistant');
   if(previous){const saved=await this.record(identity.id,previous.id),user=chat.messages.find(m=>m.requestId===input.requestId&&m.role==='user');if(saved?saved.signature!==digest(JSON.stringify([content,attachments])):user?.content!==content||JSON.stringify(user.attachmentIds??[])!==JSON.stringify(attachments))reject('訊息請求 ID 已用於不同內容',409,'REQUEST_CONFLICT');
    if(previous.status==='streaming')reject('此對話仍在生成，請稍候',409,'AI_IN_PROGRESS');
    const done:Running={requestId:input.requestId,controller:new AbortController(),promise:Promise.resolve(),listeners:new Set(),last:previous};return this.watch(done,res);
   }
   record={userId:identity.id,chatId,messageId:crypto.randomUUID(),requestId:input.requestId,signature:digest(JSON.stringify([content,attachments])),runId:crypto.randomUUID(),operationId:digest(identity.id+':/chats/'+chatId+'/messages:'+input.requestId),revision:1,state:'generating',leaseUntil:Date.now()+120000,retries:0,prompt:content,attachments,body:'',draft:'',model:'',history:[]};
  }
  const config=await this.store.model()??reject('開發者尚未設定 AI；你仍可閱讀教材及完成測驗',503,'MODEL_NOT_CONFIGURED');if(!config.enabled||!config.model)reject('開發者尚未啟用模型或選擇模型 ID',503,'MODEL_NOT_CONFIGURED');
  const concurrent=this.running.get(activeKey);if(concurrent){if(concurrent.requestId!==input.requestId)reject('此對話仍在生成',409,'AI_IN_PROGRESS');if(concurrent.signature!==signature)reject('訊息請求 ID 已用於不同內容',409,'REQUEST_CONFLICT');return this.watch(concurrent,res)}
  const job:Running={requestId:input.requestId,signature,controller:new AbortController(),promise:Promise.resolve(),listeners:new Set()};this.running.set(activeKey,job);
  job.promise=this.execute(identity,chat,record!,config,pack,input,job,!!retryMessageId).catch(e=>{job.error=e}).finally(()=>{if(this.running.get(activeKey)===job)this.running.delete(activeKey)});
  return this.watch(job,res);
 }
 private async execute(identity:Identity,chat:Chat,r:Record,config:ModelConfig,pack:Pick<ContentPack,'topicId'|'lessons'>,input:any,job:Running,retry:boolean){
  const signal=AbortSignal.any([job.controller.signal,AbortSignal.timeout(110000)]);
  const work=async()=>{
   deferUsageCheckpoint();
   if(signal.aborted)reject('已停止生成',409,'CANCELLED');
   if(retry){r.retries++;r.retryRequestId=input.requestId;r.runId=crypto.randomUUID();r.state=r.draft?'reviewing':'generating';r.leaseUntil=Date.now()+120000;
    await this.store.transaction(async()=>{const current=await this.record(identity.id,r.messageId);if(!current||current.state!=='failed'||current.retries>=1)reject('這道練習已使用免費重試',409,'RETRY_EXHAUSTED');const d=await this.store.state(identity.id),c=d.chats.find(c=>c.id===chat.id),m=c?.messages.find(m=>m.id===r.messageId);if(!m)reject('對話不存在',404);r.revision=(m.revision??0)+1;m.revision=r.revision;m.status='streaming';m.practice={pending:true};await this.put(r);await this.store.save(identity.id,d)});
   }else{
    config=(await beginProvider(await usageModel(config))).config;r.model=config.model;
    if(signal.aborted)reject('已停止生成',409,'CANCELLED');
    await this.store.transaction(async()=>{const d=await this.store.state(identity.id),c=d.chats.find(c=>c.id===chat.id)??reject('對話不存在',404);
     if(c.messages.some(m=>m.status==='streaming'))reject('此對話仍在生成',409,'AI_IN_PROGRESS');
     if(c.messages.some(m=>m.requestId===r.requestId))reject('訊息請求 ID 已存在',409,'REQUEST_CONFLICT');
     for(const q of d.quizzes.filter(q=>!q.submittedAt&&q.topicIds.includes(chat.topicId)))for(const questionId of q.questionIds)d.assists.push({questionId,quizId:q.id,kind:'chat-assistance',at:new Date().toISOString()});
     c.messages.push({id:crypto.randomUUID(),role:'user',content:r.prompt,status:'complete',attachmentIds:r.attachments,requestId:r.requestId},{id:r.messageId,role:'assistant',content:'',status:'streaming',requestId:r.requestId,revision:r.revision});await this.put(r);await this.store.save(identity.id,d);
    });
   }
   await this.write(r,r.body,'streaming',{pending:true});
   try{
    if(!r.draft){
     const system=`你是香港中學生的耐心導師。提供可檢查步驟、分層提示與清楚解釋。不能改成績、掌握度或日曆；沒有看過圖片錄音，不宣稱專業審校。語言：${chat.teachingLanguage==='en'?'English':'香港繁體中文'}。教材：${JSON.stringify(pack.lessons)}`;
     const history=chat.messages.filter(m=>m.requestId!==r.requestId&&m.status==='complete'&&m.content.trim()).slice(-10).map(m=>({role:m.role,content:m.role==='assistant'?chatHistoryText(m.content):m.content}));
     const text=await generate(config,[{role:'system',content:system+'\n'+CHAT_CONTENT_INSTRUCTIONS},...history,{role:'user',content:r.prompt}],signal);
     const parts=splitReview(text,r.prompt,chat.mode);
     if(!usable(text)&&!parts.draft.trim())throw new Error('NO_USABLE_CHAT_CONTENT');if(signal.aborted)throw new Error('CANCELLED');
     r.body=parts.body;r.draft=parts.draft;
     if(!parts.required){r.state='complete';await this.write(r,r.body,'complete');return {chatId:chat.id,messageId:r.messageId}}
     r.state='reviewing';await this.write(r,r.body,'streaming',{pending:true});
    }
    r.reviewModel=(await this.billing.policy()).reviewModel;
    const result=reviewedText(await generate(config,[{role:'system',content:REVIEW_INSTRUCTIONS},{role:'user',content:JSON.stringify({question:r.prompt,context:r.body,draft:r.draft})}],signal,true),r.draft);
    if(signal.aborted)throw new Error('CANCELLED');
    r.history.push({at:new Date().toISOString(),verdict:result.verdict,reason:result.reason,before:r.draft,after:result.text});r.history=r.history.slice(-2);r.state='complete';
    await this.write(r,[r.body,result.text].filter(Boolean).join('\n\n'),'complete');
   }catch(e){
    r.state=job.controller.signal.aborted?'stopped':'failed';r.history.push({at:new Date().toISOString(),verdict:'failed',reason:(e as any).code??(e as Error).message,before:r.draft,after:''});r.history=r.history.slice(-2);
    await this.write(r,r.body,r.state==='stopped'?'interrupted':'complete',r.state==='failed'?{failed:true,retryAvailable:r.retries<1}:undefined);
    if(!usable(r.body))discardUsage();
   }
   return {chatId:chat.id,messageId:r.messageId};
  };
  if(retry)await this.billing.retryChat(identity,r.operationId,signal,work);
  else await this.billing.run(identity,'/chats/'+chat.id+'/messages',input,r.requestId,signal,async send=>{send(await work())},()=>{});
 }
 async close(){for(const job of this.running.values())job.controller.abort();await Promise.allSettled([...this.running.values()].map(j=>j.promise))}
}
