import {
  CalcError,
  SCIENTIFIC_CONSTANTS,
  addStatEntry,
  cAbs,
  cArgRad,
  cReal,
  computeStats,
  countProgramBytes,
  emptyStats,
  evaluateBaseN,
  evaluateExpression,
  formatBaseN,
  formatComplexNumber,
  formatDMS,
  formatFraction,
  formatFractionPlain,
  formatRealNumber,
  fromRadians,
  isReal,
  removeStatEntry,
  toReal,
} from './calculator-engine.ts';
import type { Complex, StatData } from './calculator-engine.ts';
import {
  BUILT_IN_FORMULAS,
  continueProgramDisplay,
  evaluateBuiltInFormula,
  formatProgramTranscript,
  startProgramRun,
  submitProgramInput,
} from './calculator-programs.ts';
import type { FormulaExecutionOutput, ProgramRunState } from './calculator-programs.ts';
import {
  MODEL_SPECS,
  PROGRAM_SLOTS,
  VARIABLE_NAMES,
  defaultCalculatorState,
  sanitizeCalculatorState,
} from './calculator-types.ts';
import type {
  AngleUnit,
  BaseRadix,
  CalculatorMode,
  CalculatorModel,
  CalculatorPersistedState,
  FractionDisplayMode,
  NumberFormatKind,
  ProgramSlotId,
  VariableName,
} from './calculator-types.ts';

export type CalcKey =
  | 'SHIFT' | 'ALPHA' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'MODE' | 'ON'
  | 'FML' | 'INT' | 'PROG' | 'INV' | 'CUBE'
  | 'FRAC' | 'SQRT' | 'SQ' | 'POW' | 'LOG' | 'LN'
  | 'NEG' | 'DMS' | 'HYP' | 'SIN' | 'COS' | 'TAN'
  | 'RCL' | 'ENG' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'MPLUS'
  | 'N7' | 'N8' | 'N9' | 'DEL' | 'AC'
  | 'N4' | 'N5' | 'N6' | 'MUL' | 'DIV'
  | 'N1' | 'N2' | 'N3' | 'ADD' | 'SUB'
  | 'N0' | 'DOT' | 'EXP' | 'ANS' | 'EXE';

export type MenuOverlay =
  | null
  | { kind: 'MODE' }
  | { kind: 'SETUP'; page: 0 | 1 }
  | { kind: 'SETUP_DIGITS'; target: 'FIX' | 'SCI' }
  | { kind: 'CLR' }
  | { kind: 'PRGM_MENU' }
  | { kind: 'PRGM_SLOT'; action: 'EDIT' | 'RUN' | 'PCL' }
  | { kind: 'P_CMD'; page: 0 | 1 | 2 | 3 }
  | { kind: 'S_SUM' }
  | { kind: 'S_VAR' }
  | { kind: 'DRG' }
  | { kind: 'LOGIC'; page: 0 | 1 }
  | { kind: 'CONST_SELECT'; buffer: string; selectedIndex: number }
  | { kind: 'FML_SELECT'; buffer: string; selectedIndex: number }
  | {
      kind: 'FML_RUN';
      formulaNumber: string;
      promptIndex: number;
      inputs: number[];
      output?: FormulaExecutionOutput;
      outputIndex: number;
    };

export interface CalculationTranscript {
  expression: string;
  result: string;
  copyAnswer: string;
  numericValue: string | null;
}

export interface CalculatorState {
  model: CalculatorModel;
  mode: CalculatorMode;
  angleUnit: AngleUnit;
  formatKind: NumberFormatKind;
  formatDigits: number;
  fractionMode: FractionDisplayMode;
  baseRadix: BaseRadix;
  autoOpenOnFocus: boolean;

  shift: boolean;
  alpha: boolean;
  hyp: boolean;
  stoPending: boolean;
  rclPending: boolean;
  insertMode: boolean;

  input: string;
  cursor: number;
  evaluated: boolean;
  error: string | null;
  notice: string | null;

  ans: Complex;
  ansInt: number;
  displayResult: string;
  displayMode: 'NORMAL' | 'FRAC' | 'DMS' | 'POLAR' | 'IM_PART';
  engShift: number;
  coordInfo: string | null;

  variables: Record<VariableName, number>;
  complexVariables: Partial<Record<VariableName, Complex>>;
  programs: Record<ProgramSlotId, string>;
  stats: StatData;

  history: string[];
  historyIndex: number;

  menu: MenuOverlay;
  editingSlot: ProgramSlotId | null;
  programRun: ProgramRunState | null;

  lastTranscript: CalculationTranscript | null;
}

export function createCalculatorState(persisted?: Partial<CalculatorPersistedState>): CalculatorState {
  const clean = sanitizeCalculatorState(persisted);
  return {
    model: clean.model,
    mode: 'COMP',
    angleUnit: clean.angleUnit,
    formatKind: clean.formatKind,
    formatDigits: clean.formatDigits,
    fractionMode: clean.fractionMode,
    baseRadix: 'DEC',
    autoOpenOnFocus: clean.autoOpenOnFocus,

    shift: false,
    alpha: false,
    hyp: false,
    stoPending: false,
    rclPending: false,
    insertMode: false,

    input: '',
    cursor: 0,
    evaluated: false,
    error: null,
    notice: null,

    ans: cReal(0),
    ansInt: 0,
    displayResult: '0',
    displayMode: 'NORMAL',
    engShift: 0,
    coordInfo: null,

    variables: { ...clean.variables },
    complexVariables: {},
    programs: { ...clean.programs },
    stats: emptyStats(),

    history: [],
    historyIndex: -1,

    menu: null,
    editingSlot: null,
    programRun: null,

    lastTranscript: null,
  };
}

export function extractPersistedState(state: CalculatorState): CalculatorPersistedState {
  return {
    model: state.model,
    angleUnit: state.angleUnit,
    formatKind: state.formatKind,
    formatDigits: state.formatDigits,
    fractionMode: state.fractionMode,
    autoOpenOnFocus: state.autoOpenOnFocus,
    programs: { ...state.programs },
    variables: { ...state.variables },
    updatedAt: new Date().toISOString(),
  };
}

export function totalProgramBytes(programs: Record<ProgramSlotId, string>): number {
  return PROGRAM_SLOTS.reduce((sum, s) => sum + countProgramBytes(programs[s] ?? ''), 0);
}

export function remainingProgramBytes(model: CalculatorModel, programs: Record<ProgramSlotId, string>): number {
  return Math.max(0, MODEL_SPECS[model].maxProgramBytes - totalProgramBytes(programs));
}

// ---------- LCD View Derivation ----------

export interface LcdView {
  indicators: {
    S: boolean;
    A: boolean;
    M: boolean;
    STO: boolean;
    RCL: boolean;
    HYP: boolean;
    CMPLX: boolean;
    SD: boolean;
    BASE: BaseRadix | null;
    PRGM: boolean;
    ANGLE: 'D' | 'R' | 'G';
    FIX: boolean;
    SCI: boolean;
    DISP: boolean;
    INS: boolean;
  };
  topLine: string;
  bottomLine: string;
  cursorPos: number | null;
  subLabel: string | null;
}

