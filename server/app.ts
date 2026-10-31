import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { Store } from './store.ts';
import type { PrivateQuiz, StudentState } from './store.ts';
import { completeReview, createQuiz, publicQuestion, publicQuiz, recordLearning, reject, reviewView, saveAnswers, studentView, submitQuiz } from './learning.ts';
import { handleStudio } from './studio.ts';
import { units, planningPacks } from './studio-state.ts';
import { generate, listModels, publicModel, validateModel } from './models.ts';
import { packCSV, packFromCSV } from './csv.ts';
import { planStudent, reconcileToday } from './planner.ts';
import { assessSkill, compareGradePaths, updateCycle, validatePack } from '../src/pilot-rules.ts';
import { RULE_VERSION } from '../src/pilot-types.ts';
import type { ContentPack, Identity, VersionedPreview } from '../src/pilot-types.ts';
import type { Task } from '../src/types.ts';
import { addDays, validateTask } from '../src/domain.ts';
import { catalog } from '../src/data/catalog.ts';

interface Options { databaseUrl?:string; encryptionKey?:string; database?:string; staticDir?:string; allowSetup?:boolean; secureCookie?:boolean; origin?:string }
const MIME:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.csv':'text/csv; charset=utf-8','.svg':'image/svg+xml','.wav':'audio/wav','.png':'image/png','.woff2':'font/woff2'};
const validRoles=['student','reviewer','developer'];
const active=new Map<string,AbortController>();

