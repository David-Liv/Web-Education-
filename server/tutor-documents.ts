import type {Store} from './store.ts';
import type {Chat} from '../src/types.ts';
import type {LessonDocument,TeachingUpdate} from '../src/tutors.ts';
import {parseChatContent} from '../src/chat-content.ts';
import {tutorResources} from './tutors.ts';
import {renderLessonPdf} from './lesson-pdf.ts';
import {reject} from './learning.ts';

export interface DocumentTarget {id:string;number:number;version:number;sourceId?:string}
export interface PreparedDocument {meta:LessonDocument;content:string;bytes:Buffer}
export const documentKey=(userId:string,id:string)=>'tutor-document:'+userId+':'+id;
export function documentTarget(chat:Chat,sourceId?:string):DocumentTarget {
 const source=chat.documents?.find(d=>d.id===sourceId);if(sourceId&&!source)reject('找不到要修訂的課件',404);
 return {id:crypto.randomUUID(),number:source?.number??Math.max(0,...(chat.documents??[]).map(d=>d.number))+1,version:source?Math.max(...chat.documents!.filter(d=>d.number===source.number).map(d=>d.version))+1:1,...(source?{sourceId:source.id}:{})};
}
export async function prepareDocument(chat:Chat,target:DocumentTarget,update:TeachingUpdate|undefined,content:string,origin?:string):Promise<PreparedDocument>{
 if(!update?.title?.trim()||!update.objective?.trim()||!update.sourceIds?.length||update.sourceIds.some(id=>!tutorResources.some(s=>s.id===id)))throw new Error('INVALID_LESSON_METADATA');
 const parsed=parseChatContent(content);if(parsed.blocks.some(b=>b.kind==='unavailable'))throw new Error('INVALID_LESSON_CONTENT');
 const prose=parsed.blocks.filter(b=>b.kind==='markdown').map(b=>b.text).join('\n'),sections=prose.split(/^##\s+(?:Keep for reference|重點速查)\s*$/im);
 const reference=sections.length>1?sections.at(-1)!.trim().slice(0,1800):update.objective;
 const meta:LessonDocument={...target,title:update.title,objective:update.objective,sourceIds:[...new Set(update.sourceIds)],reference,questions:parsed.blocks.filter(b=>b.kind==='exercise').length,createdAt:new Date().toISOString(),size:0};
 const bytes=await renderLessonPdf({...meta,reference:''},content,chat.id,chat.teachingLanguage==='en',origin);if(bytes.length>5*1024*1024)throw new Error('PDF_SIZE_LIMIT');meta.size=bytes.length;return {meta,content,bytes};
}
export async function saveDocument(store:Store,userId:string,doc:PreparedDocument){
 if(await store.db.prepare('SELECT id FROM files WHERE id=? AND user_id=?').get(doc.meta.id,userId))return;
 await store.putFile(doc.meta.id,userId,`HOKSE-${doc.meta.number}-v${doc.meta.version}.pdf`,'application/pdf',doc.bytes);
 await store.db.prepare('INSERT INTO settings VALUES(?,?)').run(documentKey(userId,doc.meta.id),store.encrypt(JSON.stringify({meta:doc.meta,content:doc.content})));
}
export async function readDocument(store:Store,userId:string,chat:Chat,id:string){
 if(!chat.documents?.some(d=>d.id===id))reject('找不到課件',404);
 const row=await store.db.prepare('SELECT body FROM settings WHERE id=?').get(documentKey(userId,id));if(!row)reject('找不到課件',404);
 return JSON.parse(store.decrypt(row.body)) as {meta:LessonDocument;content:string};
}
export async function documentContext(store:Store,userId:string,chat:Chat,requestedId?:string){
 const metas=requestedId?chat.documents?.filter(d=>d.id===requestedId):chat.documents?.slice(-3);if(requestedId&&!metas?.length)reject('找不到課件',404);
 const result=[];for(const meta of metas??[]){const doc=await readDocument(store,userId,chat,meta.id);result.push({lesson:meta.number,version:meta.version,title:meta.title,content:doc.content})}return result;
}