export function getLcdView(state: CalculatorState): LcdView {
  const indicators = {
    S: state.shift,
    A: state.alpha,
    M: Math.abs(state.variables.M) > 1e-12,
    STO: state.stoPending,
    RCL: state.rclPending,
    HYP: state.hyp,
    CMPLX: state.mode === 'CMPLX',
    SD: state.mode === 'SD',
    BASE: state.mode === 'BASE' ? state.baseRadix : null,
    PRGM: state.editingSlot !== null || state.programRun !== null || state.mode === 'PRGM',
    ANGLE: (state.angleUnit === 'DEG' ? 'D' : state.angleUnit === 'RAD' ? 'R' : 'G') as 'D' | 'R' | 'G',
    FIX: state.formatKind === 'FIX',
    SCI: state.formatKind === 'SCI',
    DISP:
      state.programRun?.status === 'display' ||
      (state.menu?.kind === 'FML_RUN' &&
        !!state.menu.output &&
        state.menu.outputIndex < state.menu.output.results.length - 1),
    INS: state.insertMode,
  };

  if (state.error) {
    return {
      indicators,
      topLine: state.error,
      bottomLine: '[AC]:Cancel  [◀][▶]:Edit',
      cursorPos: null,
      subLabel: null,
    };
  }

  if (state.menu) {
    switch (state.menu.kind) {
      case 'MODE':
        return {
          indicators,
          topLine: '1:COMP  2:CMPLX  3:BASE',
          bottomLine: '4:SD    5:REG    6:PRGM',
          cursorPos: null,
          subLabel: 'MODE',
        };
      case 'SETUP':
        return state.menu.page === 0
          ? {
              indicators,
              topLine: '1:Deg   2:Rad   3:Gra',
              bottomLine: '4:Fix   5:Sci   6:Norm ▶',
              cursorPos: null,
              subLabel: 'SETUP 1/2',
            }
          : {
              indicators,
              topLine: '1:a b/c 2:d/c   3:Norm1',
              bottomLine: '◀ 4:Norm2',
              cursorPos: null,
              subLabel: 'SETUP 2/2',
            };
      case 'SETUP_DIGITS':
        return {
          indicators,
          topLine: `${state.menu.target} 0~9 ?`,
          bottomLine: 'Press 0 - 9',
          cursorPos: null,
          subLabel: 'SETUP',
        };
      case 'CLR':
        return {
          indicators,
          topLine: '1:Mcl   2:Mode  3:All',
          bottomLine: 'Clear ?',
          cursorPos: null,
          subLabel: 'CLR',
        };
      case 'PRGM_MENU': {
        const free = remainingProgramBytes(state.model, state.programs);
        return {
          indicators,
          topLine: '1:EDIT  2:RUN   3:PCL',
          bottomLine: `Free ${free}/${MODEL_SPECS[state.model].maxProgramBytes}B`,
          cursorPos: null,
          subLabel: 'PRGM',
        };
      }
      case 'PRGM_SLOT': {
        const tag =
          state.menu.action === 'EDIT' ? 'Edit' : state.menu.action === 'RUN' ? 'Run' : 'Clear';
        const sizes = PROGRAM_SLOTS.map(s => `${s}:${countProgramBytes(state.programs[s])}B`).join(' ');
        return {
          indicators,
          topLine: `${tag} P1 P2 P3 P4 ?`,
          bottomLine: sizes,
          cursorPos: null,
          subLabel: `PRGM ${tag.toUpperCase()}`,
        };
      }
      case 'P_CMD': {
        const pages: [string, string][] = [
          ['1:?   2:→   3::   4:◢', 'Page 1/4 [▶]'],
          ['1:⇒   2:=   3:≠   4:>', '◀ Page 2/4 ▶'],
          ['1:≥   2:<   3:≤   4:Lbl', '◀ Page 3/4 ▶'],
          ['1:Goto  2:ClrMemory', '◀ Page 4/4'],
        ];
        const [topLine, bottomLine] = pages[state.menu.page];
        return { indicators, topLine, bottomLine, cursorPos: null, subLabel: 'P-CMD' };
      }
      case 'S_SUM':
        return {
          indicators,
          topLine: '1:Σx²   2:Σx    3:n',
          bottomLine: `SD (n=${state.stats.entries.reduce((a, e) => a + e.freq, 0)})`,
          cursorPos: null,
          subLabel: 'S-SUM',
        };
      case 'S_VAR':
        return {
          indicators,
          topLine: '1:x̄    2:xσn   3:xσn-1',
          bottomLine: `SD (n=${state.stats.entries.reduce((a, e) => a + e.freq, 0)})`,
          cursorPos: null,
          subLabel: 'S-VAR',
        };
      case 'DRG':
        return {
          indicators,
          topLine: '1:°     2:ʳ     3:ᵍ',
          bottomLine: 'Angle unit suffix',
          cursorPos: null,
          subLabel: 'DRG▸',
        };
      case 'LOGIC':
        return state.menu.page === 0
          ? {
              indicators,
              topLine: '1:and 2:or 3:xor 4:xnor',
              bottomLine: 'Page 1/2 [▶]',
              cursorPos: null,
              subLabel: 'LOGIC',
            }
          : {
              indicators,
              topLine: '1:Not   2:Neg',
              bottomLine: '◀ Page 2/2',
              cursorPos: null,
              subLabel: 'LOGIC',
            };
      case 'CONST_SELECT': {
        const c = SCIENTIFIC_CONSTANTS[state.menu.selectedIndex] ?? SCIENTIFIC_CONSTANTS[0];
        return {
          indicators,
          topLine: `CONST 01~40 ? ${state.menu.buffer || c.number}`,
          bottomLine: `${c.number}:${c.symbol} (${c.nameEn})`,
          cursorPos: null,
          subLabel: 'CONST [▲▼ / 01-40]',
        };
      }
      case 'FML_SELECT': {
        const f = BUILT_IN_FORMULAS[state.menu.selectedIndex] ?? BUILT_IN_FORMULAS[0];
        const tag = f.available ? f.formulaExpr : 'Phase 2 / 二期開放';
        return {
          indicators,
          topLine: `Formula No.? ${state.menu.buffer || f.number}`,
          bottomLine: `${f.number}:${f.titleEn.slice(0, 14)} · ${tag}`,
          cursorPos: null,
          subLabel: 'FMLA [▲▼ / 01-05]',
        };
      }
      case 'FML_RUN': {
        const f = BUILT_IN_FORMULAS.find(x => x.number === state.menu!.kind && false) ??
          BUILT_IN_FORMULAS.find(x => x.number === (state.menu as { formulaNumber: string }).formulaNumber)!;
        if (state.menu.output) {
          const item = state.menu.output.results[state.menu.outputIndex];
          const formatted = formatComplexNumber(item.value, state.formatKind, state.formatDigits);
          const hasMore = state.menu.outputIndex < state.menu.output.results.length - 1;
          return {
            indicators,
            topLine: `FMLA ${f.number}: ${item.label} =`,
            bottomLine: formatted,
            cursorPos: null,
            subLabel: hasMore ? 'Disp [EXE ▶]' : 'Done [EXE:Again / AC]',
          };
        }
        const prompt = f.prompts![state.menu.promptIndex];
        return {
          indicators,
          topLine: `${prompt.name}? ${state.input}`,
          bottomLine: '0',
          cursorPos: `${prompt.name}? `.length + state.cursor,
          subLabel: `FMLA ${f.number} · ${f.formulaExpr}`,
        };
      }
    }
  }

  if (state.editingSlot !== null) {
    const used = totalProgramBytes(state.programs);
    const max = MODEL_SPECS[state.model].maxProgramBytes;
    return {
      indicators,
      topLine: state.input || ' ',
      bottomLine: state.notice ?? `P${state.editingSlot} EDIT · ${used}/${max}B`,
      cursorPos: state.cursor,
      subLabel: `EDIT P${state.editingSlot}`,
    };
  }

  if (state.programRun) {
    if (state.programRun.status === 'prompt') {
      const prefix = `${state.programRun.promptVar}? `;
      return {
        indicators,
        topLine: `${prefix}${state.input}`,
        bottomLine: state.notice ?? `${state.programRun.programLabel} · Input`,
        cursorPos: prefix.length + state.cursor,
        subLabel: state.programRun.programLabel,
      };
    }
    if (state.programRun.status === 'display') {
      return {
        indicators,
        topLine: `${state.programRun.programLabel} ◢`,
        bottomLine: state.displayResult,
        cursorPos: null,
        subLabel: 'Disp [EXE ▶]',
      };
    }
  }

  return {
    indicators,
    topLine: state.input || (state.notice ?? ''),
    bottomLine: state.displayResult,
    cursorPos: state.evaluated ? null : state.cursor,
    subLabel: state.coordInfo ?? (state.notice && state.input ? state.notice : null),
  };
}

// ---------- Helper Mutators ----------

const KEY_TO_DIGIT: Partial<Record<CalcKey, string>> = {
  N0: '0', N1: '1', N2: '2', N3: '3', N4: '4',
  N5: '5', N6: '6', N7: '7', N8: '8', N9: '9',
};

