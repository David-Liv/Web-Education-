import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from './state';
import { useFocus } from './focus';
import { useCalculator } from './calculator';
import { Icon } from './components';
import { ui, useInterfaceLanguage } from './i18n';
import { StarBean } from './StarBean';
import {
  STARBEAN_ACCESSORIES,
  STARBEAN_PALETTES,
  clearMascotReaction,
  emitMascotReaction,
  getMascotSnapshot,
  resolveMascotVisual,
  subscribeMascot,
  updateStarBeanPrefs,
} from './mascot-events';
import type { IdlePhase, StarBeanAccessory, StarBeanColor, StarBeanDockSide } from './mascot-events';

const PET_W = 84;
const PET_WIDE_W = 140;
const PET_H = 90;
const EDGE_SNAP_PX = 42;
const IDLE_SIT_MS = 15_000;
const IDLE_ROLL_MS = 45_000;
const IDLE_NAP_MS = 120_000;

function useMascotSnapshot() {
  return useSyncExternalStore(subscribeMascot, getMascotSnapshot, getMascotSnapshot);
}

function defaultPos(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 1120, y: 620 };
  const isMobile = window.innerWidth <= 900;
  const bottomPad = isMobile ? 80 : 24;
  const rightPad = isMobile ? 12 : 24;
  return {
    x: Math.max(12, window.innerWidth - PET_W - rightPad),
    y: Math.max(76, window.innerHeight - PET_H - bottomPad),
  };
}

function clampPos(x: number, y: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x, y };
  const isMobile = window.innerWidth <= 900;
  const maxX = Math.max(12, window.innerWidth - PET_W - 8);
  const maxY = Math.max(76, window.innerHeight - PET_H - (isMobile ? 74 : 12));
  return {
    x: Math.max(8, Math.min(maxX, x)),
    y: Math.max(72, Math.min(maxY, y)),
  };
}

