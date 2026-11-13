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
// - 'open' (Open Focus): native browser fullscreen + 100% viewport locked study desk
//   for physical Past Papers / textbook revision; requires explicit cancel confirmation
//   to leave early. Neither mode ever writes db.events or mastery evidence.
export type FocusMode = 'task' | 'open';

interface FocusSession {
  mode?: FocusMode;
  label: string;
  totalSeconds: number;
  endsAt: number | null;
  remaining: number;
  immersive: boolean;
  taskId?: string;
}

interface CompletedFocus {
  mode?: FocusMode;
  label: string;
  minutes?: number;
  taskId?: string;
}

interface FocusValue {
  session: FocusSession | null;
  completed: CompletedFocus | null;
  remaining: number;
  running: boolean;
  isLocked: boolean;
  isFullscreen: boolean;
  fullscreenSupported: boolean;
  todayOpenMinutes: number;
  scratch: string;
  launcherOpen: boolean;
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

export function requestFocusFullscreen() {
  if (typeof document === 'undefined' || getFullscreenElement()) return;
  const el = document.documentElement as FullscreenEl;
  if (typeof el.requestFullscreen === 'function') {
    void el.requestFullscreen().catch(() => {});
  } else if (typeof el.webkitRequestFullscreen === 'function') {
    try {
      void el.webkitRequestFullscreen();
    } catch {}
  }
}

function exitFocusFullscreen() {
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
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => Boolean(getFullscreenElement()));
  const fullscreenSupported = useMemo(() => isFullscreenApiSupported(), []);
  const [now, setNow] = useState(() => Date.now());
  const completedTokenRef = useRef<string | null>(null);

  const today = db.profile.date;
  const todayOpenMinutes = dailyMap[today] ?? 0;
  const isLocked = session?.mode === 'open' || completed?.mode === 'open';

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

