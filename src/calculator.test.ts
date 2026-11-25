import { describe, expect, it } from 'vitest';
import {
  CalcError,
  cReal,
  countProgramBytes,
  evaluateBaseN,
  evaluateExpression,
  formatDMS,
  formatFraction,
  toReal,
} from './calculator-engine.ts';
import {
  DSE_PRESET_PROGRAMS,
  continueProgramDisplay,
  evaluateBuiltInFormula,
  startProgramRun,
  submitProgramInput,
} from './calculator-programs.ts';
import {
  createCalculatorState,
  getLcdView,
  loadProgramIntoSlot,
  pressCalcKey,
  switchCalculatorModel,
} from './calculator-machine.ts';
import type { CalcKey } from './calculator-machine.ts';
import { defaultCalculatorState, sanitizeCalculatorState } from './calculator-types.ts';

function pressSeq(initial: ReturnType<typeof createCalculatorState>, keys: CalcKey[]) {
  return keys.reduce((s, k) => pressCalcKey(s, k), initial);
}

function runProgramWithInputs(code: string, inputs: string[], angleUnit: 'DEG' | 'RAD' = 'DEG') {
  let run = startProgramRun('P1', code, {
    variables: { A: 0, B: 0, C: 0, D: 0, X: 0, Y: 0, M: 0 },
    ans: cReal(0),
    angleUnit,
    complexMode: false,
    formatKind: 'NORM1',
    formatDigits: 9,
  });
  let idx = 0;
  const displayed: number[] = [];
  let guard = 0;
  while (run.status !== 'done' && guard++ < 50) {
    if (run.status === 'prompt') {
      run = submitProgramInput(run, inputs[idx++] ?? '0');
    } else if (run.status === 'display') {
      displayed.push(toReal(run.displayValue!));
      run = continueProgramDisplay(run);
    }
  }
  displayed.push(toReal(run.displayValue!));
  return { run, displayed };
}