const KEY_TO_ALPHA_VAR: Partial<Record<CalcKey, VariableName>> = {
  NEG: 'A',
  DMS: 'B',
  HYP: 'C',
  SIN: 'D',
  RPAREN: 'X',
  COMMA: 'Y',
  MPLUS: 'M',
};

const KEY_TO_HEX: Partial<Record<CalcKey, string>> = {
  NEG: 'A',
  DMS: 'B',
  HYP: 'C',
  SIN: 'D',
  COS: 'E',
  TAN: 'F',
};

function clearModifiers(state: CalculatorState): CalculatorState {
  return { ...state, shift: false, alpha: false, hyp: false, stoPending: false, rclPending: false };
}

function insertToken(state: CalculatorState, token: string, continueFromAns = false): CalculatorState {
  const s = clearModifiers({ ...state, error: null, notice: null, coordInfo: null });
  let baseInput = s.input;
  let baseCursor = s.cursor;

  if (s.evaluated && s.editingSlot === null && !s.programRun && !s.menu) {
    baseInput = continueFromAns ? 'Ans' : '';
    baseCursor = baseInput.length;
  }

  let nextInput: string;
  let nextCursor: number;
  if (s.insertMode && baseCursor < baseInput.length) {
    nextInput = baseInput.slice(0, baseCursor) + token + baseInput.slice(baseCursor + 1);
    nextCursor = baseCursor + token.length;
  } else {
    nextInput = baseInput.slice(0, baseCursor) + token + baseInput.slice(baseCursor);
    nextCursor = baseCursor + token.length;
  }

  if (s.editingSlot !== null) {
    const nextPrograms = { ...s.programs, [s.editingSlot]: nextInput };
    if (totalProgramBytes(nextPrograms) > MODEL_SPECS[s.model].maxProgramBytes) {
      return { ...s, notice: 'Mem ERROR (Byte limit)' };
    }
    return {
      ...s,
      input: nextInput,
      cursor: nextCursor,
      evaluated: false,
      programs: nextPrograms,
    };
  }

  return {
    ...s,
    input: nextInput,
    cursor: nextCursor,
    evaluated: false,
  };
}

function formatCurrentDisplay(state: CalculatorState): string {
  if (state.mode === 'BASE') {
    return formatBaseN(state.ansInt, state.baseRadix);
  }
  if (state.displayMode === 'FRAC' && isReal(state.ans)) {
    const f = formatFraction(state.ans.re, state.fractionMode);
    if (f) return f;
  }
  if (state.displayMode === 'DMS' && isReal(state.ans)) {
    return formatDMS(state.ans.re);
  }
  if (state.displayMode === 'POLAR' && state.mode === 'CMPLX') {
    const r = formatRealNumber(cAbs(state.ans), state.formatKind, state.formatDigits);
    const ang = formatRealNumber(
      fromRadians(cArgRad(state.ans), state.angleUnit),
      state.formatKind,
      state.formatDigits,
    );
    const sym = state.angleUnit === 'DEG' ? '°' : state.angleUnit === 'RAD' ? 'r' : 'g';
    return `${r}∠${ang}${sym}`;
  }
  if (state.displayMode === 'IM_PART' && state.mode === 'CMPLX') {
    return `${formatRealNumber(state.ans.im, state.formatKind, state.formatDigits)}i`;
  }
  return formatComplexNumber(state.ans, state.formatKind, state.formatDigits, state.engShift);
}

// ---------- Menu & Execution Handlers ----------

