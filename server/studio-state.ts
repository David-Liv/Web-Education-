import {quadraticSkills} from '../src/quadratic-skills.ts';
import {quadraticItems} from './quadratic-practice.ts';
import type { StudentState } from './store.ts';
import type { StudyItem, StudioUnit, StudyQuizView, StudyAttempt, StudySkill, StudioView, StudyReport } from '../src/studio-types.ts';
import type { RealtimeProgressItem, RealtimeProgressView, WeakSpotAlert, WeakSpotItem, WeakSpotReport } from '../src/billing-types.ts';
import { addDays } from '../src/domain.ts';
import type { ContentPack } from '../src/pilot-types.ts';
export interface StudyQuiz extends Omit<StudyQuizView,'questions'|'results'> {items:StudyItem[];answerRevision:number;requestId:string;generationTrace?:unknown}
export interface StudioState {quizzes:StudyQuiz[];attempts:StudyAttempt[];resumedAt?:Record<string,string>}
export const units:StudioUnit[]=[
 {subjectId:'maths',topicId:'maths-quadratic',title:'二次方程：方法與情境',skills:[quadraticSkills[1],quadraticSkills[5],...quadraticSkills.filter(s=>!['quadratic-factor','quadratic-model'].includes(s.id))].map(s=>({id:s.id,name:s.name})),lesson:'先整理為 ax²+bx+c=0。可分解時用零乘積原理，否則考慮求根公式。求得根後要檢查題目的正負、單位及情境限制。例：x²−5x+6=0，兩根為2、3。'},
 {subjectId:'chi',topicId:'chi-reading',title:'中文：閱讀、文言與段落表達',skills:[{id:'chi-evidence',name:'按文本推斷與找依據'},{id:'chi-expression',name:'段落組織與表達'}],lesson:'閱讀時先找文本事實，再說明推斷如何由事實支持。文言先辨認主語、動作及語境，不逐字硬套今義。寫作可用「觀點—細節—解釋」組織段落；這是閱讀與寫作輔導，不是指定範文或官方評級。'},
 {subjectId:'eng',topicId:'eng-reading',title:'English: reading, usage and writing',skills:[{id:'eng-evidence',name:'Reading evidence and inference'},{id:'eng-expression',name:'Language and paragraph organisation'}],lesson:'Support an inference with details from the passage. Explain the link instead of copying a whole sentence. For writing, use a clear point, a concrete detail and an explanation. Check tense, agreement and whether each sentence supports the main idea.'}
];
export function studioState(data:StudentState):StudioState {return data.studio??={quizzes:[],attempts:[]}}
export function disputeStudioAttempt(data:StudentState,id:string,reason:string,reject:(msg:string,status?:number)=>never){
 const a=studioState(data).attempts.find(a=>a.id===id)??reject('記錄不存在',404);a.disputed=true;a.corrections.push({at:new Date().toISOString(),reason:reason.trim()});return a;
}
export function seenStudioFamilies(data:StudentState,skillId?:string):string[]{return data.studio?.attempts.filter(a=>!skillId||a.skillId===skillId).map(a=>a.family)??[]}
export function studioAttemptCount(data:StudentState):number{return data.studio?.attempts.length??0}
export function hasSeenAttemptFamily(data:StudentState,family:string):boolean{return studioState(data).attempts.some(a=>a.family===family)}
export function appendStudioAttempt(data:StudentState,record:StudyAttempt){studioState(data).attempts.push(record)}
export function planningPacks(packs:ContentPack[]):ContentPack[]{return [...packs,...units.map(u=>({...u,skills:u.skills.filter(s=>!packs.some(p=>p.skills.some(x=>x.id===s.id)))})).filter(u=>u.skills.length).map(u=>({id:`coach-${u.subjectId}`,version:1,subjectId:u.subjectId,topicId:u.topicId,title:u.title,source:'自主輔導參考；不是已審校測驗題庫',status:'draft' as const,skills:u.skills.map(s=>({...s,minutes:[10,20] as [number,number],prerequisites:[...(quadraticSkills.find(q=>q.id===s.id)?.prerequisites??[])]})),questions:[],lessons:[{title:u.title,text:u.lesson,skillIds:u.skills.map(s=>s.id)}],reviews:[],professionalVerified:false}))]}
export function publicStudyQuiz(q:StudyQuiz,s:StudioState):StudyQuizView {const {items,answerRevision,generationTrace,...pub}=q;return {...pub,questions:items.map(({answer,explanation,hint,criterion,check,mathRule,...item})=>item),results:q.submittedAt?s.attempts.filter(a=>a.quizId===q.id):[]}}
export function studySkills(data:StudentState):StudySkill[]{const s=studioState(data);return units.flatMap(u=>u.skills.map(skill=>{
 const valid=s.attempts.filter(a=>a.skillId===skill.id&&!a.disputed&&!a.pending&&a.feedback.score!==null);
 const unique=[...new Map(valid.filter(a=>a.independent).map(a=>[a.itemId,a])).values()].slice(-8);
 const basis=unique.length?unique:[...new Map(valid.map(a=>[a.itemId,a])).values()].slice(-8);const score=basis.length?Math.round(basis.reduce((n,a)=>n+a.feedback.score!,0)/basis.length):null;
 const recent=valid.filter(a=>a.at>(s.resumedAt?.[skill.id]??'')).slice(-2),paused=recent.length===2&&recent.every(a=>a.feedback.score!<50);
 const delayed=unique.length>1&&Date.parse(unique.at(-1)!.at)-Date.parse(unique[0].at)>=86400000;
 return {...skill,subjectId:u.subjectId,topicId:u.topicId,score,count:valid.length,independentCount:unique.length,paused,label:paused?'先換方法／補先備':score===null?'未評估':!unique.length?'練習參考（暫定）':score<60?'需加強（暫定）':unique.length>=3&&new Set(unique.map(a=>a.family)).size>=2&&delayed&&score>=80&&unique.at(-1)!.feedback.score!>=80?'較穩定（暫定）':score>=80?'初步掌握（暫定）':'練習中（暫定）'};
 }))}
