/**
 * scripts/crawl-bigexam-programmes.mjs
 * 
 * Crawler for HK JUPAS programmes from BigExam:
 * 1. Fetches all pages from BigExam AJAX filter (431+ programmes)
 * 2. Fetches detail pages for all programmes with concurrency control
 * 3. Parses full admission score index, subject weightings, entrance requirements,
 *    places, tuition fees, competition ratios, and historical stats
 * 4. Outputs:
 *    - data/bigexam-programmes-complete.json
 *    - public/data/bigexam-programmes-complete.json
 *    - src/data/programmes.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { normalizeProgrammeRecord } from './programme-normalization.mjs';
import { spawnSync } from 'node:child_process';

const BASE_URL = 'https://dse.bigexam.hk';
const CONCURRENCY = 8;
const MAX_RETRIES = 3;

const institutionNames = {
  CityU: '香港城市大學',
  HSUHK: '香港恒生大學',
  HKBU: '香港浸會大學',
  HKCHC: '香港珠海學院',
  HKSYU: '香港樹仁大學',
  LU: '嶺南大學',
  SFU: '聖方濟各大學',
  'THEi, VTC': '香港高等教育科技學院',
  CUHK: '香港中文大學',
  EdUHK: '香港教育大學',
  HKMU: '香港都會大學',
  PolyU: '香港理工大學',
  HKUST: '香港科技大學',
  HKU: '香港大學',
  TWC: '東華學院',
  UOWCHK: '香港伍倫貢學院',
  'SPACE CC': '香港大學附屬學院',
  'PolyU HKCC': '香港理工大學香港專上學院'
};

const areaNames = {
  STR_PROG_AREA_01: '會計與金融',
  STR_PROG_AREA_02: '數學與精算',
  STR_PROG_AREA_03: '美術與創意媒體',
  STR_PROG_AREA_04: '建築與建造',
  STR_PROG_AREA_05: '人文與藝術',
  STR_PROG_AREA_06: '商業與管理',
  STR_PROG_AREA_07: '傳媒與新聞',
  STR_PROG_AREA_08: '教育與師訓',
  STR_PROG_AREA_09: '工程與科技',
  STR_PROG_AREA_10: '地理與測量',
  STR_PROG_AREA_11: '旅遊與款待',
  STR_PROG_AREA_12: '語文與翻譯',
  STR_PROG_AREA_13: '法律與法學',
  STR_PROG_AREA_14: '交通與物流',
  STR_PROG_AREA_15: '醫學與護理',
  STR_PROG_AREA_16: '體育與健康',
  STR_PROG_AREA_17: '理學與科研',
  STR_PROG_AREA_18: '社會科學'
};

const subjectCodeMap = {
  SJ_CHIN: 'chi',
  SJ_ENGL: 'eng',
  SJ1_MECP: 'maths',
  SJ1_MEEP: 'M1', // or M2
  SJ2_MEP1: 'M1',
  SJ2_MEP2: 'M2',
  SJ_BIOL: 'bio',
  SJ_CHEM: 'chem',
  SJ_PHYS: 'phy',
  SJ_ECON: 'econ',
  SJ1_ACCT: 'bafs',
  SJ1_BUMA: 'bafs',
  SJ_IACT: 'ict',
  SJ_GEOG: 'geo',
  SJ_MUSI: 'music',
  SJ_VIAR: 'va',
  SJ_PHED: 'pe',
  SJ_DNAT: 'dnat',
  SJ_CASD: 'csd',
  SJ_HIST: 'hist',
  SJ_CHIS: 'chis'
};

const subjectZhMap = {
  chi: '中文',
  eng: '英文',
  maths: '數學',
  chem: '化學',
  bio: '生物',
  phy: '物理',
  econ: '經濟',
  bafs: '企會財',
  ict: 'ICT',
  music: '音樂',
  va: '視藝',
  pe: '體育',
  geo: '地理',
  hist: '歷史',
  chis: '中史',
  dnat: '設計科技',
  csd: '公社',
  M1: 'M1',
  M2: 'M2'
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        await sleep(attempt * 1000);
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(attempt * 800);
    }
  }
}

/**
 * Step 1: Fetch list of all programmes from BigExam AJAX filter
 */