export function createPilot(options:Options={}){
  const store=new Store(options.database??resolve('.data/pilot.sqlite'),{databaseUrl:options.databaseUrl,encryptionKey:options.encryptionKey});
  const attempts=new Map<string,{n:number;until:number}>();
  const assets=new Map<string,{mtime:number;bytes:Buffer;gzip?:Buffer;etag:string}>();
  function bodyLimit(req:IncomingMessage,max=3*1024*1024):Promise<Buffer>{return new Promise((resolve,reject)=>{const chunks:Buffer[]=[];let size=0;req.on('data',c=>{size+=c.length;if(size>max){reject(Object.assign(new Error('內容超過允許大小'),{status:413}));req.pause();return}chunks.push(c)});req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject)})}
  const server=createServer(async(req,res)=>{
    const send=(data:unknown,status=200)=>{if(!res.headersSent){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))}};
    try{
      const url=new URL(req.url??'/',`http://${req.headers.host??'localhost'}`);const path=url.pathname.replace(/^\/api\/v1/,'');const method=req.method??'GET';
      if(!url.pathname.startsWith('/api/v1/')){
        if(url.pathname==='/health'){send({ok:true});return}
        if(!options.staticDir){send({error:{code:'NOT_FOUND',message:'請從前端開啟學習工作室'}},404);return}
        if(!['GET','HEAD'].includes(method))reject('不支援的方法',405);
        const root=resolve(options.staticDir),candidate=resolve(root,'.'+decodeURIComponent(url.pathname));
        if(candidate!==root&&!candidate.startsWith(root+sep))reject('無法讀取',404);
        const file=existsSync(candidate)&&statSync(candidate).isFile()?candidate:resolve(root,'index.html');
        if(!existsSync(file))reject('請先建立正式前端',503);
        const mtime=statSync(file).mtimeMs,type=MIME[extname(file)]??'application/octet-stream';
        let asset=assets.get(file);if(!asset||asset.mtime!==mtime){const bytes=readFileSync(file);asset={mtime,bytes,etag:`W/"${createHash('sha256').update(bytes).digest('base64url')}"`};assets.set(file,asset)}
        const headers:Record<string,string>={'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':file!==resolve(root,'index.html')&&url.pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache',ETag:asset.etag,Vary:'Accept-Encoding'};
        if(req.headers['if-none-match']?.split(',').some(tag=>tag.trim()===asset.etag||tag.trim()==='*')){res.writeHead(304,headers);res.end();return}
        let bytes=asset.bytes;
        if(asset.bytes.length>1024&&/text\/|javascript|json|svg/.test(type)&&/\bgzip\b/.test(req.headers['accept-encoding']??'')){asset.gzip??=gzipSync(asset.bytes);bytes=asset.gzip;headers['Content-Encoding']='gzip'}
        headers['Content-Length']=String(bytes.length);res.writeHead(200,headers);res.end(method==='HEAD'?undefined:bytes);return;
      }
      if(method!=='GET'){
        const origin=options.origin??`${options.secureCookie?'https':'http'}://${req.headers.host}`;
        if(req.headers.origin&&req.headers.origin!==origin)reject('請從本網站提交操作',403,'ORIGIN');
        if(req.headers['x-hokse-client']!=='1')reject('缺少網站請求標記',403,'ORIGIN');
      }
      const input=method==='GET'||method==='DELETE'?{}:path==='/attachments/upload'?{}:await (async()=>{const raw=await bodyLimit(req);if(!raw.length)return {};try{return JSON.parse(raw.toString())}catch{reject('請提供有效 JSON')}})();
      const token=(req.headers.cookie??'').split(';').map(c=>c.trim()).find(c=>c.startsWith('hokse_session='))?.slice(14)??'';
      const identity=(await store.identity(token));
      const cookie=(value:string,maxAge:number)=>res.setHeader('Set-Cookie',`hokse_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${options.secureCookie?'; Secure':''}`);
      if(path==='/auth/status'&&method==='GET'){send({identity,setupRequired:(await store.userCount())===0&&options.allowSetup!==false});return}
      if((path==='/auth/login'||path==='/auth/setup')&&method==='POST'){
        const username=String(input.username??'').trim().toLowerCase(),password=String(input.password??'');
        if(!/^[a-z0-9_.-]{2,40}$/.test(username)||password.length<10||password.length>200)reject('帳戶需 2–40 個英數字元；密碼至少 10 字元');
        const ip=req.socket.remoteAddress??'unknown',key=ip+':'+username,rate=attempts.get(key);
        if(rate&&rate.until>Date.now()&&rate.n>=12)reject('嘗試次數較多，請十分鐘後再試',429);
        attempts.set(key,{n:rate&&rate.until>Date.now()?rate.n+1:1,until:Date.now()+600000});
        let user:Identity|null;
        if(path==='/auth/setup'){
          if((await store.userCount())||options.allowSetup===false||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip))reject('初始設定只可在本機且無帳戶時執行',403);
          user=(await store.createUser(username,password,String(input.name??'開發者').slice(0,30),'developer',true));
        }else user=(await store.authenticate(username,password));
        if(!user)reject('帳戶或密碼不正確',401,'UNAUTHENTICATED');
        attempts.delete(key);cookie((await store.session(user)),604800);send(user);return;
      }
      if(!identity)reject('請先登入邀請帳戶',401,'UNAUTHENTICATED');
      if(path==='/auth/logout'&&method==='POST'){(await store.logout(token));cookie('',0);send({ok:true});return}
      const role=(allowed:string[])=>{if(!allowed.includes(identity.role))reject('此功能僅供獲授權的開發者／內容復核者',403,'FORBIDDEN')};
      const change=async <T>(fn:(data:StudentState)=>T|Promise<T>)=>(await store.transaction(async ()=>{const data=(await store.state(identity.id));const result=await fn(data);(await store.save(identity.id,data));return result}));
      const packs=(await store.latestPacks());
      const coaching=units.map(u=>({...u,lessons:[{title:u.title,text:u.lesson,skillIds:u.skills.map(s=>s.id)}]}));
      const allTopics=[...catalog.topics,...units.filter(u=>!catalog.topics.some(t=>t.id===u.topicId)).map(u=>({id:u.topicId,subjectId:u.subjectId,name:u.title,en:u.title,unit:u.title,module:'自主輔導',papers:['技能練習'],ready:true,summary:[u.lesson],source:'本平台原創學習參考；不是官方定級'}))];
      if(path.startsWith('/studio')){const controller=new AbortController();const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(90000)]);res.once('close',()=>{if(!res.writableEnded)controller.abort()});await handleStudio(store,identity,path,method,input,send,signal);return;}
      const quizFor=(data:StudentState,id:string)=>data.quizzes.find(q=>q.id===id)??reject('找不到此帳戶的測驗',404,'NOT_FOUND');
      if(path==='/admin/users'){
        role(['developer']);if(method==='GET'){send((await store.db.prepare('SELECT id,username,name,role FROM users ORDER BY username').all()));return}
        if(method==='POST'){if(!/^[a-z0-9_.-]{2,40}$/i.test(input.username??'')||typeof input.password!=='string'||input.password.length<10||input.password.length>200||!validRoles.includes(input.role)||!String(input.name??'').trim())reject('請檢查帳戶、密碼、角色及名字');send((await store.createUser(input.username,input.password,String(input.name).slice(0,30),input.role)),201);return}
      }
      if(path==='/admin/content'&&method==='GET'){role(['developer','reviewer']);send((await store.packs()));return}
      if(path==='/admin/grading'){
        role(['developer','reviewer']);
        if(method==='GET'){const rows=(await store.db.prepare('SELECT s.body,u.id,u.name FROM students s JOIN users u ON s.user_id=u.id').all()) as any[];const pending=rows.flatMap(row=>{const data:StudentState=JSON.parse(row.body);return data.quizzes.filter(q=>q.submittedAt).flatMap(q=>(q.results??[]).filter(m=>m.state==='pending').map(m=>({userId:row.id,studentName:row.name,quizId:q.id,question:q.snapshot.find(x=>x.id===m.questionId),answer:q.answers[m.questionId],attachmentUrl:q.answers[m.questionId]?.attachmentId?`/api/v1/admin/grading/attachments/${q.answers[m.questionId].attachmentId}`:undefined})))});send(pending);return}
        if(method==='POST'){send((await store.transaction(async ()=>{const data=(await store.state(input.userId)),quiz=quizFor(data,input.quizId),q=quiz.snapshot.find(q=>q.id===input.questionId)??reject('題目不存在',404),mark=quiz.results?.find(m=>m.questionId===q.id);if(!mark||mark.state!=='pending')reject('此題不在待批改狀態',409);if(!Number.isFinite(input.awarded)||input.awarded<0||input.awarded>q.marks||typeof input.criticalPassed!=='boolean'||String(input.feedback??'').trim().length<8||input.awarded===q.marks&&!input.criticalPassed)reject('得分、關鍵條件及回饋無效');mark.awarded=input.awarded;mark.correct=input.awarded===q.marks;mark.explanation=String(input.feedback).slice(0,4000);mark.state='graded';mark.feedbackSource='manual';mark.reviewedBy=identity.id;mark.reviewedAt=new Date().toISOString();const pack=quiz.blueprints?.find(p=>p.topicId===q.topicId)??packs.find(p=>p.topicId===q.topicId);data.evidence.push({id:crypto.randomUUID(),topicId:q.topicId,questionId:q.id,quizId:quiz.id,date:data.profile.date,at:quiz.submittedAt!,awarded:input.awarded,max:q.marks,independent:!!quiz.independence?.[q.id],familyId:q.familyId,skillIds:q.skillIds,requiredSkillIds:pack?.skills.map(s=>s.id),contentVersion:quiz.contentVersions.join(','),ruleVersion:RULE_VERSION,criticalPassed:input.criticalPassed,reviewed:true});for(const id of q.skillIds)data.cycles=updateCycle(data.cycles,id,mark.correct===true,q.id,new Date().toISOString());if(mark.correct===false){data.wrong.push({questionId:q.id,topicId:q.topicId,lastAnswer:quiz.answers[q.id]?.value??'',date:data.profile.date,reason:'待確認',resolved:false});data.errors.push({questionId:q.id,quizId:quiz.id,topicId:q.topicId,skillIds:q.skillIds,observed:'人工評分依據：'+mark.explanation,candidates:[],status:'reviewed',history:[{at:mark.reviewedAt,value:mark.explanation,by:identity.id}]})}quiz.response={skills:packs.filter(p=>quiz.topicIds.includes(p.topicId)).flatMap(p=>p.skills.map(s=>assessSkill(s,data.evidence))),scope:'只涵蓋本次單元技能，不代表整科 DSE 等級',nextStep:true,pausedSkills:data.cycles.filter(c=>c.paused).map(c=>c.skillId)};(await store.save(input.userId,data));return {ok:true,reviewer:identity.name}})));return}
      }
      if(path.startsWith('/admin/grading/attachments/')&&method==='GET'){role(['developer','reviewer']);const id=path.split('/').at(-1)!;const rows=(await store.db.prepare('SELECT body FROM students').all()) as any[];if(!rows.some(r=>(JSON.parse(r.body) as StudentState).quizzes.some(q=>q.submittedAt&&q.results?.some(m=>m.state==='pending'&&q.answers[m.questionId]?.attachmentId===id))))reject('此附件不屬於待批改作答',404);const file=(await store.db.prepare('SELECT * FROM files WHERE id=?').get(id)) as any;if(!file)reject('附件不存在',404);res.writeHead(200,{'Content-Type':file.type,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});res.end(file.data);return}
      if(path==='/admin/content/import'&&method==='POST'){
        role(['developer','reviewer']);let pack:ContentPack;
        try{pack=input.csv?packFromCSV(input.csv,input.metadata):structuredClone(input.pack);if(!pack)reject('缺少內容包');pack.status='draft';pack.reviews=[];pack.professionalVerified=false;delete pack.publishedAt;const errors=validatePack(pack);if(errors.length){send({valid:false,errors});return}}catch(e){reject(`匯入格式無效：${(e as Error).message}`)}
        await store.contentTransaction(async()=>{
        if((await store.packs()).some(p=>p.id===pack.id&&p.version===pack.version))reject('此版本已存在；請增加版本號，不能覆寫既有內容',409);
        const otherPacks=(await store.packs()).filter(p=>p.id!==pack.id);
        if(otherPacks.some(p=>p.topicId===pack.topicId||p.questions.some(q=>pack.questions.some(item=>item.id===q.id))||p.skills.some(s=>pack.skills.some(item=>item.id===s.id))))reject('單元、題號或技能與另一內容包衝突；同一內容請沿用內容包 ID 並增加版本',409,'CONTENT_CONFLICT');
        if(input.preview!==false){send({valid:true,pack,previewOnly:true});return}
        (await store.putPack(pack));send({valid:true,id:pack.id,version:pack.version},201);return;
        });return;
      }
      const contentMatch=path.match(/^\/admin\/content\/([^/]+)\/(\d+)(?:\/(review|publish|csv))?$/);
      if(contentMatch){role(['developer','reviewer']);const [,id,version,action]=contentMatch;await store.contentTransaction(async()=>{const pack=(await store.packs()).find(p=>p.id===id&&p.version===Number(version))??reject('內容版本不存在',404);
        if(action==='csv'&&method==='GET'){res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${id}-v${version}.csv"`});res.end(packCSV(pack));return}
        if(action==='review'&&method==='POST'){
          if(pack.status==='published')reject('已發布版本不可修改，請建立新版本',409);
          const lesson=String(input.questionId??'').match(/^lesson-(\d+)$/);const validTarget=pack.questions.some(q=>q.id===input.questionId)||!!lesson&&Number(lesson[1])<pack.lessons.length;
          if(!validTarget||String(input.method??'').trim().length<8||input.confirmed!==true)reject('請逐題／逐段核對，並記錄答案、評分點或教材的復核方法');
          pack.reviews=pack.reviews.filter(r=>!(r.userId===identity.id&&r.questionId===input.questionId));pack.reviews.push({questionId:input.questionId,userId:identity.id,reviewer:identity.name,at:new Date().toISOString(),method:input.method.slice(0,1000)});(await store.putPack(pack));send(pack);return;
        }
        if(action==='publish'&&method==='POST'){
          const errors=validatePack(pack);const pending=[...pack.questions.map(q=>q.id),...pack.lessons.map((_,i)=>`lesson-${i}`)].filter(id=>new Set(pack.reviews.filter(r=>r.questionId===id).map(r=>r.userId)).size<2);
          if(errors.length||pending.length)reject(`尚不能發布：${errors.join('；')||`${pending.length} 個題目／教學段落未完成兩個不同帳戶的復核`}`,422,'REVIEW_REQUIRED');
          pack.status='published';pack.publishedAt=new Date().toISOString();(await store.putPack(pack));send(pack);return;
        }
        reject('找不到此內容操作',404);
      });return}
      if(path==='/admin/model'){
        role(['developer']);if(method==='GET'){send(publicModel((await store.model())));return}if(method==='PUT'){const config=validateModel(input,(await store.model()));(await store.putModel(config));send(publicModel(config));return}
      }
      if(path.startsWith('/admin/model/')&&method==='POST'){
        role(['developer']);const config=(await store.model())??reject('請先保存 API 設定');
        if(path.endsWith('/models')){config.models=await listModels(config);(await store.putModel(config));send({models:config.models});return}
        if(path.endsWith('/test')){const text=await generate(config,[{role:'user',content:'請用一句簡短繁體中文確認你可回覆文字。'}]);config.tested={at:new Date().toISOString(),model:config.model,ok:true};(await store.putModel(config));send({ok:true,text,capabilities:{text:true,images:'未測試',nativeStreaming:'未測試',structuredOutput:'未測試'}});return}
      }
      if(path==='/catalog'&&method==='GET'){const topicIds=new Set(packs.map(p=>p.topicId));send({...catalog,topics:allTopics.map(t=>{const p=packs.find(p=>p.topicId===t.id),u=units.find(u=>u.topicId===t.id);return {...t,ready:topicIds.has(t.id)||!!u,summary:p?.lessons.map(l=>l.text)??(u?[u.lesson]:[]),example:undefined,formula:undefined,misconception:undefined,source:p?.source??(u?'本平台原創自主輔導參考；不是已審校題庫':t.source)}}),sources:[...catalog.sources,{label:'首期真實內容',url:'/pilot',note:'只對已完成內容復核的二次方程、酸鹼與滴定開放正式診斷'}]});return}
      if(path.startsWith('/content/')&&method==='GET'){const p=(packs.find(p=>p.topicId===path.split('/')[2])??coaching.find(p=>p.topicId===path.split('/')[2]))??reject('此內容尚未發布',404);send({topicId:p.topicId,title:p.title,version:'version' in p?p.version:1,lessons:p.lessons,skills:p.skills});return}
      if(path==='/bootstrap'&&method==='GET'){send(studentView((await store.state(identity.id)),identity,packs));return}
      if(path==='/profile'&&method==='GET'){send((await store.state(identity.id)).profile);return}
      if(path==='/profile'&&method==='PATCH'){
        send((await change(data=>{
          const allowed=['name','year','teachingLanguage','subjects','mathModule','chemistryElectives','grades','targetGrades','gradeSource','primaryProgramme','backupProgrammes','dailyMinutes','availability','reviewPercent'];
          if(Object.keys(input).some(k=>!allowed.includes(k)))reject('此設定不能修改');
          if(input.name!==undefined&&(!String(input.name).trim()||String(input.name).length>30))reject('名字須為 1–30 字');
          if(input.year!==undefined&&![2028,2029].includes(input.year))reject('目前支援 2028／2029 備試');
          if(input.teachingLanguage&&!['zh-HK','en'].includes(input.teachingLanguage))reject('內容語言無效');
          if(input.subjects&&(!Array.isArray(input.subjects)||input.subjects.some((id:string)=>!catalog.subjects.some(s=>s.id===id))))reject('科目無效');
          if(input.dailyMinutes&&(!Array.isArray(input.dailyMinutes)||input.dailyMinutes.length!==7||input.dailyMinutes.some((n:any)=>!Number.isInteger(n)||n<0||n>480)))reject('每日時間須為七個 0–480 分鐘數值');
          if(input.availability&&(!Array.isArray(input.availability)||input.availability.length!==7||input.availability.some((s:any)=>typeof s!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))))reject('可用時段格式無效');
          if(input.reviewPercent!==undefined&&(!Number.isFinite(input.reviewPercent)||input.reviewPercent<0||input.reviewPercent>60))reject('復習比例須為 0–60%');
          if(input.mathModule&&!['none','M1','M2'].includes(input.mathModule))reject('數學模組無效');
          if(input.chemistryElectives&&(!Array.isArray(input.chemistryElectives)||input.chemistryElectives.length>2||input.chemistryElectives.some((id:string)=>!['chem-industrial','chem-materials','chem-analytical'].includes(id))))reject('化學選修無效');
          for(const key of ['grades','targetGrades'])if(input[key]&&(typeof input[key]!=='object'||Array.isArray(input[key])||Object.entries(input[key]).some(([id,g])=>(!catalog.subjects.some(s=>s.id===id)&&!['M1','M2'].includes(id))||!['U','1','2','3','4','5','5*','5**','A'].includes(String(g)))))reject('成績或科目無效');
          if(input.primaryProgramme&&!catalog.programmes.some(p=>p.id===input.primaryProgramme))reject('課程不存在');
          if(input.backupProgrammes&&(!Array.isArray(input.backupProgrammes)||input.backupProgrammes.length>2||input.backupProgrammes.some((id:string)=>!catalog.programmes.some(p=>p.id===id))))reject('備選課程無效');
          Object.assign(data.profile,input);return data.profile;
        })));return;
      }
      if(path==='/question-options'&&method==='GET'){send(packs.flatMap(p=>p.questions).map(q=>({id:q.id,topicId:q.topicId,paper:q.paper,kind:q.kind,difficulty:q.difficulty})));return}
      if(path==='/quizzes'&&method==='POST'){send((await change(data=>{const q=createQuiz(data,packs,input);return {quiz:publicQuiz(q),questions:q.snapshot.map(publicQuestion)}})),201);return}
      const quizMatch=path.match(/^\/quizzes\/([^/]+)(?:\/(answers|submit|hint|review-grade))?$/);
      if(quizMatch){const [,id,action]=quizMatch;
        if(!action&&method==='GET'){const q=quizFor((await store.state(identity.id)),id);send({quiz:publicQuiz(q),questions:q.snapshot.map(publicQuestion)});return}
        if(action==='hint'&&method==='POST'){send((await change(data=>{const q=quizFor(data,id);if(q.submittedAt||q.kind==='timed')reject('此測驗不開放提示',409);const item=q.snapshot.find(q=>q.id===input.questionId)??reject('題目不屬於此測驗',404);if(!data.assists.some(a=>a.quizId===id&&a.questionId===item.id&&a.kind==='hint'))data.assists.push({questionId:item.id,quizId:id,at:new Date().toISOString(),kind:'hint'});if(q.answers[item.id])q.answers[item.id].hinted=true;return {hint:item.hint}})));return}
        if(action==='answers'&&method==='PUT'){send((await change(data=>{const q=quizFor(data,id);saveAnswers(data,q,input.answers);return publicQuiz(q)})));return}
        if(action==='submit'&&method==='POST'){send((await change(data=>{const q=quizFor(data,id);if(!q.submittedAt&&input.answers&&!(q.kind==='timed'&&Date.now()>Date.parse(q.startedAt)+q.durationMinutes*60000))saveAnswers(data,q,input.answers);return submitQuiz(data,q,packs)})));return}
      }
      if(path==='/learning-state'&&method==='GET'){const data=(await store.state(identity.id));send({skills:packs.flatMap(p=>p.skills.map(s=>assessSkill(s,data.evidence))),cycles:data.cycles});return}
      if(path==='/plans/reconcile'&&method==='POST'){send((await store.transaction(async ()=>{const data=(await store.state(identity.id)),changed=reconcileToday(data);if(changed)(await store.save(identity.id,data));return {changed}})));return}
      if(path==='/remediation'&&method==='POST'){
        send((await change(data=>{if(!['worked-example','prerequisite','rest'].includes(input.action))reject('補救動作無效');const c=data.cycles.find(c=>c.skillId===input.skillId)??reject('補救周期不存在',404);if(input.action!=='rest'){const p=packs.find(p=>p.skills.some(s=>s.id===c.skillId))!;recordLearning(data,p.topicId,`前置補救 · ${c.skillId}`,'lesson',5,'/pilot');c.failures=0;c.paused=false;c.questionIds=[];c.updatedAt=new Date().toISOString();return {cycle:c,lessons:p.lessons,topicId:p.topicId,title:p.title}}return {cycle:c}})));return;
      }
      if(path==='/daily-review'&&method==='GET'){send(reviewView((await store.state(identity.id)),allTopics));return}
      const reviewMatch=path.match(/^\/review-items\/([^/]+)(?:\/(complete))?$/);
      if(reviewMatch){const [,id,action]=reviewMatch;if(action==='complete'&&method==='POST'){send((await change(data=>{completeReview(data,id);return reviewView(data,allTopics)})));return}if(method==='PATCH'){send((await change(data=>{const r=data.reviews.find(r=>r.id===id)??reject('復習不存在',404);if(input.confidence){if(!['不懂','模糊','熟悉'].includes(input.confidence))reject('自評無效');r.confidence=input.confidence}if(input.postpone){r.dueDate=addDays(data.profile.date,1);r.postponedUntil=r.dueDate}return r})));return}}
      if(path==='/events'&&method==='POST'){send((await change(data=>{if(!packs.some(p=>p.topicId===input.topicId)&&!units.some(u=>u.topicId===input.topicId))reject('此單元未開放',422);if(!['lesson','quiz','chat','review',undefined].includes(input.type))reject('活動類型無效');if(!data.events.some(e=>e.topicId===input.topicId&&e.type===(input.type??'lesson')&&e.date===data.profile.date))recordLearning(data,input.topicId,'完成單元學習',input.type??'lesson',Math.max(1,Math.min(60,Number(input.minutes)||10)),`/subjects/${input.topicId}`);return {ok:true}})));return}
      const wrongMatch=path.match(/^\/wrong\/([^/]+)$/);
      const analyseMatch=path.match(/^\/wrong\/([^/]+)\/analyse$/);
      if(analyseMatch&&method==='POST'){
        const state=(await store.state(identity.id)),q=state.quizzes.filter(q=>q.submittedAt).flatMap(q=>q.snapshot).find(q=>q.id===analyseMatch[1])??reject('此題尚未開放回饋',404),error=state.errors.filter(e=>e.questionId===q.id).at(-1)??reject('沒有可分析的錯誤作答',404),config=(await store.model())??reject('開發者尚未設定模型',503,'MODEL_NOT_CONFIGURED');
        const result=await generate(config,[{role:'system',content:'只回 JSON：{"candidates":[{"reason":"候選原因","evidence":"學生作答中的具體依據"}]}。最多三項。沒有過程就保留不確定，不憑最終答案斷定錯因。學生可以糾正，不能改分數或掌握度。'},{role:'user',content:JSON.stringify({prompt:q.prompt,answer:q.answer,observed:error.observed})}]);
        let parsed:any;try{parsed=JSON.parse(result.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''))}catch{reject('模型回應格式不符合要求，未修改錯因',502,'INVALID_MODEL_OUTPUT')}
        if(!Array.isArray(parsed.candidates)||parsed.candidates.length>3||parsed.candidates.some((c:any)=>typeof c.reason!=='string'||typeof c.evidence!=='string'||c.reason.length>300||c.evidence.length>1000))reject('模型候選格式無效，未修改錯因',502,'INVALID_MODEL_OUTPUT');
        send((await change(data=>{const current=data.errors.find(e=>e.quizId===error.quizId&&e.questionId===error.questionId)??reject('錯因記錄已改變',409);current.candidates=parsed.candidates.map((c:any)=>({reason:c.reason,evidence:c.evidence,source:'ai'}));return current})));return;
      }
      if(wrongMatch){const id=wrongMatch[1];if(method==='GET'){send((await change(data=>{const q=data.quizzes.filter(q=>q.submittedAt).flatMap(q=>q.snapshot).find(q=>q.id===id)??reject('未開放此題答案',404);data.assists.push({questionId:id,quizId:'wrong',kind:'feedback',at:new Date().toISOString()});return q})));return}if(method==='PATCH'){send((await change(data=>{const wrong=data.wrong.find(w=>w.questionId===id)??reject('錯題不存在',404);if(input.reason){wrong.reason=String(input.reason).slice(0,500);const e=data.errors.filter(e=>e.questionId===id).at(-1);if(e){e.selected=wrong.reason;e.status=wrong.reason==='不確定'?'uncertain':'student-confirmed';e.history.push({at:new Date().toISOString(),value:wrong.reason,by:identity.id})}}if(input.resolved===true)reject('訂正與穩定掌握分開；請用不同新題復測',409,'EVIDENCE_REQUIRED');return wrong})));return}}
      if(path==='/plans/preview'&&method==='POST'){const data=(await store.state(identity.id));if(input.maintainTopic&&!planningPacks(packs).some(p=>p.topicId===input.maintainTopic))reject('維持單元無效');if(input.subjectFocus&&(!Array.isArray(input.subjectFocus)||input.subjectFocus.some((id:string)=>!data.profile.subjects.includes(id))))reject('優先科目無效');const p=planStudent(data,planningPacks(packs),catalog.programmes.find(p=>p.id===data.profile.primaryProgramme),new Date(),{maintainTopic:input.maintainTopic,subjectFocus:input.subjectFocus});(await store.putPreview(identity.id,p));send(p);return}
      if(path==='/plans/explain'&&method==='POST'){
        const p=(await store.preview(identity.id,input.previewId))??reject('預覽不存在',404);if(p.revision!==(await store.state(identity.id)).revision)reject('預覽已過期，請先重新產生',409,'STALE_PREVIEW');
        const config=(await store.model())??reject('開發者尚未設定模型',503,'MODEL_NOT_CONFIGURED');
        const explanation=await generate(config,[{role:'system',content:'你是香港中學生的學習助手。只解釋給定排程的依據、時間取捨和未知項，不修改任務，不作 DSE 成績或錄取保證。以簡明繁體中文回覆。'},{role:'user',content:JSON.stringify({allocations:p.allocations,tasks:p.tasks.map(t=>({title:t.title,minutes:t.minutes,reason:t.reason})),unscheduled:p.unscheduled})}]);send({explanation});return;
      }
      if(path==='/plans/apply'&&method==='POST'){send((await change(async data=>{if(typeof input.previewId!=='string')reject('請指定剛才檢視的預覽');const p=(await store.preview(identity.id,input.previewId))??reject('預覽不存在',404);if(data.appliedPreviews.includes(p.previewId))return {alreadyApplied:true,...p};if(p.revision!==data.revision||p.planDate!==data.profile.date||p.contentSignature!==planningPacks(packs).map(p=>`${p.id}@${p.version}`).sort().join(','))reject('目標、證據或日曆已變更，請重新預覽',409,'STALE_PREVIEW');data.tasks=[...data.tasks.filter(t=>t.locked||t.schedule==='floating'||t.status==='done'||t.kind==='exam'||t.date<data.profile.date||t.date>addDays(data.profile.date,13)),...p.tasks];data.weeks=p.weeks;data.appliedPreviews.push(p.previewId);return p})));return}
      if(path==='/strategy'&&method==='POST'){const data=(await store.state(identity.id)),p=catalog.programmes.find(p=>p.id===data.profile.primaryProgramme);if(!p)reject('請先選主目標課程');const costs=input.costs??[];if(!Array.isArray(costs)||costs.length>80||costs.some(c=>!c||!Array.isArray(c.hours)||c.hours.length!==2||c.hours.some((n:any)=>!Number.isFinite(n)||n<0)||c.hours[0]>c.hours[1]||!String(c.source??'').trim()||String(c.source).length>500))reject('成本範圍或依據無效');send(compareGradePaths(data.profile,p,costs,Math.max(0,Number(input.budgetHours)||0)));return}
      if(path==='/tasks'&&method==='POST'){send((await change(data=>{if(input.schedule!==undefined&&!['floating','scheduled'].includes(input.schedule)||input.locked!==undefined&&typeof input.locked!=='boolean')reject('任務安排或鎖定格式無效');if(!String(input.title??'自行溫習').trim())reject('請填寫任務名稱');const task:Task={id:crypto.randomUUID(),date:input.date,start:input.schedule==='floating'?'':input.start,schedule:input.schedule==='floating'?'floating':'scheduled',minutes:Number(input.minutes),title:String(input.title??'自行溫習').slice(0,120),subjectId:input.subjectId??'all',topicId:input.topicId,kind:['study','practice','review'].includes(input.kind)?input.kind:'study',status:'pending',locked:input.locked===true,reason:'學生自行安排'};const error=validateTask(task,data);if(error)reject(error,409,'SCHEDULE_CONFLICT');data.tasks.push(task);return task})),201);return}
      const taskMatch=path.match(/^\/tasks\/([^/]+)$/);
      if(taskMatch&&method==='PATCH'){send((await change(data=>{const t=data.tasks.find(t=>t.id===taskMatch[1])??reject('任務不存在',404);if(t.kind==='exam')reject('考試事件不可修改',409);const allowed=['schedule','date','start','minutes','title','status','locked','subjectId','kind'];if(Object.keys(input).some(k=>!allowed.includes(k)))reject('不可修改此任務欄位');if(input.status&&!['pending','done','skipped'].includes(input.status)||input.locked!==undefined&&typeof input.locked!=='boolean')reject('任務狀態無效');if(input.kind&&!['study','practice','review'].includes(input.kind)||input.subjectId&&!['all',...catalog.subjects.map(s=>s.id)].includes(input.subjectId))reject('活動學科或類型無效');if(input.schedule!==undefined&&!['floating','scheduled'].includes(input.schedule))reject('安排狀態無效');const next={...t,...input};if(next.schedule==='floating')next.start='';if(input.subjectId&&input.subjectId!==t.subjectId){next.topicId=undefined;next.skillId=undefined}if(next.minutes)next.minutes=Number(next.minutes);const err=validateTask(next,data);if(err)reject(err,409,'SCHEDULE_CONFLICT');if(input.status==='done'&&t.status!=='done'&&t.topicId)recordLearning(data,t.topicId,t.title,'lesson',t.minutes,'/calendar');Object.assign(t,next);return t})));return}
      if(path==='/notes'&&method==='POST'){send((await change(data=>{if(!String(input.body??'').trim())reject('請先輸入重點');const old=input.id?data.notes.find(n=>n.id===input.id):null;const note={id:old?.id??crypto.randomUUID(),title:String(input.title??'我的筆記').slice(0,100),body:String(input.body).slice(0,20000),topicId:input.topicId,date:data.profile.date};if(old)Object.assign(old,note);else data.notes.unshift(note);return note})),201);return}
      if(path.startsWith('/notes/')&&method==='DELETE'){send((await change(data=>{data.notes=data.notes.filter(n=>n.id!==path.split('/')[2]);return {ok:true}})));return}
      if(path.startsWith('/bookmarks/')&&method==='POST'){send((await change(data=>{const id=path.split('/')[2];if(!catalog.resources.some(r=>r.id===id))reject('資源不存在',404);data.bookmarks=data.bookmarks.includes(id)?data.bookmarks.filter(x=>x!==id):[...data.bookmarks,id];return data.bookmarks})));return}
      if(path==='/resource-clicks'&&method==='POST'){send((await change(data=>{if(!catalog.resources.some(r=>r.id===input.id))reject('資源不存在',404);data.resourceClicks[input.id]=(data.resourceClicks[input.id]??0)+1;return {ok:true}})));return}
      if(path==='/notifications/read'&&method==='POST'){send((await change(data=>{data.notificationsRead=true;return {ok:true}})));return}
      if(path==='/attachments/upload'&&method==='POST'){
        const type=String(req.headers['content-type']??'').split(';')[0];if(!/^image\/(png|jpeg|webp)$|^audio\/(webm|mp4|mpeg|wav|x-wav|ogg)$/.test(type))reject('請上傳 PNG／JPEG／WebP 圖片或支援的音訊');
        const bytes=await bodyLimit(req,20*1024*1024);if(!bytes.length)reject('附件為空');const id=crypto.randomUUID(),name=decodeURIComponent(String(req.headers['x-file-name']??'附件')).slice(0,120);
        const attachment=(await store.transaction(async ()=>{const data=(await store.state(identity.id));await store.putFile(id,identity.id,name,type,bytes);const file={id,name,type,size:bytes.length};data.attachments.push(file);(await store.save(identity.id,data));return file}));send(attachment,201);return;
      }
      if(path.startsWith('/attachments/')&&method==='GET'){const file=(await store.db.prepare('SELECT * FROM files WHERE id=? AND user_id=?').get(path.split('/')[2],identity.id)) as any;if(!file)reject('附件不存在',404);res.writeHead(200,{'Content-Type':file.type,'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});res.end(file.data);return}
      if(path==='/chats'&&method==='POST'){send((await change(data=>{const p=(packs.find(p=>p.topicId===input.topicId)??coaching.find(p=>p.topicId===input.topicId))??reject('此單元未發布',422);const chat={id:crypto.randomUUID(),title:String(input.title??p.title).slice(0,100),subjectId:p.subjectId,topicId:p.topicId,mode:input.mode??'explain',year:data.profile.year,teachingLanguage:data.profile.teachingLanguage,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),messages:[]};data.chats.unshift(chat);return chat})),201);return}
      const chatMatch=path.match(/^\/chats\/([^/]+)(?:\/(messages|stop|save-summary))?$/);
      if(chatMatch){const [,id,action]=chatMatch;const findChat=(data:StudentState)=>data.chats.find(c=>c.id===id)??reject('對話不存在',404);
        if(method==='DELETE'&&!action){active.get(identity.id+id)?.abort();send((await change(data=>{findChat(data);data.chats=data.chats.filter(c=>c.id!==id);return {ok:true}})));return}
        if(method==='PATCH'&&!action){send((await change(data=>{const c=findChat(data);if(!String(input.title??'').trim())reject('請輸入標題');c.title=String(input.title).slice(0,100);return c})));return}
        if(action==='stop'&&method==='POST'){active.get(identity.id+id)?.abort();send((await change(data=>{findChat(data).messages.filter(m=>m.status==='streaming').forEach(m=>m.status='interrupted');return {ok:true}})));return}
        if(action==='save-summary'&&method==='POST'){send((await change(data=>{const c=findChat(data);if(!c.messages.some(m=>m.role==='assistant'&&m.status==='complete'))reject('請先完成一輪對話');if(!data.events.some(e=>e.sourceUrl===`/learn/${id}`&&e.date===data.profile.date))recordLearning(data,c.topicId,c.title,'chat',10,`/learn/${id}`);return {ok:true}})));return}
        if(action==='messages'&&method==='POST'){
          const content=String(input.content??'').trim();if(!content||content.length>12000)reject('請輸入 1–12000 字元；附件暫供人工查看，請同時寫下問題');
          const config=(await store.model())??reject('開發者尚未設定 AI；你仍可閱讀教材及完成測驗',503,'MODEL_NOT_CONFIGURED');
          const requestId=String(input.requestId??'');if(!/^[a-zA-Z0-9-]{8,80}$/.test(requestId))reject('缺少有效的訊息請求 ID');
          if(active.has(identity.id+id))reject('此對話仍在生成，請稍候或停止',409);
          const controller=new AbortController();active.set(identity.id+id,controller);
          try{
          const state=(await store.state(identity.id)),chat=findChat(state),pack=(packs.find(p=>p.topicId===chat.topicId)??coaching.find(p=>p.topicId===chat.topicId))??reject('內容未發布',422);
          if(state.quizzes.some(q=>!q.submittedAt&&q.topicIds.includes(chat.topicId)&&['timed','diagnostic'].includes(q.kind)))reject('請先提交或完成這個單元的摸底／限時測驗，再開始 AI 教學',409,'ASSESSMENT_IN_PROGRESS');
          const attachments=Array.isArray(input.attachmentIds)?input.attachmentIds:[];if(attachments.some((a:string)=>!state.attachments.some(f=>f.id===a)))reject('附件不屬於此帳戶',404);
          let existing=chat.messages.find(m=>m.requestId===requestId&&m.role==='assistant');
          if(existing?.status==='complete'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});res.end(`event: delta\ndata: ${JSON.stringify({text:existing.content})}\n\nevent: done\ndata: ${JSON.stringify({id:existing.id})}\n\n`);return}
          const assistantId=existing?.id??crypto.randomUUID();
          (await change(data=>{for(const q of data.quizzes.filter(q=>!q.submittedAt&&q.topicIds.includes(chat.topicId)))for(const questionId of q.questionIds)data.assists.push({questionId,quizId:q.id,kind:'chat-assistance',at:new Date().toISOString()});const c=findChat(data);if(!c.messages.some(m=>m.requestId===requestId&&m.role==='user'))c.messages.push({id:crypto.randomUUID(),role:'user',content,status:'complete',attachmentIds:attachments,requestId});const a=c.messages.find(m=>m.id===assistantId);if(a){a.content='';a.status='streaming'}else c.messages.push({id:assistantId,role:'assistant',content:'',status:'streaming',requestId});c.updatedAt=new Date().toISOString();}));
          let done=false;
          const persist=async (text:string,status:'complete'|'interrupted')=>(await change(data=>{const c=data.chats.find(c=>c.id===id),a=c?.messages.find(m=>m.id===assistantId);if(a){a.content=text;a.status=status;a.model=config.model}}));
          res.on('close',()=>{if(!done)controller.abort()});
          try{
            // No reference answers or unpublished questions are placed in chat context.
            const system=`你是香港中學生的耐心導師。依據教材、學習參考與學生文字提供簡明解釋、可檢查步驟及分層提示。錯因不足時寫待確認；不能改成績、掌握度或日曆。正在正式測驗時不代答；使用者要求提示則提醒返回題目提示入口。導讀後可直接附隨堂小題，不用測驗生成格式；不要聲稱教材已由專業審校或看過圖片錄音。語言：${chat.teachingLanguage==='en'?'English':'香港繁體中文'}。教材：${JSON.stringify(pack.lessons)}`;
            const text=await generate(config,[{role:'system',content:system},...chat.messages.filter(m=>m.status==='complete').slice(-10).map(m=>({role:m.role,content:m.content})),{role:'user',content}],controller.signal);
            if(controller.signal.aborted)throw new Error('已停止生成');
            (await persist(text,'complete'));done=true;res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store'});res.write(`event: start\ndata: ${JSON.stringify({id:assistantId})}\n\n`);for(let n=0;n<text.length;n+=200)res.write(`event: delta\ndata: ${JSON.stringify({text:text.slice(n,n+200)})}\n\n`);res.end(`event: done\ndata: ${JSON.stringify({id:assistantId})}\n\n`);
          }catch(e){(await persist('','interrupted'));throw e}finally{done=true}return;
          }finally{if(active.get(identity.id+id)===controller)active.delete(identity.id+id)}
        }
      }
      reject('找不到此接口',404,'NOT_FOUND');
    }catch(e){const error=e as Error&{status?:number;code?:string};const status=error.status??500;send({error:{code:error.code??(status===500?'INTERNAL_ERROR':'INVALID_REQUEST'),message:status===500?'操作未完成，請重試；如持續出現請聯絡開發者':error.message}},status)}
  });
  return {server,store,async listen(port=3001,host='127.0.0.1'){await store.ready;await new Promise<void>(resolve=>server.listen(port,host,resolve));return (server.address() as AddressInfo).port},async close(){for(const controller of active.values())controller.abort();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));(await store.close())}};
}
