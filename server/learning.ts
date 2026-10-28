import type { Answer, Database, DailyReview, Mark, Quiz, ReviewItem } from '../src/types.ts';
import type { ContentPack, Identity, PilotEvidence } from '../src/pilot-types.ts';
import { RULE_VERSION } from '../src/pilot-types.ts';
import { assessSkill, updateCycle } from '../src/pilot-rules.ts';
import { addDays, dailyCapacity, isReviewVisible, markAnswer, reviewGroup } from '../src/domain.ts';
import type { PrivateQuiz, StudentState } from './store.ts';

export function reject(message:string,status=400,code='INVALID_REQUEST'):never{throw Object.assign(new Error(message),{status,code})}
export const publicQuestion=(q:ContentPack['questions'][number])=>{const {answer,explanation,hint,errorCandidates,scoring,...pub}=q;return pub};
export const publicQuiz=(q:PrivateQuiz)=>{const {snapshot,blueprints,contentVersions,independence,...pub}=q;return pub};
export function studentView(data:StudentState,identity:Identity,packs:ContentPack[]):Database{
  const {assists,errors,cycles,appliedPreviews,revision,...pub}=data;
  return {...pub,quizzes:data.quizzes.map(publicQuiz),pilot:{revision,identity,skills:packs.flatMap(p=>p.skills.map(s=>assessSkill(s,data.evidence))),errors,cycles,content:packs.map(p=>({id:p.id,version:p.version,title:p.title,topicId:p.topicId,status:p.status}))}};
}
export function recordLearning(data:StudentState,topicId:string,title:string,type:'lesson'|'quiz'|'chat'|'review',minutes:number,sourceUrl:string){
  const id=crypto.randomUUID(),date=data.profile.date;
  data.events.push({id,topicId,title,type,minutes,date,sourceUrl});
  let review=data.reviews.find(r=>r.topicId===topicId);
  if(!review){review={id:crypto.randomUUID(),topicId,dueDate:addDays(date,1),lastLearned:date,stage:0,sourceIds:[]};data.reviews.push(review)}
  review.lastLearned=date;review.sourceIds=[...new Set([...review.sourceIds,id])];
}
export function reviewView(data:StudentState,topics:any[]):DailyReview{
  const date=data.profile.date;
  return {items:data.reviews.filter(r=>isReviewVisible(r,date)).map(r=>({...r,topic:topics.find(t=>t.id===r.topicId),group:reviewGroup(r.dueDate,r.lastLearned,date),reason:r.lastLearned===date?'今天學過，先主動回想':r.lastLearned===addDays(date,-1)?'昨天學過，用新題檢查保留':'間隔復習到期',minutes:5})).filter(r=>r.topic).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)),todayEvents:data.events.filter(e=>e.date===date&&e.type!=='review'),yesterdayEvents:data.events.filter(e=>e.date===addDays(date,-1)&&e.type!=='review'),budget:Math.min(20,Math.floor(dailyCapacity(data.profile,date)*data.profile.reviewPercent/100)),session:data.reviewSessions.find(s=>s.date===date)??null};
}
export function completeReview(data:StudentState,id:string){
  const r=data.reviews.find(r=>r.id===id)??reject('找不到復習項目',404);
  if(r.lastReviewed===data.profile.date)return;
  const capacity=Math.min(20,Math.floor(dailyCapacity(data.profile,data.profile.date)*data.profile.reviewPercent/100));
  let session=data.reviewSessions.find(s=>s.date===data.profile.date);
  if((session?.minutes??0)+5>capacity)reject('今天的復習時間已用完；請預覽調整時間或明天繼續',409,'TIME_BUDGET');
  if(!session){session={id:crypto.randomUUID(),date:data.profile.date,reviewIds:[],completedIds:[],minutes:0};data.reviewSessions.push(session)}
  r.lastReviewed=data.profile.date;
  if(data.profile.date>=r.dueDate){r.stage=r.confidence==='不懂'?0:Math.min(2,r.stage+1);const next=addDays(r.lastLearned,[1,3,7][r.stage]);r.dueDate=next>data.profile.date?next:addDays(data.profile.date,r.stage===2?7:1)}
  session.completedIds.push(id);session.reviewIds.push(id);session.minutes+=5;
  data.events.push({id:crypto.randomUUID(),topicId:r.topicId,title:'主動回顧已完成',type:'review',date:data.profile.date,minutes:5,sourceUrl:'/review'});
}
export function createQuiz(data:StudentState,packs:ContentPack[],input:any,now=new Date()):PrivateQuiz{
  const kind=['practice','timed','diagnostic','review'].includes(input.kind)?input.kind:'practice';
  if(!Number.isInteger(Number(input.count??5))||Number(input.count??5)<1||Number(input.count??5)>20)reject('題量須為 1–20');
  let pool=packs.flatMap(p=>p.questions).filter(q=>(!input.subjectId||q.subjectId===input.subjectId)&&(!input.topicIds?.length||input.topicIds.includes(q.topicId))&&(!input.skillId||q.skillIds.includes(input.skillId))&&(!input.paper||input.paper==='all'||q.paper===input.paper)&&(!input.questionKind||input.questionKind==='all'||q.kind===input.questionKind)&&(!input.difficulty||input.difficulty==='all'||q.difficulty===input.difficulty));
  if(!input.manualContinue)pool=pool.filter(q=>!q.skillIds.some(id=>data.cycles.find(c=>c.skillId===id)?.paused));
  if(!pool.length)reject('此範圍沒有已發布且可繼續的題目；可先完成內容復核或查看前置補救',422,'INSUFFICIENT_QUESTIONS');
  const fresh=(q:ContentPack['questions'][number])=>!data.assists.some(a=>a.questionId===q.id)&&!data.quizzes.some(t=>t.submittedAt&&t.questionIds.includes(q.id));
  pool.sort((a,b)=>Number(fresh(b))-Number(fresh(a))||a.id.localeCompare(b.id));
  if(kind==='diagnostic'||kind==='review'){
    const ids=[...new Set(pool.flatMap(q=>q.skillIds))];const balanced:typeof pool=[];
    for(let round=0;balanced.length<pool.length;round++)for(const id of ids){const q=pool.filter(q=>q.skillIds[0]===id)[round];if(q&&!balanced.includes(q))balanced.push(q)}pool=balanced;
  }
  const count=kind==='diagnostic'?Math.max(new Set(pool.flatMap(q=>q.skillIds)).size,Math.min(Number(input.count??5),6)):Number(input.count??5);
  if(count>pool.length)reject(`目前只有 ${pool.length} 道已發布題目，請減少題量`,422,'INSUFFICIENT_QUESTIONS');
  const chosen=pool.slice(0,count),duration=kind==='diagnostic'?12:Math.max(1,Math.min(180,Number(input.durationMinutes)||10));
  if(kind!=='diagnostic'&&input.skillId){const skill=packs.flatMap(p=>p.skills).find(s=>s.id===input.skillId);if(skill?.prerequisites.some(id=>{const prerequisite=packs.flatMap(p=>p.skills).find(s=>s.id===id);const state=prerequisite?assessSkill(prerequisite,data.evidence,now):null;return !state||!['初步掌握','較穩定','較穩定 · 復測到期'].includes(state.label)}))reject('先修技能證據不足，請先檢查前置能力',422,'PREREQUISITE_REQUIRED')}
  const quiz:PrivateQuiz={id:crypto.randomUUID(),title:kind==='diagnostic'?'單元摸底 · 約 10–15 分鐘':kind==='review'?'隔時復測':'單元練習',subjectId:chosen[0].subjectId,topicIds:[...new Set(chosen.map(q=>q.topicId))],questionIds:chosen.map(q=>q.id),kind,answers:{},startedAt:now.toISOString(),durationMinutes:duration,snapshot:structuredClone(chosen),purpose:'formal',manualContinue:!!input.manualContinue,contentVersions:packs.filter(p=>chosen.some(q=>q.topicId===p.topicId)).map(p=>`${p.id}@${p.version}`),reviewIds:Array.isArray(input.reviewIds)?input.reviewIds.filter((id:string)=>data.reviews.some(r=>r.id===id&&chosen.some(q=>q.topicId===r.topicId))):[]};
  quiz.blueprints=packs.filter(p=>chosen.some(q=>q.topicId===p.topicId)).map(p=>structuredClone({id:p.id,version:p.version,topicId:p.topicId,skills:p.skills}));
  data.quizzes.push(quiz);return quiz;
}
export function saveAnswers(data:StudentState,quiz:PrivateQuiz,answers:any,now=new Date()){
  if(quiz.submittedAt)reject('測驗已提交',409);
  if(quiz.kind==='timed'&&now.getTime()>Date.parse(quiz.startedAt)+quiz.durationMinutes*60000)reject('限時已到，請提交已保存的答案',409,'TIME_EXPIRED');
  if(!answers||typeof answers!=='object'||Array.isArray(answers))reject('答案格式無效');
  for(const [id,raw] of Object.entries(answers)){
    if(!quiz.questionIds.includes(id))reject('答案不屬於這份測驗');
    const a=raw as Answer;if(typeof a?.value!=='string'||a.value.length>20000||a.steps!==undefined&&(typeof a.steps!=='string'||a.steps.length>12000))reject('答案過長或格式無效');
    if(a.attachmentId&&!data.attachments.some(f=>f.id===a.attachmentId))reject('附件不屬於此帳戶',404);
    quiz.answers[id]={value:a.value,steps:a.steps,attachmentId:a.attachmentId,hinted:data.assists.some(e=>e.quizId===quiz.id&&e.questionId===id)};
  }
}
export function submitQuiz(data:StudentState,quiz:PrivateQuiz,packs:ContentPack[],now=new Date()){
  if(quiz.submittedAt)return publicQuiz(quiz);
  const at=now.toISOString();const results:Mark[]=[];
  for(const q of quiz.snapshot){
    const answer=quiz.answers[q.id];const answered=!!answer?.value.trim()||!!answer?.attachmentId;
    const mark=answered?markAnswer(q,answer?.value??''):{questionId:q.id,correct:null,awarded:null,max:q.marks,expected:q.answer,explanation:'此題未作答，相關技能保留未知。',feedbackSource:'objective' as const};
    if(answered&&q.kind==='numeric'&&q.tolerance!==undefined){const actual=Number(answer.value.trim().replace(/,/g,''));mark.correct=answer.value.trim()!==''&&Number.isFinite(actual)&&Math.abs(actual-Number(q.answer))<=q.tolerance;mark.awarded=mark.correct?q.marks:0}
    if(answered&&q.requiresSteps){mark.correct=null;mark.awarded=null;mark.explanation='關鍵方法與步驟待人工核對；暫不加入正式掌握證據。'}
    if(!answered)mark.state='unanswered';else if(mark.awarded===null){mark.state='pending';mark.explanation='步驟或附件待人工核對；尚未寫入正式掌握證據。'}else mark.state='graded';
    results.push(mark);
    const independent=!data.assists.some(a=>a.questionId===q.id)&&!data.quizzes.some(old=>old.id!==quiz.id&&old.submittedAt&&old.questionIds.includes(q.id));
    quiz.independence??={};quiz.independence[q.id]=independent;
    if(mark.awarded!==null&&answered){
      const pack=quiz.blueprints?.find(p=>p.topicId===q.topicId)??packs.find(p=>p.topicId===q.topicId);
      data.evidence.push({id:crypto.randomUUID(),topicId:q.topicId,questionId:q.id,quizId:quiz.id,date:data.profile.date,at,awarded:mark.awarded,max:q.marks,independent,familyId:q.familyId,skillIds:q.skillIds,requiredSkillIds:pack?.skills.map(s=>s.id)??[],contentVersion:quiz.contentVersions.find(v=>v.startsWith(pack?.id+'@'))??'snapshot',ruleVersion:RULE_VERSION,criticalPassed:mark.correct===true,reviewed:true});
      for(const id of q.skillIds)if(independent||mark.correct===false)data.cycles=updateCycle(data.cycles,id,mark.correct===true,q.id,at);
      if(mark.correct===false){
        let wrong=data.wrong.find(w=>w.questionId===q.id);if(!wrong){wrong={questionId:q.id,topicId:q.topicId,lastAnswer:answer?.value??'',date:data.profile.date,reason:'待確認',resolved:false};data.wrong.push(wrong)}else{wrong.lastAnswer=answer?.value??'';wrong.resolved=false}
        const mapped=q.errorCandidates?.filter(c=>!c.answer||c.answer===answer?.value)??[];
        data.errors.push({questionId:q.id,quizId:quiz.id,topicId:q.topicId,skillIds:q.skillIds,observed:answer?.steps?`學生提供步驟：${answer.steps}`:'只有最終答案；不足以斷定是概念、運算還是輸入問題',candidates:mapped.map(c=>({...c,source:'rule' as const})),status:'uncertain',history:[]});
      }
    }
    // Exposing feedback is a permanent assistance event for later attempts, after grading this attempt.
    data.assists.push({questionId:q.id,quizId:quiz.id,at,kind:'feedback'});
  }
  quiz.results=results;quiz.submittedAt=at;
  for(const topicId of quiz.topicIds)recordLearning(data,topicId,quiz.title,'quiz',Math.max(1,Math.round(quiz.durationMinutes/quiz.topicIds.length)),`/quizzes/${quiz.id}`);
  const states=packs.filter(p=>quiz.topicIds.includes(p.topicId)).flatMap(p=>p.skills.map(s=>assessSkill(s,data.evidence,now)));
  quiz.response={skills:states,scope:'只涵蓋本次單元技能，不代表整科 DSE 等級',nextStep:results.some(r=>r.correct===false)||states.some(s=>s.label==='初步掌握'||s.label.startsWith('較穩定')),pausedSkills:data.cycles.filter(c=>c.paused).map(c=>c.skillId)};
  return publicQuiz(quiz);
}
