import {ui} from '../i18n';
import type { Catalog, Database, DailyReview, PublicQuestion, Quiz, ChatMessage } from '../types';
const base=import.meta.env.VITE_API_BASE_URL??'/api/v1';
export class ApiError extends Error{constructor(message:string,public code:string,public status:number){super(message)}}
export const realMode=import.meta.env.VITE_API_MODE==='real';
const pendingAI=new Map<string,string>();
function operationKey(path:string,body:unknown){
  if(!realMode||!(/\/test$|\/analyse$|\/explain$|\/submit$/.test(path)||path==='/studio/quizzes'))return '';
  const signature=path+JSON.stringify(body);let code=2166136261;for(const c of signature)code=Math.imul(code^c.charCodeAt(0),16777619);
  const storage='hokse.ai.pending.'+(code>>>0).toString(16);let id=pendingAI.get(signature)??sessionStorage.getItem(storage)??crypto.randomUUID();pendingAI.set(signature,id);sessionStorage.setItem(storage,id);return {id,signature,storage};
}
export async function api<T=any>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{const operation=method==='POST'?operationKey(path,body):'';const result=await fetch(base+path,{method,credentials:'same-origin',headers:{...(body?{'Content-Type':'application/json'}:{}),'X-Hokse-Client':'1',...(operation?{'X-Hokse-Request-ID':operation.id}:{})},body:body?JSON.stringify(body):undefined,signal});const data=await result.json();if(!result.ok){if(result.status===401&&realMode&&!path.startsWith('/auth/'))window.dispatchEvent(new Event('hokse:unauthorized'));throw new ApiError(ui(data.error?.message??'暫時未能完成操作，請再試一次'),data.error?.code??'UNKNOWN',result.status)}if(operation){pendingAI.delete(operation.signature);sessionStorage.removeItem(operation.storage)}return data;}
export const getBootstrap=()=>api<Database>('/bootstrap');
export const getCatalog=()=>api<Catalog>('/catalog');
export const getDailyReview=()=>api<DailyReview>('/daily-review');
export const getQuiz=(id:string)=>api<{quiz:Quiz;questions:PublicQuestion[]}>(`/quizzes/${id}`);
const pendingMessages=new Map<string,{signature:string;requestId:string}>();
export function clearPendingChat(id:string){pendingMessages.delete(id);sessionStorage.removeItem('hokse.chat.pending.'+id)}
export async function streamChat(id:string,content:string,attachmentIds:string[],signal:AbortSignal,onDelta:(text:string)=>void,onMessage?:(message:ChatMessage,user?:ChatMessage)=>void,retryMessageId?:string,lesson?:{lessonAction?:'next'|'revise';sourceDocumentId?:string;documentId?:string}){
  const signature=JSON.stringify([content,attachmentIds,retryMessageId,lesson]);let pendingRequest=pendingMessages.get(id);
  if(!pendingRequest)try{pendingRequest=JSON.parse(sessionStorage.getItem('hokse.chat.pending.'+id)??'null')}catch{/* ignore malformed local metadata */}
  if(!pendingRequest||pendingRequest.signature!==signature){pendingRequest={signature,requestId:crypto.randomUUID()};pendingMessages.set(id,pendingRequest)}
  sessionStorage.setItem('hokse.chat.pending.'+id,JSON.stringify(pendingRequest));
  const result=await fetch(`${base}/chats/${id}/messages${retryMessageId?'/'+retryMessageId+'/retry':''}`,{method:'POST',headers:{'Content-Type':'application/json','X-Hokse-Client':'1'},body:JSON.stringify({content,attachmentIds,requestId:pendingRequest.requestId,...lesson}),signal});
  if(!result.ok){const error=await result.json();throw new Error(ui(error.error?.message??'無法開始對話'))}
  if(!result.body)throw new Error('瀏覽器未提供串流回覆');
  const reader=result.body.getReader(),decoder=new TextDecoder();let pending='',completed=false;
  function frame(text:string){const lines=text.split('\n'),event=lines.find(s=>s.startsWith('event:'))?.slice(6).trim(),raw=lines.filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trimStart()).join('\n');if(!raw)return;const data=JSON.parse(raw);if(event==='delta')onDelta(data.text);if(event==='message'&&onMessage)onMessage(data.message,data.user);if(event==='done')completed=true;if(event==='error')throw new Error(ui(data.message??'生成中斷'))}
  while(true){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});const frames=pending.split(/\r?\n\r?\n/);pending=frames.pop()??'';for(const text of frames)frame(text)}
  if(pending.trim())frame(pending);if(!completed)throw new Error('回覆未完成，可重試或重新載入');clearPendingChat(id);
}
