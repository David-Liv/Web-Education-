export type GuidedMode = 'warmup' | 'check';

export interface FactorisationVariant {
  id: string;
  kind: 'factor' | 'choice';
  promptZh: string;
  promptEn: string;
  contextZh?: string;
  contextEn?: string;
  options?: string[];
  answer: string;
  answerTex: string;
  allowedVars?: string[];
  hintsZh: string[];
  hintsEn: string[];
  stepsZh: string[];
  stepsEn: string[];
}

export interface GuidedItemState {
  itemId: string;
  topicId: string;
  partId: string;
  mode: GuidedMode;
  variantIndex: number;
  attempts: number;
  solved: boolean;
  independent: boolean;
  assistedCurrent: boolean;
  wrongCurrent: boolean;
  lastAnswer?: string;
  updatedAt: string;
}

export interface FactorisationCheckResult {
  verdict: 'correct' | 'partly-correct' | 'incorrect' | 'invalid';
  code:
    | 'ok'
    | 'empty'
    | 'syntax'
    | 'fraction-or-decimal'
    | 'wrong-variable'
    | 'unfactorised'
    | 'nested-brackets'
    | 'missing-scalar-gcf'
    | 'missing-var-gcf'
    | 'incomplete-factors'
    | 'unsimplified-terms'
    | 'sign-error'
    | 'wrong-choice'
    | 'not-equivalent';
  messageZh: string;
  messageEn: string;
}

type Token =
  | { kind: 'num'; value: number; raw: string }
  | { kind: 'var'; name: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '^' }
  | { kind: 'lparen'; bracket: '(' | '[' }
  | { kind: 'rparen'; bracket: ')' | ']' };

type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'neg'; expr: Expr }
  | { kind: 'pow'; base: Expr; exp: number }
  | { kind: 'mul'; factors: Expr[] }
  | { kind: 'add'; terms: { sign: 1 | -1; expr: Expr }[] };

const TEST_VECTORS: readonly (readonly number[])[] = [
  [7, 11, 13, 17, 19, 23],
  [-5, 13, -3, 19, 7, -11],
  [3, -7, 11, -13, 17, 5],
  [11, 5, -17, 7, -3, 13],
  [-13, -3, 5, 19, -7, 11],
  [2, 29, -7, 11, 5, -17],
];

function normalizeInput(raw: string): string {
  return raw
    .trim()
    .replace(/^\$+/, '')
    .replace(/\$+$/, '')
    .trim()
    .replace(/^(?:答案(?:是|為)?|answer(?:\s*is)?)\s*[:：=]?\s*/i, '')
    .replace(/^[=＝]\s*/, '')
    .replace(/[−–—－]/g, '-')
    .replace(/＋/g, '+')
    .replace(/[×·⋅＊]/g, '*')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[｛{]/g, '[')
    .replace(/[｝}]/g, ']')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4')
    .replace(/⁵/g, '^5')
    .replace(/\\left\s*/g, '')
    .replace(/\\right\s*/g, '')
    .replace(/\\cdot\b/g, '*')
    .replace(/\\times\b/g, '*')
    .replace(/\s+/g, '');
}

