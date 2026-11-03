import type { Grade, Profile, Programme } from './types.ts';
import { calculateScore, eligibility, gradeOrder, gradePoints, nextGrade, selectedGrades } from './domain.ts';
import { programmeFormula, programmeAssumptions, SCORING_VERSION } from './programme-rules.ts';
import { qsRankings } from './data/qs-rankings.ts';
import type { RankingEntry } from './data/qs-rankings.ts';

export { programmeFormula, programmeAssumptions, SCORING_VERSION };
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round = (n: number) => Math.round(n * 10000) / 10000;
const median = (values: number[]) => {const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length?s.length%2?s[m]:(s[m-1]+s[m])/2:null};
export function scoreHistory(p: Programme) {
  return [...(p.historicalScores??[])].sort((a,b)=>a.year-b.year).map(s=>({...s,rangeValid:finite(s.upper)&&finite(s.lower)&&s.lower<=s.upper&&(!finite(s.median)||s.lower<=s.median&&s.median<=s.upper)}));
}
function latestMedian(p: Programme) {
  const s=scoreHistory(p).filter(s=>finite(s.median)).at(-1);
  if(s)return {value:s.median!,year:String(s.year)};
  if(p.indexKind==='median'&&finite(p.scoreIndex))return {value:p.scoreIndex,year:p.statisticsYear};
  return null;
}
export interface Benchmark { kind:'historical'|'designated'|'same-institution'|'same-area'|'mean'|'unavailable'; value:number|null; unit:'index'|'raw'; year:string; references:{id:string;institution:string;name:string;url:string;value:number;year:string}[]; spread:[number,number]|null }
export function programmeBenchmark(p: Programme, all: Programme[], minimumPeers=3): Benchmark {
  const own=latestMedian(p);
  if(p.route!=='JUPAS'&&finite(p.mean))return {kind:'mean',value:p.mean,unit:'raw',year:p.statisticsYear,references:[],spread:null};
  if(own)return {kind:'historical',value:own.value,unit:'index',year:own.year,references:[],spread:null};
  const unavailable:Benchmark={kind:'unavailable',value:null,unit:'index',year:'',references:[],spread:null};
  const eligible=all.filter(r=>r.id!==p.id&&r.route===p.route&&r.qualification===p.qualification&&programmeFormula(r).scale===programmeFormula(p).scale);
  const designated=eligible.find(r=>r.id===p.referenceProgrammeId&&latestMedian(r));
  const peers=eligible.filter(r=>r.area===p.area&&latestMedian(r));
  const same=peers.filter(r=>r.institution===p.institution);
  const pool=designated?[designated]:same.length>=minimumPeers?same:peers;
  if(!designated&&pool.length<minimumPeers)return unavailable;
  // Only nearby source years share a benchmark; each programme contributes once.
  const yearNumber=(v:string)=>Number(v.match(/\d{4}/)?.[0]??0);
  const newest=Math.max(...pool.map(r=>yearNumber(latestMedian(r)!.year)));
  const recent=pool.filter(r=>yearNumber(latestMedian(r)!.year)>=newest-2);
  if(!designated&&recent.length<minimumPeers)return unavailable;
  const references=recent.map(r=>({id:r.id,institution:r.institution,name:r.name,url:r.url,...latestMedian(r)!}));
  const values=references.map(r=>r.value),years=[...new Set(references.map(r=>r.year))].sort();
  return {kind:designated?'designated':same.length>=minimumPeers?'same-institution':'same-area',value:median(values),unit:'index',year:years.join(' · '),references,spread:[Math.min(...values),Math.max(...values)]};
}
export type RankDirection='possibly-high'|'possibly-low'|'same'|'uncertain';
export function rankingDirection(target: string, references: string[], rankings: RankingEntry[]=qsRankings):RankDirection {
  if(!references.length)return 'uncertain';
  if(references.every(id=>id===target))return 'same';
  const rank=rankings.find(r=>r.institution===(target==='Lingnan'?'LU':target));
  if(!rank)return 'uncertain';
  const peers=references.map(id=>rankings.find(r=>r.institution===(id==='Lingnan'?'LU':id)));
  if(peers.some(r=>!r||r.edition!==rank.edition||r.kind!==rank.kind))return 'uncertain';
  if(peers.every(r=>r!.upper<rank.lower))return 'possibly-high';
  if(peers.every(r=>r!.lower>rank.upper))return 'possibly-low';
  return 'uncertain';
}
export function programmeComparison(p: Programme, profile: Profile, all: Programme[]) {
  const formula=programmeFormula(p),currentGrades=selectedGrades(profile),targetGrades=selectedGrades(profile,true);
  const ids=[...new Set([...profile.subjects,...(profile.mathModule!=='none'?[profile.mathModule]:[])])];
  const maximum=calculateScore(Object.fromEntries(ids.map(id=>[id,id==='csd'?'A':'5**'])) as Record<string,Grade>,formula);
  const baseline=calculateScore(currentGrades,formula),target=calculateScore(targetGrades,formula),benchmark=programmeBenchmark(p,all);
  const index=(v:number|null)=>v!==null&&maximum.score!==null&&maximum.score>0?round(7*v/maximum.score):null;
  const currentValue=benchmark.unit==='raw'?baseline.score:index(baseline.score),targetValue=benchmark.unit==='raw'?target.score:index(target.score);
  const gap=(v:number|null)=>finite(v)&&finite(benchmark.value)?round(benchmark.value-v):null;
  const eligibilityResult=eligibility({...p,formula},profile);
  return {programmeId:p.id,version:SCORING_VERSION,formula,assumptions:programmeAssumptions(p),basis:p.scoringBasis??(formula.verified?'source':'assumption'),
    baseline,target,maximum:maximum.score,currentValue,targetValue,currentGap:gap(currentValue),targetGap:gap(targetValue),benchmark,eligibility:eligibilityResult,
    rankingDirection:rankingDirection(p.institution,benchmark.references.map(r=>r.institution)),
    missing:[...new Set([...baseline.missing,...target.missing])],
  };
}

