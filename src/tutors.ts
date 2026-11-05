// Public capability contracts only. Teaching instructions stay on the server.
export type TutorId = 'david' | 'matt';
export interface TutorBinding { id:TutorId; version:string }
export interface LessonDocument { id:string; title:string; objective:string; number:number; version:number; sourceId?:string; createdAt:string; size:number; questions:number; reference:string; sourceIds:string[] }
export interface TeachingRecord { id:string; topicId:string; chatId:string; messageId:string; kind:'prior-knowledge'|'insight'|'misconception'; text:string; quote:string; at:string; confirmed?:boolean; supersedes?:string }
export interface TutorMemory { records:TeachingRecord[]; terms:{term:string;definition:string;recordId:string}[] }
export interface TeachingState { mission:string; success:string; constraints:string; outOfScope:string; preferences:string; sourceIds:string[] }
export interface TeachingUpdate { title?:string; objective?:string; sourceIds?:string[]; reference?:string; record?:{kind:TeachingRecord['kind'];text:string;quote:string;supersedes?:string;term?:string;definition?:string} }
export function validTeachingUpdate(v:any):v is TeachingUpdate {
 const bounded=(x:unknown,n:number)=>x===undefined||typeof x==='string'&&x.length<=n&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x);
 return !!v&&typeof v==='object'&&!Array.isArray(v)&&bounded(v.title,120)&&bounded(v.objective,500)&&bounded(v.reference,1800)&&(v.sourceIds===undefined||Array.isArray(v.sourceIds)&&v.sourceIds.length<=6&&v.sourceIds.every((s:unknown)=>typeof s==='string'&&/^[a-z0-9-]{1,60}$/.test(s)))&&(!v.record||['prior-knowledge','insight','misconception'].includes(v.record.kind)&&bounded(v.record.text,800)&&!!v.record.text&&bounded(v.record.quote,800)&&!!v.record.quote&&bounded(v.record.supersedes,80)&&bounded(v.record.term,80)&&bounded(v.record.definition,300));
}
export const TUTORS = [
 {id:'david' as const,version:'1',name:'David',zh:'分段導讀、漸進提示和逐步解題。按需要使用聊天練習及圖表。',en:'Guided reading, gradual hints and step-by-step problem solving, with practice and visuals when useful.'},
 {id:'matt' as const,version:'1',name:'Matt',zh:'圍繞學習目標製作短篇 PDF 課程，再透過對話練習、答疑和回顧。首個完整主題：二次方程。',en:'Short PDF lessons built around your goal, followed by practice, discussion and recall. First complete topic: quadratic equations.'}
];
export const tutorName=(binding?:TutorBinding)=>binding?.id==='matt'?'Matt':'David';
export const tutorSupported=(id:TutorId,topicId:string)=>id==='david'||topicId==='maths-quadratic';
