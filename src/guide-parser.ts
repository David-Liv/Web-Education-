import { hasPlanFeature, PLAN_RANK } from './billing-types.ts';
import type { PlanFeature, PlanId } from './billing-types.ts';

export type GuideGroupId = 'free' | 'plus' | 'pro' | 'account';
export type GuidePreviewPlan = 'actual' | PlanId;

export interface GuideSectionMeta {
  id: string;
  group: GuideGroupId;
  plan: PlanId;
  feature?: PlanFeature;
  teaser?: string;
}

export interface GuideSlide {
  title: string;
  alt: string;
  src: string;
  body: string;
}

export interface GuideSection {
  id: string;
  title: string;
  rawBody: string;
  meta: GuideSectionMeta;
  lead: string;
  slides: GuideSlide[];
  after: string;
}

export interface ParsedGuide {
  title: string;
  intro: string;
  sections: GuideSection[];
  hasGroups: boolean;
}

const VALID_GROUPS = new Set<GuideGroupId>(['free', 'plus', 'pro', 'account']);
const VALID_PLANS = new Set<PlanId>(['Free', 'Plus', 'Pro']);
const VALID_FEATURES = new Set<PlanFeature>([
  'maths-index',
  'ai-quizzes',
  'ai-plan',
  'calendar-advanced',
  'weak-spot-report',
  'boosted-forum',
  'hybrid-quizzes',
  'realtime-progress',
]);

export const GUIDE_GROUP_ORDER: GuideGroupId[] = ['free', 'plus', 'pro', 'account'];

export const GUIDE_GROUP_LABELS: Record<GuideGroupId, { zh: string; en: string }> = {
  free: { zh: '基礎功能', en: 'Core features' },
  plus: { zh: 'Plus 進階', en: 'Plus features' },
  pro: { zh: 'Pro 專屬', en: 'Pro exclusives' },
  account: { zh: '帳戶與紀錄', en: 'Account & updates' },
};

const META_RE = /^\s*<!--\s*guide:\s*(\{[\s\S]*?\})\s*-->\s*/;
const IMAGE_LINE_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;

function parseMeta(raw: string, index: number): { meta: GuideSectionMeta; body: string; explicit: boolean } {
  const fallback: GuideSectionMeta = { id: `guide-${index + 1}`, group: 'free', plan: 'Free' };
  const match = raw.match(META_RE);
  if (!match) return { meta: fallback, body: raw, explicit: false };
  const body = raw.slice(match[0].length);
  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>;
    const id = typeof parsed.id === 'string' && /^[a-z0-9-]+$/.test(parsed.id) ? parsed.id : fallback.id;
    const group = typeof parsed.group === 'string' && VALID_GROUPS.has(parsed.group as GuideGroupId)
      ? (parsed.group as GuideGroupId)
      : 'free';
    const plan = typeof parsed.plan === 'string' && VALID_PLANS.has(parsed.plan as PlanId)
      ? (parsed.plan as PlanId)
      : group === 'plus' ? 'Plus' : group === 'pro' ? 'Pro' : 'Free';
    const feature = typeof parsed.feature === 'string' && VALID_FEATURES.has(parsed.feature as PlanFeature)
      ? (parsed.feature as PlanFeature)
      : undefined;
    const teaser = typeof parsed.teaser === 'string' && parsed.teaser.trim() ? parsed.teaser.trim() : undefined;
    return { meta: { id, group, plan, feature, teaser }, body, explicit: true };
  } catch {
    return { meta: fallback, body, explicit: false };
  }
}

