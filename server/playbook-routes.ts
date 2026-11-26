import type { Store } from './store.ts';
import type { Identity } from '../src/pilot-types.ts';
import { reject } from './learning.ts';
import {
  acceptUserTerms,
  archivePartnerTutor,
  archivePlaybookVersion,
  confirmPlaybookByTutor,
  createPartnerTutor,
  createPartnerAccount,
  createPlaybookDraft,
  exportPartnerReviewPack,
  getPartnerTutor,
  getPlaybookAnalytics,
  getPlaybookVersion,
  getUserConsent,
  listExportAudit,
  listPartnerTutors,
  listPlaybooks,
  listPublicTutors,
  listSandboxRuns,
  partnerAccountUsernames,
  publishPlaybookVersion,
  recordPlaybookEvent,
  returnPlaybookToTutor,
  updatePartnerTutor,
  updatePlaybookDraft,
  updateSharePartnerChats,
} from './playbooks.ts';
import {
  compileManuscriptToPlaybook,
  multimodalModelAdapter,
  runPlaybookSandbox,
  transcribeToManuscript,
} from './playbook-compiler.ts';
import type { SandboxProbeInput } from './playbook-compiler.ts';
import { tutorResources } from './tutors.ts';
import { catalog } from '../src/data/catalog.ts';
import { units } from './studio-state.ts';

export function topicTitleFor(topicId: string): string {
  const fromCatalog = catalog.topics.find(t => t.id === topicId);
  if (fromCatalog) return fromCatalog.name;
  const fromUnits = units.find(u => u.topicId === topicId);
  return fromUnits?.title ?? topicId;
}

