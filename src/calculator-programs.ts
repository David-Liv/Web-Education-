import {
  CalcError,
  cMake,
  cReal,
  countProgramBytes,
  evaluateExpression,
  formatComplexNumber,
  formatRealNumber,
  isReal,
  toRadians,
  toReal,
} from './calculator-engine.ts';
import type { Complex, EvalContext, StatData } from './calculator-engine.ts';
import type {
  AngleUnit,
  NumberFormatKind,
  VariableName,
} from './calculator-types.ts';

// ---------- Built-in fx-50FH II Formula Library (FMLA 01–23) ----------

export interface BuiltInFormulaDef {
  number: string; // '01' .. '23'
  titleZh: string;
  titleEn: string;
  formulaExpr: string;
  available: boolean;
  prompts?: { name: string; labelZh: string; labelEn: string }[];
}

export const BUILT_IN_FORMULAS: readonly BuiltInFormulaDef[] = [
  {
    number: '01',
    titleZh: '一元二次方程求根',
    titleEn: 'Quadratic Equation',
    formulaExpr: 'Ax² + Bx + C = 0',
    available: true,
    prompts: [
      { name: 'A', labelZh: '係數 A (x² 項)', labelEn: 'Coefficient A (x²)' },
      { name: 'B', labelZh: '係數 B (x 項)', labelEn: 'Coefficient B (x)' },
      { name: 'C', labelZh: '常數項 C', labelEn: 'Constant C' },
    ],
  },
  {
    number: '02',
    titleZh: '餘弦公式（求對邊）',
    titleEn: 'Cosine Theorem',
    formulaExpr: 'a = √(b² + c² − 2bc cos A)',
    available: true,
    prompts: [
      { name: 'b', labelZh: '鄰邊 b', labelEn: 'Side b' },
      { name: 'c', labelZh: '鄰邊 c', labelEn: 'Side c' },
      { name: '∠A', labelZh: '夾角 ∠A', labelEn: 'Included angle ∠A' },
    ],
  },
  {
    number: '03',
    titleZh: '海倫公式（三角形面積）',
    titleEn: "Heron's Formula",
    formulaExpr: 'S = √(s(s−a)(s−b)(s−c))',
    available: true,
    prompts: [
      { name: 'a', labelZh: '邊長 a', labelEn: 'Side a' },
      { name: 'b', labelZh: '邊長 b', labelEn: 'Side b' },
      { name: 'c', labelZh: '邊長 c', labelEn: 'Side c' },
    ],
  },
  {
    number: '04',
    titleZh: '標準常態分佈機率 P(x)',
    titleEn: 'Normal Probability P(x)',
    formulaExpr: 'P(x) = Φ(x) − 0.5',
    available: true,
    prompts: [{ name: 'x', labelZh: '標準化數值 x', labelEn: 'Standardized variate x' }],
  },
  {
    number: '05',
    titleZh: '標準常態上尾機率 Q(x)',
    titleEn: 'Normal Probability Q(x)',
    formulaExpr: 'Q(x) = 1 − Φ(x)',
    available: true,
    prompts: [{ name: 'x', labelZh: '標準化數值 x', labelEn: 'Standardized variate x' }],
  },
  { number: '06', titleZh: '庫侖定律', titleEn: "Coulomb's Law", formulaExpr: 'F = kq₁q₂/r²', available: false },
  { number: '07', titleZh: '導體電阻', titleEn: 'Resistance of a Conductor', formulaExpr: 'R = ρL/S', available: false },
  { number: '08', titleZh: '磁力', titleEn: 'Magnetic Force', formulaExpr: 'F = BIL sinθ', available: false },
  { number: '09', titleZh: 'RC 電路端電壓', titleEn: 'RC Terminal Voltage', formulaExpr: 'V = E(1−e^(−t/RC))', available: false },
  { number: '10', titleZh: '電壓增益', titleEn: 'Voltage Gain', formulaExpr: 'G = 20 log(V₂/V₁)', available: false },
  { number: '11', titleZh: 'LRC 串聯阻抗', titleEn: 'LRC Series Impedance', formulaExpr: 'Z = √(R²+(ωL−1/ωC)²)', available: false },
  { number: '12', titleZh: 'LRC 並聯阻抗', titleEn: 'LRC Parallel Impedance', formulaExpr: 'Z = 1/√(1/R²+(ωC−1/ωL)²)', available: false },
  { number: '13', titleZh: '電振盪頻率', titleEn: 'Electric Oscillation Freq', formulaExpr: 'f = 1/(2π√(LC))', available: false },
  { number: '14', titleZh: '自由落體距離', titleEn: 'Distance of Drop', formulaExpr: 'h = ½gt²', available: false },
  { number: '15', titleZh: '單擺週期', titleEn: 'Simple Pendulum Cycle', formulaExpr: 'T = 2π√(L/g)', available: false },
  { number: '16', titleZh: '彈簧振子週期', titleEn: 'Spring Pendulum Cycle', formulaExpr: 'T = 2π√(m/k)', available: false },
  { number: '17', titleZh: '都卜勒效應', titleEn: 'Doppler Effect', formulaExpr: 'f′ = f(v±v₀)/(v∓vₛ)', available: false },
  { number: '18', titleZh: '理想氣體方程', titleEn: 'Ideal Gas Law', formulaExpr: 'PV = nRT', available: false },
  { number: '19', titleZh: '離心力', titleEn: 'Centrifugal Force', formulaExpr: 'F = mv²/r', available: false },
  { number: '20', titleZh: '彈性勢能', titleEn: 'Elastic Energy', formulaExpr: 'U = ½kx²', available: false },
  { number: '21', titleZh: '伯努利定理', titleEn: "Bernoulli's Theorem", formulaExpr: 'P+½ρv²+ρgh', available: false },
  { number: '22', titleZh: '視距測量 (1)', titleEn: 'Stadia Distance (1)', formulaExpr: 'D = KL + C', available: false },
  { number: '23', titleZh: '視距測量 (2)', titleEn: 'Stadia Distance (2)', formulaExpr: 'D = KL cos²α', available: false },
] as const;

