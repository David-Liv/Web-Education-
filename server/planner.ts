import type { PlanPreview, Programme, Task } from '../src/types.ts';
import type { ContentPack, VersionedPreview } from '../src/pilot-types.ts';
import { RULE_VERSION } from '../src/pilot-types.ts';
import { assessSkill } from '../src/pilot-rules.ts';
import { buildWeekGoals, addDays, calculateScore, dailyCapacity, gradePoints, hasConflict, minutesTime, timeMinutes } from '../src/domain.ts';
import type { StudentState } from './store.ts';
import { studySkills } from './studio-state.ts';

export function planStudent(data:StudentState,packs:ContentPack[],programme?:Programme,now=new Date(),preferences:{maintainTopic?:string;subjectFocus?:string[]}={}):VersionedPreview{
  const tasks:Task[]=[],unscheduled:Task[]=[];
  const date=data.profile.date;const preserved=data.tasks.filter(t=>t.locked||t.status==='done'||t.kind==='exam');
  const provisional=studySkills(data);
  const states=packs.flatMap(p=>p.skills.map(s=>{const formal=assessSkill(s,data.evidence,now),p=provisional.find(p=>p.id===s.id);return formal.count||!p?.count?formal:{...formal,score:p.score,count:p.count,label:p.paused?'需加強':p.score===null?'未評估':p.score<60?'需加強':'初步掌握'};}));
  const scheduled=new Set<string>();const allocations=new Map<string,{subjectId:string;minutes:number;reason:string}>();
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hong_Kong',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  const todayMinute=Math.ceil(timeMinutes(clock)/5)*5;
  type Candidate={pack:ContentPack;key:string;title:string;minutes:number;kind:Task['kind'];rank:number;reason:string;skillId?:string};
  const candidates=packs.filter(p=>data.profile.subjects.includes(p.subjectId)).flatMap<Candidate>(p=>{
    const g=data.profile.grades[p.subjectId],target=data.profile.targetGrades[p.subjectId];
    const maintaining=preferences.maintainTopic===p.topicId||g&&target&&g!=='U'&&gradePoints(g)>=gradePoints(target);
    const minimum=programme?.minimum[p.subjectId];const conflict=minimum&&target&&gradePoints(target)<gradePoints(minimum);
    if(conflict){unscheduled.push({id:crypto.randomUUID(),date,start:'00:00',minutes:0,title:`${p.title}：個人目標與課程必要要求有衝突`,subjectId:p.subjectId,kind:'study',status:'pending',locked:false,reason:'先檢查升學目標；不自動更改目標'});return []}
    if(maintaining)return [{pack:p,key:`maintain-${p.id}`,title:`維持與抽查 · ${p.title}`,minutes:10,kind:'review' as const,rank:4,reason:preferences.maintainTopic===p.topicId?'你選擇暫時維持此單元；既有弱項和未完成證據保留，整科目標不變':'整科基準已達個人目標；維持所學，主要時間留給未達目標科目',skillId:undefined}];
    const unknown=p.skills.every(s=>states.find(x=>x.id===s.id)?.label==='未評估');
    if(unknown)return [{pack:p,key:`diagnose-${p.id}`,title:`單元摸底 · ${p.title}`,minutes:12,kind:'practice' as const,rank:2,reason:'缺少單元證據，先做約 10–15 分鐘診斷；不推算整科等級',skillId:undefined}];
    return p.skills.filter(s=>s.prerequisites.every(id=>{const st=states.find(x=>x.id===id);return st?.label.startsWith('較穩定')||st?.label==='初步掌握'})).map(s=>{
      const st=states.find(x=>x.id===s.id)!;const paused=data.cycles.find(c=>c.skillId===s.id)?.paused;
      return {pack:p,key:`skill-${s.id}`,title:`${paused?'前置補救':st.label.startsWith('較穩定')?'隔時復測':'理解與新題'} · ${s.name}`,minutes:Math.round((s.minutes[0]+s.minutes[1])/2),kind:st.label.startsWith('較穩定')?'review' as const:'study' as const,rank:paused?0:st.label==='需加強'?1:st.label==='未評估'?2:3,reason:paused?'同一補救周期兩次失敗，先看完整示例或補前置能力':`${st.label}；按技能證據及先修安排，不承諾固定升級`,skillId:s.id};
    });
  });
  const gain=(subject:string)=>{if(!programme?.formula?.verified||!data.profile.grades[subject]||!data.profile.targetGrades[subject])return 0;const base=calculateScore(data.profile.grades,programme.formula).score,after=calculateScore({...data.profile.grades,[subject]:data.profile.targetGrades[subject]},programme.formula).score;return base===null||after===null?0:Math.max(0,after-base)};
  const focus=(subject:string)=>preferences.subjectFocus?.includes(subject)?preferences.subjectFocus.indexOf(subject):100;
  candidates.sort((a,b)=>a.rank-b.rank||focus(a.pack.subjectId)-focus(b.pack.subjectId)||gain(b.pack.subjectId)-gain(a.pack.subjectId)||a.minutes-b.minutes||a.key.localeCompare(b.key));
  for(const c of candidates){if(c.skillId&&provisional.some(s=>s.id===c.skillId&&s.count)&&!data.evidence.some(e=>e.skillIds.includes(c.skillId!)&&e.reviewed))c.reason+='；採用暫定練習依據，後續新題再驗證';const improvement=gain(c.pack.subjectId);if(improvement)c.reason+=`；假設此科達到所填整科目標，課程加權分情景 +${improvement.toFixed(2)}。此活動只涵蓋相關技能，並非完成即得該增益`}
  for(let d=0;d<14;d++){
    const day=addDays(date,d);let remaining=Math.max(0,dailyCapacity(data.profile,day)-preserved.filter(t=>t.date===day&&t.kind!=='exam'&&!!t.start&&t.schedule!=='floating').reduce((n,t)=>n+t.minutes,0));
    let cursor=Math.max(timeMinutes(data.profile.availability[(new Date(day+'T12:00:00Z').getUTCDay()+6)%7]??'18:00'),d===0?todayMinute:0);
    const put=(task:Task)=>{if(task.minutes>remaining)return false;while(cursor+task.minutes<=1440&&hasConflict({...task,start:minutesTime(cursor)},[...preserved,...tasks]))cursor+=5;if(cursor+task.minutes>1440)return false;task.start=minutesTime(cursor);tasks.push(task);remaining-=task.minutes;cursor+=task.minutes;return true};
    const due=data.reviews.filter(r=>r.lastReviewed!==day&&[r.dueDate<date?date:r.dueDate,addDays(r.lastLearned,3),addDays(r.lastLearned,7)].includes(day));
    const reviewMinutes=Math.floor(Math.min(20,Math.floor(dailyCapacity(data.profile,day)*data.profile.reviewPercent/100),remaining)/5)*5;
    if(due.length&&reviewMinutes>=5&&!preserved.some(t=>t.date===day&&t.kind==='review'))put({id:crypto.randomUUID(),date:day,start:'00:00',minutes:reviewMinutes,title:'每日溫習 · 到期回顧與小測',subjectId:'all',kind:'review',status:'pending',locked:false,reason:'回顧包含在每日總時間內；未完成項目保留'});
    for(const c of candidates){if(scheduled.has(c.key)||preserved.some(t=>t.kind==='exam'&&t.subjectId===c.pack.subjectId&&t.date<=day))continue;
      const task:Task={id:crypto.randomUUID(),date:day,start:'00:00',minutes:c.minutes,title:c.title,subjectId:c.pack.subjectId,topicId:c.pack.topicId,skillId:c.skillId,kind:c.kind,status:'pending',locked:false,reason:c.reason};
      if(put(task)){scheduled.add(c.key);const a=allocations.get(c.pack.subjectId)??{subjectId:c.pack.subjectId,minutes:0,reason:c.reason};a.minutes+=c.minutes;allocations.set(c.pack.subjectId,a)}
    }
  }
  for(const c of candidates.filter(c=>!scheduled.has(c.key)))unscheduled.push({id:crypto.randomUUID(),date,start:'00:00',minutes:c.minutes,title:c.title,subjectId:c.pack.subjectId,topicId:c.pack.topicId,kind:c.kind,status:'pending',locked:false,reason:'目前 14 天可用時段不足；請選擇取捨，不自動增加時間'});
  if(!packs.length)unscheduled.push({id:crypto.randomUUID(),date,start:'00:00',minutes:0,title:'內容仍待雙人復核發布',subjectId:'all',kind:'study',status:'pending',locked:false,reason:'可以先設定目標或自行加入任務；正式診斷在內容發布後開放'});
  const weeks=buildWeekGoals([...preserved,...tasks],date);
  return {tasks,unscheduled,allocations:[...allocations.values()],weeks,source:'pilot-rules',previewId:crypto.randomUUID(),revision:data.revision,ruleVersion:RULE_VERSION,generatedAt:now.toISOString(),planDate:date,contentSignature:packs.map(p=>`${p.id}@${p.version}`).sort().join(',')};
}

