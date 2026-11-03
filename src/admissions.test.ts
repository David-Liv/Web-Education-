import { describe, expect, it } from 'vitest';
import { programmeComparison, programmeBenchmark, rankingDirection, scoreHistory, subjectPriorities } from './admissions';
import { calculateScore } from './domain';
import { programmeFormula } from './programme-rules';
import type { Profile, Programme } from './types';
import type { RankingEntry } from './data/qs-rankings';

const p:Programme={id:'fixture',institution:'HKBU',institutionName:'Fixture',name:'Fixture',en:'Fixture',area:'Engineering',qualification:'學士',route:'JUPAS',url:'https://example.com/course',statisticsYear:'2025/26',formulaYear:2027,median:5,mean:null,lowerQuartile:4,scoreIndex:5,indexKind:'median',selection:'Best 2',weightingText:'',formula:{count:2,required:['eng'],weights:{eng:2},scale:'standard',verified:false},minimum:{},note:'',checkedAt:'2026-11-03'};
const profile:Profile={name:'Fixture',year:2028,teachingLanguage:'en',subjects:['eng','maths','chem'],mathModule:'none',chemistryElectives:[],grades:{eng:'3',maths:'4',chem:'2'},targetGrades:{eng:'5*',maths:'5',chem:'4'},gradeSource:'Mock',primaryProgramme:p.id,backupProgrammes:[],dailyMinutes:Array(7).fill(60),availability:Array(7).fill('18:00'),reviewPercent:20,date:'2026-11-03',demo:false};
const rank=(institution:string,lower:number,upper=lower,edition=2027):RankingEntry=>({institution,lower,upper,edition,kind:'QS World University Rankings',label:String(lower),url:'https://example.com/ranking',checkedAt:'2026-11-03'});

describe('personal reference scoring',()=>{
  it('opens reference rules, shares the maximum between current and target, and preserves signed gaps',()=>{
    const c=programmeComparison(p,profile,[p]);
    expect(c.maximum).toBe(21);expect(c.baseline.score).toBe(10);expect(c.target.score).toBe(17);
    expect(c.currentValue).toBeCloseTo(10/3,3);expect(c.targetValue).toBeCloseTo(17/3,3);
    expect(c.currentGap).toBeGreaterThan(0);expect(c.targetGap).toBeLessThan(0);
    const missing=programmeComparison(p,{...profile,targetGrades:{}},[p]);expect(missing.currentGap).not.toBeNull();expect(missing.targetGap).toBeNull();
  });
  it('never compares a raw mean with an index or changes the mean into a median',()=>{
    const raw={...p,route:'直接申請 / E-APP' as const,mean:12,median:null,scoreIndex:null,indexKind:'unavailable' as const};
    const c=programmeComparison(raw,profile,[raw]);expect(c.benchmark.kind).toBe('mean');expect(c.currentValue).toBe(10);expect(c.currentGap).toBe(2);expect(raw.median).toBeNull();
  });
  it('handles exclusions, two-of groups, CSD points and bonus positions using the same calculator',()=>{
    const formula={count:3,required:['eng'],requiredCounts:[{subjects:['maths','chem','bio'],count:2}],excluded:['M1','M2'],weights:{chem:2,bio:2},maxWeightedSubjects:1,scale:'standard' as const,verified:false};
    const result=calculateScore({eng:'3',maths:'4',chem:'5',bio:'4',M1:'5**'},formula);
    expect(result.score).toBe(17);expect(result.selected.some(s=>s.id==='M1')).toBe(false);
    expect(calculateScore({eng:'3',maths:'4'},formula).score).toBeNull();
    expect(calculateScore({eng:'3',csd:'A'},{count:2,required:[],weights:{},scale:'standard',verified:false,csdCounts:true,csdPoints:1}).score).toBe(4);
    expect(calculateScore({eng:'5',maths:'4',chem:'3',bio:'2'},{count:2,required:[],weights:{},scale:'standard',verified:false,sixthBonus:.2,bonusRank:4}).score).toBe(9.4);
  });
  it('can compute a course without a stored formula and keeps missing student grades unknown',()=>{
    const unknown={...p,formula:null,selection:'Best 4 subjects'};expect(programmeFormula(unknown).count).toBe(4);
    expect(programmeComparison(unknown,{...profile,subjects:[]},[unknown]).currentValue).toBeNull();
  });
});