// High-accuracy erf approximation (Abramowitz & Stegun 7.1.26, max error < 1.5e-7; refined for standard normal)
function erfApprox(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  // Rational Chebyshev approximation (Cody / Press et al.) accurate to ~1e-12
  const t = 1 / (1 + 0.5 * a);
  const tau =
    t *
    Math.exp(
      -a * a -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t *
                                  (1.48851587 +
                                    t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return sign * (1 - tau);
}

export function standardNormalCdf(x: number): number {
  return 0.5 * (1 + erfApprox(x / Math.SQRT2));
}

export interface FormulaExecutionOutput {
  results: { label: string; value: Complex }[];
  transcriptExpression: string;
  transcriptResult: string;
}

export function evaluateBuiltInFormula(
  formulaNumber: string,
  inputs: number[],
  angleUnit: AngleUnit,
  formatKind: NumberFormatKind,
  formatDigits: number,
): FormulaExecutionOutput {
  const fmt = (z: Complex) => formatComplexNumber(z, formatKind, formatDigits);
  const fmtR = (n: number) => formatRealNumber(n, formatKind, formatDigits);

  if (formulaNumber === '01') {
    const [a, b, c] = inputs;
    if (a === 0) {
      if (b === 0) throw new CalcError('Math ERROR');
      const root = cReal(-c / b);
      return {
        results: [{ label: 'x', value: root }],
        transcriptExpression: `${fmtR(b)}x + ${fmtR(c)} = 0`,
        transcriptResult: `x = ${fmt(root)}`,
      };
    }
    const disc = b * b - 4 * a * c;
    let x1: Complex;
    let x2: Complex;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      x1 = cReal((-b + sq) / (2 * a));
      x2 = cReal((-b - sq) / (2 * a));
    } else {
      const re = -b / (2 * a);
      const im = Math.sqrt(-disc) / (2 * a);
      x1 = cMake(re, im);
      x2 = cMake(re, -im);
    }
    const bSign = b >= 0 ? `+ ${fmtR(b)}` : `− ${fmtR(-b)}`;
    const cSign = c >= 0 ? `+ ${fmtR(c)}` : `− ${fmtR(-c)}`;
    return {
      results: [
        { label: 'x₁', value: x1 },
        { label: 'x₂', value: x2 },
      ],
      transcriptExpression: `${fmtR(a)}x² ${bSign}x ${cSign} = 0`,
      transcriptResult: `x₁ = ${fmt(x1)}, x₂ = ${fmt(x2)}`,
    };
  }

  if (formulaNumber === '02') {
    const [b, c, ang] = inputs;
    const rad = toRadians(ang, angleUnit);
    const sq = b * b + c * c - 2 * b * c * Math.cos(rad);
    if (sq < -1e-12) throw new CalcError('Math ERROR');
    const sideA = Math.sqrt(Math.max(0, sq));
    const unitSym = angleUnit === 'DEG' ? '°' : angleUnit === 'RAD' ? ' rad' : ' grad';
    return {
      results: [{ label: 'a', value: cReal(sideA) }],
      transcriptExpression: `a = √(${fmtR(b)}² + ${fmtR(c)}² − 2(${fmtR(b)})(${fmtR(c)})cos(${fmtR(ang)}${unitSym}))`,
      transcriptResult: fmtR(sideA),
    };
  }

  if (formulaNumber === '03') {
    const [a, b, c] = inputs;
    if (a <= 0 || b <= 0 || c <= 0) throw new CalcError('Math ERROR');
    const s = (a + b + c) / 2;
    const inside = s * (s - a) * (s - b) * (s - c);
    if (inside < -1e-12) throw new CalcError('Math ERROR');
    const area = Math.sqrt(Math.max(0, inside));
    return {
      results: [{ label: 'S', value: cReal(area) }],
      transcriptExpression: `Heron (a=${fmtR(a)}, b=${fmtR(b)}, c=${fmtR(c)})`,
      transcriptResult: fmtR(area),
    };
  }

  if (formulaNumber === '04') {
    const [x] = inputs;
    const p = standardNormalCdf(x) - 0.5;
    return {
      results: [{ label: 'P(x)', value: cReal(p) }],
      transcriptExpression: `P(${fmtR(x)})`,
      transcriptResult: fmtR(p),
    };
  }

  if (formulaNumber === '05') {
    const [x] = inputs;
    const q = 1 - standardNormalCdf(x);
    return {
      results: [{ label: 'Q(x)', value: cReal(q) }],
      transcriptExpression: `Q(${fmtR(x)})`,
      transcriptResult: fmtR(q),
    };
  }

  throw new CalcError('Syntax ERROR', 'Formula not implemented in Phase 1');
}

// ---------- Casio BASIC Compiler & Step-by-Step Virtual Machine ----------

export interface BasicStatement {
  text: string;
  displayAfter: boolean;
}

export interface CompiledProgram {
  statements: BasicStatement[];
  labels: Record<string, number>;
}

export function compileCasioBasic(source: string): CompiledProgram {
  const cleaned = source.replace(/\r?\n/g, ':').trim();
  if (!cleaned) return { statements: [], labels: {} };

  const statements: BasicStatement[] = [];
  let buf = '';
  let depth = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;

    if (depth === 0 && (ch === ':' || ch === '◢')) {
      const trimmed = buf.trim();
      if (trimmed) {
        statements.push({ text: trimmed, displayAfter: ch === '◢' });
      }
      buf = '';
    } else {
      buf += ch;
    }
  }
  const tail = buf.trim();
  if (tail) {
    statements.push({ text: tail, displayAfter: false });
  }

  const labels: Record<string, number> = {};
  statements.forEach((stmt, idx) => {
    const m = stmt.text.match(/^Lbl\s*([0-9])$/);
    if (m) labels[m[1]] = idx;
  });

  return { statements, labels };
}

