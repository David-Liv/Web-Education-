import type {
  AngleUnit,
  BaseRadix,
  FractionDisplayMode,
  NumberFormatKind,
  VariableName,
} from './calculator-types.ts';

export interface Complex {
  re: number;
  im: number;
}

export class CalcError extends Error {
  code: 'Math ERROR' | 'Syntax ERROR' | 'Stack ERROR' | 'Arg ERROR' | 'Mem ERROR' | 'Go ERROR';
  constructor(
    code: 'Math ERROR' | 'Syntax ERROR' | 'Stack ERROR' | 'Arg ERROR' | 'Mem ERROR' | 'Go ERROR',
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

export interface StatData {
  entries: { x: number; freq: number }[];
}

export interface StatSummary {
  n: number;
  sumX: number;
  sumX2: number;
  mean: number;
  popStd: number;
  sampleStd: number;
}

export interface EvalContext {
  angleUnit: AngleUnit;
  complexMode: boolean;
  variables: Record<VariableName, number>;
  complexVariables?: Partial<Record<VariableName, Complex>>;
  ans: Complex;
  stats?: StatData;
  formatKind?: NumberFormatKind;
  formatDigits?: number;
  onAssign?: (name: VariableName, val: Complex) => void;
  onCoordResult?: (kind: 'Pol' | 'Rec', first: number, second: number) => void;
}

const EPS = 1e-12;

export function cReal(re: number): Complex {
  return { re: Object.is(re, -0) ? 0 : re, im: 0 };
}

export function cMake(re: number, im: number): Complex {
  const cleanRe = Math.abs(re) < 1e-14 && Math.abs(im) > 1e-9 ? 0 : Object.is(re, -0) ? 0 : re;
  const cleanIm = Math.abs(im) < 1e-13 * Math.max(1, Math.abs(re)) ? 0 : Object.is(im, -0) ? 0 : im;
  if (!Number.isFinite(cleanRe) || !Number.isFinite(cleanIm)) throw new CalcError('Math ERROR');
  return { re: cleanRe, im: cleanIm };
}

export function isReal(z: Complex): boolean {
  return Math.abs(z.im) <= 1e-12 * Math.max(1, Math.abs(z.re));
}

export function toReal(z: Complex): number {
  if (!isReal(z)) throw new CalcError('Math ERROR');
  return z.re;
}

export function cAdd(a: Complex, b: Complex): Complex {
  return cMake(a.re + b.re, a.im + b.im);
}

export function cSub(a: Complex, b: Complex): Complex {
  return cMake(a.re - b.re, a.im - b.im);
}

export function cMul(a: Complex, b: Complex): Complex {
  return cMake(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

export function cDiv(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  if (denom === 0) throw new CalcError('Math ERROR');
  return cMake((a.re * b.re + a.im * b.im) / denom, (a.im * b.re - a.re * b.im) / denom);
}

export function cAbs(a: Complex): number {
  return Math.hypot(a.re, a.im);
}

export function cArgRad(a: Complex): number {
  if (a.re === 0 && a.im === 0) return 0;
  return Math.atan2(a.im, a.re);
}

export function cConjg(a: Complex): Complex {
  return cMake(a.re, -a.im);
}

export function cSqrt(a: Complex, complexMode: boolean): Complex {
  if (isReal(a)) {
    if (a.re >= 0) return cReal(Math.sqrt(a.re));
    if (!complexMode) throw new CalcError('Math ERROR');
    return cMake(0, Math.sqrt(-a.re));
  }
  const r = cAbs(a);
  const theta = cArgRad(a);
  return cMake(Math.sqrt(r) * Math.cos(theta / 2), Math.sqrt(r) * Math.sin(theta / 2));
}

export function cExp(a: Complex): Complex {
  const er = Math.exp(a.re);
  return cMake(er * Math.cos(a.im), er * Math.sin(a.im));
}

export function cLn(a: Complex, complexMode: boolean): Complex {
  if (isReal(a)) {
    if (a.re > 0) return cReal(Math.log(a.re));
    if (a.re === 0) throw new CalcError('Math ERROR');
    if (!complexMode) throw new CalcError('Math ERROR');
  }
  const r = cAbs(a);
  if (r === 0) throw new CalcError('Math ERROR');
  return cMake(Math.log(r), cArgRad(a));
}

export function cPow(base: Complex, exp: Complex, complexMode: boolean): Complex {
  if (isReal(base) && isReal(exp)) {
    const a = base.re;
    const b = exp.re;
    if (a === 0 && b === 0) return cReal(1);
    if (a === 0 && b < 0) throw new CalcError('Math ERROR');
    if (a < 0 && !Number.isInteger(b)) {
      // Check odd denominator rational like 1/3
      const frac = toExactFraction(b, 999);
      if (frac && frac.den % 2 === 1) {
        const mag = Math.pow(-a, b);
        return cReal(frac.num % 2 === 0 ? mag : -mag);
      }
      if (!complexMode) throw new CalcError('Math ERROR');
      return cExp(cMul(exp, cLn(base, true)));
    }
    const val = Math.pow(a, b);
    if (!Number.isFinite(val)) throw new CalcError('Math ERROR');
    return cReal(val);
  }
  if (!complexMode) throw new CalcError('Math ERROR');
  if (base.re === 0 && base.im === 0) {
    if (exp.re > 0) return cReal(0);
    throw new CalcError('Math ERROR');
  }
  return cExp(cMul(exp, cLn(base, true)));
}

export function toRadians(value: number, unit: AngleUnit): number {
  if (unit === 'DEG') return (value * Math.PI) / 180;
  if (unit === 'GRA') return (value * Math.PI) / 200;
  return value;
}

export function fromRadians(value: number, unit: AngleUnit): number {
  if (unit === 'DEG') return (value * 180) / Math.PI;
  if (unit === 'GRA') return (value * 200) / Math.PI;
  return value;
}

function cleanTrig(x: number): number {
  if (Math.abs(x) < 1e-14) return 0;
  if (Math.abs(x - 1) < 1e-14) return 1;
  if (Math.abs(x + 1) < 1e-14) return -1;
  return x;
}

export function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 69) throw new CalcError('Math ERROR');
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

export function nPr(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
    throw new CalcError('Math ERROR');
  }
  let res = 1;
  for (let i = 0; i < r; i++) {
    res *= n - i;
    if (!Number.isFinite(res)) throw new CalcError('Math ERROR');
  }
  return res;
}

export function nCr(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
    throw new CalcError('Math ERROR');
  }
  const k = Math.min(r, n - r);
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = (res * (n - k + i)) / i;
    if (!Number.isFinite(res)) throw new CalcError('Math ERROR');
  }
  return Math.round(res);
}

