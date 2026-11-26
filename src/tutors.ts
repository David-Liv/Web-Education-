// Public capability contracts only. Teaching instructions stay on the server.
export type BuiltInTutorId = 'david' | 'matt';
export type TutorId = string;
export type TutorDelivery = 'chat' | 'pdf-first';
export type TutorModule = 'markdown' | 'exercise' | 'chart' | 'plot' | 'geometry' | 'diagram' | 'circuit' | 'suggestions' | 'pdf';
export type PartnerTutorStatus = 'active' | 'archived';
export type PlaybookStatus = 'draft' | 'published' | 'archived';

export const ALL_TUTOR_MODULES: readonly TutorModule[] = [
  'markdown',
  'exercise',
  'chart',
  'plot',
  'geometry',
  'diagram',
  'circuit',
  'suggestions',
  'pdf',
] as const;

export const CURRENT_TERMS_VERSION = '2026-11-26-v1';

export const PARTNER_DISCLAIMER_ZH = '由 AI 按合作導師授權方法輔導，非真人即時回覆。';
export const PARTNER_DISCLAIMER_EN = 'AI tutoring guided by this Partner Tutor\'s licensed method — not a live human reply.';

export interface UserConsentView {
  currentVersion: string;
  acceptedVersion: string | null;
  acceptedAt: string | null;
  needsAcceptance: boolean;
  sharePartnerChats: boolean;
  updatedAt: string | null;
}

export interface TutorBinding {
  id: TutorId;
  version: string;
  kind?: 'builtin' | 'partner';
  partnerTutorId?: string;
  partnerTutorName?: string;
  playbookTitle?: string;
  shareTranscriptAllowed?: boolean;
}

export interface PublicPartnerTutor {
  id: string;
  name: string;
  headlineZh: string;
  headlineEn: string;
  bioZh: string;
  bioEn: string;
  credentials: string;
  externalUrl: string | null;
  externalLabelZh: string;
  externalLabelEn: string;
  status: PartnerTutorStatus;
}

export interface PublicTutorOption {
  id: TutorId;
  version: string;
  kind: 'builtin' | 'partner';
  name: string;
  zh: string;
  en: string;
  delivery: TutorDelivery;
  supportedTopicIds: string[] | '*';
  highlightsZh?: string[];
  highlightsEn?: string[];
  disclaimerZh?: string;
  disclaimerEn?: string;
  partnerTutor?: PublicPartnerTutor;
}

export interface PlaybookSlots {
  style: {
    delivery: TutorDelivery;
    modules: TutorModule[];
    personaZh: string;
    personaEn: string;
    pacingRules: string[];
  };
  decisionTree: {
    title: string;
    steps: string[];
    mnemonics: string[];
  };
  traps: {
    pattern: string;
    warning: string;
    fix: string;
  }[];
  examples: {
    title: string;
    prompt: string;
    walkthrough: string;
    takeaway: string;
  }[];
  boundaries: {
    inScope: string[];
    outOfScope: string[];
    resourceGaps: string[];
  };
}

export interface ComplianceFinding {
  severity: 'blocker' | 'warning';
  code: string;
  slot: string;
  message: string;
  match?: string;
}

export interface LessonDocument { id: string; title: string; objective: string; number: number; version: number; sourceId?: string; createdAt: string; size: number; questions: number; reference: string; sourceIds: string[] }
export interface TeachingRecord { id: string; topicId: string; chatId: string; messageId: string; kind: 'prior-knowledge' | 'insight' | 'misconception'; text: string; quote: string; at: string; confirmed?: boolean; supersedes?: string }
export interface TutorMemory { records: TeachingRecord[]; terms: { term: string; definition: string; recordId: string }[] }
export interface TeachingState { mission: string; success: string; constraints: string; outOfScope: string; preferences: string; sourceIds: string[] }
export interface TeachingUpdate { exerciseSkills?: string[]; attempt?: { questionId: string; score: number | null; verdict: 'correct' | 'partly-correct' | 'incorrect' | 'uncertain'; text: string; reason: string }; title?: string; objective?: string; sourceIds?: string[]; reference?: string; record?: { kind: TeachingRecord['kind']; text: string; quote: string; supersedes?: string; term?: string; definition?: string } }

export function validTeachingUpdate(v: any): v is TeachingUpdate {
  const bounded = (x: unknown, n: number) => x === undefined || typeof x === 'string' && x.length <= n && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x);
  const attempt = v?.attempt;
  return !!v && typeof v === 'object' && !Array.isArray(v) && bounded(v.title, 120) && bounded(v.objective, 500) && bounded(v.reference, 1800)
    && (v.exerciseSkills === undefined || Array.isArray(v.exerciseSkills) && v.exerciseSkills.length <= 2 && v.exerciseSkills.every((s: unknown) => typeof s === 'string' && /^quadratic-(standard|factor|formula|discriminant|parameter|model)$/.test(s)))
    && (attempt === undefined || attempt && typeof attempt.questionId === 'string' && bounded(attempt.questionId, 80) && ['correct', 'partly-correct', 'incorrect', 'uncertain'].includes(attempt.verdict) && (attempt.score === null || typeof attempt.score === 'number' && Number.isFinite(attempt.score) && attempt.score >= 0 && attempt.score <= 100) && ((attempt.score === null) === (attempt.verdict === 'uncertain')) && typeof attempt.text === 'string' && bounded(attempt.text, 4000) && typeof attempt.reason === 'string' && bounded(attempt.reason, 2000))
    && (v.sourceIds === undefined || Array.isArray(v.sourceIds) && v.sourceIds.length <= 6 && v.sourceIds.every((s: unknown) => typeof s === 'string' && /^[a-z0-9-]{1,60}$/.test(s))) && (!v.record || ['prior-knowledge', 'insight', 'misconception'].includes(v.record.kind) && bounded(v.record.text, 800) && !!v.record.text && bounded(v.record.quote, 800) && !!v.record.quote && bounded(v.record.supersedes, 80) && bounded(v.record.term, 80) && bounded(v.record.definition, 300));
}

