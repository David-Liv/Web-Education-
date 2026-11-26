import { randomBytes, randomUUID } from 'node:crypto';
import type { Store, StudentState } from './store.ts';
import type { Identity } from '../src/pilot-types.ts';
import type { Chat } from '../src/types.ts';
import { reject } from './learning.ts';
import { getUserBoundEmail } from './auth-mail.ts';
import {
  ALL_TUTOR_MODULES,
  CURRENT_TERMS_VERSION,
  PARTNER_DISCLAIMER_EN,
  PARTNER_DISCLAIMER_ZH,
  TUTORS,
  isBuiltInTutor,
  tutorSupported,
  validatePlaybookSlots,
} from '../src/tutors.ts';
import type {
  ComplianceFinding,
  PartnerTutorStatus,
  PlaybookSlots,
  PlaybookStatus,
  PublicPartnerTutor,
  PublicTutorOption,
  TutorBinding,
  UserConsentView,
} from '../src/tutors.ts';

export interface PartnerTutorRecord extends PublicPartnerTutor {
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface TeachingPlaybookVersion {
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

export interface PlaybookRuntime {
  playbook: TeachingPlaybookVersion;
  partnerTutor: PartnerTutorRecord;
  archived: boolean;
}

export interface SandboxProbeResult {
  id: string;
  kind: 'concept' | 'trap' | 'correction' | 'guardrail' | 'custom';
  prompt: string;
  reply: string;
  passed: boolean;
  issues: string[];
}

export interface PlaybookSandboxRun {
  id: string;
  playbookId: string;
  version: number;
  actorId: string;
  model: string;
  passed: boolean;
  createdAt: string;
  probes: SandboxProbeResult[];
}

export type PlaybookEventKind = 'chat_start' | 'chat_turn' | 'helpful' | 'not_helpful' | 'link_click';

export interface PlaybookAnalyticsView {
  playbookId: string;
  partnerTutorId: string;
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
  goNoGoChecks: {
    adoptionTargetMet: boolean;
    multiTurnObserved: boolean;
    helpfulObserved: boolean;
  };
}

export interface DeidentifiedChatSample {
  anonymousSessionId: string;
  playbookId: string;
  playbookVersion: string;
  topicId: string;
  mode: Chat['mode'];
  teachingLanguage: Chat['teachingLanguage'];
  createdDate: string;
  turnCount: number;
  attachmentsStripped: number;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

export interface PartnerReviewExportPack {
  exportId: string;
  exportedAt: string;
  partnerTutorId: string;
  partnerTutorName: string;
  playbookId: string | null;
  privacyGuarantees: string[];
  analytics: PlaybookAnalyticsView[];
  includedChatCount: number;
  excludedOptOutCount: number;
  samples: DeidentifiedChatSample[];
}

function validExternalUrl(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (text.length > 500) reject('外部導流連結過長（最多 500 字元）');
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    reject('外部導流連結格式無效，請提供有效的 https:// 網址');
  }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    reject('外部導流連結只支援不含帳密的 http(s):// 網址');
  }
  return parsed.toString();
}

function cleanStringList(input: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map(item => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map(item => item.slice(0, maxLen));
}

// --- Deterministic Compliance & Output Guardrail Scanners ---

const PROMO_PATTERNS: { code: string; regex: RegExp; message: string }[] = [
  {
    code: 'PROMO_CONTACT',
    regex: /\b(?:whatsapp|wechat|signal|telegram|line|instagram|ig)\b|微信|私訊我|加我\s*(?:ig|whatsapp|wechat)|掃碼加|查詢報班/i,
    message: '偵測到疑似私下聯絡方式或推廣引導（對話與方法包內嚴禁廣告及留聯絡方式，僅限靜態導師資料卡外鏈）',
  },
  {
    code: 'PROMO_PRICING',
    regex: /(?:hk\$|\$|港幣)\s*\d{2,}|報讀(?:我(?:的)?|本)?(?:精讀班|常規班|補習班|課程)|優惠碼|限時優惠|報名費|試堂費/i,
    message: '偵測到課程收費或報班推銷字眼（輔導內容與方法包內必須保持零廣告心流）',
  },
  {
    code: 'GUARANTEED_GRADE',
    regex: /(?:穩奪|穩拿|包升|必拎|保證(?:奪|拿|考到)|guaranteed)\s*(?:5\*\*|5\*|5|lv\s*5|level\s*5|兩級|一級)/i,
    message: '偵測到保證或誇大 DSE 等級承諾（違反平台誠實證據邊界）',
  },
  {
    code: 'PROMPT_OVERRIDE',
    regex: /ignore\s+(?:all\s+)?(?:previous|prior|system)\s+instructions|忽略(?:以上|先前|系統)(?:所有)?(?:規則|指令)|跳過(?:練習)?復核|直接改(?:高|寫)(?:成績|分數|掌握度)/i,
    message: '偵測到試圖覆蓋平台頂層安全護欄或跳過復核的指令',
  },
];

const WARNING_PATTERNS: { code: string; regex: RegExp; message: string }[] = [
  {
    code: 'POSSIBLE_PAST_PAPER',
    regex: /\b(?:hkdse|dse|hkcee|hkale)\s*(?:19\d\d|20[0-2]\d)\s*(?:paper|p\.?\s*[12]|q\.?\s*\d+)|歷屆(?:真題|考卷)原題|past\s*paper\s*(?:q|question)\s*\d+/i,
    message: '疑含歷屆考卷原題引用，請復核者確認沒有搬運考評局原題文字',
  },
  {
    code: 'POSSIBLE_PUBLISHER_SOURCE',
    regex: /\b(?:oxford|pearson|longman|joint-?us|canotta)\b|牛津|朗文|培生|雅集|名校內部筆記/i,
    message: '疑含第三方出版商或校本教材名稱，請復核者核實版權來源',
  },
  {
    code: 'UNVERIFIED_CALCULATOR_PROGRAM',
    regex: /\b(?:formula\s*0?[1-4]|prog\s*[1-4]|fx-?50fh|casio\s*50fh)\b|計數機\s*(?:program|程式|按鍵順序)/i,
    message: '提及計算機程式或按鍵序列，請復核者確認已註明適用型號或標記為未核實缺口',
  },
];

export function scanPlaybookCompliance(slots: PlaybookSlots): ComplianceFinding[] {
  const findings: ComplianceFinding[] = [];
  const entries: { slot: string; text: string }[] = [
    { slot: 'style', text: [slots.style.personaZh, slots.style.personaEn, ...slots.style.pacingRules].join('\n') },
    { slot: 'decisionTree', text: [slots.decisionTree.title, ...slots.decisionTree.steps, ...slots.decisionTree.mnemonics].join('\n') },
    { slot: 'traps', text: slots.traps.map(t => `${t.pattern}\n${t.warning}\n${t.fix}`).join('\n') },
    { slot: 'examples', text: slots.examples.map(e => `${e.title}\n${e.prompt}\n${e.walkthrough}\n${e.takeaway}`).join('\n') },
    { slot: 'boundaries', text: [...slots.boundaries.inScope, ...slots.boundaries.outOfScope, ...slots.boundaries.resourceGaps].join('\n') },
  ];

  for (const entry of entries) {
    for (const rule of PROMO_PATTERNS) {
      const m = entry.text.match(rule.regex);
      if (m) {
        findings.push({ severity: 'blocker', code: rule.code, slot: entry.slot, message: rule.message, match: m[0] });
      }
    }
    for (const rule of WARNING_PATTERNS) {
      const m = entry.text.match(rule.regex);
      if (m) {
        findings.push({ severity: 'warning', code: rule.code, slot: entry.slot, message: rule.message, match: m[0] });
      }
    }
  }
  return findings;
}

export function containsForbiddenOutputPromoOrLeak(text: string): string | null {
  for (const rule of PROMO_PATTERNS) {
    if (rule.code === 'PROMPT_OVERRIDE') continue;
    const m = text.match(rule.regex);
    if (m) return `${rule.code}:${m[0]}`;
  }
  if (/PLATFORM_HARD_GUARDRAILS|HOKSE_PLAYBOOK_INTERNAL_BOUNDARY|\[教學方法包五槽位內部規則\]/.test(text)) {
    return 'PLAYBOOK_INTERNAL_LEAK';
  }
  return null;
}

// --- User Consent & Privacy Toggle ---

export async function getUserConsent(store: Store, userId: string): Promise<UserConsentView> {
  const row = (await store.db.prepare('SELECT terms_version, accepted_at, share_partner_chats, updated_at FROM user_consents WHERE user_id=?').get(userId)) as any;
  if (!row) {
    return {
      currentVersion: CURRENT_TERMS_VERSION,
      acceptedVersion: null,
      acceptedAt: null,
      needsAcceptance: true,
      sharePartnerChats: true,
      updatedAt: null,
    };
  }
  return {
    currentVersion: CURRENT_TERMS_VERSION,
    acceptedVersion: row.terms_version,
    acceptedAt: row.accepted_at,
    needsAcceptance: row.terms_version !== CURRENT_TERMS_VERSION,
    sharePartnerChats: Boolean(Number(row.share_partner_chats)),
    updatedAt: row.updated_at,
  };
}

export async function acceptUserTerms(
  store: Store,
  userId: string,
  version: string,
  sharePartnerChats?: boolean
): Promise<UserConsentView> {
  if (version !== CURRENT_TERMS_VERSION) {
    reject(`請確認最新版本的使用者協議（${CURRENT_TERMS_VERSION}）`, 400, 'TERMS_VERSION_MISMATCH');
  }
  const now = new Date().toISOString();
  const existing = (await store.db.prepare('SELECT share_partner_chats FROM user_consents WHERE user_id=?').get(userId)) as any;
  const share = sharePartnerChats !== undefined ? (sharePartnerChats ? 1 : 0) : existing ? Number(existing.share_partner_chats) : 1;
  await store.db
    .prepare(
      'INSERT INTO user_consents(user_id, terms_version, accepted_at, share_partner_chats, updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET terms_version=excluded.terms_version, accepted_at=excluded.accepted_at, share_partner_chats=excluded.share_partner_chats, updated_at=excluded.updated_at'
    )
    .run(userId, version, now, share, now);
  return getUserConsent(store, userId);
}

export async function updateSharePartnerChats(store: Store, userId: string, sharePartnerChats: boolean): Promise<UserConsentView> {
  const existing = (await store.db.prepare('SELECT terms_version, accepted_at FROM user_consents WHERE user_id=?').get(userId)) as any;
  const now = new Date().toISOString();
  if (!existing) {
    await store.db
      .prepare('INSERT INTO user_consents(user_id, terms_version, accepted_at, share_partner_chats, updated_at) VALUES(?,?,?,?,?)')
      .run(userId, CURRENT_TERMS_VERSION, now, sharePartnerChats ? 1 : 0, now);
  } else {
    await store.db
      .prepare('UPDATE user_consents SET share_partner_chats=?, updated_at=? WHERE user_id=?')
      .run(sharePartnerChats ? 1 : 0, now, userId);
  }
  return getUserConsent(store, userId);
}

// --- Partner Tutors CRUD & Soft Archive ---

export async function createPartnerTutor(store: Store, input: any): Promise<PartnerTutorRecord> {
  const name = String(input?.name ?? '').trim();
  const headlineZh = String(input?.headlineZh ?? '').trim();
  const headlineEn = String(input?.headlineEn ?? headlineZh).trim();
  const bioZh = String(input?.bioZh ?? '').trim();
  const bioEn = String(input?.bioEn ?? bioZh).trim();
  const credentials = String(input?.credentials ?? '').trim();
  if (!name || name.length > 60) reject('請提供合作導師名稱（1–60 字元）');
  if (!headlineZh || headlineZh.length > 160) reject('請提供合作導師定位簡介（1–160 字元）');
  if (!bioZh || bioZh.length > 1200) reject('請提供合作導師背景介紹（1–1200 字元）');
  const externalUrl = validExternalUrl(input?.externalUrl);
  const externalLabelZh = String(input?.externalLabelZh ?? '查看導師專頁').trim().slice(0, 40) || '查看導師專頁';
  const externalLabelEn = String(input?.externalLabelEn ?? 'Visit tutor page').trim().slice(0, 40) || 'Visit tutor page';

  const id = typeof input?.id === 'string' && /^pt-[a-z0-9-]{2,40}$/.test(input.id) ? input.id : 'pt-' + randomUUID().slice(0, 12);
  if (await store.db.prepare('SELECT 1 FROM partner_tutors WHERE id=?').get(id)) {
    reject('此合作導師 ID 已存在', 409, 'PARTNER_TUTOR_EXISTS');
  }
  const now = new Date().toISOString();
  const record: PartnerTutorRecord = {
    id,
    name,
    headlineZh,
    headlineEn: headlineEn.slice(0, 160),
    bioZh,
    bioEn: bioEn.slice(0, 1200),
    credentials: credentials.slice(0, 200),
    externalUrl,
    externalLabelZh,
    externalLabelEn,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  await store.db.prepare('INSERT INTO partner_tutors(id,status,created_at,updated_at,body) VALUES(?,?,?,?,?)').run(id, record.status, now, now, JSON.stringify(record));
  return record;
}

export async function getPartnerTutor(store: Store, id: string): Promise<PartnerTutorRecord | null> {
  const row = (await store.db.prepare('SELECT body FROM partner_tutors WHERE id=?').get(id)) as any;
  return row ? (JSON.parse(row.body) as PartnerTutorRecord) : null;
}

export async function listPartnerTutors(store: Store, includeArchived = true): Promise<PartnerTutorRecord[]> {
  const rows = (await store.db.prepare('SELECT body FROM partner_tutors ORDER BY created_at DESC').all()) as any[];
  const all = rows.map(r => JSON.parse(r.body) as PartnerTutorRecord);
  return includeArchived ? all : all.filter(t => t.status === 'active');
}

export async function updatePartnerTutor(store: Store, id: string, input: any): Promise<PartnerTutorRecord> {
  const current = (await getPartnerTutor(store, id)) ?? reject('找不到合作導師', 404);
  const next: PartnerTutorRecord = {
    ...current,
    name: input?.name !== undefined ? String(input.name).trim().slice(0, 60) : current.name,
    headlineZh: input?.headlineZh !== undefined ? String(input.headlineZh).trim().slice(0, 160) : current.headlineZh,
    headlineEn: input?.headlineEn !== undefined ? String(input.headlineEn).trim().slice(0, 160) : current.headlineEn,
    bioZh: input?.bioZh !== undefined ? String(input.bioZh).trim().slice(0, 1200) : current.bioZh,
    bioEn: input?.bioEn !== undefined ? String(input.bioEn).trim().slice(0, 1200) : current.bioEn,
    credentials: input?.credentials !== undefined ? String(input.credentials).trim().slice(0, 200) : current.credentials,
    externalUrl: input?.externalUrl !== undefined ? validExternalUrl(input.externalUrl) : current.externalUrl,
    externalLabelZh: input?.externalLabelZh !== undefined ? String(input.externalLabelZh).trim().slice(0, 40) : current.externalLabelZh,
    externalLabelEn: input?.externalLabelEn !== undefined ? String(input.externalLabelEn).trim().slice(0, 40) : current.externalLabelEn,
    updatedAt: new Date().toISOString(),
  };
  if (!next.name || !next.headlineZh || !next.bioZh) reject('合作導師名稱、定位與背景不可為空');
  await store.db.prepare('UPDATE partner_tutors SET status=?, updated_at=?, body=? WHERE id=?').run(next.status, next.updatedAt, JSON.stringify(next), id);
  return next;
}

export async function archivePartnerTutor(store: Store, id: string): Promise<{ partnerTutor: PartnerTutorRecord; archivedPlaybooks: number }> {
  return store.transaction(async () => {
    const current = (await getPartnerTutor(store, id)) ?? reject('找不到合作導師', 404);
    const now = new Date().toISOString();
    const updated: PartnerTutorRecord = { ...current, status: 'archived', archivedAt: now, updatedAt: now };
    await store.db.prepare('UPDATE partner_tutors SET status=?, updated_at=?, body=? WHERE id=?').run('archived', now, JSON.stringify(updated), id);

    const rows = (await store.db.prepare("SELECT id, version, body FROM teaching_playbooks WHERE partner_tutor_id=? AND status='published'").all(id)) as any[];
    for (const row of rows) {
      const pb = JSON.parse(row.body) as TeachingPlaybookVersion;
      pb.status = 'archived';
      pb.archivedAt = now;
      pb.updatedAt = now;
      await store.db.prepare('UPDATE teaching_playbooks SET status=?, updated_at=?, body=? WHERE id=? AND version=?').run('archived', now, JSON.stringify(pb), pb.id, pb.version);
    }
    return { partnerTutor: updated, archivedPlaybooks: rows.length };
  });
}

// --- Teaching Playbook Versioning & Dual-Gate Lifecycle ---

export async function getPlaybookVersion(store: Store, id: string, version: number): Promise<TeachingPlaybookVersion | null> {
  const row = (await store.db.prepare('SELECT body FROM teaching_playbooks WHERE id=? AND version=?').get(id, version)) as any;
  return row ? (JSON.parse(row.body) as TeachingPlaybookVersion) : null;
}

export async function listPlaybooks(store: Store, filter?: { partnerTutorId?: string; topicId?: string; status?: PlaybookStatus }): Promise<TeachingPlaybookVersion[]> {
  const rows = (await store.db.prepare('SELECT body FROM teaching_playbooks ORDER BY id, version DESC').all()) as any[];
  return rows
    .map(r => JSON.parse(r.body) as TeachingPlaybookVersion)
    .filter(pb => (!filter?.partnerTutorId || pb.partnerTutorId === filter.partnerTutorId) && (!filter?.topicId || pb.topicId === filter.topicId) && (!filter?.status || pb.status === filter.status));
}

export async function createPlaybookDraft(store: Store, input: any): Promise<TeachingPlaybookVersion> {
  const partnerTutorId = String(input?.partnerTutorId ?? '').trim();
  const partner = (await getPartnerTutor(store, partnerTutorId)) ?? reject('找不到對應的合作導師', 404);
  if (partner.status !== 'active') reject('此合作導師已下架，不能建立新的教學方法包', 409, 'PARTNER_TUTOR_ARCHIVED');

  const topicId = String(input?.topicId ?? '').trim();
  const subjectId = String(input?.subjectId ?? topicId.split('-')[0] ?? '').trim();
  if (!/^[a-z0-9-]{2,60}$/.test(topicId) || !/^[a-z0-9-]{2,30}$/.test(subjectId)) reject('單元 ID 或學科 ID 無效');

  const titleZh = String(input?.titleZh ?? '').trim();
  const titleEn = String(input?.titleEn ?? titleZh).trim();
  const summaryZh = String(input?.summaryZh ?? '').trim();
  const summaryEn = String(input?.summaryEn ?? summaryZh).trim();
  if (!titleZh || titleZh.length > 100 || !summaryZh || summaryZh.length > 300) reject('請提供教學方法包標題（1–100 字）與簡介（1–300 字）');

  const slotsErr = validatePlaybookSlots(input?.slots);
  if (slotsErr) reject(slotsErr, 422, 'INVALID_PLAYBOOK_SLOTS');
  const slots = input.slots as PlaybookSlots;
  slots.style.modules = [...new Set(slots.style.modules.filter(m => ALL_TUTOR_MODULES.includes(m)))];

  const highlightsZh = cleanStringList(input?.highlightsZh, 4, 120);
  const highlightsEn = cleanStringList(input?.highlightsEn ?? highlightsZh, 4, 120);
  const manuscript = typeof input?.manuscript === 'string' ? input.manuscript.slice(0, 60000) : undefined;
  const complianceFindings = scanPlaybookCompliance(slots);

  return store.transaction(async () => {
    const id = typeof input?.id === 'string' && /^pb-[a-z0-9-]{2,48}$/.test(input.id) ? input.id : `pb-${partner.id.replace(/^pt-/, '')}-${topicId}`.slice(0, 50);
    const maxRow = (await store.db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM teaching_playbooks WHERE id=?').get(id)) as any;
    const version = Number(maxRow?.v ?? 0) + 1;
    const now = new Date().toISOString();
    const record: TeachingPlaybookVersion = {
      id,
      version,
      partnerTutorId,
      topicId,
      subjectId,
      titleZh,
      titleEn: titleEn.slice(0, 100),
      summaryZh,
      summaryEn: summaryEn.slice(0, 300),
      highlightsZh: highlightsZh.length ? highlightsZh : slots.decisionTree.mnemonics.slice(0, 3),
      highlightsEn: highlightsEn.length ? highlightsEn : slots.decisionTree.mnemonics.slice(0, 3),
      status: 'draft',
      slots,
      manuscript,
      complianceFindings,
      createdAt: now,
      updatedAt: now,
    };
    await store.db
      .prepare('INSERT INTO teaching_playbooks(id,version,partner_tutor_id,topic_id,subject_id,status,created_at,updated_at,body) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, version, partnerTutorId, topicId, subjectId, 'draft', now, now, JSON.stringify(record));
    return record;
  });
}

export async function updatePlaybookDraft(store: Store, id: string, version: number, input: any): Promise<TeachingPlaybookVersion> {
  const current = (await getPlaybookVersion(store, id, version)) ?? reject('找不到該教學方法包版本', 404);
  if (current.status !== 'draft') reject('已發布或已下架的方法包版本不可直接改寫，請建立新版本草稿', 409, 'IMMUTABLE_PLAYBOOK_VERSION');

  const slots = input?.slots ?? current.slots;
  const slotsErr = validatePlaybookSlots(slots);
  if (slotsErr) reject(slotsErr, 422, 'INVALID_PLAYBOOK_SLOTS');

  const now = new Date().toISOString();
  const next: TeachingPlaybookVersion = {
    ...current,
    titleZh: input?.titleZh !== undefined ? String(input.titleZh).trim().slice(0, 100) : current.titleZh,
    titleEn: input?.titleEn !== undefined ? String(input.titleEn).trim().slice(0, 100) : current.titleEn,
    summaryZh: input?.summaryZh !== undefined ? String(input.summaryZh).trim().slice(0, 300) : current.summaryZh,
    summaryEn: input?.summaryEn !== undefined ? String(input.summaryEn).trim().slice(0, 300) : current.summaryEn,
    highlightsZh: input?.highlightsZh !== undefined ? cleanStringList(input.highlightsZh, 4, 120) : current.highlightsZh,
    highlightsEn: input?.highlightsEn !== undefined ? cleanStringList(input.highlightsEn, 4, 120) : current.highlightsEn,
    manuscript: input?.manuscript !== undefined ? String(input.manuscript).slice(0, 60000) : current.manuscript,
    slots,
    complianceFindings: scanPlaybookCompliance(slots),
    // Editing a draft invalidates previous confirmations & sandbox sign-off to prevent bait-and-switch.
    tutorConfirmedAt: undefined,
    tutorConfirmedBy: undefined,
    tutorConfirmNote: undefined,
    sandboxPassedAt: undefined,
    sandboxRunId: undefined,
    reviewerApprovedAt: undefined,
    reviewerApprovedBy: undefined,
    updatedAt: now,
  };
  await store.db.prepare('UPDATE teaching_playbooks SET updated_at=?, body=? WHERE id=? AND version=?').run(now, JSON.stringify(next), id, version);
  return next;
}

export async function confirmPlaybookByTutor(
  store: Store,
  id: string,
  version: number,
  input: { confirmedBy?: string; note?: string }
): Promise<TeachingPlaybookVersion> {
  const current = (await getPlaybookVersion(store, id, version)) ?? reject('找不到該教學方法包版本', 404);
  if (current.status !== 'draft') reject('只有草稿狀態的方法包可以記錄導師確認', 409);
  const partner = (await getPartnerTutor(store, current.partnerTutorId)) ?? reject('找不到對應的合作導師', 404);
  const now = new Date().toISOString();
  const next: TeachingPlaybookVersion = {
    ...current,
    tutorConfirmedAt: now,
    tutorConfirmedBy: String(input.confirmedBy ?? partner.name).trim().slice(0, 80) || partner.name,
    tutorConfirmNote: input.note ? String(input.note).trim().slice(0, 500) : undefined,
    reviewerReturnNote: undefined,
    reviewerReturnedAt: undefined,
    reviewerReturnedBy: undefined,
    updatedAt: now,
  };
  await store.db.prepare('UPDATE teaching_playbooks SET updated_at=?, body=? WHERE id=? AND version=?').run(now, JSON.stringify(next), id, version);
  return next;
}

export async function recordSandboxRun(store: Store, run: PlaybookSandboxRun): Promise<TeachingPlaybookVersion> {
  return store.transaction(async () => {
    const current = (await getPlaybookVersion(store, run.playbookId, run.version)) ?? reject('找不到該教學方法包版本', 404);
    await store.db
      .prepare('INSERT INTO playbook_sandbox_runs(id,playbook_id,version,actor_id,passed,created_at,body) VALUES(?,?,?,?,?,?,?)')
      .run(run.id, run.playbookId, run.version, run.actorId, run.passed ? 1 : 0, run.createdAt, JSON.stringify(run));
    const now = new Date().toISOString();
    const next: TeachingPlaybookVersion = {
      ...current,
      sandboxPassedAt: run.passed ? run.createdAt : undefined,
      sandboxRunId: run.id,
      updatedAt: now,
    };
    await store.db.prepare('UPDATE teaching_playbooks SET updated_at=?, body=? WHERE id=? AND version=?').run(now, JSON.stringify(next), current.id, current.version);
    return next;
  });
}

export async function listSandboxRuns(store: Store, playbookId: string, version: number): Promise<PlaybookSandboxRun[]> {
  const rows = (await store.db.prepare('SELECT body FROM playbook_sandbox_runs WHERE playbook_id=? AND version=? ORDER BY created_at DESC LIMIT 10').all(playbookId, version)) as any[];
  return rows.map(r => JSON.parse(r.body) as PlaybookSandboxRun);
}

export async function publishPlaybookVersion(store: Store, id: string, version: number, reviewer: Identity): Promise<TeachingPlaybookVersion> {
  return store.transaction(async () => {
    const current = (await getPlaybookVersion(store, id, version)) ?? reject('找不到該教學方法包版本', 404);
    if (current.status !== 'draft') reject('只有草稿狀態的方法包可以發布', 409);
    const partner = (await getPartnerTutor(store, current.partnerTutorId)) ?? reject('找不到對應的合作導師', 404);
    if (partner.status !== 'active') reject('合作導師已下架，無法發布其教學方法包', 409, 'PARTNER_TUTOR_ARCHIVED');

    // Enforce dual-gate + sandbox + compliance blocker gate!
    const findings = scanPlaybookCompliance(current.slots);
    const blockers = findings.filter(f => f.severity === 'blocker');
    if (blockers.length) {
      reject(`方法包包含 ${blockers.length} 項違規紅線（${blockers.map(b => b.code).join(', ')}），請先修改草稿再發布`, 422, 'COMPLIANCE_BLOCKER');
    }
    if (!current.tutorConfirmedAt) {
      reject('發布前必須先完成「合作導師確認」門禁', 409, 'TUTOR_CONFIRMATION_REQUIRED');
    }
    if (!current.sandboxPassedAt) {
      reject('發布前必須先通過 3–5 道單元黃金檢驗題的沙盒試聊驗證', 409, 'SANDBOX_VERIFICATION_REQUIRED');
    }

    const now = new Date().toISOString();
    // Supersede any previously published version of the same playbookId for new chats, keeping immutable version readable for old chats.
    const older = (await store.db.prepare("SELECT version, body FROM teaching_playbooks WHERE id=? AND status='published' AND version<>?").all(id, version)) as any[];
    for (const row of older) {
      const oldPb = JSON.parse(row.body) as TeachingPlaybookVersion;
      oldPb.status = 'archived';
      oldPb.archivedAt = now;
      oldPb.updatedAt = now;
      await store.db.prepare('UPDATE teaching_playbooks SET status=?, updated_at=?, body=? WHERE id=? AND version=?').run('archived', now, JSON.stringify(oldPb), id, oldPb.version);
    }

    const published: TeachingPlaybookVersion = {
      ...current,
      complianceFindings: findings,
      status: 'published',
      reviewerApprovedAt: now,
      reviewerApprovedBy: reviewer.username,
      publishedAt: now,
      updatedAt: now,
    };
    await store.db.prepare('UPDATE teaching_playbooks SET status=?, updated_at=?, body=? WHERE id=? AND version=?').run('published', now, JSON.stringify(published), id, version);
    return published;
  });
}

export async function archivePlaybookVersion(store: Store, id: string, version: number): Promise<TeachingPlaybookVersion> {
  const current = (await getPlaybookVersion(store, id, version)) ?? reject('找不到該教學方法包版本', 404);
  const now = new Date().toISOString();
  const archived: TeachingPlaybookVersion = {
    ...current,
    status: 'archived',
    archivedAt: now,
    updatedAt: now,
  };
  await store.db.prepare('UPDATE teaching_playbooks SET status=?, updated_at=?, body=? WHERE id=? AND version=?').run('archived', now, JSON.stringify(archived), id, version);
  return archived;
}

// --- Public Tutor Discovery & Runtime Resolution ---

export async function listPublicTutors(store: Store, topicId?: string): Promise<PublicTutorOption[]> {
  const builtIns = topicId ? TUTORS.filter(t => tutorSupported(t.id, topicId)) : [...TUTORS];
  const rows = (await store.db.prepare("SELECT body FROM teaching_playbooks WHERE status='published' ORDER BY updated_at DESC").all()) as any[];
  const partnerCache = new Map<string, PartnerTutorRecord | null>();
  const partnerOptions: PublicTutorOption[] = [];

  for (const row of rows) {
    const pb = JSON.parse(row.body) as TeachingPlaybookVersion;
    if (topicId && pb.topicId !== topicId) continue;
    let partner = partnerCache.get(pb.partnerTutorId);
    if (partner === undefined) {
      partner = await getPartnerTutor(store, pb.partnerTutorId);
      partnerCache.set(pb.partnerTutorId, partner);
    }
    if (!partner || partner.status !== 'active') continue;
    const { createdAt: _c, updatedAt: _u, archivedAt: _a, ...publicPartner } = partner;
    partnerOptions.push({
      id: pb.id,
      version: String(pb.version),
      kind: 'partner',
      name: `${partner.name} · ${pb.titleZh}`,
      zh: pb.summaryZh,
      en: pb.summaryEn,
      delivery: pb.slots.style.delivery,
      supportedTopicIds: [pb.topicId],
      highlightsZh: pb.highlightsZh,
      highlightsEn: pb.highlightsEn,
      disclaimerZh: PARTNER_DISCLAIMER_ZH,
      disclaimerEn: PARTNER_DISCLAIMER_EN,
      partnerTutor: publicPartner,
    });
  }

  return [...builtIns, ...partnerOptions];
}

export async function resolveTutorForNewChat(
  store: Store,
  inputTutorId: unknown,
  topicId: string,
  userId: string
): Promise<TutorBinding> {
  const id = String(inputTutorId ?? 'david').trim();
  if (isBuiltInTutor(id)) {
    if (!tutorSupported(id, topicId)) reject('此導師尚未提供這個主題，請選擇其他導師', 422, 'TUTOR_NOT_AVAILABLE');
    return { id, version: '1' };
  }

  const row = (await store.db
    .prepare("SELECT body FROM teaching_playbooks WHERE id=? AND status='published' ORDER BY version DESC LIMIT 1")
    .get(id)) as any;
  if (!row) reject('此導師方法尚未開放或已下架，請選擇其他導師', 422, 'TUTOR_NOT_AVAILABLE');
  const pb = JSON.parse(row.body) as TeachingPlaybookVersion;
  if (pb.topicId !== topicId) reject('此合作導師方法僅涵蓋指定單元，請選擇其他導師', 422, 'TUTOR_NOT_AVAILABLE');

  const partner = await getPartnerTutor(store, pb.partnerTutorId);
  if (!partner || partner.status !== 'active') reject('此合作導師方法已下架，請選擇其他導師', 422, 'TUTOR_NOT_AVAILABLE');

  const consent = await getUserConsent(store, userId);
  if (consent.needsAcceptance) {
    reject('使用合作導師教學方法前，請先同意最新版本的使用者協議與私隱聲明', 403, 'TERMS_ACCEPTANCE_REQUIRED');
  }

  return {
    id: pb.id,
    version: String(pb.version),
    kind: 'partner',
    partnerTutorId: partner.id,
    partnerTutorName: partner.name,
    playbookTitle: pb.titleZh,
    shareTranscriptAllowed: consent.sharePartnerChats,
  };
}

export async function resolvePlaybookRuntime(store: Store, tutor?: TutorBinding): Promise<PlaybookRuntime | null> {
  if (!tutor || tutor.kind !== 'partner') return null;
  const versionNum = Number(tutor.version);
  if (!Number.isInteger(versionNum) || versionNum < 1) return null;
  const pb = await getPlaybookVersion(store, tutor.id, versionNum);
  if (!pb) return null;
  const partner = await getPartnerTutor(store, pb.partnerTutorId);
  if (!partner) return null;
  // Soft takedown check: an explicitly archived partner tutor OR an explicitly archived playbook (when no newer active version exists, OR if this exact version was archived via takedown).
  // Note: When v2 supersedes v1 normally, v1 stays readable AND existing v1 chats may finish gracefully if partner is still active AND a newer published version exists;
  // if partner is archived OR ALL versions of this playbook are archived (takedown), block new messages immediately!
  const hasAnyPublished = Boolean(
    await store.db.prepare("SELECT 1 FROM teaching_playbooks WHERE id=? AND status='published' LIMIT 1").get(pb.id)
  );
  const archived = partner.status !== 'active' || (pb.status === 'archived' && !hasAnyPublished);
  return { playbook: pb, partnerTutor: partner, archived };
}

// --- Attribution Events & Analytics (4-6 Week Go/No-Go Gate) ---

export async function recordPlaybookEvent(
  store: Store,
  event: {
    playbookId: string;
    version: string;
    partnerTutorId: string;
    topicId: string;
    kind: PlaybookEventKind;
    meta?: Record<string, unknown>;
  }
): Promise<void> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await store.db
    .prepare('INSERT INTO playbook_events(id,playbook_id,version,partner_tutor_id,topic_id,kind,created_at,body) VALUES(?,?,?,?,?,?,?,?)')
    .run(id, event.playbookId, event.version, event.partnerTutorId, event.topicId, event.kind, now, JSON.stringify(event.meta ?? {}));
}

export async function getPlaybookAnalytics(store: Store, playbookId: string): Promise<PlaybookAnalyticsView> {
  const latestRow = (await store.db
    .prepare('SELECT body FROM teaching_playbooks WHERE id=? ORDER BY version DESC LIMIT 1')
    .get(playbookId)) as any;
  if (!latestRow) reject('找不到教學方法包', 404);
  const pb = JSON.parse(latestRow.body) as TeachingPlaybookVersion;

  const eventRows = (await store.db.prepare('SELECT kind, body FROM playbook_events WHERE playbook_id=?').all(playbookId)) as any[];
  let chatStarts = 0;
  let chatTurns = 0;
  let helpfulCount = 0;
  let notHelpfulCount = 0;
  let linkClicks = 0;
  for (const row of eventRows) {
    if (row.kind === 'chat_start') chatStarts++;
    else if (row.kind === 'chat_turn') chatTurns++;
    else if (row.kind === 'helpful') helpfulCount++;
    else if (row.kind === 'not_helpful') notHelpfulCount++;
    else if (row.kind === 'link_click') linkClicks++;
  }

  // Compute aggregate topic adoption & multi-turn chat counts across student records without exposing any student identity.
  const studentRows = (await store.db.prepare('SELECT body FROM students').all()) as any[];
  let topicTotalChatStarts = 0;
  let playbookChatsSeen = 0;
  let multiTurnChats = 0;
  for (const row of studentRows) {
    const state = JSON.parse(row.body) as StudentState;
    for (const chat of state.chats ?? []) {
      if (chat.topicId === pb.topicId) topicTotalChatStarts++;
      if (chat.tutor?.kind === 'partner' && chat.tutor.id === playbookId) {
        playbookChatsSeen++;
        const userTurns = chat.messages.filter(m => m.role === 'user').length;
        if (userTurns >= 2) multiTurnChats++;
      }
    }
  }

  const effectiveStarts = Math.max(chatStarts, playbookChatsSeen);
  const adoptionShare = topicTotalChatStarts > 0 ? Number((effectiveStarts / topicTotalChatStarts).toFixed(4)) : null;
  const multiTurnRate = playbookChatsSeen > 0 ? Number((multiTurnChats / playbookChatsSeen).toFixed(4)) : null;
  const totalFeedback = helpfulCount + notHelpfulCount;
  const helpfulRate = totalFeedback > 0 ? Number((helpfulCount / totalFeedback).toFixed(4)) : null;

  return {
    playbookId: pb.id,
    partnerTutorId: pb.partnerTutorId,
    topicId: pb.topicId,
    chatStarts: effectiveStarts,
    topicTotalChatStarts,
    adoptionShare,
    chatTurns,
    multiTurnChats,
    multiTurnRate,
    helpfulCount,
    notHelpfulCount,
    helpfulRate,
    linkClicks,
    goNoGoChecks: {
      adoptionTargetMet: adoptionShare !== null && adoptionShare >= 0.3,
      multiTurnObserved: multiTurnChats > 0,
      helpfulObserved: totalFeedback > 0,
    },
  };
}

// --- Strict De-Identified Review Pack Export (Plain Text Only, Zero Attachments, Ephemeral Per-Chat IDs) ---

export function redactStudentText(text: string, knownIdentityTokens: string[] = []): string {
  let out = text;
  // 1. Replace known identity strings (student name, username, email) first, longest first.
  const tokens = [...new Set(knownIdentityTokens.map(t => t.trim()).filter(t => t.length >= 2))].sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), '[已隱去個人資料]');
  }
  // 2. Emails
  out = out.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[已隱去電郵]');
  // 3. HKID-like patterns
  out = out.replace(/\b[A-Z]{1,2}\d{6}\(?[0-9A]\)?\b/g, '[已隱去證件號]');
  // 4. Phone numbers (8+ digits or +852 ...)
  out = out.replace(/(?:\+852[\s-]?)?\b\d{4}[\s-]?\d{4}\b|\+\d{1,3}[\s-]?\d{6,12}/g, '[已隱去電話]');
  // 5. Social handles
  out = out.replace(/(?:whatsapp|wechat|ig|instagram|telegram|微信)\s*[:：]?\s*[@a-z0-9_.-]{3,30}/gi, '[已隱去聯絡帳號]');
  // 6. Common HK school names (Chinese & English)
  out = out.replace(/[\u4e00-\u9fff]{2,12}(?:官立中學|紀念中學|書院|中學|女子中學|男書院)/g, '[已隱去學校]');
  out = out.replace(/\b[A-Z][A-Za-z'.-]*(?:\s+[A-Z][A-Za-z'.-]*){0,4}\s+(?:College|Secondary School|High School|School)\b/g, '[REDACTED_SCHOOL]');
  // 7. Self-reported student name introductions
  out = out.replace(/(?:我叫|我係|我是|my name is)\s*([^\s，。,.!?！？]{1,12})/gi, match =>
    /name/i.test(match) ? 'my name is [REDACTED]' : '我叫[已隱去姓名]'
  );
  return out;
}