export interface ProgramRunState {
  programLabel: string;
  compiled: CompiledProgram;
  pc: number;
  status: 'prompt' | 'display' | 'done';
  promptVar?: VariableName;
  displayValue?: Complex;
  variables: Record<VariableName, number>;
  complexVariables: Partial<Record<VariableName, Complex>>;
  ans: Complex;
  inputsRecorded: { varName: VariableName; value: string }[];
  outputsRecorded: string[];
  angleUnit: AngleUnit;
  complexMode: boolean;
  formatKind: NumberFormatKind;
  formatDigits: number;
  stats?: StatData;
}

const VALID_VAR_RE = /^([ABCDXYM])$/;

function findTopLevelConditional(stmt: string): { cond: string; rest: string } | null {
  let depth = 0;
  for (let i = 0; i < stmt.length; i++) {
    const ch = stmt[i];
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    else if (depth === 0) {
      if (ch === '⇒') {
        return { cond: stmt.slice(0, i).trim(), rest: stmt.slice(i + 1).trim() };
      }
      if (stmt.startsWith('=>', i)) {
        return { cond: stmt.slice(0, i).trim(), rest: stmt.slice(i + 2).trim() };
      }
    }
  }
  return null;
}

function findTopLevelComparison(cond: string): { lhs: string; op: string; rhs: string } | null {
  const ops = ['≠', '!=', '≥', '>=', '≤', '<=', '=', '>', '<'];
  let depth = 0;
  for (let i = 0; i < cond.length; i++) {
    const ch = cond[i];
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    else if (depth === 0) {
      for (const op of ops) {
        if (cond.startsWith(op, i)) {
          return {
            lhs: cond.slice(0, i).trim(),
            op,
            rhs: cond.slice(i + op.length).trim(),
          };
        }
      }
    }
  }
  return null;
}