describe('DSE calculator scientific engine', () => {
  const baseCtx = {
    angleUnit: 'DEG' as const,
    complexMode: false,
    variables: { A: 2, B: 3, C: 4, D: 0, X: 0, Y: 0, M: 0 },
    ans: cReal(0),
  };

  it('follows Casio S-V.P.A.M. precedence, implicit multiplication, and powers', () => {
    expect(toReal(evaluateExpression('2+3×4', baseCtx))).toBe(14);
    expect(toReal(evaluateExpression('-3²', baseCtx))).toBe(-9);
    expect(toReal(evaluateExpression('(-3)²', baseCtx))).toBe(9);
    expect(toReal(evaluateExpression('1÷2A', baseCtx))).toBeCloseTo(0.25, 10);
    expect(toReal(evaluateExpression('2π', baseCtx))).toBeCloseTo(2 * Math.PI, 10);
    expect(toReal(evaluateExpression('2sin(30)', baseCtx))).toBeCloseTo(1, 10);
    expect(toReal(evaluateExpression('5nPr2', baseCtx))).toBe(20);
    expect(toReal(evaluateExpression('5nCr2', baseCtx))).toBe(10);
    expect(toReal(evaluateExpression('5!', baseCtx))).toBe(120);
    expect(toReal(evaluateExpression('200+10%', baseCtx))).toBeCloseTo(220, 10);
    expect(toReal(evaluateExpression('50%', baseCtx))).toBeCloseTo(0.5, 10);
  });

  it('supports fractions, DMS, Pol/Rec, and DRG overrides', () => {
    const fracVal = toReal(evaluateExpression('1⌟2+1⌟3', baseCtx));
    expect(fracVal).toBeCloseTo(5 / 6, 10);
    expect(formatFraction(fracVal, 'MIXED')).toBe('5⌟6');
    expect(formatFraction(7 / 3, 'MIXED')).toBe('2⌟1⌟3');
    expect(formatFraction(7 / 3, 'IMPROPER')).toBe('7⌟3');

    const dms = toReal(evaluateExpression('30°15°36°', baseCtx));
    expect(dms).toBeCloseTo(30.26, 10);
    expect(formatDMS(30.26)).toBe(`30°15'36"`);

    const vars = { ...baseCtx.variables };
    const r = toReal(evaluateExpression('Pol(3,4)', { ...baseCtx, variables: vars }));
    expect(r).toBeCloseTo(5, 10);
    expect(vars.X).toBeCloseTo(5, 10);
    expect(vars.Y).toBeCloseTo(53.13010235, 6);

    expect(toReal(evaluateExpression('sin(30°)', { ...baseCtx, angleUnit: 'RAD' }))).toBeCloseTo(0.5, 10);
  });

  it('supports CMPLX mode and rejects √(-1) in COMP mode', () => {
    expect(() => evaluateExpression('√(-4)', baseCtx)).toThrow(CalcError);
    const z = evaluateExpression('(1+2i)(3-i)', { ...baseCtx, complexMode: true });
    expect(z.re).toBeCloseTo(5, 10);
    expect(z.im).toBeCloseTo(5, 10);

    const root = evaluateExpression('√(-9)', { ...baseCtx, complexMode: true });
    expect(root.re).toBeCloseTo(0, 10);
    expect(root.im).toBeCloseTo(3, 10);

    const polar = evaluateExpression('5∠53.130102354', { ...baseCtx, complexMode: true });
    expect(polar.re).toBeCloseTo(3, 6);
    expect(polar.im).toBeCloseTo(4, 6);
  });

  it('computes numerical definite integrals ∫(expr, a, b) and derivatives d/dx(expr, x0) accurately for fx-3650P II', () => {
    expect(toReal(evaluateExpression('∫(X²,0,3)', baseCtx))).toBeCloseTo(9, 8);
    expect(toReal(evaluateExpression('∫(sin(X),0,π)', { ...baseCtx, angleUnit: 'RAD' }))).toBeCloseTo(2, 8);
    expect(toReal(evaluateExpression('d/dx(X³,2)', baseCtx))).toBeCloseTo(12, 6);
    expect(toReal(evaluateExpression('d/dx(sin(X),0)', { ...baseCtx, angleUnit: 'RAD' }))).toBeCloseTo(1, 6);
  });

  it('evaluates BASE-N arithmetic and bitwise ops', () => {
    expect(evaluateBaseN('FF+1', 'HEX', 0)).toBe(256);
    expect(evaluateBaseN('1010 and 1100', 'BIN', 0)).toBe(8);
    expect(evaluateBaseN('1010 xor 1100', 'BIN', 0)).toBe(6);
  });
});

describe('fx-50FH II built-in FMLA 01–05 formulas', () => {
  it('evaluates Formula 01 (Quadratic) for real and complex roots', () => {
    const real = evaluateBuiltInFormula('01', [2, -5, 2], 'DEG', 'NORM1', 9);
    expect(real.results[0].value.re).toBeCloseTo(2, 10);
    expect(real.results[1].value.re).toBeCloseTo(0.5, 10);

    const complex = evaluateBuiltInFormula('01', [1, 2, 5], 'DEG', 'NORM1', 9);
    expect(complex.results[0].value.re).toBeCloseTo(-1, 10);
    expect(complex.results[0].value.im).toBeCloseTo(2, 10);
    expect(complex.results[1].value.im).toBeCloseTo(-2, 10);
  });

  it('evaluates Formula 02 (Cosine Theorem), 03 (Heron), 04 P(x), 05 Q(x)', () => {
    const cosRes = evaluateBuiltInFormula('02', [5, 7, 60], 'DEG', 'NORM1', 9);
    expect(cosRes.results[0].value.re).toBeCloseTo(Math.sqrt(39), 8);

    const heron = evaluateBuiltInFormula('03', [3, 4, 5], 'DEG', 'NORM1', 9);
    expect(heron.results[0].value.re).toBeCloseTo(6, 10);

    const p196 = evaluateBuiltInFormula('04', [1.96], 'DEG', 'NORM1', 9);
    const q196 = evaluateBuiltInFormula('05', [1.96], 'DEG', 'NORM1', 9);
    expect(p196.results[0].value.re).toBeCloseTo(0.4750021, 6);
    expect(q196.results[0].value.re).toBeCloseTo(0.0249979, 6);
  });
});

