import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createPilot} from './app.ts';
import {units} from './studio-state.ts';
import {Billing, initialPolicy} from './billing.ts';
import type {Identity} from '../src/pilot-types.ts';

async function fixture(){
 const calls:{path:string;model?:string;authorization?:string}[]=[];
 const provider=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):{};calls.push({path:req.url!,model:body.model,authorization:req.headers.authorization});res.setHeader('Content-Type','application/json');if(req.url?.startsWith('/fail')||body.model==='pggo-抗截断-broken'){res.writeHead(503);res.end(JSON.stringify({error:'fixture unavailable'}));return}if(req.url?.endsWith('/models')){res.end(JSON.stringify({data:[{id:'pggo-抗截断-old-model'},{id:'pggo-抗截断-new-model'},{id:'pggo-抗截断-new-model'},{id:'bdgo-抗截断-new-model'},{id:'pggo-new-model'}]}));return}const text='```review\n{"scope":"none"}\n```\n'+`Fixture reply from ${body.model}`;res.end(JSON.stringify(req.url?.endsWith('/responses')?{output_text:text}:{choices:[{message:{content:text}}]}))});
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));const upstream=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;
 const app=createPilot({database:':memory:',allowSetup:false});const base=`http://127.0.0.1:${await app.listen(0)}`;
 const accounts:{user:Identity;cookie:string}[]=[];for(const [username,role] of [['owner','developer'],['student_a','student'],['student_b','student'],['reviewer','reviewer']] as const){const user=await app.store.createUser(username,'fixture-password-123',username,role);accounts.push({user,cookie:`hokse_session=${await app.store.session(user)}`})}
 const config={id:'default',name:'Fixture global provider',baseUrl:upstream,secret:'fixture-provider-key',model:'pggo-抗截断-old-model',protocol:'openai-chat' as const,enabled:true,tested:{at:'2026-01-01T00:00:00Z',model:'pggo-抗截断-old-model',ok:true},models:['pggo-抗截断-old-model']};await app.store.putModel(config);
 const policy=initialPolicy();policy.models['pggo-抗截断-old-model']={credits:2,enabled:true};policy.models['pggo-抗截断-new-model']={credits:5,enabled:true};policy.plans.Free.models=['pggo-抗截断-old-model','pggo-抗截断-new-model'];policy.plans.Free.defaultModel='pggo-抗截断-old-model';delete policy.plans.Free.defaultModels;await new Billing(app.store).updatePolicy(accounts[0].user.id,policy);
 async function call(path:string,cookie=accounts[0].cookie,method='GET',body?:unknown){const r=await fetch(base+'/api/v1'+path,{method,headers:{'X-Hokse-Client':'1','X-Hokse-Request-ID':crypto.randomUUID(),Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:r.headers.get('content-type')?.includes('text/event-stream')?await r.text():await r.json()}}
 return {app,upstream,calls,accounts,call,draft:{name:config.name,baseUrl:upstream,apiKey:'',model:'pggo-抗截断-new-model',protocol:config.protocol,enabled:true},close:async()=>{await app.close();await new Promise<void>((r,j)=>provider.close(e=>e?j(e):r()))}};
}

test('model discovery and selected-model tests use drafts without activating them or exposing keys',async()=>{
 const f=await fixture();try{
  const list=await f.call('/admin/model/models',undefined,'POST',{config:f.draft});assert.equal(list.status,200);assert.deepEqual(list.data.models,['pggo-抗截断-old-model','pggo-抗截断-new-model','bdgo-抗截断-new-model','pggo-new-model']);assert.equal(list.data.scope,'draft');assert.equal(f.calls.length,1);assert.equal(f.calls[0].authorization,'Bearer fixture-provider-key');
  const trial=await f.call('/admin/model/test',undefined,'POST',{config:f.draft});assert.equal(trial.status,200);assert.equal(trial.data.scope,'draft');assert.match(trial.data.text,/new-model/);
  const saved=(await f.call('/admin/model')).data;assert.equal(saved.model,'pggo-抗截断-old-model');assert.equal(saved.tested.at,'2026-01-01T00:00:00Z');assert.equal(saved.hasKey,true);assert.equal(saved.secret,undefined);assert.equal(saved.apiKey,undefined);
  for(const actor of f.accounts.slice(1))for(const [path,method,body] of [['/admin/model','GET',undefined],['/admin/model','PUT',f.draft],['/admin/model/models','POST',{config:f.draft}],['/admin/model/test','POST',{config:f.draft}]] as const)assert.equal((await f.call(path,actor.cookie,method,body)).status,403);
  const encrypted=await f.app.store.db.prepare("SELECT body FROM settings WHERE id='model'").get();assert.ok(!encrypted!.body.includes('fixture-provider-key'));
  for(const actor of f.accounts.slice(1,3))assert.ok(!JSON.stringify((await f.call('/bootstrap',actor.cookie)).data).includes('fixture-provider-key'));
 }finally{await f.close()}
});

test('provider configuration is shared while each student chooses a plan-allowed model and history retains snapshots',async()=>{
 const f=await fixture();try{
  const chats=[];for(const actor of f.accounts.slice(1,3)){const chat=await f.call('/chats',actor.cookie,'POST',{topicId:units[0].topicId,mode:'explain'});assert.equal(chat.status,201);chats.push({actor,id:chat.data.id});const old=await f.call(`/chats/${chat.data.id}/messages`,actor.cookie,'POST',{content:'Fixture question',requestId:crypto.randomUUID(),model:'student-override'});assert.match(old.data,/old-model/)}
  const applied=await f.call('/admin/model',undefined,'PUT',f.draft);assert.equal(applied.status,200);assert.equal(applied.data.model,'pggo-抗截断-new-model');assert.equal(applied.data.tested,undefined);
  for(const c of chats){assert.equal((await f.call('/billing',c.actor.cookie)).data.account.model,'pggo-抗截断-old-model');assert.equal((await f.call('/billing/model',c.actor.cookie,'PUT',{model:'student-override'})).status,403);assert.equal((await f.call('/billing/model',c.actor.cookie,'PUT',{model:'pggo-抗截断-new-model'})).status,200);const next=await f.call(`/chats/${c.id}/messages`,c.actor.cookie,'POST',{content:'A new fixture question',requestId:crypto.randomUUID(),model:'student-override'});assert.match(next.data,/new-model/);const state=(await f.call('/bootstrap',c.actor.cookie)).data;const history=JSON.stringify(state.chats.find((x:any)=>x.id===c.id));assert.match(history,/old-model/);assert.match(history,/new-model/)}
  assert.deepEqual(f.calls.filter(c=>c.model).map(c=>c.model),['pggo-抗截断-old-model','pggo-抗截断-old-model','pggo-抗截断-new-model','pggo-抗截断-new-model']);
 }finally{await f.close()}
});

test('failed draft operations and blank activation leave the active global model unchanged',async()=>{
 const f=await fixture();try{
  assert.equal((await f.call('/admin/model/models',undefined,'POST',{config:{...f.draft,baseUrl:f.upstream+'/fail'}})).status,502);
  assert.equal((await f.call('/admin/model/test',undefined,'POST',{config:{...f.draft,model:'pggo-抗截断-broken'}})).status,502);
  assert.equal((await f.call('/admin/model',undefined,'PUT',{...f.draft,model:''})).status,400);
  assert.equal((await f.call('/admin/model/models',undefined,'POST',{config:null})).status,400);
  assert.equal((await f.call('/admin/model')).data.model,'pggo-抗截断-old-model');
  assert.equal((await f.call('/admin/model',undefined,'PUT',{...f.draft,model:'',enabled:false})).status,200);
  const disabled=(await f.call('/admin/model')).data;assert.equal(disabled.enabled,false);assert.equal(disabled.model,'');assert.equal(disabled.hasKey,true);
 }finally{await f.close()}
});

test('switching provider does not reuse the old key and Responses draft tests remain isolated',async()=>{
 const f=await fixture();try{
  const other=await f.call('/admin/model/models',undefined,'POST',{config:{...f.draft,baseUrl:f.upstream+'/other'}});assert.equal(other.status,200);assert.equal(f.calls.at(-1)!.authorization,undefined);
  const response=await f.call('/admin/model/test',undefined,'POST',{config:{...f.draft,protocol:'openai-responses'}});assert.equal(response.status,200);assert.equal(f.calls.at(-1)!.path,'/responses');assert.equal((await f.call('/admin/model')).data.protocol,'openai-chat');
  await f.call('/admin/model',undefined,'PUT',{...f.draft,model:'pggo-抗截断-old-model',enabled:false});assert.ok((await f.call('/admin/model')).data.tested);
  await f.call('/admin/model',undefined,'PUT',{...f.draft,model:'pggo-抗截断-old-model',apiKey:'replacement-fixture-key'});const changed=(await f.call('/admin/model')).data;assert.equal(changed.tested,undefined);assert.equal(changed.models,undefined);assert.equal(changed.hasKey,true);
 }finally{await f.close()}
});

test('configurable maxRetries automatically retries transient provider failures up to the configured count and releases credits if still failing',async()=>{
 let failLeft=2,attempts=0;
 const provider=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):{};attempts++;res.setHeader('Content-Type','application/json');if(failLeft>0){failLeft--;res.writeHead(503);res.end(JSON.stringify({error:'transient upstream 503'}));return}res.end(JSON.stringify({choices:[{message:{content:'```review\n{"scope":"none"}\n```\nRecovered reply from '+body.model}}]}))});
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 const upstream=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;
 const app=createPilot({database:':memory:',allowSetup:false});const base=`http://127.0.0.1:${await app.listen(0)}`;
 try{
  const owner=await app.store.createUser('owner','fixture-password-123','owner','developer');
  const student=await app.store.createUser('student','fixture-password-123','student','student');
  const ownerCookie=`hokse_session=${await app.store.session(owner)}`,studentCookie=`hokse_session=${await app.store.session(student)}`;
  const call=async(path:string,cookie=ownerCookie,method='GET',body?:unknown)=>{const r=await fetch(base+'/api/v1'+path,{method,headers:{'X-Hokse-Client':'1','X-Hokse-Request-ID':crypto.randomUUID(),Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:r.headers.get('content-type')?.includes('text/event-stream')?await r.text():await r.json()}};
  assert.equal((await call('/admin/model',ownerCookie,'PUT',{name:'Retry test',baseUrl:upstream,apiKey:'k',model:'gemini-4-hydrogen',protocol:'openai-chat',enabled:true,maxRetries:9})).status,400);
  const put=await call('/admin/model',ownerCookie,'PUT',{name:'Retry test',baseUrl:upstream,apiKey:'k',model:'gemini-4-hydrogen',protocol:'openai-chat',enabled:true,maxRetries:3});
  assert.equal(put.status,200);assert.equal(put.data.maxRetries,3);
  const billing=new Billing(app.store),p=await billing.policy();
  p.models['gemini-4-hydrogen']={credits:20,enabled:true};p.reviewModel='gemini-4-hydrogen';
  for(const plan of Object.values(p.plans)){plan.models=['gemini-4-hydrogen'];plan.defaultModel='gemini-4-hydrogen';plan.defaultModels={quiz:'gemini-4-hydrogen',chat:'gemini-4-hydrogen',evaluation:'gemini-4-hydrogen'}}
  await billing.updatePolicy(owner.id,p);
  const chat=(await call('/chats',studentCookie,'POST',{topicId:units[0].topicId,mode:'explain'})).data;
  const ok=await call(`/chats/${chat.id}/messages`,studentCookie,'POST',{content:'Explain factoring',requestId:crypto.randomUUID()});
  assert.equal(ok.status,200);assert.match(ok.data,/Recovered reply from gemini-4-hydrogen/);assert.equal(attempts,3);
  assert.equal((await billing.view(student.id)).spent,20);
  // Configure maxRetries=2 and fail all 3 attempts -> returns failure with safe error message and releases credits.
  await call('/admin/model',ownerCookie,'PUT',{name:'Retry test',baseUrl:upstream,apiKey:'',model:'gemini-4-hydrogen',protocol:'openai-chat',enabled:true,maxRetries:2});
  attempts=0;failLeft=10;
  const fail=await call(`/chats/${chat.id}/messages`,studentCookie,'POST',{content:'Another question',requestId:crypto.randomUUID()});
  assert.equal(fail.status,200);assert.equal(attempts,3);
  const msgs=(await app.store.state(student.id)).chats[0].messages;
  const last=msgs[msgs.length-1];assert.equal(last.practice?.failed,true);assert.match(last.error??'',/HTTP 503/);
  assert.equal((await billing.view(student.id)).spent,20);
 }finally{await app.close();await new Promise<void>((r,j)=>provider.close(e=>e?j(e):r()))}
});

