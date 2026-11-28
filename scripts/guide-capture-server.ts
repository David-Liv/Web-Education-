import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createPilot } from '../server/app.ts';
import { Billing, defaults } from '../server/billing.ts';
import { units } from '../server/studio-state.ts';
import { CURRENT_TERMS_VERSION } from '../src/tutors.ts';

const fence = (kind: string, value: unknown) => `\`\`\`${kind}\n${JSON.stringify(value)}\n\`\`\``;

const DAVID_ZH = [
  fence('review', { scope: 'none' }),
  '拆解二次方程 $x^2 - 4x + 3 = 0$ 時，先觀察拋物線 $y = x^2 - 4x + 3$ 與 $x$ 軸的交點，再用十字相乘法分解：',
  '$$x^2 - 4x + 3 = (x - 1)(x - 3) = 0 \\implies x = 1 \\text{ 或 } 3$$',
  fence('plot', {
    title: 'y = x² − 4x + 3 與 x 軸交點',
    functions: [{ expression: 'x^2-4*x+3', label: 'y = x² − 4x + 3' }],
    xMin: -1, xMax: 5, yMin: -2, yMax: 5,
    xLabel: 'x', yLabel: 'y',
    caption: '拋物線穿過 (1, 0) 與 (3, 0)，頂點在 (2, −1)。',
  }),
  fence('exercise', {
    question: '試用因式分解法解 $x^2 - 5x + 6 = 0$，並寫出兩個根。',
    hint: '找兩個相乘得 $+6$、相加得 $-5$ 的整數。',
    answer: 'x = 2 或 x = 3',
    explanation: '$(x-2)(x-3)=0$，故 $x=2$ 或 $x=3$。',
  }),
  fence('suggestions', [
    { label: '試一題含參數判別式', prompt: '如果方程變成 x² - 4x + k = 0 有兩個相異實根，怎樣用判別式求 k 的範圍？' },
    { label: '對比求根公式何時用', prompt: '甚麼情況下直接用求根公式比因式分解更快？' },
    { label: '常見負號陷阱總結', prompt: '整理 3 個解二次方程最容易扣分的負號錯誤。' },
  ]),
].join('\n\n');

const DAVID_EN = [
  fence('review', { scope: 'none' }),
  'To solve $x^2 - 4x + 3 = 0$, first inspect where $y = x^2 - 4x + 3$ crosses the $x$-axis, then factorise cleanly:',
  '$$x^2 - 4x + 3 = (x - 1)(x - 3) = 0 \\implies x = 1 \\text{ or } 3$$',
  fence('plot', {
    title: 'Roots of y = x² − 4x + 3',
    functions: [{ expression: 'x^2-4*x+3', label: 'y = x² − 4x + 3' }],
    xMin: -1, xMax: 5, yMin: -2, yMax: 5,
    xLabel: 'x', yLabel: 'y',
    caption: 'The parabola crosses the x-axis at (1, 0) and (3, 0) with vertex (2, −1).',
  }),
  fence('exercise', {
    question: 'Factorise and solve $x^2 - 5x + 6 = 0$.',
    hint: 'Find two integers multiplying to $+6$ and adding to $-5$.',
    answer: 'x = 2 or x = 3',
    explanation: '$(x-2)(x-3)=0$, so $x=2$ or $x=3$.',
  }),
  fence('suggestions', [
    { label: 'Try a discriminant question', prompt: 'If x² - 4x + k = 0 has two distinct real roots, how do I find the range of k?' },
    { label: 'When to use the formula', prompt: 'When is the quadratic formula faster than factorising?' },
    { label: 'Top 3 sign traps', prompt: 'Summarise the 3 most common sign mistakes in DSE quadratic equations.' },
  ]),
].join('\n\n');

const MATT_LESSON_ZH = [
  fence('review', { scope: 'all' }),
  fence('teaching', {
    title: '第 1 課：二次方程解法選擇與判別式',
    objective: '按係數特徵在 10 秒內選出最快解法，並檢查根的數目。',
    sourceIds: ['hokse-quadratics'],
    reference: '先整理成 ax² + bx + c = 0，確認 a ≠ 0 再計 Δ = b² − 4ac。',
  }),
  '# 二次方程解法速查\n\n先化為標準式 $ax^2+bx+c=0$，再看是否可整數分解或直接套用公式：\n\n$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$',
  '| 情況 | 建議方法 |\n| --- | --- |\n| 係數簡單可拆 | 十字相乘法 |\n| 含根號或分數 | 求根公式 |\n| 問根的數目 | 判別式 $\\Delta$ |',
  fence('exercise', {
    question: '若 $x^2 - 6x + k = 0$ 有重根，求 $k$ 的值。',
    hint: '重根條件是 $\\Delta = b^2 - 4ac = 0$。',
    answer: 'k = 9',
    explanation: '$(-6)^2 - 4(1)(k) = 0 \\implies 36 - 4k = 0 \\implies k = 9$。',
  }),
].join('\n\n');

