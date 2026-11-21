import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {useNavigate} from 'react-router-dom';
import {ui, useInterfaceLanguage} from './i18n';
import {Badge, Icon, Modal, Progress} from './components';
import {useApp} from './state';
import {api} from './api/client';
import type {Task} from './types';

// Two distinct client-side focus modes:
// - 'task' (Guided Task Focus): compact topbar FocusPill so the student can navigate
//   lessons, quizzes and AI study while a scheduled task timer runs.
// - 'open' (Open Focus — Web Plan A guard): browser fullscreen + optional Keyboard Lock
//   + external-link guard + tab/window/fullscreen departure tracking while letting the
//   student freely explore every in-app page; requires explicit cancel confirmation to
//   leave early. Neither mode ever writes db.events or mastery evidence.
export type FocusMode = 'task' | 'open';
export type FocusLeaveReason = 'tab' | 'window' | 'fullscreen';

export const FOCUS_LOCK_KEYS = ['Escape', 'F11', 'KeyT', 'KeyW', 'KeyN'] as const;

export interface FocusSession {
  mode?: FocusMode;
  label: string;
  totalSeconds: number;
  endsAt: number | null;
  remaining: number;
  immersive: boolean;
  taskId?: string;
  leaveCount?: number;
  awaySeconds?: number;
  lastLeaveReason?: FocusLeaveReason | null;
}

export interface CompletedFocus {
  mode?: FocusMode;
  label: string;
  minutes?: number;
  taskId?: string;
  leaveCount?: number;
  awaySeconds?: number;
}

interface FocusValue {
  session: FocusSession | null;
  completed: CompletedFocus | null;
  remaining: number;
  running: boolean;
  isOpenActive: boolean;
  isFullscreenShieldOpen: boolean;
  isLocked: boolean;
  isFullscreen: boolean;
  fullscreenSupported: boolean;
  fullscreenFallback: boolean;
  keyboardLocked: boolean;
  keyboardLockSupported: boolean;
  todayOpenMinutes: number;
  scratch: string;
  launcherOpen: boolean;
  cancelConfirmOpen: boolean;
  start: (minutes: number, label: string, taskId?: string) => void;
  startOpen: (minutes: number, label?: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  cancelOpen: () => void;
  setImmersive: (value: boolean) => void;
  setScratch: (value: string) => void;
  openLauncher: () => void;
  closeLauncher: () => void;
  openCancelConfirm: () => void;
  closeCancelConfirm: () => void;
  enterFullscreen: () => void;
  dismissCompleted: () => void;
}

const storageKey = 'hokse.focus-session';
const completedKey = 'hokse.focus-completed';
const dailyOpenKey = 'hokse.focus-daily';
const scratchKey = 'hokse.focus-scratch';

const FocusContext = createContext<FocusValue | null>(null);

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type KeyboardLockNav = Navigator & {
  keyboard?: {
    lock?: (keyCodes?: string[]) => Promise<void>;
    unlock?: () => void;
  };
};

function getFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const doc = document as FullscreenDoc;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function isFullscreenApiSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FullscreenDoc;
  const el = document.documentElement as FullscreenEl | null;
  return Boolean(
    (doc.fullscreenEnabled || doc.webkitFullscreenEnabled) &&
    el &&
    (typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function')
  );
}

export function isKeyboardLockSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as KeyboardLockNav;
  return typeof nav.keyboard?.lock === 'function';
}

async function lockFocusKeyboard(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as KeyboardLockNav;
  if (typeof nav.keyboard?.lock !== 'function') return false;
  try {
    await nav.keyboard.lock([...FOCUS_LOCK_KEYS]);
    return true;
  } catch {
    try {
      await nav.keyboard.lock(['Escape']);
      return true;
    } catch {
      return false;
    }
  }
}

function unlockFocusKeyboard() {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as KeyboardLockNav;
  try {
    nav.keyboard?.unlock?.();
  } catch {}
}

export function requestFocusFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (getFullscreenElement()) return Promise.resolve(true);
  const el = document.documentElement as FullscreenEl;
  if (typeof el.requestFullscreen === 'function') {
    return el.requestFullscreen().then(() => true, () => false);
  }
  if (typeof el.webkitRequestFullscreen === 'function') {
    try {
      const maybePromise = el.webkitRequestFullscreen();
      if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
        return (maybePromise as Promise<void>).then(() => true, () => false);
      }
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }
  return Promise.resolve(false);
}

function exitFocusFullscreen() {
  unlockFocusKeyboard();
  if (typeof document === 'undefined' || !getFullscreenElement()) return;
  const doc = document as FullscreenDoc;
  if (doc.fullscreenElement && typeof doc.exitFullscreen === 'function') {
    void doc.exitFullscreen().catch(() => {});
  } else if (doc.webkitFullscreenElement && typeof doc.webkitExitFullscreen === 'function') {
    try {
      void doc.webkitExitFullscreen();
    } catch {}
  }
}

export function isExternalNavigationLink(href: string | null | undefined, currentOrigin: string): boolean {
  if (!href) return false;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#')) return false;
  try {
    const url = new URL(trimmed, currentOrigin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.origin !== currentOrigin;
  } catch {
    return false;
  }
}

export function isBlockedFocusShortcut(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): boolean {
  const key = e.key.toLowerCase();
  if (key === 'f11') return true;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 't' || key === 'w' || key === 'n')) {
    return true;
  }
  return false;
}