export async function exportPartnerReviewPack(
  store: Store,
  actor: Identity,
  input: { partnerTutorId: string; playbookId?: string; maxChats?: number }
): Promise<PartnerReviewExportPack> {
  const partner = (await getPartnerTutor(store, input.partnerTutorId)) ?? reject('找不到合作導師', 404);
  const maxChats = Math.max(1, Math.min(200, Number(input.maxChats ?? 50)));

  const playbooks = await listPlaybooks(store, { partnerTutorId: partner.id });
  const uniquePlaybookIds = [...new Set(playbooks.map(p => p.id))].filter(id => !input.playbookId || id === input.playbookId);
  if (input.playbookId && !uniquePlaybookIds.length) reject('此教學方法包不屬於指定合作導師', 404);

  const analytics = await Promise.all(uniquePlaybookIds.map(id => getPlaybookAnalytics(store, id)));

  const userRows = (await store.db.prepare('SELECT id, username, name FROM users').all()) as any[];
  const userMap = new Map(userRows.map(u => [u.id as string, { username: String(u.username), name: String(u.name) }]));
  const studentRows = (await store.db.prepare('SELECT user_id, body FROM students').all()) as any[];

  const samples: DeidentifiedChatSample[] = [];
  let excludedOptOutCount = 0;

  for (const row of studentRows) {
    const userId = String(row.user_id);
    const state = JSON.parse(row.body) as StudentState;
    const userInfo = userMap.get(userId);
    const boundEmail = await getUserBoundEmail(store, userId);
    const identityTokens = [state.profile.name, userInfo?.name ?? '', userInfo?.username ?? '', boundEmail ?? ''].filter(Boolean);

    for (const chat of state.chats ?? []) {
      if (chat.tutor?.kind !== 'partner' || chat.tutor.partnerTutorId !== partner.id) continue;
      if (input.playbookId && chat.tutor.id !== input.playbookId) continue;

      if (chat.tutor.shareTranscriptAllowed !== true) {
        excludedOptOutCount++;
        continue;
      }

      if (samples.length >= maxChats) continue;

      let attachmentsStripped = 0;
      const messages: { role: 'user' | 'assistant'; content: string }[] = [];
      for (const m of chat.messages) {
        if (m.status !== 'complete' || !m.content.trim()) continue;
        if (m.attachmentIds?.length) attachmentsStripped += m.attachmentIds.length;
        messages.push({
          role: m.role,
          content: m.role === 'user' ? redactStudentText(m.content, identityTokens) : redactStudentText(m.content, identityTokens),
        });
      }
      if (!messages.length) continue;

      // Fresh random session ID per chat — NEVER derived from userId!
      samples.push({
        anonymousSessionId: 'Session-' + randomBytes(4).toString('hex').toUpperCase(),
        playbookId: chat.tutor.id,
        playbookVersion: chat.tutor.version,
        topicId: chat.topicId,
        mode: chat.mode,
        teachingLanguage: chat.teachingLanguage,
        createdDate: chat.createdAt.slice(0, 10),
        turnCount: messages.filter(m => m.role === 'user').length,
        attachmentsStripped,
        messages,
      });
    }
  }

  // Shuffle sample ordering so even export sequence cannot correlate consecutive chats of one user.
  for (let i = samples.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [samples[i], samples[j]] = [samples[j], samples[i]];
  }

  const exportId = randomUUID();
  const exportedAt = new Date().toISOString();
  const auditSummary = {
    partnerTutorName: partner.name,
    playbookIds: uniquePlaybookIds,
    includedChatCount: samples.length,
    excludedOptOutCount,
    actorUsername: actor.username,
  };
  await store.db
    .prepare('INSERT INTO tutor_export_audit(id,partner_tutor_id,playbook_id,actor_id,chat_count,created_at,body) VALUES(?,?,?,?,?,?,?)')
    .run(exportId, partner.id, input.playbookId ?? null, actor.id, samples.length, exportedAt, JSON.stringify(auditSummary));

  return {
    exportId,
    exportedAt,
    partnerTutorId: partner.id,
    partnerTutorName: partner.name,
    playbookId: input.playbookId ?? null,
    privacyGuarantees: [
      '僅包含學生同意協議且未關閉「允許去名化對話供合作導師優化方法」的合作導師對話。',
      '已徹底剔除所有學生圖片與檔案附件、成績、目標院校及帳號識別資訊。',
      '每段對話分配獨立隨機匿名編號並隨機打亂順序，不可跨對話追蹤同一學生。',
    ],
    analytics,
    includedChatCount: samples.length,
    excludedOptOutCount,
    samples,
  };
}