const MATT_LESSON_EN = [
  fence('review', { scope: 'all' }),
  fence('teaching', {
    title: 'Lesson 1: Choosing Quadratic Methods & Discriminant',
    objective: 'Pick the fastest method within 10 seconds and check the number of real roots.',
    sourceIds: ['hokse-quadratics'],
    reference: 'Rewrite into ax² + bx + c = 0 with a ≠ 0 before computing Δ = b² − 4ac.',
  }),
  '# Quadratic Methods Quick Sheet\n\nAlways rewrite into standard form $ax^2+bx+c=0$ first:\n\n$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$',
  '| Case | Best method |\n| --- | --- |\n| Clean integer factors | Factorisation |\n| Irrational roots | Quadratic formula |\n| Number of roots | Discriminant $\\Delta$ |',
  fence('exercise', {
    question: 'If $x^2 - 6x + k = 0$ has a repeated real root, find $k$.',
    hint: 'A repeated root requires $\\Delta = b^2 - 4ac = 0$.',
    answer: 'k = 9',
    explanation: '$(-6)^2 - 4(1)(k) = 0 \\implies 36 - 4k = 0 \\implies k = 9$.',
  }),
].join('\n\n');

let providerMode: 'david-zh' | 'david-en' | 'matt-zh' | 'matt-en' | 'quiz' | 'grade' = 'david-zh';

const provider = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || '{}');
  const sys = String(body.messages?.[0]?.content ?? '');
  const isReview = sys.includes('獨立的香港中學生練習復核者') || sys.includes('independent HKDSE');
  let content = DAVID_ZH;
  if (isReview) {
    content = JSON.stringify({ verdict: 'pass', reason: 'Verified clean example.' });
  } else if (providerMode === 'david-en') {
    content = DAVID_EN;
  } else if (providerMode === 'matt-zh') {
    content = MATT_LESSON_ZH;
  } else if (providerMode === 'matt-en') {
    content = MATT_LESSON_EN;
  } else if (providerMode === 'quiz') {
    content = JSON.stringify({
      contractVersion: 'learning-contract-v2',
      items: [
        {
          skillId: units[0].skills[0].id,
          kind: 'numeric',
          prompt: '解二次方程 x² − 7x + 10 = 0，填寫較大的一個根。',
          answer: '5',
          explanation: '(x − 2)(x − 5) = 0，兩根為 2 與 5，較大根為 5。',
          hint: '試試找相乘等於 10、相加等於 −7 的兩個數。',
          criterion: '寫出正確較大根 5。',
          check: { a: 1, b: -7, c: 10, root: 'larger' },
        },
        {
          skillId: units[0].skills[1].id,
          kind: 'numeric',
          prompt: '解二次方程 x² − 8x + 12 = 0，填寫較大的一個根。',
          answer: '6',
          explanation: '(x − 2)(x − 6) = 0，兩根為 2 與 6，較大根為 6。',
          hint: '試試找相乘等於 12、相加等於 −8 的兩個整數。',
          criterion: '寫出正確較大根 6。',
          check: { a: 1, b: -8, c: 12, root: 'larger' },
        },
      ],
    });
  } else if (providerMode === 'grade') {
    const items = JSON.parse(body.messages?.[1]?.content ?? '[]');
    content = JSON.stringify({
      feedback: items.map((row: any, idx: number) => ({
        itemId: row.item.id,
        score: idx === 0 ? 100 : 35,
        verdict: idx === 0 ? 'correct' : 'incorrect',
        text: idx === 0 ? '分解與取較大根完全正確！' : '判別式符號出錯：忘記對 b = −8 加括號平方。',
        reason: idx === 0 ? 'Exact match.' : 'Sign error in discriminant.',
      })),
    });
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
  }));
});

await new Promise<void>(r => provider.listen(0, '127.0.0.1', r));
const providerPort = (provider.address() as { port: number }).port;