export function studyReport(data:StudentState):StudyReport {const to=data.profile.date,from=addDays(to,-13),inside=(d:string)=>d>=from&&d<=to;
 const events=data.events.filter(e=>inside(e.date)),attempts=studioState(data).attempts.filter(a=>!a.pending&&(a.answer.trim()||a.steps.trim())&&inside(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(a.at)))),tasks=data.tasks.filter(t=>inside(t.date)&&t.kind!=='exam');
 return {from,to,activeDays:new Set(events.map(e=>e.date)).size,learningEvents:events.filter(e=>e.type!=='review').length,reviewEvents:events.filter(e=>e.type==='review').length,tasksDone:tasks.filter(t=>t.status==='done').length,tasksPending:tasks.filter(t=>t.status==='pending').length,attempts:attempts.length,independent:attempts.filter(a=>a.independent&&!a.disputed).length,disputed:attempts.filter(a=>a.disputed).length,skills:studySkills(data),message:events.length?'依實際紀錄匯總；暫定技能、已審校證據及整科成績分開。':'尚無這段期間的學習紀錄；先完成一個小步驟，不生成進步趨勢。'};
}
export function studioView(data:StudentState):StudioView {const s=studioState(data);return {attempts:s.attempts,units,skills:studySkills(data),quizzes:s.quizzes.map(q=>publicStudyQuiz(q,s)),report:studyReport(data)}}
export function fixedItems(unit:StudioUnit,count=3,skillId?:string,seen:string[]=[],english=false):StudyItem[]{if(unit.subjectId==='maths'&&skillId)return quadraticItems(skillId,count,seen,english);return Array.from({length:count},(_,i)=>{
 const id=crypto.randomUUID();
 if(unit.subjectId==='maths'){const r=i+2,t=i+5,model=i%2===1;return {id,family:model?'quadratic-model-area':'quadratic-factor-monic',skillId:model?'quadratic-model':'quadratic-factor',kind:'numeric',prompt:model?`長方形寬為x，長比寬多${t-r}，面積為${r*t}。求寬，並寫出建立的方程。`:`x² − ${r+t}x + ${r*t} = 0，求較大的根。`,answer:String(model?r:t),explanation:model?`x(x+${t-r})=${r*t}，根為${r}、−${t}；長度取正根${r}。`:`分解為(x−${r})(x−${t})=0，較大的根是${t}。`,hint:'先建立方程，再求根並檢查情境限制。',criterion:model?'建立符合面積的方程，解方程並捨去負根。':'求根並按條件選較大的根。'}}
 if(unit.subjectId==='chi')return {id,family:`chi-original-${i%5}`,skillId:unit.skills[i%2].id,kind:'short',passage:'小晴第一次主持讀書會時很緊張。她把問題寫在紙上，邀請大家先兩人討論。散會後，她記下哪些問題令大家願意開口，準備下次再試。',prompt:['找一個細節，說明小晴如何面對緊張。','以第一次嘗試為題，寫一段有具體細節及感受的短段落。','文言練習：解釋「學而時習之」中「習」的意思，並舉一個自己的例子。','用一個連接詞，將小晴準備問題和邀請討論的做法連成清楚的一句話。','根據文本，解釋小晴為何在散會後作記錄；請指出依據。'][i%5],answer:'根據文本細節或題目要求，給出合理解釋。',explanation:'引用具體細節，解釋細節和觀點的關係；文言的「習」指溫習、實踐所學。',hint:'先圈出動作，再解釋它為甚麼支持你的看法。',criterion:'有切題觀點、具體依據及合理連結；接受不同合理表述。'};
 return {id,family:`eng-original-${i%5}`,skillId:unit.skills[i%3===0?0:1].id,kind:'short',passage:'Mina used to throw away old notebooks. This term she kept the unused pages and made a small notebook for her younger brother. Two classmates asked her to show them how.',prompt:['What detail suggests that Mina has changed a habit? Explain.','Write two or three sentences proposing one practical way to reduce waste at school.','Improve this sentence and explain your change: "She keep the pages because they is useful."','Write a clear topic sentence and one supporting detail for a paragraph about reusing paper.','Why might the classmates be interested in Mina’s notebook? Support one inference with a detail.'][i%5],answer:'Use relevant evidence or clear, appropriate language.',explanation:'Support reading claims with specific details. For usage: She keeps the pages because they are useful.',hint:'State one point, add a detail, then explain the connection.',criterion:'Relevant answer, supporting detail and clear expression; accept reasonable alternatives.'};
 })}