// ---------- Exact Fraction & DMS Helpers ----------

export interface RationalFraction {
  sign: 1 | -1;
  whole: number;
  num: number;
  den: number;
  improperNum: number;
}

export function toExactFraction(value: number, maxDen = 9999): RationalFraction | null {
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) > 1e9) return null;
  const sign: 1 | -1 = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  if (Math.abs(abs - Math.round(abs)) < 1e-11) {
    const n = Math.round(abs);
    return { sign, whole: n, num: 0, den: 1, improperNum: n };
  }

  let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
  let b = abs;
  for (let iter = 0; iter < 32; iter++) {
    const a = Math.floor(b);
    const h = a * h1 + h2;
    const k = a * k1 + k2;
    if (k > maxDen) break;
    h2 = h1;
    h1 = h;
    k2 = k1;
    k1 = k;
    const approx = h1 / k1;
    if (Math.abs(approx - abs) <= 1e-10 * Math.max(1, abs)) {
      const whole = Math.floor(h1 / k1);
      const num = h1 % k1;
      return { sign, whole, num, den: k1, improperNum: h1 };
    }
    const rem = b - a;
    if (rem < 1e-13) break;
    b = 1 / rem;
  }
  return null;
}

export function formatFraction(value: number, mode: FractionDisplayMode): string | null {
  const f = toExactFraction(value);
  if (!f || f.den === 1) return null;
  const prefix = f.sign < 0 ? '-' : '';
  if (mode === 'IMPROPER' || f.whole === 0) {
    return `${prefix}${f.improperNum}⌟${f.den}`;
  }
  return `${prefix}${f.whole}⌟${f.num}⌟${f.den}`;
}

export function formatFractionPlain(value: number, mode: FractionDisplayMode): string | null {
  const f = toExactFraction(value);
  if (!f || f.den === 1) return null;
  const prefix = f.sign < 0 ? '-' : '';
  if (mode === 'IMPROPER' || f.whole === 0) {
    return `${prefix}${f.improperNum}/${f.den}`;
  }
  return `${prefix}${f.whole} ${f.num}/${f.den}`;
}

export function formatDMS(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  let deg = Math.floor(abs + 1e-12);
  const remMin = (abs - deg) * 60;
  let min = Math.floor(remMin + 1e-10);
  let sec = Number(((remMin - min) * 60).toFixed(2));
  if (sec >= 60) {
    sec -= 60;
    min += 1;
  }
  if (min >= 60) {
    min -= 60;
    deg += 1;
  }
  const secStr = Number.isInteger(sec) ? String(sec) : sec.toFixed(2).replace(/\.?0+$/, '');
  return `${sign}${deg}°${min}'${secStr}"`;
}

// ---------- SD 1-Variable Statistics ----------

export function emptyStats(): StatData {
  return { entries: [] };
}

export function addStatEntry(stats: StatData, x: number, freq = 1): StatData {
  if (!Number.isFinite(x) || !Number.isFinite(freq) || freq <= 0 || !Number.isInteger(freq)) {
    throw new CalcError('Math ERROR');
  }
  return { entries: [...stats.entries, { x, freq }] };
}

export function removeStatEntry(stats: StatData, x: number, freq = 1): StatData {
  const next = stats.entries.map(e => ({ ...e }));
  let remaining = freq;
  for (let i = next.length - 1; i >= 0 && remaining > 0; i--) {
    if (Math.abs(next[i].x - x) < 1e-12) {
      const take = Math.min(next[i].freq, remaining);
      next[i].freq -= take;
      remaining -= take;
    }
  }
  return { entries: next.filter(e => e.freq > 0) };
}

export function computeStats(stats: StatData): StatSummary {
  let n = 0;
  let sumX = 0;
  let sumX2 = 0;
  for (const e of stats.entries) {
    n += e.freq;
    sumX += e.x * e.freq;
    sumX2 += e.x * e.x * e.freq;
  }
  if (n === 0) throw new CalcError('Math ERROR');
  const mean = sumX / n;
  const popVar = Math.max(0, sumX2 / n - mean * mean);
  const sampleVar = n > 1 ? Math.max(0, (sumX2 - (sumX * sumX) / n) / (n - 1)) : NaN;
  return {
    n,
    sumX,
    sumX2,
    mean,
    popStd: Math.sqrt(popVar),
    sampleStd: Number.isFinite(sampleVar) ? Math.sqrt(sampleVar) : NaN,
  };
}

// ---------- Tokenizer & S-V.P.A.M. Parser ----------

type TokKind =
  | 'NUM'
  | 'VAR'
  | 'CONST'
  | 'FUNC'
  | 'OP'
  | 'POSTFIX'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'SEMI'
  | 'STAT_VAR';

interface Tok {
  kind: TokKind;
  value: string;
  num?: number;
}