  useEffect(() => {
    const syncFs = () => setIsFullscreen(Boolean(getFullscreenElement()));
    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);
    return () => {
      document.removeEventListener('fullscreenchange', syncFs);
      document.removeEventListener('webkitfullscreenchange', syncFs);
    };
  }, []);

  // Warn before accidental reload / tab close while Open Focus lock is active.
  useEffect(() => {
    if (session?.mode !== 'open') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [session?.mode]);

  // Keep screen awake during running Open Focus on supported devices.
  useEffect(() => {
    if (session?.mode !== 'open' || !session.endsAt) return;
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
  }, [session?.endsAt, session?.mode]);

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
      const doneInfo: CompletedFocus = {
        mode,
        label: session.label,
        minutes: minutesDone,
        taskId: session.taskId,
      };
      const hasPendingTask = !!session.taskId && db.tasks.some(t => t.id === session.taskId && t.status !== 'done');
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

  const start = useCallback((minutes: number, label: string, taskId?: string) => {
    const totalSeconds = Math.max(1, Math.round(minutes)) * 60;
    const startedAt = Date.now();
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
    requestFocusFullscreen();
    setNow(startedAt);
    setCompleted(null);
    setLauncherOpen(false);
    setSession({
      mode: 'open',
      label: label.trim() || '自由專注溫習',
      totalSeconds,
      endsAt: startedAt + totalSeconds * 1000,
      remaining: totalSeconds,
      immersive: true,
    });
  }, []);

  const pause = useCallback(() => {
    setSession(s => (s && s.endsAt ? {...s, remaining: left(s, Date.now()), endsAt: null} : s));
  }, []);

  const resume = useCallback(() => {
    const resumedAt = Date.now();
    setNow(resumedAt);
    setSession(s => (s && !s.endsAt ? {...s, endsAt: resumedAt + s.remaining * 1000} : s));
  }, []);

  const stop = useCallback(() => {
    setSession(current => {
      if (!current) return null;
      const rem = left(current, Date.now());
      const wasRunning = !!current.endsAt;
      if (current.mode === 'open') {
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
    exitFocusFullscreen();
    setSession(null);
    toast('已取消這段自由專注');
  }, [toast]);

  const setImmersive = useCallback((immersive: boolean) => setSession(s => s && {...s, immersive}), []);
  const openLauncher = useCallback(() => setLauncherOpen(true), []);
  const closeLauncher = useCallback(() => setLauncherOpen(false), []);
  const enterFullscreen = useCallback(() => requestFocusFullscreen(), []);
  const dismissCompleted = useCallback(() => {
    exitFocusFullscreen();
    setCompleted(null);
  }, []);

  const value = useMemo<FocusValue>(() => ({
    session,
    completed,
    remaining,
    running: !!session?.endsAt,
    isLocked,
    isFullscreen,
    fullscreenSupported,
    todayOpenMinutes,
    scratch,
    launcherOpen,
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
    enterFullscreen,
    dismissCompleted,
  }), [
    session,
    completed,
    remaining,
    isLocked,
    isFullscreen,
    fullscreenSupported,
    todayOpenMinutes,
    scratch,
    launcherOpen,
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
  const {session, completed, remaining, running, isLocked, pause, resume, stop, setImmersive, dismissCompleted} = useFocus();
  if (isLocked || (!session && !completed)) return null;
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
      subtitle={ui('適合紙本 Past Paper 操卷、課本重溫或自定練習。')}
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
        <p>{ui('開始後將進入全屏書桌並暫時鎖定站內頁面；如需中途離開，須點擊「取消自由專注」並再次確認。')}</p>
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
    isLocked,
    isFullscreen,
    fullscreenSupported,
    todayOpenMinutes,
    scratch,
    pause,
    resume,
    cancelOpen,
    setScratch,
    enterFullscreen,
    dismissCompleted,
  } = useFocus();
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (!session || session.mode !== 'open') setConfirmCancel(false);
  }, [session]);

  if (!isLocked) return null;

  if (!session && completed?.mode === 'open') {
    const trimmedScratch = scratch.trim();
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

  const activeSession = session!;
  const progressPct = ((activeSession.totalSeconds - remaining) / activeSession.totalSeconds) * 100;

  return (
    <section className={`focus-desk-lock ${running ? '' : 'paused'}`} role="dialog" aria-modal="true" aria-labelledby="focus-desk-heading">
      <div className="focus-desk-inner">
        <header className="focus-desk-top">
          <div className="focus-desk-badges">
            <Badge tone="amber">{ui('自由專注鎖定中')}</Badge>
            {todayOpenMinutes > 0 && (
              <span className="focus-desk-tally">{ui('今日已完成 {0} 分鐘自由專注', [todayOpenMinutes])}</span>
            )}
          </div>
          {fullscreenSupported && !isFullscreen && (
            <button type="button" className="btn secondary small-btn" onClick={enterFullscreen}>
              <Icon name="maximize" size={15}/>
              {ui('返回全屏繼續專注')}
            </button>
          )}
        </header>

        <div className="focus-desk-stage">
          <h1 id="focus-desk-heading">{ui(activeSession.label)}</h1>
          <p className="focus-desk-subtitle">
            {running
              ? ui('專注計時進行中 · 完成或取消前將鎖定其他頁面')
              : ui('計時已暫停 · 準備好隨時繼續')}
          </p>
          <time className="focus-desk-clock" aria-live="off">{clock(remaining)}</time>
          <Progress value={progressPct} color="#9e7422" className="focus-desk-progress"/>

          {!confirmCancel ? (
            <div className="focus-desk-controls">
              <button type="button" className="btn primary" onClick={running ? pause : resume}>
                <Icon name={running ? 'pause' : 'play'} size={16}/>
                {running ? ui('暫停') : ui('繼續專注')}
              </button>
              <button type="button" className="btn ghost focus-cancel-trigger" onClick={() => setConfirmCancel(true)}>
                {ui('取消自由專注')}
              </button>
            </div>
          ) : (
            <div className="focus-cancel-gate" role="group" aria-label={ui('取消自由專注確認')}>
              <p>
                <strong>{ui('還剩 {0}，確定要取消這段自由專注嗎？', [clock(remaining)])}</strong>
                <small>{ui('取消後將退出全屏並返回原本頁面，未完成的計時不會計入今日自由專注。')}</small>
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

          <div className="focus-parking-lot">
            <label htmlFor="focus-scratch-input">
              <Icon name="pencil" size={14}/>
              <span>{ui('卡點暫存便條')}</span>
            </label>
            <div className="focus-parking-row">
              <input
                id="focus-scratch-input"
                value={scratch}
                maxLength={240}
                onChange={e => setScratch(e.target.value)}
                placeholder={ui('記下剛才卡住的題號或概念，完成後可一鍵帶去提問…')}
              />
              {scratch && (
                <button type="button" className="icon-btn" aria-label={ui('清除暫存便條')} onClick={() => setScratch('')}>
                  <Icon name="x" size={15}/>
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="focus-desk-foot">{ui('自由專注只保存在此瀏覽器，不計入已記錄學習分鐘或掌握證據。')}</p>
      </div>
    </section>
  );
}
