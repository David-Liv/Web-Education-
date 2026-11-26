import type { Store } from './store.ts';
import type { Identity } from '../src/pilot-types.ts';
import { reject } from './learning.ts';
import {
  archivePlaybookVersion,
  confirmPlaybookByTutor,
  createPlaybookDraft,
  exportPartnerReviewPack,
  forkPlaybookVersion,
  getPartnerTutorForUser,
  getPlaybookAnalytics,
  getPlaybookVersion,
  listExportAudit,
  listPlaybooks,
  listSandboxRuns,
  scanPlaybookCompliance,
  updatePlaybookDraft,
  withdrawTutorConfirmation,
} from './playbooks.ts';
import type { PartnerTutorRecord, TeachingPlaybookVersion } from './playbooks.ts';
import {
  compileManuscriptToPlaybook,
  defaultGoldenProbes,
  multimodalModelAdapter,
  runPlaybookSandbox,
  transcribeToManuscript,
} from './playbook-compiler.ts';
import type { SandboxProbeInput } from './playbook-compiler.ts';
import { catalog } from '../src/data/catalog.ts';
import { units } from './studio-state.ts';
import { topicTitleFor } from './playbook-routes.ts';
import { getActiveSttConfig } from './stt-service.ts';
import { sttTranscriptionAdapter } from './playbook-compiler.ts';

// Seed-phase guard against runaway model spend from Partner Tutor accounts. In-memory on purpose:
// it resets on restart and only needs to stop accidental loops, not act as billing.
const DAILY_MODEL_CALLS = 60;
const modelCalls = new Map<string, { day: string; count: number }>();

function spendModelCall(userId: string): void {
  const day = new Date().toISOString().slice(0, 10);
  const current = modelCalls.get(userId);
  const count = current?.day === day ? current.count : 0;
  if (count >= DAILY_MODEL_CALLS) reject(`今日 AI 處理次數已達上限（${DAILY_MODEL_CALLS} 次），請明天再試或聯絡平台`, 429, 'PARTNER_DAILY_LIMIT');
  modelCalls.set(userId, { day, count: count + 1 });
}

function remainingModelCalls(userId: string): number {
  const current = modelCalls.get(userId);
  const used = current?.day === new Date().toISOString().slice(0, 10) ? current.count : 0;
  return Math.max(0, DAILY_MODEL_CALLS - used);
}

export function partnerTopicCatalog() {
  const readySubjects = catalog.subjects.filter(s => s.ready);
  const topics = catalog.topics
    .filter(t => readySubjects.some(s => s.id === t.subjectId))
    .map(t => ({ id: t.id, subjectId: t.subjectId, name: t.name, en: t.en, module: t.module }));
  for (const u of units) {
    if (!topics.some(t => t.id === u.topicId)) topics.push({ id: u.topicId, subjectId: u.subjectId, name: u.title, en: u.title, module: '自主輔導' });
  }
  return {
    subjects: readySubjects.map(s => ({ id: s.id, name: s.name, en: s.en, color: s.color, icon: s.icon })),
    topics,
  };
}

/** Partner Tutors see their own drafts in full, but never internal staff account names. */
function ownView(pb: TeachingPlaybookVersion) {
  const { reviewerApprovedBy: _approvedBy, reviewerReturnedBy: _returnedBy, ...rest } = pb;
  return rest;
}

