export type StarBeanColor = 'amber' | 'coral' | 'emerald' | 'cobalt';
export type StarBeanAccessory = 'none' | 'glasses' | 'sprout' | 'starclip' | 'book';
export type StarBeanDockSide = 'none' | 'left' | 'right';

export type StarBeanMood =
  | 'idle'
  | 'happy'
  | 'thinking'
  | 'streaming'
  | 'quizGenerating'
  | 'grading'
  | 'exhausted'
  | 'celebrate'
  | 'comfort'
  | 'focus'
  | 'sus'
  | 'sitting'
  | 'rolling'
  | 'nap'
  | 'sleepy'
  | 'dragged'
  | 'error'
  | 'patrol';

export type IdlePhase = 'active' | 'sitting' | 'rolling' | 'nap';
export type AiWorkKind = 'chat' | 'quiz' | 'grading';

export interface ActiveAiJob {
  id: string;
  kind: AiWorkKind;
  phase: 'thinking' | 'streaming';
  startedAt: number;
  route?: string;
}

export interface MascotReaction {
  id: number;
  mood: StarBeanMood;
  messageKey?: string;
  messageArgs?: unknown[];
  actionRoute?: string;
  actionEvent?: string;
  actionDetail?: unknown;
  actionLabelKey?: string;
  expiresAt: number;
  priority: number;
}

export interface StarBeanPreferences {
  color: StarBeanColor;
  accessory: StarBeanAccessory;
  hidden: boolean;
  dockedSide: StarBeanDockSide;
  x: number | null;
  y: number | null;
}

export interface MascotSnapshot {
  jobs: ActiveAiJob[];
  reaction: MascotReaction | null;
  prefs: StarBeanPreferences;
  version: number;
}

export const STARBEAN_PALETTES: Record<
  StarBeanColor,
  { labelKey: string; body: string; shadow: string; highlight: string; earInner: string }
> = {
  amber: {
    labelKey: '亮琥珀黃',
    body: '#F5B72F',
    shadow: '#C97B18',
    highlight: '#FCD673',
    earInner: '#DDA01F',
  },
  coral: {
    labelKey: '朱砂橙',
    body: '#E85D3F',
    shadow: '#B53B24',
    highlight: '#F5937B',
    earInner: '#CC4A2F',
  },
  emerald: {
    labelKey: '薄荷翠綠',
    body: '#28A87B',
    shadow: '#176E4F',
    highlight: '#63CFA8',
    earInner: '#1E8A64',
  },
  cobalt: {
    labelKey: '原子筆藍',
    body: '#3B6FE0',
    shadow: '#2247A3',
    highlight: '#79A1F5',
    earInner: '#2C58BF',
  },
};

export const STARBEAN_ACCESSORIES: { id: StarBeanAccessory; labelKey: string }[] = [
  { id: 'none', labelKey: '無掛件' },
  { id: 'glasses', labelKey: '小圓眼鏡' },
  { id: 'sprout', labelKey: '小綠芽' },
  { id: 'starclip', labelKey: '金星耳夾' },
  { id: 'book', labelKey: '迷你書' },
];

export function isWideStarBeanMood(mood: StarBeanMood): boolean {
  return (
    mood === 'thinking' ||
    mood === 'streaming' ||
    mood === 'quizGenerating' ||
    mood === 'grading' ||
    mood === 'exhausted' ||
    mood === 'nap'
  );
}

const STORAGE_KEY = 'hokse.starbean.v1';

export const DEFAULT_STARBEAN_PREFS: StarBeanPreferences = {
  color: 'amber',
  accessory: 'none',
  hidden: false,
  dockedSide: 'none',
  x: null,
  y: null,
};

function isColor(v: unknown): v is StarBeanColor {
  return typeof v === 'string' && v in STARBEAN_PALETTES;
}

function isAccessory(v: unknown): v is StarBeanAccessory {
  return v === 'none' || v === 'glasses' || v === 'sprout' || v === 'starclip' || v === 'book';
}

function isDockSide(v: unknown): v is StarBeanDockSide {
  return v === 'none' || v === 'left' || v === 'right';
}

