import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import type {ReactNode} from 'react';
import {ui, useInterfaceLanguage} from './i18n';
import {Icon} from './components';
import {useApp} from './state';
import {api} from './api/client';
import type {Task} from './types';

// A focus session lives above the routes so it keeps running while the
// student moves between lessons, the AI study room and quizzes. It is a
// client-side timer only: it never writes study records or mastery evidence.
interface FocusSession {label: string; totalSeconds: number; endsAt: number | null; remaining: number; immersive: boolean; taskId?: string}
interface CompletedFocus {label: string; taskId?: string}
interface FocusValue {
  session: FocusSession | null;
  completed: CompletedFocus | null;
  remaining: number;
  running: boolean;
  start: (minutes: number, label: string, taskId?: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setImmersive: (value: boolean) => void;
  dismissCompleted: () => void;
}
const storageKey = 'hokse.focus-session';
const completedKey = 'hokse.focus-completed';
const FocusContext = createContext<FocusValue | null>(null);

function loadSession(): FocusSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as FocusSession | null;
    if (!value || typeof value.totalSeconds !== 'number') return null;
    if (value.endsAt && value.endsAt <= Date.now()) {
      if (Date.now() - value.endsAt < 3600_000) {
        localStorage.setItem(completedKey, JSON.stringify({label: value.label, taskId: value.taskId}));
      }
      localStorage.removeItem(storageKey);
      return null;
    }
    return value;
  } catch {return null}
}
function loadCompleted(): CompletedFocus | null {
  try {
    const value = JSON.parse(localStorage.getItem(completedKey) ?? 'null') as CompletedFocus | null;
    return value && typeof value.label === 'string' ? value : null;
  } catch {return null}
}
const left = (session: FocusSession, now: number) => session.endsAt ? Math.max(0, Math.ceil((session.endsAt - now) / 1000)) : session.remaining;
export const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

export function FocusProvider({children}: {children: ReactNode}) {
  const {db, applyTask, refresh, toast} = useApp();
  const [session, setSession] = useState<FocusSession | null>(loadSession);
  const [completed, setCompleted] = useState<CompletedFocus | null>(loadCompleted);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    try {session ? localStorage.setItem(storageKey, JSON.stringify(session)) : localStorage.removeItem(storageKey)} catch {}
  }, [session]);
  useEffect(() => {
    try {completed ? localStorage.setItem(completedKey, JSON.stringify(completed)) : localStorage.removeItem(completedKey)} catch {}
  }, [completed]);
  useEffect(() => {
    if (!session?.endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session?.endsAt]);
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
  useEffect(() => {
    if (session?.endsAt && remaining <= 0) {
      const doneInfo: CompletedFocus = {label: session.label, taskId: session.taskId};
      const hasPendingTask = !!session.taskId && db.tasks.some(t => t.id === session.taskId && t.status !== 'done');
      setSession(null);
      setCompleted(doneInfo);
      toast('這一段專注完成了，休息一下。', 'success', hasPendingTask ? {
        duration: 8000,
        action: {label: '標記任務完成', run: () => void finishTask(session.taskId!)},
      } : undefined);
    }
  }, [db.tasks, finishTask, remaining, session, toast]);
  const start = useCallback((minutes: number, label: string, taskId?: string) => {
    const totalSeconds = Math.max(1, Math.round(minutes)) * 60;
    setNow(Date.now());
    setCompleted(null);
    setSession({label, totalSeconds, endsAt: Date.now() + totalSeconds * 1000, remaining: totalSeconds, immersive: true, taskId});
  }, []);
  const pause = useCallback(() => setSession(s => s && s.endsAt ? {...s, remaining: left(s, Date.now()), endsAt: null} : s), []);
  const resume = useCallback(() => {setNow(Date.now()); setSession(s => s && !s.endsAt ? {...s, endsAt: Date.now() + s.remaining * 1000} : s)}, []);
  const stop = useCallback(() => {
    setSession(current => {
      if (!current) return null;
      const rem = left(current, Date.now());
      const wasRunning = !!current.endsAt;
      if (rem > 0) {
        toast('已結束這段專注', 'success', {
          duration: 5000,
          action: {
            label: '撤銷',
            run: () => {
              setNow(Date.now());
              setSession({...current, remaining: rem, endsAt: wasRunning ? Date.now() + rem * 1000 : null});
            },
          },
        });
      }
      return null;
    });
  }, [toast]);
  const setImmersive = useCallback((immersive: boolean) => setSession(s => s && {...s, immersive}), []);
  const dismissCompleted = useCallback(() => setCompleted(null), []);
  const value = useMemo(() => ({session, completed, remaining, running: !!session?.endsAt, start, pause, resume, stop, setImmersive, dismissCompleted}), [session, completed, remaining, start, pause, resume, stop, setImmersive, dismissCompleted]);
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
  const {session, completed, remaining, running, pause, resume, stop, setImmersive, dismissCompleted} = useFocus();
  if (!session && !completed) return null;
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
    return <div className="focus-pill completed" role="status" aria-label={ui('專注溫習')}>
      <Icon name="checkCircle" size={16}/>
      <span className="focus-pill-label">{ui('已完成：{0}', [ui(completed.label)])}</span>
      {pendingTask && <button type="button" className="focus-pill-complete" onClick={() => void markDone()}>{ui('標記任務完成')}</button>}
      <button type="button" className="icon-btn" aria-label={ui('關閉專注提示')} title={ui('關閉專注提示')} onClick={dismissCompleted}><Icon name="x" size={16}/></button>
    </div>;
  }
  const activeSession = session!;
  const done = 1 - remaining / activeSession.totalSeconds;
  return <div className={`focus-pill ${running ? '' : 'paused'}`} role="group" aria-label={ui('專注溫習')}>
    <span className="focus-pill-track" aria-hidden="true"><span style={{transform: `scaleX(${done})`}}/></span>
    <Icon name="clock" size={16}/>
    <span className="focus-pill-label">{ui(activeSession.label)}</span>
    <time className="focus-pill-time" aria-live="off">{clock(remaining)}</time>
    <button type="button" className="icon-btn" aria-label={running ? ui('暫停') : ui('繼續專注')} title={running ? ui('暫停') : ui('繼續專注')} onClick={running ? pause : resume}><Icon name={running ? 'pause' : 'play'} size={16}/></button>
    <button type="button" className={`icon-btn ${activeSession.immersive ? 'active' : ''}`} aria-label={ui('沉浸書桌模式')} aria-pressed={activeSession.immersive} title={activeSession.immersive ? ui('顯示導覽與工具列') : ui('開啟沉浸書桌')} onClick={() => setImmersive(!activeSession.immersive)}><Icon name="bulb" size={16}/></button>
    <button type="button" className="icon-btn" aria-label={ui('結束專注')} title={ui('結束專注')} onClick={stop}><Icon name="x" size={16}/></button>
  </div>;
}