export function validatePlaybookSlots(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '教學方法包必須包含五個結構化槽位';
  const v = value as Record<string, any>;
  const nonEmptyStr = (x: unknown, max: number) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
  const strList = (x: unknown, min: number, maxItems: number, maxLen: number) =>
    Array.isArray(x) && x.length >= min && x.length <= maxItems && x.every(item => nonEmptyStr(item, maxLen));

  if (!v.style || typeof v.style !== 'object') return '缺少槽位 1：教學骨架與風格 (style)';
  if (!['chat', 'pdf-first'].includes(v.style.delivery)) return '教學骨架 delivery 僅支援 chat 或 pdf-first';
  if (!Array.isArray(v.style.modules) || !v.style.modules.length || v.style.modules.some((m: unknown) => !ALL_TUTOR_MODULES.includes(m as TutorModule))) {
    return '教學方法包允許模組無效';
  }
  if (!nonEmptyStr(v.style.personaZh, 1200) || !nonEmptyStr(v.style.personaEn, 1200)) return '請提供中英文教學風格與節奏說明';
  if (!strList(v.style.pacingRules, 1, 10, 400)) return '請至少提供 1 條教學節奏規則（最多 10 條）';

  if (!v.decisionTree || typeof v.decisionTree !== 'object') return '缺少槽位 2：單元解題決策樹與口訣 (decisionTree)';
  if (!nonEmptyStr(v.decisionTree.title, 160)) return '解題決策樹缺少標題';
  if (!strList(v.decisionTree.steps, 1, 12, 500)) return '解題決策樹至少需 1 步（最多 12 步）';
  if (!strList(v.decisionTree.mnemonics, 0, 10, 300)) return '口訣陣列格式無效（最多 10 條）';

  if (!Array.isArray(v.traps) || v.traps.length < 1 || v.traps.length > 12) return '槽位 3（高頻陷阱 traps）至少需 1 項，最多 12 項';
  for (const trap of v.traps) {
    if (!trap || typeof trap !== 'object' || !nonEmptyStr(trap.pattern, 300) || !nonEmptyStr(trap.warning, 500) || !nonEmptyStr(trap.fix, 500)) {
      return '高頻陷阱每一項都須包含 pattern、warning 及 fix';
    }
  }

  if (!Array.isArray(v.examples) || v.examples.length < 1 || v.examples.length > 8) return '槽位 4（審校示例 examples）至少需 1 道自編原創例題，最多 8 道';
  for (const ex of v.examples) {
    if (!ex || typeof ex !== 'object' || !nonEmptyStr(ex.title, 160) || !nonEmptyStr(ex.prompt, 1200) || !nonEmptyStr(ex.walkthrough, 3000) || !nonEmptyStr(ex.takeaway, 600)) {
      return '每道示例須包含 title、prompt、walkthrough 及 takeaway';
    }
  }

  if (!v.boundaries || typeof v.boundaries !== 'object') return '缺少槽位 5：覆蓋邊界與資料缺口 (boundaries)';
  if (!strList(v.boundaries.inScope, 1, 12, 300)) return '覆蓋邊界須列明至少 1 項單元涵蓋範圍 (inScope)';
  if (!strList(v.boundaries.outOfScope, 0, 12, 300)) return 'outOfScope 格式無效';
  if (!strList(v.boundaries.resourceGaps, 0, 12, 300)) return 'resourceGaps 格式無效';

  return null;
}

export const TUTORS: PublicTutorOption[] = [
  {
    id: 'david',
    version: '1',
    kind: 'builtin',
    name: 'David',
    zh: '分段導讀、漸進提示和逐步解題。按需要使用聊天練習及圖表。',
    en: 'Guided reading, gradual hints and step-by-step problem solving, with practice and visuals when useful.',
    delivery: 'chat',
    supportedTopicIds: '*',
  },
  {
    id: 'matt',
    version: '1',
    kind: 'builtin',
    name: 'Matt',
    zh: '圍繞學習目標製作短篇 PDF 課程，再透過對話練習、答疑和回顧。首個完整主題：二次方程。',
    en: 'Short PDF lessons built around your goal, followed by practice, discussion and recall. First complete topic: quadratic equations.',
    delivery: 'pdf-first',
    supportedTopicIds: ['maths-quadratic'],
  },
];

export const isBuiltInTutor = (id: string): id is BuiltInTutorId => id === 'david' || id === 'matt';

export const tutorName = (binding?: TutorBinding): string => {
  if (!binding) return 'David';
  if (binding.kind === 'partner') return binding.partnerTutorName || binding.playbookTitle || binding.id;
  return binding.id === 'matt' ? 'Matt' : 'David';
};

export const tutorSupported = (id: TutorId, topicId: string): boolean => id === 'david' || (id === 'matt' && topicId === 'maths-quadratic');

export const tutorOptionSupported = (option: PublicTutorOption, topicId: string): boolean =>
  option.supportedTopicIds === '*' || option.supportedTopicIds.includes(topicId);