function handleMenuKey(state: CalculatorState, key: CalcKey): CalculatorState {
  const menu = state.menu!;
  if (key === 'AC' || key === 'ON') {
    return clearModifiers({
      ...state,
      menu: null,
      input: state.editingSlot !== null ? state.programs[state.editingSlot] : '',
      cursor: state.editingSlot !== null ? state.programs[state.editingSlot].length : 0,
      notice: null,
      error: null,
    });
  }

  const digit = KEY_TO_DIGIT[key];

  if (menu.kind === 'MODE') {
    if (key === 'MODE') return clearModifiers({ ...state, menu: null });
    if (digit === '1') {
      return clearModifiers({ ...state, mode: 'COMP', menu: null, editingSlot: null, programRun: null, input: '', cursor: 0, displayResult: '0', notice: null });
    }
    if (digit === '2') {
      return clearModifiers({ ...state, mode: 'CMPLX', menu: null, editingSlot: null, programRun: null, input: '', cursor: 0, displayResult: '0', notice: null });
    }
    if (digit === '3') {
      return clearModifiers({ ...state, mode: 'BASE', baseRadix: 'DEC', menu: null, editingSlot: null, programRun: null, input: '', cursor: 0, ansInt: 0, displayResult: '0', notice: null });
    }
    if (digit === '4') {
      return clearModifiers({ ...state, mode: 'SD', menu: null, editingSlot: null, programRun: null, input: '', cursor: 0, displayResult: '0', notice: null });
    }
    if (digit === '5') {
      return clearModifiers({ ...state, menu: null, notice: 'REG: Phase 2 / 二期開放' });
    }
    if (digit === '6') {
      return clearModifiers({ ...state, menu: { kind: 'PRGM_MENU' }, editingSlot: null, programRun: null });
    }
    return state;
  }

  if (menu.kind === 'SETUP') {
    if (key === 'RIGHT' || key === 'DOWN') return { ...state, menu: { kind: 'SETUP', page: 1 } };
    if (key === 'LEFT' || key === 'UP') return { ...state, menu: { kind: 'SETUP', page: 0 } };
    if (menu.page === 0) {
      if (digit === '1') return clearModifiers({ ...state, angleUnit: 'DEG', menu: null });
      if (digit === '2') return clearModifiers({ ...state, angleUnit: 'RAD', menu: null });
      if (digit === '3') return clearModifiers({ ...state, angleUnit: 'GRA', menu: null });
      if (digit === '4') return clearModifiers({ ...state, menu: { kind: 'SETUP_DIGITS', target: 'FIX' } });
      if (digit === '5') return clearModifiers({ ...state, menu: { kind: 'SETUP_DIGITS', target: 'SCI' } });
      if (digit === '6') {
        const next = clearModifiers({ ...state, formatKind: 'NORM1' as NumberFormatKind, menu: null, engShift: 0 });
        return { ...next, displayResult: formatCurrentDisplay(next) };
      }
    } else {
      if (digit === '1') {
        const next = clearModifiers({ ...state, fractionMode: 'MIXED' as FractionDisplayMode, menu: null });
        return { ...next, displayResult: formatCurrentDisplay(next) };
      }
      if (digit === '2') {
        const next = clearModifiers({ ...state, fractionMode: 'IMPROPER' as FractionDisplayMode, menu: null });
        return { ...next, displayResult: formatCurrentDisplay(next) };
      }
      if (digit === '3') {
        const next = clearModifiers({ ...state, formatKind: 'NORM1' as NumberFormatKind, menu: null, engShift: 0 });
        return { ...next, displayResult: formatCurrentDisplay(next) };
      }
      if (digit === '4') {
        const next = clearModifiers({ ...state, formatKind: 'NORM2' as NumberFormatKind, menu: null, engShift: 0 });
        return { ...next, displayResult: formatCurrentDisplay(next) };
      }
    }
    return state;
  }

  if (menu.kind === 'SETUP_DIGITS') {
    if (digit !== undefined) {
      const next = clearModifiers({
        ...state,
        formatKind: menu.target,
        formatDigits: Number(digit),
        menu: null,
        engShift: 0,
      });
      return { ...next, displayResult: formatCurrentDisplay(next) };
    }
    return state;
  }

  if (menu.kind === 'CLR') {
    if (digit === '1') {
      return clearModifiers({
        ...state,
        menu: null,
        variables: { A: 0, B: 0, C: 0, D: 0, X: 0, Y: 0, M: 0 },
        complexVariables: {},
        stats: emptyStats(),
        ans: cReal(0),
        displayResult: '0',
        notice: 'Mem Clear',
      });
    }
    if (digit === '2') {
      return clearModifiers({
        ...state,
        menu: null,
        mode: 'COMP',
        angleUnit: 'DEG',
        formatKind: 'NORM1',
        formatDigits: 9,
        fractionMode: 'MIXED',
        displayMode: 'NORMAL',
        engShift: 0,
        editingSlot: null,
        programRun: null,
        notice: 'Mode Clear',
      });
    }
    if (digit === '3') {
      return createCalculatorState({
        ...defaultCalculatorState(),
        model: state.model,
        autoOpenOnFocus: state.autoOpenOnFocus,
      });
    }
    return state;
  }

  if (menu.kind === 'PRGM_MENU') {
    if (digit === '1') return clearModifiers({ ...state, menu: { kind: 'PRGM_SLOT', action: 'EDIT' } });
    if (digit === '2') return clearModifiers({ ...state, menu: { kind: 'PRGM_SLOT', action: 'RUN' } });
    if (digit === '3') return clearModifiers({ ...state, menu: { kind: 'PRGM_SLOT', action: 'PCL' } });
    return state;
  }

  if (menu.kind === 'PRGM_SLOT') {
    if (digit === '1' || digit === '2' || digit === '3' || digit === '4') {
      const slot = Number(digit) as ProgramSlotId;
      if (menu.action === 'EDIT') {
        const src = state.programs[slot] ?? '';
        return clearModifiers({
          ...state,
          mode: 'PRGM',
          menu: null,
          editingSlot: slot,
          programRun: null,
          input: src,
          cursor: src.length,
          evaluated: false,
          notice: null,
        });
      }
      if (menu.action === 'PCL') {
        const nextPrograms = { ...state.programs, [slot]: '' };
        return clearModifiers({
          ...state,
          programs: nextPrograms,
          menu: null,
          notice: `P${slot} Cleared`,
        });
      }
      if (menu.action === 'RUN') {
        return launchProgramSlot(state, slot);
      }
    }
    return state;
  }

  if (menu.kind === 'P_CMD') {
    if (key === 'RIGHT' || key === 'DOWN') {
      return { ...state, menu: { kind: 'P_CMD', page: ((menu.page + 1) % 4) as 0 | 1 | 2 | 3 } };
    }
    if (key === 'LEFT' || key === 'UP') {
      return { ...state, menu: { kind: 'P_CMD', page: ((menu.page + 3) % 4) as 0 | 1 | 2 | 3 } };
    }
    const table: Record<number, Record<string, string>> = {
      0: { '1': '?', '2': '→', '3': ':', '4': '◢' },
      1: { '1': '⇒', '2': '=', '3': '≠', '4': '>' },
      2: { '1': '≥', '2': '<', '3': '≤', '4': 'Lbl ' },
      3: { '1': 'Goto ', '2': 'ClrMemory' },
    };
    const token = digit ? table[menu.page]?.[digit] : undefined;
    if (token) {
      return insertToken({ ...state, menu: null }, token);
    }
    return state;
  }

  if (menu.kind === 'S_SUM') {
    const map: Record<string, string> = { '1': 'Σx²', '2': 'Σx', '3': 'n' };
    if (digit && map[digit]) return insertToken({ ...state, menu: null }, map[digit]);
    return state;
  }

  if (menu.kind === 'S_VAR') {
    const map: Record<string, string> = { '1': 'x̄', '2': 'xσn', '3': 'xσn-1' };
    if (digit && map[digit]) return insertToken({ ...state, menu: null }, map[digit]);
    return state;
  }

  if (menu.kind === 'DRG') {
    const map: Record<string, string> = { '1': '°', '2': 'ʳ', '3': 'ᵍ' };
    if (digit && map[digit]) return insertToken({ ...state, menu: null }, map[digit], true);
    return state;
  }

  if (menu.kind === 'LOGIC') {
    if (key === 'RIGHT' || key === 'DOWN') return { ...state, menu: { kind: 'LOGIC', page: 1 } };
    if (key === 'LEFT' || key === 'UP') return { ...state, menu: { kind: 'LOGIC', page: 0 } };
    const token =
      menu.page === 0
        ? digit
          ? { '1': ' and ', '2': ' or ', '3': ' xor ', '4': ' xnor ' }[digit]
          : undefined
        : digit
          ? { '1': 'Not(', '2': 'Neg(' }[digit]
          : undefined;
    if (token) return insertToken({ ...state, menu: null }, token, menu.page === 0);
    return state;
  }

  if (menu.kind === 'CONST_SELECT') {
    if (key === 'UP' || key === 'LEFT') {
      const nextIdx = (menu.selectedIndex + SCIENTIFIC_CONSTANTS.length - 1) % SCIENTIFIC_CONSTANTS.length;
      return { ...state, menu: { kind: 'CONST_SELECT', buffer: '', selectedIndex: nextIdx } };
    }
    if (key === 'DOWN' || key === 'RIGHT') {
      const nextIdx = (menu.selectedIndex + 1) % SCIENTIFIC_CONSTANTS.length;
      return { ...state, menu: { kind: 'CONST_SELECT', buffer: '', selectedIndex: nextIdx } };
    }
    if (key === 'DEL') {
      return { ...state, menu: { ...menu, buffer: menu.buffer.slice(0, -1) } };
    }
    const insertConstant = (numStr: string) => {
      const found = SCIENTIFIC_CONSTANTS.find(c => c.number === numStr.padStart(2, '0'));
      if (!found) return clearModifiers({ ...state, error: 'Arg ERROR', menu: null });
      const literal = String(found.value).replace('e+', 'ᴇ').replace('e', 'ᴇ');
      return insertToken({ ...state, menu: null, notice: `${found.symbol} = ${found.value}` }, literal);
    };
    if (digit !== undefined) {
      const nextBuf = (menu.buffer + digit).slice(-2);
      const parsed = Number(nextBuf);
      const foundIdx = SCIENTIFIC_CONSTANTS.findIndex(c => Number(c.number) === parsed);
      const selectedIndex = foundIdx >= 0 ? foundIdx : menu.selectedIndex;
      if (nextBuf.length === 2 && foundIdx >= 0) {
        return insertConstant(SCIENTIFIC_CONSTANTS[foundIdx].number);
      }
      return { ...state, menu: { kind: 'CONST_SELECT', buffer: nextBuf, selectedIndex } };
    }
    if (key === 'EXE') {
      const targetNum = menu.buffer
        ? menu.buffer.padStart(2, '0')
        : SCIENTIFIC_CONSTANTS[menu.selectedIndex].number;
      return insertConstant(targetNum);
    }
    return state;
  }

  if (menu.kind === 'FML_SELECT') {
    if (key === 'UP' || key === 'LEFT') {
      const nextIdx = (menu.selectedIndex + BUILT_IN_FORMULAS.length - 1) % BUILT_IN_FORMULAS.length;
      return { ...state, menu: { kind: 'FML_SELECT', buffer: '', selectedIndex: nextIdx } };
    }
    if (key === 'DOWN' || key === 'RIGHT') {
      const nextIdx = (menu.selectedIndex + 1) % BUILT_IN_FORMULAS.length;
      return { ...state, menu: { kind: 'FML_SELECT', buffer: '', selectedIndex: nextIdx } };
    }
    if (key === 'DEL') {
      return { ...state, menu: { ...menu, buffer: menu.buffer.slice(0, -1) } };
    }
    if (digit !== undefined) {
      const nextBuf = (menu.buffer + digit).slice(-2);
      const parsed = Number(nextBuf);
      const foundIdx = BUILT_IN_FORMULAS.findIndex(f => Number(f.number) === parsed);
      const selectedIndex = foundIdx >= 0 ? foundIdx : menu.selectedIndex;
      if (nextBuf.length === 2 && foundIdx >= 0) {
        return startFormulaRun(state, BUILT_IN_FORMULAS[foundIdx].number);
      }
      return { ...state, menu: { kind: 'FML_SELECT', buffer: nextBuf, selectedIndex } };
    }
    if (key === 'EXE') {
      const targetNum = menu.buffer
        ? menu.buffer.padStart(2, '0')
        : BUILT_IN_FORMULAS[menu.selectedIndex].number;
      return startFormulaRun(state, targetNum);
    }
    return state;
  }

  if (menu.kind === 'FML_RUN') {
    if (menu.output) {
      if (key === 'EXE') {
        if (menu.outputIndex < menu.output.results.length - 1) {
          const nextIndex = menu.outputIndex + 1;
          const val = menu.output.results[nextIndex].value;
          return {
            ...state,
            ans: val,
            displayResult: formatComplexNumber(val, state.formatKind, state.formatDigits),
            menu: { ...menu, outputIndex: nextIndex },
          };
        }
        // Re-run same formula when EXE pressed at end
        return startFormulaRun(state, menu.formulaNumber);
      }
      return state;
    }

    if (key === 'EXE') {
      const f = BUILT_IN_FORMULAS.find(x => x.number === menu.formulaNumber)!;
      try {
        const val = toReal(
          evaluateExpression(state.input.trim() || '0', {
            angleUnit: state.angleUnit,
            complexMode: false,
            variables: state.variables,
            ans: state.ans,
            stats: state.stats,
            formatKind: state.formatKind,
            formatDigits: state.formatDigits,
          }),
        );
        const nextInputs = [...menu.inputs, val];
        if (nextInputs.length < (f.prompts?.length ?? 0)) {
          return clearModifiers({
            ...state,
            input: '',
            cursor: 0,
            menu: {
              ...menu,
              promptIndex: nextInputs.length,
              inputs: nextInputs,
            },
          });
        }
        const output = evaluateBuiltInFormula(
          f.number,
          nextInputs,
          state.angleUnit,
          state.formatKind,
          state.formatDigits,
        );
        const firstVal = output.results[0].value;
        const firstStr = formatComplexNumber(firstVal, state.formatKind, state.formatDigits);
        const lastVal = output.results.at(-1)!.value;
        return clearModifiers({
          ...state,
          input: '',
          cursor: 0,
          ans: firstVal,
          displayResult: firstStr,
          menu: { ...menu, inputs: nextInputs, output, outputIndex: 0 },
          lastTranscript: {
            expression: output.transcriptExpression,
            result: output.transcriptResult,
            copyAnswer: output.transcriptResult,
            numericValue: isReal(lastVal) ? String(Number(lastVal.re.toPrecision(10))) : null,
          },
        });
      } catch (e) {
        const msg = e instanceof CalcError ? e.code : 'Math ERROR';
        return clearModifiers({ ...state, error: msg, menu: null });
      }
    }

    // Allow normal editing keys inside formula prompt input
    return dispatchInputEditKey(state, key);
  }

  return state;
}

