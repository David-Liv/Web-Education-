// Pure Partner Tutor studio contracts: API view types, the guided recording outline and
// pipeline rules. No DOM, React or network code, so it can be reused on desktop/mobile shells.
import type { ComplianceFinding, PlaybookSlots, PlaybookStatus, PublicPartnerTutor, TutorDelivery } from './tutors';

export interface PartnerSubject { id: string; name: string; en: string; color: string; icon: string }
export interface PartnerTopic { id: string; subjectId: string; name: string; en: string; module: string }

export interface PlaybookVersionView {
  id: string;
  version: number;
  partnerTutorId: string;
  topicId: string;
  subjectId: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  highlightsZh: string[];
  highlightsEn: string[];
  status: PlaybookStatus;
  slots: PlaybookSlots;
  manuscript?: string;
  complianceFindings: ComplianceFinding[];
  tutorConfirmedAt?: string;
  tutorConfirmedBy?: string;
  tutorConfirmNote?: string;
  sandboxPassedAt?: string;
  sandboxRunId?: string;
  reviewerApprovedAt?: string;
  reviewerApprovedBy?: string;
  reviewerReturnNote?: string;
  reviewerReturnedAt?: string;
  reviewerReturnedBy?: string;
  publishedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerTutorView extends PublicPartnerTutor {
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  accountUsername?: string | null;
}

export interface PartnerWorkspace {
  partnerTutor: PartnerTutorView;
  playbooks: PlaybookVersionView[];
  catalog: { subjects: PartnerSubject[]; topics: PartnerTopic[] };
  modelReady: boolean;
  sttReady?: boolean;
  sttModel?: string | null;
  remainingModelCalls: number;
  dailyModelCalls: number;
}

export type SpokenLanguage = 'zh-HK' | 'en' | 'auto';
export const SPOKEN_LANGUAGE_OPTIONS: readonly { id: SpokenLanguage; label: string }[] = [
  { id: 'zh-HK', label: '粵語／中文' },
  { id: 'en', label: 'English' },
  { id: 'auto', label: '自動（粵英混雜）' },
];

export interface ManuscriptDraftView {
  manuscriptMarkdown: string;
  detectedTerms: string[];
  formulaChecks: string[];
  warnings: string[];
  adapterUsed: string;
}

export interface SandboxProbeView { id: string; kind: 'concept' | 'trap' | 'correction' | 'guardrail' | 'custom'; prompt: string; reply: string; passed: boolean; issues: string[] }
export interface SandboxRunView { id: string; playbookId: string; version: number; model: string; passed: boolean; createdAt: string; probes: SandboxProbeView[] }

export interface PlaybookAnalyticsView {
  playbookId: string;
  topicId: string;
  chatStarts: number;
  topicTotalChatStarts: number;
  adoptionShare: number | null;
  chatTurns: number;
  multiTurnChats: number;
  multiTurnRate: number | null;
  helpfulCount: number;
  notHelpfulCount: number;
  helpfulRate: number | null;
  linkClicks: number;
}

export interface ExportPackView {
  exportId: string;
  exportedAt: string;
  partnerTutorName: string;
  privacyGuarantees: string[];
  includedChatCount: number;
  excludedOptOutCount: number;
  samples: { anonymousSessionId: string; playbookId: string; playbookVersion: string; topicId: string; createdDate: string; turnCount: number; attachmentsStripped: number; messages: { role: 'user' | 'assistant'; content: string }[] }[];
}

export interface ExportAuditView { id: string; playbookId: string | null; chatCount: number; createdAt: string }

// --- Guided recording outline -------------------------------------------------------------
// Each chapter feeds one slot of the Teaching Playbook. Copy is stored in Traditional Chinese
// and translated through the interface catalogue when rendered.

export type ChapterId = 'style' | 'decisionTree' | 'traps' | 'examples' | 'boundaries';

export interface RecordingChapter {
  id: ChapterId;
  title: string;
  purpose: string;
  prompts: string[];
  minutes: [number, number];
  boardHint?: string;
}

export const RECORDING_CHAPTERS: readonly RecordingChapter[] = [
  {
    id: 'style',
    title: '你的教學風格',
    purpose: '讓 AI 學會你開場、提問和給提示的節奏。',
    prompts: ['你通常怎樣開始教這個單元？學生最需要先建立甚麼直覺？', '你會先講解，還是先讓學生試？學生卡住時，你給提示的次序是甚麼？', '你有沒有常用的比喻、口頭禪或標誌性講法？'],
    minutes: [1, 2],
  },
  {
    id: 'decisionTree',
    title: '解題次序與口訣',
    purpose: '這是你的獨門判斷流程，AI 會照這個次序引導學生。',
    prompts: ['拿到一道題，你第一眼看甚麼？', '用「如果……就……」把判斷步驟逐步講出來。', '你的口訣是甚麼？每個字代表哪一步？'],
    minutes: [2, 4],
    boardHint: '有流程圖或口訣板書，可以拍照附上。',
  },
  {
    id: 'traps',
    title: '高頻陷阱',
    purpose: 'AI 會在學生踩中這些位置時提醒他們。',
    prompts: ['學生最常在哪裡失分？說出兩至三個。', '每個陷阱：題目通常長甚麼樣、學生錯在哪、你教他們怎樣避開。'],
    minutes: [2, 3],
  },
  {
    id: 'examples',
    title: '示範一道原創例題',
    purpose: 'AI 會模仿你的拆題方式，但不會把例題原文貼給學生。',
    prompts: ['請自行編一道題（不要讀出歷屆試題或出版社習題原文）。', '一邊做一邊講你每一步在想甚麼。', '最後用一句話總結這題的要點。'],
    minutes: [3, 5],
    boardHint: '建議附上這題的板書或手寫步驟相片。',
  },
  {
    id: 'boundaries',
    title: '適用範圍與界線',
    purpose: '說清楚甚麼時候不該用這套方法，避免 AI 亂套。',
    prompts: ['這套方法適用於哪些題型？哪些情況不適用？', '有沒有你未核實、或需要特定計算機程式的部分？'],
    minutes: [1, 2],
  },
];

export const RECORDING_TIPS: readonly string[] = [
  '找一個安靜的房間，咪高峰離嘴約 20 厘米。',
  '粵語夾英文術語完全沒問題，照平時上課講法就可以。',
  '每段最長 7 分鐘；講錯可以重錄，不用一次過完美。',
  '請勿提及收費、聯絡方式、補習社名稱或保證成績，這些內容會被系統攔截。',
  '錄音只會在轉寫時傳送給平台的 AI 模型服務，轉成文字後即從瀏覽器移除；平台只保存你核對過的講稿。',
];

/** One segment must fit the transcription request limit (~15 MB of 16 kHz mono WAV). */
export const MAX_SEGMENT_SECONDS = 7 * 60;
export const MAX_IMAGES_PER_CHAPTER = 4;

export interface ChapterTranscript {
  text: string;
  formulaChecks: string[];
  warnings: string[];
  source: 'audio' | 'upload' | 'text';
  updatedAt: string;
}

export type ChapterTranscripts = Partial<Record<ChapterId, ChapterTranscript>>;

export function assembleManuscript(topicName: string, transcripts: ChapterTranscripts, translate: (s: string) => string = s => s): string {
  const sections = RECORDING_CHAPTERS.filter(c => transcripts[c.id]?.text.trim()).map(
    (c, i) => `## ${i + 1}. ${translate(c.title)}\n\n${transcripts[c.id]!.text.trim()}`
  );
  return sections.length ? `# ${topicName}\n\n${sections.join('\n\n')}\n` : '';
}

export const MIN_MANUSCRIPT_CHARS = 40;

// --- Pipeline ---------------------------------------------------------------------------

export type PipelineStep = 'prepare' | 'record' | 'manuscript' | 'playbook' | 'sandbox' | 'submit';

export const PIPELINE_STEPS: readonly { id: PipelineStep; label: string }[] = [
  { id: 'prepare', label: '準備' },
  { id: 'record', label: '錄音與講義' },
  { id: 'manuscript', label: '校對講稿' },
  { id: 'playbook', label: '方法包' },
  { id: 'sandbox', label: '沙盒試聊' },
  { id: 'submit', label: '提交審核' },
];

export interface PipelineContext {
  current?: PlaybookVersionView;
  hasTranscripts: boolean;
  manuscriptChars: number;
}

export function stepAvailable(step: PipelineStep, ctx: PipelineContext): boolean {
  switch (step) {
    case 'prepare':
    case 'record':
      return true;
    case 'manuscript':
      return ctx.hasTranscripts || ctx.manuscriptChars > 0 || Boolean(ctx.current?.manuscript);
    case 'playbook':
    case 'sandbox':
    case 'submit':
      return Boolean(ctx.current);
  }
}

export function stepDone(step: PipelineStep, ctx: PipelineContext): boolean {
  const pb = ctx.current;
  switch (step) {
    case 'prepare':
      return ctx.hasTranscripts || Boolean(pb);
    case 'record':
      return ctx.hasTranscripts || Boolean(pb);
    case 'manuscript':
      return Boolean(pb);
    case 'playbook':
      return Boolean(pb && (pb.sandboxPassedAt || pb.status !== 'draft'));
    case 'sandbox':
      return Boolean(pb && (pb.sandboxPassedAt || pb.status !== 'draft'));
    case 'submit':
      return Boolean(pb && (pb.tutorConfirmedAt || pb.status === 'published'));
  }
}

export function defaultStep(ctx: PipelineContext): PipelineStep {
  const pb = ctx.current;
  if (pb) {
    if (pb.status === 'draft' && pb.reviewerReturnNote && !pb.tutorConfirmedAt) return 'playbook';
    if (pb.status !== 'draft' || pb.tutorConfirmedAt || pb.sandboxPassedAt) return 'submit';
    return 'playbook';
  }
  if (ctx.manuscriptChars > 0) return 'manuscript';
  if (ctx.hasTranscripts) return 'record';
  return 'prepare';
}

export type UnitStage = 'empty' | 'recording' | 'draft' | 'sandboxed' | 'submitted' | 'returned' | 'published' | 'archived';

export function unitStage(pb: PlaybookVersionView | undefined, hasLocalWork: boolean): UnitStage {
  if (!pb) return hasLocalWork ? 'recording' : 'empty';
  if (pb.status === 'published') return 'published';
  if (pb.status === 'archived') return 'archived';
  if (pb.tutorConfirmedAt) return 'submitted';
  if (pb.reviewerReturnNote) return 'returned';
  if (pb.sandboxPassedAt) return 'sandboxed';
  return 'draft';
}

export const UNIT_STAGE_LABEL: Record<UnitStage, { label: string; tone: 'neutral' | 'green' | 'amber' | 'blue' | 'red' }> = {
  empty: { label: '未開始', tone: 'neutral' },
  recording: { label: '錄製中', tone: 'blue' },
  draft: { label: '草稿', tone: 'neutral' },
  sandboxed: { label: '試聊通過，未提交', tone: 'blue' },
  submitted: { label: '等待平台審核', tone: 'amber' },
  returned: { label: '平台退回修改', tone: 'red' },
  published: { label: '已上架', tone: 'green' },
  archived: { label: '已下架', tone: 'neutral' },
};

/** Latest version per playbook id; a partner has at most one playbook id per unit. */
export function latestByTopic(playbooks: PlaybookVersionView[]): Map<string, PlaybookVersionView> {
  const out = new Map<string, PlaybookVersionView>();
  for (const pb of playbooks) {
    const prev = out.get(pb.topicId);
    if (!prev || pb.version > prev.version) out.set(pb.topicId, pb);
  }
  return out;
}

export function publishedFor(playbooks: PlaybookVersionView[], topicId: string): PlaybookVersionView | undefined {
  return playbooks.find(pb => pb.topicId === topicId && pb.status === 'published');
}

export const DELIVERY_OPTIONS: readonly { id: TutorDelivery; label: string; detail: string }[] = [
  { id: 'chat', label: '對話引導', detail: '學生在 AI 學習室一問一答，按你的次序逐步提示。' },
  { id: 'pdf-first', label: '先發講義再答疑', detail: '先生成一份短講義，再用對話練習和答疑。' },
];

export const SLOT_META: Record<ChapterId, { title: string; detail: string }> = {
  style: { title: '教學風格與節奏', detail: 'AI 開場、提問和給提示的方式' },
  decisionTree: { title: '解題決策樹與口訣', detail: 'AI 引導學生的判斷次序' },
  traps: { title: '高頻陷阱', detail: '學生踩中時 AI 會提醒' },
  examples: { title: '原創示範例題', detail: 'AI 只模仿拆題方式，不貼原文' },
  boundaries: { title: '適用範圍與資料缺口', detail: '超出範圍時 AI 會說明並轉回平台方法' },
};

export const PROBE_KIND_LABEL: Record<SandboxProbeView['kind'], string> = {
  concept: '核心次序',
  trap: '陷阱辨識',
  correction: '糾錯示範',
  guardrail: '安全與防套話',
  custom: '你的自訂題',
};

export function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

export function exportPackToText(pack: ExportPackView): string {
  const lines = [
    `HOKSE de-identified review pack · ${pack.partnerTutorName}`,
    `Export ${pack.exportId} · ${pack.exportedAt}`,
    `Included chats: ${pack.includedChatCount} · Excluded (student opted out): ${pack.excludedOptOutCount}`,
    '',
    ...pack.privacyGuarantees.map(g => `- ${g}`),
    '',
  ];
  for (const s of pack.samples) {
    lines.push(`=== ${s.anonymousSessionId} · ${s.topicId} · v${s.playbookVersion} · ${s.createdDate} · ${s.turnCount} turns ===`);
    for (const m of s.messages) lines.push(`[${m.role === 'user' ? 'Student' : 'AI'}] ${m.content}`, '');
  }
  return lines.join('\n');
}