function tokenize(clean: string): { tokens?: Token[]; error?: FactorisationCheckResult['code'] } {
  if (!clean || clean.length > 240) return { error: clean ? 'syntax' : 'empty' };
  if (/[\/÷.]/.test(clean) || /\\frac\b/.test(clean)) {
    return { error: 'fraction-or-decimal' };
  }
  const rawTokens: Token[] = [];
  let i = 0;
  while (i < clean.length) {
    const ch = clean[i];
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < clean.length && clean[j] >= '0' && clean[j] <= '9') j++;
      const slice = clean.slice(i, j);
      const val = Number(slice);
      if (!Number.isSafeInteger(val) || val > 1_000_000) return { error: 'syntax' };
      rawTokens.push({ kind: 'num', value: val, raw: slice });
      i = j;
      continue;
    }
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
      rawTokens.push({ kind: 'var', name: ch.toLowerCase() });
      i++;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '^') {
      rawTokens.push({ kind: 'op', op: ch });
      i++;
      continue;
    }
    if (ch === '(' || ch === '[') {
      rawTokens.push({ kind: 'lparen', bracket: ch });
      i++;
      continue;
    }
    if (ch === ')' || ch === ']') {
      rawTokens.push({ kind: 'rparen', bracket: ch });
      i++;
      continue;
    }
    return { error: 'syntax' };
  }

  // Insert implicit multiplication between adjacent atoms/groups:
  // num|var|rparen followed by var|lparen, or rparen|var followed by num (except after ^)
  const tokens: Token[] = [];
  for (let k = 0; k < rawTokens.length; k++) {
    const cur = rawTokens[k];
    const prev = tokens[tokens.length - 1];
    if (prev) {
      const prevIsAtomEnd = prev.kind === 'num' || prev.kind === 'var' || prev.kind === 'rparen';
      const curStartsFactor = cur.kind === 'var' || cur.kind === 'lparen' || (cur.kind === 'num' && prev.kind !== 'num');
      if (prevIsAtomEnd && curStartsFactor) {
        tokens.push({ kind: 'op', op: '*' });
      }
    }
    tokens.push(cur);
  }
  return { tokens };
}

export function parsePolynomial(raw: string): { ast?: Expr; vars: Set<string>; error?: FactorisationCheckResult['code'] } {
  const clean = normalizeInput(raw);
  if (!clean) return { vars: new Set(), error: 'empty' };
  const tok = tokenize(clean);
  if (tok.error || !tok.tokens) return { vars: new Set(), error: tok.error ?? 'syntax' };
  const tokens = tok.tokens;
  const vars = new Set<string>();
  for (const t of tokens) if (t.kind === 'var') vars.add(t.name);

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseAdd(): Expr | null {
    let firstSign: 1 | -1 = 1;
    const firstTok = peek();
    if (firstTok?.kind === 'op' && (firstTok.op === '+' || firstTok.op === '-')) {
      consume();
      firstSign = firstTok.op === '-' ? -1 : 1;
    }
    const first = parseMul();
    if (!first) return null;
    const terms: { sign: 1 | -1; expr: Expr }[] = [{ sign: firstSign, expr: first }];
    while (true) {
      const next = peek();
      if (next?.kind === 'op' && (next.op === '+' || next.op === '-')) {
        consume();
        const rhs = parseMul();
        if (!rhs) return null;
        terms.push({ sign: next.op === '-' ? -1 : 1, expr: rhs });
      } else {
        break;
      }
    }
    if (terms.length === 1) {
      return terms[0].sign === -1 ? { kind: 'neg', expr: terms[0].expr } : terms[0].expr;
    }
    return { kind: 'add', terms };
  }

  function parseMul(): Expr | null {
    const first = parseUnary();
    if (!first) return null;
    const factors: Expr[] = [first];
    while (true) {
      const next = peek();
      if (next?.kind === 'op' && next.op === '*') {
        consume();
        const rhs = parseUnary();
        if (!rhs) return null;
        factors.push(rhs);
      } else {
        break;
      }
    }
    return factors.length === 1 ? factors[0] : { kind: 'mul', factors };
  }

  function parseUnary(): Expr | null {
    const t = peek();
    if (t?.kind === 'op' && (t.op === '+' || t.op === '-')) {
      consume();
      const sub = parseUnary();
      if (!sub) return null;
      return t.op === '-' ? { kind: 'neg', expr: sub } : sub;
    }
    return parsePow();
  }

  function parsePow(): Expr | null {
    const base = parsePrimary();
    if (!base) return null;
    const next = peek();
    if (next?.kind === 'op' && next.op === '^') {
      consume();
      const expTok = consume();
      if (!expTok || expTok.kind !== 'num' || !Number.isInteger(expTok.value) || expTok.value < 0 || expTok.value > 12) {
        return null;
      }
      return { kind: 'pow', base, exp: expTok.value };
    }
    return base;
  }

  function parsePrimary(): Expr | null {
    const t = consume();
    if (!t) return null;
    if (t.kind === 'num') return { kind: 'num', value: t.value };
    if (t.kind === 'var') return { kind: 'var', name: t.name };
    if (t.kind === 'lparen') {
      const inner = parseAdd();
      const close = consume();
      if (!inner || !close || close.kind !== 'rparen') return null;
      return inner;
    }
    return null;
  }

  const ast = parseAdd();
  if (!ast || pos !== tokens.length) return { vars, error: 'syntax' };
  return { ast, vars };
}

