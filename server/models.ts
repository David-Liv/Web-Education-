import type { ModelConfig } from './store.ts';
import { reject } from './learning.ts';
import { beginProvider, normalizeTokens, recordProvider } from './billing.ts';
import { isAllowedModel } from '../src/model-catalog.ts';

export function publicModel(config:ModelConfig|null){if(!config)return null;const {secret,...pub}=config;return {...pub,hasKey:!!secret}}
export function validateModel(input:any,previous:ModelConfig|null):ModelConfig{
  let url:URL;try{url=new URL(String(input.baseUrl))}catch{reject('請填寫有效的 API Base URL')}
  if(url.username||url.password||url.search||url.hash||!['http:','https:'].includes(url.protocol))reject('API 地址不可含帳密、查詢參數或片段');
  if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))reject('遠端 API 請使用 HTTPS；本機服務可用 HTTP');
  if(!['openai-chat','openai-responses'].includes(input.protocol))reject('請選擇服務實際支援的協議');
  const model=String(input.model??'').trim();if(model.length>200)reject('模型 ID 過長');
  if(input.enabled!==false&&model&&!isAllowedModel(model))reject('只可使用抗截斷模型；此模型不可用',403,'MODEL_NOT_ALLOWED');
  const baseUrl=url.toString().replace(/\/$/,''),secret=input.clearKey?'':typeof input.apiKey==='string'&&input.apiKey?input.apiKey:previous?.baseUrl===baseUrl?previous.secret:'';
  const sameConnection=previous?.baseUrl===baseUrl&&previous.secret===secret&&previous.protocol===input.protocol;
  return {id:'default',name:String(input.name??'我的模型服務').slice(0,80),baseUrl,secret,model,protocol:input.protocol,enabled:input.enabled!==false,models:sameConnection?previous.models:undefined,tested:sameConnection&&previous.model===model?previous.tested:undefined};
}
async function provider(config:ModelConfig,path:string,body?:unknown,signal?:AbortSignal){
  const result=await fetch(`${config.baseUrl}/${path}`,{method:body?'POST':'GET',headers:{...(config.secret?{Authorization:`Bearer ${config.secret}`} :{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000),redirect:'error'});
  if(!result.ok)reject(result.status===401||result.status===403?'API 認證失敗；請檢查密鑰與模型權限':result.status===429?'提供方限額或速率限制，稍後可再試':`模型服務回傳 HTTP ${result.status}`,502,'PROVIDER_ERROR');
  if(Number(result.headers.get('content-length')??0)>4*1024*1024)reject('模型服務回應過大',502);
  try{return await result.json() as any}catch{reject('模型服務未返回有效 JSON',502,'PROTOCOL_ERROR')}
}
export async function listModels(config:ModelConfig){const result=await provider(config,'models');if(!Array.isArray(result.data))reject('此服務未提供相容模型清單，可手動填寫 model ID',502,'NO_MODEL_LIST');return [...new Set<string>(result.data.map((m:any)=>m.id).filter((id:any)=>isAllowedModel(id)&&id.length<=200))].slice(0,1000)}
export async function generate(config:ModelConfig,messages:{role:string;content:string}[],signal?:AbortSignal, review=false,tokenBudget?:number){
  if(!config.enabled||!config.model)reject('開發者尚未啟用模型或選擇模型 ID',503,'MODEL_NOT_CONFIGURED');
  const scoped=await beginProvider(config,review);config=scoped.config;
  if(!isAllowedModel(config.model))reject('只可使用抗截斷模型；此模型不可用',403,'MODEL_NOT_ALLOWED');
  signal=signal&&scoped.signal?AbortSignal.any([signal,scoped.signal]):signal??scoped.signal;
  const maxTokens=tokenBudget===undefined?(review?4800:2400):Math.min(6000,Math.max(1000,Math.floor(tokenBudget)));
  const payload=config.protocol==='openai-chat'?{model:config.model,messages,max_tokens:maxTokens}:{model:config.model,input:messages,max_output_tokens:maxTokens};
  const start=Date.now(),endpoint=new URL(config.baseUrl).pathname.replace(/\/$/,'')+'/'+(config.protocol==='openai-chat'?'chat/completions':'responses');
  const request={model:config.model,stream:false,msg_count:messages.length,chars:messages.reduce((n,m)=>n+m.content.length,0),has_tools:false,tools_count:0,first_role:messages[0]?.role??null,temperature:null,max_tokens:maxTokens};
  let httpStatus:number|null=null,raw='',content='',usage:any;
  try{
    const response=await fetch(config.baseUrl+'/'+(config.protocol==='openai-chat'?'chat/completions':'responses'),{method:'POST',headers:{'Content-Type':'application/json',...(config.secret?{Authorization:`Bearer ${config.secret}`}:{})},body:JSON.stringify(payload),redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000)});
    httpStatus=response.status;
    // Bound decoded bytes too: Content-Length may be absent or compressed.
    const reader=response.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
    if(reader)try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>4*1024*1024){await reader.cancel();reject('模型服務回應過大',502,'RESPONSE_TOO_LARGE')}chunks.push(chunk.value)}}finally{reader.releaseLock()}
    raw=Buffer.concat(chunks).toString('utf8');
    if(!response.ok)reject(response.status===401||response.status===403?'API 認證失敗；請檢查密鑰與模型權限':response.status===429?'提供方限額或速率限制，稍後可再試':`模型服務回傳 HTTP ${response.status}`,502,'PROVIDER_ERROR');
    let result:any;try{result=JSON.parse(raw)}catch{reject('模型服務未返回有效 JSON',502,'PROTOCOL_ERROR')}
    usage=result.usage;
    content=config.protocol==='openai-chat'?result.choices?.[0]?.message?.content:result.output_text??result.output?.flatMap((o:any)=>o.content??[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join('\n');
    if(typeof content!=='string'||!content.trim())reject('模型沒有回傳可用文字；請檢查協議與能力',502,'EMPTY_MODEL_RESPONSE');
    await recordProvider({stage:review?'review':'generation',model:config.model,channel:config.model.startsWith('pggo-')?'PGGO':config.model.startsWith('bdgo-')?'BDGO':new URL(config.baseUrl).hostname,endpoint,at:new Date(start).toISOString(),status:'success',httpStatus,durationMs:Date.now()-start,request,tokens:normalizeTokens(usage),error:null,truncated:content.length>30000},content,config.secret);
    return content.slice(0,30000);
  }catch(e){const error=e as Error&{code?:string};await recordProvider({stage:review?'review':'generation',model:config.model,channel:config.model.startsWith('pggo-')?'PGGO':config.model.startsWith('bdgo-')?'BDGO':new URL(config.baseUrl).hostname,endpoint,at:new Date(start).toISOString(),status:'error',httpStatus,durationMs:Date.now()-start,request,tokens:normalizeTokens(usage),error:{type:signal?.aborted?'CANCELLED':httpStatus&&httpStatus>=400?'UPSTREAM_ERROR':'PROTOCOL_OR_NETWORK_ERROR',code:httpStatus?`HTTP_${httpStatus}`:error.code??error.name,message:(raw||error.message).slice(0,2000)},truncated:raw.length>30000},raw||error.message,config.secret);throw e}
}
