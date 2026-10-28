import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { Store } from './store.ts';
import { createPilot } from './app.ts';
import { initialPacks } from './content.ts';
import { packCSV, packFromCSV } from './csv.ts';
import { validatePack } from '../src/pilot-rules.ts';
import { dailyCapacity, hasConflict } from '../src/domain.ts';
import { reconcileToday } from './planner.ts';
import { newState } from './store.ts';

const password='fixture-password-123';
const app=createPilot({database:':memory:'});let base='',admin='',reviewer='';
async function call(path:string,cookie='',method='GET',body?:unknown){const r=await fetch(base+'/api/v1'+path,{method,headers:{'X-Hokse-Client':'1',...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]??''}}
async function student(){const username='s'+crypto.randomUUID().slice(0,8);const r=await call('/admin/users',admin,'POST',{username,name:'測試學生',password,role:'student'});assert.equal(r.status,201);const login=await call('/auth/login','','POST',{username,password});assert.equal(login.status,200);return {cookie:login.cookie,id:r.data.id}}
async function quiz(cookie:string,input:any={}){const r=await call('/quizzes',cookie,'POST',{subjectId:'maths',topicIds:['maths-quadratic'],kind:'diagnostic',count:5,...input});assert.equal(r.status,201,JSON.stringify(r.data));return r.data}
function answersFor(q:any,correct=true){const original=app.store.packs().flatMap(p=>p.questions);return Object.fromEntries(q.questions.map((item:any)=>[item.id,{value:correct?original.find(x=>x.id===item.id)!.answer:'999999',hinted:false}]))}
test.before(async()=>{
  base=`http://127.0.0.1:${await app.listen(0)}`;
  const setup=await call('/auth/setup','','POST',{username:'developer',name:'測試開發者',password});assert.equal(setup.status,200);admin=setup.cookie;
  assert.equal((await call('/admin/users',admin,'POST',{username:'reviewer',name:'測試復核者',password,role:'reviewer'})).status,201);
  reviewer=(await call('/auth/login','','POST',{username:'reviewer',password})).cookie;
});
test.after(async()=>{await app.close()});

test('setup closes after first account and requires same-site marker',async()=>{
  assert.equal((await call('/auth/setup','','POST',{username:'another',name:'x',password})).status,403);
  assert.equal((await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'developer',password})})).status,403);
  assert.equal((await call('/bootstrap')).status,401);
});
test('draft bank refuses formal quizzes and needs two actual review identities per question',async()=>{
  const {cookie}=await student();assert.equal((await call('/quizzes',cookie,'POST',{subjectId:'maths',count:5})).status,422);
  for(const p of app.store.latestPacks(false)){
    assert.equal((await call(`/admin/content/${p.id}/${p.version}/publish`,admin,'POST',{})).status,422);
    for(const id of [...p.questions.map(q=>q.id),...p.lessons.map((_,i)=>`lesson-${i}`)]){for(const who of [admin,reviewer])assert.equal((await call(`/admin/content/${p.id}/${p.version}/review`,who,'POST',{questionId:id,method:'自動化測試用復核身分，不代表實際人工審校',confirmed:true})).status,200)}
    assert.equal((await call(`/admin/content/${p.id}/${p.version}/publish`,admin,'POST',{})).status,200);
  }
  assert.equal(app.store.latestPacks().length,2);
});
test('question projections do not expose keys or hints; hints cannot be unmarked by client',async()=>{
  const {cookie}=await student(),q=await quiz(cookie);
  for(const item of q.questions)for(const key of ['answer','explanation','hint','scoring','errorCandidates'])assert.equal(key in item,false);
  assert.equal((await call(`/quizzes/${q.quiz.id}/hint`,cookie,'POST',{questionId:q.questions[0].id})).status,200);
  const submitted=await call(`/quizzes/${q.quiz.id}/submit`,cookie,'POST',{answers:answersFor(q)});assert.equal(submitted.status,200);
  const state=(await call('/bootstrap',cookie)).data;
  assert.equal(state.evidence.find((e:any)=>e.questionId===q.questions[0].id).independent,false);
  assert.equal('snapshot' in state.quizzes[0],false);assert.equal('independence' in state.quizzes[0],false);
  assert.ok(state.evidence.some((e:any)=>e.independent));
});
test('unanswered remains unknown and duplicate submit does not duplicate evidence or results',async()=>{
  const {cookie}=await student(),q=await quiz(cookie),answers=answersFor(q);delete answers[q.questions[0].id];
  const first=await call(`/quizzes/${q.quiz.id}/submit`,cookie,'POST',{answers});assert.equal(first.data.results[0].state,'unanswered');
  const n=(await call('/bootstrap',cookie)).data.evidence.length;
  assert.equal((await call(`/quizzes/${q.quiz.id}/submit`,cookie,'POST',{answers})).status,200);
  assert.equal((await call('/bootstrap',cookie)).data.evidence.length,n);
});
test('same-question feedback exposure cannot be turned into a new independent attempt',async()=>{
  const {cookie}=await student();const ids:string[]=[];
  for(let n=0;n<7;n++){const q=await quiz(cookie,{kind:'practice',count:1,skillId:'quadratic-factor'});ids.push(q.questions[0].id);assert.equal((await call(`/quizzes/${q.quiz.id}/submit`,cookie,'POST',{answers:answersFor(q)})).status,200)}
  assert.equal(new Set(ids).size,6);const state=(await call('/bootstrap',cookie)).data;assert.equal(state.evidence.at(-1).independent,false);
});
test('critical steps await manual grading, keep original independence and cannot be graded twice',async()=>{
  const {cookie,id}=await student(),q=await quiz(cookie);
  const submitted=await call(`/quizzes/${q.quiz.id}/submit`,cookie,'POST',{answers:answersFor(q)});
  const pending=submitted.data.results.find((m:any)=>m.state==='pending');assert.ok(pending);
  let state=(await call('/bootstrap',cookie)).data;assert.equal(state.evidence.some((e:any)=>e.questionId===pending.questionId),false);
  const grade={userId:id,quizId:q.quiz.id,questionId:pending.questionId,awarded:pending.max,criticalPassed:true,feedback:'測試用人工批改回執；不是實際學生或真實人工審校'};
  assert.equal((await call('/admin/grading',cookie,'POST',grade)).status,403);
  assert.equal((await call('/admin/grading',reviewer,'POST',grade)).status,200);
  state=(await call('/bootstrap',cookie)).data;assert.equal(state.evidence.find((e:any)=>e.questionId===pending.questionId).independent,true);
  assert.equal((await call('/admin/grading',reviewer,'POST',grade)).status,409);
});
test('second failure pauses the skill; new chat does not reset cycle; student can correct cause',async()=>{
  const {cookie}=await student();let last:any;
  for(let n=0;n<2;n++){last=await quiz(cookie,{kind:'practice',count:1,skillId:'quadratic-factor'});await call(`/quizzes/${last.quiz.id}/submit`,cookie,'POST',{answers:answersFor(last,false)})}
  let state=(await call('/bootstrap',cookie)).data;assert.equal(state.pilot.cycles.find((c:any)=>c.skillId==='quadratic-factor').paused,true);
  await call('/chats',cookie,'POST',{topicId:'maths-quadratic'});
  assert.equal((await call('/quizzes',cookie,'POST',{kind:'practice',skillId:'quadratic-factor',count:1})).status,422);
  assert.equal((await call(`/wrong/${last.questions[0].id}`,cookie,'PATCH',{reason:'輸入失誤'})).status,200);
  state=(await call('/bootstrap',cookie)).data;assert.equal(state.pilot.errors.at(-1).selected,'輸入失誤');assert.ok(state.pilot.errors.at(-1).observed.includes('不足'));
  assert.equal((await call(`/wrong/${last.questions[0].id}`,cookie,'PATCH',{resolved:true})).status,409);
  assert.equal((await call('/remediation',cookie,'POST',{skillId:'quadratic-factor',action:'worked-example'})).status,200);
});
test('ownership, role checks and attachment bytes survive a reload',async()=>{
  const a=await student(),b=await student(),q=await quiz(a.cookie);
  assert.equal((await call(`/quizzes/${q.quiz.id}`,b.cookie)).status,404);
  assert.equal((await call(`/quizzes/${q.quiz.id}/submit`,b.cookie,'POST',{answers:answersFor(q)})).status,404);
  assert.equal((await call('/admin/model',a.cookie)).status,403);assert.equal((await call('/admin/content',a.cookie)).status,403);
  const bytes=Buffer.from([0x89,0x50,0x4e,0x47,1,2,3]);const upload=await fetch(base+'/api/v1/attachments/upload',{method:'POST',headers:{Cookie:a.cookie,'Content-Type':'image/png','X-Hokse-Client':'1','X-File-Name':'fixture.png'},body:bytes});assert.equal(upload.status,201);const file=await upload.json() as any;
  const own=await fetch(base+`/api/v1/attachments/${file.id}`,{headers:{Cookie:a.cookie}});assert.deepEqual(Buffer.from(await own.arrayBuffer()),bytes);
  assert.equal((await fetch(base+`/api/v1/attachments/${file.id}`,{headers:{Cookie:b.cookie}})).status,404);
  assert.equal((await call(`/wrong/${q.questions[0].id}`,a.cookie)).status,404);
});
test('previews are exact, stale-aware, capacity constrained and idempotently applied',async()=>{
  const {cookie}=await student();await call('/profile',cookie,'PATCH',{dailyMinutes:[30,30,30,30,30,30,30]});
  let preview=(await call('/plans/preview',cookie,'POST',{})).data;
  assert.equal((await call('/profile',cookie,'PATCH',{name:'新名字'})).status,200);
  assert.equal((await call('/plans/apply',cookie,'POST',{previewId:preview.previewId})).status,409);
  preview=(await call('/plans/preview',cookie,'POST',{})).data;
  const apply=await call('/plans/apply',cookie,'POST',{previewId:preview.previewId});assert.equal(apply.status,200);assert.deepEqual(apply.data.tasks,preview.tasks);
  assert.equal((await call('/plans/apply',cookie,'POST',{previewId:preview.previewId})).status,200);
  const state=(await call('/bootstrap',cookie)).data;assert.equal(state.tasks.length,preview.tasks.length);
  for(const task of state.tasks){assert.equal(hasConflict(task,state.tasks.filter((t:any)=>t.id!==task.id)),false);assert.ok(state.tasks.filter((t:any)=>t.date===task.date).reduce((n:number,t:any)=>n+t.minutes,0)<=dailyCapacity(state.profile,task.date))}
  await call('/profile',cookie,'PATCH',{dailyMinutes:[0,0,0,0,0,0,0]});preview=(await call('/plans/preview',cookie,'POST',{})).data;assert.equal(preview.tasks.length,0);assert.ok(preview.unscheduled.length>0);
});
test('content versions are immutable; CSV retains quoting and is validated before import',async()=>{
  const p=initialPacks()[0],text=packCSV(p),{questions,reviews,status,professionalVerified,...metadata}=p;
  const roundtrip=packFromCSV(text,{...metadata,version:2});assert.equal(validatePack(roundtrip).length,0);assert.equal(roundtrip.questions[0].prompt,p.questions[0].prompt);
  assert.equal((await call('/admin/content/import',admin,'POST',{pack:roundtrip,preview:true})).data.valid,true);
  assert.equal(app.store.packs().some(p=>p.version===2),false);
  assert.equal((await call('/admin/content/import',admin,'POST',{pack:roundtrip,preview:false})).status,201);
  assert.equal((await call('/admin/content/import',admin,'POST',{pack:roundtrip,preview:false})).status,409);
  const bad=structuredClone(roundtrip);bad.version=3;bad.skills[0].prerequisites=[bad.skills[0].id];assert.equal((await call('/admin/content/import',admin,'POST',{pack:bad,preview:true})).data.valid,false);
});
test('small rescheduling stays in the same day and preserves locks, order and total minutes',()=>{
  const data=newState('排程測試');data.profile.date='2026-10-27';data.tasks=[{id:'a',date:data.profile.date,start:'17:00',minutes:10,title:'單項活動',subjectId:'maths',kind:'study',status:'pending',locked:false,reason:'test'},{id:'b',date:data.profile.date,start:'19:00',minutes:10,title:'鎖定活動',subjectId:'chem',kind:'study',status:'pending',locked:true,reason:'test'}];
  assert.equal(reconcileToday(data,new Date('2026-10-27T10:05:00Z')),1);assert.equal(data.tasks[0].start,'18:05');assert.equal(data.tasks[1].start,'19:00');assert.equal(data.tasks.reduce((n,t)=>n+t.minutes,0),20);assert.equal(data.reorders?.length,1);
});
test('SQLite state and encrypted model key persist across close/reopen and backup restore',()=>{
  const root=resolve('.data');mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'check-'));try{const path=join(dir,'pilot.sqlite');let s=new Store(path);const u=s.createUser('persist',password,'持久化','student'),state=s.state(u.id);state.notes.push({id:'n',title:'重啟保留',body:'內容',date:state.profile.date});s.save(u.id,state);s.putModel({id:'default',name:'fixture',baseUrl:'http://127.0.0.1',secret:'test-only-key',model:'fixture',protocol:'openai-chat',enabled:true});const raw=s.db.prepare('SELECT body FROM settings').get() as any;assert.ok(!raw.body.includes('test-only-key'));s.db.prepare('VACUUM INTO ?').run(join(dir,'backup.sqlite'));s.close();s=new Store(path);assert.equal(s.state(u.id).notes[0].title,'重啟保留');assert.equal(s.model()?.secret,'test-only-key');s.close();const restored=new Store(join(dir,'backup.sqlite'));assert.equal(restored.state(u.id).notes.length,1);assert.equal(restored.model()?.secret,'test-only-key');restored.close()}finally{const checked=resolve(dir);assert.ok(checked.startsWith(root+sep));rmSync(checked,{recursive:true,force:true})}
});
test('configured provider is actually fetched, keys stay server-side, chat requests are idempotent',async()=>{
  let calls=0;const provider=createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/v1/models'){res.end(JSON.stringify({data:[{id:'fixture-model'}]}));return}calls++;let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);assert.equal(body.model,'fixture-model');res.end(JSON.stringify({choices:[{message:{content:'這是測試提供方的文字回覆。'}}]}))});
  await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));try{const port=(provider.address() as any).port;
    assert.equal((await call('/admin/model',admin,'PUT',{name:'本機測試服務',baseUrl:`http://127.0.0.1:${port}/v1`,apiKey:'test-only-key',model:'fixture-model',protocol:'openai-chat',enabled:true})).status,200);
    const models=await call('/admin/model/models',admin,'POST',{});assert.deepEqual(models.data.models,['fixture-model']);
    assert.equal((await call('/admin/model/test',admin,'POST',{})).data.ok,true);assert.ok(!JSON.stringify((await call('/admin/model',admin)).data).includes('test-only-key'));
    const {cookie}=await student(),chat=(await call('/chats',cookie,'POST',{topicId:'maths-quadratic'})).data,requestId=crypto.randomUUID();
    const first=await fetch(base+`/api/v1/chats/${chat.id}/messages`,{method:'POST',headers:{Cookie:cookie,'X-Hokse-Client':'1','Content-Type':'application/json'},body:JSON.stringify({content:'請解釋判別式',requestId})});assert.equal(first.status,200);assert.match(await first.text(),/event: done/);
    const before=calls;const repeat=await fetch(base+`/api/v1/chats/${chat.id}/messages`,{method:'POST',headers:{Cookie:cookie,'X-Hokse-Client':'1','Content-Type':'application/json'},body:JSON.stringify({content:'請解釋判別式',requestId})});assert.match(await repeat.text(),/event: done/);assert.equal(calls,before);
    const state=(await call('/bootstrap',cookie)).data;assert.equal(state.chats[0].messages.length,2);
  }finally{await new Promise<void>(resolve=>provider.close(()=>resolve()))}
});
test('provider failure is explicit, Responses adapter works, and stopping preserves one interrupted request',async()=>{
  const provider=createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');let text='';for await(const c of req)text+=c;const body=text?JSON.parse(text):{};
    if(body.model==='unavailable'){res.writeHead(429);res.end('{}');return}
    if(body.model==='slow'){setTimeout(()=>{if(!res.destroyed)res.end(JSON.stringify({choices:[{message:{content:'延遲測試'}}]}))},1000);return}
    res.end(JSON.stringify({output:[{content:[{type:'output_text',text:'Responses 測試成功'}]}]}));
  });await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));
  try{const baseUrl=`http://127.0.0.1:${(provider.address() as any).port}/v1`;
    await call('/admin/model',admin,'PUT',{baseUrl,model:'unavailable',protocol:'openai-chat',enabled:true});const failure=await call('/admin/model/test',admin,'POST',{});assert.equal(failure.status,502);assert.match(failure.data.error.message,/限額/);
    await call('/admin/model',admin,'PUT',{baseUrl,model:'responses-fixture',protocol:'openai-responses',enabled:true});assert.equal((await call('/admin/model/test',admin,'POST',{})).data.ok,true);
    await call('/admin/model',admin,'PUT',{baseUrl,model:'slow',protocol:'openai-chat',enabled:true});const {cookie}=await student(),chat=(await call('/chats',cookie,'POST',{topicId:'maths-quadratic'})).data;
    const requestId=crypto.randomUUID(),controller=new AbortController(),running=fetch(base+`/api/v1/chats/${chat.id}/messages`,{method:'POST',headers:{Cookie:cookie,'X-Hokse-Client':'1','Content-Type':'application/json'},body:JSON.stringify({content:'停止測試',requestId}),signal:controller.signal}).catch(()=>null);
    for(let n=0;n<20;n++){if((await call('/bootstrap',cookie)).data.chats[0].messages.length===2)break;await new Promise(r=>setTimeout(r,10))}
    assert.equal((await call(`/chats/${chat.id}/stop`,cookie,'POST',{})).status,200);controller.abort();await running;
    const state=(await call('/bootstrap',cookie)).data;assert.equal(state.chats[0].messages.length,2);assert.equal(state.chats[0].messages[1].status,'interrupted');
  }finally{await new Promise<void>(resolve=>provider.close(()=>resolve()))}
});
