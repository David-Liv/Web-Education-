export type CalculatorModel = 'fx-50fh-ii' | 'fx-3650p-ii';
export type CalculatorMode = 'COMP' | 'CMPLX' | 'BASE' | 'SD' | 'REG' | 'PRGM';
export type AngleUnit = 'DEG' | 'RAD' | 'GRA';
export type NumberFormatKind = 'NORM1' | 'NORM2' | 'FIX' | 'SCI';
export type FractionDisplayMode = 'MIXED' | 'IMPROPER';
export type BaseRadix = 'DEC' | 'HEX' | 'BIN' | 'OCT';
export type ProgramSlotId = 1 | 2 | 3 | 4;
export type VariableName = 'A' | 'B' | 'C' | 'D' | 'X' | 'Y' | 'M';

export const PROGRAM_SLOTS: readonly ProgramSlotId[] = [1, 2, 3, 4] as const;
export const VARIABLE_NAMES: readonly VariableName[] = ['A', 'B', 'C', 'D', 'X', 'Y', 'M'] as const;

export interface ModelSpec {
  id: CalculatorModel;
  name: string;
  subtitle: string;
  maxProgramBytes: number;
  hasBuiltInFormula: boolean;
  hasIntegral: boolean;
}

export const MODEL_SPECS: Record<CalculatorModel, ModelSpec> = {
  'fx-50fh-ii': {
    id: 'fx-50fh-ii',
    name: 'fx-50FH II',
    subtitle: 'SUPER-FX PLUS',
    maxProgramBytes: 680,
    hasBuiltInFormula: true,
    hasIntegral: false,
  },
  'fx-3650p-ii': {
    id: 'fx-3650p-ii',
    name: 'fx-3650P II',
    subtitle: 'SUPER-FX PLUS',
    maxProgramBytes: 390,
    hasBuiltInFormula: false,
    hasIntegral: true,
  },
};

export interface CalculatorPersistedState {
  model: CalculatorModel;
  angleUnit: AngleUnit;
  formatKind: NumberFormatKind;
  formatDigits: number;
  fractionMode: FractionDisplayMode;
  autoOpenOnFocus: boolean;
  programs: Record<ProgramSlotId, string>;
  variables: Record<VariableName, number>;
  updatedAt?: string;
}

export function defaultCalculatorState(): CalculatorPersistedState {
  return {
    model: 'fx-50fh-ii',
    angleUnit: 'DEG',
    formatKind: 'NORM1',
    formatDigits: 9,
    fractionMode: 'MIXED',
    autoOpenOnFocus: true,
    programs: { 1: '', 2: '', 3: '', 4: '' },
    variables: { A: 0, B: 0, C: 0, D: 0, X: 0, Y: 0, M: 0 },
  };
}

const VALID_MODELS: readonly CalculatorModel[] = ['fx-50fh-ii', 'fx-3650p-ii'];
const VALID_ANGLES: readonly AngleUnit[] = ['DEG', 'RAD', 'GRA'];
const VALID_FORMATS: readonly NumberFormatKind[] = ['NORM1', 'NORM2', 'FIX', 'SCI'];
const VALID_FRACTIONS: readonly FractionDisplayMode[] = ['MIXED', 'IMPROPER'];

export function sanitizeCalculatorState(raw: unknown): CalculatorPersistedState {
  const base = defaultCalculatorState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.model === 'string' && (VALID_MODELS as readonly string[]).includes(obj.model)) {
    base.model = obj.model as CalculatorModel;
  }
  if (typeof obj.angleUnit === 'string' && (VALID_ANGLES as readonly string[]).includes(obj.angleUnit)) {
    base.angleUnit = obj.angleUnit as AngleUnit;
  }
  if (typeof obj.formatKind === 'string' && (VALID_FORMATS as readonly string[]).includes(obj.formatKind)) {
    base.formatKind = obj.formatKind as NumberFormatKind;
  }
  if (typeof obj.formatDigits === 'number' && Number.isInteger(obj.formatDigits)) {
    base.formatDigits = Math.max(0, Math.min(9, obj.formatDigits));
  }
  if (typeof obj.fractionMode === 'string' && (VALID_FRACTIONS as readonly string[]).includes(obj.fractionMode)) {
    base.fractionMode = obj.fractionMode as FractionDisplayMode;
  }
  if (typeof obj.autoOpenOnFocus === 'boolean') {
    base.autoOpenOnFocus = obj.autoOpenOnFocus;
  }
  if (obj.programs && typeof obj.programs === 'object' && !Array.isArray(obj.programs)) {
    const progs = obj.programs as Record<string, unknown>;
    for (const slot of PROGRAM_SLOTS) {
      const value = progs[String(slot)];
      if (typeof value === 'string') {
        base.programs[slot] = value.slice(0, 2000);
      }
    }
  }
  if (obj.variables && typeof obj.variables === 'object' && !Array.isArray(obj.variables)) {
    const vars = obj.variables as Record<string, unknown>;
    for (const name of VARIABLE_NAMES) {
      const value = vars[name];
      if (typeof value === 'number' && Number.isFinite(value)) {
        base.variables[name] = value;
      }
    }
  }
  if (typeof obj.updatedAt === 'string' && obj.updatedAt.length <= 64) {
    base.updatedAt = obj.updatedAt;
  }
  return base;
}
