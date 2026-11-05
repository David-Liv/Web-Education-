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
  const list=await f.call('/admin/model/models',undefined,'POST',{config:f.draft});assert.equal(list.status,200);assert.deepEqual(list.data.models,['pggo-抗截断-old-model','pggo-抗截断-new-model']);assert.equal(list.data.scope,'draft');assert.equal(f.calls.length,1);assert.equal(f.calls[0].authorization,'Bearer fixture-provider-key');
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