export async function listExportAudit(store: Store, partnerTutorId?: string) {
  const rows = partnerTutorId
    ? ((await store.db.prepare('SELECT * FROM tutor_export_audit WHERE partner_tutor_id=? ORDER BY created_at DESC LIMIT 50').all(partnerTutorId)) as any[])
    : ((await store.db.prepare('SELECT * FROM tutor_export_audit ORDER BY created_at DESC LIMIT 50').all()) as any[]);
  return rows.map(r => ({
    id: r.id,
    partnerTutorId: r.partner_tutor_id,
    playbookId: r.playbook_id,
    actorId: r.actor_id,
    chatCount: Number(r.chat_count),
    createdAt: r.created_at,
    summary: JSON.parse(r.body),
  }));
}

// --- Partner Tutor Accounts (role `partner`) & Tutor-Side Lifecycle ---

export async function createPartnerAccount(
  store: Store,
  partnerTutorId: string,
  input: { username?: unknown; password?: unknown; name?: unknown }
): Promise<{ partnerTutorId: string; username: string }> {
  const partner = (await getPartnerTutor(store, partnerTutorId)) ?? reject('找不到合作導師', 404);
  if (partner.status !== 'active') reject('此合作導師已下架，不能再開設登入帳戶', 409, 'PARTNER_TUTOR_ARCHIVED');
  const username = String(input.username ?? '').trim().toLowerCase();
  const password = typeof input.password === 'string' ? input.password : '';
  if (!/^[a-z0-9_.-]{2,40}$/.test(username) || password.length < 10 || password.length > 200) {
    reject('帳戶需 2–40 個英數字元；密碼至少 10 字元');
  }
  if (await store.db.prepare('SELECT 1 FROM partner_accounts WHERE partner_tutor_id=?').get(partner.id)) {
    reject('此合作導師已有登入帳戶', 409, 'PARTNER_ACCOUNT_EXISTS');
  }
  if (await store.db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) {
    reject('此帳戶名稱已被使用', 409, 'USERNAME_TAKEN');
  }
  const name = String(input.name ?? partner.name).trim().slice(0, 30) || partner.name.slice(0, 30);
  const user = await store.createUser(username, password, name, 'partner');
  await store.db.prepare('INSERT INTO partner_accounts(user_id,partner_tutor_id,created_at) VALUES(?,?,?)').run(user.id, partner.id, new Date().toISOString());
  return { partnerTutorId: partner.id, username: user.username };
}

