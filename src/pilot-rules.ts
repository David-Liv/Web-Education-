import type { ContentPack, Cycle, PilotEvidence, Skill, SkillState } from './pilot-types.ts';
import { MASTERY_POLICY } from './pilot-types.ts';
import type { Grade, Profile, Programme } from './types.ts';
import { calculateScore, gradeOrder, gradePoints } from './domain.ts';

export function assessSkill(skill: Skill, all: PilotEvidence[], now = new Date()): SkillState {
  const policy={...MASTERY_POLICY,...skill.policy};
  const unique = new Map<string, PilotEvidence>();
  all.filter(e => e.independent && e.reviewed && e.skillIds.includes(skill.id)).sort((a,b) => a.at.localeCompare(b.at)).forEach(e => unique.set(e.questionId,e));
  const records = [...unique.values()].slice(-8);
  const score = records.length ? Math.round(records.reduce((s,e)=>s+e.awarded,0)/records.reduce((s,e)=>s+e.max,0)*100) : null;
  const passed = records.filter(e=>e.awarded/e.max>=.8&&e.criticalPassed);
  const families = new Set(passed.map(e=>e.familyId)).size;
  const delayed = passed.length>1 && Date.parse(passed.at(-1)!.at)-Date.parse(passed[0].at)>=policy.delayedHours*3600000;
  const last = records.at(-1);
  const stable = passed.length>=policy.stableQuestions && families>=policy.stableFamilies && delayed && score!>=policy.stablePercent && !!last?.criticalPassed;
  const provisional = passed.length>=policy.provisionalQuestions && score!>=policy.stablePercent && !!last?.criticalPassed;
  const nextCheckAt = passed.length ? new Date(Date.parse(passed.at(-1)!.at)+policy.delayedHours*3600000).toISOString() : undefined;
  const due = stable && nextCheckAt! <= now.toISOString();
  return {id:skill.id,name:skill.name,label:!records.length?'未評估':stable?(due?'較穩定 · 復測到期':'較穩定'):provisional?'初步掌握':score!<60?'需加強':'證據不足',score,count:records.length,families,delayed,nextCheckAt};
}

export function updateCycle(cycles: Cycle[], skillId: string, correct: boolean, questionId: string, at: string): Cycle[] {
  const next=structuredClone(cycles);let cycle=next.find(c=>c.skillId===skillId);
  if(!cycle){cycle={skillId,failures:0,paused:false,questionIds:[],updatedAt:at};next.push(cycle)}
  if(!cycle.questionIds.includes(questionId)){
    cycle.questionIds.push(questionId);
    if(!correct)cycle.failures++;
    else if(!cycle.paused)cycle.failures=0;
    // A paused cycle needs an explicit remedial action, not another chat or a correct repeat.
    if(cycle.failures>=2)cycle.paused=true;
    cycle.updatedAt=at;
  }
  return next;
}

export function validatePack(pack: ContentPack): string[] {
  const errors:string[]=[];const ids=new Set<string>();const skills=new Map(pack.skills?.map(s=>[s.id,s])??[]);
  if(!pack.id||!Number.isInteger(pack.version)||pack.version<1||!pack.source||!pack.topicId||!pack.subjectId||!pack.title)errors.push('內容包識別、版本、標題、學科、單元與來源必須完整');
  if(!skills.size)errors.push('缺少技能藍圖');
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(pack.id)||skills.size>64||pack.questions?.length>500)errors.push('內容包 ID 或規模無效');
  const visit=(id:string,path:Set<string>):boolean=>{if(path.has(id))return false;const s=skills.get(id);return !!s&&s.prerequisites.every(p=>visit(p,new Set([...path,id])))};
  for(const s of skills.values()){if(!s.name||!Array.isArray(s.minutes)||s.minutes.length!==2||s.minutes.some(n=>!Number.isFinite(n)||n<=0)||s.minutes[0]>s.minutes[1])errors.push(`${s.id}：時長或名稱無效`);if(!visit(s.id,new Set()))errors.push(`${s.id}：先修缺失或循環`)}
  for(const s of skills.values())if(s.policy){const p={...MASTERY_POLICY,...s.policy};if(Object.entries(s.policy).some(([key,value])=>!['provisionalQuestions','stableQuestions','stableFamilies','stablePercent','delayedHours'].includes(key)||!Number.isFinite(value))||p.provisionalQuestions<1||p.stableQuestions<p.provisionalQuestions||p.stableQuestions>8||p.stableFamilies<2||p.stablePercent<50||p.stablePercent>100||p.delayedHours<24)errors.push(`${s.id}：證據規則參數無效`)}
  if(!pack.questions?.length)errors.push('缺少題目');
  for(const q of pack.questions??[]){
    if(ids.has(q.id))errors.push(`${q.id}：題號重複`);ids.add(q.id);
    if(!q.id||!q.prompt||!q.answer?.trim()||!q.explanation||!q.hint||!q.source||!q.familyId)errors.push(`${q.id}：題目／答案／解析／提示／來源／家族不完整`);
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(q.id)||!['choice','numeric','short','essay','audio'].includes(q.kind)||!['基礎','進階'].includes(q.difficulty)||!Number.isFinite(q.marks)||q.marks<=0||!Number.isFinite(q.expectedMinutes)||q.expectedMinutes<=0||q.expectedMinutes>60)errors.push(`${q.id}：識別、題型、難度、分值或預計時間無效`);
    if(q.topicId!==pack.topicId||q.subjectId!==pack.subjectId)errors.push(`${q.id}：單元或學科不一致`);
    if(!q.skillIds?.length||q.skillIds.some(s=>!skills.has(s)))errors.push(`${q.id}：技能不存在`);
    if(!q.scoring?.length||new Set(q.scoring.map(s=>s.id)).size!==q.scoring.length||q.scoring.some(s=>s.marks<=0)||q.scoring.reduce((n,s)=>n+s.marks,0)!==q.marks)errors.push(`${q.id}：評分點無效`);
    if(q.kind==='choice'&&(!q.options||q.options.length<2||q.options.length>4||! /^[A-D]$/.test(q.answer)||q.answer.charCodeAt(0)-65>=q.options.length))errors.push(`${q.id}：選項／答案無效`);
    if(q.kind==='numeric'&&(!Number.isFinite(Number(q.answer))||q.tolerance!==undefined&&(!Number.isFinite(q.tolerance)||q.tolerance<0)))errors.push(`${q.id}：數值答案／誤差無效`);
  }
  for(const s of skills.values()){const qs=(pack.questions??[]).filter(q=>q.skillIds?.includes(s.id));if(qs.length<4||new Set(qs.map(q=>q.familyId)).size<2)errors.push(`${s.id}：需至少四題及兩種題目家族供診斷、補救、復測`)}
  if(!pack.lessons?.length||pack.lessons.some(l=>!l.text||!l.title||!l.skillIds.length||l.skillIds.some(s=>!skills.has(s))))errors.push('教學短塊或技能映射不完整');
  return [...new Set(errors)];
}