const MULTI_TOKENS: { text: string; kind: TokKind; value: string }[] = [
  { text: 'sinh⁻¹', kind: 'FUNC', value: 'asinh' },
  { text: 'cosh⁻¹', kind: 'FUNC', value: 'acosh' },
  { text: 'tanh⁻¹', kind: 'FUNC', value: 'atanh' },
  { text: 'sin⁻¹', kind: 'FUNC', value: 'asin' },
  { text: 'cos⁻¹', kind: 'FUNC', value: 'acos' },
  { text: 'tan⁻¹', kind: 'FUNC', value: 'atan' },
  { text: 'asinh', kind: 'FUNC', value: 'asinh' },
  { text: 'acosh', kind: 'FUNC', value: 'acosh' },
  { text: 'atanh', kind: 'FUNC', value: 'atanh' },
  { text: 'asin', kind: 'FUNC', value: 'asin' },
  { text: 'acos', kind: 'FUNC', value: 'acos' },
  { text: 'atan', kind: 'FUNC', value: 'atan' },
  { text: 'sinh', kind: 'FUNC', value: 'sinh' },
  { text: 'cosh', kind: 'FUNC', value: 'cosh' },
  { text: 'tanh', kind: 'FUNC', value: 'tanh' },
  { text: 'sin', kind: 'FUNC', value: 'sin' },
  { text: 'cos', kind: 'FUNC', value: 'cos' },
  { text: 'tan', kind: 'FUNC', value: 'tan' },
  { text: 'log', kind: 'FUNC', value: 'log' },
  { text: 'ln', kind: 'FUNC', value: 'ln' },
  { text: 'Abs', kind: 'FUNC', value: 'Abs' },
  { text: 'abs', kind: 'FUNC', value: 'Abs' },
  { text: 'arg', kind: 'FUNC', value: 'arg' },
  { text: 'Conjg', kind: 'FUNC', value: 'Conjg' },
  { text: 'Pol', kind: 'FUNC', value: 'Pol' },
  { text: 'Rec', kind: 'FUNC', value: 'Rec' },
  { text: 'Rnd', kind: 'FUNC', value: 'Rnd' },
  { text: 'Ran#', kind: 'CONST', value: 'Ran#' },
  { text: 'Ans', kind: 'CONST', value: 'Ans' },
  { text: 'xσn-1', kind: 'STAT_VAR', value: 'sampleStd' },
  { text: 'xσn', kind: 'STAT_VAR', value: 'popStd' },
  { text: 'Σx²', kind: 'STAT_VAR', value: 'sumX2' },
  { text: 'Σx', kind: 'STAT_VAR', value: 'sumX' },
  { text: 'x̄', kind: 'STAT_VAR', value: 'mean' },
  { text: 'nPr', kind: 'OP', value: 'nPr' },
  { text: 'nCr', kind: 'OP', value: 'nCr' },
  { text: '10^', kind: 'FUNC', value: 'pow10' },
  { text: 'e^', kind: 'FUNC', value: 'exp' },
  { text: '∛', kind: 'FUNC', value: 'cbrt' },
  { text: '√', kind: 'FUNC', value: 'sqrt' },
  { text: 'sqrt', kind: 'FUNC', value: 'sqrt' },
  { text: '×√', kind: 'OP', value: 'xroot' },
  { text: 'x√', kind: 'OP', value: 'xroot' },
  { text: '∫', kind: 'FUNC', value: 'int' },
  { text: '⁻¹', kind: 'POSTFIX', value: 'inv' },
  { text: '²', kind: 'POSTFIX', value: 'sq' },
  { text: '³', kind: 'POSTFIX', value: 'cube' },
  { text: '(-)', kind: 'OP', value: 'NEG' },
  { text: '−', kind: 'OP', value: '-' },
  { text: '×', kind: 'OP', value: '*' },
  { text: '÷', kind: 'OP', value: '/' },
  { text: '∠', kind: 'OP', value: '∠' },
  { text: '⌟', kind: 'OP', value: '⌟' },
  { text: 'π', kind: 'CONST', value: 'pi' },
  { text: 'pi', kind: 'CONST', value: 'pi' },
];

const VAR_SET = new Set(['A', 'B', 'C', 'D', 'X', 'Y', 'M']);

function tokenize(rawInput: string): Tok[] {
  const input = rawInput.trim();
  const tokens: Tok[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Check number literal (including scientific notation via E / ᴇ)
    if (/[0-9.]/.test(ch)) {
      let j = i;
      let hasDot = false;
      while (j < input.length && (/[0-9]/.test(input[j]) || (input[j] === '.' && !hasDot))) {
        if (input[j] === '.') hasDot = true;
        j++;
      }
      if (j < input.length && (input[j] === 'ᴇ' || input[j] === 'E')) {
        let k = j + 1;
        if (k < input.length && (input[k] === '+' || input[k] === '-' || input[k] === '−')) k++;
        if (k < input.length && /[0-9]/.test(input[k])) {
          while (k < input.length && /[0-9]/.test(input[k])) k++;
          j = k;
        }
      }
      const slice = input.slice(i, j).replace(/ᴇ/g, 'e').replace(/−/g, '-');
      const num = Number(slice);
      if (!Number.isFinite(num)) throw new CalcError('Syntax ERROR');
      tokens.push({ kind: 'NUM', value: slice, num });
      i = j;
      continue;
    }

    // Multi-character tokens
    let matched = false;
    for (const spec of MULTI_TOKENS) {
      if (input.startsWith(spec.text, i)) {
        // Avoid matching 'n' inside 'ln' etc. — sorted longest-first
        tokens.push({ kind: spec.kind, value: spec.value });
        i += spec.text.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    if (ch === '(') {
      tokens.push({ kind: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'RPAREN', value: ')' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'COMMA', value: ',' });
      i++;
      continue;
    }
    if (ch === ';') {
      tokens.push({ kind: 'SEMI', value: ';' });
      i++;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
      tokens.push({ kind: 'OP', value: ch });
      i++;
      continue;
    }
    if (ch === '!' || ch === '%' || ch === '°' || ch === 'ʳ' || ch === 'ᵍ') {
      tokens.push({ kind: 'POSTFIX', value: ch });
      i++;
      continue;
    }
    if (ch === 'i') {
      tokens.push({ kind: 'CONST', value: 'i' });
      i++;
      continue;
    }
    if (ch === 'e') {
      tokens.push({ kind: 'CONST', value: 'e' });
      i++;
      continue;
    }
    if (ch === 'n') {
      tokens.push({ kind: 'STAT_VAR', value: 'n' });
      i++;
      continue;
    }
    if (VAR_SET.has(ch)) {
      tokens.push({ kind: 'VAR', value: ch });
      i++;
      continue;
    }

    throw new CalcError('Syntax ERROR', `Unexpected token "${ch}"`);
  }

  return tokens;
}

// Handle Casio DMS chains like 30°15°36° and fraction literals like 2⌟1⌟3
function collapseCompoundLiterals(tokens: Tok[]): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < tokens.length) {
    // DMS: NUM ° [NUM ° [NUM °]]
    if (
      tokens[i].kind === 'NUM' &&
      i + 1 < tokens.length &&
      tokens[i + 1].kind === 'POSTFIX' &&
      tokens[i + 1].value === '°' &&
      i + 2 < tokens.length &&
      tokens[i + 2].kind === 'NUM' &&
      i + 3 < tokens.length &&
      tokens[i + 3].kind === 'POSTFIX' &&
      tokens[i + 3].value === '°'
    ) {
      const deg = tokens[i].num!;
      const min = tokens[i + 2].num!;
      let sec = 0;
      let consumed = 4;
      if (
        i + 4 < tokens.length &&
        tokens[i + 4].kind === 'NUM' &&
        i + 5 < tokens.length &&
        tokens[i + 5].kind === 'POSTFIX' &&
        tokens[i + 5].value === '°'
      ) {
        sec = tokens[i + 4].num!;
        consumed = 6;
      }
      const decimal = deg + min / 60 + sec / 3600;
      out.push({ kind: 'NUM', value: String(decimal), num: decimal });
      i += consumed;
      continue;
    }

    // Mixed or simple fraction literal: a ⌟ b [⌟ c]
    if (
      tokens[i].kind === 'NUM' &&
      i + 2 < tokens.length &&
      tokens[i + 1].kind === 'OP' &&
      tokens[i + 1].value === '⌟' &&
      tokens[i + 2].kind === 'NUM'
    ) {
      const a = tokens[i].num!;
      const b = tokens[i + 2].num!;
      if (
        i + 4 < tokens.length &&
        tokens[i + 3].kind === 'OP' &&
        tokens[i + 3].value === '⌟' &&
        tokens[i + 4].kind === 'NUM'
      ) {
        const c = tokens[i + 4].num!;
        if (c === 0) throw new CalcError('Math ERROR');
        const val = a + b / c;
        out.push({ kind: 'NUM', value: String(val), num: val });
        i += 5;
        continue;
      }
      if (b === 0) throw new CalcError('Math ERROR');
      const val = a / b;
      out.push({ kind: 'NUM', value: String(val), num: val });
      i += 3;
      continue;
    }

    out.push(tokens[i]);
    i++;
  }
  return out;
}

