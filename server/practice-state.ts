import {createHash} from 'node:crypto';
import type {StudentState} from './store.ts';
import type {Chat} from '../src/types.ts';
import type {StudyItem,StudyAttempt,StudyFeedback} from '../src/studio-types.ts';
import type {LearningSource,LearningReview,LearningView} from '../src/learning-types.ts';
import {parseChatContent} from '../src/chat-content.ts';
import {quadraticSkill} from '../src/quadratic-skills.ts';
import {checkMath} from './quadratic-practice.ts';
import {addDays} from '../src/domain.ts';

export interface LearningItem extends StudyItem {source:LearningSource;hash:string;createdAt:string}
export interface PracticeState {items:LearningItem[];aids:{itemId:string;hash:string;kind:string;at:string}[];reviews:LearningReview[]}
export const practiceState=(data:StudentState):PracticeState=>{for(const a of data.studio?.attempts??[]){if(a.appeal?.status==='pending'&&Date.parse(a.appeal.at)<Date.now()-180000){a.appeal.status='uncertain';a.pending=false;a.disputed=true;a.feedback={source:'unavailable',score:null,verdict:'uncertain',text:'復核未完成，作答與質疑已保留。',reason:'這次不採用分數；不自動重試。'};a.appeal.feedback=a.feedback;}}return data.practice??={items:[],aids:[],reviews:[]};};
const hash=(value:string)=>createHash('sha256').update(value.toLowerCase().replace(/\s|\$/g,'')).digest('hex');
export function learningView(data:StudentState):LearningView{const s=practiceState(data);return {items:s.items.slice(-400).map(q=>({id:q.id,skillId:q.skillId,question:q.prompt,source:q.source,hintAvailable:!!q.hint,answerAvailable:true})),reviews:s.reviews};}
export function registerQuestion(data:StudentState,item:StudyItem,source:LearningSource){
 const s=practiceState(data),key=JSON.stringify(source),old=s.items.find(q=>JSON.stringify(q.source)===key);if(old)return old;
 const q:LearningItem={...item,source,hash:hash(item.prompt+'\n'+item.answer),createdAt:new Date().toISOString()};s.items.push(q);return q;
}
export function inferSkill(text:string){
 if(/(?:參數|参数|constant k|find k|[kＫ].*(?:實根|实根|real root))/i.test(text))return 'quadratic-parameter';
 if(/(?:面積|面积|長方形|矩形|height|rectangle|consecutive|連續.*整數|时间|時間)/i.test(text))return 'quadratic-model';
 if(/(?:判別式|判别式|discriminant|實根.*數目|实根.*数目|number.*real roots)/i.test(text))return 'quadratic-discriminant';
 if(/(?:係數|系数|coefficient|standard form|標準式|标准式)/i.test(text))return 'quadratic-standard';
 if(/(?:求根公式|quadratic formula|sqrt|\\sqrt|√)/i.test(text))return 'quadratic-formula';
 if(/(?:求根|factor|solve|解.*[xｘ]|[xｘ](?:²|\^2))/i.test(text))return 'quadratic-factor';return null;
}
export function registerChatQuestions(data:StudentState,chat:Chat,messageId:string,content:string,documentId?:string,skills?:string[]){
 if(chat.topicId!=='maths-quadratic')return [];
 const parsed=parseChatContent(content),doc=chat.documents?.find(d=>d.id===documentId);let ordinal=0;const ids:string[]=[];
 for(const block of parsed.blocks){if(block.kind!=='exercise')continue;const index=ordinal++,skillId=skills?.[index]??parsed.teaching?.exerciseSkills?.[index]??inferSkill(block.value.question);if(!skillId||!quadraticSkill(skillId))continue;
  const q=registerQuestion(data,{id:crypto.randomUUID(),skillId,kind:'short',family:'chat-'+hash(block.value.question.replace(/-?\d+(?:\.\d+)?/g,'#')).slice(0,24),prompt:block.value.question,answer:block.value.answer,explanation:block.value.explanation??block.value.answer,hint:block.value.hint??'',criterion:'按題目條件、結果與實際提供的步驟給參考回饋。'}, {kind:documentId?'lesson':'chat',chatId:chat.id,messageId,documentId,number:doc?.number,version:doc?.version??1,ordinal:index+1,tutor:chat.tutor});ids.push(q.id);
 }return ids;
}
export function assistQuestion(data:StudentState,id:string,kind:string){const s=practiceState(data),q=s.items.find(q=>q.id===id);if(!q)return false;if(!s.aids.some(a=>a.hash===q.hash&&a.kind===kind))s.aids.push({itemId:id,hash:q.hash,kind,at:new Date().toISOString()});return true;}
export function markReferencedAssistance(data:StudentState,topicId:string,prompt:string){
 const normalized=(s:string)=>s.toLowerCase().replace(/[\s$，。；：？,.;:?]/g,'').replace(/−/g,'-'),text=normalized(prompt),matches=(q:{id:string;prompt:string})=>text.includes(q.id.toLowerCase())||normalized(q.prompt).length>=12&&text.includes(normalized(q.prompt));
 for(const quiz of data.quizzes.filter(q=>!q.submittedAt&&q.topicIds.includes(topicId)))for(const q of quiz.snapshot.filter(matches))if(!data.assists.some(a=>a.questionId===q.id&&a.kind==='chat-assistance'))data.assists.push({questionId:q.id,quizId:quiz.id,kind:'chat-assistance',at:new Date().toISOString()});
 for(const q of practiceState(data).items.filter(matches))assistQuestion(data,q.id,'discussion');
}
export function answerIntent(text:string){if(/(?:[?？]|提示|解析|解釋|解释|答案是什|答案是什么|怎[樣样麼么]|為什麼|为什么|不明白|不懂|\b(?:hint|explain|why|how|what)\b)/i.test(text))return false;const candidate=text.replace(/\bQ\s*\d+\b/gi,'').replace(/第\s*\d+\s*[課课題题]|\bv\s*\d+\b/gi,'');return /[0-9=²√]|沒有實根|没有实根|no real roots|我的答案|我(?:算|得|用|選|选|認為|认为)|\b(?:my answer|I think|I got|I used|I choose)\b/i.test(candidate.trim())||/^[A-D]$/i.test(candidate.trim());}
export function resolveQuestion(data:StudentState,chat:Chat,input:any,prompt:string){
 if(chat.topicId!=='maths-quadratic'){if(input.questionId)throw Object.assign(new Error('此對話不屬於這個知識點'),{status:422});return null;}
 const items=practiceState(data).items;
 if(input.questionId!==undefined){if(typeof input.questionId!=='string')throw Object.assign(new Error('請選擇有效題目'),{status:422});const q=items.find(q=>q.id===input.questionId);if(!q)throw Object.assign(new Error('找不到此帳戶的題目'),{status:404});return q;}
 const number=prompt.match(/\bQ\s*(\d+)\b/i);if(!number)return null;
 let candidates=items.filter(q=>q.source.chatId===chat.id&&q.source.ordinal===Number(number[1]));
 const lesson=prompt.match(/第\s*(\d+)\s*[課课]|lesson\s*(\d+)/i),version=prompt.match(/\bv\s*(\d+)\b/i);
 if(input.documentId)candidates=candidates.filter(q=>q.source.documentId===input.documentId);
 if(lesson)candidates=candidates.filter(q=>q.source.number===Number(lesson[1]??lesson[2]));if(version)candidates=candidates.filter(q=>q.source.version===Number(version[1]));
 if(candidates.length!==1)throw Object.assign(new Error('請先選擇課件版本及題號'),{status:422,code:'QUESTION_AMBIGUOUS'});return candidates[0];
}
export function attemptFeedback(item:StudyItem,answer:string,steps:string,reference?:StudyFeedback):StudyFeedback{
 const fixed=checkMath(item,answer,steps);if(fixed)return fixed.source==='unavailable'&&reference?reference:fixed;
 const same=answer.trim().replace(/\s|\$/g,'').toLowerCase()===item.answer.replace(/\s|\$/g,'').toLowerCase();
 if(same&&item.skillId!=='quadratic-model')return {source:'ai',score:100,verdict:'correct',text:item.explanation,reason:'答案與導師參考相符；並非獨立驗算。',resultCorrect:true};
 return reference??{source:'unavailable',score:null,verdict:'uncertain',text:'作答已保存；請參考導師回饋，這次暫不採用分數。',reason:'尚無可靠判定。'};
}
export function putAttempt(data:StudentState,q:LearningItem,requestId:string,answer:string,steps='',reference?:StudyFeedback,origin?:LearningSource){
 data.studio??={quizzes:[],attempts:[]};const existing=data.studio.attempts.find(a=>a.requestId===requestId&&a.itemId===q.id);if(existing)return existing;
 const s=practiceState(data),seen=data.studio.attempts.some(a=>s.items.find(i=>i.id===a.itemId)?.hash===q.hash),hinted=s.aids.some(a=>a.hash===q.hash);
 const a:StudyAttempt={id:crypto.randomUUID(),requestId,itemId:q.id,quizId:q.source.quizId,origin:origin??q.source,family:q.family,subjectId:'maths',topicId:'maths-quadratic',skillId:q.skillId,at:new Date().toISOString(),answer,steps,independent:!!answer.trim()&&!seen&&!hinted,hinted,feedback:attemptFeedback(q,answer,steps,reference),disputed:false,corrections:[]};data.studio.attempts.push(a);return a;
}
export function updateAttempt(data:StudentState,id:string,reference?:StudyFeedback){const a=data.studio?.attempts.find(a=>a.id===id),q=practiceState(data).items.find(q=>q.id===a?.itemId);if(!a||!q||a.appeal)return; a.pending=false;a.feedback=attemptFeedback(q,a.answer,a.steps,reference);queueReview(data,a.skillId,q.id);assistQuestion(data,q.id,'feedback');}
export function queueReview(data:StudentState,skillId:string,sourceId:string){
 if(!quadraticSkill(skillId))return;const s=practiceState(data),date=data.profile.date;let r=s.reviews.find(r=>r.skillId===skillId&&r.lastLearned===date);
 if(!r){r={id:crypto.randomUUID(),skillId,dueDate:addDays(date,1),lastLearned:date,sourceIds:[],minutes:5};s.reviews.push(r)}if(!r.sourceIds.includes(sourceId))r.sourceIds.push(sourceId);
}
export function completeSkillReview(data:StudentState,id:string){const r=practiceState(data).reviews.find(r=>r.id===id);if(r)r.completedAt=new Date().toISOString();}