export function loadStarBeanPrefs(): StarBeanPreferences {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return { ...DEFAULT_STARBEAN_PREFS };
    const parsed = JSON.parse(raw) as Partial<StarBeanPreferences>;
    return {
      color: isColor(parsed.color) ? parsed.color : DEFAULT_STARBEAN_PREFS.color,
      accessory: isAccessory(parsed.accessory) ? parsed.accessory : DEFAULT_STARBEAN_PREFS.accessory,
      hidden: Boolean(parsed.hidden),
      dockedSide: isDockSide(parsed.dockedSide) ? parsed.dockedSide : 'none',
      x: typeof parsed.x === 'number' && Number.isFinite(parsed.x) ? parsed.x : null,
      y: typeof parsed.y === 'number' && Number.isFinite(parsed.y) ? parsed.y : null,
    };
  } catch {
    return { ...DEFAULT_STARBEAN_PREFS };
  }
}

export function saveStarBeanPrefs(prefs: StarBeanPreferences): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    }
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

let jobsMap = new Map<string, ActiveAiJob>();
let currentReaction: MascotReaction | null = null;
let currentPrefs: StarBeanPreferences = loadStarBeanPrefs();
let versionCounter = 0;
let reactionCounter = 0;
let reactionTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

let cachedSnapshot: MascotSnapshot = {
  jobs: [],
  reaction: null,
  prefs: currentPrefs,
  version: 0,
};

function notify(): void {
  versionCounter += 1;
  cachedSnapshot = {
    jobs: [...jobsMap.values()],
    reaction: currentReaction,
    prefs: { ...currentPrefs },
    version: versionCounter,
  };
  for (const listener of listeners) listener();
}

export function subscribeMascot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMascotSnapshot(): MascotSnapshot {
  return cachedSnapshot;
}

export function updateStarBeanPrefs(patch: Partial<StarBeanPreferences>): StarBeanPreferences {
  currentPrefs = {
    ...currentPrefs,
    ...patch,
  };
  saveStarBeanPrefs(currentPrefs);
  notify();
  return currentPrefs;
}

export function emitMascotReaction(input: {
  mood: StarBeanMood;
  messageKey?: string;
  messageArgs?: unknown[];
  actionRoute?: string;
  actionEvent?: string;
  actionDetail?: unknown;
  actionLabelKey?: string;
  durationMs?: number;
  priority?: number;
}): void {
  const now = Date.now();
  const priority = input.priority ?? 2;
  if (currentReaction && currentReaction.expiresAt > now && currentReaction.priority > priority) {
    return;
  }
  if (reactionTimer) {
    clearTimeout(reactionTimer);
    reactionTimer = null;
  }
  const durationMs = input.durationMs ?? 4800;
  reactionCounter += 1;
  const next: MascotReaction = {
    id: reactionCounter,
    mood: input.mood,
    messageKey: input.messageKey,
    messageArgs: input.messageArgs,
    actionRoute: input.actionRoute,
    actionEvent: input.actionEvent,
    actionDetail: input.actionDetail,
    actionLabelKey: input.actionLabelKey,
    expiresAt: now + durationMs,
    priority,
  };
  currentReaction = next;
  notify();
  reactionTimer = setTimeout(() => {
    if (currentReaction?.id === next.id) {
      currentReaction = null;
      reactionTimer = null;
      notify();
    }
  }, durationMs);
}

export function clearMascotReaction(): void {
  if (reactionTimer) {
    clearTimeout(reactionTimer);
    reactionTimer = null;
  }
  if (currentReaction) {
    currentReaction = null;
    notify();
  }
}

export function startAiWork(id: string, kind: AiWorkKind, route?: string): void {
  jobsMap.set(id, {
    id,
    kind,
    phase: 'thinking',
    startedAt: Date.now(),
    route,
  });
  notify();
}

export function markAiStreaming(id: string): void {
  const job = jobsMap.get(id);
  if (!job || job.phase === 'streaming') return;
  jobsMap.set(id, { ...job, phase: 'streaming' });
  notify();
}

