import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { api, realMode } from './api/client';
import { Icon } from './components';
import { ui, useInterfaceLanguage } from './i18n';
import { useApp } from './state';
import { countProgramBytes } from './calculator-engine';
import {
  clearProgramSlot,
  createCalculatorState,
  extractPersistedState,
  getLcdView,
  launchProgramSlot,
  loadProgramIntoSlot,
  mapKeyboardEventToKey,
  pressCalcKey,
  remainingProgramBytes,
  switchCalculatorModel,
  totalProgramBytes,
} from './calculator-machine';
import type { CalcKey, CalculatorState } from './calculator-machine';
import { DSE_PRESET_PROGRAMS } from './calculator-programs';
import {
  MODEL_SPECS,
  PROGRAM_SLOTS,
  sanitizeCalculatorState,
} from './calculator-types';
import type {
  CalculatorModel,
  CalculatorPersistedState,
  ProgramSlotId,
} from './calculator-types';

type MathInputEl = HTMLInputElement | HTMLTextAreaElement;

interface CalculatorContextValue {
  open: boolean;
  state: CalculatorState;
  keyboardCapture: boolean;
  openCalculator: (target?: MathInputEl | null) => void;
  closeCalculator: () => void;
  toggleCalculator: () => void;
  registerMathInput: (el: MathInputEl | null) => void;
}

const CalculatorContext = createContext<CalculatorContextValue | null>(null);

function storageKeyFor(ownerId: string): string {
  return `hokse.calculator.v1.${ownerId}`;
}