export function recordFocusDeparture(session: FocusSession, reason: FocusLeaveReason): FocusSession {
  return {
    ...session,
    leaveCount: (session.leaveCount ?? 0) + 1,
    lastLeaveReason: reason,
  };
}

export function applyFocusReturn(session: FocusSession, elapsedSeconds: number): FocusSession {
  const delta = Math.max(1, Math.round(elapsedSeconds));
  return {
    ...session,
    awaySeconds: (session.awaySeconds ?? 0) + delta,
  };
}

export function formatAwayDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  if (safe < 60) return ui('{0} 秒', [safe]);
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  return rem > 0 ? ui('{0} 分 {1} 秒', [mins, rem]) : ui('{0} 分鐘', [mins]);
}

function loadSession(): FocusSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as FocusSession | null;
    if (!value || typeof value.totalSeconds !== 'number') return null;
    if (value.endsAt && value.endsAt <= Date.now() && Date.now() - value.endsAt >= 3600_000) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function loadCompleted(): CompletedFocus | null {
  try {
    const value = JSON.parse(localStorage.getItem(completedKey) ?? 'null') as CompletedFocus | null;
    return value && typeof value.label === 'string' ? value : null;
  } catch {
    return null;
  }
}

function loadDailyMap(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(dailyOpenKey) ?? '{}') as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.round(v);
    }
    return out;
  } catch {
    return {};
  }
}

function loadScratch(): string {
  try {
    return localStorage.getItem(scratchKey) ?? '';
  } catch {
    return '';
  }
}

const left = (session: FocusSession, now: number) =>
  session.endsAt ? Math.max(0, Math.ceil((session.endsAt - now) / 1000)) : session.remaining;

export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