export function finishAiWork(
  id: string,
  outcome: 'done' | 'error' | 'aborted',
  options?: { route?: string; currentPath?: string }
): void {
  const job = jobsMap.get(id);
  if (!job) return;
  jobsMap.delete(id);
  const currentPath =
    options?.currentPath ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const targetRoute = options?.route ?? job.route;
  const isAway = Boolean(targetRoute && currentPath && !currentPath.startsWith(targetRoute));

  if (outcome === 'error') {
    emitMascotReaction({
      mood: 'error',
      messageKey: 'AI 剛才卡住了，可以重試一下',
      durationMs: 5200,
      priority: 3,
    });
    return;
  }

  if (outcome === 'done') {
    if (job.kind === 'quiz') {
      emitMascotReaction({
        mood: 'exhausted',
        messageKey: isAway ? '呼…新題出好，累成狗了！' : '呼…題目搞掂，累成狗了！',
        actionRoute: isAway ? targetRoute : undefined,
        actionLabelKey: isAway ? '前往查看' : undefined,
        durationMs: isAway ? 7500 : 5200,
        priority: 3,
      });
      return;
    }
    if (job.kind === 'grading') {
      emitMascotReaction({
        mood: 'exhausted',
        messageKey: '呼…批改搞掂，累成狗了！',
        durationMs: 4800,
        priority: 2,
      });
      return;
    }
    if (job.kind === 'chat') {
      emitMascotReaction({
        mood: 'exhausted',
        messageKey: isAway ? '呼…回覆搞掂，累成狗了！' : '呼…搞掂晒，累成狗了！',
        actionRoute: isAway ? targetRoute : undefined,
        actionLabelKey: isAway ? '回到對話' : undefined,
        durationMs: isAway ? 7500 : 5000,
        priority: isAway ? 3 : 2,
      });
      return;
    }
  }
  notify();
}

export function classifyApiAiWork(path: string, method: string): AiWorkKind | null {
  if (method.toUpperCase() !== 'POST') return null;
  if (path === '/studio/quizzes' || path === '/quizzes') return 'quiz';
  if (/\/(submit|analyse|explain|review-feedback)$/.test(path) || /\/attempts$/.test(path)) {
    return 'grading';
  }
  return null;
}

export interface ResolvedMascotVisual {
  mood: StarBeanMood;
  statusKey: string;
  bubbleKey?: string;
  bubbleArgs?: unknown[];
  actionRoute?: string;
  actionEvent?: string;
  actionDetail?: unknown;
  actionLabelKey?: string;
  autoGlasses: boolean;
  aiBusy: boolean;
  wideCanvas: boolean;
}