export function evaluateAst(expr: Expr, env: Record<string, number>): number {
  switch (expr.kind) {
    case 'num':
      return expr.value;
    case 'var':
      return env[expr.name] ?? 0;
    case 'neg':
      return -evaluateAst(expr.expr, env);
    case 'pow':
      return Math.pow(evaluateAst(expr.base, env), expr.exp);
    case 'mul':
      return expr.factors.reduce((acc, f) => acc * evaluateAst(f, env), 1);
    case 'add':
      return expr.terms.reduce((acc, t) => acc + t.sign * evaluateAst(t.expr, env), 0);
  }
}

function areEquivalent(a: Expr, b: Expr, varList: string[], sign: 1 | -1 = 1): boolean {
  for (const vec of TEST_VECTORS) {
    const env: Record<string, number> = {};
    varList.forEach((v, idx) => {
      env[v] = vec[idx % vec.length] + Math.floor(idx / vec.length) * 31;
    });
    const va = evaluateAst(a, env);
    const vb = sign * evaluateAst(b, env);
    if (!Number.isFinite(va) || !Number.isFinite(vb) || Math.abs(va - vb) > 1e-6) {
      return false;
    }
  }
  return true;
}

interface DecomposedFactors {
  scalar: number;
  vars: Record<string, number>;
  polyFactors: Expr[];
  hasNestedAddInFactor: boolean;
  hasDuplicateMonomialTermsInFactor: boolean;
}

function monomialSignature(expr: Expr): string | null {
  // Returns sorted variable power signature like "a^2*b^1" if expr is a pure monomial c * vars, else null
  const vars: Record<string, number> = {};
  function walk(node: Expr): boolean {
    if (node.kind === 'num') return true;
    if (node.kind === 'var') {
      vars[node.name] = (vars[node.name] ?? 0) + 1;
      return true;
    }
    if (node.kind === 'neg') return walk(node.expr);
    if (node.kind === 'pow') {
      if (node.base.kind !== 'var') return false;
      vars[node.base.name] = (vars[node.base.name] ?? 0) + node.exp;
      return true;
    }
    if (node.kind === 'mul') return node.factors.every(walk);
    return false;
  }
  if (!walk(expr)) return null;
  return Object.entries(vars)
    .filter(([, exp]) => exp > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([v, exp]) => `${v}^${exp}`)
    .join('*');
}

function inspectPolyFactor(expr: Expr): { nestedAdd: boolean; uncombinedTerms: boolean } {
  if (expr.kind !== 'add') return { nestedAdd: false, uncombinedTerms: false };
  let nestedAdd = false;
  const signatures = new Set<string>();
  let uncombinedTerms = false;

  function containsAdd(node: Expr): boolean {
    if (node.kind === 'add') return true;
    if (node.kind === 'neg') return containsAdd(node.expr);
    if (node.kind === 'pow') return containsAdd(node.base);
    if (node.kind === 'mul') return node.factors.some(containsAdd);
    return false;
  }

  for (const term of expr.terms) {
    if (containsAdd(term.expr)) nestedAdd = true;
    const sig = monomialSignature(term.expr);
    if (sig !== null) {
      if (signatures.has(sig)) uncombinedTerms = true;
      signatures.add(sig);
    }
  }
  return { nestedAdd, uncombinedTerms };
}