export function FocusProvider({children}: {children: ReactNode}) {
  const lang = useInterfaceLanguage();
  const {db, applyTask, refresh, toast} = useApp();
  const [session, setSession] = useState<FocusSession | null>(loadSession);
  const [completed, setCompleted] = useState<CompletedFocus | null>(loadCompleted);
  const [dailyMap, setDailyMap] = useState<Record<string, number>>(loadDailyMap);
  const [scratch, setScratchState] = useState<string>(loadScratch);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => Boolean(getFullscreenElement()));
  const [enteringFullscreen, setEnteringFullscreen] = useState(false);
  const [fullscreenFallback, setFullscreenFallback] = useState(false);
  const [keyboardLocked, setKeyboardLocked] = useState(false);
  const fullscreenSupported = useMemo(() => isFullscreenApiSupported(), []);
  const keyboardLockSupported = useMemo(() => isKeyboardLockSupported(), []);
  const [now, setNow] = useState(() => Date.now());
  const completedTokenRef = useRef<string | null>(null);
  const sessionRef = useRef<FocusSession | null>(session);
  const awayStartRef = useRef<number | null>(null);
  const wasFullscreenRef = useRef<boolean>(Boolean(getFullscreenElement()));
  const suppressBlurUntilRef = useRef<number>(0);
  const lastShortcutToastRef = useRef<number>(0);
  const fullscreenFallbackRef = useRef<boolean>(fullscreenFallback);

  sessionRef.current = session;
  fullscreenFallbackRef.current = fullscreenFallback;

  const today = db.profile.date;
  const todayOpenMinutes = dailyMap[today] ?? 0;
  const running = !!session?.endsAt;
  const isOpenActive = session?.mode === 'open';
  const isFullscreenShieldOpen = Boolean(
    isOpenActive &&
    running &&
    fullscreenSupported &&
    !fullscreenFallback &&
    !enteringFullscreen &&
    !isFullscreen
  );
  // Only block background site interaction when a full-viewport overlay (re-entry shield
  // or completion summary) is covering the screen. Normal Open Focus allows free in-site exploration.
  const isLocked = Boolean(isFullscreenShieldOpen || completed?.mode === 'open');

  useEffect(() => {
    try {
      session ? localStorage.setItem(storageKey, JSON.stringify(session)) : localStorage.removeItem(storageKey);
    } catch {}
  }, [session]);

  useEffect(() => {
    try {
      completed ? localStorage.setItem(completedKey, JSON.stringify(completed)) : localStorage.removeItem(completedKey);
    } catch {}
  }, [completed]);

  useEffect(() => {
    try {
      localStorage.setItem(dailyOpenKey, JSON.stringify(dailyMap));
    } catch {}
  }, [dailyMap]);

  const setScratch = useCallback((value: string) => {
    const trimmed = value.slice(0, 240);
    setScratchState(trimmed);
    try {
      trimmed ? localStorage.setItem(scratchKey, trimmed) : localStorage.removeItem(scratchKey);
    } catch {}
  }, []);

  useEffect(() => {
    if (!session?.endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session?.endsAt]);

  const markAway = useCallback((reason: FocusLeaveReason) => {
    const current = sessionRef.current;
    if (!current || current.mode !== 'open' || !current.endsAt) return;
    if (reason === 'window' && Date.now() < suppressBlurUntilRef.current) return;
    if (awayStartRef.current === null) {
      awayStartRef.current = Date.now();
      setSession(prev => (prev && prev.mode === 'open' && prev.endsAt ? recordFocusDeparture(prev, reason) : prev));
    } else if (reason === 'fullscreen') {
      setSession(prev => (prev && prev.mode === 'open' ? {...prev, lastLeaveReason: 'fullscreen'} : prev));
    }
  }, []);

  const flushAway = useCallback((notifyReturn: boolean) => {
    if (awayStartRef.current === null) return;
    const elapsed = Math.max(1, Math.round((Date.now() - awayStartRef.current) / 1000));
    awayStartRef.current = null;
    const current = sessionRef.current;
    if (!current || current.mode !== 'open') return;
    const nextLeaveCount = current.leaveCount ?? 1;
    const nextAwaySeconds = (current.awaySeconds ?? 0) + elapsed;
    setSession(prev => (prev && prev.mode === 'open' ? applyFocusReturn(prev, elapsed) : prev));
    if (notifyReturn) {
      toast(
        ui('偵測到離開專注畫面（第 {0} 次，累計 {1}），已回到站內繼續學習。', [
          nextLeaveCount,
          formatAwayDuration(nextAwaySeconds),
        ]),
        'error',
        {duration: 5000}
      );
    }
  }, [toast]);

  // Sync fullscreen state and detect active fullscreen exits during running Open Focus.
  useEffect(() => {
    const syncFs = () => {
      const nowFs = Boolean(getFullscreenElement());
      setIsFullscreen(nowFs);
      const current = sessionRef.current;
      if (current?.mode === 'open' && current.endsAt) {
        if (wasFullscreenRef.current && !nowFs) {
          markAway('fullscreen');
        } else if (nowFs && !wasFullscreenRef.current && document.visibilityState === 'visible') {
          flushAway(true);
        }
      }
      wasFullscreenRef.current = nowFs;
    };
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
    };
  }, [flushAway, markAway]);

  // Detect tab switches and window focus losses during running Open Focus.
  useEffect(() => {
    if (!isOpenActive || !running) return;
    const canResumeWithoutFs = () =>
      !fullscreenSupported || fullscreenFallbackRef.current || Boolean(getFullscreenElement());

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        markAway('tab');
      } else if (document.hasFocus() && canResumeWithoutFs()) {
        flushAway(true);
      }
    };
    const onBlur = () => {
      markAway('window');
    };
    const onFocus = () => {
      if (document.visibilityState === 'visible' && canResumeWithoutFs()) {
        flushAway(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [flushAway, fullscreenSupported, isOpenActive, markAway, running]);

  // Progressive enhancement: Keyboard Lock API in Chromium fullscreen so single-tap Esc
  // and browser tab-escape shortcuts require deliberate effort.
  useEffect(() => {
    if (!isOpenActive || !running || !isFullscreen) {
      unlockFocusKeyboard();
      setKeyboardLocked(false);
      return;
    }
    let active = true;
    void lockFocusKeyboard().then(locked => {
      if (active) setKeyboardLocked(locked);
    });
    return () => {
      active = false;
      unlockFocusKeyboard();
      setKeyboardLocked(false);
    };
  }, [isFullscreen, isOpenActive, running]);

  // Intercept external links & browser-escape shortcuts while running Open Focus.
  useEffect(() => {
    if (!isOpenActive || !running) return;

    const onDocumentClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (isExternalNavigationLink(anchor.getAttribute('href'), window.location.origin)) {
        e.preventDefault();
        e.stopPropagation();
        toast('自由專注中只限站內學習，已暫時攔截站外連結。', 'error', {duration: 3800});
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isBlockedFocusShortcut(e)) return;
      e.preventDefault();
      const t = Date.now();
      if (t - lastShortcutToastRef.current > 3000) {
        lastShortcutToastRef.current = t;
        toast('自由專注鎖屏中，已暫時攔截開關分頁與全屏快捷鍵。', 'error', {duration: 3200});
      }
    };

    document.addEventListener('click', onDocumentClick, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('click', onDocumentClick, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [isOpenActive, running, toast]);

  // Warn before accidental reload / tab close while Open Focus is active.
  useEffect(() => {
    if (!isOpenActive) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isOpenActive]);

  // Keep screen awake during running Open Focus on supported devices.
  useEffect(() => {
    if (!isOpenActive || !running) return;
    const nav = navigator as Navigator & {
      wakeLock?: {request: (type: 'screen') => Promise<{release: () => Promise<void>}>};
    };
    if (!nav.wakeLock?.request) return;
    let sentinel: {release: () => Promise<void>} | null = null;
    let cancelled = false;
    const acquire = () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      void nav.wakeLock!.request('screen').then(lock => {
        if (cancelled) void lock.release().catch(() => {});
        else sentinel = lock;
      }).catch(() => {});
    };
    acquire();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) void sentinel.release().catch(() => {});
    };
  }, [isOpenActive, running]);

  const finishTask = useCallback(async (taskId: string) => {
    const task = db.tasks.find(t => t.id === taskId);
    setCompleted(null);
    if (!task || task.status === 'done') return;
    applyTask({...task, status: 'done'});
    try {
      const saved = await api<Task>(`/tasks/${task.id}`, 'PATCH', {status: 'done'});
      applyTask(saved);
      void refresh().catch(() => {});
      toast('又完成了一小步！', 'success', {
        duration: 4000,
        action: {
          label: '撤銷',
          run: () => {
            applyTask({...saved, status: 'pending'});
            void api<Task>(`/tasks/${saved.id}`, 'PATCH', {status: 'pending'}).then(reverted => {
              applyTask(reverted);
              void refresh().catch(() => {});
              toast('已恢復任務');
            }).catch(err => {
              applyTask(saved);
              toast((err as Error).message, 'error');
            });
          },
        },
      });
    } catch (err) {
      applyTask(task);
      toast((err as Error).message, 'error');
    }
  }, [applyTask, db.tasks, refresh, toast]);

  const remaining = session ? left(session, now) : 0;

  // Live countdown in browser tab title whenever a focus session is active.
  useEffect(() => {
    const baseTitle = lang === 'en' ? 'HOKSE · DSE Study Studio' : '學序 · DSE 學習工作室';
    if (!session) {
      document.title = baseTitle;
      return;
    }
    const prefix = session.endsAt ? clock(remaining) : `${clock(remaining)} · ${ui('已暫停')}`;
    document.title = `${prefix} · ${ui(session.label)} — ${lang === 'en' ? 'HOKSE' : '學序'}`;
    return () => {
      document.title = baseTitle;
    };
  }, [lang, remaining, session]);

  useEffect(() => {
    if (session?.endsAt && remaining <= 0) {
      const token = `${session.mode ?? 'task'}:${session.label}:${session.endsAt}:${session.totalSeconds}`;
      if (completedTokenRef.current === token) return;
      completedTokenRef.current = token;
      const mode: FocusMode = session.mode ?? 'task';
      const minutesDone = Math.max(1, Math.round(session.totalSeconds / 60));
      let totalAway = session.awaySeconds ?? 0;
      if (awayStartRef.current !== null) {
        totalAway += Math.max(1, Math.round((Date.now() - awayStartRef.current) / 1000));
        awayStartRef.current = null;
      }
      const doneInfo: CompletedFocus = {
        mode,
        label: session.label,
        minutes: minutesDone,
        taskId: session.taskId,
        leaveCount: mode === 'open' ? (session.leaveCount ?? 0) : undefined,
        awaySeconds: mode === 'open' ? totalAway : undefined,
      };
      const hasPendingTask = !!session.taskId && db.tasks.some(t => t.id === session.taskId && t.status !== 'done');
      setCancelConfirmOpen(false);
      setSession(null);
      setCompleted(doneInfo);
      if (mode === 'open') {
        exitFocusFullscreen();
        setDailyMap(prev => ({...prev, [today]: (prev[today] ?? 0) + minutesDone}));
      } else {
        toast('這一段專注完成了，休息一下。', 'success', hasPendingTask ? {
          duration: 8000,
          action: {label: '標記任務完成', run: () => void finishTask(session.taskId!)},
        } : undefined);
      }
    }
  }, [db.tasks, finishTask, remaining, session, today, toast]);

  const enterFullscreen = useCallback(() => {
    if (!fullscreenSupported) return;
    suppressBlurUntilRef.current = Date.now() + 650;
    setEnteringFullscreen(true);
    void requestFocusFullscreen().then(ok => {
      setEnteringFullscreen(false);
      if (ok) {
        setFullscreenFallback(false);
        setIsFullscreen(true);
        wasFullscreenRef.current = true;
        if (awayStartRef.current !== null && document.visibilityState === 'visible') {
          flushAway(true);
        }
      } else {
        setFullscreenFallback(true);
        toast('目前瀏覽器未能開啟全屏，已改用頁內專注監測模式。', 'error', {duration: 4500});
      }
    });
  }, [flushAway, fullscreenSupported, toast]);

  const start = useCallback((minutes: number, label: string, taskId?: string) => {
    const totalSeconds = Math.max(1, Math.round(minutes)) * 60;
    const startedAt = Date.now();
    awayStartRef.current = null;
    setCancelConfirmOpen(false);
    setNow(startedAt);
    setCompleted(null);
    setLauncherOpen(false);
    setSession({
      mode: 'task',
      label,
      totalSeconds,
      endsAt: startedAt + totalSeconds * 1000,
      remaining: totalSeconds,
      immersive: true,
      taskId,
    });
  }, []);

  const startOpen = useCallback((minutes: number, label = '自由專注溫習') => {
    const totalSeconds = Math.max(1, Math.round(minutes)) * 60;
    const startedAt = Date.now();
    awayStartRef.current = null;
    setCancelConfirmOpen(false);
    setFullscreenFallback(false);
    setNow(startedAt);
    setCompleted(null);
    setLauncherOpen(false);
    setSession({
      mode: 'open',
      label: label.trim() || '自由專注溫習',
      totalSeconds,
      endsAt: startedAt + totalSeconds * 1000,
      remaining: totalSeconds,
      immersive: false,
      leaveCount: 0,
      awaySeconds: 0,
      lastLeaveReason: null,
    });
    if (fullscreenSupported) {
      suppressBlurUntilRef.current = Date.now() + 650;
      setEnteringFullscreen(true);
      void requestFocusFullscreen().then(ok => {
        setEnteringFullscreen(false);
        if (ok) {
          setIsFullscreen(true);
          wasFullscreenRef.current = true;
        } else {
          setFullscreenFallback(true);
          toast('目前瀏覽器未能開啟全屏，已改用頁內專注監測模式。', 'error', {duration: 4500});
        }
      });
    }
  }, [fullscreenSupported, toast]);

  const pause = useCallback(() => {
    flushAway(false);
    setSession(s => (s && s.endsAt ? {...s, remaining: left(s, Date.now()), endsAt: null} : s));
  }, [flushAway]);

  const resume = useCallback(() => {
    const resumedAt = Date.now();
    setNow(resumedAt);
    const current = sessionRef.current;
    setSession(s => (s && !s.endsAt ? {...s, endsAt: resumedAt + s.remaining * 1000} : s));
    if (current?.mode === 'open' && fullscreenSupported && !fullscreenFallbackRef.current && !getFullscreenElement()) {
      enterFullscreen();
    }
  }, [enterFullscreen, fullscreenSupported]);

  const stop = useCallback(() => {
    setSession(current => {
      if (!current) return null;
      const rem = left(current, Date.now());
      const wasRunning = !!current.endsAt;
      if (current.mode === 'open') {
        awayStartRef.current = null;
        exitFocusFullscreen();
      }
      if (rem > 0 && current.mode !== 'open') {
        toast('已結束這段專注', 'success', {
          duration: 5000,
          action: {
            label: '撤銷',
            run: () => {
              const restoredAt = Date.now();
              setNow(restoredAt);
              setSession({...current, remaining: rem, endsAt: wasRunning ? restoredAt + rem * 1000 : null});
            },
          },
        });
      }
      return null;
    });
  }, [toast]);

  const cancelOpen = useCallback(() => {
    awayStartRef.current = null;
    setCancelConfirmOpen(false);
    setFullscreenFallback(false);
    exitFocusFullscreen();
    setSession(null);
    toast('已取消這段自由專注');
  }, [toast]);

  const setImmersive = useCallback((immersive: boolean) => setSession(s => s && {...s, immersive}), []);
  const openLauncher = useCallback(() => setLauncherOpen(true), []);
  const closeLauncher = useCallback(() => setLauncherOpen(false), []);
  const openCancelConfirm = useCallback(() => setCancelConfirmOpen(true), []);
  const closeCancelConfirm = useCallback(() => setCancelConfirmOpen(false), []);
  const dismissCompleted = useCallback(() => {
    exitFocusFullscreen();
    setCompleted(null);
  }, []);

  const value = useMemo<FocusValue>(() => ({
    session,
    completed,
    remaining,
    running,
    isOpenActive,
    isFullscreenShieldOpen,
    isLocked,
    isFullscreen,
    fullscreenSupported,
    fullscreenFallback,
    keyboardLocked,
    keyboardLockSupported,
    todayOpenMinutes,
    scratch,
    launcherOpen,
    cancelConfirmOpen,
    start,
    startOpen,
    pause,
    resume,
    stop,
    cancelOpen,
    setImmersive,
    setScratch,
    openLauncher,
    closeLauncher,
    openCancelConfirm,
    closeCancelConfirm,
    enterFullscreen,
    dismissCompleted,
  }), [
    session,
    completed,
    remaining,
    running,
    isOpenActive,
    isFullscreenShieldOpen,
    isLocked,
    isFullscreen,
    fullscreenSupported,
    fullscreenFallback,
    keyboardLocked,
    keyboardLockSupported,
    todayOpenMinutes,
    scratch,
    launcherOpen,
    cancelConfirmOpen,
    start,
    startOpen,
    pause,
    resume,
    stop,
    cancelOpen,
    setImmersive,
    setScratch,
    openLauncher,
    closeLauncher,
    openCancelConfirm,
    closeCancelConfirm,
    enterFullscreen,
    dismissCompleted,
  ]);

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocus() {
  const value = useContext(FocusContext);
  if (!value) throw new Error('useFocus must be used inside FocusProvider');
  return value;
}

export function FocusPill() {
  useInterfaceLanguage();
  const {db, applyTask, refresh, toast} = useApp();
  const {session, completed, remaining, running, isOpenActive, pause, resume, stop, setImmersive, dismissCompleted} = useFocus();
  if (isOpenActive || completed?.mode === 'open' || (!session && !completed)) return null;
  if (!session && completed) {
    const pendingTask = completed.taskId ? db.tasks.find(t => t.id === completed.taskId && t.status !== 'done') : undefined;
    const markDone = async () => {
      dismissCompleted();
      if (!pendingTask) return;
      applyTask({...pendingTask, status: 'done'});
      try {
        const saved = await api<Task>(`/tasks/${pendingTask.id}`, 'PATCH', {status: 'done'});
        applyTask(saved);
        void refresh().catch(() => {});
        toast('又完成了一小步！');
      } catch (err) {
        applyTask(pendingTask);
        toast((err as Error).message, 'error');
      }
    };
    return (
      <div className="focus-pill completed" role="status" aria-label={ui('專注溫習')}>
        <Icon name="checkCircle" size={16}/>
        <span className="focus-pill-label">{ui('已完成：{0}', [ui(completed.label)])}</span>
        {pendingTask && (
          <button type="button" className="focus-pill-complete" onClick={() => void markDone()}>
            {ui('標記任務完成')}
          </button>
        )}
        <button type="button" className="icon-btn" aria-label={ui('關閉專注提示')} title={ui('關閉專注提示')} onClick={dismissCompleted}>
          <Icon name="x" size={16}/>
        </button>
      </div>
    );
  }
  const activeSession = session!;
  const done = 1 - remaining / activeSession.totalSeconds;
  return (
    <div className={`focus-pill ${running ? '' : 'paused'}`} role="group" aria-label={ui('專注溫習')}>
      <span className="focus-pill-track" aria-hidden="true"><span style={{transform: `scaleX(${done})`}}/></span>
      <Icon name="clock" size={16}/>
      <span className="focus-pill-label">{ui(activeSession.label)}</span>
      <time className="focus-pill-time" aria-live="off">{clock(remaining)}</time>
      <button type="button" className="icon-btn" aria-label={running ? ui('暫停') : ui('繼續專注')} title={running ? ui('暫停') : ui('繼續專注')} onClick={running ? pause : resume}>
        <Icon name={running ? 'pause' : 'play'} size={16}/>
      </button>
      <button
        type="button"
        className={`icon-btn ${activeSession.immersive ? 'active' : ''}`}
        aria-label={ui('沉浸書桌模式')}
        aria-pressed={activeSession.immersive}
        title={activeSession.immersive ? ui('顯示導覽與工具列') : ui('開啟沉浸書桌')}
        onClick={() => setImmersive(!activeSession.immersive)}
      >
        <Icon name={activeSession.immersive ? 'minimize' : 'maximize'} size={15}/>
      </button>
      <button type="button" className="icon-btn" aria-label={ui('結束專注')} title={ui('結束專注')} onClick={stop}>
        <Icon name="x" size={16}/>
      </button>
    </div>
  );
}

export function FocusGuardBar() {
  useInterfaceLanguage();
  const {
    session,
    remaining,
    running,
    isOpenActive,
    isFullscreen,
    fullscreenSupported,
    keyboardLocked,
    scratch,
    cancelConfirmOpen,
    pause,
    resume,
    cancelOpen,
    setScratch,
    openCancelConfirm,
    closeCancelConfirm,
    enterFullscreen,
  } = useFocus();
  const [scratchOpen, setScratchOpen] = useState(false);

  useEffect(() => {
    if (!isOpenActive) setScratchOpen(false);
  }, [isOpenActive]);

  if (!isOpenActive || !session) return null;

  const leaveCount = session.leaveCount ?? 0;
  const awaySeconds = session.awaySeconds ?? 0;
  const done = Math.max(0, Math.min(1, 1 - remaining / session.totalSeconds));
  const statusLabel = !running
    ? ui('已暫停')
    : isFullscreen
      ? (keyboardLocked ? ui('全屏防誤觸鎖定中') : ui('全屏專注中'))
      : ui('頁內專注監測中');

  return (
    <>
      <div className={`focus-guard-bar ${running ? '' : 'paused'}`} role="region" aria-label={ui('自由專注鎖屏狀態列')}>
        <span className="focus-guard-track" aria-hidden="true"><span style={{transform: `scaleX(${done})`}}/></span>
        <div className="focus-guard-main">
          <span className={`focus-guard-badge ${isFullscreen && running ? 'locked' : ''}`}>
            <Icon name={running ? 'lock' : 'pause'} size={13}/>
            <span>{statusLabel}</span>
          </span>
          <strong className="focus-guard-label">{ui(session.label)}</strong>
          <time className="focus-guard-time" aria-live="off">{clock(remaining)}</time>
          <span className={`focus-guard-stat ${leaveCount > 0 ? 'warn' : 'clean'}`}>
            <Icon name={leaveCount > 0 ? 'alert' : 'checkCircle'} size={13}/>
            <span>
              {leaveCount === 0
                ? ui('0 次離開')
                : ui('離開 {0} 次 · {1}', [leaveCount, formatAwayDuration(awaySeconds)])}
            </span>
          </span>
        </div>
        <div className="focus-guard-actions">
          <button
            type="button"
            className={`btn ghost small-btn focus-guard-btn ${scratch.trim() ? 'has-note' : ''}`}
            onClick={() => setScratchOpen(true)}
          >
            <Icon name="pencil" size={14}/>
            <span>{ui('卡點便條')}</span>
          </button>
          {fullscreenSupported && !isFullscreen && (
            <button type="button" className="btn secondary small-btn focus-guard-btn" onClick={enterFullscreen}>
              <Icon name="maximize" size={14}/>
              <span>{ui('進入全屏')}</span>
            </button>
          )}
          <button type="button" className="btn secondary small-btn focus-guard-btn" onClick={running ? pause : resume}>
            <Icon name={running ? 'pause' : 'play'} size={14}/>
            <span>{running ? ui('暫停') : ui('繼續專注')}</span>
          </button>
          <button type="button" className="btn ghost small-btn focus-guard-cancel" onClick={openCancelConfirm}>
            {ui('取消專注')}
          </button>
        </div>
      </div>

      {scratchOpen && (
        <Modal
          title={ui('卡點暫存便條')}
          subtitle={ui('先記下剛才卡住的題號或概念，不用急著打斷專注，完成後可一鍵帶去提問。')}
          onClose={() => setScratchOpen(false)}
        >
          <textarea
            className="question-answer-input"
            rows={4}
            maxLength={240}
            value={scratch}
            onChange={e => setScratch(e.target.value)}
            placeholder={ui('記下剛才卡住的題號或概念，完成後可一鍵帶去提問…')}
          />
          <div className="modal-actions">
            {scratch && (
              <button type="button" className="btn ghost" onClick={() => setScratch('')}>
                {ui('清除暫存便條')}
              </button>
            )}
            <button type="button" className="btn primary" onClick={() => setScratchOpen(false)}>
              {ui('返回繼續學習')}
            </button>
          </div>
        </Modal>
      )}

      {cancelConfirmOpen && (
        <Modal
          title={ui('取消自由專注確認')}
          onClose={closeCancelConfirm}
        >
          <p><strong>{ui('還剩 {0}，確定要取消這段自由專注嗎？', [clock(remaining)])}</strong></p>
          <p className="muted small" style={{marginTop: 8}}>
            {ui('取消後將退出全屏並解除專注限制，未完成的計時不會計入今日自由專注。')}
          </p>
          {leaveCount > 0 && (
            <p className="muted small" style={{marginTop: 8}}>
              {ui('目前紀錄：離開畫面 {0} 次，累計約 {1}。', [leaveCount, formatAwayDuration(awaySeconds)])}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn primary" onClick={closeCancelConfirm}>
              {ui('繼續專注')}
            </button>
            <button type="button" className="btn secondary" onClick={cancelOpen}>
              {ui('確認取消並離開')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

const OPEN_PRESETS: {minutes: number; hint: string}[] = [
  {minutes: 15, hint: '短重溫 · 單一概念'},
  {minutes: 25, hint: '標準番茄鐘'},
  {minutes: 45, hint: '長題目 · 半份卷'},
  {minutes: 75, hint: 'Past Paper 操卷'},
];

export function OpenFocusModal() {
  useInterfaceLanguage();
  const {launcherOpen, closeLauncher, startOpen, todayOpenMinutes} = useFocus();
  const [minutes, setMinutes] = useState(25);
  const [customLabel, setCustomLabel] = useState('');
  if (!launcherOpen) return null;
  return (
    <Modal
      title={ui('開啟自由專注')}
      subtitle={ui('進入全屏專注模式，同時可在站內自由看課題、做測驗、問 AI 或溫習筆記。')}
      onClose={closeLauncher}
    >
      <div className="open-focus-presets" role="radiogroup" aria-label={ui('選擇專注時長')}>
        {OPEN_PRESETS.map(preset => (
          <button
            type="button"
            key={preset.minutes}
            role="radio"
            aria-checked={minutes === preset.minutes}
            className={`open-focus-preset ${minutes === preset.minutes ? 'selected' : ''}`}
            onClick={() => setMinutes(preset.minutes)}
          >
            <strong>{ui('{0} 分鐘', [preset.minutes])}</strong>
            <small>{ui(preset.hint)}</small>
          </button>
        ))}
      </div>
      <label className="field" style={{marginTop: 16}}>
        <span>{ui('這段時間想專注甚麼？（可留空）')}</span>
        <input
          value={customLabel}
          maxLength={60}
          onChange={e => setCustomLabel(e.target.value)}
          placeholder={ui('例如：2023 Maths Paper 2 操卷、中文範文重溫')}
        />
      </label>
      {todayOpenMinutes > 0 && (
        <p className="open-focus-tally">
          <Icon name="checkCircle" size={15}/>
          <span>{ui('今日已完成 {0} 分鐘自由專注', [todayOpenMinutes])}</span>
        </p>
      )}
      <div className="info-callout" style={{marginBottom: 0}}>
        <Icon name="lock"/>
        <p>{ui('開始後會進入瀏覽器全屏，你仍可自由探索站內所有頁面；站外連結會暫時攔截，切換分頁／視窗或退出全屏會即時提醒並記錄次數與時長。瀏覽器無法封鎖系統級熱鍵（如 Win 鍵），支援的桌面瀏覽器會自動防誤觸 Esc 及開關分頁快捷鍵；中途退出須按「取消專注」並再次確認。')}</p>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn secondary" onClick={closeLauncher}>{ui('稍後再說')}</button>
        <button
          type="button"
          className="btn primary"
          onClick={() => startOpen(minutes, customLabel.trim() || '自由專注溫習')}
        >
          <Icon name="maximize" size={16}/>
          {ui('進入全屏自由專注')}
        </button>
      </div>
    </Modal>
  );
}

export function FocusDeskOverlay() {
  useInterfaceLanguage();
  const navigate = useNavigate();
  const {
    session,
    completed,
    remaining,
    running,
    isFullscreenShieldOpen,
    todayOpenMinutes,
    scratch,
    pause,
    cancelOpen,
    setScratch,
    enterFullscreen,
    dismissCompleted,
  } = useFocus();
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (!isFullscreenShieldOpen) setConfirmCancel(false);
  }, [isFullscreenShieldOpen]);

  if (!session && completed?.mode === 'open') {
    const trimmedScratch = scratch.trim();
    const leaveCount = completed.leaveCount ?? 0;
    const awaySeconds = completed.awaySeconds ?? 0;
    const askAi = () => {
      const prompt = trimmedScratch;
      dismissCompleted();
      if (prompt) setScratch('');
      navigate('/learn', prompt ? {state: {initialPrompt: prompt}} : undefined);
    };
    const askForum = () => {
      const prompt = trimmedScratch;
      dismissCompleted();
      if (prompt) setScratch('');
      navigate('/forum', prompt ? {
        state: {
          composeDraft: {
            flair: 'help',
            title: prompt.slice(0, 60),
            body: prompt,
          },
        },
      } : undefined);
    };
    return (
      <section className="focus-desk-lock completed" role="dialog" aria-modal="true" aria-labelledby="focus-desk-heading">
        <div className="focus-desk-inner">
          <header className="focus-desk-top">
            <Badge tone="green">{ui('自由專注已完成')}</Badge>
            {todayOpenMinutes > 0 && (
              <span className="focus-desk-tally">{ui('今日已完成 {0} 分鐘自由專注', [todayOpenMinutes])}</span>
            )}
          </header>
          <div className="focus-desk-stage">
            <h1 id="focus-desk-heading">{ui('這 {0} 分鐘，你完整留給了自己。', [completed.minutes ?? 25])}</h1>
            <p className="focus-desk-subtitle">{ui('已完成「{0}」· 先喝口水、讓眼睛休息一下。', [ui(completed.label)])}</p>
            <div className={`focus-report-card ${leaveCount === 0 ? 'clean' : 'noted'}`}>
              <Icon name={leaveCount === 0 ? 'checkCircle' : 'alert'} size={18}/>
              <div>
                <strong>
                  {leaveCount === 0
                    ? ui('全程保持專注 · 0 次離開畫面')
                    : ui('本次離開畫面 {0} 次 · 累計約 {1}', [leaveCount, formatAwayDuration(awaySeconds)])}
                </strong>
                <small>
                  {leaveCount === 0
                    ? ui('整個時段沒有切換分頁、離開視窗或退出全屏。')
                    : ui('每次察覺分心並把自己拉回站內，都是在訓練專注力。')}
                </small>
              </div>
            </div>
            <div className="focus-parking-lot">
              <label htmlFor="focus-scratch-done">
                <Icon name="pencil" size={14}/>
                <span>{ui('卡點暫存便條')}</span>
              </label>
              <div className="focus-parking-row">
                <input
                  id="focus-scratch-done"
                  value={scratch}
                  onChange={e => setScratch(e.target.value)}
                  placeholder={ui('剛才操卷或溫習有卡住的題目嗎？寫在這裡可一鍵帶去提問…')}
                />
                {scratch && (
                  <button type="button" className="icon-btn" aria-label={ui('清除暫存便條')} onClick={() => setScratch('')}>
                    <Icon name="x" size={15}/>
                  </button>
                )}
              </div>
              {trimmedScratch && (
                <div className="focus-handoff-actions">
                  <button type="button" className="btn secondary small-btn" onClick={askAi}>
                    <Icon name="chat" size={15}/>
                    {ui('帶去 AI 學習室提問')}
                  </button>
                  <button type="button" className="btn secondary small-btn" onClick={askForum}>
                    <Icon name="forum" size={15}/>
                    {ui('去同學討論區提問')}
                  </button>
                </div>
              )}
            </div>
            <div className="focus-desk-controls">
              <button type="button" className="btn primary" onClick={dismissCompleted}>
                {ui('返回學習書桌')}
                <Icon name="arrow" size={16}/>
              </button>
            </div>
          </div>
          <p className="focus-desk-foot">{ui('自由專注只保存在此瀏覽器，不計入已記錄學習分鐘或掌握證據。')}</p>
        </div>
      </section>
    );
  }

  if (!isFullscreenShieldOpen || !session) return null;

  const progressPct = ((session.totalSeconds - remaining) / session.totalSeconds) * 100;
  const leaveCount = session.leaveCount ?? 0;
  const awaySeconds = session.awaySeconds ?? 0;

  return (
    <section className={`focus-desk-lock ${running ? '' : 'paused'}`} role="dialog" aria-modal="true" aria-labelledby="focus-desk-heading">
      <div className="focus-desk-inner">
        <header className="focus-desk-top">
          <div className="focus-desk-badges">
            <Badge tone="amber">{ui('已退出全屏專注')}</Badge>
            {todayOpenMinutes > 0 && (
              <span className="focus-desk-tally">{ui('今日已完成 {0} 分鐘自由專注', [todayOpenMinutes])}</span>
            )}
          </div>
        </header>

        <div className="focus-desk-stage">
          <h1 id="focus-desk-heading">{ui(session.label)}</h1>
          <p className="focus-desk-subtitle">
            {ui('自由專注仍在進行中，返回全屏後即可繼續自由瀏覽站內所有頁面。')}
          </p>
          <time className="focus-desk-clock" aria-live="off">{clock(remaining)}</time>
          <Progress value={progressPct} color="#9e7422" className="focus-desk-progress"/>

          {leaveCount > 0 && (
            <div className="focus-report-card noted">
              <Icon name="alert" size={18}/>
              <div>
                <strong>{ui('本次已離開畫面 {0} 次 · 累計約 {1}', [leaveCount, formatAwayDuration(awaySeconds)])}</strong>
                <small>{ui('點擊下方返回全屏，即可接續你剛才正在查看的頁面。')}</small>
              </div>
            </div>
          )}

          {!confirmCancel ? (
            <div className="focus-desk-controls">
              <button type="button" className="btn primary" onClick={enterFullscreen}>
                <Icon name="maximize" size={16}/>
                {ui('返回全屏繼續專注')}
              </button>
              <button type="button" className="btn secondary" onClick={pause}>
                <Icon name="pause" size={16}/>
                {ui('暫停計時')}
              </button>
              <button type="button" className="btn ghost focus-cancel-trigger" onClick={() => setConfirmCancel(true)}>
                {ui('取消自由專注')}
              </button>
            </div>
          ) : (
            <div className="focus-cancel-gate" role="group" aria-label={ui('取消自由專注確認')}>
              <p>
                <strong>{ui('還剩 {0}，確定要取消這段自由專注嗎？', [clock(remaining)])}</strong>
                <small>{ui('取消後將退出全屏並解除專注限制，未完成的計時不會計入今日自由專注。')}</small>
              </p>
              <div className="focus-cancel-actions">
                <button type="button" className="btn primary" onClick={() => setConfirmCancel(false)}>
                  {ui('繼續專注')}
                </button>
                <button type="button" className="btn secondary" onClick={cancelOpen}>
                  {ui('確認取消並離開')}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="focus-desk-foot">
          {ui('瀏覽器無法封鎖 Windows／Alt+Tab 等系統熱鍵；離開全屏或切換視窗只在此瀏覽器記錄，不計入已記錄學習分鐘或掌握證據。')}
        </p>
      </div>
    </section>
  );
}
