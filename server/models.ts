import type { ModelConfig } from './store.ts';
import { reject } from './learning.ts';

export function publicModel(config:ModelConfig|null){if(!config)return null;const {secret,...pub}=config;return {...pub,hasKey:!!secret}}
export function validateModel(input:any,previous:ModelConfig|null):ModelConfig{
  let url:URL;try{url=new URL(String(input.baseUrl))}catch{reject('請填寫有效的 API Base URL')}
  if(url.username||url.password||url.search||url.hash||!['http:','https:'].includes(url.protocol))reject('API 地址不可含帳密、查詢參數或片段');
  if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))reject('遠端 API 請使用 HTTPS；本機服務可用 HTTP');
  if(!['openai-chat','openai-responses'].includes(input.protocol))reject('請選擇服務實際支援的協議');
  const model=String(input.model??'').trim();if(model.length>200)reject('模型 ID 過長');
  return {id:'default',name:String(input.name??'我的模型服務').slice(0,80),baseUrl:url.toString().replace(/\/$/,''),secret:input.clearKey?'':typeof input.apiKey==='string'&&input.apiKey?input.apiKey:previous?.baseUrl===url.toString().replace(/\/$/,'')?previous.secret:'',model,protocol:input.protocol,enabled:input.enabled!==false,models:previous?.baseUrl===url.toString().replace(/\/$/,'')?previous.models:undefined};
}
async function provider(config:ModelConfig,path:string,body?:unknown,signal?:AbortSignal){
  const result=await fetch(`${config.baseUrl}/${path}`,{method:body?'POST':'GET',headers:{...(config.secret?{Authorization:`Bearer ${config.secret}`} :{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000),redirect:'error'});
  if(!result.ok)reject(result.status===401||result.status===403?'API 認證失敗；請檢查密鑰與模型權限':result.status===429?'提供方限額或速率限制，稍後可再試':`模型服務回傳 HTTP ${result.status}`,502,'PROVIDER_ERROR');
  if(Number(result.headers.get('content-length')??0)>4*1024*1024)reject('模型服務回應過大',502);
  try{return await result.json() as any}catch{reject('模型服務未返回有效 JSON',502,'PROTOCOL_ERROR')}
}
export async function listModels(config:ModelConfig){const result=await provider(config,'models');if(!Array.isArray(result.data))reject('此服務未提供相容模型清單，可手動填寫 model ID',502,'NO_MODEL_LIST');return [...new Set<string>(result.data.map((m:any)=>m.id).filter((id:any)=>typeof id==='string'&&id.length<=200))].slice(0,1000)}
export async function generate(config:ModelConfig,messages:{role:string;content:string}[],signal?:AbortSignal){
  if(!config.enabled||!config.model)reject('開發者尚未啟用模型或選擇模型 ID',503,'MODEL_NOT_CONFIGURED');
  const payload=config.protocol==='openai-chat'?{model:config.model,messages,max_tokens:2400}:{model:config.model,input:messages,max_output_tokens:2400};
  const result=await provider(config,config.protocol==='openai-chat'?'chat/completions':'responses',payload,signal);
  const content=config.protocol==='openai-chat'?result.choices?.[0]?.message?.content:result.output_text??result.output?.flatMap((o:any)=>o.content??[]).filter((c:any)=>c.type==='output_text').map((c:any)=>c.text).join('\n');
  if(typeof content!=='string'||!content.trim())reject('模型沒有回傳可用文字；請檢查協議與能力',502,'EMPTY_MODEL_RESPONSE');
  return content.slice(0,30000);
}