export async function handlePartnerRoutes(
  store: Store,
  identity: Identity,
  path: string,
  method: string,
  input: any,
  send: (data: unknown, status?: number) => void,
  signal: AbortSignal
): Promise<boolean> {
  if (path !== '/partner' && !path.startsWith('/partner/')) return false;
  if (identity.role !== 'partner') reject('此功能僅供合作導師帳戶使用', 403, 'FORBIDDEN');
  const partner: PartnerTutorRecord = (await getPartnerTutorForUser(store, identity.id)) ?? reject('此帳戶尚未連結合作導師資料，請聯絡平台', 403, 'PARTNER_NOT_LINKED');
  const writable = () => {
    if (partner.status !== 'active') reject('你的合作導師資料已下架，目前只可查看紀錄', 409, 'PARTNER_TUTOR_ARCHIVED');
  };
  const ownVersion = async (id: string, version: number) => {
    const pb = (await getPlaybookVersion(store, id, version)) ?? reject('找不到該教學方法包版本', 404);
    if (pb.partnerTutorId !== partner.id) reject('找不到該教學方法包版本', 404);
    return pb;
  };
  const ownPlaybookId = async (id: string) => {
    const list = await listPlaybooks(store, { partnerTutorId: partner.id });
    if (!list.some(p => p.id === id)) reject('找不到該教學方法包', 404);
  };

  if (path === '/partner/workspace' && method === 'GET') {
    const [model, stt] = await Promise.all([store.model(), getActiveSttConfig(store)]);
    send({
      partnerTutor: partner,
      playbooks: (await listPlaybooks(store, { partnerTutorId: partner.id })).map(ownView),
      catalog: partnerTopicCatalog(),
      modelReady: Boolean(model?.enabled && model.model),
      sttReady: Boolean(stt),
      sttModel: stt?.model ?? null,
      remainingModelCalls: remainingModelCalls(identity.id),
      dailyModelCalls: DAILY_MODEL_CALLS,
    });
    return true;
  }

  if (path === '/partner/transcribe' && method === 'POST') {
    writable();
    const topicId = String(input?.topicId ?? '').trim();
    if (!partnerTopicCatalog().topics.some(t => t.id === topicId)) reject('請先選擇有效的單元');
    const hasAudio = Boolean(input?.audioBase64);
    const hasImages = Boolean(input?.boardImages?.length);
    const hasMedia = hasAudio || hasImages;
    const [config, stt] = hasMedia ? await Promise.all([store.model(), getActiveSttConfig(store)]) : [null, null];
    if (hasMedia) spendModelCall(identity.id);
    const adapter = hasAudio && stt
      ? sttTranscriptionAdapter(stt, config)
      : config?.enabled && config.model
        ? multimodalModelAdapter(config)
        : null;
    const languageHint = input?.languageHint === 'en' ? 'en' : input?.languageHint === 'auto' ? 'auto' : 'zh-HK';
    const draft = await transcribeToManuscript(
      {
        topicId,
        topicTitle: topicTitleFor(topicId),
        audioBase64: input?.audioBase64,
        audioFormat: input?.audioFormat,
        boardImages: input?.boardImages,
        textNotes: input?.textNotes,
        languageHint,
      },
      adapter,
      signal
    );
    send(draft);
    return true;
  }

  if (path === '/partner/compile' && method === 'POST') {
    writable();
    const topicId = String(input?.topicId ?? '').trim();
    const topic = partnerTopicCatalog().topics.find(t => t.id === topicId) ?? reject('請先選擇有效的單元');
    const existingDraft = (await listPlaybooks(store, { partnerTutorId: partner.id, topicId })).find(p => p.status === 'draft');
    if (existingDraft) reject(`此單元已有未發布的草稿 v${existingDraft.version}，請直接修改該草稿，或先撤回後再重新編譯`, 409, 'DRAFT_EXISTS');
    const config = (await store.model()) ?? reject('平台尚未配置 AI 模型，暫時未能編譯教學方法包', 503, 'MODEL_NOT_CONFIGURED');
    spendModelCall(identity.id);
    const manuscript = String(input?.manuscriptMarkdown ?? '');
    const compiled = await compileManuscriptToPlaybook(
      config,
      { topicId, topicTitle: topic.name, partnerTutorName: partner.name, manuscriptMarkdown: manuscript, deliveryHint: input?.deliveryHint },
      signal
    );
    const draft = await createPlaybookDraft(store, { partnerTutorId: partner.id, topicId, subjectId: topic.subjectId, ...compiled, manuscript });
    send({ draft: ownView(draft) }, 201);
    return true;
  }

  const analyticsMatch = path.match(/^\/partner\/playbooks\/([^/]+)\/analytics$/);
  if (analyticsMatch && method === 'GET') {
    const id = decodeURIComponent(analyticsMatch[1]);
    await ownPlaybookId(id);
    send(await getPlaybookAnalytics(store, id));
    return true;
  }

  const versionMatch = path.match(/^\/partner\/playbooks\/([^/]+)\/versions\/(\d+)(?:\/(sandbox|submit|withdraw|fork))?$/);
  if (versionMatch) {
    const id = decodeURIComponent(versionMatch[1]);
    const version = Number(versionMatch[2]);
    const action = versionMatch[3];
    const pb = await ownVersion(id, version);
    if (!action && method === 'GET') {
      send({ playbook: ownView(pb), sandboxRuns: await listSandboxRuns(store, id, version) });
      return true;
    }
    if (!action && method === 'PATCH') {
      writable();
      const { titleZh, titleEn, summaryZh, summaryEn, highlightsZh, highlightsEn, slots, manuscript } = input ?? {};
      send({ playbook: ownView(await updatePlaybookDraft(store, id, version, { titleZh, titleEn, summaryZh, summaryEn, highlightsZh, highlightsEn, slots, manuscript })) });
      return true;
    }
    if (action === 'sandbox' && method === 'POST') {
      writable();
      if (pb.status !== 'draft') reject('只有草稿可以進行沙盒試聊', 409);
      const config = (await store.model()) ?? reject('平台尚未配置 AI 模型，暫時未能試聊', 503, 'MODEL_NOT_CONFIGURED');
      const custom: SandboxProbeInput[] = Array.isArray(input?.customPrompts)
        ? input.customPrompts
            .map((p: unknown) => String(p ?? '').trim())
            .filter((p: string) => p.length >= 4)
            .slice(0, 2)
            .map((prompt: string, i: number) => ({ id: `probe-custom-${i + 1}`, kind: 'custom' as const, prompt: prompt.slice(0, 600) }))
        : [];
      // Platform probes always run (incl. the anti-extraction guardrail probe); tutors may add up to 2 of their own.
      const probes = [...defaultGoldenProbes(pb), ...custom];
      spendModelCall(identity.id);
      const result = await runPlaybookSandbox(store, config, identity, id, version, probes, signal);
      send({ playbook: ownView(result.playbook), run: result.run });
      return true;
    }
    if (action === 'submit' && method === 'POST') {
      writable();
      if (pb.status !== 'draft') reject('只有草稿可以提交審核', 409);
      const blockers = scanPlaybookCompliance(pb.slots).filter(f => f.severity === 'blocker');
      if (blockers.length) reject(`方法包仍有 ${blockers.length} 項紅線問題，請先修改再提交`, 422, 'COMPLIANCE_BLOCKER');
      if (!pb.sandboxPassedAt) reject('提交前請先通過沙盒試聊', 409, 'SANDBOX_VERIFICATION_REQUIRED');
      if (input?.agree !== true) reject('請先勾選確認聲明', 422, 'AGREEMENT_REQUIRED');
      send({ playbook: ownView(await confirmPlaybookByTutor(store, id, version, { confirmedBy: partner.name, note: input?.note })) });
      return true;
    }
    if (action === 'withdraw' && method === 'POST') {
      writable();
      const next = pb.status === 'published' ? await archivePlaybookVersion(store, id, version) : await withdrawTutorConfirmation(store, id, version);
      send({ playbook: ownView(next) });
      return true;
    }
    if (action === 'fork' && method === 'POST') {
      writable();
      send({ playbook: ownView(await forkPlaybookVersion(store, id, version)) }, 201);
      return true;
    }
  }

  if (path === '/partner/export-review-pack' && method === 'POST') {
    const playbookId = typeof input?.playbookId === 'string' && input.playbookId.trim() ? input.playbookId.trim() : undefined;
    if (playbookId) await ownPlaybookId(playbookId);
    send(await exportPartnerReviewPack(store, identity, { partnerTutorId: partner.id, playbookId, maxChats: input?.maxChats }));
    return true;
  }

  if (path === '/partner/export-audit' && method === 'GET') {
    send({ audits: await listExportAudit(store, partner.id) });
    return true;
  }

  reject('找不到此合作導師操作', 404);
}