test('chat review falls back to the working generation model when the configured reviewModel returns HTTP 401/403',async()=>{
 const seen:string[]=[];
 const provider=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);seen.push(body.model);res.setHeader('Content-Type','application/json');if(body.model==='pggo-抗截断-gemini-3.8-flash'){res.writeHead(403);res.end(JSON.stringify({error:'model not permitted for key'}));return}const isReview=body.messages[0].content.includes('獨立的香港中學生練習復核者');res.end(JSON.stringify({choices:[{message:{content:isReview?JSON.stringify({verdict:'pass',reason:'ok'}):'Here is a worked explanation without review fence.'}}]}))});
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 const upstream=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;
 const app=createPilot({database:':memory:',allowSetup:false});const base=`http://127.0.0.1:${await app.listen(0)}`;
 try{
  const owner=await app.store.createUser('owner','fixture-password-123','owner','developer');
  const student=await app.store.createUser('student','fixture-password-123','student','student');
  const studentCookie=`hokse_session=${await app.store.session(student)}`;
  const call=async(path:string,method='GET',body?:unknown)=>{const r=await fetch(base+'/api/v1'+path,{method,headers:{'X-Hokse-Client':'1','X-Hokse-Request-ID':crypto.randomUUID(),Cookie:studentCookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:r.headers.get('content-type')?.includes('text/event-stream')?await r.text():await r.json()}};
  await app.store.putModel({id:'default',name:'Fallback test',baseUrl:upstream,secret:'k',model:'gemini-4-hydrogen',protocol:'openai-chat',enabled:true,maxRetries:1});
  const billing=new Billing(app.store),p=await billing.policy();
  p.models['gemini-4-hydrogen']={credits:20,enabled:true};p.reviewModel='pggo-抗截断-gemini-3.8-flash';
  p.plans.Free.models.push('gemini-4-hydrogen');p.plans.Free.defaultModel='gemini-4-hydrogen';p.plans.Free.defaultModels={quiz:'gemini-4-hydrogen',chat:'gemini-4-hydrogen',evaluation:'gemini-4-hydrogen'};
  await billing.updatePolicy(owner.id,p);
  const chat=(await call('/chats','POST',{topicId:units[0].topicId,mode:'explain'})).data;
  const res=await call(`/chats/${chat.id}/messages`,'POST',{content:'Explain quadratic formula',requestId:crypto.randomUUID()});
  assert.equal(res.status,200);assert.match(res.data,/worked explanation/);
  assert.deepEqual(seen,['gemini-4-hydrogen','pggo-抗截断-gemini-3.8-flash','gemini-4-hydrogen']);
  assert.equal((await billing.view(student.id)).spent,20);
 }finally{await app.close();await new Promise<void>((r,j)=>provider.close(e=>e?j(e):r()))}
});