export interface AdaptiveQuizProfile {
  difficultyTier: 'foundation' | 'standard' | 'stretch';
  prioritySkills: { skillId: string; weight: number }[];
  errorPatterns: string[];
}

const IGNORED_CAUSE_LABELS = new Set(['尚未分類', '待確認', '不確定']);
const sanitizePattern = (raw: string) =>
  raw.replace(/[\r\n\t"'`<>[\]{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

export function buildAdaptiveQuizProfile(
  data: StudentState,
  unit: StudioUnit,
  pinnedSkillId?: string,
): AdaptiveQuizProfile | null {
  const s = studioState(data);
  const unitSkillIds = new Set(unit.skills.map(sk => sk.id));
  const skills = studySkills(data).filter(sk => sk.subjectId === unit.subjectId && unitSkillIds.has(sk.id));
  const validAttempts = s.attempts.filter(
    a => a.subjectId === unit.subjectId && !a.pending && !a.disputed && (a.answer.trim() || a.steps.trim()),
  );
  const unitMistakes = data.wrong.filter(w => !w.resolved && w.topicId === unit.topicId);
  const unitErrors = data.errors.filter(
    e => e.topicId === unit.topicId || e.skillIds.some(id => unitSkillIds.has(id)),
  );
  if (!validAttempts.length && !unitMistakes.length && !unitErrors.length) return null;

  const scopedAttempts = pinnedSkillId
    ? validAttempts.filter(a => a.skillId === pinnedSkillId)
    : validAttempts;
  const recentScored = scopedAttempts.filter(a => a.feedback.score !== null).slice(-6);
  const avgScore = recentScored.length
    ? recentScored.reduce((sum, a) => sum + a.feedback.score!, 0) / recentScored.length
    : null;
  const indepCount = scopedAttempts.filter(a => a.independent).length;
  const anyPaused = skills.some(sk => (!pinnedSkillId || sk.id === pinnedSkillId) && sk.paused);

  const difficultyTier: AdaptiveQuizProfile['difficultyTier'] =
    anyPaused || (avgScore !== null && avgScore < 60)
      ? 'foundation'
      : avgScore !== null && avgScore >= 85 && indepCount >= 2
        ? 'stretch'
        : 'standard';

  let prioritySkills: { skillId: string; weight: number }[];
  if (pinnedSkillId) {
    prioritySkills = [{ skillId: pinnedSkillId, weight: 1 }];
  } else {
    const activeSkills = skills.filter(sk => !sk.paused);
    const pool = activeSkills.length ? activeSkills : skills;
    prioritySkills = pool
      .map(sk => {
        const skAttempts = validAttempts.filter(a => a.skillId === sk.id);
        const wrongCount =
          skAttempts.filter(a => a.feedback.verdict === 'incorrect' || (a.feedback.score !== null && a.feedback.score < 60)).length +
          unitErrors.filter(e => e.skillIds.includes(sk.id)).length;
        const hinted = skAttempts.filter(a => a.hinted).length;
        const indep = skAttempts.filter(a => a.independent).length;
        const weight =
          (sk.score !== null && sk.score < 60) || wrongCount >= 2
            ? 3
            : wrongCount >= 1 || (hinted > indep && hinted >= 2) || (sk.score !== null && sk.score < 80)
              ? 2
              : 1;
        return { skillId: sk.id, weight, score: sk.score ?? 55 };
      })
      .sort((a, b) => b.weight - a.weight || a.score - b.score)
      .map(({ skillId, weight }) => ({ skillId, weight }));
  }

  const patternCounts = new Map<string, number>();
  for (const w of unitMistakes) {
    if (w.reason && !IGNORED_CAUSE_LABELS.has(w.reason)) {
      const clean = sanitizePattern(w.reason);
      if (clean) patternCounts.set(clean, (patternCounts.get(clean) ?? 0) + 1);
    }
  }
  for (const e of unitErrors) {
    const raw = e.selected ?? e.candidates[0]?.reason;
    if (raw && !IGNORED_CAUSE_LABELS.has(raw)) {
      const clean = sanitizePattern(raw);
      if (clean) patternCounts.set(clean, (patternCounts.get(clean) ?? 0) + 1);
    }
  }
  const errorPatterns = [...patternCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label]) => label);

  return { difficultyTier, prioritySkills, errorPatterns };
}