export function startFormulaRun(state: CalculatorState, formulaNumber: string): CalculatorState {
  const f = BUILT_IN_FORMULAS.find(x => x.number === formulaNumber);
  if (!f) return clearModifiers({ ...state, error: 'Arg ERROR', menu: null });
  if (!f.available) {
    return clearModifiers({
      ...state,
      menu: null,
      notice: `FMLA ${f.number} (${f.titleEn}): 二期開放`,
    });
  }
  return clearModifiers({
    ...state,
    error: null,
    notice: null,
    input: '',
    cursor: 0,
    evaluated: false,
    menu: {
      kind: 'FML_RUN',
      formulaNumber: f.number,
      promptIndex: 0,
      inputs: [],
      outputIndex: 0,
    },
  });
}

export function launchProgramSlot(state: CalculatorState, slot: ProgramSlotId): CalculatorState {
  const src = (state.programs[slot] ?? '').trim();
  if (!src) {
    return clearModifiers({
      ...state,
      menu: null,
      notice: `P${slot} Empty (MODE 6 1)`,
    });
  }
  try {
    const run = startProgramRun(`P${slot}`, src, {
      variables: state.variables,
      complexVariables: state.complexVariables,
      ans: state.ans,
      angleUnit: state.angleUnit,
      complexMode: state.mode === 'CMPLX',
      formatKind: state.formatKind,
      formatDigits: state.formatDigits,
      stats: state.stats,
    });
    return applyProgramRunResult(state, run);
  } catch (e) {
    const msg = e instanceof CalcError ? e.code : 'Syntax ERROR';
    return clearModifiers({ ...state, menu: null, programRun: null, error: msg });
  }
}

function applyProgramRunResult(state: CalculatorState, run: ProgramRunState): CalculatorState {
  const ans = run.displayValue ?? run.ans;
  const formatted = formatComplexNumber(ans, state.formatKind, state.formatDigits);
  const transcript = formatProgramTranscript(run);
  const nextBase: CalculatorState = clearModifiers({
    ...state,
    menu: null,
    editingSlot: null,
    error: null,
    notice: null,
    input: '',
    cursor: 0,
    variables: { ...run.variables },
    complexVariables: { ...run.complexVariables },
    ans,
    displayResult: formatted,
    displayMode: 'NORMAL',
    engShift: 0,
  });

  if (run.status === 'done') {
    return {
      ...nextBase,
      programRun: null,
      evaluated: true,
      lastTranscript: {
        expression: transcript.expression,
        result: transcript.result,
        copyAnswer: transcript.result,
        numericValue: isReal(ans) ? String(Number(ans.re.toPrecision(10))) : null,
      },
    };
  }
  return {
    ...nextBase,
    programRun: run,
    evaluated: false,
    lastTranscript:
      run.outputsRecorded.length > 0
        ? {
            expression: transcript.expression,
            result: transcript.result,
            copyAnswer: formatted,
            numericValue: isReal(ans) ? String(Number(ans.re.toPrecision(10))) : null,
          }
        : state.lastTranscript,
  };
}

// ---------- Editing / Scientific Input Keys ----------

