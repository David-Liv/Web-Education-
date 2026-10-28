import { describe, expect, it } from 'vitest';
import { addDays, calculateScore, dailyCapacity, eligibility, eligibleTopics, generatePlan, hasConflict, isReviewVisible, markAnswer, mastery, selectedGrades, validateTask } from './domain';
import { createSeed } from './data/seed';
import { topics, catalog } from './data/catalog';
import { questions } from './data/questions';
import { programmes } from './data/programmes';
import type { Evidence, ScoreFormula, Task } from './types';

const formula: ScoreFormula = { count: 5, required: ['eng','maths'], weights: { eng: 1.5, maths: 1.5 }, scale: 'enhanced', verified: true };
const task = (patch: Partial<Task> = {}): Task => ({ id: 'new', date: '2028-02-14', start: '18:30', minutes: 20, title: 'Test', subjectId: 'maths', kind: 'study', status: 'pending', locked: false, reason: 'Test', ...patch });

describe('admissions calculations', () => {
  it('reproduces the complete HKU BBA example without treating the index as raw points', () => {
    const p = createSeed().profile;
    expect(calculateScore(selectedGrades(p), formula).score).toBe(22);
    expect(calculateScore(selectedGrades(p, true), formula).score).toBe(30);
  });
  it('keeps compulsory low-scoring subjects in Best N', () => {
    const result = calculateScore({eng:'1',maths:'2',chi:'5**',chem:'5**',econ:'5**',bio:'5**'}, formula);
    expect(result.selected.map(s => s.id)).toContain('eng');
    expect(result.selected.map(s => s.id)).toContain('maths');
    expect(result.score).toBe(30);
  });
  it('selects by weighted points rather than the raw level', () => {
    const result = calculateScore({eng:'3',maths:'4',chi:'5',chem:'4',econ:'4',phy:'3'}, {...formula, weights:{phy:3}});
    expect(result.selected.map(s => s.id)).toContain('phy');
    expect(result.score).toBe(25.5);
  });
  it('does not count CSD without an explicit rule', () => {
    expect(calculateScore({eng:'3',maths:'3',chi:'3',chem:'3',csd:'A'}, formula).score).toBeNull();
  });
  it('does not select both extended maths modules', () => {
    const result = calculateScore({eng:'2',maths:'2',chi:'2',chem:'2',M1:'5**',M2:'5**'}, formula);
    expect(result.selected.filter(s => ['M1','M2'].includes(s.id))).toHaveLength(1);
  });
  it('caps the number of amplified subjects using their actual marginal contribution', () => {
    const result = calculateScore({eng:'5',maths:'4',chi:'3',chem:'3',bio:'3'}, {...formula, required:[], weights:{eng:2,maths:2,chem:2}, maxWeightedSubjects:2});
    expect(result.selected.filter(s => s.weight > 1)).toHaveLength(2);
    expect(result.score).toBe(28);
  });
  it('reports missing required subjects and checks science entry groups', () => {
    expect(calculateScore({chi:'4',chem:'4',bio:'4',phy:'4',econ:'4'}, formula).missing).toContain('eng');
    const p = createSeed().profile; p.subjects=p.subjects.filter(s=>s!=='chem');
    expect(eligibility(programmes.find(p=>p.id==='JS6315')!,p).missing.join(' ')).toContain('指定選修');
  });
  it('filters stored grades to the subjects actually enrolled', () => {
    const p=createSeed().profile; p.grades.M2='5**'; p.grades.bio='5**';
    expect(selectedGrades(p)).not.toHaveProperty('M2');
    expect(selectedGrades(p)).not.toHaveProperty('bio');
  });
});

describe('assessment evidence', () => {
  const evidence=(n:number, patch:Partial<Evidence>={}):Evidence=>({id:String(n),topicId:'topic',questionId:`q${n}`,quizId:`quiz${n}`,date:`2028-02-${String(n+1).padStart(2,'0')}`,awarded:1,max:1,independent:true,...patch});
  it('keeps unassessed distinct from zero', () => expect(mastery('topic',[]).score).toBeNull());
  it('retains completed older reviews in today’s report, and hides postponed items', () => {
    const item={id:'r',topicId:'t',dueDate:'2028-02-17',lastLearned:'2028-02-01',lastReviewed:'2028-02-14',stage:1,sourceIds:[]};
    expect(isReviewVisible(item,'2028-02-14')).toBe(true);
    expect(isReviewVisible({...item,postponedUntil:'2028-02-15'},'2028-02-14')).toBe(false);
  });
  it('excludes hints and only counts the latest attempt at each question', () => {
    const records=[evidence(1),evidence(2,{independent:false}),evidence(3,{questionId:'q1',awarded:0})];
    expect(mastery('topic',records)).toMatchObject({score:0,count:1,label:'證據不足'});
  });
  it('uses the most recent five distinct questions, even after retrying an old question', () => {
    const records=Array.from({length:6},(_,i)=>evidence(i+1));
    records.push(evidence(9,{questionId:'q1',awarded:0}));
    const result=mastery('topic',records);
    expect(result.count).toBe(5); expect(result.score).toBe(80);
    expect(result.records.some(r=>r.questionId==='q2')).toBe(false);
  });
  it('handles repeated questions on the same demo date in attempt order', () => {
    const records=Array.from({length:6},(_,i)=>evidence(i+1,{date:'2028-02-14'}));
    records.push(evidence(9,{date:'2028-02-14',questionId:'q1',awarded:0}));
    expect(mastery('topic',records).score).toBe(80);
  });
  it('marks numeric values with tolerance and leaves subjective responses pending', () => {
    const numeric=questions.find(q=>q.kind==='numeric')!;
    expect(markAnswer(numeric,' '+numeric.answer+' ').correct).toBe(true);
    expect(markAnswer(numeric,'').awarded).toBe(0);
    expect(markAnswer(numeric,'banana').correct).toBe(false);
    expect(markAnswer(questions.find(q=>q.kind==='essay')!,'My essay').awarded).toBeNull();
  });
});