function findTopLevelArrow(stmt: string): { expr: string; varName: VariableName } | null {
  let depth = 0;
  for (let i = stmt.length - 1; i >= 0; i--) {
    const ch = stmt[i];
    if (ch === ')') depth++;
    else if (ch === '(' && depth > 0) depth--;
    else if (depth === 0) {
      if (ch === '→') {
        const rhs = stmt.slice(i + 1).trim();
        if (VALID_VAR_RE.test(rhs)) {
          return { expr: stmt.slice(0, i).trim(), varName: rhs as VariableName };
        }
      }
      if (i > 0 && stmt.slice(i - 1, i + 1) === '->') {
        const rhs = stmt.slice(i + 1).trim();
        if (VALID_VAR_RE.test(rhs)) {
          return { expr: stmt.slice(0, i - 1).trim(), varName: rhs as VariableName };
        }
      }
    }
  }
  return null;
}

function makeEvalContext(run: ProgramRunState): EvalContext {
  return {
    angleUnit: run.angleUnit,
    complexMode: run.complexMode,
    variables: run.variables,
    complexVariables: run.complexVariables,
    ans: run.ans,
    stats: run.stats,
    formatKind: run.formatKind,
    formatDigits: run.formatDigits,
    onAssign: (name, val) => {
      run.variables[name] = isReal(val) ? val.re : val.re;
      run.complexVariables[name] = val;
    },
  };
}

function evaluateCondition(condStr: string, run: ProgramRunState): boolean {
  const cmp = findTopLevelComparison(condStr);
  if (!cmp) throw new CalcError('Syntax ERROR');
  const ctx = makeEvalContext(run);
  const a = toReal(evaluateExpression(cmp.lhs, ctx));
  const b = toReal(evaluateExpression(cmp.rhs, ctx));
  const tol = 1e-11 * Math.max(1, Math.abs(a), Math.abs(b));
  switch (cmp.op) {
    case '=':
      return Math.abs(a - b) <= tol;
    case '≠':
    case '!=':
      return Math.abs(a - b) > tol;
    case '>':
      return a > b + tol;
    case '≥':
    case '>=':
      return a >= b - tol;
    case '<':
      return a < b - tol;
    case '≤':
    case '<=':
      return a <= b + tol;
    default:
      throw new CalcError('Syntax ERROR');
  }
}

export function startProgramRun(
  programLabel: string,
  source: string,
  options: {
    variables: Record<VariableName, number>;
    complexVariables?: Partial<Record<VariableName, Complex>>;
    ans: Complex;
    angleUnit: AngleUnit;
    complexMode: boolean;
    formatKind: NumberFormatKind;
    formatDigits: number;
    stats?: StatData;
  },
): ProgramRunState {
  const compiled = compileCasioBasic(source);
  const run: ProgramRunState = {
    programLabel,
    compiled,
    pc: 0,
    status: 'done',
    variables: { ...options.variables },
    complexVariables: { ...(options.complexVariables ?? {}) },
    ans: { ...options.ans },
    inputsRecorded: [],
    outputsRecorded: [],
    angleUnit: options.angleUnit,
    complexMode: options.complexMode,
    formatKind: options.formatKind,
    formatDigits: options.formatDigits,
    stats: options.stats,
  };
  return stepProgramRun(run);
}