async function fetchAllListItems() {
  console.log('[1/4] Fetching programme list from BigExam API...');
  const items = [];
  let page = 1;
  let totalItems = 0;

  while (true) {
    const res = await fetchWithRetry(`${BASE_URL}/en/ajax/progFltr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: `p=${page}&order=cmpRatio&asc=0`
    });

    const json = await res.json();
    totalItems = Number(json.t) || totalItems;
    if (!Number.isInteger(totalItems) || totalItems < 1) throw new Error('Missing source total; existing snapshot was retained.');
    const pageData = json.data || [];
    if (!pageData.length) break;

    items.push(...pageData);
    process.stdout.write(`\r  Page ${page} loaded (${items.length}/${totalItems} programmes)...`);

    if (items.length >= totalItems) break;
    page++;
    await sleep(60); // respectful pause
  }

  if (items.length !== totalItems) throw new Error(`Incomplete source list: ${items.length}/${totalItems}; existing snapshot was retained.`);
  console.log(`\n  Successfully fetched ${items.length} programme search entries.`);
  return items;
}

/**
 * Step 2: Fetch and parse detail page for a single programme
 */
async function fetchDetailPage(code) {
  const url = `${BASE_URL}/en/pathway/progs/jupasProg/${code}`;
  const res = await fetchWithRetry(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();

  // Extract Script 20 JavaScript objects
  const scriptMatches = [...html.matchAll(/<script[\s\S]*?<\/script>/gi)].map(m => m[0]);
  const s20 = scriptMatches.find(s => s.includes('sProgCode') && s.includes('sProgName'));

  let scores = [];
  let weights = null;
  let scoringYear = 2026;
  let core = null;
  let elects = [];
  let prefer = [];
  let appStatData = null;
  let offStatData = null;
  let cmpRatioData = null;

  if (s20) {
    const getVarJson = (pattern) => {
      const m = s20.match(pattern);
      if (!m) return null;
      try {
        return JSON.parse(m[1]);
      } catch {
        return null;
      }
    };

    scores = getVarJson(/scores\s*=\s*(\[[\s\S]*?\])\s*,\s*appStatData/) || [];
    weights = getVarJson(/weights\s*=\s*(\{[\s\S]*?\})\s*,\s*scoringYear/);
    const yrM = s20.match(/scoringYear\s*=\s*(\d+)/);
    if (yrM) scoringYear = parseInt(yrM[1], 10);
    core = getVarJson(/core\s*=\s*(\{[\s\S]*?\})\s*,\s*allSubjs/);
    elects = getVarJson(/elects\s*=\s*(\[[\s\S]*?\])\s*,\s*prefer/) || [];
    prefer = getVarJson(/prefer\s*=\s*(\[[\s\S]*?\])\s*,\s*scrRef/) || [];
    appStatData = getVarJson(/appStatData\s*=\s*(\{[\s\S]*?\})\s*,\s*offStatData/);
    offStatData = getVarJson(/offStatData\s*=\s*(\{[\s\S]*?\})\s*,\s*cmpRatioData/);
    cmpRatioData = getVarJson(/cmpRatioData\s*=\s*(\{[\s\S]*?\})\s*,\s*subjVer/);
  }

  // Extract HTML text details
  const selectionPrincipleMatch = html.match(/Selection principle<\/td><td[^>]*>(?:<[^>]+>)*\s*([^<]+)/i);
  const selectionPrinciple = selectionPrincipleMatch ? selectionPrincipleMatch[1].trim() : 'Best 5';

  const placesMatch = html.match(/Places:\s*([0-9]+)/i);
  const places = placesMatch ? parseInt(placesMatch[1], 10) : null;

  const feeMatch = html.match(/1st year tuition fee:\s*HK\$([0-9,]+)/i);
  const tuitionFee = feeMatch ? feeMatch[1].replace(/,/g, '') : null;

  const interviewMatch = html.match(/Interview:\s*([A-Za-z0-9\s]+)/i);
  const interview = interviewMatch ? interviewMatch[1].trim() : null;

  const yearsMatch = html.match(/Years:\s*([0-9.]+)/i);
  const duration = yearsMatch ? yearsMatch[1].trim() : null;

  return {
    code,
    detailUrl: url,
    fetchedAt: new Date().toISOString(),
    scores,
    weights,
    scoringYear,
    selectionPrinciple,
    places,
    tuitionFee,
    interview,
    duration,
    core,
    elects,
    prefer,
    appStatData,
    offStatData,
    cmpRatioData
  };
}

/**
 * Step 3: Run concurrent crawler for detail pages
 */
async function fetchAllDetails(listItems) {
  console.log(`[2/4] Crawling detail pages for ${listItems.length} programmes (concurrency: ${CONCURRENCY})...`);
  const details = new Map();
  const failures=[];
  let doneCount = 0;
  let errorCount = 0;

  async function worker(items) {
    for (const item of items) {
      try {
        const detail = await fetchDetailPage(item.code);
        details.set(item.code, detail);
      } catch (err) {
        errorCount++;
        failures.push({id:item.code,url:`${BASE_URL}/en/pathway/progs/jupasProg/${item.code}`,error:String(err.message),at:new Date().toISOString()});
        console.error(`\n  Failed to fetch detail for ${item.code}: ${err.message}`);
      } finally {
        doneCount++;
        if (doneCount % 20 === 0 || doneCount === listItems.length) {
          process.stdout.write(`\r  Progress: ${doneCount}/${listItems.length} (${((doneCount / listItems.length) * 100).toFixed(1)}%)...`);
        }
      }
    }
  }

  // Partition items across concurrency buckets
  const buckets = Array.from({ length: CONCURRENCY }, () => []);
  listItems.forEach((item, idx) => {
    buckets[idx % CONCURRENCY].push(item);
  });

  await Promise.all(buckets.map(bucket => worker(bucket)));
  console.log(`\n  Detail crawl complete: ${details.size} retrieved, ${errorCount} errors.`);
  details.failures=failures;
  return details;
}

/**
 * Step 4: Map raw item + detail into clean Program data structure
 */
function normalizeProgramme(item, detail) {
  const code = item.code;
  const ins = item.ins;
  const institutionName = institutionNames[ins] || ins;
  const name = (item.cname || '').replace(/\s*\([^)]*\)\s*$/g, '').trim() || item.ename;
  const en = item.ename || '';

  // Area
  const areaCode = item.area && item.area[0];
  const area = areaNames[areaCode] || '綜合與其他';

  // Level & Qualification
  let qualification = '學士';
  if (item.lvl?.includes('Higher Diploma') || item.lvl?.includes('HD')) {
    qualification = '高級文憑';
  } else if (item.lvl?.includes('Sub-degree') || item.lvl?.includes('AD')) {
    qualification = '副學士';
  }

  // Scores
  let scoreIndex = null;
  let lowerQuartileIndex = null;
  let median = null;
  let mean = null;
  let lowerQuartile = null;
  let statsYear = '2025/26';

  const latestScore = detail?.scores && detail.scores[0];
  if (latestScore) {
    if (latestScore.year) {
      statsYear = `${latestScore.year - 1}/${String(latestScore.year).slice(2)}`;
    }
    if (typeof latestScore.median === 'number') {
      scoreIndex = Math.round(latestScore.median * 10) / 10;
      median = Math.round(latestScore.median * 10) / 10;
    }
    if (typeof latestScore.lower === 'number') {
      lowerQuartileIndex = Math.round(latestScore.lower * 10) / 10;
      lowerQuartile = Math.round(latestScore.lower * 10) / 10;
    }
  } else if (item.scores && item.scores[0]) {
    const s = item.scores[0];
    if (s.year) statsYear = `${s.year - 1}/${String(s.year).slice(2)}`;
    if (typeof s.median === 'number') scoreIndex = Math.round(s.median * 10) / 10;
    if (typeof s.lower === 'number') lowerQuartileIndex = Math.round(s.lower * 10) / 10;
  }

  // Competition Ratio
  let competitionRatio = null;
  if (item.cmpRatio && item.cmpRatio[0] && typeof item.cmpRatio[0].ratio === 'number') {
    competitionRatio = item.cmpRatio[0].ratio;
  }

  // Weightings & Formula
  const weights = {};
  const required = [];
  const requiredGroups = [];
  const weightingTextParts = [];

  const rawWeights = detail?.weights || (item.scoringScheme && item.scoringScheme[0]);

  // Parse numeric weight multipliers if present in detail.weights.vals
  if (detail?.weights?.vals && Array.isArray(detail.weights.vals)) {
    for (const v of detail.weights.vals) {
      const sCode = v.s?.code;
      const wVal = parseFloat(v.w);
      const mappedId = subjectCodeMap[sCode];
      if (mappedId && !isNaN(wVal)) {
        weights[mappedId] = wVal;
        const zh = subjectZhMap[mappedId] || v.s?.name || mappedId;
        weightingTextParts.push(`${zh} ×${wVal}`);
      }
    }
  }

  // Parse required elective groups from detail.elects or detail.weights
  if (detail?.elects && Array.isArray(detail.elects)) {
    for (const el of detail.elects) {
      if (Array.isArray(el.subj)) {
        const group = el.subj.map(s => subjectCodeMap[s.code]).filter(Boolean);
        if (group.length > 1) {
          const groupStr = group.slice().sort().join(',');
          if (!requiredGroups.some(g => g.slice().sort().join(',') === groupStr)) {
            requiredGroups.push(group);
          }
        }
      }
    }
  }

  // Parse required subjects from detail.weights.must or must2
  if (detail?.weights?.must && Array.isArray(detail.weights.must)) {
    for (const m of detail.weights.must) {
      if (m.code && subjectCodeMap[m.code]) {
        required.push(subjectCodeMap[m.code]);
      } else if (Array.isArray(m)) {
        const group = m.map(s => subjectCodeMap[s.code]).filter(Boolean);
        if (group.length > 1) {
          const groupStr = group.slice().sort().join(',');
          if (!requiredGroups.some(g => g.slice().sort().join(',') === groupStr)) {
            requiredGroups.push(group);
          }
        }
      }
    }
  }

  // Selection Principle
  const selection = detail?.selectionPrinciple || (item.scoringScheme?.[0]?.principle) || 'Best 5';

  // Construct readable weighting text
  let weightingText = weightingTextParts.join('；');
  if (!weightingText) {
    if (detail?.weights?.h?.length || detail?.weights?.hh?.length) {
      const heavy = [...(detail.weights.hh || []), ...(detail.weights.h || [])]
        .map(s => s.name || s.code)
        .filter(Boolean);
      weightingText = heavy.length ? `${heavy.join('、')} 獲較高比重。來源未列精確數值。` : '來源未列額外科目倍率';
    } else {
      weightingText = '來源未列額外科目倍率';
    }
  }

  // Minimum entrance requirements
  const minimum = {};
  const coreSource = detail?.core || item;
  if (coreSource.chi) minimum.chi = String(coreSource.chi);
  if (coreSource.eng) minimum.eng = String(coreSource.eng);
  if (coreSource.math) minimum.maths = String(coreSource.math);
  if (coreSource.cs !== undefined) minimum.csd = coreSource.cs >= 1 ? 'A' : 'U';

  const formulaYear = detail?.scoringYear || (item.scoringScheme?.[0]?.year ? parseInt(item.scoringScheme[0].year, 10) : 2026);

  const formula = {
    count: selection.toLowerCase().includes('best 6') || selection.includes('6') ? 6 : 5,
    required: [...new Set(required)],
    weights,
    scale: ['HKBU', 'LU', 'HKMU', 'HSUHK', 'HKSYU', 'SFU', 'TWC', 'THEi, VTC'].includes(ins) ? 'standard' : 'enhanced',
    ...(requiredGroups.length ? { requiredGroups } : {}),
    verified: Object.keys(weights).length > 0
  };

  const places = detail?.places ?? item.intakes ?? null;
  const tuitionFee = detail?.tuitionFee ?? (item.fee ? String(item.fee) : null);
  const interview = detail?.interview ?? item.interv ?? null;

  let note = `BigExam 資料來源；計分規則學年 ${formulaYear}，統計學年 ${statsYear}。學額：${places ?? '未公布'}，首年學費：${tuitionFee ? 'HK$' + Number(tuitionFee).toLocaleString() : '未公布'}。面試安排：${interview}。`;
  if (Object.keys(weights).length === 0) {
    note += ' 來源未列出具體科目倍率，計分換算待官方公布確認。';
  }

  return {
    id: code,
    institution: ins,
    institutionName,
    name,
    en,
    qualification,
    area,
    route: 'JUPAS',
    url: `https://dse.bigexam.hk/en/pathway/progs/jupasProg/${code}`,
    jupasUrl: item.url || `http://www.jupas.edu.hk/en/programme/${ins.toLowerCase()}/${code}/`,
    statisticsYear: statsYear,
    formulaYear,
    median,
    mean,
    lowerQuartile,
    lowerQuartileIndex,
    scoreIndex,
    indexKind: scoreIndex !== null ? 'median' : 'unavailable',
    competitionRatio,
    selection,
    weightingText,
    formula,
    minimum,
    places,
    tuitionFee,
    interview,
    duration: detail?.duration ?? item.yrs ?? '4',
    funding: item.fc || 'UGC-funded',
    ...(requiredGroups.length ? { requiredGroups } : {}),
    note,
    checkedAt: detail?.fetchedAt?.slice(0,10) ?? null,
    fetchedAt: detail?.fetchedAt ?? null,
    // Extra detailed data preserved for comprehensive export
    detail: {
      rawWeights: detail?.weights,
      rawScores: detail?.scores,
      elects: detail?.elects,
      prefer: detail?.prefer,
      appStatData: detail?.appStatData,
      offStatData: detail?.offStatData,
      cmpRatioData: detail?.cmpRatioData
    }
  };
}

/**
 * Step 5: Generate TypeScript export string
 */
function generateProgrammesTs(programmesList) {
  // Preserve sub-degree programmes from original programmes.ts
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

  // Strip internal detail before generating TS
  const cleanJupas = programmesList.map(p => {
    const { detail, jupasUrl, places, tuitionFee, interview, duration, funding, ...clean } = p;
    return clean;
  });

  const all = [...cleanJupas, ...subDegreeProgrammes];

  const header = `import type { Programme } from '../types.ts';
// Auto-generated from BigExam JUPAS crawler on ${new Date().toISOString().slice(0, 10)}.
// Contains all Hong Kong universities and all ${cleanJupas.length} JUPAS degree programmes.
// Preserves sub-degree / E-APP benchmark entries.
export const programmes: Programme[] = ${JSON.stringify(all, null, 2)};
`;

  return header;
}

/**
 * Main Runner
 */
async function main() {
  console.log('=== BigExam University Programme Crawler ===');
  console.log(`Starting crawl at: ${new Date().toISOString()}\n`);

  // 1. Fetch all list items
  const listItems = await fetchAllListItems();

  // 2. Crawl detail pages
  const details = await fetchAllDetails(listItems);

  // 3. Normalize programmes
  console.log('[3/4] Processing and normalising crawled programmes...');
  const previousPath=path.resolve('data/bigexam-programmes-complete.json');
  const previousById=new Map((fs.existsSync(previousPath)?JSON.parse(fs.readFileSync(previousPath,'utf8')):[]).map(p=>[p.id,p]));
  const normalizedList = listItems.map(item => {
    const detail = details.get(item.code);
    const value=normalizeProgramme(item, detail);
    if(!detail){const previous=previousById.get(value.id);if(previous)return {...previous,fetchStatus:'failed',lastFetchAttempt:new Date().toISOString()};}
    return {...value,fetchStatus:detail?'ok':'failed'};
  });

  // Sort by institution then by id
  normalizedList.sort((a, b) => a.institution.localeCompare(b.institution) || a.id.localeCompare(b.id));

  if(details.failures.length){fs.mkdirSync('data',{recursive:true});fs.writeFileSync('data/programme-crawl-failures.json',JSON.stringify(details.failures,null,2));throw new Error('Detail fetch failed; existing programme snapshot was retained. See data/programme-crawl-failures.json.')}
  if(!normalizedList.length||new Set(normalizedList.map(p=>p.id)).size!==normalizedList.length)throw new Error('Invalid or duplicate programme list; snapshot was retained.');
  // 4. Save JSON files
  console.log('[4/4] Writing datasets and source files...');
  const dataDir = path.resolve('data');
  const publicDataDir = path.resolve('public/data');
  const srcDataDir = path.resolve('src/data');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(publicDataDir, { recursive: true });

  const completeJsonPath = path.join(dataDir, 'bigexam-programmes-complete.json');
  const publicJsonPath = path.join(publicDataDir, 'bigexam-programmes-complete.json');
  const programmesTsPath = path.join(srcDataDir, 'programmes.ts');

  fs.writeFileSync(completeJsonPath, JSON.stringify(normalizedList, null, 2), 'utf8');
  // Public projection is written by enrich-programmes; raw detail stays in data/. 
  console.log(`  Saved complete JSON to: ${completeJsonPath}`);
  console.log(`  Saved public JSON to: ${publicJsonPath}`);

  // Generate programmes.ts
  const projected=spawnSync(process.execPath,['scripts/enrich-programmes.mjs'],{stdio:'inherit',windowsHide:true});
  if(projected.status)throw new Error('Programme projection failed.');
  console.log(`  Updated ${programmesTsPath} with ${normalizedList.length} JUPAS programmes + 4 sub-degree programmes.`);

  // Summary by University
  const summary = {};
  for (const p of normalizedList) {
    summary[p.institution] = (summary[p.institution] || 0) + 1;
  }
  console.log('\n=== Crawl Summary by University ===');
  for (const [ins, count] of Object.entries(summary)) {
    console.log(`  ${ins.padEnd(12)} (${(institutionNames[ins] || '').padEnd(14)}): ${count} programmes`);
  }
  console.log(`Total JUPAS programmes: ${normalizedList.length}`);
  console.log('Done successfully!');
}

main().catch(err => {
  console.error('Fatal crawler error:', err);
  process.exit(1);
});
