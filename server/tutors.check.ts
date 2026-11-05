import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createPilot} from './app.ts';
import {Billing} from './billing.ts';
import {parseChatContent} from '../src/chat-content.ts';
import {tutorInstructions} from './tutors.ts';
import {profileUpdate} from '../src/profile-update.ts';
const fence=(kind:string,value:unknown)=>'```'+kind+'\n'+JSON.stringify(value)+'\n```';
const lesson=fence('review',{scope:'all'})+'\n'+fence('teaching',{title:'二次方程：選擇解法',objective:'選擇合適方法並核對根。',sourceIds:['hokse-quadratics','openstax-quadratics'],reference:'檢查標準式與非零的二次項係數。'})+'\n# Choose a method\n\n先整理為標準式。\n\n$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$\n\n| Method | Use |\n| --- | --- |\n| Factorise | Simple factors |\n| Formula | General case |\n\n'+fence('plot',{title:'Quadratic roots',functions:[{expression:'x^2-5*x+6'}],xMin:0,xMax:5,yMin:-2,yMax:7})+'\n'+fence('exercise',{question:'Solve $x^2-5x+6=0$ and explain your first step.',hint:'Look for two factors.',answer:'x=2 or x=3; PRIVATE_ANSWER',explanation:'(x-2)(x-3)=0.'});
async function fixture(database=':memory:'){
 let generated=lesson,reviewFailure=false,reviewerCalls=0,generationCalls=0,lastRequest:any;
 const provider=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);const review=body.messages[0].content.includes('獨立的香港中學生練習復核者');if(review)reviewerCalls++;else{generationCalls++;lastRequest=body}if(review&&reviewFailure){res.writeHead(503);res.end('{}');return}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:review?JSON.stringify({verdict:'pass',reason:'Fixture review'}):generated}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}))});
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 const app=createPilot({database,databaseUrl:process.env.HOKSE_CHECK_DATABASE_URL,encryptionKey:process.env.HOKSE_CHECK_ENCRYPTION_KEY,allowSetup:false}),billing=new Billing(app.store);await app.store.ready;
 const model='pggo-抗截断-tutor-fixture',review='pggo-抗截断-review-fixture';await app.store.putModel({id:'default',name:'Fixture',baseUrl:`http://127.0.0.1:${(provider.address() as any).port}/v1`,secret:'',protocol:'openai-chat',enabled:true,model});
 const policy=await billing.policy();policy.models[model]={credits:2,enabled:true};policy.models[review]={credits:5,enabled:true};policy.reviewModel=review;policy.plans.Free.models=[model];policy.plans.Free.defaultModel=model;delete policy.plans.Free.defaultModels;await billing.updatePolicy('fixture',policy);
 const suffix=crypto.randomUUID().slice(0,8),student=await app.store.createUser('tutor-'+suffix,'fixturepass','Student','student'),other=await app.store.createUser('other-'+suffix,'fixturepass','Other','student');
 const cookie='hokse_session='+await app.store.session(student),otherCookie='hokse_session='+await app.store.session(other),base=`http://127.0.0.1:${await app.listen(0)}`;
 const call=(path:string,method='GET',body?:unknown,who=cookie)=>fetch(base+'/api/v1'+path,{method,headers:{Cookie:who,'X-Hokse-Client':'1',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const chat=await (await call('/chats','POST',{topicId:'maths-quadratic',tutorId:'matt'})).json();
 let closed=false;const closeApp=async()=>{if(!closed){closed=true;await app.close()}};
 return {app,billing,student,cookie,otherCookie,call,chat,closeApp,read:()=>app.store.state(student.id),setText:(value:string)=>generated=value,failReview:()=>reviewFailure=true,allowReview:()=>reviewFailure=false,counts:()=>({generationCalls,reviewerCalls}),request:()=>lastRequest,send:(content='Teach me how to choose a method.',extra:any={})=>call(`/chats/${chat.id}/messages`,'POST',{content,requestId:crypto.randomUUID(),...extra}),close:async()=>{await closeApp();await new Promise<void>(r=>provider.close(()=>r()))}};
}
test('Tutor capabilities are bounded and switching creates an owned fresh chat',async()=>{const f=await fixture();try{
 assert.deepEqual(f.chat.tutor,{id:'matt',version:'1'});assert.ok(f.chat.teaching.mission);
 assert.equal((await f.call('/chats','POST',{topicId:'maths-quadratic',tutorId:'invented'})).status,422);
 assert.equal((await f.call('/chats','POST',{topicId:'chi-reading',tutorId:'matt'})).status,422);
 const changed=await (await f.call('/chats','POST',{topicId:'maths-quadratic',tutorId:'david',sourceChatId:f.chat.id})).json();assert.equal(changed.tutor.id,'david');assert.notEqual(changed.id,f.chat.id);assert.deepEqual(changed.documents,[]);
 assert.equal((await f.call('/chats','POST',{topicId:'maths-quadratic',tutorId:'david',sourceChatId:f.chat.id},f.otherCookie)).status,404);
}finally{await f.close()}});
test('the full settings form saves language and targets while preserving server-owned date and rest days',async()=>{const f=await fixture();try{
 const before=(await f.read()).profile,updates=profileUpdate({...before,teachingLanguage:'en',targetGrades:{maths:'3'},restDates:['2030-01-01']});assert.equal((await f.call('/profile','PATCH',updates)).status,200);const profile=(await f.read()).profile;assert.equal(profile.teachingLanguage,'en');assert.equal(profile.targetGrades.maths,'3');assert.equal(profile.date,before.date);assert.deepEqual(profile.restDates,before.restDates);
 const c=await (await f.call('/chats','POST',{topicId:'maths-quadratic',tutorId:'matt'})).json();assert.equal(c.teachingLanguage,'en');assert.match(c.teaching.constraints,/target: 3/);assert.equal((await f.call('/profile','PATCH',{date:'2030-01-01'})).status,400);
}finally{await f.close()}});
test('Matt delivers a real private PDF, with checked questions, stable versions and one charge',async()=>{const f=await fixture();try{
 const requestId=crypto.randomUUID();await (await f.send(undefined,{requestId})).text();let state=await f.read(),chat=state.chats[0],m=chat.messages[1];assert.equal(m.practice,undefined);assert.ok(m.documentId);assert.equal(chat.documents?.length,1);
 assert.doesNotMatch(JSON.stringify(chat),/PRIVATE_ANSWER|Fixture review|```exercise/);assert.equal(state.evidence.length,0);assert.equal(state.events.length,0);assert.equal((await f.billing.view(f.student.id)).spent,2);assert.deepEqual(f.counts(),{generationCalls:1,reviewerCalls:1});
 const path=`/chats/${chat.id}/documents/${m.documentId}`,download=await f.call(path);assert.equal(download.headers.get('content-type'),'application/pdf');assert.match(download.headers.get('content-disposition')!,/^attachment/);assert.match(Buffer.from(await download.arrayBuffer()).subarray(0,8).toString(),/^%PDF-/);
 assert.equal((await f.call(path,'GET',undefined,f.otherCookie)).status,404);await f.call(path);await f.call(path+'/render','POST',{});assert.deepEqual(f.counts(),{generationCalls:1,reviewerCalls:1});assert.equal((await f.billing.view(f.student.id)).spent,2);
 await (await f.send(undefined,{requestId})).text();assert.equal((await f.read()).chats[0].documents?.length,1);assert.equal((await f.billing.view(f.student.id)).spent,2);
 f.setText(fence('review',{scope:'none'})+'\nTry checking the first factor.');await (await f.send('Give me a hint for Lesson 1 Q1.',{documentId:m.documentId})).text();assert.equal((await f.read()).chats[0].documents?.length,1);assert.match(JSON.stringify(f.request()),/PRIVATE_ANSWER/);assert.equal(f.counts().generationCalls,2);assert.equal(f.counts().reviewerCalls,1);
 f.setText(lesson);await (await f.send('Please revise this lesson.',{lessonAction:'revise',sourceDocumentId:m.documentId})).text();chat=(await f.read()).chats[0];assert.equal(chat.documents?.length,2);assert.equal(chat.documents?.[1].number,1);assert.equal(chat.documents?.[1].version,2);assert.equal(chat.documents?.[0].id,m.documentId);
 await f.call('/chats/'+chat.id,'DELETE');assert.equal((await f.app.store.db.prepare('SELECT id FROM files WHERE id=?').get(m.documentId!)),undefined);
}finally{await f.close()}});
test('failed PDF-only work refunds, and a single retry preserves the original method and content',async()=>{const f=await fixture();try{
 f.failReview();await (await f.send()).text();let m=(await f.read()).chats[0].messages[1];assert.equal(m.content,'');assert.equal(m.practice?.failed,true);assert.equal((await f.billing.view(f.student.id)).spent,0);assert.equal((await f.read()).chats[0].documents?.length,0);
 f.allowReview();await (await f.call(`/chats/${f.chat.id}/messages/${m.id}/retry`,'POST',{requestId:crypto.randomUUID()})).text();m=(await f.read()).chats[0].messages[1];assert.ok(m.documentId);assert.equal(f.counts().generationCalls,1);assert.equal((await f.billing.view(f.student.id)).spent,2);
}finally{await f.close()}});
test('post-review document failure retains checked content; retry renders without any extra model calls',async()=>{const f=await fixture();try{
 const putFile=f.app.store.putFile.bind(f.app.store);f.app.store.putFile=async()=>{throw Object.assign(new Error('Storage limit fixture'),{code:'STORAGE_LIMIT',status:413})};
 await (await f.send()).text();const state=await f.read(),m=state.chats[0].messages[1];assert.equal(m.practice?.failed,true);assert.equal(state.chats[0].documents?.length,0);assert.equal((await f.billing.view(f.student.id)).spent,0);assert.equal(Number((await f.app.store.db.prepare('SELECT count(*) AS n FROM files WHERE user_id=?').get(f.student.id))!.n),0);
 f.app.store.putFile=putFile;
 await (await f.call(`/chats/${f.chat.id}/messages/${m.id}/retry`,'POST',{requestId:crypto.randomUUID()})).text();assert.ok((await f.read()).chats[0].messages[1].documentId);assert.deepEqual(f.counts(),{generationCalls:1,reviewerCalls:1});assert.equal((await f.billing.view(f.student.id)).spent,2);
}finally{await f.close()}});
test('learning records need a real student quote, confirmation does not create mastery',async()=>{const f=await fixture();try{
 await (await f.send()).text();f.setText(fence('review',{scope:'none'})+'\n'+fence('teaching',{record:{kind:'insight',text:'Student explained substitution as a check.',quote:'substitute',term:'代入核對',definition:'把求得的根代入原式核對。'}})+'\nThat is a useful check.');
 await (await f.send('I can substitute to check.')).text();let state=await f.read();assert.equal(state.tutorMemory?.records.length,1);assert.equal(state.tutorMemory?.terms.length,0);const id=state.tutorMemory!.records[0].id;
 const pub=await (await f.call('/bootstrap')).json();assert.equal(pub.pendingTutorTerms,undefined);assert.equal((await f.call('/tutor-memory/'+id,'PUT',{confirmed:true},f.otherCookie)).status,404);await f.call('/tutor-memory/'+id,'PUT',{confirmed:true});state=await f.read();assert.equal(state.tutorMemory?.terms.length,1);assert.equal(state.evidence.length,0);
 await (await f.send('Something else.')).text();assert.equal((await f.read()).tutorMemory?.records.length,1);
 const instructions=tutorInstructions(state.chats[0],state,false);assert.match(instructions,/Matt/);assert.doesNotMatch(instructions,/David 教學法/);
 assert.equal(parseChatContent(fence('teaching',{title:'Hidden title'})).blocks.length,0);
}finally{await f.close()}});
test('a concept-only PDF uses one generation without a redundant exercise review',async()=>{const f=await fixture();try{
 f.setText(fence('review',{scope:'none'})+'\n'+fence('teaching',{title:'Choosing a strategy',objective:'Recognise when factorisation is useful.',sourceIds:['hokse-quadratics']})+'\nThink about the structure first. Compare the available methods before doing any calculation.');
 await (await f.send('Explain the main idea.')).text();const c=(await f.read()).chats[0];assert.ok(c.messages[1].documentId);assert.equal(c.documents?.[0].questions,0);assert.deepEqual(f.counts(),{generationCalls:1,reviewerCalls:0});assert.equal((await f.billing.view(f.student.id)).spent,2);
}finally{await f.close()}});
test('split teaching metadata stays hidden and combines lesson and record fields',()=>{
 const p=parseChatContent(fence('teaching',{title:'A lesson',sourceIds:['hokse-quadratics']})+'\n'+fence('teaching',{record:{kind:'insight',text:'A grounded note',quote:'my words'}}));assert.equal(p.teaching?.title,'A lesson');assert.equal(p.teaching?.record?.quote,'my words');assert.equal(p.blocks.filter(b=>b.kind==='markdown'&&b.text.trim()).length,0);
});
test('unsupported PDF math never produces a fake download or retained charge',async()=>{const f=await fixture();try{
 f.setText(lesson+'\n$$\\href{https://example.com}{unsupported}$$');await (await f.send()).text();const c=(await f.read()).chats[0];assert.equal(c.documents?.length,0);assert.equal(c.messages[1].documentId,undefined);assert.equal(c.messages[1].practice?.failed,true);assert.equal((await f.billing.view(f.student.id)).spent,0);
}finally{await f.close()}});
test('private PDF and its checked source survive an API restart without another model call',{skip:!!process.env.HOKSE_CHECK_DATABASE_URL},async()=>{
 const parent=resolve('.data/tests');mkdirSync(parent,{recursive:true});const dir=mkdtempSync(parent+sep+'tutor-'),path=dir+sep+'test.sqlite',f=await fixture(path);let reopened:ReturnType<typeof createPilot>|undefined;
 try{await (await f.send()).text();const document=(await f.read()).chats[0].documents![0],url=`/api/v1/chats/${f.chat.id}/documents/${document.id}`,before=Buffer.from(await (await f.call(url.replace('/api/v1',''))).arrayBuffer());await f.closeApp();
  reopened=createPilot({database:path,allowSetup:false});const port=await reopened.listen(0),after=await fetch(`http://127.0.0.1:${port}`+url,{headers:{Cookie:f.cookie}});assert.equal(after.status,200);assert.deepEqual(Buffer.from(await after.arrayBuffer()),before);assert.equal((await reopened.store.state(f.student.id)).chats[0].tutor?.id,'matt');assert.equal((await new Billing(reopened.store).view(f.student.id)).spent,2);assert.deepEqual(f.counts(),{generationCalls:1,reviewerCalls:1});
 }finally{await reopened?.close();await f.close();assert.ok(resolve(dir).startsWith(parent+sep));rmSync(dir,{recursive:true,force:true})}
});