export function pickAdaptiveTeacherSkill(data: StudentState, unit: StudioUnit): string | undefined {
  if (unit.subjectId !== 'maths') return undefined;
  const profile = buildAdaptiveQuizProfile(data, unit);
  if (!profile) return undefined;
  const top = profile.prioritySkills[0];
  if (!top || top.weight < 2) return undefined;
  const skill = studySkills(data).find(s => s.id === top.skillId);
  return skill && !skill.paused ? top.skillId : undefined;
}

export function detectWeakSpotAlert(data: StudentState, nowMs = Date.now()): WeakSpotAlert | null {
  const s = studioState(data);
  const skills = studySkills(data);
  const validAttempts = s.attempts.filter(
    a => !a.pending && !a.disputed && (a.answer.trim() || a.steps.trim()),
  );
  const weekCutoff = nowMs - 7 * 86400000;

  type Candidate = { rank: number; scoreSort: number; detectedMs: number; alert: WeakSpotAlert };
  const candidates: Candidate[] = [];

  const firstSkillByTopic = new Map<string, string>();
  for (const sk of skills) {
    if (!firstSkillByTopic.has(sk.topicId)) firstSkillByTopic.set(sk.topicId, sk.id);
  }

  for (const skill of skills) {
    const skAttempts = validAttempts
      .filter(a => a.skillId === skill.id)
      .sort((a, b) => a.at.localeCompare(b.at));
    const latest = skAttempts.at(-1);
    const latestLow =
      !!latest &&
      (latest.feedback.verdict === 'incorrect' || (latest.feedback.score !== null && latest.feedback.score < 60));
    const lowRecent = skAttempts.filter(
      a =>
        Date.parse(a.at) >= weekCutoff &&
        (a.feedback.verdict === 'incorrect' || (a.feedback.score !== null && a.feedback.score < 60)),
    );
    const hintedCount = skAttempts.filter(a => a.hinted).length;
    const unresolvedTopicWrong = data.wrong.filter(w => !w.resolved && w.topicId === skill.topicId);
    const latestIndepPass =
      !!latest && latest.independent && latest.feedback.score !== null && latest.feedback.score >= 80;
    const skillError = data.errors.filter(e => e.skillIds.includes(skill.id)).at(-1);
    const topCause = skillError?.selected ?? skillError?.candidates[0]?.reason ?? null;

    let triggerKind: WeakSpotAlert['triggerKind'] | null = null;
    let rank = 0;
    if (skill.paused) {
      triggerKind = 'paused';
      rank = 4;
    } else if (lowRecent.length >= 2 && latestLow) {
      triggerKind = 'low-score';
      rank = 3;
    } else if (skAttempts.length >= 3 && hintedCount / skAttempts.length >= 0.6 && skill.independentCount === 0) {
      triggerKind = 'hint-dependent';
      rank = 2;
    } else if (
      unresolvedTopicWrong.length >= 2 &&
      !latestIndepPass &&
      (skAttempts.length > 0 || firstSkillByTopic.get(skill.topicId) === skill.id)
    ) {
      triggerKind = 'mistakes';
      rank = 1;
    }

    if (!triggerKind) continue;
    const detectedAt = latest?.at ?? new Date(nowMs).toISOString();
    const anchor = latest?.id ?? `wrong-${unresolvedTopicWrong.length}-${unresolvedTopicWrong.at(-1)?.date ?? ''}`;
    candidates.push({
      rank,
      scoreSort: skill.score ?? 55,
      detectedMs: Date.parse(detectedAt) || nowMs,
      alert: {
        signalId: `${skill.id}:${triggerKind}:${anchor}`,
        skillId: skill.id,
        skillName: skill.name,
        subjectId: skill.subjectId,
        topicId: skill.topicId,
        triggerKind,
        attempts: skAttempts.length,
        score: skill.score,
        topCause: topCause && !IGNORED_CAUSE_LABELS.has(topCause) ? topCause : null,
        detectedAt,
      },
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.rank - a.rank || a.scoreSort - b.scoreSort || b.detectedMs - a.detectedMs);
  return candidates[0].alert;
}

export function buildWeakSpotReport(data: StudentState): WeakSpotReport {
  const s = studioState(data);
  const skills = studySkills(data);
  const validAttempts = s.attempts.filter(a => !a.pending && !a.disputed && (a.answer.trim() || a.steps.trim()));
  const independentAttempts = validAttempts.filter(a => a.independent);
  const hintedAttempts = validAttempts.filter(a => a.hinted);
  const causeCounts = new Map<string, number>();
  for (const w of data.wrong) {
    if (!w.resolved && w.reason && w.reason !== '尚未分類' && w.reason !== '待確認') {
      causeCounts.set(w.reason, (causeCounts.get(w.reason) ?? 0) + 1);
    }
  }
  for (const e of data.errors) {
    const label = e.selected ?? e.candidates[0]?.reason;
    if (label && label !== '不確定') {
      causeCounts.set(label, (causeCounts.get(label) ?? 0) + 1);
    }
  }
  const errorCauses = [...causeCounts.entries()]
    .map(([cause, count]) => ({ cause, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const items: WeakSpotItem[] = skills.map(skill => {
    const skillAttempts = validAttempts.filter(a => a.skillId === skill.id);
    const skillIndependent = skillAttempts.filter(a => a.independent).length;
    const skillHinted = skillAttempts.filter(a => a.hinted).length;
    const wrongCount =
      skillAttempts.filter(a => a.feedback.verdict === 'incorrect' || (a.feedback.score !== null && a.feedback.score < 60)).length +
      data.errors.filter(e => e.skillIds.includes(skill.id)).length;
    const skillError = data.errors.filter(e => e.skillIds.includes(skill.id)).at(-1);
    const topCause = skillError?.selected ?? skillError?.candidates[0]?.reason ?? null;
    const recommendation = skill.paused
      ? '連續遇到阻力，建議先回看例題與先備步驟，再換新題小步驗證。'
      : skill.score === null
        ? '目前證據不足，建議先完成 2 至 3 道無提示獨立題建立基準。'
        : skill.score < 60
          ? '正確率偏低，建議先對照錯因再做同類變式題。'
          : skillHinted > skillIndependent
            ? '依賴提示比例偏高，建議做新題檢驗無提示獨立解題能力。'
            : '維持間隔回顧，避免考前生疏。';
    return {
      skillId: skill.id,
      skillName: skill.name,
      subjectId: skill.subjectId,
      topicId: skill.topicId,
      score: skill.score,
      attempts: skillAttempts.length,
      independentAttempts: skillIndependent,
      hintedAttempts: skillHinted,
      wrongCount,
      paused: skill.paused,
      topCause,
      recommendation,
      actionUrl: `/studio?subject=${skill.subjectId}`,
    };
  });

  const ranked = items
    .filter(item => item.attempts > 0 || item.wrongCount > 0 || item.paused)
    .sort((a, b) => {
      if (a.paused !== b.paused) return a.paused ? -1 : 1;
      const sa = a.score ?? 55;
      const sb = b.score ?? 55;
      return sa - sb || b.wrongCount - a.wrongCount || b.hintedAttempts - a.hintedAttempts;
    });

  const unresolvedMistakes = data.wrong.filter(w => !w.resolved).length;
  const independentRate = validAttempts.length ? Math.round((independentAttempts.length / validAttempts.length) * 100) : null;
  const summary = ranked.length
    ? `根據 ${validAttempts.length} 次實際作答與 ${unresolvedMistakes} 項未訂正錯題，優先鎖定 ${ranked.slice(0, 3).map(x => x.skillName).join('、')}。`
    : '目前練習與錯題紀錄尚少；完成幾題自主練習後，系統會自動生成具體的弱項排序與建議。';

  return {
    generatedAt: new Date().toISOString(),
    summary,
    totalAttempts: validAttempts.length,
    independentRate,
    unresolvedMistakes,
    hintDependencyCount: hintedAttempts.length,
    errorCauses,
    weakSpots: (ranked.length ? ranked : items).slice(0, 6),
    caveat: '此診斷完全基於你在本平台的真實獨立作答與錯題記錄，用於排定補弱次序，不代表或換算為整科 DSE 等級。',
  };
}

export function buildRealtimeProgress(data: StudentState): RealtimeProgressView {
  const s = studioState(data);
  const today = data.profile.date;
  const nowMs = Date.now();
  const cutoff24h = nowMs - 86400000;
  const todayEvents = data.events.filter(e => e.date === today);
  const todayMinutes = todayEvents.reduce((sum, e) => sum + e.minutes, 0);
  const todayTasks = data.tasks.filter(t => t.date === today && t.kind !== 'exam');
  const todayTasksDone = todayTasks.filter(t => t.status === 'done').length;
  const recentAttempts = s.attempts.filter(a => !a.pending && Date.parse(a.at) >= cutoff24h);

  const skills = studySkills(data);
  const activeSkills: RealtimeProgressItem[] = skills.map(skill => {
    const scored = s.attempts
      .filter(a => a.skillId === skill.id && !a.disputed && !a.pending && a.feedback.score !== null)
      .sort((a, b) => a.at.localeCompare(b.at));
    let delta: number | null = null;
    if (scored.length >= 2) {
      const latest = scored.at(-1)!.feedback.score!;
      const prevAvg = scored.slice(0, -1).slice(-5).reduce((sum, a) => sum + a.feedback.score!, 0) / Math.min(5, scored.length - 1);
      delta = Math.round(latest - prevAvg);
    }
    return {
      skillId: skill.id,
      skillName: skill.name,
      subjectId: skill.subjectId,
      topicId: skill.topicId,
      score: skill.score,
      delta,
      independentCount: skill.independentCount,
      lastAttemptAt: scored.at(-1)?.at ?? null,
      status: skill.label,
    };
  }).sort((a, b) => (b.lastAttemptAt ?? '').localeCompare(a.lastAttemptAt ?? ''));

  const recentEvents = [
    ...s.attempts
      .filter(a => !a.pending)
      .slice(-8)
      .map(a => ({
        at: a.at,
        kind: 'attempt',
        title: skills.find(sk => sk.id === a.skillId)?.name ?? a.skillId,
        topicId: a.topicId,
        detail: a.feedback.score === null ? '已提交作答（暫定參考）' : `${a.feedback.score}% · ${a.independent ? '獨立作答' : '輔助練習'}`,
      })),
    ...data.events.slice(-6).map(e => ({
      at: `${e.date}T12:00:00+08:00`,
      kind: e.type,
      title: e.title,
      topicId: e.topicId,
      detail: `${e.minutes} 分鐘`,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return {
    syncedAt: new Date(nowMs).toISOString(),
    todayMinutes,
    todayTasksDone,
    todayTasksTotal: todayTasks.length,
    recentAttempts24h: recentAttempts.length,
    activeSkills: activeSkills.slice(0, 6),
    recentEvents,
  };
}
