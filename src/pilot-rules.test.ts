import { describe,it,expect } from 'vitest';
import { assessSkill, compareGradePaths, updateCycle, validatePack } from './pilot-rules';
import type { PilotEvidence, Skill } from './pilot-types';
import type { Profile, Programme } from './types';

const skill:Skill={id:'s',name:'技能',prerequisites:[],minutes:[5,10]};
function evidence(id:string,at:string,familyId:string,patch:Partial<PilotEvidence>={}):PilotEvidence{return {id,topicId:'t',questionId:id,quizId:id,date:at.slice(0,10),at,awarded:1,max:1,independent:true,familyId,skillIds:['s'],contentVersion:'1',ruleVersion:'1',criticalPassed:true,reviewed:true,...patch}}
describe('pilot evidence rules',()=>{
 it('keeps unknown separate from wrong',()=>expect(assessSkill(skill,[]).score).toBeNull());
 it('requires true elapsed time, different questions and families',()=>{const a=evidence('a','2026-10-27T15:59:00Z','f1'),b=evidence('b','2026-10-27T16:01:00Z','f2'),c=evidence('c','2026-10-28T15:58:00Z','f2');expect(assessSkill(skill,[a,b,c]).label).toBe('初步掌握');c.at='2026-10-28T16:00:00Z';expect(assessSkill(skill,[a,b,c]).label).toMatch(/^較穩定/)});
 it('rejects hinted, unreviewed, duplicate and single-family farming',()=>{const records=[evidence('a','2026-10-26T10:00:00Z','one'),evidence('b','2026-10-27T10:00:00Z','one'),evidence('c','2026-10-28T10:00:00Z','one')];expect(assessSkill(skill,records).label).toBe('初步掌握');expect(assessSkill(skill,records.map(e=>({...e,independent:false}))).count).toBe(0);expect(assessSkill(skill,records.map(e=>({...e,reviewed:false}))).count).toBe(0);expect(assessSkill(skill,[records[0],records[0],records[0]]).count).toBe(1)});
 it('retains a pause even after a new chat or correct repeat',()=>{let c=updateCycle([],'s',false,'q1','now');c=updateCycle(c,'s',false,'q2','now');expect(c[0].paused).toBe(true);c=updateCycle(c,'s',true,'q2','later');expect(c[0].paused).toBe(true);expect(c[0].failures).toBe(2)});
 it('uses reviewed per-skill thresholds rather than silently applying a universal rule',()=>{const records=[evidence('a','2026-10-26T10:00:00Z','a'),evidence('b','2026-10-27T11:00:00Z','b'),evidence('c','2026-10-27T12:00:00Z','b')];expect(assessSkill({...skill,policy:{stableQuestions:4}},records).label).toBe('初步掌握')});
});
describe('grade path enumeration',()=>{
 const profile={grades:{maths:'5',chem:'2',eng:'4'},targetGrades:{chem:'5'},subjects:['maths','chem','eng']} as unknown as Profile;
 const programme={minimum:{chem:'3'},formula:{count:2,required:[],weights:{},scale:'standard',verified:true}} as unknown as Programme;
 it('finds a replacement requiring multiple levels rather than adding one-level gains',()=>{const r=compareGradePaths(profile,programme,[{subjectId:'chem',from:'2',to:'3',hours:[1,2],source:'test'},{subjectId:'chem',from:'3',to:'4',hours:[2,3],source:'test'},{subjectId:'chem',from:'4',to:'5',hours:[4,6],source:'test'}],20);expect(r.paths.some(p=>p.grades.chem==='4'&&p.minimumMet&&p.hours?.[1]===5)).toBe(true);expect(r.paths.some(p=>p.grades.chem==='3'&&p.gain===0)).toBe(true);expect(r.paths.some(p=>p.grades.chem==='5'&&p.gain===1)).toBe(true)});
 it('does not invent costs or use unverified formula',()=>{const r=compareGradePaths(profile,programme,[],10);expect(r.paths.find(p=>p.grades.chem==='4')?.hours).toBeNull();expect(compareGradePaths(profile,{...programme,formula:{...programme.formula!,verified:false}},[],10).baseline).toBeNull()});
});