describe('borrowed benchmarks and ranking notes',()=>{
  const fresh={...p,scoreIndex:null,median:null,indexKind:'unavailable' as const};
  const peers=[4,5,6].map((v,i)=>({...p,id:'peer-'+i,institution:'HKU',scoreIndex:v,median:v,historicalScores:[{year:2026,median:v}]}));
  it('uses one recent value per peer, requires enough peers and never borrows raw means',()=>{
    const b=programmeBenchmark(fresh,[fresh,...peers]);expect(b.value).toBe(5);expect(b.references).toHaveLength(3);expect(b.kind).toBe('same-area');
    expect(programmeBenchmark(fresh,[fresh,...peers.slice(0,2)]).value).toBeNull();
    expect(programmeBenchmark(fresh,[fresh,...peers.map(r=>({...r,qualification:'副學士' as const}))]).value).toBeNull();
    const designated={...fresh,referenceProgrammeId:peers[0].id};expect(programmeBenchmark(designated,[designated,peers[0]]).value).toBe(4);
    expect(programmeComparison(fresh,profile,[fresh,...peers]).rankingDirection).toBe('possibly-high');
  });
  it('does not let ranking notes change the score or infer direction across missing/mixed editions',()=>{
    const ranks=[rank('A',10),rank('B',20),rank('C',30),rank('D',18,25)];
    expect(rankingDirection('B',['A'],ranks)).toBe('possibly-high');expect(rankingDirection('B',['C'],ranks)).toBe('possibly-low');
    expect(rankingDirection('B',['A','C'],ranks)).toBe('uncertain');expect(rankingDirection('B',['D'],ranks)).toBe('uncertain');
    expect(rankingDirection('B',['missing'],ranks)).toBe('uncertain');expect(rankingDirection('B',['A'],[rank('A',10,10,2026),rank('B',20)])).toBe('uncertain');
    expect(rankingDirection('B',['B'],ranks)).toBe('same');
    expect(programmeComparison(fresh,profile,[fresh,...peers]).benchmark.value).toBe(5);
  });
  it('keeps invalid quartile order and missing ranges visible without inventing bands',()=>{
    const history=scoreHistory({...p,historicalScores:[{year:2023,lower:5,median:4,upper:6},{year:2025,median:5},{year:2026,lower:4,median:5,upper:6}]});
    expect(history.map(s=>s.rangeValid)).toEqual([false,false,true]);expect(history[0].lower).toBe(5);expect(history[1].upper).toBeUndefined();
  });
  it('favours equal-gain lower-grade improvements under the disclosed cost assumption',()=>{
    const plain={...p,formula:{count:3,required:[],weights:{},scale:'standard' as const,verified:false}};
    const rows=subjectPriorities(plain,{...profile,grades:{eng:'3',maths:'5*',chem:'4'},targetGrades:{eng:'4',maths:'5**',chem:'5'}});
    expect(rows.find(r=>r.subjectId==='eng')!.gain).toBe(1);expect(rows.find(r=>r.subjectId==='maths')!.gain).toBe(1);
    expect(rows[0].subjectId).toBe('eng');
  });
  it('prioritises an elective improvement that closes an entry requirement',()=>{
    const course={...p,minimum:{},entryAlternatives:[[{subjects:['chem'],count:1,minimum:'4' as const}]]};
    const rows=subjectPriorities(course,{...profile,grades:{eng:'4',maths:'4',chem:'3'},targetGrades:{eng:'5',maths:'5',chem:'4'}});
    expect(rows[0].subjectId).toBe('chem');expect(rows[0].gate).toBe(true);
  });
});