describe('DSE 6-in-1 Preset Programs on Casio BASIC VM', () => {
  it('fits every preset cleanly within real fx-3650P II (390B) and fx-50FH II (680B) limits', () => {
    expect(DSE_PRESET_PROGRAMS).toHaveLength(6);
    for (const p of DSE_PRESET_PROGRAMS) {
      expect(p.bytes).toBeGreaterThan(20);
      expect(p.bytes).toBeLessThanOrEqual(220);
      expect(countProgramBytes(p.code)).toBe(p.bytes);
    }
  });

  it('runs #1 Quadratic Formula 01+ (real roots + vertex, and complex case)', () => {
    const quad = DSE_PRESET_PROGRAMS.find(p => p.id === 'quadratic-f01')!;
    const realOut = runProgramWithInputs(quad.code, ['2', '-5', '2']);
    expect(realOut.displayed).toEqual([9, 2, 0.5, 1.25, -1.125]);

    const cplxOut = runProgramWithInputs(quad.code, ['1', '2', '5']);
    expect(cplxOut.displayed).toEqual([-16, -1, 2, -1, 4]);
  });

  it('runs #2 Cosine Rule Triangle Solver (SAS & SSS)', () => {
    const cosProg = DSE_PRESET_PROGRAMS.find(p => p.id === 'cosine-triangle')!;
    const sas = runProgramWithInputs(cosProg.code, ['1', '5', '7', '60']);
    expect(sas.displayed[0]).toBeCloseTo(Math.sqrt(39), 8);
    expect(sas.displayed[1]).toBeCloseTo(0.5 * 5 * 7 * Math.sin(Math.PI / 3), 8);

    const sss = runProgramWithInputs(cosProg.code, ['2', '3', '4', '5']);
    expect(sss.displayed[0]).toBeCloseTo(90, 8);
    expect(sss.displayed[1]).toBeCloseTo(6, 8);
  });

  it('runs #3 Simultaneous Linear 2x2', () => {
    const sim = DSE_PRESET_PROGRAMS.find(p => p.id === 'simultaneous-2x2')!;
    const out = runProgramWithInputs(sim.code, ['2', '3', '13', '1', '-1', '-1']);
    expect(out.displayed[0]).toBeCloseTo(2, 10);
    expect(out.displayed[1]).toBeCloseTo(3, 10);
  });

  it('runs #4 Circle & Line Intersection', () => {
    const cl = DSE_PRESET_PROGRAMS.find(p => p.id === 'circle-line')!;
    // x²+y²-25=0 and y = x + 1 -> (3,4) and (-4,-3)
    const out = runProgramWithInputs(cl.code, ['0', '0', '-25', '1', '1']);
    expect(out.displayed[0]).toBeCloseTo(3, 8);
    expect(out.displayed[1]).toBeCloseTo(4, 8);
    expect(out.displayed[2]).toBeCloseTo(-4, 8);
    expect(out.displayed[3]).toBeCloseTo(-3, 8);
  });

  it('runs #5 Triangle Centres (G, O, H)', () => {
    const tri = DSE_PRESET_PROGRAMS.find(p => p.id === 'triangle-centres')!;
    // Right triangle (1,2), (7,2), (1,10) -> G(3, 14/3), O(4, 6), H(1, 2)
    const out = runProgramWithInputs(tri.code, ['1', '2', '7', '2', '1', '10']);
    expect(out.displayed[0]).toBeCloseTo(3, 8);
    expect(out.displayed[1]).toBeCloseTo(14 / 3, 8);
    expect(out.displayed[2]).toBeCloseTo(4, 8);
    expect(out.displayed[3]).toBeCloseTo(6, 8);
    expect(out.displayed[4]).toBeCloseTo(1, 8);
    expect(out.displayed[5]).toBeCloseTo(2, 8);
  });

  it('runs #6 Cubic Equation Solver', () => {
    const cub = DSE_PRESET_PROGRAMS.find(p => p.id === 'cubic-roots')!;
    // (x-1)(x-2)(x-3) = x³ - 6x² + 11x - 6
    const out = runProgramWithInputs(cub.code, ['1', '-6', '11', '-6']);
    const sorted = [...out.displayed].sort((a, b) => a - b);
    expect(sorted[0]).toBeCloseTo(1, 6);
    expect(sorted[1]).toBeCloseTo(2, 6);
    expect(sorted[2]).toBeCloseTo(3, 6);
  });
});