export function resolveMascotVisual(input: {
  dragging: boolean;
  jobs: ActiveAiJob[];
  reaction: MascotReaction | null;
  focusRunning: boolean;
  idlePhase: IdlePhase;
  now?: number;
}): ResolvedMascotVisual {
  const now = input.now ?? Date.now();
  const activeReaction =
    input.reaction && input.reaction.expiresAt > now ? input.reaction : null;
  const aiBusy = input.jobs.length > 0;

  if (input.dragging) {
    return {
      mood: 'dragged',
      statusKey: '哇！輕一點拎我呀',
      bubbleKey: '哇！要帶我去哪裡？',
      autoGlasses: input.focusRunning,
      aiBusy,
      wideCanvas: false,
    };
  }

  if (activeReaction && activeReaction.mood === 'sus') {
    return {
      mood: 'sus',
      statusKey: activeReaction.actionEvent ? '發現待補強的薄弱環節' : '專注防分心提醒中',
      bubbleKey: activeReaction.messageKey ?? '剛切走囉，回來繼續？',
      bubbleArgs: activeReaction.messageArgs,
      actionRoute: activeReaction.actionRoute,
      actionEvent: activeReaction.actionEvent,
      actionDetail: activeReaction.actionDetail,
      actionLabelKey: activeReaction.actionLabelKey,
      autoGlasses: false,
      aiBusy,
      wideCanvas: false,
    };
  }

  if (input.jobs.length > 0) {
    const quizJob = input.jobs.find(j => j.kind === 'quiz');
    if (quizJob) {
      return {
        mood: 'quizGenerating',
        statusKey: 'AI 正在為你出題…',
        bubbleKey: 'AI 正在出題與檢查中…',
        autoGlasses: true,
        aiBusy: true,
        wideCanvas: true,
      };
    }
    const gradingJob = input.jobs.find(j => j.kind === 'grading');
    if (gradingJob) {
      return {
        mood: 'grading',
        statusKey: 'AI 正在批改分析…',
        bubbleKey: '正在細看你的作答…',
        autoGlasses: true,
        aiBusy: true,
        wideCanvas: true,
      };
    }
    const chatJob = input.jobs[0];
    if (chatJob.phase === 'streaming') {
      return {
        mood: 'streaming',
        statusKey: 'AI 正在整理回覆…',
        bubbleKey: 'AI 正在邊寫邊講解…',
        autoGlasses: input.focusRunning,
        aiBusy: true,
        wideCanvas: true,
      };
    }
    return {
      mood: 'thinking',
      statusKey: 'AI 正在思考中…',
      bubbleKey: 'AI 正在想這題…',
      autoGlasses: input.focusRunning,
      aiBusy: true,
      wideCanvas: true,
    };
  }

  if (activeReaction) {
    const statusMap: Partial<Record<StarBeanMood, string>> = {
      celebrate: '太棒了，繼續保持節奏！',
      exhausted: '剛剛幫你做完，累成狗了…',
      comfort: '沒關係，錯題就是提分線索',
      error: '連線或 AI 暫時卡住了',
      happy: '星豆正在陪你溫習中',
      sitting: '坐喺度望住你做嘢～',
      rolling: '碌嚟碌去解壓中～',
      nap: '戴上眼罩午睡一下…',
    };
    return {
      mood: activeReaction.mood,
      statusKey: statusMap[activeReaction.mood] ?? '星豆正在陪你溫習中',
      bubbleKey: activeReaction.messageKey,
      bubbleArgs: activeReaction.messageArgs,
      actionRoute: activeReaction.actionRoute,
      actionEvent: activeReaction.actionEvent,
      actionDetail: activeReaction.actionDetail,
      actionLabelKey: activeReaction.actionLabelKey,
      autoGlasses: input.focusRunning && activeReaction.mood === 'happy',
      aiBusy: false,
      wideCanvas: isWideStarBeanMood(activeReaction.mood),
    };
  }

  if (input.focusRunning) {
    return {
      mood: 'focus',
      statusKey: '專注陪讀中',
      autoGlasses: true,
      aiBusy: false,
      wideCanvas: false,
    };
  }

  if (input.idlePhase === 'nap') {
    return {
      mood: 'nap',
      statusKey: '戴上眼罩午睡一下…',
      autoGlasses: false,
      aiBusy: false,
      wideCanvas: true,
    };
  }

  if (input.idlePhase === 'rolling') {
    return {
      mood: 'rolling',
      statusKey: '碌嚟碌去解壓中～',
      autoGlasses: false,
      aiBusy: false,
      wideCanvas: false,
    };
  }

  if (input.idlePhase === 'sitting') {
    return {
      mood: 'sitting',
      statusKey: '坐喺度望住你做嘢～',
      autoGlasses: false,
      aiBusy: false,
      wideCanvas: false,
    };
  }

  return {
    mood: 'idle',
    statusKey: '隨時陪你整理今天的學習',
    autoGlasses: false,
    aiBusy: false,
    wideCanvas: false,
  };
}

export function resetMascotStoreForTests(): void {
  if (reactionTimer) {
    clearTimeout(reactionTimer);
    reactionTimer = null;
  }
  jobsMap = new Map();
  currentReaction = null;
  currentPrefs = { ...DEFAULT_STARBEAN_PREFS };
  versionCounter = 0;
  reactionCounter = 0;
  cachedSnapshot = {
    jobs: [],
    reaction: null,
    prefs: { ...currentPrefs },
    version: 0,
  };
}