function readLocalCalculator(ownerId: string): CalculatorPersistedState | null {
  try {
    const raw = localStorage.getItem(storageKeyFor(ownerId));
    if (!raw) return null;
    return sanitizeCalculatorState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocalCalculator(ownerId: string, data: CalculatorPersistedState): void {
  try {
    localStorage.setItem(storageKeyFor(ownerId), JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

function insertTextIntoReactInput(el: MathInputEl, text: string): boolean {
  if (!el.isConnected || el.disabled || el.readOnly) return false;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const isNumericOnly =
    el.dataset.mathCalc === 'numeric' ||
    el.getAttribute('inputmode') === 'decimal' ||
    el.type === 'number';
  const nextVal = isNumericOnly
    ? text
    : el.value.slice(0, start) + text + el.value.slice(end);

  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, nextVal);
  else el.value = nextVal;

  el.dispatchEvent(new Event('input', { bubbles: true }));
  try {
    const caret = isNumericOnly ? nextVal.length : start + text.length;
    el.focus({ preventScroll: true });
    el.setSelectionRange(caret, caret);
  } catch {
    // Ignore selection errors on number inputs
  }
  return true;
}

export function CalculatorProvider({ children }: { children: ReactNode }) {
  const { db, toast } = useApp();
  const ownerId = db.pilot?.identity.id ?? 'demo';

  const [state, setState] = useState<CalculatorState>(() => {
    const remote = db.calculator ? sanitizeCalculatorState(db.calculator) : null;
    const local = readLocalCalculator(ownerId);
    const initial =
      remote && (!local || (remote.updatedAt ?? '') >= (local.updatedAt ?? ''))
        ? remote
        : local ?? remote ?? undefined;
    return createCalculatorState(initial);
  });

  const [open, setOpen] = useState(false);
  const [keyboardCapture, setKeyboardCapture] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const lastTargetRef = useRef<MathInputEl | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sessionDismissedRef = useRef(false);
  const hydratedOwnerRef = useRef(ownerId);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignatureRef = useRef('');

  useEffect(() => {
    document.body.classList.toggle('dse-calc-open', open);
    return () => {
      document.body.classList.remove('dse-calc-open');
    };
  }, [open]);

  // Re-hydrate when switching logged-in account or receiving fresh remote state
  useEffect(() => {
    if (hydratedOwnerRef.current !== ownerId) {
      hydratedOwnerRef.current = ownerId;
      const remote = db.calculator ? sanitizeCalculatorState(db.calculator) : null;
      const local = readLocalCalculator(ownerId);
      const chosen =
        remote && (!local || (remote.updatedAt ?? '') >= (local.updatedAt ?? ''))
          ? remote
          : local ?? remote ?? undefined;
      setState(createCalculatorState(chosen));
      lastSavedSignatureRef.current = '';
    }
  }, [ownerId, db.calculator]);

  // Persist user settings, programs & variables (localStorage immediately + debounced PUT /calculator in realMode)
  const persistedSnapshot = useMemo(
    () => ({
      model: state.model,
      angleUnit: state.angleUnit,
      formatKind: state.formatKind,
      formatDigits: state.formatDigits,
      fractionMode: state.fractionMode,
      autoOpenOnFocus: state.autoOpenOnFocus,
      programs: state.programs,
      variables: state.variables,
    }),
    [
      state.model,
      state.angleUnit,
      state.formatKind,
      state.formatDigits,
      state.fractionMode,
      state.autoOpenOnFocus,
      state.programs,
      state.variables,
    ],
  );

  useEffect(() => {
    const signature = JSON.stringify(persistedSnapshot);
    if (!lastSavedSignatureRef.current) {
      lastSavedSignatureRef.current = signature;
      return;
    }
    if (signature === lastSavedSignatureRef.current) return;
    lastSavedSignatureRef.current = signature;

    const payload = extractPersistedState(state);
    writeLocalCalculator(ownerId, payload);

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      void api('/calculator', 'PUT', payload).catch(() => {
        // Keep local cache silently if offline or rate-limited
      });
    }, realMode ? 550 : 250);

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [persistedSnapshot, ownerId]);

  // Track focus on tagged math/science inputs & auto-open beside input if enabled
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (
        !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) ||
        !target.dataset.mathCalc
      ) {
        return;
      }
      lastTargetRef.current = target;
      setKeyboardCapture(false);
      if (state.autoOpenOnFocus && !sessionDismissedRef.current) {
        setOpen(true);
      }
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [state.autoOpenOnFocus]);

  // Global Alt+C toggle for keyboard capture & keyboard key routing when captured
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        if (!open) {
          sessionDismissedRef.current = false;
          setOpen(true);
          setKeyboardCapture(true);
        } else {
          setKeyboardCapture(prev => {
            const next = !prev;
            if (!next && lastTargetRef.current?.isConnected) {
              lastTargetRef.current.focus({ preventScroll: true });
            }
            return next;
          });
        }
        return;
      }

      if (!open || !keyboardCapture) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement
      ) {
        // Never hijack if user manually focused an input box
        if (!active.closest('.dse-calc-shell')) {
          setKeyboardCapture(false);
          return;
        }
      }

      const mapped = mapKeyboardEventToKey(e);
      if (mapped) {
        e.preventDefault();
        setState(old => pressCalcKey(old, mapped));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, keyboardCapture]);

  const openCalculator = useCallback((target?: MathInputEl | null) => {
    if (target) lastTargetRef.current = target;
    sessionDismissedRef.current = false;
    setOpen(true);
  }, []);

  const closeCalculator = useCallback(() => {
    sessionDismissedRef.current = true;
    setKeyboardCapture(false);
    setOpen(false);
  }, []);

  const toggleCalculator = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      sessionDismissedRef.current = !next;
      if (!next) setKeyboardCapture(false);
      return next;
    });
  }, []);

  const registerMathInput = useCallback((el: MathInputEl | null) => {
    if (el) lastTargetRef.current = el;
  }, []);

  const handleKey = useCallback((key: CalcKey) => {
    setState(old => pressCalcKey(old, key));
  }, []);

  const handleSwitchModel = useCallback((model: CalculatorModel) => {
    setState(old => switchCalculatorModel(old, model));
  }, []);

  const handleToggleAutoOpen = useCallback(() => {
    sessionDismissedRef.current = false;
    setState(old => ({ ...old, autoOpenOnFocus: !old.autoOpenOnFocus }));
  }, []);

  const handleInsertFormulaAndResult = useCallback(() => {
    const rec = state.lastTranscript;
    if (!rec) {
      toast('請先在計數機按 EXE 計算出結果', 'error');
      return;
    }
    const target = lastTargetRef.current;
    const isNumericOnly =
      !!target &&
      (target.dataset.mathCalc === 'numeric' ||
        target.getAttribute('inputmode') === 'decimal' ||
        target.type === 'number');

    const fullLine = rec.result.includes('=')
      ? `${rec.expression} ⇒ ${rec.result}`
      : `${rec.expression} = ${rec.result}`;
    const textToInsert = isNumericOnly ? (rec.numericValue ?? rec.copyAnswer) : fullLine;

    if (target && insertTextIntoReactInput(target, textToInsert)) {
      toast(isNumericOnly ? '已填入數值結果到作答框' : '已將算式與結果填入作答框');
      return;
    }
    void navigator.clipboard?.writeText(fullLine).then(
      () => toast('未選中作答框，已複製算式與結果'),
      () => toast('請先點選一個數學作答框', 'error'),
    );
  }, [state.lastTranscript, toast]);

  const handleCopyAnswer = useCallback(() => {
    const rec = state.lastTranscript;
    const val = rec?.copyAnswer ?? state.displayResult;
    if (!val) return;
    void navigator.clipboard?.writeText(val).then(
      () => toast(ui('已複製答案：{0}', [val])),
      () => toast('瀏覽器未允許存取剪貼簿', 'error'),
    );
  }, [state.lastTranscript, state.displayResult, toast]);

  const handleLoadPreset = useCallback(
    (slot: ProgramSlotId, code: string, title: string) => {
      const res = loadProgramIntoSlot(stateRef.current, slot, code);
      if (!res.ok) {
        toast(res.error ?? '超出程式空間上限', 'error');
        return;
      }
      setState(res.state);
      toast(ui('已將「{0}」寫入 P{1}', [title, slot]));
    },
    [toast],
  );

  const handleRunSlot = useCallback((slot: ProgramSlotId) => {
    setState(old => launchProgramSlot(old, slot));
    setLibraryOpen(false);
  }, []);

  const handleEditSlot = useCallback((slot: ProgramSlotId) => {
    setState(old => ({
      ...old,
      mode: 'PRGM',
      menu: null,
      editingSlot: slot,
      programRun: null,
      input: old.programs[slot] ?? '',
      cursor: (old.programs[slot] ?? '').length,
      evaluated: false,
      notice: null,
      error: null,
    }));
    setLibraryOpen(false);
  }, []);

  const handleClearSlot = useCallback((slot: ProgramSlotId) => {
    setState(old => clearProgramSlot(old, slot));
  }, []);

  return (
    <CalculatorContext.Provider
      value={{
        open,
        state,
        keyboardCapture,
        openCalculator,
        closeCalculator,
        toggleCalculator,
        registerMathInput,
      }}
    >
      {children}
      {open && (
        <CalculatorDeskPanel
          state={state}
          keyboardCapture={keyboardCapture}
          libraryOpen={libraryOpen}
          onToggleLibrary={() => setLibraryOpen(v => !v)}
          onToggleKeyboardCapture={() => setKeyboardCapture(v => !v)}
          onKey={handleKey}
          onSwitchModel={handleSwitchModel}
          onToggleAutoOpen={handleToggleAutoOpen}
          onInsertFormulaAndResult={handleInsertFormulaAndResult}
          onCopyAnswer={handleCopyAnswer}
          onLoadPreset={handleLoadPreset}
          onRunSlot={handleRunSlot}
          onEditSlot={handleEditSlot}
          onClearSlot={handleClearSlot}
          onClose={closeCalculator}
        />
      )}
    </CalculatorContext.Provider>
  );
}

export function useCalculator() {
  const ctx = useContext(CalculatorContext);
  if (!ctx) throw new Error('CalculatorProvider missing');
  return ctx;
}

export function CalculatorPill() {
  useInterfaceLanguage();
  const { open, state, toggleCalculator } = useCalculator();
  return (
    <button
      type="button"
      className={`calc-topbar-pill ${open ? 'active' : ''}`}
      onClick={toggleCalculator}
      aria-pressed={open}
      title={ui('開啟或收起 DSE 科學計數機（fx-50FH II / fx-3650P II）')}
    >
      <Icon name="maths" size={15} />
      <span>{MODEL_SPECS[state.model].name}</span>
    </button>
  );
}