describe('calendar and deterministic planning', () => {
  it('includes review within each daily budget without overlaps', () => {
    const db=createSeed(); const plan=generatePlan(db,topics,programmes.find(p=>p.id===db.profile.primaryProgramme));
    for(let i=0;i<14;i++){
      const date=addDays(db.profile.date,i), day=plan.tasks.filter(t=>t.date===date);
      expect(day.reduce((n,t)=>n+t.minutes,0)).toBeLessThanOrEqual(dailyCapacity(db.profile,date));
      for(const t of day)expect(hasConflict(t,day.filter(o=>o.id!==t.id))).toBe(false);
      expect(day.filter(t=>t.kind==='review').reduce((n,t)=>n+t.minutes,0)).toBeLessThanOrEqual(20);
    }
  });
  it('preserves locked and completed tasks without conflicts and generates stable previews', () => {
    const db=createSeed(); db.tasks=[task({id:'locked',locked:true,start:'18:40'}),task({id:'done',status:'done',start:'19:10'})];
    const plan=generatePlan(db,topics);
    expect(plan).toEqual(generatePlan(db,topics));
    for(const t of plan.tasks)expect(hasConflict(t,db.tasks)).toBe(false);
    expect(plan.tasks.filter(t=>t.date===db.profile.date).reduce((n,t)=>n+t.minutes,40)).toBeLessThanOrEqual(90);
  });
  it('handles zero time, near-midnight availability and no ready content', () => {
    const db=createSeed(); db.profile.dailyMinutes=Array(7).fill(0);
    expect(generatePlan(db,topics).tasks).toHaveLength(0);
    db.profile.dailyMinutes=Array(7).fill(90); db.profile.availability=Array(7).fill('23:50');
    expect(dailyCapacity(db.profile,db.profile.date)).toBe(10);
    expect(generatePlan(db,topics).tasks.every(t=>Number(t.start.slice(0,2))*60+Number(t.start.slice(3))+t.minutes<=1440)).toBe(true);
    db.profile.subjects=['econ'];
    expect(generatePlan(db,topics).unscheduled).toHaveLength(1);
  });
  it('stops scheduling a subject on or after its exam', () => {
    const db=createSeed();db.tasks=[task({id:'exam',kind:'exam',locked:true,subjectId:'maths',date:addDays(db.profile.date,2)})];
    expect(generatePlan(db,topics).tasks.some(t=>t.subjectId==='maths'&&t.date>=addDays(db.profile.date,2))).toBe(false);
  });
  it('rejects conflicts, budget overflow, invalid time and crossing midnight', () => {
    const db=createSeed(); db.tasks=[task({id:'existing'})];
    expect(validateTask(task({start:'18:40'}),db)).toContain('已有');
    expect(validateTask(task({start:'20:00',minutes:80}),db)).toContain('超出');
    expect(validateTask(task({start:'23:50'}),db)).toContain('午夜');
    expect(validateTask(task({start:'25:00'}),db)).toContain('有效');
  });
  it('does not introduce modules or chemistry electives not selected by the student', () => {
    const p=createSeed().profile;
    expect(eligibleTopics(topics,p).some(t=>t.module==='M2')).toBe(false);
    expect(eligibleTopics(topics,p).some(t=>t.id==='chem-materials')).toBe(false);
  });
});

describe('data integrity', () => {
  it('has unique original questions linked to real topics and valid answer options', () => {
    expect(new Set(questions.map(q=>q.id)).size).toBe(questions.length);
    for(const q of questions){expect(q.original).toBe(true);expect(topics.some(t=>t.id===q.topicId&&t.subjectId===q.subjectId)).toBe(true);if(q.kind==='choice')expect(q.options?.[q.answer.charCodeAt(0)-65]).toBeTruthy();}
  });
  it('keeps statistics years and missing values rather than inventing 2028 admissions', () => {
    expect(programmes).toHaveLength(31);
    expect(programmes.filter(p=>p.qualification==='學士')).toHaveLength(27);
    expect(programmes.every(p=>p.url.startsWith('https://')&&p.checkedAt==='2026-10-27')).toBe(true);
    expect(programmes.find(p=>p.id==='SPACE-ENG')?.median).toBeNull();
    expect(programmes.find(p=>p.id==='8C112-ENG')?.mean).toBe(16.28);
  });
  it('has a genuinely empty new-student state and labels every seeded exam as demo', () => {
    const fresh=createSeed(true);expect(fresh.evidence).toHaveLength(0);expect(fresh.profile.primaryProgramme).toBeNull();expect(Object.values(fresh.profile.grades).every(g=>g==='U')).toBe(true);
    expect(createSeed().tasks.filter(t=>t.kind==='exam').every(t=>t.sourceStatus==='demo')).toBe(true);
    expect(catalog.subjects.filter(s=>s.category==='A')).toHaveLength(23);
  });
});