export async function handlePlaybookRoutes(
  store: Store,
  identity: Identity,
  path: string,
  method: string,
  input: any,
  searchParams: URLSearchParams,
  send: (data: unknown, status?: number) => void,
  signal: AbortSignal
): Promise<boolean> {
  const requireStaff = () => {
    if (!['developer', 'reviewer'].includes(identity.role)) {
      reject('此功能僅供獲授權的開發者／內容復核者', 403, 'FORBIDDEN');
    }
  };

  // --- Student Consent & Privacy Settings ---
  if (path === '/me/consent' && method === 'GET') {
    send(await getUserConsent(store, identity.id));
    return true;
  }
  if (path === '/me/consent' && method === 'PUT') {
    let view: Awaited<ReturnType<typeof getUserConsent>> | undefined;
    if (input.acceptTermsVersion !== undefined) {
      view = await acceptUserTerms(
        store,
        identity.id,
        String(input.acceptTermsVersion),
        typeof input.sharePartnerChats === 'boolean' ? input.sharePartnerChats : undefined
      );
    } else if (typeof input.sharePartnerChats === 'boolean') {
      view = await updateSharePartnerChats(store, identity.id, input.sharePartnerChats);
    } else {
      reject('請提供有效的協議版本或私隱設定選項');
    }
    send(view);
    return true;
  }

  // --- Public Tutor Discovery & Attribution ---
  if (path === '/tutors' && method === 'GET') {
    const topicId = searchParams.get('topicId') ?? undefined;
    const tutors = await listPublicTutors(store, topicId);
    send({ tutors, resources: tutorResources.map(({ text: _t, ...s }) => s) });
    return true;
  }

  const linkClickMatch = path.match(/^\/tutors\/([^/]+)\/link-click$/);
  if (linkClickMatch && method === 'POST') {
    const playbookId = decodeURIComponent(linkClickMatch[1]);
    const list = await listPlaybooks(store, { status: 'published' });
    const pb = list.find(p => p.id === playbookId);
    if (!pb) reject('找不到對應的已發布導師方法', 404);
    const partner = await getPartnerTutor(store, pb.partnerTutorId);
    if (!partner || partner.status !== 'active' || !partner.externalUrl) reject('此合作導師未設定公開外鏈或已下架', 404);
    await recordPlaybookEvent(store, {
      playbookId: pb.id,
      version: String(pb.version),
      partnerTutorId: pb.partnerTutorId,
      topicId: pb.topicId,
      kind: 'link_click',
    });
    send({ ok: true, externalUrl: partner.externalUrl });
    return true;
  }

  const feedbackMatch = path.match(/^\/chats\/([^/]+)\/feedback$/);
  if (feedbackMatch && method === 'POST') {
    if (typeof input.helpful !== 'boolean') reject('請提供有效的回饋選項 (helpful: boolean)');
    const chatId = feedbackMatch[1];
    const data = await store.state(identity.id);
    const chat = data.chats.find(c => c.id === chatId) ?? reject('對話不存在', 404);
    if (chat.tutor?.kind !== 'partner' || !chat.tutor.partnerTutorId) {
      reject('此回饋介面僅適用於合作導師教學方法對話', 422);
    }
    await recordPlaybookEvent(store, {
      playbookId: chat.tutor.id,
      version: chat.tutor.version,
      partnerTutorId: chat.tutor.partnerTutorId,
      topicId: chat.topicId,
      kind: input.helpful ? 'helpful' : 'not_helpful',
      meta: typeof input.note === 'string' && input.note.trim() ? { noteLength: input.note.trim().length } : {},
    });
    send({ ok: true });
    return true;
  }

  // --- Admin / Reviewer: Partner Tutors ---
  if (path === '/admin/partner-tutors' && method === 'GET') {
    requireStaff();
    const accounts = await partnerAccountUsernames(store);
    send({ partnerTutors: (await listPartnerTutors(store, true)).map(t => ({ ...t, accountUsername: accounts[t.id] ?? null })) });
    return true;
  }
  const partnerAccountMatch = path.match(/^\/admin\/partner-tutors\/([^/]+)\/account$/);
  if (partnerAccountMatch && method === 'POST') {
    if (identity.role !== 'developer') reject('只有開發者可以為合作導師開設登入帳戶', 403, 'FORBIDDEN');
    send(await createPartnerAccount(store, decodeURIComponent(partnerAccountMatch[1]), input ?? {}), 201);
    return true;
  }
  if (path === '/admin/partner-tutors' && method === 'POST') {
    requireStaff();
    send(await createPartnerTutor(store, input), 201);
    return true;
  }
  const partnerArchiveMatch = path.match(/^\/admin\/partner-tutors\/([^/]+)\/archive$/);
  if (partnerArchiveMatch && method === 'POST') {
    requireStaff();
    send(await archivePartnerTutor(store, decodeURIComponent(partnerArchiveMatch[1])));
    return true;
  }
  const partnerItemMatch = path.match(/^\/admin\/partner-tutors\/([^/]+)$/);
  if (partnerItemMatch && method === 'PATCH') {
    requireStaff();
    send(await updatePartnerTutor(store, decodeURIComponent(partnerItemMatch[1]), input));
    return true;
  }

  // --- Admin / Reviewer: Two-Stage Multimodal Compiler ---
  if (path === '/admin/playbooks/transcribe' && method === 'POST') {
    requireStaff();
    const topicId = String(input?.topicId ?? '').trim();
    if (!topicId) reject('請提供單元 ID (topicId)');
    const hasMedia = Boolean(input?.audioBase64 || input?.boardImages?.length);
    const config = hasMedia ? await store.model() : null;
    const adapter = config ? multimodalModelAdapter(config) : null;
    const draft = await transcribeToManuscript(
      {
        topicId,
        topicTitle: String(input?.topicTitle ?? topicTitleFor(topicId)),
        audioBase64: input?.audioBase64,
        audioFormat: input?.audioFormat,
        boardImages: input?.boardImages,
        textNotes: input?.textNotes,
        languageHint: input?.languageHint === 'en' ? 'en' : 'zh-HK',
      },
      adapter,
      signal
    );
    send(draft);
    return true;
  }

  if (path === '/admin/playbooks/compile' && method === 'POST') {
    requireStaff();
    const config = (await store.model()) ?? reject('請開發者先配置可用的 AI 模型再編譯教學方法包', 503, 'MODEL_NOT_CONFIGURED');
    const topicId = String(input?.topicId ?? '').trim();
    const partnerTutorId = String(input?.partnerTutorId ?? '').trim();
    if (!topicId || !partnerTutorId) reject('請提供 partnerTutorId 與 topicId');
    const partner = (await getPartnerTutor(store, partnerTutorId)) ?? reject('找不到合作導師', 404);
    const compiled = await compileManuscriptToPlaybook(
      config,
      {
        topicId,
        topicTitle: String(input?.topicTitle ?? topicTitleFor(topicId)),
        partnerTutorName: partner.name,
        manuscriptMarkdown: String(input?.manuscriptMarkdown ?? ''),
        deliveryHint: input?.deliveryHint,
      },
      signal
    );
    if (input?.saveDraft === true) {
      const saved = await createPlaybookDraft(store, {
        id: input?.id,
        partnerTutorId,
        topicId,
        subjectId: input?.subjectId ?? topicId.split('-')[0],
        ...compiled,
        manuscript: String(input?.manuscriptMarkdown ?? ''),
      });
      send({ compiled, draft: saved }, 201);
      return true;
    }
    send({ compiled });
    return true;
  }

  // --- Admin / Reviewer: Playbook Versions CRUD, Dual-Gate Publish, Sandbox & Archive ---
  if (path === '/admin/playbooks' && method === 'GET') {
    requireStaff();
    send({
      playbooks: await listPlaybooks(store, {
        partnerTutorId: searchParams.get('partnerTutorId') ?? undefined,
        topicId: searchParams.get('topicId') ?? undefined,
        status: (searchParams.get('status') as any) ?? undefined,
      }),
    });
    return true;
  }
  if (path === '/admin/playbooks' && method === 'POST') {
    requireStaff();
    send(await createPlaybookDraft(store, input), 201);
    return true;
  }

  const analyticsMatch = path.match(/^\/admin\/playbooks\/([^/]+)\/analytics$/);
  if (analyticsMatch && method === 'GET') {
    requireStaff();
    send(await getPlaybookAnalytics(store, decodeURIComponent(analyticsMatch[1])));
    return true;
  }

  const exportMatch = path.match(/^\/admin\/partner-tutors\/([^/]+)\/export-review-pack$/);
  if (exportMatch && method === 'POST') {
    requireStaff();
    send(
      await exportPartnerReviewPack(store, identity, {
        partnerTutorId: decodeURIComponent(exportMatch[1]),
        playbookId: typeof input?.playbookId === 'string' && input.playbookId.trim() ? input.playbookId.trim() : undefined,
        maxChats: input?.maxChats,
      })
    );
    return true;
  }

  if (path === '/admin/partner-tutors/export-audit' && method === 'GET') {
    requireStaff();
    send({ audits: await listExportAudit(store, searchParams.get('partnerTutorId') ?? undefined) });
    return true;
  }

  const versionMatch = path.match(/^\/admin\/playbooks\/([^/]+)\/versions\/(\d+)(?:\/(confirm-tutor|sandbox|publish|archive|return))?$/);
  if (versionMatch) {
    requireStaff();
    const id = decodeURIComponent(versionMatch[1]);
    const version = Number(versionMatch[2]);
    const action = versionMatch[3];
    if (!action && method === 'GET') {
      const pb = (await getPlaybookVersion(store, id, version)) ?? reject('找不到該教學方法包版本', 404);
      const sandboxRuns = await listSandboxRuns(store, id, version);
      send({ playbook: pb, sandboxRuns });
      return true;
    }
    if (!action && method === 'PATCH') {
      send(await updatePlaybookDraft(store, id, version, input));
      return true;
    }
    if (action === 'confirm-tutor' && method === 'POST') {
      send(await confirmPlaybookByTutor(store, id, version, { confirmedBy: input?.confirmedBy, note: input?.note }));
      return true;
    }
    if (action === 'sandbox' && method === 'POST') {
      const config = (await store.model()) ?? reject('請開發者先配置可用的 AI 模型再執行沙盒試聊', 503, 'MODEL_NOT_CONFIGURED');
      const customProbes = Array.isArray(input?.probes) ? (input.probes as SandboxProbeInput[]) : undefined;
      send(await runPlaybookSandbox(store, config, identity, id, version, customProbes, signal));
      return true;
    }
    if (action === 'publish' && method === 'POST') {
      send(await publishPlaybookVersion(store, id, version, identity));
      return true;
    }
    if (action === 'archive' && method === 'POST') {
      send(await archivePlaybookVersion(store, id, version));
      return true;
    }
    if (action === 'return' && method === 'POST') {
      send(await returnPlaybookToTutor(store, id, version, identity, input?.note));
      return true;
    }
  }

  return false;
}