function decomposeFactors(root: Expr): DecomposedFactors {
  let scalar = 1;
  const vars: Record<string, number> = {};
  const polyFactors: Expr[] = [];
  let hasNestedAddInFactor = false;
  let hasDuplicateMonomialTermsInFactor = false;

  function visit(node: Expr, mult: number) {
    if (mult === 0) return;
    switch (node.kind) {
      case 'num':
        scalar *= Math.pow(node.value, mult);
        return;
      case 'var':
        vars[node.name] = (vars[node.name] ?? 0) + mult;
        return;
      case 'neg':
        if (mult % 2 === 1) scalar *= -1;
        visit(node.expr, mult);
        return;
      case 'pow':
        visit(node.base, mult * node.exp);
        return;
      case 'mul':
        for (const f of node.factors) visit(f, mult);
        return;
      case 'add': {
        const info = inspectPolyFactor(node);
        if (info.nestedAdd) hasNestedAddInFactor = true;
        if (info.uncombinedTerms) hasDuplicateMonomialTermsInFactor = true;
        for (let k = 0; k < mult; k++) polyFactors.push(node);
        return;
      }
    }
  }

  visit(root, 1);
  return { scalar, vars, polyFactors, hasNestedAddInFactor, hasDuplicateMonomialTermsInFactor };
}

function totalVarDegree(vars: Record<string, number>): number {
  return Object.values(vars).reduce((acc, n) => acc + n, 0);
}

