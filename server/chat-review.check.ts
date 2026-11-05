import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createPilot} from './app.ts';
import {Billing} from './billing.ts';
import {parseChatContent} from '../src/chat-content.ts';
import {splitReview,reviewedText,checkNumericalConsistency} from './chat-review.ts';
const fence=(kind:string,value:unknown)=>'```'+kind+'\n'+JSON.stringify(value)+'\n```';
const original=fence('exercise',{question:'A works and B fails. Find the probability.',hint:'Classify by S3.',answer:'0.128',explanation:'0.8 \\times 0.2 \\times 0.2 = 0.032'});
const corrected=fence('exercise',{question:'A works and B fails. Find the probability.',hint:'Classify by S3.',answer:'0.032',explanation:'0.8 \\times 0.2 \\times 0.2 = 0.032'});
const intro='Events can be classified into disjoint cases.';
const gen='pggo-抗截断-generation-fixture',review='pggo-抗截断-review-fixture';
async function until(fn:()=>Promise<boolean>){for(let i=0;i<150;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10))}assert.fail('Timed out waiting for fixture')}
async function fixture(){
 let text=fence('review',{scope:'exercises'})+'\n'+intro+'\n'+original,verdict:any={verdict:'corrected',reason:'Independent calculation',content:corrected},waitReview:Promise<void>|undefined,release=()=>{},reviewError=false;
 const calls:{model:string;stage:string}[]=[];
 const provider=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw),stage=body.messages[0].content.includes('獨立的香港中學生練習復核者')?'review':'generation';calls.push({model:body.model,stage});if(stage==='review'&&waitReview)await waitReview;if(stage==='review'&&reviewError){res.writeHead(503);res.end('{}');return}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:stage==='review'?JSON.stringify(verdict):text}}],usage:{prompt_tokens:7,completion_tokens:3,total_tokens:10}}))});
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));const app=createPilot({database:':memory:',databaseUrl:process.env.HOKSE_CHECK_DATABASE_URL,encryptionKey:process.env.HOKSE_CHECK_ENCRYPTION_KEY,allowSetup:false}),billing=new Billing(app.store);
 await app.store.putModel({id:'default',name:'Fixture',baseUrl:`http://127.0.0.1:${(provider.address() as any).port}/v1`,secret:'',protocol:'openai-chat',enabled:true,model:gen});
 const p=await billing.policy();p.models[gen]={credits:2,enabled:true};p.models[review]={credits:99,enabled:true};p.reviewModel=review;p.plans.Free.models=[gen];p.plans.Free.defaultModel=gen;delete p.plans.Free.defaultModels;await billing.updatePolicy('fixture',p);
 const suffix=crypto.randomUUID().slice(0,8),student=await app.store.createUser('chatstudent-'+suffix,'fixturepass','Student','student'),other=await app.store.createUser('another-'+suffix,'fixturepass','Other','student');
 const cookie='hokse_session='+await app.store.session(student),otherCookie='hokse_session='+await app.store.session(other),base=`http://127.0.0.1:${await app.listen(0)}`;
 const call=(path:string,body?:unknown,signal?:AbortSignal,who=cookie)=>fetch(base+'/api/v1'+path,{method:body?'POST':'GET',headers:{Cookie:who,'X-Hokse-Client':'1',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal});
 const chat=await (await call('/chats',{topicId:'maths-quadratic'})).json();
 return {app,billing,student,otherCookie,chat,call,calls,setText:(v:string)=>text=v,setVerdict:(v:any)=>verdict=v,error:()=>reviewError=true,block:()=>{waitReview=new Promise<void>(r=>release=r)},release:()=>release(),send:(requestId=crypto.randomUUID(),signal?:AbortSignal)=>call(`/chats/${chat.id}/messages`,{content:'Explain this idea.',requestId,model:review},signal),read:async()=> (await app.store.state(student.id)).chats[0],close:async()=>{release();await app.close();await new Promise<void>(r=>provider.close(()=>r()))}};
}
test('routing is conservative and the reproduced scalar contradiction is rejected even when a reviewer says pass',()=>{
 assert.equal(splitReview(fence('review',{scope:'none'})+'\nConcept only.','Explain this concept','explain').required,false);
 assert.equal(splitReview(fence('review',{scope:'none'})+'\nThe answer is 3.','Solve this question','explain').body,'');
 assert.equal(splitReview('Unmarked answer.','A question','explain').required,true);
 assert.equal(splitReview(fence('review',{scope:'exercises'})+'\n'+intro+'\n'+corrected,'Explain then give an exercise','explain').body,intro);
 assert.equal(splitReview(fence('review',{scope:'none'})+original,'A question','explain').required,true);
 assert.throws(()=>checkNumericalConsistency(original),/NUMERIC_CONTRADICTION/);assert.doesNotThrow(()=>checkNumericalConsistency(corrected));
 assert.throws(()=>reviewedText(JSON.stringify({verdict:'pass',reason:'Looks good'}),original),/NUMERIC_CONTRADICTION/);
 assert.throws(()=>reviewedText(JSON.stringify({verdict:'corrected',reason:'Removed it',content:'No exercise'}),original),/CHANGED_EXERCISE_COUNT/);
 assert.throws(()=>reviewedText(JSON.stringify({verdict:'uncertain',reason:'Ambiguous'}),corrected),/UNCERTAIN/);
});
test('separate generation and reviewer routes share one charge and replay the corrected same floor without new calls',async()=>{const f=await fixture();try{
 const id=crypto.randomUUID(),res=await f.send(id);assert.equal(res.status,200);assert.match(await res.text(),/event: done/);
 const state=await f.app.store.state(f.student.id),m=state.chats[0].messages[1];assert.equal(state.chats[0].messages.length,2);assert.match(m.content,/0\.032/);assert.doesNotMatch(m.content,/0\.128/);assert.ok(parseChatContent(m.content).blocks.some(b=>b.kind==='exercise'));
 assert.deepEqual(f.calls,[{model:gen,stage:'generation'},{model:review,stage:'review'}]);assert.equal((await f.billing.view(f.student.id)).spent,2);assert.equal(state.events.length,0);assert.equal(state.evidence.length,0);
 const logs=await f.billing.logs(new URLSearchParams());assert.deepEqual(logs.rows.map(l=>l.stage).sort(),['generation','review']);assert.equal(new Set(logs.rows.map(l=>l.operationId)).size,1);
 await (await f.send(id)).text();assert.equal(f.calls.length,2);assert.equal((await f.read()).messages[1].id,m.id);
}finally{await f.close()}});
test('mixed body arrives before the exercise, hidden drafts stay private, and disconnect does not cancel review',async()=>{const f=await fixture();f.block();try{
 const controller=new AbortController(),res=await f.send(crypto.randomUUID(),controller.signal),reader=res.body!.getReader();await until(async()=>f.calls.length===2);
 const mid=await f.read(),m=mid.messages[1];assert.equal(m.content,intro);assert.equal(m.status,'streaming');assert.doesNotMatch(JSON.stringify(mid),/0\.128|Independent calculation|chat-review:/);assert.equal((await f.billing.view(f.student.id)).spent,2);
 await reader.read();controller.abort();f.release();await until(async()=> (await f.read()).messages[1].status==='complete');assert.match((await f.read()).messages[1].content,/0\.032/);
}finally{await f.close()}});
test('pure exercise failure refunds all credits and one retry reuses the generation then charges only once',async()=>{const f=await fixture();f.setText(fence('review',{scope:'all'})+'\n'+original);f.setVerdict({verdict:'uncertain',reason:'Need a recheck'});try{
 await (await f.send()).text();let m=(await f.read()).messages[1];assert.equal(m.content,'');assert.deepEqual(m.practice,{failed:true,retryAvailable:true});assert.equal((await f.billing.view(f.student.id)).spent,0);assert.equal((await f.billing.view(f.student.id)).held,0);
 f.setVerdict({verdict:'corrected',reason:'Recalculated',content:corrected});const id=crypto.randomUUID(),retry=()=>f.call(`/chats/${f.chat.id}/messages/${m.id}/retry`,{requestId:id});
 await (await retry()).text();m=(await f.read()).messages[1];assert.match(m.content,/0\.032/);assert.equal(f.calls.filter(c=>c.stage==='generation').length,1);assert.equal(f.calls.filter(c=>c.stage==='review').length,2);assert.equal((await f.billing.view(f.student.id)).spent,2);await (await retry()).text();assert.equal(f.calls.length,3);
}finally{await f.close()}});
test('a paid partial reply has one free review retry; exhaustion and account isolation prevent extra calls',async()=>{const f=await fixture();f.error();try{
 await (await f.send()).text();const m=(await f.read()).messages[1];assert.equal(m.content,intro);assert.equal((await f.billing.view(f.student.id)).spent,2);
 const path=`/chats/${f.chat.id}/messages/${m.id}/retry`;assert.equal((await f.call(path,{requestId:crypto.randomUUID()},undefined,f.otherCookie)).status,404);
 await (await f.call(path,{requestId:crypto.randomUUID()})).text();assert.equal((await f.billing.view(f.student.id)).spent,2);assert.equal((await f.read()).messages[1].practice?.retryAvailable,false);
 assert.equal((await f.call(path,{requestId:crypto.randomUUID()})).status,409);assert.equal(f.calls.length,3);
}finally{await f.close()}});
test('explicit stop preserves delivered body and prevents a late reviewer from overwriting it',async()=>{const f=await fixture();f.block();try{
 const response=f.send();await until(async()=>f.calls.length===2);assert.equal((await f.call(`/chats/${f.chat.id}/stop`,{})).status,200);f.release();await (await response).text();const m=(await f.read()).messages[1];assert.equal(m.content,intro);assert.equal(m.status,'interrupted');assert.equal((await f.billing.view(f.student.id)).spent,2);
}finally{await f.close()}});
test('expired persisted work becomes a retryable failure without an automatic provider call',async()=>{const f=await fixture();try{
 f.setText(fence('review',{scope:'none'})+'\nA concept.');await (await f.send()).text();const m=(await f.read()).messages[1],id='chat-review:'+f.student.id+':'+m.id;
 await f.app.store.transaction(async()=>{const row=await f.app.store.db.prepare('SELECT body FROM settings WHERE id=?').get(id),r=JSON.parse(f.app.store.decrypt(row!.body));r.state='reviewing';r.leaseUntil=0;await f.app.store.db.prepare('UPDATE settings SET body=? WHERE id=?').run(f.app.store.encrypt(JSON.stringify(r)),id);const data=await f.app.store.state(f.student.id);data.chats[0].messages[1].status='streaming';await f.app.store.save(f.student.id,data)});
 const res=await f.call('/chats/'+f.chat.id),chat=await res.json();assert.equal(chat.messages[1].practice.failed,true);assert.equal(chat.messages[1].content,'A concept.');assert.equal(f.calls.length,1);
}finally{await f.close()}});
test('concurrent duplicate requests share work and changed inputs cannot reuse the active request id',async()=>{const f=await fixture();f.block();try{
 const id=crypto.randomUUID(),first=await f.send(id);await until(async()=>f.calls.length===2);
 const duplicate=await f.send(id);const changed=await f.call(`/chats/${f.chat.id}/messages`,{content:'Different question',requestId:id});assert.equal(changed.status,409);
 f.release();await first.text();await duplicate.text();assert.equal(f.calls.length,2);assert.equal((await f.read()).messages.length,2);assert.equal((await f.billing.view(f.student.id)).spent,2);
}finally{await f.close()}});
test('only an administrator can export original and corrected private practice revisions',async()=>{const f=await fixture();try{
 await (await f.send()).text();const logs=await f.billing.logs(new URLSearchParams()),log=logs.rows.find(l=>l.stage==='review')!,path='/admin/usage/'+log.id+'/review';
 assert.equal((await f.call(path)).status,403);
 const admin=await f.app.store.createUser('admin','fixturepass','Admin','developer'),cookie='hokse_session='+await f.app.store.session(admin);
 const result=await f.call(path,undefined,undefined,cookie);assert.equal(result.status,200);const record=await result.json();assert.equal(record.history[0].verdict,'corrected');assert.match(record.history[0].before,/0\.128/);assert.match(record.history[0].after,/0\.032/);
}finally{await f.close()}});