describe('Interactive Calculator State Machine (fx-50FH II default & fx-3650P II)', () => {
  it('defaults to fx-50FH II with empty P1-P4 slots', () => {
    const state = createCalculatorState();
    expect(state.model).toBe('fx-50fh-ii');
    expect(state.programs).toEqual({ 1: '', 2: '', 3: '', 4: '' });
  });

  it('executes photo-aligned SHIFT functions: 7->CONST (50FH II), (->%, )->Abs, x³->∛, EXP->π, ∫dx->d/dx (3650P II)', () => {
    let s = createCalculatorState();
    // SHIFT + ( -> %
    s = pressSeq(s, ['N2', 'N0', 'N0', 'ADD', 'N1', 'N0', 'SHIFT', 'LPAREN', 'EXE']);
    expect(s.displayResult).toBe('220');

    // SHIFT + EXP -> π
    s = pressSeq(s, ['N2', 'SHIFT', 'EXP', 'EXE']);
    expect(Number(s.displayResult)).toBeCloseTo(2 * Math.PI, 8);

    // SHIFT + 7 -> CONST 35 (g = 9.80665) on fx-50FH II
    s = pressSeq(s, ['AC', 'SHIFT', 'N7', 'N3', 'N5', 'EXE']);
    expect(Number(s.displayResult)).toBeCloseTo(9.80665, 5);

    // SHIFT + ) -> Abs(-7) = 7
    s = pressSeq(s, ['AC', 'SHIFT', 'RPAREN', 'NEG', 'N7', 'RPAREN', 'EXE']);
    expect(s.displayResult).toBe('7');

    // x³ -> 2³ = 8; SHIFT + x³ -> ∛(27) = 3
    s = pressSeq(s, ['AC', 'N2', 'CUBE', 'EXE']);
    expect(s.displayResult).toBe('8');
    s = pressSeq(s, ['AC', 'SHIFT', 'CUBE', 'N2', 'N7', 'RPAREN', 'EXE']);
    expect(s.displayResult).toBe('3');

    // CMPLX mode: SHIFT + , -> Conjg, SHIFT + ( -> arg, SHIFT + + -> ▸r∠θ, SHIFT + - -> ▸a+bi
    s = pressSeq(s, ['MODE', 'N2', 'N3', 'ADD', 'N4', 'ENG', 'EXE']);
    expect(s.displayResult).toBe('3 + 4i');
    s = pressSeq(s, ['SHIFT', 'ADD']);
    expect(s.displayResult).toContain('5∠53.1301');
    s = pressSeq(s, ['SHIFT', 'SUB']);
    expect(s.displayResult).toBe('3 + 4i');

    // BASE-N LOGIC menu on x⁻¹: 1010 and 1100 -> 1000
    s = pressSeq(s, ['MODE', 'N3', 'LOG', 'N1', 'N0', 'N1', 'N0', 'INV', 'N1', 'N1', 'N1', 'N0', 'N0', 'EXE']);
    expect(s.displayResult).toBe('1000');

    // fx-3650P II: SHIFT + ∫dx -> d/dx(X², 3) = 6
    s = switchCalculatorModel(s, 'fx-3650p-ii');
    s = pressSeq(s, ['MODE', 'N1', 'SHIFT', 'INT', 'ALPHA', 'RPAREN', 'SQ', 'COMMA', 'N3', 'RPAREN', 'EXE']);
    expect(Number(s.displayResult)).toBeCloseTo(6, 5);
  });

  it('runs built-in FMLA 01 directly from the orange FML button on fx-50FH II', () => {
    let s = createCalculatorState();
    // FML -> 0 1 -> A=1 EXE -> B=-5 EXE -> C=6 EXE -> x1=3 -> EXE -> x2=2
    s = pressSeq(s, [
      'FML', 'N0', 'N1',
      'N1', 'EXE',
      'NEG', 'N5', 'EXE',
      'N6', 'EXE',
    ]);
    expect(getLcdView(s).bottomLine).toBe('3');
    s = pressCalcKey(s, 'EXE');
    expect(getLcdView(s).bottomLine).toBe('2');
    expect(s.lastTranscript?.result).toContain('x₁ = 3');
    expect(s.lastTranscript?.result).toContain('x₂ = 2');
  });

  it('allows full manual programming via MODE 6 1 and SHIFT 3 (P-CMD) on keypad, then runs via Prog 1', () => {
    let s = createCalculatorState();
    // MODE -> 6 (PRGM) -> 1 (EDIT) -> 1 (P1)
    s = pressSeq(s, ['MODE', 'N6', 'N1', 'N1']);
    expect(s.editingSlot).toBe(1);
    // Write ?→A:A² using SHIFT 3 P-CMD & ALPHA (-)
    s = pressSeq(s, [
      'SHIFT', 'N3', 'N1', // ?
      'SHIFT', 'N3', 'N2', // →
      'ALPHA', 'NEG',      // A
      'EXE',               // :
      'ALPHA', 'NEG',      // A
      'SQ',                // ²
    ]);
    expect(s.programs[1]).toBe('?→A:A²');

    // Return to COMP (MODE 1), run Prog 1 with A=7 -> 49
    s = pressSeq(s, ['MODE', 'N1', 'PROG', 'N1']);
    expect(s.programRun?.status).toBe('prompt');
    expect(s.programRun?.promptVar).toBe('A');
    s = pressSeq(s, ['N7', 'EXE']);
    expect(s.displayResult).toBe('49');
  });

  it('handles SD statistics mode (MODE 4) and S-VAR x̄', () => {
    let s = createCalculatorState();
    s = pressSeq(s, ['MODE', 'N4', 'N1', 'N0', 'MPLUS', 'N2', 'N0', 'MPLUS', 'N3', 'N0', 'MPLUS']);
    s = pressSeq(s, ['SHIFT', 'N2', 'N1', 'EXE']); // S-VAR -> 1:x̄
    expect(s.displayResult).toBe('20');
  });

  it('switches to fx-3650P II and enforces 390-byte program memory limit', () => {
    let s = createCalculatorState();
    s = switchCalculatorModel(s, 'fx-3650p-ii');
    expect(s.model).toBe('fx-3650p-ii');
    const oversized = 'A+'.repeat(250);
    const res = loadProgramIntoSlot(s, 1, oversized);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('390');
  });

  it('sanitizes persisted calculator payloads safely', () => {
    const clean = sanitizeCalculatorState({
      model: 'invalid',
      angleUnit: 'RAD',
      formatDigits: 99,
      programs: { 1: '?→A:A+1', 2: 123 },
      variables: { A: 42, B: Infinity },
    });
    expect(clean.model).toBe(defaultCalculatorState().model);
    expect(clean.angleUnit).toBe('RAD');
    expect(clean.formatDigits).toBe(9);
    expect(clean.programs[1]).toBe('?→A:A+1');
    expect(clean.programs[2]).toBe('');
    expect(clean.variables.A).toBe(42);
    expect(clean.variables.B).toBe(0);
  });
});