function dispatchInputEditKey(state: CalculatorState, key: CalcKey): CalculatorState {
  const { shift, alpha, hyp } = state;

  if (key === 'SHIFT') return { ...state, shift: !shift, alpha: false };
  if (key === 'ALPHA') return { ...state, alpha: !alpha, shift: false };

  if (key === 'LEFT') {
    if (state.evaluated && state.editingSlot === null && !state.programRun && !state.menu) {
      return clearModifiers({ ...state, evaluated: false, cursor: state.input.length });
    }
    return clearModifiers({ ...state, cursor: Math.max(0, state.cursor - 1) });
  }
  if (key === 'RIGHT') {
    if (state.evaluated && state.editingSlot === null && !state.programRun && !state.menu) {
      return clearModifiers({ ...state, evaluated: false, cursor: 0 });
    }
    return clearModifiers({ ...state, cursor: Math.min(state.input.length, state.cursor + 1) });
  }

  if (key === 'DEL') {
    if (shift) return clearModifiers({ ...state, insertMode: !state.insertMode });
    if (!state.input.length) return clearModifiers(state);
    const pos = state.evaluated ? state.input.length : state.cursor;
    if (pos <= 0) return clearModifiers(state);
    const nextInput = state.input.slice(0, pos - 1) + state.input.slice(pos);
    const nextPrograms =
      state.editingSlot !== null ? { ...state.programs, [state.editingSlot]: nextInput } : state.programs;
    return clearModifiers({
      ...state,
      input: nextInput,
      cursor: pos - 1,
      evaluated: false,
      programs: nextPrograms,
    });
  }

  // ALPHA variable letters (A, B, C, D, X, Y, M, e)
  if (alpha) {
    if (key === 'LN') return insertToken(state, 'e');
    const v = KEY_TO_ALPHA_VAR[key];
    if (v) return insertToken(state, v);
    return clearModifiers(state);
  }

  // SHIFT secondary keys (1:1 aligned to physical fx-50FH II & fx-3650P II photos!)
  if (shift) {
    switch (key) {
      case 'N3':
        return clearModifiers({ ...state, menu: { kind: 'P_CMD', page: 0 } });
      case 'N1':
        if (state.mode === 'SD' || state.editingSlot !== null) {
          return clearModifiers({ ...state, menu: { kind: 'S_SUM' } });
        }
        return clearModifiers({ ...state, notice: 'SD mode (MODE 4)' });
      case 'N2':
        if (state.mode === 'SD' || state.editingSlot !== null) {
          return clearModifiers({ ...state, menu: { kind: 'S_VAR' } });
        }
        return clearModifiers({ ...state, notice: 'SD mode (MODE 4)' });
      case 'N7':
        if (state.model === 'fx-50fh-ii') {
          return clearModifiers({
            ...state,
            menu: { kind: 'CONST_SELECT', buffer: '', selectedIndex: 27 }, // highlight c0 / browse 01-40
          });
        }
        return clearModifiers(state);
      case 'N0':
        return insertToken(state, 'Rnd(');
      case 'DOT':
        return insertToken(state, 'Ran#');
      case 'EXP':
        return insertToken(state, 'π');
      case 'ANS':
        return clearModifiers({ ...state, menu: { kind: 'DRG' } });
      case 'LPAREN':
        if (state.mode === 'CMPLX' && state.editingSlot === null) {
          return insertToken(state, 'arg(');
        }
        return insertToken(state, '%', true);
      case 'RPAREN':
        return insertToken(state, 'Abs(');
      case 'COMMA':
        if (state.mode === 'CMPLX' && state.editingSlot === null) {
          return insertToken(state, 'Conjg(');
        }
        return insertToken(state, ';', true);
      case 'NEG':
        return insertToken(state, '∠', true);
      case 'DMS':
        if (state.evaluated && isReal(state.ans) && state.editingSlot === null) {
          const nextMode = state.displayMode === 'DMS' ? 'NORMAL' : 'DMS';
          const next = clearModifiers({ ...state, displayMode: nextMode as CalculatorState['displayMode'], engShift: 0 });
          return { ...next, displayResult: formatCurrentDisplay(next) };
        }
        return clearModifiers(state);
      case 'INV':
        if (state.mode === 'BASE' && state.editingSlot === null) {
          return clearModifiers({ ...state, menu: { kind: 'LOGIC', page: 0 } });
        }
        return insertToken(state, '!', true);
      case 'CUBE':
        return insertToken(state, '∛(');
      case 'ADD':
        if (state.mode === 'CMPLX' && state.evaluated && state.editingSlot === null) {
          const next = clearModifiers({ ...state, displayMode: 'POLAR' as const });
          return { ...next, displayResult: formatCurrentDisplay(next) };
        }
        return insertToken(state, 'Pol(');
      case 'SUB':
        if (state.mode === 'CMPLX' && state.evaluated && state.editingSlot === null) {
          const next = clearModifiers({ ...state, displayMode: 'NORMAL' as const });
          return { ...next, displayResult: formatCurrentDisplay(next) };
        }
        return insertToken(state, 'Rec(');
      case 'MUL':
        return insertToken(state, 'nPr', true);
      case 'DIV':
        return insertToken(state, 'nCr', true);
      case 'POW':
        return insertToken(state, 'x√', true);
      case 'LOG':
        return insertToken(state, '10^');
      case 'LN':
        return insertToken(state, 'e^');
      case 'SIN':
        return insertToken(state, hyp ? 'sinh⁻¹(' : 'sin⁻¹(');
      case 'COS':
        return insertToken(state, hyp ? 'cosh⁻¹(' : 'cos⁻¹(');
      case 'TAN':
        return insertToken(state, hyp ? 'tanh⁻¹(' : 'tan⁻¹(');
      case 'INT':
        return insertToken(state, 'd/dx(');
      case 'FRAC': {
        if (state.evaluated && isReal(state.ans) && state.editingSlot === null) {
          const nextFrac: FractionDisplayMode = state.fractionMode === 'MIXED' ? 'IMPROPER' : 'MIXED';
          const next = clearModifiers({
            ...state,
            fractionMode: nextFrac,
            displayMode: 'FRAC' as const,
          });
          return { ...next, displayResult: formatCurrentDisplay(next) };
        }
        return clearModifiers(state);
      }
      case 'ENG': {
        if (state.evaluated && isReal(state.ans) && state.editingSlot === null) {
          const next = clearModifiers({ ...state, displayMode: 'NORMAL' as const, engShift: state.engShift + 1 });
          return { ...next, displayResult: formatCurrentDisplay(next) };
        }
        return clearModifiers(state);
      }
      default:
        return clearModifiers(state);
    }
  }

  // Primary keys
  const digit = KEY_TO_DIGIT[key];
  if (digit !== undefined) return insertToken(state, digit);

  // In BASE-N mode, HEX letters A-F on (-), °'", hyp, sin, cos, tan, and base selectors on x², ^, log, ln
  if (state.mode === 'BASE' && state.editingSlot === null && !state.programRun) {
    if (key === 'SQ') return switchBaseRadix(state, 'DEC');
    if (key === 'POW') return switchBaseRadix(state, 'HEX');
    if (key === 'LOG') return switchBaseRadix(state, 'BIN');
    if (key === 'LN') return switchBaseRadix(state, 'OCT');
    if (state.baseRadix === 'HEX' && KEY_TO_HEX[key]) {
      return insertToken(state, KEY_TO_HEX[key]!);
    }
  }

  switch (key) {
    case 'DOT':
      return insertToken(state, '.');
    case 'EXP':
      return insertToken(state, 'ᴇ');
    case 'ANS':
      return insertToken(state, 'Ans');
    case 'ADD':
      return insertToken(state, '+', true);
    case 'SUB':
      return insertToken(state, '−', true);
    case 'MUL':
      return insertToken(state, '×', true);
    case 'DIV':
      return insertToken(state, '÷', true);
    case 'LPAREN':
      return insertToken(state, '(');
    case 'RPAREN':
      return insertToken(state, ')');
    case 'COMMA':
      return insertToken(state, ',');
    case 'NEG':
      return insertToken(state, '-');
    case 'FRAC':
      if (state.evaluated && isReal(state.ans) && state.editingSlot === null && !state.programRun) {
        const nextMode = state.displayMode === 'FRAC' ? 'NORMAL' : 'FRAC';
        const next = clearModifiers({ ...state, displayMode: nextMode as CalculatorState['displayMode'], engShift: 0 });
        return { ...next, displayResult: formatCurrentDisplay(next) };
      }
      return insertToken(state, '⌟', true);
    case 'DMS':
      if (state.evaluated && isReal(state.ans) && state.editingSlot === null && !state.programRun) {
        const nextMode = state.displayMode === 'DMS' ? 'NORMAL' : 'DMS';
        const next = clearModifiers({ ...state, displayMode: nextMode as CalculatorState['displayMode'], engShift: 0 });
        return { ...next, displayResult: formatCurrentDisplay(next) };
      }
      return insertToken(state, '°', true);
    case 'SQRT':
      return insertToken(state, '√(');
    case 'SQ':
      return insertToken(state, '²', true);
    case 'POW':
      return insertToken(state, '^', true);
    case 'INV':
      if (state.mode === 'BASE' && state.editingSlot === null) {
        return clearModifiers({ ...state, menu: { kind: 'LOGIC', page: 0 } });
      }
      return insertToken(state, '⁻¹', true);
    case 'CUBE':
      return insertToken(state, '³', true);
    case 'LOG':
      return insertToken(state, 'log(');
    case 'LN':
      return insertToken(state, 'ln(');
    case 'HYP':
      return { ...state, hyp: !hyp, shift: false, alpha: false };
    case 'SIN':
      return insertToken(state, hyp ? 'sinh(' : 'sin(');
    case 'COS':
      return insertToken(state, hyp ? 'cosh(' : 'cos(');
    case 'TAN':
      return insertToken(state, hyp ? 'tan(' : 'tan(');
    case 'INT':
      return insertToken(state, '∫(');
    case 'ENG':
      if (state.mode === 'CMPLX' && state.editingSlot === null) {
        return insertToken(state, 'i');
      }
      if (state.evaluated && isReal(state.ans) && state.editingSlot === null) {
        const next = clearModifiers({ ...state, displayMode: 'NORMAL' as const, engShift: state.engShift - 1 });
        return { ...next, displayResult: formatCurrentDisplay(next) };
      }
      return clearModifiers(state);
    default:
      return clearModifiers(state);
  }
}

function switchBaseRadix(state: CalculatorState, radix: BaseRadix): CalculatorState {
  const next = clearModifiers({
    ...state,
    baseRadix: radix,
    input: '',
    cursor: 0,
    evaluated: true,
  });
  return { ...next, displayResult: formatBaseN(next.ansInt, radix) };
}

// ---------- Main Key Dispatcher ----------