export function submitProgramInput(run: ProgramRunState, inputExpr: string): ProgramRunState {
  if (run.status !== 'prompt' || !run.promptVar) return run;
  const next: ProgramRunState = {
    ...run,
    variables: { ...run.variables },
    complexVariables: { ...run.complexVariables },
    inputsRecorded: [...run.inputsRecorded],
    outputsRecorded: [...run.outputsRecorded],
  };
  const trimmed = inputExpr.trim() || '0';
  const val = evaluateExpression(trimmed, makeEvalContext(next));
  next.variables[run.promptVar] = val.re;
  next.complexVariables[run.promptVar] = val;
  next.ans = val;
  next.inputsRecorded.push({
    varName: run.promptVar,
    value: formatComplexNumber(val, next.formatKind, next.formatDigits),
  });
  next.promptVar = undefined;
  next.pc += 1;
  return stepProgramRun(next);
}

export function continueProgramDisplay(run: ProgramRunState): ProgramRunState {
  if (run.status !== 'display') return run;
  const next: ProgramRunState = {
    ...run,
    variables: { ...run.variables },
    complexVariables: { ...run.complexVariables },
    inputsRecorded: [...run.inputsRecorded],
    outputsRecorded: [...run.outputsRecorded],
    displayValue: undefined,
    pc: run.pc + 1,
  };
  return stepProgramRun(next);
}

function stepProgramRun(state: ProgramRunState): ProgramRunState {
  const run: ProgramRunState = {
    ...state,
    variables: { ...state.variables },
    complexVariables: { ...state.complexVariables },
    inputsRecorded: [...state.inputsRecorded],
    outputsRecorded: [...state.outputsRecorded],
  };

  let guard = 0;
  const MAX_STEPS = 5000;

  while (run.pc < run.compiled.statements.length) {
    if (++guard > MAX_STEPS) throw new CalcError('Stack ERROR', 'Loop limit exceeded');
    const stmt = run.compiled.statements[run.pc];
    let body = stmt.text.trim();

    if (!body) {
      run.pc++;
      continue;
    }

    // Label declaration is a no-op at runtime
    if (/^Lbl\s*[0-9]$/.test(body)) {
      run.pc++;
      continue;
    }

    // Unwrap zero or more chained conditionals: cond1 ⇒ cond2 ⇒ action
    let conditionPassed = true;
    while (true) {
      const condMatch = findTopLevelConditional(body);
      if (!condMatch) break;
      if (!evaluateCondition(condMatch.cond, run)) {
        conditionPassed = false;
        break;
      }
      body = condMatch.rest;
    }
    if (!conditionPassed) {
      run.pc++;
      continue;
    }

    // Goto N
    const gotoMatch = body.match(/^Goto\s*([0-9])$/);
    if (gotoMatch) {
      const target = run.compiled.labels[gotoMatch[1]];
      if (target === undefined) throw new CalcError('Go ERROR');
      run.pc = target + 1;
      continue;
    }

    // ClrMemory
    if (body === 'ClrMemory') {
      (['A', 'B', 'C', 'D', 'X', 'Y', 'M'] as VariableName[]).forEach(v => {
        run.variables[v] = 0;
        delete run.complexVariables[v];
      });
      run.pc++;
      continue;
    }

    // Prompt input: ?→V
    const promptMatch = body.match(/^\?\s*(?:→|->)\s*([ABCDXYM])$/);
    if (promptMatch) {
      run.status = 'prompt';
      run.promptVar = promptMatch[1] as VariableName;
      return run;
    }

    // Assignment: expr→V
    const arrow = findTopLevelArrow(body);
    if (arrow) {
      const val = evaluateExpression(arrow.expr, makeEvalContext(run));
      run.variables[arrow.varName] = val.re;
      run.complexVariables[arrow.varName] = val;
      run.ans = val;
      if (stmt.displayAfter) {
        run.status = 'display';
        run.displayValue = val;
        run.outputsRecorded.push(formatComplexNumber(val, run.formatKind, run.formatDigits));
        return run;
      }
      run.pc++;
      continue;
    }

    // M+ / M- trailing statement
    if (body.endsWith('M+') && body.length > 2) {
      const val = evaluateExpression(body.slice(0, -2), makeEvalContext(run));
      run.variables.M += toReal(val);
      run.ans = val;
      if (stmt.displayAfter) {
        run.status = 'display';
        run.displayValue = val;
        run.outputsRecorded.push(formatComplexNumber(val, run.formatKind, run.formatDigits));
        return run;
      }
      run.pc++;
      continue;
    }
    if (body.endsWith('M-') && body.length > 2) {
      const val = evaluateExpression(body.slice(0, -2), makeEvalContext(run));
      run.variables.M -= toReal(val);
      run.ans = val;
      if (stmt.displayAfter) {
        run.status = 'display';
        run.displayValue = val;
        run.outputsRecorded.push(formatComplexNumber(val, run.formatKind, run.formatDigits));
        return run;
      }
      run.pc++;
      continue;
    }

    // Standard expression evaluation
    const val = evaluateExpression(body, makeEvalContext(run));
    run.ans = val;
    if (stmt.displayAfter) {
      run.status = 'display';
      run.displayValue = val;
      run.outputsRecorded.push(formatComplexNumber(val, run.formatKind, run.formatDigits));
      return run;
    }
    run.pc++;
  }

  run.status = 'done';
  run.displayValue = run.ans;
  const finalStr = formatComplexNumber(run.ans, run.formatKind, run.formatDigits);
  if (run.outputsRecorded.at(-1) !== finalStr) {
    run.outputsRecorded.push(finalStr);
  }
  return run;
}