export interface GradeCost { subjectId:string; from:Grade; to:Grade; hours:[number,number]; source:string }
export function compareGradePaths(profile:Profile,programme:Programme,costs:GradeCost[],budgetHours:number){
  const base=calculateScore(profile.grades,programme.formula??{count:5,required:[],weights:{},scale:'standard',verified:false});
  const conflicts=Object.entries(programme.minimum).filter(([id,min])=>profile.targetGrades[id]!==undefined&&gradePoints(profile.targetGrades[id])<gradePoints(min)).map(([id])=>id);
  if(!programme.formula?.verified||base.score===null)return {baseline:null,conflicts,paths:[],missing:'缺少已核實公式或整科成績'};
  const subjects=Object.keys(profile.targetGrades).filter(id=>gradeOrder.includes(profile.grades[id])&&gradeOrder.includes(profile.targetGrades[id])&&profile.grades[id]!=='U').slice(0,8);
  const choices=subjects.map(id=>gradeOrder.slice(gradeOrder.indexOf(profile.grades[id]),gradeOrder.indexOf(profile.targetGrades[id])+1));
  const paths:{grades:Record<string,Grade>;gain:number;hours:[number,number]|null;feasible:boolean|null;minimumMet:boolean;assumptions:string[]}[]=[];
  const walk=(i:number,g:Record<string,Grade>,lo:number,hi:number,known:boolean,assumptions:string[])=>{
    if(i===subjects.length){const score=calculateScore(g,programme.formula!).score;if(score===null)return;const minimumMet=Object.entries(programme.minimum).every(([id,min])=>g[id]!==undefined&&gradePoints(g[id])>=gradePoints(min));paths.push({grades:{...g},gain:Math.round((score-base.score!)*100)/100,hours:known?[lo,hi]:null,feasible:known?hi<=budgetHours:null,minimumMet,assumptions:[...new Set(assumptions)]});return}
    const id=subjects[i];for(const grade of choices[i]){let low=lo,high=hi,k=known;const sources=[...assumptions];for(let n=gradeOrder.indexOf(profile.grades[id]);n<gradeOrder.indexOf(grade);n++){const c=costs.find(c=>c.subjectId===id&&c.from===gradeOrder[n]&&c.to===gradeOrder[n+1]);if(!c||!c.source||c.hours[0]<0||c.hours[1]<c.hours[0])k=false;else{low+=c.hours[0];high+=c.hours[1];sources.push(c.source)}}walk(i+1,{...g,[id]:grade},low,high,k,sources)}
  };
  // Explicitly bounded enumeration; never call this a calibrated grade prediction.
  if(choices.some(c=>!c.length)||choices.reduce((n,c)=>n*c.length,1)>100000)return {baseline:base.score,conflicts,paths:[],missing:'組合過多，請縮小目標範圍'};
  walk(0,{...profile.grades},0,0,true,[]);
  paths.sort((a,b)=>Number(b.minimumMet)-Number(a.minimumMet)||Number(b.feasible===true)-Number(a.feasible===true)||b.gain-a.gain||(a.hours?.[1]??Infinity)-(b.hours?.[1]??Infinity));
  return {baseline:base.score,conflicts,paths:paths.slice(0,20),missing:paths.some(p=>!p.hours)?'部分提分成本待估；不提供錄取概率':null};
}