export function pressCalcKey(state: CalculatorState, key: CalcKey): CalculatorState {
  // Error state recovery
  if (state.error) {
    if (key === 'AC' || key === 'ON') {
      return clearModifiers({ ...state, error: null, input: '', cursor: 0, evaluated: false });
    }
    if (key === 'LEFT' || key === 'RIGHT') {
      return clearModifiers({ ...state, error: null, evaluated: false, cursor: state.input.length });
    }
    return state;
  }

  // Active menu intercepts keys
  if (state.menu) {
    return handleMenuKey(state, key);
  }

  // Active STO / RCL target selection
  if (state.stoPending || state.rclPending) {
    const varName = KEY_TO_ALPHA_VAR[key];
    if (key === 'AC' || key === 'ON') return clearModifiers(state);
    if (!varName) return clearModifiers(state);

    if (state.rclPending) {
      const val =
        state.mode === 'CMPLX' && state.complexVariables[varName]
          ? state.complexVariables[varName]!
          : cReal(state.variables[varName] ?? 0);
      return clearModifiers({
        ...state,
        ans: val,
        displayResult: formatComplexNumber(val, state.formatKind, state.formatDigits),
        notice: `${varName} =`,
        evaluated: true,
      });
    }

    // STO: evaluate input if present, else store current Ans
    try {
      const val =
        state.input.trim() && !state.evaluated
          ? evaluateExpression(state.input, {
              angleUnit: state.angleUnit,
              complexMode: state.mode === 'CMPLX',
              variables: state.variables,
              complexVariables: state.complexVariables,
              ans: state.ans,
              stats: state.stats,
              formatKind: state.formatKind,
              formatDigits: state.formatDigits,
            })
          : state.ans;
      const nextVars = { ...state.variables, [varName]: val.re };
      const nextComplex = { ...state.complexVariables, [varName]: val };
      const formatted = formatComplexNumber(val, state.formatKind, state.formatDigits);
      return clearModifiers({
        ...state,
        variables: nextVars,
        complexVariables: nextComplex,
        ans: val,
        displayResult: formatted,
        notice: `→ ${varName}`,
        evaluated: true,
      });
    } catch (e) {
      const msg = e instanceof CalcError ? e.code : 'Syntax ERROR';
      return clearModifiers({ ...state, error: msg });
    }
  }

  // Global System Keys
  if (key === 'MODE') {
    if (state.shift) {
      return clearModifiers({ ...state, menu: { kind: 'SETUP', page: 0 } });
    }
    return clearModifiers({ ...state, menu: { kind: 'MODE' } });
  }

  if (key === 'N9' && state.shift) {
    return clearModifiers({ ...state, menu: { kind: 'CLR' } });
  }

  if (key === 'ON' || key === 'AC') {
    if (key === 'AC' && state.shift) {
      // Soft power-reset screen while preserving memories & programs
      return clearModifiers({
        ...state,
        input: '',
        cursor: 0,
        evaluated: false,
        displayResult: '0',
        editingSlot: null,
        programRun: null,
        menu: null,
        notice: 'Ready',
      });
    }
    if (state.editingSlot !== null) {
      // In PRGM EDIT, AC clears the slot input or exits if already empty
      if (state.input === '') {
        return clearModifiers({ ...state, editingSlot: null, mode: 'COMP', displayResult: '0' });
      }
      const nextPrograms = { ...state.programs, [state.editingSlot]: '' };
      return clearModifiers({ ...state, input: '', cursor: 0, programs: nextPrograms, notice: `P${state.editingSlot} Empty` });
    }
    return clearModifiers({
      ...state,
      input: '',
      cursor: 0,
      evaluated: false,
      displayResult: state.mode === 'BASE' ? formatBaseN(state.ansInt, state.baseRadix) : '0',
      displayMode: 'NORMAL',
      engShift: 0,
      coordInfo: null,
      programRun: null,
      notice: null,
    });
  }

  if (key === 'PROG') {
    if (state.shift) {
      // SHIFT + Prog = EXIT program/edit mode
      return clearModifiers({
        ...state,
        editingSlot: null,
        programRun: null,
        mode: state.mode === 'PRGM' ? 'COMP' : state.mode,
        input: '',
        cursor: 0,
        displayResult: formatCurrentDisplay({ ...state, editingSlot: null, programRun: null }),
        notice: null,
      });
    }
    if (state.editingSlot !== null) {
      return insertToken(state, 'Prog ');
    }
    return clearModifiers({ ...state, menu: { kind: 'PRGM_SLOT', action: 'RUN' } });
  }

  if (key === 'FML' && !state.shift) {
    if (MODEL_SPECS[state.model].hasBuiltInFormula) {
      return clearModifiers({
        ...state,
        editingSlot: null,
        programRun: null,
        menu: { kind: 'FML_SELECT', buffer: '', selectedIndex: 0 },
      });
    }
    return clearModifiers({ ...state, notice: 'Switch to fx-50FH II for FMLA' });
  }

  // Active Program Execution Mode
  if (state.programRun) {
    if (state.programRun.status === 'display') {
      if (key === 'EXE') {
        try {
          const nextRun = continueProgramDisplay(state.programRun);
          return applyProgramRunResult(state, nextRun);
        } catch (e) {
          const msg = e instanceof CalcError ? e.code : 'Math ERROR';
          return clearModifiers({ ...state, programRun: null, error: msg });
        }
      }
      return state;
    }
    if (state.programRun.status === 'prompt') {
      if (key === 'EXE') {
        try {
          const nextRun = submitProgramInput(state.programRun, state.input);
          return applyProgramRunResult(state, nextRun);
        } catch (e) {
          const msg = e instanceof CalcError ? e.code : 'Math ERROR';
          return clearModifiers({ ...state, programRun: null, error: msg });
        }
      }
      return dispatchInputEditKey(state, key);
    }
  }

  // PRGM EDIT mode: EXE inserts ':' statement separator
  if (state.editingSlot !== null) {
    if (key === 'EXE') {
      return insertToken(state, ':');
    }
    return dispatchInputEditKey(state, key);
  }

  // RCL / STO keys
  if (key === 'RCL' && !state.alpha) {
    if (state.shift) return { ...clearModifiers(state), stoPending: true };
    return { ...clearModifiers(state), rclPending: true };
  }

  // M+ / M- (and DT / CL in SD mode!)
  if (key === 'MPLUS' && !state.alpha) {
    if (state.mode === 'SD') {
      try {
        const raw = state.input.trim();
        if (!raw) return clearModifiers(state);
        const parts = raw.split(';');
        const xVal = toReal(
          evaluateExpression(parts[0], {
            angleUnit: state.angleUnit,
            complexMode: false,
            variables: state.variables,
            ans: state.ans,
            stats: state.stats,
          }),
        );
        const freq = parts[1]
          ? toReal(
              evaluateExpression(parts[1], {
                angleUnit: state.angleUnit,
                complexMode: false,
                variables: state.variables,
                ans: state.ans,
                stats: state.stats,
              }),
            )
          : 1;
        const nextStats = state.shift
          ? removeStatEntry(state.stats, xVal, freq)
          : addStatEntry(state.stats, xVal, freq);
        const totalN = nextStats.entries.reduce((a, e) => a + e.freq, 0);
        return clearModifiers({
          ...state,
          stats: nextStats,
          input: '',
          cursor: 0,
          evaluated: true,
          ans: cReal(totalN),
          displayResult: `n = ${totalN}`,
          notice: state.shift ? 'CL Data removed' : 'DT Data stored',
        });
      } catch (e) {
        const msg = e instanceof CalcError ? e.code : 'Math ERROR';
        return clearModifiers({ ...state, error: msg });
      }
    }

    // COMP / CMPLX M+ and M-
    try {
      const val =
        state.input.trim() && !state.evaluated
          ? evaluateExpression(state.input, {
              angleUnit: state.angleUnit,
              complexMode: state.mode === 'CMPLX',
              variables: state.variables,
              complexVariables: state.complexVariables,
              ans: state.ans,
              stats: state.stats,
            })
          : state.ans;
      const delta = toReal(val);
      const nextM = state.shift ? state.variables.M - delta : state.variables.M + delta;
      return clearModifiers({
        ...state,
        variables: { ...state.variables, M: nextM },
        ans: val,
        displayResult: formatComplexNumber(val, state.formatKind, state.formatDigits),
        notice: state.shift ? `M- (${formatRealNumber(nextM, state.formatKind, state.formatDigits)})` : `M+ (${formatRealNumber(nextM, state.formatKind, state.formatDigits)})`,
        evaluated: true,
      });
    } catch (e) {
      const msg = e instanceof CalcError ? e.code : 'Math ERROR';
      return clearModifiers({ ...state, error: msg });
    }
  }

  // History Replay with UP / DOWN
  if (key === 'UP' && state.history.length > 0) {
    const nextIdx =
      state.historyIndex < 0 ? state.history.length - 1 : Math.max(0, state.historyIndex - 1);
    const expr = state.history[nextIdx];
    return clearModifiers({
      ...state,
      input: expr,
      cursor: expr.length,
      evaluated: false,
      historyIndex: nextIdx,
    });
  }
  if (key === 'DOWN' && state.history.length > 0 && state.historyIndex >= 0) {
    const nextIdx = state.historyIndex + 1;
    if (nextIdx >= state.history.length) {
      return clearModifiers({ ...state, input: '', cursor: 0, evaluated: false, historyIndex: -1 });
    }
    const expr = state.history[nextIdx];
    return clearModifiers({
      ...state,
      input: expr,
      cursor: expr.length,
      evaluated: false,
      historyIndex: nextIdx,
    });
  }

  // SHIFT + EXE = Re↔Im in CMPLX mode
  if (key === 'EXE' && state.shift && state.mode === 'CMPLX') {
    const nextMode = state.displayMode === 'IM_PART' ? 'NORMAL' : 'IM_PART';
    const next = clearModifiers({ ...state, displayMode: nextMode as CalculatorState['displayMode'] });
    return { ...next, displayResult: formatCurrentDisplay(next) };
  }

  // Main EXE evaluation
  if (key === 'EXE') {
    const expr = state.input.trim();
    if (!expr) return clearModifiers(state);

    if (state.mode === 'BASE') {
      try {
        const res = evaluateBaseN(expr, state.baseRadix, state.ansInt);
        const formatted = formatBaseN(res, state.baseRadix);
        return clearModifiers({
          ...state,
          ansInt: res,
          ans: cReal(res),
          displayResult: formatted,
          evaluated: true,
          history: [...state.history.slice(-29), expr],
          historyIndex: -1,
          lastTranscript: {
            expression: `${expr} (${state.baseRadix})`,
            result: formatted,
            copyAnswer: formatted,
            numericValue: state.baseRadix === 'DEC' ? String(res) : formatted,
          },
        });
      } catch (e) {
        const msg = e instanceof CalcError ? e.code : 'Syntax ERROR';
        return clearModifiers({ ...state, error: msg });
      }
    }

    // Support multi-statement ':' inside COMP/CMPLX expressions
    try {
      const statements = expr.split(':').map(s => s.trim()).filter(Boolean);
      let nextVars = { ...state.variables };
      let nextComplexVars = { ...state.complexVariables };
      let currentAns = state.ans;
      let coordInfo: string | null = null;

      for (const st of statements) {
        currentAns = evaluateExpression(st, {
          angleUnit: state.angleUnit,
          complexMode: state.mode === 'CMPLX',
          variables: nextVars,
          complexVariables: nextComplexVars,
          ans: currentAns,
          stats: state.stats,
          formatKind: state.formatKind,
          formatDigits: state.formatDigits,
          onAssign: (name, v) => {
            nextVars[name] = v.re;
            nextComplexVars[name] = v;
          },
          onCoordResult: (kind, first, second) => {
            const f1 = formatRealNumber(first, state.formatKind, state.formatDigits);
            const f2 = formatRealNumber(second, state.formatKind, state.formatDigits);
            coordInfo = kind === 'Pol' ? `r=${f1}, θ=${f2}` : `x=${f1}, y=${f2}`;
          },
        });
      }

      const usedFrac = expr.includes('⌟');
      const nextDisplayMode: CalculatorState['displayMode'] =
        usedFrac && isReal(currentAns) && formatFraction(currentAns.re, state.fractionMode)
          ? 'FRAC'
          : 'NORMAL';

      const nextState: CalculatorState = clearModifiers({
        ...state,
        variables: nextVars,
        complexVariables: nextComplexVars,
        ans: currentAns,
        displayMode: nextDisplayMode,
        engShift: 0,
        coordInfo,
        evaluated: true,
        history: [...state.history.slice(-29), expr],
        historyIndex: -1,
      });

      const lcdResult = formatCurrentDisplay(nextState);
      const plainFrac =
        nextDisplayMode === 'FRAC' && isReal(currentAns)
          ? formatFractionPlain(currentAns.re, state.fractionMode)
          : null;
      const copyResult = plainFrac ?? formatComplexNumber(currentAns, state.formatKind, state.formatDigits);
      const plainExpr = expr.replace(/⌟/g, '/').replace(/ᴇ/g, '×10^');

      return {
        ...nextState,
        displayResult: lcdResult,
        lastTranscript: {
          expression: plainExpr,
          result: coordInfo ? `${copyResult} (${coordInfo})` : copyResult,
          copyAnswer: copyResult,
          numericValue: isReal(currentAns)
            ? String(Number(currentAns.re.toPrecision(10)))
            : null,
        },
      };
    } catch (e) {
      const msg = e instanceof CalcError ? e.code : 'Syntax ERROR';
      return clearModifiers({ ...state, error: msg });
    }
  }

  return dispatchInputEditKey(state, key);
}