// Extract raw sub-expression for ∫(expr, a, b) and d/dx(expr, x0) before normal token evaluation
function evalCalculusCalls(input: string, ctx: EvalContext): string {
  let result = input;
  let guard = 0;
  while ((result.includes('∫(') || result.includes('d/dx(')) && guard++ < 8) {
    const intPos = result.indexOf('∫(');
    const diffPos = result.indexOf('d/dx(');
    const isDiff = diffPos !== -1 && (intPos === -1 || diffPos < intPos);
    const start = isDiff ? diffPos : intPos;
    const prefixLen = isDiff ? 5 : 2;
    let depth = 0;
    let end = -1;
    const commas: number[] = [];
    for (let i = start + prefixLen - 1; i < result.length; i++) {
      const ch = result[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      } else if (ch === ',' && depth === 1) {
        commas.push(i);
      }
    }
    if (isDiff) {
      if (end === -1 || commas.length < 1) throw new CalcError('Syntax ERROR');
      const exprStr = result.slice(start + prefixLen, commas[0]);
      const xStr = result.slice(commas[0] + 1, commas.length > 1 ? commas[1] : end);
      const x0 = toReal(evaluateExpression(xStr, ctx));
      const derivVal = numericalDerivative(exprStr, x0, ctx);
      result = result.slice(0, start) + `(${derivVal})` + result.slice(end + 1);
    } else {
      if (end === -1 || commas.length < 2) throw new CalcError('Syntax ERROR');
      const exprStr = result.slice(start + prefixLen, commas[0]);
      const aStr = result.slice(commas[0] + 1, commas[1]);
      const bStr = result.slice(commas[1] + 1, commas.length > 2 ? commas[2] : end);
      const aVal = toReal(evaluateExpression(aStr, ctx));
      const bVal = toReal(evaluateExpression(bStr, ctx));
      const integralVal = numericalIntegrate(exprStr, aVal, bVal, ctx);
      result = result.slice(0, start) + `(${integralVal})` + result.slice(end + 1);
    }
  }
  return result;
}

// 5-point Richardson-extrapolated central difference for d/dx(expr, x0)
export function numericalDerivative(exprStr: string, x0: number, ctx: EvalContext): number {
  if (!Number.isFinite(x0)) throw new CalcError('Math ERROR');
  const h = Math.max(1e-5, Math.abs(x0) * 1e-5);
  const evalAt = (x: number): number =>
    toReal(
      evaluateExpression(exprStr, {
        ...ctx,
        complexMode: false,
        variables: { ...ctx.variables, X: x },
        onAssign: undefined,
        onCoordResult: undefined,
      }),
    );
  const f1 = evalAt(x0 + h);
  const fm1 = evalAt(x0 - h);
  const f2 = evalAt(x0 + 2 * h);
  const fm2 = evalAt(x0 - 2 * h);
  const val = (-f2 + 8 * f1 - 8 * fm1 + fm2) / (12 * h);
  if (!Number.isFinite(val)) throw new CalcError('Math ERROR');
  return Math.abs(val) < 1e-12 ? 0 : val;
}

// 15-point Gauss-Kronrod rule on [a, b] split across adaptive subintervals
const GK_NODES = [
  -0.9914553711208126, -0.9491079123427585, -0.8648644233597691, -0.7415311855993945,
  -0.5860872354676911, -0.4058451513773972, -0.2077849550078985, 0.0,
  0.2077849550078985, 0.4058451513773972, 0.5860872354676911, 0.7415311855993945,
  0.8648644233597691, 0.9491079123427585, 0.9914553711208126,
];
const GK_WEIGHTS = [
  0.022935322010529224, 0.06309209262997855, 0.10479001032225018, 0.14065325971552592,
  0.1690047266392679, 0.1903505780647854, 0.20443294007529889, 0.20948214108472782,
  0.20443294007529889, 0.1903505780647854, 0.1690047266392679, 0.14065325971552592,
  0.10479001032225018, 0.06309209262997855, 0.022935322010529224,
];

export function numericalIntegrate(
  exprStr: string,
  a: number,
  b: number,
  ctx: EvalContext,
): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new CalcError('Math ERROR');
  if (a === b) return 0;
  const subIntervals = 12;
  const step = (b - a) / subIntervals;
  let total = 0;

  const evalAt = (x: number): number => {
    const localCtx: EvalContext = {
      ...ctx,
      complexMode: false,
      variables: { ...ctx.variables, X: x },
      onAssign: undefined,
      onCoordResult: undefined,
    };
    return toReal(evaluateExpression(exprStr, localCtx));
  };

  for (let s = 0; s < subIntervals; s++) {
    const lo = a + s * step;
    const hi = lo + step;
    const mid = (lo + hi) / 2;
    const half = (hi - lo) / 2;
    let sum = 0;
    for (let k = 0; k < GK_NODES.length; k++) {
      sum += GK_WEIGHTS[k] * evalAt(mid + half * GK_NODES[k]);
    }
    total += half * sum;
  }
  if (!Number.isFinite(total)) throw new CalcError('Math ERROR');
  return Math.abs(total) < 1e-13 ? 0 : total;
}