const app = createPilot({
  database: ':memory:',
  staticDir: resolve('dist-pilot'),
  allowSetup: false,
});

const port = Number(process.env.GUIDE_CAPTURE_PORT ?? 4188);
await app.listen(port, '127.0.0.1');
const base = `http://127.0.0.1:${port}`;

// Seed synthetic developer + Free student + Pro student with ephemeral per-run credentials
const ephemeralPass = `Guide-${randomBytes(8).toString('hex')}`;
const dev = await app.store.createUser('guide_dev', ephemeralPass, 'Alex Wong', 'developer');
const freeStudent = await app.store.createUser('guide_free', ephemeralPass, '林子軒', 'student');
const proStudent = await app.store.createUser('guide_pro', ephemeralPass, '陳思晴', 'student');

const devCookie = 'hokse_session=' + await app.store.session(dev);
const freeCookie = 'hokse_session=' + await app.store.session(freeStudent);
const proCookie = 'hokse_session=' + await app.store.session(proStudent);

// Configure mock AI provider so chat, Matt PDF lessons, and quizzes work natively
await app.store.putModel({
  id: 'default',
  name: 'Guide Demo AI',
  baseUrl: `http://127.0.0.1:${providerPort}/v1`,
  secret: '',
  model: defaults[1],
  protocol: 'openai-chat',
  enabled: true,
});

async function call(path: string, method = 'GET', body?: unknown, cookie = proCookie) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      Cookie: cookie,
      'X-Hokse-Client': '1',
      'X-Hokse-Request-ID': crypto.randomUUID(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  return data;
}

// Accept terms for all synthetic accounts so TermsUpdateGateModal doesn't block screenshots
for (const c of [devCookie, freeCookie, proCookie]) {
  await call('/me/consent', 'PUT', { acceptTermsVersion: CURRENT_TERMS_VERSION, sharePartnerChats: true }, c);
}

// Upgrade guide_pro to Pro via official simulated checkout (creates realistic order + carryover!)
const order = await call('/billing/orders', 'POST', { target: 'Pro', requestId: crypto.randomUUID() }, proCookie);
await call(`/billing/orders/${order.id}/pay`, 'POST', { channel: 'mock-fps' }, proCookie);

// Seed profile, subjects, grades, university goals & calendar tasks for guide_pro
const boot = await call('/bootstrap', 'GET', undefined, proCookie);
const today = boot.profile.date;
await call('/profile', 'PATCH', {
  name: '陳思晴',
  year: 2028,
  subjects: ['maths', 'eng', 'chi', 'chem', 'econ'],
  dailyMinutes: [90, 90, 90, 90, 90, 150, 150],
  grades: { maths: '4', eng: '4', chi: '4', chem: '4', econ: '4' },
  targetGrades: { maths: '5*', eng: '5', chi: '5', chem: '5', econ: '5' },
  primaryProgramme: 'JS6901',
  backupProgrammes: ['JS4601', 'JS5300'],
}, proCookie);

// Add realistic today tasks & upcoming calendar tasks
await call('/tasks', 'POST', {
  title: '因式分解 Part 1–4 獨立檢核',
  subjectId: 'maths',
  topicId: 'maths-factorisation',
  date: today,
  start: '16:30',
  minutes: 25,
  kind: 'practice',
}, proCookie);
await call('/tasks', 'POST', {
  title: '二次方程判別式錯題復測',
  subjectId: 'maths',
  topicId: 'maths-quadratic',
  date: today,
  start: '17:15',
  minutes: 20,
  kind: 'review',
}, proCookie);
await call('/tasks', 'POST', {
  title: '英文閱讀推斷練習',
  subjectId: 'eng',
  topicId: 'eng-inference',
  date: today,
  start: '19:30',
  minutes: 30,
  kind: 'study',
}, proCookie);

// Seed a rich David ZH chat, David EN chat, and Matt PDF lessons
providerMode = 'david-zh';
const davidZh = await call('/chats', 'POST', { topicId: 'maths-quadratic', mode: 'explain', tutorId: 'david', title: '二次方程因式分解與拋物線' }, proCookie);
await call(`/chats/${davidZh.id}/messages`, 'POST', { content: '請幫我解釋點樣用圖像理解 x² - 4x + 3 = 0 嘅解，再出 1 題比我練。', requestId: crypto.randomUUID() }, proCookie);

