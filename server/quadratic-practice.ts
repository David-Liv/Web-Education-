import {compilePlot} from '../src/chat-math.ts';
import {quadraticSkill} from '../src/quadratic-skills.ts';
import type {StudyItem,StudyFeedback} from '../src/studio-types.ts';
export interface MathRule {expected:number;tolerance?:number;method?:string[]}
const normalize=(s:string)=>s.replace(/[\s$]/g,'').replace(/[−–]/g,'-').replace(/[×·]/g,'*').replace(/[＝]/g,'=').toLowerCase();
export function mathValue(raw:string){
 let value=normalize(raw.replace(/^(?:.*?\bQ\s*\d+\s*[:,，：]?\s*)?(?:我的答案(?:是|為|为)?|答案(?:是|為|为)|my answer(?: is)?|I think|I got)\s*[:：]?\s*/i,'')).replace(/^(?:x|a|b|c|d|k|t)=/,'').replace(/\\sqrt\{([^{}]+)\}/g,'sqrt($1)').replace(/√\(([^()]+)\)/g,'sqrt($1)').replace(/√(\d+(?:\.\d+)?)/g,'sqrt($1)').replace(/\\frac\{(-?\d+)\}\{(-?\d+)\}/g,'($1)/($2)');
 if(!value||value.length>180||!/^(?:[0-9.e+*/()\-]|sqrt)+$/.test(value))return NaN;
 try{return compilePlot(value)(0)}catch{return NaN}
}
export function checkMath(item:StudyItem,answer:string,steps=''):StudyFeedback|null{
 if(!item.mathRule)return null;
 const value=mathValue(answer),ok=Number.isFinite(value)&&Math.abs(value-item.mathRule.expected)<=(item.mathRule.tolerance??1e-6);
 if(!Number.isFinite(value)&&answer.trim())return {source:'unavailable',score:null,verdict:'uncertain',text:'作答已保存；這個寫法需要參考核對。',reason:'目前不能可靠解析這個數學表達式。'};
 const result:StudyFeedback={source:'code',score:ok?100:0,verdict:ok?'correct':'incorrect',text:item.explanation,reason:ok?'已按題目參數核對結果。':'請核對係數、條件及運算。',resultCorrect:ok};
 if(!answer.trim())return {...result,score:null,verdict:'uncertain',resultCorrect:null,text:'尚未提供答案。'};
 if(item.mathRule.method){const work=normalize(steps||answer);const known=item.mathRule.method.some(e=>work.includes(normalize(e)));return {...result,score:known?result.score:null,verdict:known?result.verdict:'uncertain',methodKnown:known?true:null,text:result.text+(known?'':' 請補充建立的方程；目前只能核對結果，方法保持未知。')}}
 return result;
}
export function assessmentMath(skillId:string,c:any):Omit<StudyItem,'id'>|null{
 if(!c||![c.a,c.b,c.c].every(n=>Number.isInteger(n)&&Math.abs(n)<=100)||!c.a)return null;
 const {a,b}=c,d=b*b-4*a*c.c,root=c.root??'larger';let prompt='',expected=0,method:string[]|undefined;
 if(['quadratic-factor','quadratic-formula'].includes(skillId)){
  if(d<0||!['larger','smaller'].includes(root)||skillId==='quadratic-factor'&&!Number.isInteger(Math.sqrt(d)))return null;
  const roots=[(-b+Math.sqrt(d))/(2*a),(-b-Math.sqrt(d))/(2*a)];expected=root==='larger'?Math.max(...roots):Math.min(...roots);prompt=`${a}x² + (${b})x + (${c.c}) = 0，求${root==='larger'?'較大':'較小'}的根（可用 sqrt(...) 或小數）。`;
 }else if(skillId==='quadratic-standard'){expected=b;prompt=`把 ${a}x² + (${b})x = ${-c.c} 整理成標準式，寫出 b。`}
 else if(skillId==='quadratic-discriminant'){expected=d;prompt=`求 ${a}x² + (${b})x + (${c.c}) = 0 的判別式。`}
 else if(skillId==='quadratic-parameter'){expected=b*b/(4*a);prompt=`${a}x² + (${b})x + k = 0 有二重實根，求 k。`}
 else if(skillId==='quadratic-model'){
  if(a!==1||b<=0||c.c>=0||d<0||!Number.isInteger(Math.sqrt(d)))return null;expected=(-b+Math.sqrt(d))/2;prompt=`長方形寬 x，長 x+${b}，面積 ${-c.c}。求寬並寫出方程。`;method=[`x(x+${b})=${-c.c}`,`x²+${b}x+(${c.c})=0`];
 }else return null;
 return {skillId,family:`validated-${skillId}-${a===1?'monic':'nonmonic'}-${root}`,kind:'numeric',prompt,answer:String(expected),explanation:`a=${a}, b=${b}, c=${c.c}; D=${d}. ${skillId==='quadratic-parameter'?'D=0. ':''}參考結果：${expected}。`,hint:'先檢查標準式、係數及題目的條件。',criterion:'按題目參數核對結果；建模需提供方程。',mathRule:{expected,tolerance:skillId==='quadratic-formula'?.001:1e-6,method},check:c};
}
export function quadraticItems(skillId:string,count:number,seen:string[]=[],english=false):StudyItem[]{
 if(!quadraticSkill(skillId))throw new Error('UNKNOWN_QUADRATIC_SKILL');
 return Array.from({length:count},(_,index)=>{
  const n=2+Math.floor(Math.random()*7),m=n+1+Math.floor(Math.random()*5),offset=seen.length+index,variant=offset%3;
  let prompt='',answer=0,explanation='',hint='',family='',method:string[]|undefined,tolerance:number|undefined;
  if(skillId==='quadratic-standard'){
   const a=variant+1,b=-(n+m),c=n*m;
   prompt=english?`Rewrite ${a}x² − ${n+m}x = −${c} in standard form. Give ${['a','b','c'][variant]}.`:`把 ${a}x² − ${n+m}x = −${c} 整理成標準式，寫出係數 ${['a','b','c'][variant]}。`;
   answer=[a,b,c][variant];explanation=`${a}x² − ${n+m}x + ${c}=0; a=${a}, b=${b}, c=${c}.`;hint=english?'Move every term to the left first.':'先把右方整理為零，再讀取帶正負號的係數。';family='standard-'+['leading','linear-sign','constant-move'][variant];
  }else if(skillId==='quadratic-factor'){
   const a=variant===1?2:1,b=-(a*n+m),c=n*m,roots=[n,m/a];
   prompt=english?`Solve ${a}x² − ${-b}x + ${c}=0. Give the ${variant===2?'smaller':'larger'} root.`:`解 ${a}x² − ${-b}x + ${c}=0，寫出${variant===2?'較小':'較大'}的根。`;
   answer=variant===2?Math.min(...roots):Math.max(...roots);explanation=`(${a}x−${m})(x−${n})=0; x=${m/a} or ${n}.`;hint=english?'Use the zero-product property, then compare both roots.':'利用零乘積原理求出全部根，再比較大小。';family='factor-'+['monic','nonmonic','select-smaller'][variant];
  }else if(skillId==='quadratic-formula'){
   const a=variant+1,b=-2*n,c=-(m+1),d=b*b-4*a*c,roots=[(-b+Math.sqrt(d))/(2*a),(-b-Math.sqrt(d))/(2*a)];
   answer=variant===1?Math.min(...roots):Math.max(...roots);tolerance=.001;
   prompt=english?`Use the quadratic formula for ${a}x² − ${2*n}x − ${m+1}=0. Give the ${variant===1?'smaller':'larger'} root (sqrt(...) or 3 decimal places).`:`用求根公式解 ${a}x² − ${2*n}x − ${m+1}=0，寫出${variant===1?'較小':'較大'}的根（可用 sqrt(...) 或三位小數）。`;
   explanation=`x=(${2*n} ± sqrt(${d}))/${2*a}; ${answer.toFixed(3)}.`;hint=english?'Keep the negative sign in c when calculating the discriminant.':'代入前先寫出 a、b、c，注意 c 的負號。';family='formula-'+['positive-root','negative-root','nonmonic'][variant];
  }else if(skillId==='quadratic-discriminant'){
   const c=n*n+[ -1,0,1][variant],d=4*n*n-4*c;
   answer=variant===0?d:variant===1?1:0;
   prompt=english?`For x² − ${2*n}x + ${c}=0, ${variant===0?'calculate D = b²−4ac':'state the number of distinct real roots'}.`:`對 x² − ${2*n}x + ${c}=0，${variant===0?'計算判別式 D=b²−4ac':'寫出相異實根的數目'}。`;
   explanation=`D=${d}; ${d>0?'2 distinct real roots':d===0?'1 repeated real root':'no real roots'}.`;hint=english?'Distinguish D from the number of roots.':'先算 D，再按正、零、負判斷；D 不等於根的數目。';family='discriminant-'+['positive','zero','negative'][variant];
  }else if(skillId==='quadratic-parameter'){
   const limit=n*n;
   if(variant===0){answer=limit;prompt=english?`x² − ${2*n}x + k=0 has a repeated real root. Find k.`:`x² − ${2*n}x + k=0 有二重實根，求 k。`;explanation=`D=${4*limit}−4k=0; k=${limit}.`}
   else if(variant===1){answer=limit-1;prompt=english?`x² − ${2*n}x + k=0 has two distinct real roots. Give the largest integer k.`:`x² − ${2*n}x + k=0 有兩個相異實根，求 k 的最大整數值。`;explanation=`D>0 ⇒ k<${limit}; largest integer k=${answer}.`}
   else{answer=limit;prompt=english?`x² − ${2*n}x + k=0 has real roots. Give the greatest possible k.`:`x² − ${2*n}x + k=0 有實根，求 k 可取的最大值。`;explanation=`D≥0 ⇒ k≤${limit}; k=${limit}.`}
   hint=english?'Choose D=0, D>0 or D≥0 according to the wording.':'分清二重實根、兩個相異實根和有實根的條件。';family='parameter-'+['repeated','strict-integer','inclusive-bound'][variant];
  }else{
   if(variant===0){const diff=m-n;answer=n;prompt=english?`A rectangle has width x and length x+${diff}. Its area is ${n*m}. Find x and write the equation you used.`:`長方形寬為 x，長為 x+${diff}，面積為 ${n*m}。求 x，並寫出建立的方程。`;method=[`x(x+${diff})=${n*m}`,`x²+${diff}x-${n*m}=0`,`x^2+${diff}x-${n*m}=0`];explanation=`x(x+${diff})=${n*m}; roots ${n}, −${m}; x=${n}>0.`}
   else if(variant===1){answer=n;prompt=english?`Two consecutive positive integers are x and x+1. Their product is ${n*(n+1)}. Find the smaller integer and write your equation.`:`兩個連續正整數為 x、x+1，乘積為 ${n*(n+1)}。求較小整數，並寫出方程。`;method=[`x(x+1)=${n*(n+1)}`,`x²+x-${n*(n+1)}=0`,`x^2+x-${n*(n+1)}=0`];explanation=`x(x+1)=${n*(n+1)}; x=${n} or −${n+1}; x=${n}>0.`}
   else{answer=n;prompt=english?`An object's height is h(t)=−t²+${n}t. Find when it returns to h=0 after launch (t>0), and show the equation.`:`物件高度 h(t)=−t²+${n}t。求起動後再次回到 h=0 的時間（t>0），並寫出方程。`;method=[`-t²+${n}t=0`,`-t^2+${n}t=0`,`t(${n}-t)=0`];explanation=`t(${n}−t)=0; t=0 or ${n}; exclude t=0, so t=${n}.`}
   hint=english?'Write the equation and use the stated domain to select a root.':'先建立方程，再按正數／時間條件選根。';family='model-'+['rectangle','integers','return-time'][variant];
  }
  return {id:crypto.randomUUID(),skillId,family:'v16-'+family,kind:'numeric',prompt,answer:String(answer),explanation,hint,criterion:english?'Use the stated method and check the conditions.':'按題目方法與條件核對。',mathRule:{expected:answer,tolerance,method}};
 });
}