class Parser {
  private tokens: Tok[];
  private pos = 0;
  private ctx: EvalContext;

  constructor(tokens: Tok[], ctx: EvalContext) {
    this.tokens = tokens;
    this.ctx = ctx;
  }

  private peek(offset = 0): Tok | undefined {
    return this.tokens[this.pos + offset];
  }

  private consume(): Tok {
    const t = this.tokens[this.pos];
    if (!t) throw new CalcError('Syntax ERROR');
    this.pos++;
    return t;
  }

  parse(): Complex {
    if (this.tokens.length === 0) throw new CalcError('Syntax ERROR');
    const val = this.parseAddSub();
    if (this.pos < this.tokens.length) throw new CalcError('Syntax ERROR');
    return val;
  }

  private parseAddSub(): Complex {
    let left = this.parseMulDiv();
    while (this.peek()?.kind === 'OP' && (this.peek()!.value === '+' || this.peek()!.value === '-')) {
      const op = this.consume().value;
      const startPos = this.pos;
      const right = this.parseMulDiv();
      // Casio percentage add/sub convenience: 200+10% -> 200 + 200*0.1 = 220
      const endsWithPercent =
        this.pos > startPos &&
        this.tokens[this.pos - 1]?.kind === 'POSTFIX' &&
        this.tokens[this.pos - 1]?.value === '%';
      const rhs = endsWithPercent ? cMul(left, right) : right;
      left = op === '+' ? cAdd(left, rhs) : cSub(left, rhs);
    }
    return left;
  }

  private isImplicitMulStart(tok: Tok | undefined): boolean {
    if (!tok) return false;
    return (
      tok.kind === 'LPAREN' ||
      tok.kind === 'VAR' ||
      tok.kind === 'CONST' ||
      tok.kind === 'FUNC' ||
      tok.kind === 'STAT_VAR'
    );
  }

  private parseMulDiv(): Complex {
    let left = this.parseImplicitMul();
    while (this.peek()?.kind === 'OP' && (this.peek()!.value === '*' || this.peek()!.value === '/')) {
      const op = this.consume().value;
      const right = this.parseImplicitMul();
      left = op === '*' ? cMul(left, right) : cDiv(left, right);
    }
    return left;
  }

  // Casio S-V.P.A.M. implicit multiplication (e.g. 2π, 2A, 3(4+5), 2sin(30)) binds tighter than ÷
  private parseImplicitMul(): Complex {
    let left = this.parseUnary();
    while (this.isImplicitMulStart(this.peek())) {
      const right = this.parseUnary();
      left = cMul(left, right);
    }
    return left;
  }

  private parseUnary(): Complex {
    const t = this.peek();
    if (t?.kind === 'OP' && (t.value === '+' || t.value === '-' || t.value === 'NEG')) {
      this.consume();
      const operand = this.parseUnary();
      return t.value === '+' ? operand : cMake(-operand.re, -operand.im);
    }
    return this.parseCombinatoricsAndPolar();
  }

  private parseCombinatoricsAndPolar(): Complex {
    let left = this.parsePower();
    while (
      this.peek()?.kind === 'OP' &&
      (this.peek()!.value === 'nPr' ||
        this.peek()!.value === 'nCr' ||
        this.peek()!.value === '∠' ||
        this.peek()!.value === 'xroot')
    ) {
      const op = this.consume().value;
      const right = this.parsePower();
      if (op === 'nPr') {
        left = cReal(nPr(toReal(left), toReal(right)));
      } else if (op === 'nCr') {
        left = cReal(nCr(toReal(left), toReal(right)));
      } else if (op === 'xroot') {
        const n = toReal(left);
        if (n === 0) throw new CalcError('Math ERROR');
        left = cPow(right, cReal(1 / n), this.ctx.complexMode);
      } else if (op === '∠') {
        if (!this.ctx.complexMode) throw new CalcError('Math ERROR');
        const r = toReal(left);
        const theta = toRadians(toReal(right), this.ctx.angleUnit);
        left = cMake(r * cleanTrig(Math.cos(theta)), r * cleanTrig(Math.sin(theta)));
      }
    }
    return left;
  }

  private parsePower(): Complex {
    const base = this.parsePostfix();
    if (this.peek()?.kind === 'OP' && this.peek()!.value === '^') {
      this.consume();
      const exp = this.parseUnary();
      return cPow(base, exp, this.ctx.complexMode);
    }
    return base;
  }

  private parsePostfix(): Complex {
    let val = this.parsePrimary();
    while (this.peek()?.kind === 'POSTFIX') {
      const op = this.consume().value;
      if (op === 'sq') {
        val = cMul(val, val);
      } else if (op === 'cube') {
        val = cMul(cMul(val, val), val);
      } else if (op === 'inv') {
        val = cDiv(cReal(1), val);
      } else if (op === '!') {
        val = cReal(factorial(toReal(val)));
      } else if (op === '%') {
        val = cDiv(val, cReal(100));
      } else if (op === '°') {
        // Explicit degree marker converted into active angle unit
        const deg = toReal(val);
        val = cReal(fromRadians((deg * Math.PI) / 180, this.ctx.angleUnit));
      } else if (op === 'ʳ') {
        const rad = toReal(val);
        val = cReal(fromRadians(rad, this.ctx.angleUnit));
      } else if (op === 'ᵍ') {
        const grad = toReal(val);
        val = cReal(fromRadians((grad * Math.PI) / 200, this.ctx.angleUnit));
      }
    }
    return val;
  }

  private parseFuncArgument(fn: string): Complex[] {
    if (this.peek()?.kind === 'LPAREN') {
      this.consume();
      const args: Complex[] = [this.parseAddSub()];
      while (this.peek()?.kind === 'COMMA') {
        this.consume();
        args.push(this.parseAddSub());
      }
      if (this.peek()?.kind === 'RPAREN') {
        this.consume();
      }
      // Allow omitted trailing closing paren at end of Casio expression (classic S-V.P.A.M. behavior!)
      return args;
    }
    if (fn === 'Pol' || fn === 'Rec') throw new CalcError('Syntax ERROR');
    return [this.parseUnary()];
  }

