import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createPilot } from './app.ts';
import { Billing } from './billing.ts';
import { parseChatContent } from '../src/chat-content.ts';
const fence=(kind:string,value:unknown)=>'```'+kind+'\n'+JSON.stringify(value)+'\n```';
test('chat returns folded practice in one billed operation, replays it, and rejects a malformed draft after its one review',async()=>{
 let calls=0,invalid=false;const provider=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw);calls++;assert.match(input.messages[0].content,/suggestions/);assert.match(input.messages[0].content,/exercise/);
 const content=invalid?fence('exercise',{answer:'invalid-only'}):'A short explanation.\n\n'+fence('exercise',{question:'Solve x²−5x+6=0.',hint:'Factor it.',answer:'2 or 3',explanation:'(x−2)(x−3)=0.'})+'\n'+fence('suggestions',[{label:'A hint',prompt:'Give me a hint without the answer.'},{label:'Another example',prompt:'Explain the method using a different example.'},{label:'Use a graph',prompt:'Plot this quadratic and show its roots.'}]);
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:input.messages[0].content.includes('獨立的香港中學生練習復核者')?JSON.stringify({verdict:'pass',reason:'Fixture checked'}):content}}],usage:{prompt_tokens:100,completion_tokens:100,total_tokens:200}}));});
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));const app=createPilot({database:':memory:',allowSetup:false});
 try{const student=await app.store.createUser('chatstudent','fixture-password','Student','student'),cookie='hokse_session='+await app.store.session(student),base=`http://127.0.0.1:${await app.listen(0)}`;
 const model='pggo-抗截断-chat-fixture';await app.store.putModel({id:'default',name:'Fixture',baseUrl:`http://127.0.0.1:${(provider.address() as any).port}/v1`,secret:'',protocol:'openai-chat',model,enabled:true});
 const billing=new Billing(app.store),policy=await billing.policy();policy.models[model]={credits:2,enabled:true};policy.plans.Free.models=[model];policy.plans.Free.defaultModel=model;delete policy.plans.Free.defaultModels;await billing.updatePolicy('fixture',policy);
 const call=(path:string,body:unknown)=>fetch(base+'/api/v1'+path,{method:'POST',headers:{Cookie:cookie,'X-Hokse-Client':'1','Content-Type':'application/json'},body:JSON.stringify(body)});
 const chat=await (await call('/chats',{topicId:'maths-quadratic'})).json(),requestId=crypto.randomUUID();
 const response=await call(`/chats/${chat.id}/messages`,{content:'Explain and give me a short question.',requestId});assert.equal(response.status,200);assert.match(await response.text(),/event: done/);assert.equal(calls,2);
 const state=await app.store.state(student.id),message=state.chats[0].messages[1];assert.equal(parseChatContent(message.content).suggestions.length,3);assert.ok(parseChatContent(message.content).blocks.some(b=>b.kind==='exercise'));assert.equal(state.evidence.length,0);assert.equal(state.events.length,0);assert.equal((await billing.view(student.id)).spent,2);
 const repeat=await call(`/chats/${chat.id}/messages`,{content:'Explain and give me a short question.',requestId});assert.equal(repeat.status,200);await repeat.text();assert.equal(calls,2);assert.equal((await billing.view(student.id)).spent,2);
 invalid=true;const failed=await call(`/chats/${chat.id}/messages`,{content:'Draw a graph.',requestId:crypto.randomUUID()});assert.equal(failed.status,200);await failed.text();assert.equal((await app.store.state(student.id)).chats[0].messages.at(-1)?.practice?.failed,true);assert.equal(calls,4);assert.equal((await billing.view(student.id)).spent,2);
 }finally{await app.close();await new Promise<void>(r=>provider.close(()=>r()))}
});