// ---------- Utility Actions (Model Switch, Load Preset into P1-P4, etc.) ----------

export function switchCalculatorModel(state: CalculatorState, model: CalculatorModel): CalculatorState {
  if (state.model === model) return state;
  return clearModifiers({
    ...state,
    model,
    menu: null,
    editingSlot: null,
    programRun: null,
    notice: MODEL_SPECS[model].name,
  });
}

export function loadProgramIntoSlot(
  state: CalculatorState,
  slot: ProgramSlotId,
  code: string,
): { state: CalculatorState; ok: boolean; error?: string } {
  const nextPrograms = { ...state.programs, [slot]: code };
  const used = totalProgramBytes(nextPrograms);
  const max = MODEL_SPECS[state.model].maxProgramBytes;
  if (used > max) {
    return {
      state,
      ok: false,
      error: `超出 ${MODEL_SPECS[state.model].name} 程式容量上限（${used}/${max} bytes），請先清除其他槽位或切換至 fx-50FH II（680 bytes）。`,
    };
  }
  return {
    state: clearModifiers({
      ...state,
      programs: nextPrograms,
      editingSlot: null,
      programRun: null,
      menu: null,
      notice: `Loaded → P${slot} (${countProgramBytes(code)}B)`,
    }),
    ok: true,
  };
}

export function clearProgramSlot(state: CalculatorState, slot: ProgramSlotId): CalculatorState {
  return clearModifiers({
    ...state,
    programs: { ...state.programs, [slot]: '' },
    editingSlot: state.editingSlot === slot ? null : state.editingSlot,
    notice: `P${slot} Cleared`,
  });
}

export function mapKeyboardEventToKey(e: {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}): CalcKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case '0': return 'N0';
    case '1': return 'N1';
    case '2': return 'N2';
    case '3': return 'N3';
    case '4': return 'N4';
    case '5': return 'N5';
    case '6': return 'N6';
    case '7': return 'N7';
    case '8': return 'N8';
    case '9': return 'N9';
    case '.': return 'DOT';
    case '+': return 'ADD';
    case '-': return 'SUB';
    case '*': return 'MUL';
    case '/': return 'DIV';
    case '(': return 'LPAREN';
    case ')': return 'RPAREN';
    case '^': return 'POW';
    case ',': return 'COMMA';
    case 'Enter':
    case '=':
      return 'EXE';
    case 'Backspace':
    case 'Delete':
      return 'DEL';
    case 'Escape':
      return 'AC';
    case 'ArrowLeft': return 'LEFT';
    case 'ArrowRight': return 'RIGHT';
    case 'ArrowUp': return 'UP';
    case 'ArrowDown': return 'DOWN';
    default:
      return null;
  }
}

export { computeStats };