  private applyFunction(fn: string, args: Complex[]): Complex {
    const { angleUnit, complexMode } = this.ctx;
    if (fn === 'Pol' || fn === 'Rec') {
      if (args.length !== 2) throw new CalcError('Syntax ERROR');
      const a = toReal(args[0]);
      const b = toReal(args[1]);
      if (fn === 'Pol') {
        const r = Math.hypot(a, b);
        const theta = fromRadians(Math.atan2(b, a), angleUnit);
        this.ctx.variables.X = r;
        this.ctx.variables.Y = theta;
        this.ctx.onAssign?.('X', cReal(r));
        this.ctx.onAssign?.('Y', cReal(theta));
        this.ctx.onCoordResult?.('Pol', r, theta);
        return cReal(r);
      } else {
        const rad = toRadians(b, angleUnit);
        const x = a * cleanTrig(Math.cos(rad));
        const y = a * cleanTrig(Math.sin(rad));
        this.ctx.variables.X = x;
        this.ctx.variables.Y = y;
        this.ctx.onAssign?.('X', cReal(x));
        this.ctx.onAssign?.('Y', cReal(y));
        this.ctx.onCoordResult?.('Rec', x, y);
        return cReal(x);
      }
    }

    if (args.length !== 1) throw new CalcError('Syntax ERROR');
    const z = args[0];

    switch (fn) {
      case 'sqrt':
        return cSqrt(z, complexMode);
      case 'cbrt': {
        const x = toReal(z);
        return cReal(Math.cbrt(x));
      }
      case 'Abs':
        return cReal(cAbs(z));
      case 'arg':
        return cReal(fromRadians(cArgRad(z), angleUnit));
      case 'Conjg':
        return cConjg(z);
      case 'ln':
        return cLn(z, complexMode);
      case 'log':
        return cDiv(cLn(z, complexMode), cReal(Math.LN10));
      case 'exp':
        return cExp(z);
      case 'pow10':
        return cPow(cReal(10), z, complexMode);
      case 'Rnd': {
        const x = toReal(z);
        if (this.ctx.formatKind === 'FIX') {
          const factor = Math.pow(10, this.ctx.formatDigits ?? 2);
          return cReal(Math.round(x * factor) / factor);
        }
        return cReal(Number(x.toPrecision(10)));
      }
      case 'sin': {
        const r = toRadians(toReal(z), angleUnit);
        return cReal(cleanTrig(Math.sin(r)));
      }
      case 'cos': {
        const r = toRadians(toReal(z), angleUnit);
        return cReal(cleanTrig(Math.cos(r)));
      }
      case 'tan': {
        const r = toRadians(toReal(z), angleUnit);
        const cosVal = Math.cos(r);
        if (Math.abs(cosVal) < 1e-14) throw new CalcError('Math ERROR');
        return cReal(cleanTrig(Math.sin(r) / cosVal));
      }
      case 'asin': {
        const x = toReal(z);
        if (x < -1 - EPS || x > 1 + EPS) throw new CalcError('Math ERROR');
        return cReal(fromRadians(Math.asin(Math.max(-1, Math.min(1, x))), angleUnit));
      }
      case 'acos': {
        const x = toReal(z);
        if (x < -1 - EPS || x > 1 + EPS) throw new CalcError('Math ERROR');
        return cReal(fromRadians(Math.acos(Math.max(-1, Math.min(1, x))), angleUnit));
      }
      case 'atan':
        return cReal(fromRadians(Math.atan(toReal(z)), angleUnit));
      case 'sinh':
        return cReal(Math.sinh(toReal(z)));
      case 'cosh':
        return cReal(Math.cosh(toReal(z)));
      case 'tanh':
        return cReal(Math.tanh(toReal(z)));
      case 'asinh':
        return cReal(Math.asinh(toReal(z)));
      case 'acosh': {
        const x = toReal(z);
        if (x < 1) throw new CalcError('Math ERROR');
        return cReal(Math.acosh(x));
      }
      case 'atanh': {
        const x = toReal(z);
        if (x <= -1 || x >= 1) throw new CalcError('Math ERROR');
        return cReal(Math.atanh(x));
      }
      default:
        throw new CalcError('Syntax ERROR');
    }
  }

  private parsePrimary(): Complex {
    const t = this.peek();
    if (!t) throw new CalcError('Syntax ERROR');

    if (t.kind === 'NUM') {
      this.consume();
      return cReal(t.num!);
    }
    if (t.kind === 'CONST') {
      this.consume();
      if (t.value === 'pi') return cReal(Math.PI);
      if (t.value === 'e') return cReal(Math.E);
      if (t.value === 'i') {
        if (!this.ctx.complexMode) throw new CalcError('Math ERROR');
        return { re: 0, im: 1 };
      }
      if (t.value === 'Ans') return { ...this.ctx.ans };
      if (t.value === 'Ran#') return cReal(Math.floor(Math.random() * 1000) / 1000);
    }
    if (t.kind === 'VAR') {
      this.consume();
      const name = t.value as VariableName;
      if (this.ctx.complexMode && this.ctx.complexVariables?.[name]) {
        return { ...this.ctx.complexVariables[name]! };
      }
      return cReal(this.ctx.variables[name] ?? 0);
    }
    if (t.kind === 'STAT_VAR') {
      this.consume();
      if (!this.ctx.stats) throw new CalcError('Math ERROR');
      const summary = computeStats(this.ctx.stats);
      const val = summary[t.value as keyof StatSummary];
      if (!Number.isFinite(val)) throw new CalcError('Math ERROR');
      return cReal(val);
    }
    if (t.kind === 'FUNC') {
      this.consume();
      const args = this.parseFuncArgument(t.value);
      return this.applyFunction(t.value, args);
    }
    if (t.kind === 'LPAREN') {
      this.consume();
      const val = this.parseAddSub();
      if (this.peek()?.kind === 'RPAREN') this.consume();
      return val;
    }

    throw new CalcError('Syntax ERROR');
  }
}

export function evaluateExpression(rawInput: string, ctx: EvalContext): Complex {
  const withCalculus = evalCalculusCalls(rawInput, ctx);
  const tokens = collapseCompoundLiterals(tokenize(withCalculus));
  const parser = new Parser(tokens, ctx);
  return parser.parse();
}

// ---------- BASE-N 32-Bit Signed Integer Evaluator ----------

const RADIX_MAP: Record<BaseRadix, number> = { DEC: 10, HEX: 16, BIN: 2, OCT: 8 };