export function formatProgramTranscript(run: ProgramRunState): {
  expression: string;
  result: string;
} {
  const inputs = run.inputsRecorded.map(i => `${i.varName}=${i.value}`).join(', ');
  const outputs = run.outputsRecorded.join(', ');
  return {
    expression: inputs ? `${run.programLabel} (${inputs})` : run.programLabel,
    result: outputs || formatComplexNumber(run.ans, run.formatKind, run.formatDigits),
  };
}

// ---------- DSE Classic 6-in-1 Preset Program Library ----------

export interface DsePresetProgram {
  id: string;
  titleZh: string;
  titleEn: string;
  formulaSummary: string;
  descriptionZh: string;
  descriptionEn: string;
  ioGuideZh: string;
  ioGuideEn: string;
  code: string;
  bytes: number;
  keystrokesZh: string;
  keystrokesEn: string;
}

const RAW_PRESETS: Omit<DsePresetProgram, 'bytes'>[] = [
  {
    id: 'quadratic-f01',
    titleZh: '一元二次方程（Formula 01 增強版）',
    titleEn: 'Quadratic Equation (Formula 01+)',
    formulaSummary: 'Ax² + Bx + C = 0 → Δ, x₁, x₂, 頂點(h, k)',
    descriptionZh: '求實根或複數根（實部與虛部），同時輸出判別式 Δ 及拋物線頂點 (h, k)。',
    descriptionEn: 'Solves real or complex roots (real & imaginary parts), plus discriminant Δ and vertex (h, k).',
    ioGuideZh: '輸入 A, B, C → 依序按 EXE 顯示：① Δ ② x₁（或實部）③ x₂（或虛部）④ 頂點 h ⑤ 頂點 k',
    ioGuideEn: 'Input A, B, C → press EXE for: ① Δ ② x₁ (or Re) ③ x₂ (or Im) ④ vertex h ⑤ vertex k',
    code: '?→A:?→B:?→C:B²-4AC→D◢D<0⇒Goto 1:(-B+√D)÷(2A)◢(-B-√D)÷(2A)◢Goto 2:Lbl 1:-B÷(2A)◢√(-D)÷(2A)◢Lbl 2:-B÷(2A)◢C-B²÷(4A)',
    keystrokesZh: 'MODE 6 1 選槽位 → [SHIFT 3 1 (?)] [SHIFT 3 2 (→)] [ALPHA (-)(A)] [SHIFT 3 3 (:)] … 條件用 [SHIFT 3 ▶] 選 ⇒ / < / Lbl / Goto',
    keystrokesEn: 'MODE 6 1 pick slot → [SHIFT 3 1 (?)] [SHIFT 3 2 (→)] [ALPHA (-)(A)] [SHIFT 3 3 (:)] … use [SHIFT 3 ▶] for ⇒, <, Lbl, Goto',
  },
  {
    id: 'cosine-triangle',
    titleZh: '餘弦公式解三角形（SAS / SSS）',
    titleEn: 'Cosine Rule Triangle Solver (SAS / SSS)',
    formulaSummary: 'c² = a² + b² − 2ab cos C',
    descriptionZh: '同時支援「已知兩邊及夾角（SAS）求對邊與面積」及「已知三邊（SSS）求夾角與面積」。',
    descriptionEn: 'Supports Mode 1 (SAS: find side c & area) and Mode 2 (SSS: find included angle ∠C & area).',
    ioGuideZh: '先輸入模式 X（1=SAS求邊, 2=SSS求角），再輸入 A=a, B=b, C=∠C(或邊c) → 顯示 ① 邊c（或∠C）② 面積',
    ioGuideEn: 'Input mode X (1=SAS side, 2=SSS angle), then A=a, B=b, C=∠C (or side c) → ① side c (or ∠C) ② Area',
    code: '?→X:?→A:?→B:?→C:X=2⇒Goto 1:√(A²+B²-2ABcos(C))◢.5ABsin(C):Goto 2:Lbl 1:cos⁻¹((A²+B²-C²)÷(2AB))→D◢.5ABsin(D):Lbl 2',
    keystrokesZh: 'MODE 6 1 選槽位 → 輸入 ?→X:?→A:?→B:?→C，反餘弦用 [SHIFT cos]，條件用 [SHIFT 3 ▶] 選 = 與 ⇒',
    keystrokesEn: 'MODE 6 1 pick slot → enter ?→X:?→A:?→B:?→C; use [SHIFT cos] for cos⁻¹ and [SHIFT 3 ▶] for = and ⇒',
  },
  {
    id: 'simultaneous-2x2',
    titleZh: '聯立二元一次方程',
    titleEn: 'Simultaneous Linear Equations (2×2)',
    formulaSummary: 'Ax + By = C, Dx + Xy = Y',
    descriptionZh: '快速求解兩條直線交點或聯立方程組 (x, y)，捲一驗算與捲二選擇題必備。',
    descriptionEn: 'Solves 2×2 linear systems / line intersections (x, y) in seconds.',
    ioGuideZh: '依序輸入第一式 A, B, C 與第二式 D, X, Y（注意常數項在等號右邊）→ 顯示 ① x ② y',
    ioGuideEn: 'Enter eq1 A, B, C then eq2 D, X, Y (constants on RHS) → ① x ② y',
    code: '?→A:?→B:?→C:?→D:?→X:?→Y:AX-BD→M:(CX-BY)÷M◢(AY-CD)÷M',
    keystrokesZh: 'MODE 6 1 選槽位 → 用 [ALPHA] 依序選 A(-), B(°\'"), C(hyp), D(sin), X()), Y(,), M(M+)',
    keystrokesEn: 'MODE 6 1 pick slot → use [ALPHA] for A(-), B(°\'"), C(hyp), D(sin), X()), Y(,), M(M+)',
  },
  {
    id: 'circle-line',
    titleZh: '直線與圓交點',
    titleEn: 'Circle & Line Intersection',
    formulaSummary: 'x²+y²+Dx+Ey+F=0 與 y=mx+c',
    descriptionZh: '已知一般式圓方程與斜截式直線方程，直接求出兩個交點坐標 (x₁, y₁) 與 (x₂, y₂)。',
    descriptionEn: 'Finds intersection points (x₁, y₁) and (x₂, y₂) of x²+y²+Dx+Ey+F=0 and y=mx+c.',
    ioGuideZh: '輸入圓係數 A=D, B=E, C=F，再輸入直線斜率 M=m、截距 D=c → 依序顯示 x₁, y₁, x₂, y₂（不相交時顯示 Math ERROR）',
    ioGuideEn: 'Enter circle A=D, B=E, C=F then line M=m, D=c → outputs x₁, y₁, x₂, y₂ (Math ERROR if no intersection)',
    code: '?→A:?→B:?→C:?→M:?→D:D²+BD+C→C:2MD+A+BM→B:1+M²→A:B²-4AC→Y:(-B+√Y)÷(2A)→X◢MX+D◢(-B-√Y)÷(2A)→X◢MX+D',
    keystrokesZh: 'MODE 6 1 選槽位 → 輸入五個變數後按序代入二次判別式，最後分四次 ◢ 輸出兩交點坐標',
    keystrokesEn: 'MODE 6 1 pick slot → prompt 5 inputs, substitute into quadratic, output 4 coordinates via ◢',
  },
  {
    id: 'triangle-centres',
    titleZh: '三角形四心（重心・外心・垂心）',
    titleEn: 'Triangle Centres (Centroid / Circumcentre / Orthocentre)',
    formulaSummary: '頂點 (x₁,y₁), (x₂,y₂), (x₃,y₃) → G, O, H',
    descriptionZh: '利用坐標平移與歐拉線性質，一次求出重心 G、外心 O 與垂心 H 坐標（坐標幾何神器）。',
    descriptionEn: 'Uses coordinate translation & Euler line to compute Centroid G, Circumcentre O and Orthocentre H.',
    ioGuideZh: '依序輸入三頂點 A=x₁, B=y₁, C=x₂, D=y₂, X=x₃, Y=y₃ → 依序顯示 Gx, Gy, Ox, Oy, Hx, Hy',
    ioGuideEn: 'Enter vertices A=x₁, B=y₁, C=x₂, D=y₂, X=x₃, Y=y₃ → outputs Gx, Gy, Ox, Oy, Hx, Hy',
    code: '?→A:?→B:?→C:?→D:C-A→C:D-B→D:?→X:?→Y:X-A→X:Y-B→Y:A+(C+X)÷3◢B+(D+Y)÷3◢2(CY-DX)→M:A+(Y(C²+D²)-D(X²+Y²))÷M◢3A+C+X-2Ans→A:B+(C(X²+Y²)-X(C²+D²))÷M◢3B+D+Y-2Ans→B:A◢B',
    keystrokesZh: 'MODE 6 1 選槽位 → 依序輸入三頂點，中間以 [Ans] 承接外心坐標再套用 H = 3G − 2O',
    keystrokesEn: 'MODE 6 1 pick slot → enter 3 vertices, chain [Ans] for circumcentre then apply H = 3G − 2O',
  },
  {
    id: 'cubic-roots',
    titleZh: '一元三次方程求根（多項式因式分解）',
    titleEn: 'Cubic Equation Solver (Polynomial Factorisation)',
    formulaSummary: 'Ax³ + Bx² + Cx + D = 0 → x₁, x₂, x₃',
    descriptionZh: '以牛頓迭代求得一實根 x₁，再自動降次求其餘兩根（無實根時輸出實部與虛部）。',
    descriptionEn: 'Finds one real root x₁ via Newton iteration, then deflates to a quadratic for x₂, x₃ (or Re/Im).',
    ioGuideZh: '輸入 A, B, C, D → 依序顯示 ① 實根 x₁ ② x₂（或實部）③ x₃（或虛部）',
    ioGuideEn: 'Enter A, B, C, D → outputs ① real root x₁ ② x₂ (or Re) ③ x₃ (or Im)',
    code: '?→A:?→B:?→C:?→D:-B÷(3A)+.371→X:0→M:Lbl 1:((AX+B)X+C)X+D→Y:Abs((3AX+2B)X+C)<1ᴇ-9⇒X+.5→X:Y÷((3AX+2B)X+C)→Y:X-Y→X:M+1→M:M<45⇒Abs(Y)>1ᴇ-10⇒Goto 1:X◢B+AX→B:C+BX→C:B²-4AC→D:D<0⇒Goto 2:(-B+√D)÷(2A)◢(-B-√D)÷(2A):Goto 3:Lbl 2:-B÷(2A)◢√(-D)÷(2A):Lbl 3',
    keystrokesZh: 'MODE 6 1 選槽位 → 科學記號 1ᴇ-9 用 [1] [EXP] [(-)] [9]，絕對值用 [SHIFT hyp (Abs)]',
    keystrokesEn: 'MODE 6 1 pick slot → enter 1ᴇ-9 via [1] [EXP] [(-)] [9], Abs via [SHIFT hyp]',
  },
];

export const DSE_PRESET_PROGRAMS: readonly DsePresetProgram[] = RAW_PRESETS.map(p => ({
  ...p,
  bytes: countProgramBytes(p.code),
}));
