import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const data=JSON.parse(await readFile(new URL('../public/data/maths-source-index.json',import.meta.url),'utf8'));
assert.equal(data.schemaVersion,1);
assert.equal(data.questions.length,608);
const past=data.questions.filter(q=>q.kind==='past-paper-question'),publisher=data.questions.filter(q=>q.kind==='publisher-exercise');
assert.equal(past.length,585);assert.equal(publisher.length,23);
assert.equal(new Set(data.questions.map(q=>q.id)).size,608);
for(let year=2012;year<=2024;year++){
  const records=past.filter(q=>q.year===year);assert.equal(records.length,45);
  assert.deepEqual(records.map(q=>q.number).sort((a,b)=>a-b),Array.from({length:45},(_,i)=>i+1));
}
for(const q of data.questions){
  assert.ok(q.topic&&q.url);assert.equal(q.officialDseLevel,null);assert.equal(q.contentStatus,'external-link-only');assert.equal(q.curriculum2028,'pending');
  assert.equal(new URL(q.url).protocol,'https:');
  for(const key of ['prompt','answer','explanation','contentEn','contentTc','options','reviewed','independent'])assert.ok(!(key in q),`Forbidden field ${key}: ${q.id}`);
}
for(const q of past){assert.equal(q.exam,'HKDSE');assert.equal(q.paper,'P2');assert.ok(q.sourceDifficultyLabels.length>0);assert.ok(q.evidenceUrls.length>0);assert.ok(q.sourceDifficultyLabels.includes(q.displayDifficulty));}
const levelCounts=Object.fromEntries(['2+','4+','5**'].map(level=>[level,publisher.filter(q=>q.publisherTargetLevel===level).length]));
assert.deepEqual(levelCounts,{'2+':2,'4+':8,'5**':13});
assert.ok(publisher.every(q=>q.id.startsWith('OUP-')&&q.exam===null&&q.pastPaperReferences.every(r=>r.relationship==='publisher-reference-group-not-identical-question')));
assert.equal(data.collections.length,76);assert.equal(data.collections.filter(c=>c.url).length,73);
assert.equal(new Set(data.collections.map(c=>c.id)).size,76);
for(const c of data.collections){assert.equal(c.questionCount,null);assert.equal(c.difficulty,'待標註');assert.equal(c.officialDseLevel,null);assert.deepEqual(c.yearRange,[2012,2017]);if(c.url)assert.equal(new URL(c.url).hostname,'drive.google.com');}
assert.equal(data.audit.overlappingDifficultyQuestions,past.filter(q=>q.sourceDifficultyLabels.length>1).length);
assert.equal(data.audit.questionContentCopied,false);assert.equal(data.audit.formalQuestionBankChanged,false);
for(const [file,expected] of [['maths-questions.csv',609],['maths-collections.csv',77]]){const content=await readFile(new URL('../public/data/'+file,import.meta.url),'utf8');assert.equal(content.split('\r\n').length,expected);assert.ok(content.startsWith('\uFEFF'));}
console.log(JSON.stringify({checked:true,pastQuestions:past.length,publisherExercises:publisher.length,levels:levelCounts,collectionLinks:73,missingCollectionLinks:3,overlap:data.audit.overlappingDifficultyQuestions}));
