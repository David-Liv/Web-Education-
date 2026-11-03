import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeProgrammeRecord } from './programme-normalization.mjs';
const base={id:'fixture',route:'JUPAS',institution:'HKU',selection:'Best 4 subjects',minimum:{csd:'U'},statisticsYear:'2025/26',competitionRatio:0,formula:{scale:'standard'}};
test('projection preserves missing values, M1/M2 alternatives and source provenance',()=>{
 const result=normalizeProgrammeRecord({...base,detail:{rawWeights:{must:[{code:'SJ1_MEEP'}],vals:[{s:[{code:'SJ_BIOL'},{code:'SJ_CHEM'}],w:'2'}],excl:[{code:'SJ_ENGL'}],mws:'1',csa:'1'},rawScores:[{year:2026,median:5}] }},'2026-11-03T00:00:00Z');
 assert.equal(result.formula.count,4);assert.deepEqual(result.formula.requiredGroups,[['M1','M2']]);assert.deepEqual(result.formula.weights,{bio:2,chem:2});assert.deepEqual(result.formula.excluded,['eng']);assert.equal(result.formula.maxWeightedSubjects,1);assert.equal(result.formula.csdPoints,1);
 assert.equal(result.competitionRatio,undefined);assert.equal(result.lowerQuartileIndex,undefined);assert.equal(result.sourceMeta.fetchedAt,null);assert.equal(result.minimum.csd,undefined);assert.equal(result.formula.verified,false);
});
test('two-of constraints, source bonuses and OR entry branches survive normalization',()=>{
 const result=normalizeProgrammeRecord({...base,selection:'Best 6 subjects',detail:{rawWeights:{must2:[[{code:'SJ_BIOL'},{code:'SJ_CHEM'},{code:'SJ_PHYS'}]],vals:[{s:{code:'SJ_7THS'},w:'.2'}]},elects:[{subj:{code:'SJ_CHEM'},pt:3},{stmt:'or'},{subj:{code:'SJ_PHYS'},pt:4}]}},'2026-11-03');
 assert.equal(result.formula.count,6);assert.equal(result.formula.requiredCounts[0].count,2);assert.equal(result.formula.bonusRank,7);assert.equal(result.entryAlternatives.length,2);assert.equal(result.entryAlternatives[1][0].minimum,'4');
});
test('the recorded catalogue is unique and never treats an import time as a verified fetch date',()=>{
 const raw=JSON.parse(readFileSync('data/bigexam-programmes-complete.json','utf8')),publicRows=JSON.parse(readFileSync('public/data/bigexam-programmes-complete.json','utf8'));
 assert.equal(raw.length,431);assert.equal(publicRows.length,435);assert.equal(new Set(publicRows.map(p=>p.id)).size,publicRows.length);
 assert.equal(publicRows.filter(p=>p.qualification==='學士').length,430);
 for(const p of publicRows.filter(p=>p.route==='JUPAS')){assert.ok(p.sourceMeta.importedAt);assert.equal(p.sourceMeta.fetchedAt,null);assert.equal(p.formula.verified,false);assert.ok(p.url.startsWith('https://'));assert.ok(!('detail' in p))}
});