export function MathCalcTrigger({
  inputRef,
  compact = false,
}: {
  inputRef?: { current: MathInputEl | null };
  compact?: boolean;
}) {
  useInterfaceLanguage();
  const { open, openCalculator } = useCalculator();
  return (
    <button
      type="button"
      className={`math-calc-trigger ${compact ? 'compact' : ''} ${open ? 'is-open' : ''}`}
      onMouseDown={e => e.preventDefault()}
      onClick={() => openCalculator(inputRef?.current ?? null)}
      title={ui('在旁邊顯示 DSE 科學計數機')}
      aria-label={ui('開啟 DSE 科學計數機')}
    >
      <Icon name="maths" size={14} />
      {!compact && <span>{ui('計數機')}</span>}
    </button>
  );
}

// ---------- Authentic Casio Keycap & Silkscreen Rich Glyphs ----------

function RadicalGlyph({ index, size = 'key' }: { index?: string; size?: 'key' | 'legend' }) {
  const isLegend = size === 'legend';
  return (
    <span className={`dse-radical ${isLegend ? 'is-legend' : ''}`} aria-hidden="true">
      {index && <span className="dse-radical-idx">{index}</span>}
      <svg viewBox="0 0 24 14" width={isLegend ? 12 : 16} height={isLegend ? 8.5 : 10.5}>
        <path
          d="M 1.5 8.5 L 4.5 8.5 L 7.6 12.6 L 11.8 2.2 L 22.4 2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth={isLegend ? '1.85' : '1.7'}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function CaretGlyph() {
  return (
    <svg className="dse-caret-svg" viewBox="0 0 14 10" width="10" height="7.5" aria-hidden="true">
      <path
        d="M 2 8.5 L 7 2 L 12 8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FracLabel({ whole, num, den }: { whole?: string; num: string; den: string }) {
  return (
    <span className={`dse-frac-glyph ${whole ? 'is-mixed' : 'is-simple'}`} aria-hidden="true">
      {whole && <span className="dse-frac-whole">{whole}</span>}
      <span className="dse-frac-num">{num}</span>
      <span className="dse-frac-slash">/</span>
      <span className="dse-frac-den">{den}</span>
    </span>
  );
}

function DmsGlyph() {
  return (
    <svg className="dse-dms-svg" viewBox="0 0 32 14" width="24" height="11" aria-hidden="true">
      {/* Authentic Casio ° , , , (degree ring + three solid curved comma drops) */}
      <circle cx="4.5" cy="5.5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.45" />
      <circle cx="11.6" cy="6.2" r="1.5" fill="currentColor" />
      <path d="M 12.9 6.6 Q 12.7 9.6 10.5 10.8" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <circle cx="19.1" cy="6.2" r="1.5" fill="currentColor" />
      <path d="M 20.4 6.6 Q 20.2 9.6 18.0 10.8" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <circle cx="25.0" cy="6.2" r="1.5" fill="currentColor" />
      <path d="M 26.3 6.6 Q 26.1 9.6 23.9 10.8" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

function CombLegend({ letter }: { letter: 'P' | 'C' }) {
  return (
    <span className="dse-comb-glyph" aria-hidden="true">
      <em>n</em>
      <span>{letter}</span>
      <em>r</em>
    </span>
  );
}

interface KeySpec {
  id: CalcKey;
  label: ReactNode;
  shiftLabel?: ReactNode;
  shiftBracket?: 'blue' | 'dark';
  shiftSecond?: ReactNode;
  alphaLabel?: ReactNode;
  alphaDark?: boolean;
  alphaBracket?: boolean;
  baseLabel?: ReactNode;
  bottomLeft?: ReactNode;
  bottomLeftColor?: 'blue' | 'amber';
  bottomRight?: ReactNode;
  bottomBracket?: 'blue';
  tone?: 'sci' | 'num' | 'op' | 'delac' | 'coral' | 'mod';
  ariaLabel: string;
}

function subReplayKeysFor(model: CalculatorModel): KeySpec[] {
  const rightPair: KeySpec[] = [
    {
      id: 'INV',
      label: <span className="dse-math-key"><em>x</em><sup>−1</sup></span>,
      shiftLabel: <span className="dse-math-leg"><em>x</em>!</span>,
      baseLabel: 'LOGIC',
      tone: 'sci',
      ariaLabel: 'x⁻¹ (x! / LOGIC)',
    },
    {
      id: 'CUBE',
      label: <span className="dse-math-key"><em>x</em><sup>3</sup></span>,
      shiftLabel: <RadicalGlyph index="3" size="legend" />,
      tone: 'sci',
      ariaLabel: 'x³ (∛)',
    },
  ];
  if (model === 'fx-50fh-ii') {
    return [
      { id: 'PROG', label: 'Prog', shiftLabel: 'EXIT', tone: 'coral', ariaLabel: 'Prog (EXIT)' },
      { id: 'FML', label: 'FMLA', tone: 'coral', ariaLabel: 'Formula (FMLA 01–05)' },
      ...rightPair,
    ];
  }
  return [
    { id: 'PROG', label: 'Prog', shiftLabel: 'EXIT', tone: 'sci', ariaLabel: 'Prog (EXIT)' },
    {
      id: 'INT',
      label: <span className="dse-math-key">∫<em>dx</em></span>,
      shiftLabel: <FracLabel num="d" den="dx" />,
      tone: 'sci',
      ariaLabel: 'Numerical Integration ∫dx (d/dx)',
    },
    ...rightPair,
  ];
}

const SCI_ROWS: KeySpec[][] = [
  [
    {
      id: 'FRAC',
      label: <FracLabel whole="a" num="b" den="c" />,
      shiftLabel: <FracLabel num="d" den="c" />,
      tone: 'sci',
      ariaLabel: 'a b/c (d/c)',
    },
    { id: 'SQRT', label: <RadicalGlyph />, tone: 'sci', ariaLabel: '√' },
    {
      id: 'SQ',
      label: <span className="dse-math-key"><em>x</em><sup>2</sup></span>,
      baseLabel: 'DEC',
      tone: 'sci',
      ariaLabel: 'x² (DEC)',
    },
    {
      id: 'POW',
      label: <CaretGlyph />,
      shiftLabel: <RadicalGlyph index="x" size="legend" />,
      baseLabel: 'HEX',
      tone: 'sci',
      ariaLabel: '^ (x√ / HEX)',
    },
    {
      id: 'LOG',
      label: 'log',
      shiftLabel: <span className="dse-math-leg">10<sup><em>x</em></sup></span>,
      baseLabel: 'BIN',
      tone: 'sci',
      ariaLabel: 'log (10ˣ / BIN)',
    },
    {
      id: 'LN',
      label: 'ln',
      shiftLabel: <span className="dse-math-leg"><em>e</em><sup><em>x</em></sup></span>,
      baseLabel: 'OCT',
      alphaLabel: <em>e</em>,
      tone: 'sci',
      ariaLabel: 'ln (eˣ / OCT / e)',
    },
  ],
  [
    { id: 'NEG', label: '(−)', shiftLabel: '∠', shiftBracket: 'blue', alphaLabel: 'A', alphaBracket: true, tone: 'sci', ariaLabel: '(-) (∠ / A)' },
    { id: 'DMS', label: <DmsGlyph />, shiftLabel: '←', alphaLabel: 'B', alphaBracket: true, tone: 'sci', ariaLabel: '° ′ ″ (← / B)' },
    { id: 'HYP', label: 'hyp', alphaLabel: 'C', alphaBracket: true, tone: 'sci', ariaLabel: 'hyp (C)' },
    { id: 'SIN', label: 'sin', shiftLabel: <span className="dse-math-leg">sin<sup>−1</sup></span>, alphaLabel: 'D', alphaBracket: true, tone: 'sci', ariaLabel: 'sin (sin⁻¹ / D)' },
    { id: 'COS', label: 'cos', shiftLabel: <span className="dse-math-leg">cos<sup>−1</sup></span>, alphaLabel: 'E', alphaDark: true, tone: 'sci', ariaLabel: 'cos (cos⁻¹ / E)' },
    { id: 'TAN', label: 'tan', shiftLabel: <span className="dse-math-leg">tan<sup>−1</sup></span>, alphaLabel: 'F', alphaDark: true, tone: 'sci', ariaLabel: 'tan (tan⁻¹ / F)' },
  ],
  [
    { id: 'RCL', label: 'RCL', shiftLabel: 'STO', tone: 'sci', ariaLabel: 'RCL (STO)' },
    { id: 'ENG', label: 'ENG', shiftLabel: '←', alphaLabel: <em>i</em>, alphaDark: true, tone: 'sci', ariaLabel: 'ENG (← / i)' },
    { id: 'LPAREN', label: '(', shiftLabel: '%', bottomLeft: 'arg', bottomLeftColor: 'amber', bottomBracket: 'blue', tone: 'sci', ariaLabel: '( (% / arg)' },
    { id: 'RPAREN', label: ')', shiftLabel: 'Abs', alphaLabel: 'X', tone: 'sci', ariaLabel: ') (Abs / X)' },
    { id: 'COMMA', label: ',', shiftLabel: ';', alphaLabel: 'Y', bottomLeft: 'Conjg', bottomLeftColor: 'amber', bottomBracket: 'blue', tone: 'sci', ariaLabel: ', (; / Y / Conjg)' },
    { id: 'MPLUS', label: 'M+', shiftLabel: 'M−', alphaLabel: 'M', bottomLeft: 'DT', bottomLeftColor: 'blue', bottomRight: 'CL', bottomBracket: 'blue', tone: 'sci', ariaLabel: 'M+ (M− / M / DT / CL)' },
  ],
];

function numRowsFor(model: CalculatorModel): KeySpec[][] {
  return [
    [
      { id: 'N7', label: '7', shiftLabel: model === 'fx-50fh-ii' ? 'CONST' : undefined, tone: 'num', ariaLabel: '7' },
      { id: 'N8', label: '8', tone: 'num', ariaLabel: '8' },
      { id: 'N9', label: '9', shiftLabel: 'CLR', tone: 'num', ariaLabel: '9' },
      { id: 'DEL', label: 'DEL', shiftLabel: 'INS', tone: 'delac', ariaLabel: 'DEL' },
      { id: 'AC', label: 'AC', shiftLabel: 'OFF', tone: 'delac', ariaLabel: 'AC' },
    ],
    [
      { id: 'N4', label: '4', tone: 'num', ariaLabel: '4' },
      { id: 'N5', label: '5', tone: 'num', ariaLabel: '5' },
      { id: 'N6', label: '6', tone: 'num', ariaLabel: '6' },
      { id: 'MUL', label: '×', shiftLabel: <CombLegend letter="P" />, tone: 'op', ariaLabel: '×' },
      { id: 'DIV', label: '÷', shiftLabel: <CombLegend letter="C" />, tone: 'op', ariaLabel: '÷' },
    ],
    [
      { id: 'N1', label: '1', shiftLabel: 'S-SUM', shiftBracket: 'blue', tone: 'num', ariaLabel: '1' },
      { id: 'N2', label: '2', shiftLabel: 'S-VAR', shiftBracket: 'blue', tone: 'num', ariaLabel: '2' },
      { id: 'N3', label: '3', shiftLabel: 'P-CMD', shiftBracket: 'dark', tone: 'num', ariaLabel: '3' },
      { id: 'ADD', label: '+', shiftLabel: <span className="dse-math-leg">▸<em>r</em>∠<em>θ</em></span>, shiftBracket: 'blue', shiftSecond: 'Pol', tone: 'op', ariaLabel: '+' },
      { id: 'SUB', label: '−', shiftLabel: <span className="dse-math-leg">▸<em>a</em>+<em>bi</em></span>, shiftBracket: 'blue', shiftSecond: 'Rec', tone: 'op', ariaLabel: '−' },
    ],
    [
      { id: 'N0', label: '0', shiftLabel: 'Rnd', tone: 'num', ariaLabel: '0' },
      { id: 'DOT', label: <span className="dse-dot-glyph" />, shiftLabel: 'Ran#', tone: 'num', ariaLabel: '.' },
      { id: 'EXP', label: 'EXP', shiftLabel: <span className="dse-pi-leg">π</span>, tone: 'num', ariaLabel: 'EXP' },
      { id: 'ANS', label: 'Ans', shiftLabel: 'DRG▸', tone: 'num', ariaLabel: 'Ans' },
      { id: 'EXE', label: 'EXE', shiftLabel: 'Re⇔Im', shiftBracket: 'blue', tone: 'num', ariaLabel: 'EXE' },
    ],
  ];
}

// ---------- Calculator Desk Panel Component ----------

function CalculatorDeskPanel({
  state,
  keyboardCapture,
  libraryOpen,
  onToggleLibrary,
  onToggleKeyboardCapture,
  onKey,
  onSwitchModel,
  onToggleAutoOpen,
  onInsertFormulaAndResult,
  onCopyAnswer,
  onLoadPreset,
  onRunSlot,
  onEditSlot,
  onClearSlot,
  onClose,
}: {
  state: CalculatorState;
  keyboardCapture: boolean;
  libraryOpen: boolean;
  onToggleLibrary: () => void;
  onToggleKeyboardCapture: () => void;
  onKey: (key: CalcKey) => void;
  onSwitchModel: (model: CalculatorModel) => void;
  onToggleAutoOpen: () => void;
  onInsertFormulaAndResult: () => void;
  onCopyAnswer: () => void;
  onLoadPreset: (slot: ProgramSlotId, code: string, title: string) => void;
  onRunSlot: (slot: ProgramSlotId) => void;
  onEditSlot: (slot: ProgramSlotId) => void;
  onClearSlot: (slot: ProgramSlotId) => void;
  onClose: () => void;
}) {
  const lang = useInterfaceLanguage();
  const isEn = lang === 'en';
  const lcd = getLcdView(state);
  const spec = MODEL_SPECS[state.model];
  const subReplayKeys = subReplayKeysFor(state.model);
  const numRows = numRowsFor(state.model);
  const usedBytes = totalProgramBytes(state.programs);
  const freeBytes = remainingProgramBytes(state.model, state.programs);

  // Desktop draggable positioning (defaults anchored cleanly on right side)
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);

  const onDragStart = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (window.matchMedia('(max-width: 900px)').matches) return;
    if ((e.target as HTMLElement).closest('button, input, label')) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setOffset({
        x: Math.max(-window.innerWidth + 360, Math.min(20, dragRef.current.origX + dx)),
        y: Math.max(-window.innerHeight + 220, Math.min(window.innerHeight - 180, dragRef.current.origY + dy)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const renderTopLineWithCursor = () => {
    if (lcd.cursorPos === null) return lcd.topLine;
    const pos = Math.max(0, Math.min(lcd.topLine.length, lcd.cursorPos));
    return (
      <>
        <span>{lcd.topLine.slice(0, pos)}</span>
        <span className={`dse-lcd-cursor ${lcd.indicators.INS ? 'is-ins' : ''}`} aria-hidden="true" />
        <span>{lcd.topLine.slice(pos)}</span>
      </>
    );
  };

  const renderKey = (k: KeySpec) => {
    const prevent = (e: ReactMouseEvent) => e.preventDefault();
    const hasBottom = !!(k.bottomLeft || k.bottomRight);
    const hasShift = !!k.shiftLabel;
    const hasBase = !!k.baseLabel;
    const hasAlpha = !!k.alphaLabel;
    const hasSecond = !!k.shiftSecond;
    const count = (hasShift ? 1 : 0) + (hasBase ? 1 : 0) + (hasAlpha ? 1 : 0) + (hasSecond ? 1 : 0);
    const legendAlignClass =
      count >= 3
        ? 'is-triple'
        : hasSecond
          ? 'is-compact'
          : hasAlpha && !hasShift && !hasBase
            ? 'is-right'
            : count === 1
              ? 'is-centered'
              : 'is-pair';
    return (
      <div className={`dse-key-cell ${hasBottom ? 'has-bottom' : ''}`} key={k.id}>
        <div className={`dse-key-legends ${legendAlignClass}`} aria-hidden="true">
          {k.shiftLabel && (
            <span
              className={`dse-legend-shift ${
                k.shiftBracket ? `bracket-${k.shiftBracket}` : ''
              }`}
            >
              {k.shiftLabel}
            </span>
          )}
          {k.shiftSecond && <span className="dse-legend-shift">{k.shiftSecond}</span>}
          {k.baseLabel && <span className="dse-legend-base">{k.baseLabel}</span>}
          {k.alphaLabel && (
            <span
              className={`dse-legend-alpha ${k.alphaDark ? 'is-dark' : ''} ${
                k.alphaBracket ? 'bracket-dark' : ''
              }`}
            >
              {k.alphaLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          className={`dse-key tone-${k.tone ?? 'sci'}`}
          onMouseDown={prevent}
          onClick={() => onKey(k.id)}
          aria-label={k.ariaLabel}
        >
          {k.label}
        </button>
        {hasBottom && (
          <div className="dse-key-sublegends" aria-hidden="true">
            {k.bottomLeft && (
              <span
                className={`${
                  k.bottomLeftColor === 'blue' ? 'dse-legend-base' : 'dse-legend-shift'
                } ${k.bottomBracket && !k.bottomRight ? 'subbracket-blue' : ''}`}
              >
                {k.bottomLeft}
              </span>
            )}
            {k.bottomRight && (
              <span className="dse-legend-shift subbracket-blue">{k.bottomRight}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={`dse-calc-shell model-${state.model} ${libraryOpen ? 'with-library' : ''}`}
      style={offset.x || offset.y ? { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` } : undefined}
      role="region"
      aria-label={ui('DSE 科學計數機模擬器')}
    >
      {/* Utility Action Bar */}
      <div className="dse-calc-toolbar" onMouseDown={onDragStart}>
        <div className="dse-calc-toolbar-top">
          <div className="dse-model-switch" role="group" aria-label={ui('切換計數機型號')}>
            <button
              type="button"
              className={state.model === 'fx-50fh-ii' ? 'active' : ''}
              onMouseDown={e => e.preventDefault()}
              onClick={() => onSwitchModel('fx-50fh-ii')}
            >
              fx-50FH II
            </button>
            <button
              type="button"
              className={state.model === 'fx-3650p-ii' ? 'active' : ''}
              onMouseDown={e => e.preventDefault()}
              onClick={() => onSwitchModel('fx-3650p-ii')}
            >
              fx-3650P II
            </button>
          </div>
          <div className="dse-toolbar-right">
            <button
              type="button"
              className={`dse-tool-chip ${keyboardCapture ? 'active' : ''}`}
              onMouseDown={e => e.preventDefault()}
              onClick={onToggleKeyboardCapture}
              title={ui('按 Alt+C 切換是否由電腦實體鍵盤操控計數機')}
            >
              {keyboardCapture ? ui('鍵盤接管中 (Alt+C)') : ui('鍵盤 Alt+C')}
            </button>
            <button
              type="button"
              className={`dse-tool-chip ${libraryOpen ? 'active' : ''}`}
              onMouseDown={e => e.preventDefault()}
              onClick={onToggleLibrary}
            >
              {ui('預設程式庫')}
            </button>
            <button
              type="button"
              className="dse-tool-close"
              onMouseDown={e => e.preventDefault()}
              onClick={onClose}
              aria-label={ui('收起計數機')}
            >
              <Icon name="x" size={15} />
            </button>
          </div>
        </div>

        <div className="dse-calc-actions-row">
          <button
            type="button"
            className="dse-insert-btn"
            onMouseDown={e => e.preventDefault()}
            onClick={onInsertFormulaAndResult}
            disabled={!state.lastTranscript}
            title={ui('把算式／公式連同結果插入剛才焦點的輸入框')}
          >
            <Icon name="arrow" size={13} />
            <span>{ui('填入算式與結果')}</span>
          </button>
          <button
            type="button"
            className="dse-copy-btn"
            onMouseDown={e => e.preventDefault()}
            onClick={onCopyAnswer}
            title={ui('只複製最終數值答案')}
          >
            <Icon name="copy" size={13} />
            <span>{ui('複製答案')}</span>
          </button>
          <label className="dse-auto-toggle" onMouseDown={e => e.preventDefault()}>
            <input
              type="checkbox"
              checked={state.autoOpenOnFocus}
              onChange={onToggleAutoOpen}
            />
            <span>{ui('自動顯示')}</span>
          </label>
        </div>
      </div>

      <div className="dse-calc-body-wrap">
        {/* Preset Program Library Drawer */}
        {libraryOpen && (
          <div className="dse-preset-drawer" aria-label={ui('DSE 預設程式庫')}>
            <div className="dse-preset-head">
              <div>
                <strong>{ui('DSE 經典 6 合 1 程式庫')}</strong>
                <small>
                  {ui('程式空間：{0}/{1} bytes（餘 {2}B）', [
                    usedBytes,
                    spec.maxProgramBytes,
                    freeBytes,
                  ])}
                </small>
              </div>
              <button
                type="button"
                className="dse-tool-close"
                onMouseDown={e => e.preventDefault()}
                onClick={onToggleLibrary}
                aria-label={ui('關閉程式庫')}
              >
                <Icon name="x" size={14} />
              </button>
            </div>

            <div className="dse-slots-strip">
              {PROGRAM_SLOTS.map(slot => {
                const src = state.programs[slot];
                const b = countProgramBytes(src);
                return (
                  <div className={`dse-slot-card ${src ? 'filled' : ''}`} key={slot}>
                    <div className="dse-slot-top">
                      <strong>P{slot}</strong>
                      <span>{src ? `${b}B` : ui('空白')}</span>
                    </div>
                    <div className="dse-slot-btns">
                      <button
                        type="button"
                        disabled={!src}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => onRunSlot(slot)}
                      >
                        {ui('執行')}
                      </button>
                      <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => onEditSlot(slot)}
                      >
                        {ui('編輯')}
                      </button>
                      {src && (
                        <button
                          type="button"
                          className="danger"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => onClearSlot(slot)}
                        >
                          {ui('清空')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="dse-preset-tip">
              {ui('提示：P1–P4 預設空白；你可在機身按 MODE → 6 → 1 手動編寫，或從下方一鍵寫入指定槽位。')}
            </p>

            <div className="dse-preset-list">
              {DSE_PRESET_PROGRAMS.map(preset => {
                const isExpanded = expandedPreset === preset.id;
                return (
                  <article className="dse-preset-item" key={preset.id}>
                    <div className="dse-preset-item-head">
                      <strong>{isEn ? preset.titleEn : preset.titleZh}</strong>
                      <span className="dse-preset-bytes">{preset.bytes}B</span>
                    </div>
                    <code className="dse-preset-formula">{preset.formulaSummary}</code>
                    <p>{isEn ? preset.descriptionEn : preset.descriptionZh}</p>
                    <small className="dse-preset-io">
                      {isEn ? preset.ioGuideEn : preset.ioGuideZh}
                    </small>
                    <div className="dse-preset-load-row">
                      <span>{ui('寫入槽位：')}</span>
                      {PROGRAM_SLOTS.map(slot => (
                        <button
                          key={slot}
                          type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() =>
                            onLoadPreset(slot, preset.code, isEn ? preset.titleEn : preset.titleZh)
                          }
                        >
                          P{slot}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="dse-preset-code-toggle"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setExpandedPreset(isExpanded ? null : preset.id)}
                      >
                        {isExpanded ? ui('收起代碼') : ui('代碼／入機步驟')}
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="dse-preset-code-box">
                        <code>{preset.code}</code>
                        <small>{isEn ? preset.keystrokesEn : preset.keystrokesZh}</small>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {/* 1:1 True-Proportion (80×162mm) Brushed Silver Handheld Body with Tapering Matte-Black Side Rim */}
        <div className="dse-hardware-wrap">
          <svg
            className="dse-body-shell-svg"
            viewBox="0 0 296 600"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              {/* Dark charcoal outer shell: subtle curved cheek reflection on outer flanks + deep matte trough */}
              <linearGradient id="dseOuterRim" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#58606b" />
                <stop offset="2.2%" stopColor="#353b44" />
                <stop offset="5%" stopColor="#232830" />
                <stop offset="50%" stopColor="#1b1f26" />
                <stop offset="95%" stopColor="#232830" />
                <stop offset="97.8%" stopColor="#383e48" />
                <stop offset="100%" stopColor="#5c6470" />
              </linearGradient>
              {/* Vertical shading on outer matte-black shell so lower widening flanks feel molded in 3D */}
              <linearGradient id="dseOuterRimVert" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
                <stop offset="30%" stopColor="rgba(255,255,255,0)" />
                <stop offset="85%" stopColor="rgba(0,0,0,0.12)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.34)" />
              </linearGradient>
              {/* Brushed metallic silver faceplate */}
              <linearGradient id="dseSilverFace" x1="0" y1="0.06" x2="1" y2="0.14">
                <stop offset="0%" stopColor="#bcc3cc" />
                <stop offset="10%" stopColor="#e3e7ec" />
                <stop offset="34%" stopColor="#d8dde3" />
                <stop offset="64%" stopColor="#ccd2db" />
                <stop offset="89%" stopColor="#dde1e7" />
                <stop offset="100%" stopColor="#b0b7c2" />
              </linearGradient>
              {/* Soft vertical brushed sheen + subtle lower convexity */}
              <linearGradient id="dseSilverSheen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
                <stop offset="35%" stopColor="rgba(255,255,255,0.03)" />
                <stop offset="84%" stopColor="rgba(28,35,45,0.06)" />
                <stop offset="100%" stopColor="rgba(18,24,32,0.18)" />
              </linearGradient>
            </defs>

            {/* Outer dark body contour (full 296×600 handheld silhouette) */}
            <path
              d="M 22 1 L 274 1 Q 295 1 295 22 L 295 550 C 295 583 258 599 148 599 C 38 599 1 583 1 550 L 1 22 Q 1 1 22 1 Z"
              fill="url(#dseOuterRim)"
              stroke="rgba(12,15,20,0.72)"
              strokeWidth="1"
            />
            <path
              d="M 22 1 L 274 1 Q 295 1 295 22 L 295 550 C 295 583 258 599 148 599 C 38 599 1 583 1 550 L 1 22 Q 1 1 22 1 Z"
              fill="url(#dseOuterRimVert)"
            />
            {/* Subtle top-edge chamfer highlight on dark outer rim */}
            <path
              d="M 22 2.2 L 274 2.2 Q 293.8 2.2 293.8 22"
              fill="none"
              stroke="rgba(255,255,255,0.34)"
              strokeWidth="1"
            />

            {/* Recessed dark groove directly surrounding the silver faceplate */}
            <path
              d="M 22 3.2 L 274 3.2 Q 292.8 3.2 292.8 22 L 292.8 172 C 292.8 250 285.5 385 281.2 548 C 280.2 577 244 588.5 148 588.5 C 52 588.5 15.8 577 14.8 548 C 10.5 385 3.2 250 3.2 172 L 3.2 22 Q 3.2 3.2 22 3.2 Z"
              fill="rgba(10,13,18,0.65)"
            />

            {/* Inner brushed metallic silver faceplate:
                ~3.8px dark rim at top beside LCD, smoothly tapering inward from y=172 down to y=548
                so the matte-black edge gradually widens downward to ~15px beside 7/4/1/0 & AC/÷/−/EXE,
                and wraps cleanly (~12px thick) around the curved U-chin with full clearance around 0 & EXE! */}
            <path
              d="M 22 4.2 L 274 4.2 Q 291.8 4.2 291.8 22 L 291.8 172 C 291.8 250 284.8 385 280.4 548 C 279.4 576 243.5 587.4 148 587.4 C 52.5 587.4 16.6 576 15.6 548 C 11.2 385 4.2 250 4.2 172 L 4.2 22 Q 4.2 4.2 22 4.2 Z"
              fill="url(#dseSilverFace)"
              stroke="rgba(26,31,38,0.55)"
              strokeWidth="0.9"
            />
            <path
              d="M 22 5.4 L 274 5.4 Q 290.6 5.4 290.6 22 L 290.6 172 C 290.6 250 283.6 385 279.2 547.4 C 278.2 574.6 242.8 586.2 148 586.2 C 53.2 586.2 17.8 574.6 16.8 547.4 C 12.4 385 5.4 250 5.4 172 L 5.4 22 Q 5.4 5.4 22 5.4 Z"
              fill="url(#dseSilverSheen)"
              stroke="rgba(255,255,255,0.78)"
              strokeWidth="0.95"
            />
          </svg>
          <div className="dse-chassis">
            {/* Top Brand + Authentic Large Recessed Solar Panel */}
            <div className="dse-face-header">
              <div className="dse-face-brand">
                <span className="dse-brand-maker">HOKSE</span>
                <span className="dse-brand-model">{spec.name}</span>
              </div>
              <div className="dse-solar-well" aria-hidden="true">
                <div className="dse-solar">
                  <span /><span /><span /><span />
                </div>
              </div>
            </div>

            {/* Iconic 5-bar coral stripe + DSE compliance line + SUPER-FX PLUS */}
            <div className="dse-face-stripe-row">
              <div className="dse-dse-strip">
                <span className="dse-red-bars" aria-hidden="true">
                  <i /><i /><i /><i /><i />
                </span>
                <span className="dse-exam-text">{ui('DSE 考評同款練習機')}</span>
              </div>
              <span className="dse-brand-sub">{spec.subtitle}</span>
            </div>

            {/* Tall Proportional Recessed LCD Screen (~2.6:1 ratio matching real hardware) */}
            <div className="dse-lcd-bevel">
              <div className="dse-lcd-frame">
                <div className="dse-lcd" role="status" aria-live="polite">
                  <div className="dse-lcd-annunciators">
                    <span className={lcd.indicators.S ? 'on' : ''}>S</span>
                    <span className={lcd.indicators.A ? 'on' : ''}>A</span>
                    <span className={lcd.indicators.M ? 'on' : ''}>M</span>
                    <span className={lcd.indicators.STO ? 'on' : ''}>STO</span>
                    <span className={lcd.indicators.RCL ? 'on' : ''}>RCL</span>
                    <span className={lcd.indicators.HYP ? 'on' : ''}>HYP</span>
                    <span className={lcd.indicators.CMPLX ? 'on' : ''}>CMPLX</span>
                    <span className={lcd.indicators.SD ? 'on' : ''}>SD</span>
                    <span className={lcd.indicators.BASE ? 'on' : ''}>
                      {lcd.indicators.BASE ?? 'BASE'}
                    </span>
                    <span className={lcd.indicators.PRGM ? 'on' : ''}>PRGM</span>
                    <span className="on angle">{lcd.indicators.ANGLE}</span>
                    <span className={lcd.indicators.FIX ? 'on' : ''}>FIX</span>
                    <span className={lcd.indicators.SCI ? 'on' : ''}>SCI</span>
                    <span className={lcd.indicators.DISP ? 'on disp' : ''}>Disp</span>
                  </div>
                  <div className="dse-lcd-top">{renderTopLineWithCursor()}</div>
                  <div className="dse-lcd-bottom-row">
                    <span className="dse-lcd-sub">{lcd.subLabel ?? ''}</span>
                    <span
                      className={`dse-lcd-bottom ${
                        /[a-zA-Z]{2,}|:/.test(lcd.bottomLine) && !/^[-0-9.×^i∠°'"⌟ +]+$/.test(lcd.bottomLine)
                          ? 'is-text'
                          : ''
                      }`}
                    >
                      {lcd.bottomLine}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Unified 6-Column Upper Control Zone + Sculpted Silver Contour Groove + Perfectly Round REPLAY */}
            <div className="dse-upper-zone">
              <svg
                className="dse-contour-svg"
                viewBox="0 0 264 76"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M 0 36 L 44 36 C 58 36 68 41 84 41 C 94 41 96 71 132 71 C 168 71 170 41 180 41 C 196 41 206 36 220 36 L 264 36"
                  fill="none"
                  stroke="rgba(88,97,110,0.42)"
                  strokeWidth="1.4"
                />
                <path
                  d="M 0 37.5 L 44 37.5 C 58 37.5 68 42.5 84 42.5 C 94 42.5 96 72.5 132 72.5 C 168 72.5 170 42.5 180 42.5 C 196 42.5 206 37.5 220 37.5 L 264 37.5"
                  fill="none"
                  stroke="rgba(255,255,255,0.75)"
                  strokeWidth="1.2"
                />
              </svg>

              {/* Row 1 Cols 1-2: SHIFT & ALPHA */}
              <div className="dse-key-cell dse-pos-shift">
                <div className="dse-key-legends is-centered"><span className="dse-legend-shift">SHIFT</span></div>
                <button
                  type="button"
                  className={`dse-key tone-mod mod-shift ${state.shift ? 'is-active' : ''}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => onKey('SHIFT')}
                  aria-label="SHIFT"
                />
              </div>
              <div className="dse-key-cell dse-pos-alpha">
                <div className="dse-key-legends is-centered"><span className="dse-legend-alpha">ALPHA</span></div>
                <button
                  type="button"
                  className={`dse-key tone-mod mod-alpha ${state.alpha ? 'is-active' : ''}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => onKey('ALPHA')}
                  aria-label="ALPHA"
                />
              </div>

              {/* Center Cols 3-4 spanning Rows 1-2: True Circular REPLAY */}
              <div className="dse-replay-wrap dse-pos-replay">
                <div className="dse-replay-well">
                  <div className="dse-replay-ring" role="group" aria-label="REPLAY">
                    <span className="dse-replay-title" aria-hidden="true">REPLAY</span>
                    <button
                      type="button"
                      className="dse-replay-btn up"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => onKey('UP')}
                      aria-label="Replay Up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="dse-replay-btn down"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => onKey('DOWN')}
                      aria-label="Replay Down"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      className="dse-replay-btn left"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => onKey('LEFT')}
                      aria-label="Cursor Left"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      className="dse-replay-btn right"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => onKey('RIGHT')}
                      aria-label="Cursor Right"
                    >
                      ▶
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 1 Cols 5-6: MODE SETUP & ON */}
              <div className="dse-key-cell dse-pos-mode">
                <div className="dse-key-legends is-centered">
                  <span className="dse-legend-mode">MODE</span>
                  <span className="dse-legend-shift">SETUP</span>
                </div>
                <button
                  type="button"
                  className="dse-key tone-mod"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => onKey('MODE')}
                  aria-label="MODE SETUP"
                />
              </div>
              <div className="dse-key-cell dse-pos-on">
                <div className="dse-key-legends is-centered"><span className="dse-legend-mode">ON</span></div>
                <button
                  type="button"
                  className="dse-key tone-mod"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => onKey('ON')}
                  aria-label="ON"
                />
              </div>

              {/* Row 2 Cols 1, 2, 5, 6 aligned 1:1 with Scientific Matrix columns! */}
              <div className="dse-pos-sub1">{renderKey(subReplayKeys[0])}</div>
              <div className="dse-pos-sub2">{renderKey(subReplayKeys[1])}</div>
              <div className="dse-pos-sub3">{renderKey(subReplayKeys[2])}</div>
              <div className="dse-pos-sub4">{renderKey(subReplayKeys[3])}</div>
            </div>

            {/* 3 × 6 Scientific Function Matrix */}
            <div className="dse-sci-grid">
              {SCI_ROWS.flat().map(renderKey)}
            </div>

            {/* 4 × 5 Numeric & Execution Pad */}
            <div className="dse-num-grid">
              {numRows.flat().map(renderKey)}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