export function canSmallReorder(before:Task,after:Task,others:Task[]){return !before.locked&&before.status==='pending'&&before.kind!=='exam'&&before.date===after.date&&before.subjectId===after.subjectId&&before.kind===after.kind&&before.minutes===after.minutes&&!hasConflict(after,others)}

export function reconcileToday(data:StudentState,now=new Date()){
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hong_Kong',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  let cursor=Math.ceil(timeMinutes(clock)/5)*5,changed=0;
  for(const before of data.tasks.filter(t=>t.date===data.profile.date&&!!t.start&&t.schedule!=='floating'&&t.status==='pending'&&!t.locked&&t.kind!=='exam').sort((a,b)=>a.start.localeCompare(b.start))){
    if(timeMinutes(before.start)>=cursor)continue;
    const other=data.tasks.filter(t=>t.id!==before.id&&t.status!=='skipped');
    const earlierDependency=other.some(t=>t.date===before.date&&t.status==='pending'&&t.subjectId===before.subjectId&&t.start<before.start&&t.kind!==before.kind);
    if(earlierDependency)continue;
    // Preserve all existing activity order; never push through a later prerequisite/task.
    const next=other.filter(t=>t.date===before.date&&t.start>before.start).sort((a,b)=>a.start.localeCompare(b.start))[0];
    const after={...before,start:minutesTime(cursor)};
    if(cursor+before.minutes>1440||next&&cursor+before.minutes>timeMinutes(next.start)||!canSmallReorder(before,after,other))continue;
    data.reorders??=[];data.reorders.push({taskId:before.id,before:before.start,after:after.start,at:now.toISOString()});before.start=after.start;cursor+=before.minutes;changed++;
  }
  return changed;
}