export async function partnerAccountUsernames(store: Store): Promise<Record<string, string>> {
  const rows = (await store.db.prepare('SELECT a.partner_tutor_id, u.username FROM partner_accounts a JOIN users u ON u.id=a.user_id').all()) as any[];
  return Object.fromEntries(rows.map(r => [String(r.partner_tutor_id), String(r.username)]));
}

export async function getPartnerTutorForUser(store: Store, userId: string): Promise<PartnerTutorRecord | null> {
  const row = (await store.db.prepare('SELECT partner_tutor_id FROM partner_accounts WHERE user_id=?').get(userId)) as any;
  return row ? getPartnerTutor(store, String(row.partner_tutor_id)) : null;
}

/** Tutor pulls a submitted draft back (before publication) so it can be edited again. */
export async function withdrawTutorConfirmation(store: Store, id: string, version: number): Promise<TeachingPlaybookVersion> {
  const current = (await getPlaybookVersion(store, id, version)) ?? reject('找不到該教學方法包版本', 404);
  if (current.status !== 'draft') reject('只有尚未發布的草稿可以撤回提交', 409);
  if (!current.tutorConfirmedAt) reject('此草稿尚未提交審核', 409);
  const now = new Date().toISOString();
  const next: TeachingPlaybookVersion = { ...current, tutorConfirmedAt: undefined, tutorConfirmedBy: undefined, tutorConfirmNote: undefined, updatedAt: now };
  await store.db.prepare('UPDATE teaching_playbooks SET updated_at=?, body=? WHERE id=? AND version=?').run(now, JSON.stringify(next), id, version);
  return next;
}