function splitSlides(body: string): { lead: string; slides: GuideSlide[]; after: string } {
  const chunks = body.trim().split(/^### /m);
  if (chunks.length <= 1) return { lead: body.trim(), slides: [], after: '' };
  const lead = chunks[0].trim();
  const slides: GuideSlide[] = [];
  const trailing: string[] = [];

  for (const chunk of chunks.slice(1)) {
    const newline = chunk.indexOf('\n');
    const heading = (newline < 0 ? chunk : chunk.slice(0, newline)).trim();
    const rest = (newline < 0 ? '' : chunk.slice(newline + 1)).trim();
    const lines = rest.split(/\r?\n/);
    const imgIndex = lines.findIndex(line => IMAGE_LINE_RE.test(line.trim()));

    if (imgIndex >= 0) {
      const imgMatch = lines[imgIndex].trim().match(IMAGE_LINE_RE)!;
      const src = imgMatch[2].trim();
      const safeSrc = src.startsWith('/') && !src.startsWith('//') ? src : '';
      if (safeSrc) {
        const slideBody = [...lines.slice(0, imgIndex), ...lines.slice(imgIndex + 1)].join('\n').trim();
        slides.push({ title: heading, alt: imgMatch[1].trim(), src: safeSrc, body: slideBody });
        continue;
      }
    }
    trailing.push(`### ${heading}\n\n${rest}`.trim());
  }

  return { lead, slides, after: trailing.join('\n\n').trim() };
}

export function parseGuideMarkdown(markdown: string): ParsedGuide {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const [rawIntro, ...parts] = normalized.split(/^## /m);
  const titleMatch = rawIntro.match(/^# (.+)\n?/);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const intro = rawIntro.replace(/^# .*\n?/, '').trim();
  let hasGroups = false;

  const sections: GuideSection[] = parts.map((part, index) => {
    const end = part.indexOf('\n');
    const sectionTitle = (end < 0 ? part : part.slice(0, end)).trim();
    const rest = end < 0 ? '' : part.slice(end + 1);
    const { meta, body, explicit } = parseMeta(rest, index);
    if (explicit) hasGroups = true;
    const { lead, slides, after } = splitSlides(body);
    return {
      id: meta.id,
      title: sectionTitle,
      rawBody: body.trim(),
      meta,
      lead,
      slides,
      after,
    };
  });

  return { title, intro, sections, hasGroups };
}

export function resolveEffectiveGuidePlan(options: {
  realMode: boolean;
  plan?: PlanId;
  role?: string;
  previewPlan?: GuidePreviewPlan;
}): { effectivePlan: PlanId; bypassAll: boolean; isPreview: boolean } {
  const isStaff = options.role === 'developer' || options.role === 'reviewer';
  if (isStaff && options.previewPlan && options.previewPlan !== 'actual') {
    return { effectivePlan: options.previewPlan, bypassAll: false, isPreview: true };
  }
  if (!options.realMode || isStaff) {
    return { effectivePlan: 'Pro', bypassAll: true, isPreview: false };
  }
  return { effectivePlan: options.plan ?? 'Free', bypassAll: false, isPreview: false };
}

export function isGuideSectionUnlocked(
  section: GuideSection,
  access: { effectivePlan: PlanId; bypassAll: boolean }
): boolean {
  if (access.bypassAll) return true;
  if (section.meta.plan === 'Free' && !section.meta.feature) return true;
  if (section.meta.feature) {
    return hasPlanFeature(access.effectivePlan, section.meta.feature);
  }
  return PLAN_RANK[access.effectivePlan] >= PLAN_RANK[section.meta.plan];
}

export function buildFilteredGuideMarkdown(
  parsed: ParsedGuide,
  unlockedIds: Set<string>
): string {
  const lines: string[] = [];
  if (parsed.title) lines.push(`# ${parsed.title}`, '');
  if (parsed.intro) lines.push(parsed.intro, '');
  for (const section of parsed.sections) {
    if (!unlockedIds.has(section.id)) continue;
    lines.push(`## ${section.title}`, '', section.rawBody, '');
  }
  return `${lines.join('\n').trim()}\n`;
}

const CIRCLED_NUMS = '①②③④⑤⑥⑦⑧⑨⑩';

export function extractCircledMarker(text: string): { num: number; rest: string } | null {
  const match = text.match(/^(?:\*\*)?([①②③④⑤⑥⑦⑧⑨⑩])(?:\*\*)?\s*(.+)$/);
  if (!match) return null;
  const num = CIRCLED_NUMS.indexOf(match[1]) + 1;
  return num > 0 ? { num, rest: match[2] } : null;
}
