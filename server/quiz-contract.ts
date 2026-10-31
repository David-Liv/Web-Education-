import { createHash } from 'node:crypto';
import type { StudyItem, StudioUnit } from '../src/studio-types.ts';
export const QUIZ_CONTRACT={version:'learning-contract-v2',maxAttempts:3,maxItems:5,maxChars:30000,itemFields:['skillId','kind','prompt','passage','options','answer','explanation','hint','criterion','check']} as const;
export type Issue={code:string;path:string;message:string};
export function parseObject(text:string):any {return JSON.parse(text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''))}
export function validateQuiz(text:string,unit:StudioUnit,count:number):{items:StudyItem[];issues:Issue[]}{
 const issues:Issue[]=[],items:StudyItem[]=[];const fail=(path:string,message:string)=>issues.push({code:'INVALID_QUIZ',path,message});
 if([...text].length>QUIZ_CONTRACT.maxChars){fail('$','輸出過長');return {items,issues}}
 let value:any;try{value=parseObject(text)}catch{fail('$','必須回傳完整JSON物件');return {items,issues}}
 if(!value||typeof value!=='object'||Array.isArray(value)){fail('$','必須是物件');return {items,issues}}
 if(value.contractVersion!==QUIZ_CONTRACT.version)fail('contractVersion','版本不符');
 if(Object.keys(value).some(k=>!['contractVersion','items'].includes(k)))fail('$','存在未定義欄位');
 if(!Array.isArray(value.items)||value.items.length!==count){fail('items',`必須剛好有${count}題`);return {items,issues}}
 const seen=new Set<string>();
 value.items.forEach((q:any,i:number)=>{
  const path=`items[${i}]`,before=issues.length;
  if(!q||typeof q!=='object'||Array.isArray(q)){fail(path,'題目必須是物件');return}
  if(Object.keys(q).some(k=>!(QUIZ_CONTRACT.itemFields as readonly string[]).includes(k)))fail(path,'存在未定義欄位');
  for(const k of ['prompt','answer','explanation','hint','criterion'])if(typeof q[k]!=='string'||!q[k].trim()||q[k].length>(k==='prompt'?6000:4000))fail(`${path}.${k}`,'需要非空且長度合適的文字');
  if(!unit.skills.some(s=>s.id===q.skillId))fail(path+'.skillId','技能不在本次範圍');
  if(!['choice','numeric','short'].includes(q.kind))fail(path+'.kind','不支援此題型');
  if(q.passage!==undefined&&(typeof q.passage!=='string'||q.passage.length>12000))fail(path+'.passage','材料格式無效');
  if(q.kind==='choice'){
   if(!Array.isArray(q.options)||q.options.length<2||q.options.length>6||q.options.some((o:any)=>typeof o!=='string'||!o.trim()||o.length>2000)||new Set(q.options.map((o:any)=>String(o).trim())).size!==q.options.length)fail(path+'.options','選項須為2–6個不同的非空文字');
   if(!Array.isArray(q.options)||! /^[A-F]$/.test(q.answer)||q.answer.charCodeAt(0)-65>=q.options.length)fail(path+'.answer','答案不在選項內');
  }else if(q.options!==undefined)fail(path+'.options','只有選擇題可以帶選項');
  if(q.kind==='numeric'&&(!String(q.answer??'').trim()||!Number.isFinite(Number(q.answer))))fail(path+'.answer','數值答案無效');
  if(unit.subjectId==='maths'){
   if(q.skillId!=='quadratic-factor')fail(path+'.skillId','首期AI二次方程數值小測只評求根技能；情境建模使用固定題及步驟參考');
   const c=q.check;
   if(q.kind!=='numeric'||!c||![c.a,c.b,c.c].every(n=>Number.isInteger(n)&&Math.abs(n)<=100)||!c.a||!['larger','smaller'].includes(c.root))fail(path+'.check','首期數學測驗只支援附a,b,c及larger/smaller的二次方程數值題');
   else {const disc=c.b*c.b-4*c.a*c.c;if(disc<0)fail(path+'.check','此範圍只支援實根');else{const roots=[(-c.b+Math.sqrt(disc))/(2*c.a),(-c.b-Math.sqrt(disc))/(2*c.a)],answer=c.root==='larger'?Math.max(...roots):Math.min(...roots);if(Math.abs(Number(q.answer)-answer)>1e-6)fail(path+'.answer','答案與係數驗算不一致')}}
  }else if(q.check!==undefined)fail(path+'.check','此學科不能帶數學驗算參數');
  if(issues.length!==before)return;
  // Maths wording is built from validated parameters, never from an unrelated model equation.
  const prompt=unit.subjectId==='maths'?`${q.check.a}x² + (${q.check.b})x + (${q.check.c}) = 0，求${q.check.root==='larger'?'較大':'較小'}的根（可填小數）。`:q.prompt.trim();
  const canonical=(prompt+'\n'+(q.passage??'')).toLowerCase().replace(/\s+/g,'');
  if(seen.has(canonical)){fail(path,'題目重複');return}seen.add(canonical);
  const family=createHash('sha256').update(canonical.replace(/-?\d+(?:\.\d+)?/g,'#')).digest('hex').slice(0,20);
  items.push({...q,id:crypto.randomUUID(),family,prompt,explanation:unit.subjectId==='maths'?`以求根公式代入 a=${q.check.a}, b=${q.check.b}, c=${q.check.c}，再按題目選根。參考數值：${q.answer}。`:q.explanation});
 });return {items:issues.length?[]:items,issues};
}
export async function generateAssessment(unit:StudioUnit,count:number,call:(messages:{role:string;content:string}[])=>Promise<string>){
 const messages=[{role:'system',content:`只回JSON，格式為{"contractVersion":"${QUIZ_CONTRACT.version}","items":[{"skillId":"本次技能ID","kind":"choice|numeric|short","prompt":"題目","answer":"選項字母或數值或參考要點","explanation":"解析","hint":"提示","criterion":"評價依據"}]}。選擇題另帶options文字陣列，閱讀題附原創passage。數學只用quadratic-factor技能，生成二次方程數值題，另帶check:{a:整數,b:整數,c:整數,root:"larger|smaller"}，保證有實根並用係數算答案。數學題干由代碼依係數生成。不得聲稱歷屆原題或官方等級。`},{role:'user',content:JSON.stringify({count,unit})}];
 const trace:{attempt:number;issues:Issue[]}[]=[];
 for(let attempt=1;attempt<=QUIZ_CONTRACT.maxAttempts;attempt++){
  const text=await call(messages),result=validateQuiz(text,unit,count);trace.push({attempt,issues:result.issues});
  if(!result.issues.length)return {items:result.items,attempts:attempt,trace};
  if(attempt<QUIZ_CONTRACT.maxAttempts)messages.push({role:'assistant',content:text.slice(0,30000)},{role:'user',content:JSON.stringify({action:'rework',errors:result.issues,request:'修正以上錯誤，保持原科目與題數，返回完整JSON'})});
 }
 throw Object.assign(new Error('測驗題目經三次生成仍未通過檢查；可改用固定練習。'),{status:422,code:'QUIZ_VALIDATION_FAILED',trace});
}
