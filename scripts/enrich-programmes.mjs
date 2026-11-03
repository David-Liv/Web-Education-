import fs from 'node:fs';
import {normalizeProgrammeRecord} from './programme-normalization.mjs';

const completeJsonPath = 'data/bigexam-programmes-complete.json';
const targetTsPath = 'src/data/programmes.ts';

const rawData = JSON.parse(fs.readFileSync(completeJsonPath, 'utf8'));

const subDegreeProgrammes = [
  {
    id: 'SPACE-ENG',
    institution: 'SPACE CC',
    institutionName: '香港大學附屬學院',
    name: '工程學副學士',
    en: 'Associate of Engineering',
    qualification: '副學士',
    area: '副學位升學',
    route: '直接申請 / E-APP',
    url: 'https://www2.hkuspace.hku.hk/cc/admission/general-entrance-requirements/',
    statisticsYear: '未公布',
    formulaYear: 2026,
    median: null,
    mean: null,
    lowerQuartile: null,
    lowerQuartileIndex: undefined,
    upperQuartileIndex: undefined,
    scoreIndex: null,
    indexKind: 'unavailable',
    selection: '中英文＋最佳其他三科',
    weightingText: '中英文必計，五科共同計分制；另須符合課程特定要求。',
    formula: { count: 5, required: ['chi', 'eng'], weights: {}, scale: 'standard', verified: false },
    minimum: { chi: '2', eng: '2', maths: '2' },
    note: '未取得此課程的官方錄取中位數；保留空值。資訊科技／工程課程另有數學要求。',
    checkedAt: '2026-10-27'
  },
  {
    id: 'SPACE-IT',
    institution: 'SPACE CC',
    institutionName: '香港大學附屬學院',
    name: '資訊科技高級文憑',
    en: 'Higher Diploma in Information Technology',
    qualification: '高級文憑',
    area: '專業與職業',
    route: '直接申請 / E-APP',
    url: 'https://www2.hkuspace.hku.hk/cc/admission/general-entrance-requirements/',
    statisticsYear: '未公布',
    formulaYear: 2026,
    median: null,
    mean: null,
    lowerQuartile: null,
    lowerQuartileIndex: undefined,
    upperQuartileIndex: undefined,
    scoreIndex: null,
    indexKind: 'unavailable',
    selection: '中英文＋最佳其他三科',
    weightingText: '中英文必計，五科共同計分制；另須符合課程特定要求。',
    formula: { count: 5, required: ['chi', 'eng'], weights: {}, scale: 'standard', verified: false },
    minimum: { chi: '2', eng: '2', maths: '2' },
    note: '未取得此課程的官方錄取中位數；保留空值。資訊科技／工程課程另有數學要求。',
    checkedAt: '2026-10-27'
  },
  {
    id: '8C112-ENG',
    institution: 'PolyU HKCC',
    institutionName: '香港理工大學香港專上學院',
    name: '工程學副學士',
    en: 'Associate in Engineering',
    qualification: '副學士',
    area: '副學位升學',
    route: '直接申請 / E-APP',
    url: 'https://www.hkcc-polyu.edu.hk/en/admission/key-information-for-application/admission-score-for-2026-27-cohort/index.html',
    statisticsYear: '2026/27',
    formulaYear: 2026,
    median: null,
    mean: 16.28,
    lowerQuartile: 15,
    lowerQuartileIndex: undefined,
    upperQuartileIndex: undefined,
    scoreIndex: null,
    indexKind: 'unavailable',
    selection: '中英文＋最佳其他三科',
    weightingText: '中英文必計，五科共同計分制；另須符合課程特定要求。',
    formula: { count: 5, required: ['chi', 'eng'], weights: {}, scale: 'standard', verified: true },
    minimum: { chi: '2', eng: '2' },
    note: '院校公布的是平均分（mean），不是 median；以 7 分制計算。',
    checkedAt: '2026-10-27'
  },
  {
    id: '8C123',
    institution: 'PolyU HKCC',
    institutionName: '香港理工大學香港專上學院',
    name: '社會工作高級文憑',
    en: 'Higher Diploma in Social Work',
    qualification: '高級文憑',
    area: '專業與職業',
    route: '直接申請 / E-APP',
    url: 'https://www.hkcc-polyu.edu.hk/en/admission/key-information-for-application/admission-score-for-2026-27-cohort/index.html',
    statisticsYear: '2026/27',
    formulaYear: 2026,
    median: null,
    mean: 16.31,
    lowerQuartile: 15,
    lowerQuartileIndex: undefined,
    upperQuartileIndex: undefined,
    scoreIndex: null,
    indexKind: 'unavailable',
    selection: '中英文＋最佳其他三科',
    weightingText: '中英文必計，五科共同計分制；另須符合課程特定要求。',
    formula: { count: 5, required: ['chi', 'eng'], weights: {}, scale: 'standard', verified: true },
    minimum: { chi: '2', eng: '2' },
    note: '院校公布的是平均分（mean），不是 median；以 7 分制計算。',
    checkedAt: '2026-10-27'
  }
];

const importedAt = new Date().toISOString();
const cleanJupas = rawData.map(p => normalizeProgrammeRecord(p, importedAt));
const all = [...cleanJupas, ...subDegreeProgrammes.map(p=>normalizeProgrammeRecord(p, importedAt))];
const output = `import type { Programme } from '../types.ts';
// Generated from the recorded BigExam snapshot; source dates are retained per record.
// ${cleanJupas.length} JUPAS entries plus ${subDegreeProgrammes.length} non-JUPAS reference entries.
export const programmes: Programme[] = ${JSON.stringify(all, null, 2)};
`;
fs.writeFileSync(targetTsPath+'.tmp', output, 'utf8');
fs.renameSync(targetTsPath+'.tmp',targetTsPath);
fs.writeFileSync('public/data/bigexam-programmes-complete.json', JSON.stringify(all, null, 2)+'\n');
const report = { importedAt, entries:all.length, jupas:cleanJupas.length, uniqueIds:new Set(all.map(p=>p.id)).size,
  missingFetchDate:cleanJupas.filter(p=>!p.sourceMeta.fetchedAt).length,
  missingHistory:cleanJupas.filter(p=>!p.historicalScores?.length).length,
  anomalies:cleanJupas.filter(p=>p.dataIssues.length).map(p=>({id:p.id,issues:p.dataIssues})) };
fs.writeFileSync('data/programme-import-report.json',JSON.stringify(report,null,2)+'\n');
console.log(`Generated ${all.length} programme entries; ${report.anomalies.length} retain source issues.`);