providerMode = 'david-en';
const davidEn = await call('/chats', 'POST', { topicId: 'maths-quadratic', mode: 'explain', tutorId: 'david', title: 'Quadratic Roots & Graph' }, proCookie);
await call(`/chats/${davidEn.id}/messages`, 'POST', { content: 'Explain how the graph of x² - 4x + 3 = 0 connects to its roots, and give me a quick practice question.', requestId: crypto.randomUUID() }, proCookie);

providerMode = 'matt-zh';
const mattZh = await call('/chats', 'POST', { topicId: 'maths-quadratic', mode: 'explain', tutorId: 'matt', title: 'Matt 課件：二次方程解法選擇' }, proCookie);
await call(`/chats/${mattZh.id}/messages`, 'POST', { content: '請幫我製作第一課 PDF 課件，重點講點樣揀解法同判別式。', requestId: crypto.randomUUID() }, proCookie);

providerMode = 'matt-en';
const mattEn = await call('/chats', 'POST', { topicId: 'maths-quadratic', mode: 'explain', tutorId: 'matt', title: 'Matt Lesson: Quadratic Methods' }, proCookie);
await call(`/chats/${mattEn.id}/messages`, 'POST', { content: 'Create Lesson 1 PDF covering method choice and discriminant.', requestId: crypto.randomUUID() }, proCookie);

// Seed realistic submitted quizzes + weak-spot attempts & mistakes (triggers Pro Weak-Spot Report + Starbean Alert!)
const q1 = await call('/studio/quizzes', 'POST', { subjectId: 'maths', count: 2, purpose: 'assessment', source: 'fixed', requestId: crypto.randomUUID() }, proCookie);
await call(`/studio/quizzes/${q1.id}/answers`, 'PUT', {
  answers: {
    [q1.questions[0].id]: { value: '5', steps: 'x=5' },
    [q1.questions[1].id]: { value: '-99', steps: 'not sure about sign' },
  },
}, proCookie);
await call(`/studio/quizzes/${q1.id}/hints/${q1.questions[1].id}`, 'POST', {}, proCookie).catch(() => {});
providerMode = 'grade';
await call(`/studio/quizzes/${q1.id}/submit`, 'POST', {}, proCookie);

// Second low attempt to trigger threshold-based Pro weak-spot alert
const q2 = await call('/studio/quizzes', 'POST', { subjectId: 'maths', count: 2, purpose: 'assessment', source: 'fixed', requestId: crypto.randomUUID() }, proCookie);
await call(`/studio/quizzes/${q2.id}/answers`, 'PUT', {
  answers: {
    [q2.questions[0].id]: { value: '-88', steps: 'missed negative sign' },
    [q2.questions[1].id]: { value: '-77', steps: 'forgot discriminant condition' },
  },
}, proCookie);
await call(`/studio/quizzes/${q2.id}/hints/${q2.questions[0].id}`, 'POST', {}, proCookie).catch(() => {});
await call(`/studio/quizzes/${q2.id}/submit`, 'POST', {}, proCookie);

// Seed a Pro 48h boosted forum post + a second discussion post
await call('/forum/profile', 'PUT', { nickname: '星豆同學' }, proCookie);
await call('/forum/posts', 'POST', {
  boardId: 'sub-maths',
  flair: 'help',
  title: '含參數二次方程 Δ ≥ 0 同係數 a ≠ 0 經常漏寫點記最穩？',
  body: '做 2022 卷二 Q7 發現自己成日只記得計 $\\Delta = b^2 - 4ac \\ge 0$，但忘記題目寫明「二次方程」要補 $k \\neq 0$。大家有冇口訣？',
  anonymous: false,
  visibility: 'public',
  poll: {
    question: '你平時用哪招防止漏寫 a ≠ 0？',
    options: ['寫題目前先圈「二次方程」', '把 a ≠ 0 寫在紙頂當檢查表', '做完代返原式驗一次'],
  },
}, proCookie);

// Set provider back to quiz/david-zh for interactive clicks during capture
providerMode = 'david-zh';

const manifest = {
  base,
  davidZhId: davidZh.id,
  davidEnId: davidEn.id,
  mattZhId: mattZh.id,
  mattEnId: mattEn.id,
  submittedQuizId: q1.id,
  accounts: {
    pro: { username: 'guide_pro', password: ephemeralPass },
    free: { username: 'guide_free', password: ephemeralPass },
    dev: { username: 'guide_dev', password: ephemeralPass },
  },
};

console.log('GUIDE_CAPTURE_READY ' + JSON.stringify(manifest));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => {
      provider.close(() => process.exit(0));
    });
  });
}