export function StarBeanPill() {
  useInterfaceLanguage();
  const snap = useMascotSnapshot();
  const focus = useFocus();
  const visual = resolveMascotVisual({
    dragging: false,
    jobs: snap.jobs,
    reaction: snap.reaction,
    focusRunning: focus.running,
    idlePhase: 'active',
  });
  const isHidden = snap.prefs.hidden;
  const isDocked = snap.prefs.dockedSide !== 'none';

  const onClick = () => {
    if (isHidden) {
      updateStarBeanPrefs({ hidden: false, dockedSide: 'none' });
      emitMascotReaction({
        mood: 'happy',
        messageKey: '星豆回來陪你溫習囉！',
        durationMs: 3200,
        priority: 2,
      });
    } else if (isDocked) {
      updateStarBeanPrefs({ dockedSide: 'none' });
      emitMascotReaction({
        mood: 'happy',
        messageKey: '我出來陪你啦！',
        durationMs: 2800,
        priority: 1,
      });
    } else {
      window.dispatchEvent(new CustomEvent('hokse:starbean-toggle-menu'));
    }
  };

  return (
    <button
      type="button"
      className={`starbean-topbar-pill ${!isHidden ? 'active' : ''} ${visual.aiBusy ? 'is-busy' : ''}`}
      onClick={onClick}
      aria-label={isHidden ? ui('喚出星豆桌寵') : ui('星豆桌寵選單')}
      title={isHidden ? ui('喚出星豆桌寵') : ui(visual.statusKey)}
    >
      <StarBean
        mood={isHidden ? 'idle' : visual.mood}
        color={snap.prefs.color}
        accessory={visual.autoGlasses ? 'glasses' : snap.prefs.accessory}
        size={21}
        compact
        animated={false}
        showShadow={false}
      />
      <span>{ui('星豆')}</span>
      {(visual.aiBusy || visual.mood === 'sus' || visual.mood === 'error') && (
        <i
          className={`starbean-status-dot ${
            visual.mood === 'sus' || visual.mood === 'error' ? 'tone-alert' : 'tone-ai'
          }`}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

export function StarBeanPet() {
  useInterfaceLanguage();
  const snap = useMascotSnapshot();
  const { db } = useApp();
  const focus = useFocus();
  const calc = useCalculator();
  const location = useLocation();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragTilt, setDragTilt] = useState(0);
  const [idlePhase, setIdlePhase] = useState<IdlePhase>('active');
  const [rollOffset, setRollOffset] = useState(0);
  const [rollDir, setRollDir] = useState<'left' | 'right'>('left');
  const [gaze, setGaze] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [facing, setFacing] = useState<'right' | 'left'>('right');
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (snap.prefs.x !== null && snap.prefs.y !== null) {
      return clampPos(snap.prefs.x, snap.prefs.y);
    }
    return defaultPos();
  });

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    lastX: number;
    moved: boolean;
  } | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const lastClickRef = useRef<number>(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLeaveCountRef = useRef<number>(focus.session?.leaveCount ?? 0);
  const prevCompletedRef = useRef<unknown>(focus.completed);
  const prevTaskDoneCountRef = useRef<number | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  const onQuizSession = /^\/quizzes\/[^/]+/.test(location.pathname);
  const activeTimedQuiz =
    onQuizSession &&
    db.quizzes.some(q => location.pathname.endsWith('/' + q.id) && !q.submittedAt && q.kind === 'timed');
  const autoQuiet = Boolean(activeTimedQuiz || focus.session?.immersive || focus.isOpenActive);

  useEffect(() => {
    const onResize = () => {
      setPos(old => clampPos(old.x, old.y));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onToggleMenu = () => setMenuOpen(v => !v);
    window.addEventListener('hokse:starbean-toggle-menu', onToggleMenu);
    return () => window.removeEventListener('hokse:starbean-toggle-menu', onToggleMenu);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // Hook into Focus Mode leaveCount (Among Us sus glare!) & completion celebration
  useEffect(() => {
    const currentLeaves = focus.session?.leaveCount ?? 0;
    if (focus.session && currentLeaves > prevLeaveCountRef.current) {
      emitMascotReaction({
        mood: 'sus',
        messageKey: '剛切走囉，回來繼續？',
        durationMs: 6500,
        priority: 4,
      });
    }
    prevLeaveCountRef.current = currentLeaves;
  }, [focus.session?.leaveCount, focus.session]);

  useEffect(() => {
    if (focus.completed && focus.completed !== prevCompletedRef.current) {
      emitMascotReaction({
        mood: 'celebrate',
        messageKey: '專注完成！給自己一個 ★★',
        durationMs: 6000,
        priority: 3,
      });
    }
    prevCompletedRef.current = focus.completed;
  }, [focus.completed]);

  // Hook into Today's tasks completed milestone
  useEffect(() => {
    const todayDone = db.tasks.filter(
      t => t.date === db.profile.date && t.kind !== 'exam' && t.status === 'done'
    ).length;
    if (prevTaskDoneCountRef.current !== null && todayDone > prevTaskDoneCountRef.current) {
      emitMascotReaction({
        mood: 'celebrate',
        messageKey: '完成一項今日任務，太穩了！',
        durationMs: 4200,
        priority: 2,
      });
    }
    prevTaskDoneCountRef.current = todayDone;
  }, [db.tasks, db.profile.date]);

  // 3-stage idle cadence: 15s sitting (watching you) -> 45s rolling -> 120s nap (sleep mask)
  useEffect(() => {
    const wake = () => {
      lastActivityRef.current = Date.now();
      setIdlePhase(prev => (prev === 'active' ? prev : 'active'));
      setRollOffset(0);
    };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    for (const ev of events) window.addEventListener(ev, wake, { passive: true });
    const timer = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= IDLE_NAP_MS) {
        setIdlePhase('nap');
        setRollOffset(0);
      } else if (elapsed >= IDLE_ROLL_MS) {
        setIdlePhase('rolling');
      } else if (elapsed >= IDLE_SIT_MS) {
        setIdlePhase('sitting');
        setRollOffset(0);
      }
    }, 2500);
    return () => {
      for (const ev of events) window.removeEventListener(ev, wake);
      clearInterval(timer);
    };
  }, []);

  const visual = resolveMascotVisual({
    dragging,
    jobs: snap.jobs,
    reaction: snap.reaction,
    focusRunning: focus.running,
    idlePhase,
  });

  const effectiveDock: StarBeanDockSide =
    visual.mood === 'sus'
      ? 'none'
      : snap.prefs.dockedSide !== 'none'
        ? snap.prefs.dockedSide
        : autoQuiet && !dragging
          ? 'right'
          : 'none';

  // Live cursor eye-tracking while 'sitting' (坐係到 望你做野!)
  useEffect(() => {
    if (visual.mood !== 'sitting' || effectiveDock !== 'none') {
      setGaze({ x: 0, y: 0 });
      return;
    }
    let rafId = 0;
    const onMove = (e: PointerEvent) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const cx = posRef.current.x + PET_W / 2;
        const cy = posRef.current.y + PET_H * 0.46;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const scale = Math.min(1, dist / 220);
        setGaze({
          x: Number(((dx / dist) * scale).toFixed(2)),
          y: Number(((dy / dist) * scale).toFixed(2)),
        });
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [visual.mood, effectiveDock]);

  // Smooth inward horizontal rolling runway (滾 / 左右碌)
  useEffect(() => {
    if (visual.mood !== 'rolling' || dragging || autoQuiet || effectiveDock !== 'none') {
      setRollOffset(0);
      return;
    }
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const onRightHalf = posRef.current.x > vw / 2;
    const maxRun = vw <= 900 ? 34 : 64;
    const inwardSign = onRightHalf ? -1 : 1;
    let phase = 0;

    setRollDir(inwardSign < 0 ? 'left' : 'right');
    setRollOffset(inwardSign * maxRun);

    const interval = setInterval(() => {
      phase = (phase + 1) % 2;
      if (phase === 0) {
        setRollDir(inwardSign < 0 ? 'left' : 'right');
        setRollOffset(inwardSign * maxRun);
      } else {
        setRollDir(inwardSign < 0 ? 'right' : 'left');
        setRollOffset(0);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [visual.mood, dragging, autoQuiet, effectiveDock]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const startPos =
        effectiveDock === 'right' && typeof window !== 'undefined'
          ? { x: window.innerWidth - PET_W + 28, y: pos.y }
          : effectiveDock === 'left'
            ? { x: -28, y: pos.y }
            : pos;
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: startPos.x,
        originY: startPos.y,
        lastX: e.clientX,
        moved: false,
      };
    },
    [effectiveDock, pos]
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) >= 6) {
      d.moved = true;
      setDragging(true);
      setMenuOpen(false);
    }
    if (d.moved) {
      const vx = e.clientX - d.lastX;
      d.lastX = e.clientX;
      setDragTilt(Math.max(-18, Math.min(18, vx * 1.1)));
      if (Math.abs(vx) > 1.5) setFacing(vx < 0 ? 'left' : 'right');
      const next = clampPos(d.originX + dx, d.originY + dy);
      setPos(next);
    }
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      dragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      if (d.moved) {
        setDragging(false);
        setDragTilt(0);
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        const finalPos = clampPos(d.originX + dx, d.originY + dy);
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
        let dockedSide: StarBeanDockSide = 'none';
        if (finalPos.x <= EDGE_SNAP_PX) dockedSide = 'left';
        else if (finalPos.x + PET_W >= vw - EDGE_SNAP_PX) dockedSide = 'right';
        setPos(finalPos);
        updateStarBeanPrefs({ x: finalPos.x, y: finalPos.y, dockedSide });
        if (dockedSide !== 'none') {
          emitMascotReaction({
            mood: 'happy',
            messageKey: '貼邊探頭陪讀中～',
            durationMs: 2600,
            priority: 1,
          });
        }
        return;
      }

      // Single click -> quick menu; double click -> pet celebrate
      const now = Date.now();
      if (now - lastClickRef.current < 280) {
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
        }
        lastClickRef.current = 0;
        setMenuOpen(false);
        if (snap.prefs.dockedSide !== 'none') {
          updateStarBeanPrefs({ dockedSide: 'none' });
        }
        emitMascotReaction({
          mood: 'celebrate',
          messageKey: '嘿嘿，繼續一起衝 ★★！',
          durationMs: 2800,
          priority: 2,
        });
      } else {
        lastClickRef.current = now;
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          if (snap.prefs.dockedSide !== 'none') {
            updateStarBeanPrefs({ dockedSide: 'none' });
            setMenuOpen(true);
          } else {
            setMenuOpen(v => !v);
          }
        }, 230);
      }
    },
    [snap.prefs.dockedSide]
  );

  if (snap.prefs.hidden) return null;

  const dueCount = db.reviews.filter(
    r => r.dueDate <= db.profile.date && r.lastReviewed !== db.profile.date
  ).length;
  const todayTasks = db.tasks.filter(t => t.date === db.profile.date && t.kind !== 'exam');
  const todayDone = todayTasks.filter(t => t.status === 'done').length;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 820;
  const isMobile = vw <= 900;
  const wideActive = visual.wideCanvas && effectiveDock === 'none' && !autoQuiet;
  const activeW = wideActive ? (isMobile ? 114 : PET_WIDE_W) : isMobile ? 70 : PET_W;

  const calcShift = calc.open && vw >= 1240 && effectiveDock === 'none' && pos.x > vw - 440 ? -326 : 0;
  const rawLeft = pos.x + rollOffset + calcShift;
  const maxSafeLeft = Math.max(8, vw - activeW - (calc.open && vw >= 1240 ? 336 : 12));
  const displayLeft =
    effectiveDock === 'left'
      ? -34
      : effectiveDock === 'right'
        ? vw - PET_W + 34
        : Math.max(8, Math.min(maxSafeLeft, rawLeft));

  const inChatComposerZone =
    location.pathname.startsWith('/learn') &&
    !dragging &&
    effectiveDock === 'none' &&
    displayLeft > vw * 0.42;
  const displayTop = inChatComposerZone ? Math.min(pos.y, Math.max(84, vh - 235)) : pos.y;
  const popAlignRight = displayLeft + activeW / 2 > vw / 2;
  const popBelow = displayTop < 330;

  const effectiveFacing: 'right' | 'left' =
    visual.mood === 'sus' ? (displayLeft > vw / 2 ? 'left' : 'right') : facing;

  const activeAccessory: StarBeanAccessory = visual.autoGlasses ? 'glasses' : snap.prefs.accessory;
  const showBubble = Boolean(
    visual.bubbleKey && !menuOpen && (!autoQuiet || visual.mood === 'sus' || visual.aiBusy)
  );

  const playAction = (
    mood: 'sitting' | 'rolling' | 'nap' | 'exhausted',
    messageKey: string,
    durationMs: number
  ) => {
    setMenuOpen(false);
    if (snap.prefs.dockedSide !== 'none') {
      updateStarBeanPrefs({ dockedSide: 'none' });
    }
    emitMascotReaction({ mood, messageKey, durationMs, priority: 2 });
  };

  return (
    <div
      className={`starbean-pet-shell ${dragging ? 'is-dragging' : ''} ${
        wideActive ? 'is-wide' : ''
      } ${visual.mood === 'rolling' ? 'is-rolling' : ''} ${
        effectiveDock !== 'none' ? `is-docked is-docked-${effectiveDock}` : ''
      } ${autoQuiet ? 'is-quiet' : ''}`}
      style={{
        left: `${displayLeft}px`,
        top: `${displayTop}px`,
      }}
      data-testid="starbean-pet"
      data-mood={visual.mood}
      data-docked={effectiveDock}
      data-color={snap.prefs.color}
      data-accessory={activeAccessory}
      data-wide={wideActive ? 'true' : 'false'}
      data-look-x={gaze.x}
      data-look-y={gaze.y}
      data-roll-dir={rollDir}
    >
      {/* Compact bilingual speech/status bubble */}
      {showBubble && visual.bubbleKey && (
        <div
          className={`starbean-bubble ${popAlignRight ? 'align-right' : 'align-left'} ${
            visual.mood === 'sus' || visual.mood === 'error' ? 'tone-alert' : ''
          }`}
          role="status"
          data-testid="starbean-bubble"
        >
          <span>{ui(visual.bubbleKey, visual.bubbleArgs)}</span>
          {(visual.actionRoute || visual.actionEvent) && visual.actionLabelKey && (
            <button
              type="button"
              className="starbean-bubble-link"
              onClick={() => {
                clearMascotReaction();
                if (visual.actionEvent) {
                  window.dispatchEvent(new CustomEvent(visual.actionEvent, { detail: visual.actionDetail }));
                }
                if (visual.actionRoute) {
                  navigate(visual.actionRoute);
                }
              }}
            >
              {ui(visual.actionLabelKey)}
            </button>
          )}
          {visual.actionEvent && (
            <button
              type="button"
              className="starbean-bubble-close"
              aria-label={ui('稍後再說')}
              onClick={() => clearMascotReaction()}
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      )}

      {/* Compact quick-action, playful actions & skin popover */}
      {menuOpen && (
        <div
          className={`starbean-popover ${popAlignRight ? 'align-right' : 'align-left'} ${
            popBelow ? 'align-below' : 'align-above'
          }`}
          role="dialog"
          aria-label={ui('星豆桌寵選單')}
          data-testid="starbean-popover"
        >
          <div className="starbean-pop-head">
            <div>
              <strong>{ui('星豆 Starbean')}</strong>
              <small>{ui(visual.statusKey)}</small>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label={ui('關閉選單')}
              onClick={() => setMenuOpen(false)}
            >
              <Icon name="x" size={15} />
            </button>
          </div>

          <div className="starbean-pop-meta">
            <span>{ui('今日任務 {0}/{1}', [todayDone, todayTasks.length])}</span>
            <span>·</span>
            <span>{ui('待溫習 {0} 項', [dueCount])}</span>
          </div>

          <div className="starbean-pop-actions">
            <button
              type="button"
              className="starbean-action-chip"
              onClick={() => {
                setMenuOpen(false);
                focus.openLauncher();
              }}
            >
              <Icon name="clock" size={14} />
              <span>{focus.running ? ui('專注計時中') : ui('開啟專注')}</span>
            </button>
            <button
              type="button"
              className="starbean-action-chip"
              onClick={() => {
                setMenuOpen(false);
                calc.toggleCalculator();
              }}
            >
              <Icon name="maths" size={14} />
              <span>{ui('DSE 計數機')}</span>
            </button>
            <button
              type="button"
              className="starbean-action-chip"
              onClick={() => {
                setMenuOpen(false);
                navigate('/learn');
              }}
            >
              <Icon name="sparkles" size={14} />
              <span>{ui('問 AI 一題')}</span>
            </button>
            <button
              type="button"
              className="starbean-action-chip"
              onClick={() => {
                setMenuOpen(false);
                updateStarBeanPrefs({ dockedSide: effectiveDock === 'none' ? 'right' : 'none' });
              }}
            >
              <Icon name="pin" size={14} />
              <span>{effectiveDock === 'none' ? ui('貼邊探頭') : ui('恢復浮動')}</span>
            </button>
          </div>

          <div className="starbean-pop-section">
            <span className="starbean-pop-label">{ui('逗星豆玩')}</span>
            <div className="starbean-acc-row">
              <button
                type="button"
                className={`starbean-acc-chip ${visual.mood === 'sitting' ? 'selected' : ''}`}
                data-testid="starbean-play-sitting"
                onClick={() => playAction('sitting', '坐喺度望住你做嘢～', 12_000)}
              >
                {ui('望住你')}
              </button>
              <button
                type="button"
                className={`starbean-acc-chip ${visual.mood === 'rolling' ? 'selected' : ''}`}
                data-testid="starbean-play-rolling"
                onClick={() => playAction('rolling', '碌嚟碌去放鬆一下！', 6500)}
              >
                {ui('左右碌')}
              </button>
              <button
                type="button"
                className={`starbean-acc-chip ${visual.mood === 'nap' ? 'selected' : ''}`}
                data-testid="starbean-play-nap"
                onClick={() => playAction('nap', '戴眼罩小睡一陣…', 10_000)}
              >
                {ui('戴眼罩睡')}
              </button>
              <button
                type="button"
                className={`starbean-acc-chip ${visual.mood === 'exhausted' ? 'selected' : ''}`}
                data-testid="starbean-play-exhausted"
                onClick={() => playAction('exhausted', '呼…搞掂晒，累成狗了！', 6000)}
              >
                {ui('累成狗了')}
              </button>
            </div>
          </div>

          <div className="starbean-pop-section">
            <span className="starbean-pop-label">{ui('星豆配色')}</span>
            <div className="starbean-swatch-row">
              {(Object.keys(STARBEAN_PALETTES) as StarBeanColor[]).map(c => (
                <button
                  key={c}
                  type="button"
                  className={`starbean-swatch ${snap.prefs.color === c ? 'selected' : ''}`}
                  style={{ background: STARBEAN_PALETTES[c].body }}
                  aria-label={ui(STARBEAN_PALETTES[c].labelKey)}
                  title={ui(STARBEAN_PALETTES[c].labelKey)}
                  data-testid={`starbean-color-${c}`}
                  onClick={() => {
                    updateStarBeanPrefs({ color: c });
                    emitMascotReaction({
                      mood: 'happy',
                      messageKey: '換上新配色囉！',
                      durationMs: 2200,
                      priority: 1,
                    });
                  }}
                />
              ))}
            </div>
          </div>

          <div className="starbean-pop-section">
            <span className="starbean-pop-label">{ui('頭頂掛件')}</span>
            <div className="starbean-acc-row">
              {STARBEAN_ACCESSORIES.map(acc => (
                <button
                  key={acc.id}
                  type="button"
                  className={`starbean-acc-chip ${snap.prefs.accessory === acc.id ? 'selected' : ''}`}
                  data-testid={`starbean-acc-${acc.id}`}
                  onClick={() => updateStarBeanPrefs({ accessory: acc.id })}
                >
                  {ui(acc.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="starbean-pop-foot">
            <button
              type="button"
              className="starbean-link-btn"
              onClick={() => {
                emitMascotReaction({
                  mood: 'celebrate',
                  messageKey: '雙星加油！慢慢排好就行',
                  durationMs: 2800,
                  priority: 2,
                });
                setMenuOpen(false);
              }}
            >
              {ui('拍拍打氣')}
            </button>
            <button
              type="button"
              className="starbean-link-btn muted"
              data-testid="starbean-hide-btn"
              onClick={() => {
                setMenuOpen(false);
                updateStarBeanPrefs({ hidden: true });
              }}
            >
              {ui('暫時收起')}
            </button>
          </div>
        </div>
      )}

      {/* Draggable / Clickable Starbean Mascot Body */}
      <button
        type="button"
        className="starbean-trigger"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label={ui('星豆 Starbean：{0}（點擊開選單、雙擊互動、拖曳移動）', [ui(visual.statusKey)])}
        title={ui('點擊開選單 · 雙擊拍拍 · 拖曳移動')}
        style={{
          transform: dragging
            ? `rotate(${dragTilt}deg) scale(1.06)`
            : effectiveDock === 'left'
              ? 'rotate(16deg)'
              : effectiveDock === 'right'
                ? 'rotate(-16deg)'
                : undefined,
        }}
        data-testid="starbean-trigger"
      >
        <StarBean
          mood={visual.mood}
          color={snap.prefs.color}
          accessory={activeAccessory}
          size={autoQuiet && effectiveDock !== 'none' ? 68 : wideActive ? (isMobile ? 68 : 84) : 78}
          compact={effectiveDock !== 'none' || autoQuiet}
          facing={effectiveFacing}
          lookX={gaze.x}
          lookY={gaze.y}
          rollDirection={rollDir}
          showShadow={effectiveDock === 'none'}
        />
      </button>
    </div>
  );
}