function matchPolyFactorsUpToSign(studentFactors: Expr[], refFactors: Expr[], varList: string[]): boolean {
  if (studentFactors.length !== refFactors.length) return false;
  const used = new Array<boolean>(refFactors.length).fill(false);
  for (const sf of studentFactors) {
    let matched = false;
    for (let j = 0; j < refFactors.length; j++) {
      if (used[j]) continue;
      if (areEquivalent(sf, refFactors[j], varList, 1) || areEquivalent(sf, refFactors[j], varList, -1)) {
        used[j] = true;
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

export function checkFactorisationAnswer(variant: FactorisationVariant, rawAnswer: string): FactorisationCheckResult {
  const trimmed = rawAnswer.trim();
  if (!trimmed) {
    return {
      verdict: 'invalid',
      code: 'empty',
      messageZh: '請先輸入你的答案再核對。',
      messageEn: 'Enter your answer before checking.',
    };
  }

  if (variant.kind === 'choice') {
    const letter = trimmed.toUpperCase().replace(/^[(\[]?([A-D])[)\].]?$/, '$1');
    if (!/^[A-D]$/.test(letter)) {
      return {
        verdict: 'invalid',
        code: 'syntax',
        messageZh: '請選擇 A、B、C 或 D。',
        messageEn: 'Please choose option A, B, C or D.',
      };
    }
    if (letter === variant.answer.toUpperCase()) {
      return {
        verdict: 'correct',
        code: 'ok',
        messageZh: '答對了！分解結構與正負號完全正確。',
        messageEn: 'Correct! Both the factor structure and signs match.',
      };
    }
    return {
      verdict: 'incorrect',
      code: 'wrong-choice',
      messageZh: '這個選項不正確。留意抽出負號或拆平方差括號時的正負號，亦可用非平凡質數（如 7、11）代入驗算。',
      messageEn: 'That option is not correct. Check the signs when grouping or expanding brackets, or verify by substituting distinct primes such as 7 and 11.',
    };
  }

  const refParsed = parsePolynomial(variant.answer);
  if (!refParsed.ast) {
    throw new Error(`Invalid reference answer in factorisation bank: ${variant.id}`);
  }
  const allowed = variant.allowedVars?.length
    ? new Set(variant.allowedVars.map(v => v.toLowerCase()))
    : refParsed.vars;

  const studentParsed = parsePolynomial(trimmed);
  if (studentParsed.error === 'fraction-or-decimal') {
    return {
      verdict: 'invalid',
      code: 'fraction-or-decimal',
      messageZh: '因式分解請寫成整係數括號（例如根為 3/2 時反推為 (2x − 3)，不要保留分數或小數）。',
      messageEn: 'Write factors with integer coefficients (for example, reconstruct root 3/2 as (2x − 3) rather than leaving fractions or decimals).',
    };
  }
  if (studentParsed.error || !studentParsed.ast) {
    return {
      verdict: 'invalid',
      code: 'syntax',
      messageZh: '未能讀取這個代數式。請檢查括號是否成對，並使用如 6r(2s + 1) 或 (2x - 3)(x + 4) 的寫法。',
      messageEn: 'Could not parse this expression. Check matching brackets and write factors such as 6r(2s + 1) or (2x - 3)(x + 4).',
    };
  }

  for (const v of studentParsed.vars) {
    if (!allowed.has(v)) {
      const list = [...allowed].join(', ');
      return {
        verdict: 'invalid',
        code: 'wrong-variable',
        messageZh: `請使用題目指定的變數字母（${list}），留意不要漏寫或寫錯第二個變數。`,
        messageEn: `Use the variables in the question (${list}) — check that no variable was swapped.`,
      };
    }
  }

  const varList = [...new Set([...allowed, ...studentParsed.vars])].sort();
  if (!areEquivalent(studentParsed.ast, refParsed.ast, varList, 1)) {
    if (areEquivalent(studentParsed.ast, refParsed.ast, varList, -1)) {
      return {
        verdict: 'incorrect',
        code: 'sign-error',
        messageZh: '代數大小相符，但整體正負號相反！請檢查抽負號或拆括號時是否漏了變號。',
        messageEn: 'Close — your expression has the exact opposite sign! Check sign changes when extracting a minus sign or removing brackets.',
      };
    }
    const missingSecondVar = allowed.size > 1 && studentParsed.vars.size < allowed.size;
    if (missingSecondVar) {
      const missing = [...allowed].filter(v => !studentParsed.vars.has(v)).join(', ');
      return {
        verdict: 'incorrect',
        code: 'not-equivalent',
        messageZh: `展開後與原式不相等——留意你的答案沒有包含變數 ${missing}（雙變數題記得在常數項附上第二個變數！）。`,
        messageEn: `Not algebraically equal to the prompt — notice variable ${missing} is missing (remember to attach the second variable in two-variable quadratics!).`,
      };
    }
    return {
      verdict: 'incorrect',
      code: 'not-equivalent',
      messageZh: '展開後與原式不相等。建議把括號乘開核對首尾項與中間項的正負號（例如負號乘入括號時每一項都要變號）。',
      messageEn: 'Expanding your answer does not match the original expression. Multiply out your brackets to check middle terms and sign distribution.',
    };
  }

  // Algebraically equivalent! Now verify complete factorisation structure:
  const sDec = decomposeFactors(studentParsed.ast);
  const rDec = decomposeFactors(refParsed.ast);

  const sFactorCount = (Math.abs(sDec.scalar) > 1 ? 1 : 0) + totalVarDegree(sDec.vars) + sDec.polyFactors.length;
  if (sDec.polyFactors.length === 1 && Math.abs(sDec.scalar) === 1 && totalVarDegree(sDec.vars) === 0 && sFactorCount === 1) {
    return {
      verdict: 'partly-correct',
      code: 'unfactorised',
      messageZh: '代數值與原題相等，但尚未寫成因式相乘形式！請提取公因式或分解成括號乘積。',
      messageEn: 'Algebraically equal to the original expression, but not yet written as a product of factors!',
    };
  }

  if (sDec.hasNestedAddInFactor) {
    return {
      verdict: 'partly-correct',
      code: 'nested-brackets',
      messageZh: '中括號結構正確！請把括號內的小括號拆開並化簡（特別留意減號乘入括號時每一項都要變號）。',
      messageEn: 'Good setup! Now remove the inner brackets and simplify each factor (watch the sign change on every term after a minus sign).',
    };
  }

  if (sDec.hasDuplicateMonomialTermsInFactor) {
    return {
      verdict: 'partly-correct',
      code: 'unsimplified-terms',
      messageZh: '方向正確，但括號內仍有同類項尚未合併，請先化簡括號內的同類項。',
      messageEn: 'Right track, but like terms remain inside a bracket — combine them to finish.',
    };
  }

  if (Math.abs(sDec.scalar) < Math.abs(rDec.scalar)) {
    return {
      verdict: 'partly-correct',
      code: 'missing-scalar-gcf',
      messageZh: '很接近了！括號內仍有數字公因數未提取到最前面，請檢查每個括號能否再抽出常數公因數。',
      messageEn: 'Almost there! A numerical common factor still remains inside a bracket — extract it to the front.',
    };
  }

  for (const [v, exp] of Object.entries(rDec.vars)) {
    if ((sDec.vars[v] ?? 0) < exp) {
      return {
        verdict: 'partly-correct',
        code: 'missing-var-gcf',
        messageZh: `方向正確，但括號內仍有共同字母 ${v} 可以繼續提取到最前面！`,
        messageEn: `Good step, but common variable factor ${v} can still be extracted from the bracket!`,
      };
    }
  }

  if (sDec.polyFactors.length < rDec.polyFactors.length || !matchPolyFactorsUpToSign(sDec.polyFactors, rDec.polyFactors, varList)) {
    return {
      verdict: 'partly-correct',
      code: 'incomplete-factors',
      messageZh: '已成功分解一部分，但括號內的多項式仍可繼續因式分解（留意平方差、立方公式或二次三項式）！',
      messageEn: 'Partially factorised! One of the brackets can still be factorised further (check for difference of squares, cubics or quadratics).',
    };
  }

  return {
    verdict: 'correct',
    code: 'ok',
    messageZh: '完全正確！所有公因式與括號均已分解至最簡。',
    messageEn: 'Spot on! Every common factor and bracket is completely factorised.',
  };
}

export interface GuidedActionPayload {
  topicId: string;
  partId: string;
  itemId: string;
  mode: GuidedMode;
  action: 'assist' | 'submit' | 'next-variant';
  answer?: string;
  variantCount: number;
  variant: FactorisationVariant;
}

export function applyGuidedAction(
  store: Record<string, GuidedItemState>,
  payload: GuidedActionPayload,
  nowIso = new Date().toISOString(),
): { state: GuidedItemState; check?: FactorisationCheckResult } {
  const existing = store[payload.itemId];
  const state: GuidedItemState = existing
    ? { ...existing }
    : {
        itemId: payload.itemId,
        topicId: payload.topicId,
        partId: payload.partId,
        mode: payload.mode,
        variantIndex: 0,
        attempts: 0,
        solved: false,
        independent: false,
        assistedCurrent: false,
        wrongCurrent: false,
        updatedAt: nowIso,
      };

  if (payload.action === 'assist') {
    state.assistedCurrent = true;
    state.updatedAt = nowIso;
    store[payload.itemId] = state;
    return { state };
  }

  if (payload.action === 'next-variant') {
    state.variantIndex = (state.variantIndex + 1) % Math.max(1, payload.variantCount);
    state.assistedCurrent = false;
    state.wrongCurrent = false;
    state.lastAnswer = '';
    state.updatedAt = nowIso;
    store[payload.itemId] = state;
    return { state };
  }

  const check = checkFactorisationAnswer(payload.variant, payload.answer ?? '');
  state.lastAnswer = (payload.answer ?? '').slice(0, 240);
  state.updatedAt = nowIso;

  if (check.verdict === 'invalid') {
    store[payload.itemId] = state;
    return { state, check };
  }

  state.attempts += 1;
  if (check.verdict === 'correct') {
    state.solved = true;
    if (payload.mode === 'check' && !state.assistedCurrent && !state.wrongCurrent) {
      state.independent = true;
    }
  } else {
    state.wrongCurrent = true;
  }

  store[payload.itemId] = state;
  return { state, check };
}