export function evaluateBaseN(rawInput: string, radix: BaseRadix, ansInt: number): number {
  const base = RADIX_MAP[radix];
  const src = rawInput
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\(-\)/g, '-')
    .trim();
  if (!src) throw new CalcError('Syntax ERROR');

  type BTok = { kind: 'INT' | 'OP' | 'LPAREN' | 'RPAREN'; value: string; num?: number };
  const toks: BTok[] = [];
  let i = 0;
  const isDigitForBase = (ch: string, b: number) => {
    const code = ch.toUpperCase().charCodeAt(0);
    if (code >= 48 && code <= 57) return code - 48 < b;
    if (code >= 65 && code <= 70) return code - 55 < b;
    return false;
  };

  while (i < src.length) {
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }
    if (src.startsWith('Ans', i)) {
      toks.push({ kind: 'INT', value: 'Ans', num: ansInt | 0 });
      i += 3;
      continue;
    }
    const kw = ['xnor', 'and', 'xor', 'or', 'Not', 'Neg'].find(k =>
      src.slice(i, i + k.length).toLowerCase() === k.toLowerCase() &&
      !(src[i + k.length] && /[a-zA-Z0-9]/.test(src[i + k.length])),
    );
    if (kw) {
      toks.push({ kind: 'OP', value: kw.toLowerCase() });
      i += kw.length;
      continue;
    }
    if (isDigitForBase(src[i], base)) {
      let j = i;
      while (j < src.length && isDigitForBase(src[j], base)) j++;
      const parsed = Number.parseInt(src.slice(i, j), base);
      if (!Number.isFinite(parsed)) throw new CalcError('Math ERROR');
      toks.push({ kind: 'INT', value: src.slice(i, j), num: parsed | 0 });
      i = j;
      continue;
    }
    if (src[i] === '(') {
      toks.push({ kind: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    if (src[i] === ')') {
      toks.push({ kind: 'RPAREN', value: ')' });
      i++;
      continue;
    }
    if ('+-*/'.includes(src[i])) {
      toks.push({ kind: 'OP', value: src[i] });
      i++;
      continue;
    }
    throw new CalcError('Syntax ERROR');
  }

  let pos = 0;
  const peek = () => toks[pos];
  const take = () => {
    const t = toks[pos++];
    if (!t) throw new CalcError('Syntax ERROR');
    return t;
  };

  const parseOr = (): number => {
    let left = parseXor();
    while (peek()?.kind === 'OP' && (peek()!.value === 'or' || peek()!.value === 'xnor')) {
      const op = take().value;
      const right = parseXor();
      left = op === 'or' ? (left | right) : ~(left ^ right);
    }
    return left | 0;
  };
  const parseXor = (): number => {
    let left = parseAnd();
    while (peek()?.kind === 'OP' && peek()!.value === 'xor') {
      take();
      left = (left ^ parseAnd()) | 0;
    }
    return left | 0;
  };
  const parseAnd = (): number => {
    let left = parseAdd();
    while (peek()?.kind === 'OP' && peek()!.value === 'and') {
      take();
      left = (left & parseAdd()) | 0;
    }
    return left | 0;
  };
  const parseAdd = (): number => {
    let left = parseMul();
    while (peek()?.kind === 'OP' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = take().value;
      const right = parseMul();
      left = op === '+' ? ((left + right) | 0) : ((left - right) | 0);
    }
    return left | 0;
  };
  const parseMul = (): number => {
    let left = parseUnaryB();
    while (peek()?.kind === 'OP' && (peek()!.value === '*' || peek()!.value === '/')) {
      const op = take().value;
      const right = parseUnaryB();
      if (op === '*') left = Math.imul(left, right);
      else {
        if (right === 0) throw new CalcError('Math ERROR');
        left = Math.trunc(left / right) | 0;
      }
    }
    return left | 0;
  };
  const parseUnaryB = (): number => {
    const t = peek();
    if (t?.kind === 'OP' && (t.value === '-' || t.value === 'neg')) {
      take();
      return (-parseUnaryB()) | 0;
    }
    if (t?.kind === 'OP' && t.value === '+') {
      take();
      return parseUnaryB() | 0;
    }
    if (t?.kind === 'OP' && t.value === 'not') {
      take();
      return ~parseUnaryB();
    }
    if (t?.kind === 'INT') {
      take();
      return t.num! | 0;
    }
    if (t?.kind === 'LPAREN') {
      take();
      const val = parseOr();
      if (peek()?.kind === 'RPAREN') take();
      return val;
    }
    throw new CalcError('Syntax ERROR');
  };

  const out = parseOr();
  if (pos < toks.length) throw new CalcError('Syntax ERROR');
  return out | 0;
}

export function formatBaseN(value: number, radix: BaseRadix): string {
  const n = value | 0;
  if (radix === 'DEC') return String(n);
  const unsigned = n >>> 0;
  if (radix === 'HEX') return unsigned.toString(16).toUpperCase();
  if (radix === 'OCT') return unsigned.toString(8);
  return unsigned.toString(2);
}

// ---------- Number Display Formatting ----------

export function formatRealNumber(
  raw: number,
  formatKind: NumberFormatKind,
  formatDigits: number,
  engShift = 0,
): string {
  if (!Number.isFinite(raw)) return 'Math ERROR';
  const val = Math.abs(raw) < 1e-14 ? 0 : raw;

  if (engShift !== 0 && val !== 0) {
    const baseExp = Math.floor(Math.log10(Math.abs(val)) / 3) * 3;
    const targetExp = baseExp + engShift * 3;
    const mantissa = Number((val / Math.pow(10, targetExp)).toPrecision(10));
    return `${mantissa}×10^${targetExp}`;
  }

  if (formatKind === 'FIX') {
    return val.toFixed(formatDigits);
  }
  if (formatKind === 'SCI') {
    const sig = Math.max(1, formatDigits === 0 ? 10 : formatDigits);
    const s = val.toExponential(sig - 1);
    return s.replace('e+', '×10^').replace('e', '×10^');
  }

  // NORM1 (sci if |x| < 1e-2 or >= 1e10) / NORM2 (sci if |x| < 1e-9 or >= 1e10)
  const abs = Math.abs(val);
  const sciLower = formatKind === 'NORM1' ? 1e-2 : 1e-9;
  if (val !== 0 && (abs >= 1e10 || abs < sciLower)) {
    const s = Number(val.toPrecision(10)).toExponential();
    return s.replace('e+', '×10^').replace('e', '×10^');
  }
  const rounded = Number(val.toPrecision(10));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export function formatComplexNumber(
  z: Complex,
  formatKind: NumberFormatKind,
  formatDigits: number,
  engShift = 0,
): string {
  if (isReal(z)) return formatRealNumber(z.re, formatKind, formatDigits, engShift);
  const reZero = Math.abs(z.re) < 1e-12 * Math.max(1, Math.abs(z.im));
  const imAbs = Math.abs(z.im);
  const imStr = Math.abs(imAbs - 1) < 1e-12 ? '' : formatRealNumber(imAbs, formatKind, formatDigits);
  if (reZero) {
    return `${z.im < 0 ? '-' : ''}${imStr}i`;
  }
  const reStr = formatRealNumber(z.re, formatKind, formatDigits);
  const sign = z.im < 0 ? ' - ' : ' + ';
  return `${reStr}${sign}${imStr}i`;
}

// ---------- Casio Program Byte Counter ----------

const BYTE_TOKENS = [
  'sinh⁻¹', 'cosh⁻¹', 'tanh⁻¹', 'sin⁻¹', 'cos⁻¹', 'tan⁻¹',
  'sinh', 'cosh', 'tanh', 'sin', 'cos', 'tan',
  'Conjg', 'Pol(', 'Rec(', 'Abs', 'arg', 'Rnd', 'Ran#', 'Ans',
  'Goto', 'Lbl', 'nPr', 'nCr', 'log', 'ln', '10^', 'e^',
  'xσn-1', 'xσn', 'Σx²', 'Σx', '(-)', '⁻¹', 'x√', '×√', '=>',
];

export interface ScientificConstantDef {
  number: string;
  symbol: string;
  nameEn: string;
  value: number;
}

// Official 40 Casio fx-50FH II scientific constants (CONST 01–40)
export const SCIENTIFIC_CONSTANTS: readonly ScientificConstantDef[] = [
  { number: '01', symbol: 'mp', nameEn: 'Proton mass', value: 1.67262171e-27 },
  { number: '02', symbol: 'mn', nameEn: 'Neutron mass', value: 1.67492728e-27 },
  { number: '03', symbol: 'me', nameEn: 'Electron mass', value: 9.1093826e-31 },
  { number: '04', symbol: 'mμ', nameEn: 'Muon mass', value: 1.8835314e-28 },
  { number: '05', symbol: 'a0', nameEn: 'Bohr radius', value: 5.291772108e-11 },
  { number: '06', symbol: 'h', nameEn: 'Planck constant', value: 6.6260693e-34 },
  { number: '07', symbol: 'μN', nameEn: 'Nuclear magneton', value: 5.05078343e-27 },
  { number: '08', symbol: 'μB', nameEn: 'Bohr magneton', value: 9.27400949e-24 },
  { number: '09', symbol: 'ħ', nameEn: 'Reduced Planck', value: 1.05457168e-34 },
  { number: '10', symbol: 'α', nameEn: 'Fine-structure', value: 7.297352568e-3 },
  { number: '11', symbol: 're', nameEn: 'Classical e radius', value: 2.817940325e-15 },
  { number: '12', symbol: 'λc', nameEn: 'Compton wavelength', value: 2.426310238e-12 },
  { number: '13', symbol: 'γp', nameEn: 'Proton gyromag.', value: 2.67522205e8 },
  { number: '14', symbol: 'λcp', nameEn: 'Proton Compton', value: 1.321409855e-15 },
  { number: '15', symbol: 'λcn', nameEn: 'Neutron Compton', value: 1.319590906e-15 },
  { number: '16', symbol: 'R∞', nameEn: 'Rydberg constant', value: 10973731.568525 },
  { number: '17', symbol: 'u', nameEn: 'Atomic mass unit', value: 1.66053886e-27 },
  { number: '18', symbol: 'μp', nameEn: 'Proton mag. mom.', value: 1.41060671e-26 },
  { number: '19', symbol: 'μe', nameEn: 'Electron mag. mom.', value: -9.28476412e-24 },
  { number: '20', symbol: 'μn', nameEn: 'Neutron mag. mom.', value: -9.6623645e-27 },
  { number: '21', symbol: 'μμ', nameEn: 'Muon mag. mom.', value: -4.49044799e-26 },
  { number: '22', symbol: 'F', nameEn: 'Faraday constant', value: 96485.3383 },
  { number: '23', symbol: 'e', nameEn: 'Elementary charge', value: 1.60217653e-19 },
  { number: '24', symbol: 'NA', nameEn: 'Avogadro constant', value: 6.0221415e23 },
  { number: '25', symbol: 'k', nameEn: 'Boltzmann constant', value: 1.3806505e-23 },
  { number: '26', symbol: 'Vm', nameEn: 'Molar volume', value: 0.022413996 },
  { number: '27', symbol: 'R', nameEn: 'Molar gas constant', value: 8.314472 },
  { number: '28', symbol: 'c0', nameEn: 'Speed of light', value: 299792458 },
  { number: '29', symbol: 'c1', nameEn: 'First radiation', value: 3.74177138e-16 },
  { number: '30', symbol: 'c2', nameEn: 'Second radiation', value: 1.4387752e-2 },
  { number: '31', symbol: 'σ', nameEn: 'Stefan-Boltzmann', value: 5.6704e-8 },
  { number: '32', symbol: 'ε0', nameEn: 'Electric constant', value: 8.854187817e-12 },
  { number: '33', symbol: 'μ0', nameEn: 'Magnetic constant', value: 1.256637061e-6 },
  { number: '34', symbol: 'Φ0', nameEn: 'Mag. flux quantum', value: 2.06783372e-15 },
  { number: '35', symbol: 'g', nameEn: 'Standard gravity', value: 9.80665 },
  { number: '36', symbol: 'G0', nameEn: 'Conductance quant.', value: 7.748091733e-5 },
  { number: '37', symbol: 'Z0', nameEn: 'Vacuum impedance', value: 376.730313461 },
  { number: '38', symbol: 't', nameEn: 'Celsius temp.', value: 273.15 },
  { number: '39', symbol: 'G', nameEn: 'Newtonian grav.', value: 6.6742e-11 },
  { number: '40', symbol: 'atm', nameEn: 'Standard atm', value: 101325 },
];

export function countProgramBytes(source: string): number {
  const s = source.replace(/\s+/g, '');
  let i = 0;
  let bytes = 0;
  while (i < s.length) {
    let found = false;
    for (const tok of BYTE_TOKENS) {
      if (s.startsWith(tok, i)) {
        bytes += 1;
        i += tok.length;
        found = true;
        break;
      }
    }
    if (!found) {
      bytes += 1;
      i += 1;
    }
  }
  return bytes;
}