// Relative cost units are a disclosed planning assumption, never predicted hours.
const gradeCost=[1,1,1,1,1.5,2,3,4];
export function subjectPriorities(p: Programme, profile: Profile, all: Programme[]=[]) {
  const formula=programmeFormula(p),grades=selectedGrades(profile),base=calculateScore(grades,formula);
  const missingRequirements=eligibility(p,profile).missing.length;
  return Object.keys(grades).filter(id=>id!=='csd'&&gradeOrder.includes(grades[id])).map(id=>{
    const next=nextGrade(grades[id]),after=calculateScore({...grades,[id]:next},formula);
    const gain=base.score!==null&&after.score!==null?Math.max(0,round(after.score-base.score)):0;
    const cost=gradeCost[Math.max(0,gradeOrder.indexOf(grades[id]))]??4;
    const necessary=p.minimum[id],closesRequirement=eligibility(p,{...profile,grades:{...profile.grades,[id]:next}}).missing.length<missingRequirements;
    const gate=necessary&&gradePoints(grades[id],'standard')<gradePoints(necessary,'standard')||closesRequirement?1:0;
    const atTarget=profile.targetGrades[id]&&gradePoints(grades[id])>=gradePoints(profile.targetGrades[id]);
    const helps=profile.backupProgrammes.flatMap(key=>{const backup=all.find(r=>r.id===key);if(!backup)return [];const f=programmeFormula(backup),before=calculateScore(grades,f),a=calculateScore({...grades,[id]:next},f);return before.score!==null&&a.score!==null&&a.score>before.score?[key]:[]});
    return {subjectId:id,from:grades[id],to:next,gain,cost,priority:(gate?1000:0)+(atTarget?0:gain/cost),gate:!!gate,helps,available:base.score!==null&&after.score!==null};
  }).sort((a,b)=>b.priority-a.priority||a.cost-b.cost||a.subjectId.localeCompare(b.subjectId));
}
