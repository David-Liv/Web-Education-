import type { Catalog, Database, DailyReview, PublicQuestion, Quiz } from '../types';
const base=import.meta.env.VITE_API_BASE_URL??'/api/v1';
export class ApiError extends Error{constructor(message:string,public code:string,public status:number){super(message)}}
export const realMode=import.meta.env.VITE_API_MODE==='real';
export async function api<T=any>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{const result=await fetch(base+path,{method,credentials:'same-origin',headers:{...(body?{'Content-Type':'application/json'}:{}),'X-Hokse-Client':'1'},body:body?JSON.stringify(body):undefined,signal});const data=await result.json();if(!result.ok){if(result.status===401&&realMode&&!path.startsWith('/auth/'))window.dispatchEvent(new Event('hokse:unauthorized'));throw new ApiError(data.error?.message??'暫時未能完成操作，請再試一次',data.error?.code??'UNKNOWN',result.status)}return data;}
export const getBootstrap=()=>api<Database>('/bootstrap');
export const getCatalog=()=>api<Catalog>('/catalog');
export const getDailyReview=()=>api<DailyReview>('/daily-review');
export const getQuiz=(id:string)=>api<{quiz:Quiz;questions:PublicQuestion[]}>(`/quizzes/${id}`);
const pendingMessages=new Map<string,{signature:string;requestId:string}>();
export async function streamChat(id:string,content:string,attachmentIds:string[],signal:AbortSignal,onDelta:(text:string)=>void){
  const signature=JSON.stringify([content,attachmentIds]);let pendingRequest=pendingMessages.get(id);
  if(!pendingRequest||pendingRequest.signature!==signature){pendingRequest={signature,requestId:crypto.randomUUID()};pendingMessages.set(id,pendingRequest)}
  const result=await fetch(`${base}/chats/${id}/messages`,{method:'POST',headers:{'Content-Type':'application/json','X-Hokse-Client':'1'},body:JSON.stringify({content,attachmentIds,requestId:pendingRequest.requestId}),signal});
  if(!result.ok){const error=await result.json();throw new Error(error.error?.message??'無法開始對話')}
  if(!result.body)throw new Error('瀏覽器未提供串流回覆');
  const reader=result.body.getReader(),decoder=new TextDecoder();let pending='',completed=false;
  function frame(text:string){const lines=text.split('\n'),event=lines.find(s=>s.startsWith('event:'))?.slice(6).trim(),raw=lines.filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trimStart()).join('\n');if(!raw)return;const data=JSON.parse(raw);if(event==='delta')onDelta(data.text);if(event==='done')completed=true;if(event==='error')throw new Error(data.message??'生成中斷')}
  while(true){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});const frames=pending.split(/\r?\n\r?\n/);pending=frames.pop()??'';for(const text of frames)frame(text)}
  if(pending.trim())frame(pending);if(!completed)throw new Error('回覆未完成，可重試或重新載入');pendingMessages.delete(id);
}
