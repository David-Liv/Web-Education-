/** Public metadata only: never persist stems, choices, answers, explanations or source PDFs. */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://www.dselib.com';
const labels = { easy: '簡單', medium: '中等', hard: '困難', extreme: '極難' };
const now = new Date().toISOString();
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(new Date());
const sleep = ms => new Promise(done => setTimeout(done, ms));
const clean = s => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const requests = [];

async function get(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      const html = await response.text();
      requests.push({ url, checkedAt: new Date().toISOString(), status: response.status });
      return html;
    } catch (error) {
      if (attempt || /HTTP (4\d\d)/.test(error.message)) throw error;
      await sleep(1000);
    }
  }
}

function pageQuestions(html) {
  // Decode data, never execute scripts received from a source website.
  const text = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map(m => JSON.parse(m[1])).join('');
  const sets = [];
  // RSC text records can contain literal newlines before a JSON record. Read only
  // the bounded questions array, rather than assuming one JSON value per line.
  for (const match of text.matchAll(/"questions":\s*\[/g)) {
    const start = match.index + match[0].lastIndexOf('[');
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
      else if (c === '"') quoted = true;
      else if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') { depth--; if (depth === 0) { sets.push(JSON.parse(text.slice(start, i+1))); break; } }
    }
  }
  if (!sets.length && /共\s*0\s*題/.test(clean(html))) return [];
  if (sets.length !== 1) throw new Error(`Expected one questions payload, received ${sets.length}`);
  return sets[0];
}