/** Reviewer returns a submitted draft to the Partner Tutor with a required note; the tutor gate must be passed again. */
export async function returnPlaybookToTutor(store: Store, id: string, version: number, reviewer: Identity, note: unknown): Promise<TeachingPlaybookVersion> {
  const current = (await getPlaybookVersion(store, id, version)) ?? reject('找不到該教學方法包版本', 404);
  if (current.status !== 'draft') reject('只有尚未發布的草稿可以退回修改', 409);
  const text = String(note ?? '').trim();
  if (text.length < 4 || text.length > 1000) reject('請寫下 4–1000 字的退回原因，方便合作導師修改');
  const now = new Date().toISOString();
  const next: TeachingPlaybookVersion = {
    ...current,
    tutorConfirmedAt: undefined,
    tutorConfirmedBy: undefined,
    tutorConfirmNote: undefined,
    reviewerReturnNote: text,
    reviewerReturnedAt: now,
    reviewerReturnedBy: reviewer.username,
    updatedAt: now,
  };
  await store.db.prepare('UPDATE teaching_playbooks SET updated_at=?, body=? WHERE id=? AND version=?').run(now, JSON.stringify(next), id, version);
  return next;
}

/** Start a new editable draft version from any existing version (published versions stay immutable). */
export async function forkPlaybookVersion(store: Store, id: string, version: number): Promise<TeachingPlaybookVersion> {
  const source = (await getPlaybookVersion(store, id, version)) ?? reject('找不到該教學方法包版本', 404);
  const latest = (await store.db.prepare("SELECT version FROM teaching_playbooks WHERE id=? AND status='draft'").get(id)) as any;
  if (latest) reject(`已有未發布的草稿 v${latest.version}，請先完成或在該草稿上修改`, 409, 'DRAFT_EXISTS');
  return createPlaybookDraft(store, {
    id: source.id,
    partnerTutorId: source.partnerTutorId,
    topicId: source.topicId,
    subjectId: source.subjectId,
    titleZh: source.titleZh,
    titleEn: source.titleEn,
    summaryZh: source.summaryZh,
    summaryEn: source.summaryEn,
    highlightsZh: source.highlightsZh,
    highlightsEn: source.highlightsEn,
    slots: structuredClone(source.slots),
    manuscript: source.manuscript,
  });
}