const home = await get(`${origin}/practice/maths`);
const topics = {};
for (const m of home.matchAll(/<a\b[^>]*href="([^"]*questions\?topic=[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
  const id = new URL(clean(m[1]), origin).searchParams.get('topic');
  topics[id] = clean(m[2]).replace(/\s*\d+\s*題$/, '');
}
if (!topics.QuadraticEquationsPolynomials) throw new Error('Source topic navigation changed; inspect before refreshing.');
const questions = new Map();
const jobs = [];
for (let year = 2024; year >= 2012; year--) for (const difficulty of Object.keys(labels)) jobs.push({ year, difficulty });
let complete = 0;
async function worker() {
  while (jobs.length) {
    const { year, difficulty } = jobs.shift();
    let lastPage = 1;
    for (let page = 1; page <= lastPage; page++) {
      const url = new URL('/practice/maths/questions', origin);
      url.searchParams.set('year', String(year)); url.searchParams.set('difficulty', difficulty);
      if (page > 1) url.searchParams.set('page', String(page));
      const html = await get(url.href);
      for (const m of html.matchAll(/href="([^"]*questions[^"#]*)"/g)) {
        const link = new URL(clean(m[1]), origin);
        if (link.searchParams.get('year') === String(year) && link.searchParams.get('difficulty') === difficulty && !link.searchParams.has('wrong')) {
          const n = Number(link.searchParams.get('page') || 1);
          if (Number.isInteger(n) && n >= 1 && n <= 10) lastPage = Math.max(lastPage, n);
        }
      }
      let extracted;
      try { extracted = pageQuestions(html); } catch (error) { throw new Error(`${url.href}: ${error.message}`); }
      for (const q of extracted) {
        if (q.year !== year || q.subject !== 'maths' || !Number.isInteger(q.number) || q.number < 1 || q.number > 45 || !topics[q.topic]) throw new Error(`Unexpected question metadata ${q.id}`);
        const id = `HKDSE-maths-compulsory-${year}-P2-Q${q.number}`;
        const current = questions.get(id);
        if (current && (current.sourceTopicId !== q.topic || current.sourceCorrectPercentage !== q.correctPercentage || current.sourceQuestionId !== q.id)) throw new Error(`Conflicting metadata ${id}`);
        const row = current ?? { id, kind: 'past-paper-question', sourceId: 'dselib', exam: 'HKDSE', year, paper: 'P2', number: q.number, language: 'zh-Hant/en', sourceQuestionId: q.id, sourceTopicId: q.topic, topic: topics[q.topic], sourceDifficultyLabels: [], sourceCorrectPercentage: q.correctPercentage ?? null, percentagePopulation: '來源未提供可核對的樣本／考生群體；未與考評局報告核實', officialDseLevel: null, curriculum2028: 'pending', contentStatus: 'external-link-only', metadataStatus: 'source-extracted', evidenceUrls: [], checkedAt: date };
        if (row.sourceCorrectPercentage !== null && (!Number.isFinite(row.sourceCorrectPercentage) || row.sourceCorrectPercentage < 0 || row.sourceCorrectPercentage > 100)) throw new Error(`Invalid percentage ${id}`);
        if (!row.sourceDifficultyLabels.includes(labels[difficulty])) row.sourceDifficultyLabels.push(labels[difficulty]);
        row.evidenceUrls.push(url.href);
        const atQuestion = new URL('/practice/maths/questions', origin);
        atQuestion.searchParams.set('year', String(year)); atQuestion.searchParams.set('topic', q.topic);
        row.url = atQuestion.href; // Source's filtered set, not a falsely claimed per-question deep link.
        row.linkScope = '年份＋課題集合；按原卷題號尋找';
        questions.set(id, row);
      }
      await sleep(200);
    }
    complete++;
    if (complete % 8 === 0 || complete === 52) console.log(`dselib ${complete}/52 year/filter sets; ${questions.size} unique questions`);
  }
}
await Promise.all([worker(), worker()]);
if (questions.size !== 585) throw new Error(`Expected 585 DSE P2 records for 2012–2024, received ${questions.size}; no output replaced.`);
for (let year = 2012; year <= 2024; year++) for (let q = 1; q <= 45; q++) if (!questions.has(`HKDSE-maths-compulsory-${year}-P2-Q${q}`)) throw new Error(`Missing ${year} Q${q}`);
const fixed = JSON.parse(await readFile(resolve(root, 'data/maths-source-notes.json'), 'utf8'));
const rank = ['極難', '困難', '中等', '簡單'];
const rows = [...questions.values()].map(q => ({ ...q, sourceDifficultyLabels: rank.filter(x => q.sourceDifficultyLabels.includes(x)), displayDifficulty: rank.find(x => q.sourceDifficultyLabels.includes(x)) ?? '待標註' })).sort((a,b) => a.topic.localeCompare(b.topic, 'zh-Hant') || b.year-a.year || a.number-b.number);
const data = {
  schemaVersion: 1, generatedAt: now, checkedAt: date, targetExamYear: 2028,
  scope: '數學必修外部元資料索引；題幹與答案未複製，未發布到正式測驗',
  sources: [
    { id: 'dselib', name: 'dselib', url: `${origin}/practice/maths`, status: 'question-metadata-extracted', coverage: '2012–2024，卷二，每年45題；排除CE及其他年份', rights: 'external-links-only', note: '來源的困難與極難分組重疊；展示最細分組並保留全部原始標籤。正確率非本平台校準數據。' },
    ...fixed.sources
  ],
  questions: [...rows, ...fixed.questions], collections: fixed.collections,
  audit: { requests, uniquePastPaperQuestions: rows.length, publisherExercises: fixed.questions.length, collectionLinks: fixed.collections.filter(c=>c.url).length, overlappingDifficultyQuestions: rows.filter(q=>q.sourceDifficultyLabels.length>1).length, excluded: ['HKCEE', 'M1', 'M2', '2025–2026未提取', '未核實2028逐題課綱映射'], ...fixed.audit }
};
const target = resolve(root, 'public/data'); await mkdir(target, { recursive: true });
const temporary = resolve(target, 'maths-source-index.json.tmp');
await writeFile(temporary, JSON.stringify(data, null, 2)+'\n');
await rename(temporary, resolve(target, 'maths-source-index.json'));
const csvCell = v => `"${String(v ?? '').replaceAll('"','""')}"`;
const columns = ["id","kind","sourceId","exam","year","paper","number","language","sourceTopicId","topic","knowledgePoints","knowledgePointStatus","displayDifficulty","sourceDifficultyLabels","publisherTargetLevel","targetLabelScope","officialDseLevel","sourceCorrectPercentage","percentagePopulation","curriculum2028","contentStatus","metadataStatus","sourceLocation","linkScope","checkedAt","url"];
await writeFile(resolve(target, 'maths-questions.csv'), '\uFEFF'+[columns, ...data.questions.map(q=>columns.map(k=>Array.isArray(q[k])?q[k].join(' / '):q[k]))].map(row=>row.map(csvCell).join(',')).join('\r\n'));
const collectionColumns=['id','sourceId','language','topic','paper','coverage','url','contentStatus','difficulty'];
await writeFile(resolve(target, 'maths-collections.csv'), '\uFEFF'+[collectionColumns,...data.collections.map(c=>collectionColumns.map(k=>c[k]))].map(row=>row.map(csvCell).join(',')).join('\r\n'));
console.log(JSON.stringify({ questions: data.questions.length, collections: data.collections.length, audit: { uniqueDse:585, publisherExercises:fixed.questions.length, overlaps:data.audit.overlappingDifficultyQuestions } }));
