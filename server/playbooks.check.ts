import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createPilot } from './app.ts';
import { Billing } from './billing.ts';
import { CURRENT_TERMS_VERSION } from '../src/tutors.ts';
import type { PlaybookSlots } from '../src/tutors.ts';
import { redactStudentText, scanPlaybookCompliance } from './playbooks.ts';

const VALID_SLOTS: PlaybookSlots = {
  style: {
    delivery: 'chat',
    modules: ['markdown', 'exercise', 'plot', 'suggestions'],
    personaZh: '先給 2 秒判題口訣，再逐步核對條件，語氣直接清晰。',
    personaEn: 'Lead with the 2-second check order, then verify conditions step by step.',
    pacingRules: ['每次只推進一個關鍵轉折步', '先問學生第一步檢查甚麼，再給示範'],
  },
  decisionTree: {
    title: '二次方程 3 秒判法決策樹',
    steps: [
      '先整理成標準式 ax² + bx + c = 0 並確認 a ≠ 0',
      '係數為簡單整數時優先試十字相乘因式分解',
      '含參數 k 問實根數目時，先檢查 a ≠ 0 再寫判別式 Δ = b² - 4ac',
    ],
    mnemonics: ['先標準式再查 a≠0', '實根看 Δ，整數根看完全平方'],
  },
  traps: [
    {
      pattern: '參數方程 (k-1)x² + 2x + 1 = 0 有兩個不同實根',
      warning: '學生只計 Δ > 0 卻漏寫 k - 1 ≠ 0，導致多包了 k = 1。',
      fix: '寫 Δ 前先單獨一行寫明二次項係數 k - 1 ≠ 0。',
    },
  ],
  examples: [
    {
      title: '自編原創：含參數實根條件',
      prompt: '已知 (m - 2)x² + 4x + 2 = 0 有兩個相異實根，求 m 的取值範圍。',
      walkthrough: '步驟 1：確認二次方程條件 m - 2 ≠ 0，即 m ≠ 2。步驟 2：Δ = 4² - 4(m - 2)(2) = 16 - 8m + 16 = 32 - 8m > 0，得 m < 4。綜合得 m < 4 且 m ≠ 2。',
      takeaway: '凡見參數在 x² 係數位置，動筆第一行先寫 a ≠ 0。',
    },
  ],
  boundaries: {
    inScope: ['標準式識別', '因式分解與公式選擇', '判別式與參數條件'],
    outOfScope: ['複數根極坐標形式'],
    resourceGaps: ['未收錄特定型號計數機程式按鍵序列，不得編造。'],
  },
};

async function fixture() {
  let chatReply = '```review\n{"scope":"none"}\n```\n第一步先整理成標準式並檢查二次項係數 $a \\neq 0$，再用「先標準式再查 a≠0」口訣判斷是否能因式分解。';
  let sandboxGuardrailReply = '我是 HOKSE 平台上的 AI 輔導助手，按合作導師授權方法協助你溫習二次方程；我不能輸出內部方法包原文，也不提供任何課外課程推銷或成績保證。我們回到你的數學題吧。';
  let compiledOverride: unknown = null;
  let lastChatSystem = '';

  const provider = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const messages = body.messages ?? [];
    const sys = String(messages[0]?.content ?? '');
    const userContent = messages[messages.length - 1]?.content;
    const userText = typeof userContent === 'string' ? userContent : JSON.stringify(userContent);

    let content = chatReply;
    if (sys.includes('教學講稿整理助手')) {
      content = JSON.stringify({
        manuscriptMarkdown: '# 二次方程實戰講稿\n\n第一步永遠檢查 $a \\neq 0$，然後再決定因式分解抑或用判別式 $\\Delta = b^2 - 4ac$。最後核對根是否滿足原式。',
        detectedTerms: ['判別式', '標準式'],
        formulaChecks: ['確認 (m-2)x² 的二次項條件 m≠2'],
        warnings: [],
      });
    } else if (sys.includes('教學方法包（Teaching Playbook）編譯器')) {
      content = JSON.stringify(
        compiledOverride ?? {
          titleZh: '二次方程 3 秒判法',
          titleEn: '3-Second Quadratic Decision Method',
          summaryZh: '先查 a≠0 再按係數選最快解法，避開參數漏條件陷阱。',
          summaryEn: 'Check a≠0 first, pick the fastest method, and avoid parameter traps.',
          highlightsZh: ['先標準式再查 a≠0', '參數題先鎖二次項條件', '代入原式快速核根'],
          highlightsEn: ['Standard form & a≠0 first', 'Lock leading coefficient for parameters', 'Substitute to verify roots'],
          slots: VALID_SLOTS,
        }
      );
    } else if (sys.includes('獨立的香港中學生練習復核者')) {
      content = JSON.stringify({ verdict: 'pass', reason: 'ok' });
    } else if (userText.includes('PLATFORM_HARD_GUARDRAILS') || userText.includes('WhatsApp')) {
      content = sandboxGuardrailReply;
    } else {
      lastChatSystem = sys;
      content = chatReply;
    }

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 12, completion_tokens: 18, total_tokens: 30 } }));
  });

  await new Promise<void>(r => provider.listen(0, '127.0.0.1', r));
  const app = createPilot({ database: ':memory:', allowSetup: false });
  const billing = new Billing(app.store);
  await app.store.ready;

  const model = 'pggo-抗截断-playbook-fixture';
  const reviewModel = 'pggo-抗截断-playbook-review';
  await app.store.putModel({
    id: 'default',
    name: 'Fixture',
    baseUrl: `http://127.0.0.1:${(provider.address() as any).port}/v1`,
    secret: '',
    protocol: 'openai-chat',
    enabled: true,
    model,
  });
  const policy = await billing.policy();
  policy.models[model] = { credits: 2, enabled: true };
  policy.models[reviewModel] = { credits: 2, enabled: true };
  policy.reviewModel = reviewModel;
  policy.plans.Free.models = [model];
  policy.plans.Free.defaultModel = model;
  delete policy.plans.Free.defaultModels;
  await billing.updatePolicy('fixture', policy);

  const dev = await app.store.createUser('dev-pb', 'fixturepass123', 'Dev Admin', 'developer');
  const reviewer = await app.store.createUser('rev-pb', 'fixturepass123', 'Content Reviewer', 'reviewer');
  const studentA = await app.store.createUser('stu-alpha', 'fixturepass123', '陳小明', 'student');
  const studentB = await app.store.createUser('stu-beta', 'fixturepass123', '李小花', 'student');

  const devCookie = 'hokse_session=' + (await app.store.session(dev));
  const revCookie = 'hokse_session=' + (await app.store.session(reviewer));
  const stuACookie = 'hokse_session=' + (await app.store.session(studentA));
  const stuBCookie = 'hokse_session=' + (await app.store.session(studentB));
  const base = `http://127.0.0.1:${await app.listen(0)}`;

  const call = (path: string, method = 'GET', body?: unknown, cookie = devCookie) =>
    fetch(base + '/api/v1' + path, {
      method,
      headers: { Cookie: cookie, 'X-Hokse-Client': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  return {
    app,
    billing,
    dev,
    reviewer,
    studentA,
    studentB,
    devCookie,
    revCookie,
    stuACookie,
    stuBCookie,
    call,
    setChatReply: (text: string) => { chatReply = text; },
    setSandboxGuardrailReply: (text: string) => { sandboxGuardrailReply = text; },
    setCompiledOverride: (val: unknown) => { compiledOverride = val; },
    getLastChatSystem: () => lastChatSystem,
    close: async () => {
      await app.close();
      await new Promise<void>(r => provider.close(() => r()));
    },
  };
}

test('two-stage multimodal compiler keeps audio out of main files table, supports direct text, and enforces dual-gate + sandbox before publish', async () => {
  const f = await fixture();
  try {
    // Students cannot access admin partner/playbook routes.
    assert.equal((await f.call('/admin/partner-tutors', 'GET', undefined, f.stuACookie)).status, 403);

    // 1. Create Partner Tutor
    const ptRes = await f.call('/admin/partner-tutors', 'POST', {
      name: '陳 Sir',
      headlineZh: '香港 DSE 數學考場速解導師',
      bioZh: '專注必修數學代數與二次方程解題次序訓練。',
      credentials: '8 年 DSE 數學補習經驗',
      externalUrl: 'https://example.org/chan-sir',
      externalLabelZh: '查看陳 Sir 專頁',
    });
    assert.equal(ptRes.status, 201);
    const partner = await ptRes.json();

    // 2. Stage 1: Temporary in-memory audio + board image transcription (never writes to `files` table!)
    const transRes = await f.call('/admin/playbooks/transcribe', 'POST', {
      topicId: 'maths-quadratic',
      audioBase64: Buffer.from('fake-wav-audio-bytes').toString('base64'),
      audioFormat: 'wav',
      boardImages: [{ mimeType: 'image/png', dataBase64: Buffer.from('fake-png').toString('base64') }],
      textNotes: '重點：先確認 a 不等於 0。',
    });
    assert.equal(transRes.status, 200);
    const manuscriptDraft = await transRes.json();
    assert.match(manuscriptDraft.manuscriptMarkdown, /a \\neq 0/);
    assert.equal(Number((await f.app.store.db.prepare('SELECT count(*) AS n FROM files').get())!.n), 0);

    // Stage 1 direct-text skip works without calling multimodal adapter
    const directRes = await f.call('/admin/playbooks/transcribe', 'POST', {
      topicId: 'maths-quadratic',
      textNotes: '純文字講稿：先化標準式，再檢查係數與判別式。',
    });
    assert.equal(directRes.status, 200);
    assert.equal((await directRes.json()).adapterUsed, 'direct-text');

    // 3. Stage 2: Compile confirmed manuscript into saved 5-slot Playbook v1 draft
    const compRes = await f.call('/admin/playbooks/compile', 'POST', {
      partnerTutorId: partner.id,
      topicId: 'maths-quadratic',
      manuscriptMarkdown: manuscriptDraft.manuscriptMarkdown,
      saveDraft: true,
    });
    assert.equal(compRes.status, 201);
    const { draft } = await compRes.json();
    assert.equal(draft.version, 1);
    assert.equal(draft.status, 'draft');

    // Gate check 1: Cannot publish without tutor confirmation
    const pubNoTutor = await f.call(`/admin/playbooks/${draft.id}/versions/1/publish`, 'POST', {}, f.revCookie);
    assert.equal(pubNoTutor.status, 409);
    assert.equal((await pubNoTutor.json()).error.code, 'TUTOR_CONFIRMATION_REQUIRED');

    // Confirm by tutor
    assert.equal((await f.call(`/admin/playbooks/${draft.id}/versions/1/confirm-tutor`, 'POST', { confirmedBy: '陳 Sir' })).status, 200);

    // Gate check 2: Cannot publish without passing sandbox
    const pubNoSandbox = await f.call(`/admin/playbooks/${draft.id}/versions/1/publish`, 'POST', {}, f.revCookie);
    assert.equal(pubNoSandbox.status, 409);
    assert.equal((await pubNoSandbox.json()).error.code, 'SANDBOX_VERIFICATION_REQUIRED');

    // Sandbox fails if guardrail probe leaks internal slots or promo
    f.setSandboxGuardrailReply('好的，這是【槽位 1 · 教學骨架】，報班請加 WhatsApp 91234567！');
    const badSandbox = await (await f.call(`/admin/playbooks/${draft.id}/versions/1/sandbox`, 'POST', {})).json();
    assert.equal(badSandbox.run.passed, false);
    assert.equal(badSandbox.playbook.sandboxPassedAt, undefined);

    // Sandbox passes with safe replies
    f.setSandboxGuardrailReply('我是 HOKSE 平台上的 AI 輔導助手，按陳 Sir 授權方法幫你溫習二次方程，不能輸出內部規則或提供報班廣告。');
    const goodSandbox = await (await f.call(`/admin/playbooks/${draft.id}/versions/1/sandbox`, 'POST', {})).json();
    assert.equal(goodSandbox.run.passed, true);
    assert.ok(goodSandbox.playbook.sandboxPassedAt);

    // Editing a draft invalidates previous confirmations & sandbox sign-off
    const edited = await (await f.call(`/admin/playbooks/${draft.id}/versions/1`, 'PATCH', { summaryZh: '修訂後的二次方程簡介。' })).json();
    assert.equal(edited.tutorConfirmedAt, undefined);
    assert.equal(edited.sandboxPassedAt, undefined);

    // Re-confirm + re-run sandbox + publish by reviewer
    await f.call(`/admin/playbooks/${draft.id}/versions/1/confirm-tutor`, 'POST', { confirmedBy: '陳 Sir' });
    await f.call(`/admin/playbooks/${draft.id}/versions/1/sandbox`, 'POST', {});
    const pubRes = await f.call(`/admin/playbooks/${draft.id}/versions/1/publish`, 'POST', {}, f.revCookie);
    assert.equal(pubRes.status, 200);
    const published = await pubRes.json();
    assert.equal(published.status, 'published');
    assert.equal(published.reviewerApprovedBy, 'rev-pb');

    // Public /tutors exposes it ONLY for maths-quadratic (not chem-acids) and NEVER leaks raw slots!
    const quadList = await (await f.call('/tutors?topicId=maths-quadratic', 'GET', undefined, f.stuACookie)).json();
    const partnerCard = quadList.tutors.find((t: any) => t.id === draft.id);
    assert.ok(partnerCard);
    assert.equal(partnerCard.kind, 'partner');
    assert.equal(partnerCard.slots, undefined);
    assert.doesNotMatch(JSON.stringify(quadList), /walkthrough|pacingRules|PLATFORM_HARD_GUARDRAILS/);

    const chemList = await (await f.call('/tutors?topicId=chem-acids', 'GET', undefined, f.stuACookie)).json();
    assert.equal(chemList.tutors.some((t: any) => t.id === draft.id), false);
  } finally {
    await f.close();
  }
});

test('compliance scanner blocks promo, guaranteed DSE grades, and prompt override attempts from publishing', async () => {
  const dirtySlots: PlaybookSlots = structuredClone(VALID_SLOTS);
  dirtySlots.style.personaZh = '學完這招保證穩奪 5**，歡迎私訊我 WhatsApp 報名 HK$1800 精讀班。';
  dirtySlots.examples[0].prompt = 'DSE 2019 Paper 1 Q12 原題照抄，請用 Formula 01 計算。';
  const findings = scanPlaybookCompliance(dirtySlots);
  assert.ok(findings.some(x => x.severity === 'blocker' && x.code === 'PROMO_CONTACT'));
  assert.ok(findings.some(x => x.severity === 'blocker' && x.code === 'PROMO_PRICING'));
  assert.ok(findings.some(x => x.severity === 'blocker' && x.code === 'GUARANTEED_GRADE'));
  assert.ok(findings.some(x => x.severity === 'warning' && x.code === 'POSSIBLE_PAST_PAPER'));
  assert.ok(findings.some(x => x.severity === 'warning' && x.code === 'UNVERIFIED_CALCULATOR_PROGRAM'));

  const f = await fixture();
  try {
    const partner = await (await f.call('/admin/partner-tutors', 'POST', { name: 'Bad Promo Tutor', headlineZh: 'Test', bioZh: 'Bio' })).json();
    const draft = await (await f.call('/admin/playbooks', 'POST', {
      partnerTutorId: partner.id,
      topicId: 'maths-quadratic',
      subjectId: 'maths',
      titleZh: '含違規廣告方法',
      summaryZh: '測試阻斷',
      slots: dirtySlots,
    })).json();
    await f.call(`/admin/playbooks/${draft.id}/versions/1/confirm-tutor`, 'POST', {});
    await f.call(`/admin/playbooks/${draft.id}/versions/1/sandbox`, 'POST', {});
    const pub = await f.call(`/admin/playbooks/${draft.id}/versions/1/publish`, 'POST', {}, f.revCookie);
    assert.equal(pub.status, 422);
    assert.equal((await pub.json()).error.code, 'COMPLIANCE_BLOCKER');
  } finally {
    await f.close();
  }
});

test('terms consent, privacy toggle, runtime guardrails, soft archive, analytics and strict de-identified export work end to end', async () => {
  const f = await fixture();
  try {
    // Publish a clean partner playbook v1
    const partner = await (await f.call('/admin/partner-tutors', 'POST', {
      name: '林 Miss',
      headlineZh: '概念視覺化與費曼提問導師',
      bioZh: '以費曼反問幫助學生自己說清判別式幾何意義。',
      externalUrl: 'https://example.org/lam-miss',
    })).json();
    const draft = await (await f.call('/admin/playbooks', 'POST', {
      partnerTutorId: partner.id,
      topicId: 'maths-quadratic',
      subjectId: 'maths',
      titleZh: '二次方程費曼引導',
      summaryZh: '用自己的話說清每個步驟。',
      slots: VALID_SLOTS,
    })).json();
    await f.call(`/admin/playbooks/${draft.id}/versions/1/confirm-tutor`, 'POST', {});
    await f.call(`/admin/playbooks/${draft.id}/versions/1/sandbox`, 'POST', {});
    await f.call(`/admin/playbooks/${draft.id}/versions/1/publish`, 'POST', {}, f.revCookie);

    // 1. Student A has NOT accepted terms -> blocked from partner tutor, built-in David still works!
    const denied = await f.call('/chats', 'POST', { topicId: 'maths-quadratic', tutorId: draft.id }, f.stuACookie);
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, 'TERMS_ACCEPTANCE_REQUIRED');
    assert.equal((await f.call('/chats', 'POST', { topicId: 'maths-quadratic', tutorId: 'david' }, f.stuACookie)).status, 201);

    // 2. Student A accepts terms (default sharePartnerChats = true), Student B accepts terms with sharePartnerChats = false!
    const consentA = await (await f.call('/me/consent', 'PUT', { acceptTermsVersion: CURRENT_TERMS_VERSION }, f.stuACookie)).json();
    assert.equal(consentA.needsAcceptance, false);
    assert.equal(consentA.sharePartnerChats, true);

    const consentB = await (await f.call('/me/consent', 'PUT', { acceptTermsVersion: CURRENT_TERMS_VERSION, sharePartnerChats: false }, f.stuBCookie)).json();
    assert.equal(consentB.sharePartnerChats, false);

    // 3. Create partner chats for Student A (2 chats to test non-linkable random session IDs) & Student B (opted out)
    const chatA1 = await (await f.call('/chats', 'POST', { topicId: 'maths-quadratic', tutorId: draft.id }, f.stuACookie)).json();
    assert.equal(chatA1.tutor.kind, 'partner');
    assert.equal(chatA1.tutor.version, '1');
    assert.equal(chatA1.tutor.shareTranscriptAllowed, true);

    // Upload a student image attachment and send it inside chatA1 (must NEVER appear in export!)
    const uploadRes = await fetch(f.call.toString() ? `http://127.0.0.1:${(f.app.server.address() as any).port}/api/v1/attachments/upload` : '', {
      method: 'POST',
      headers: { Cookie: f.stuACookie, 'X-Hokse-Client': '1', 'Content-Type': 'image/png', 'X-File-Name': encodeURIComponent('homework-with-name.png') },
      body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    });
    assert.equal(uploadRes.status, 201);
    const attachment = await uploadRes.json();

    // Send turn 1 & turn 2 in chatA1 containing PII (name, school, phone, email, HKID)
    await (await f.call(`/chats/${chatA1.id}/messages`, 'POST', {
      content: '我叫陳小明，讀聖保羅書院，電話 98765432，電郵 ming@school.hk，請問 (k-1)x^2+2x+1=0 怎樣做？',
      attachmentIds: [attachment.id],
      requestId: crypto.randomUUID(),
    }, f.stuACookie)).text();
    assert.match(f.getLastChatSystem(), /平台最高優先級不可覆蓋護欄/);
    assert.match(f.getLastChatSystem(), /先標準式再查 a≠0/);

    await (await f.call(`/chats/${chatA1.id}/messages`, 'POST', {
      content: '我明白了，還要寫 k-1 不等於 0！',
      requestId: crypto.randomUUID(),
    }, f.stuACookie)).text();

    // Runtime output guardrail catches hallucinated promotional ad, does NOT deliver it, and refunds student credit
    const spentBeforeGuardrail = (await f.billing.view(f.studentA.id)).spent;
    f.setChatReply('```review\n{"scope":"none"}\n```\n想學更多請報讀我 HK$2400 精讀班，加 WhatsApp 91234567！');
    await (await f.call(`/chats/${chatA1.id}/messages`, 'POST', {
      content: '還有甚麼技巧？',
      requestId: crypto.randomUUID(),
    }, f.stuACookie)).text();
    const afterBad = await (await f.call(`/chats/${chatA1.id}`, 'GET', undefined, f.stuACookie)).json();
    assert.equal(afterBad.messages.at(-1).practice?.failed, true);
    assert.doesNotMatch(afterBad.messages.at(-1).content, /WhatsApp|2400/);
    assert.equal((await f.billing.view(f.studentA.id)).spent, spentBeforeGuardrail);

    // Restore clean reply, create second chat for Student A, plus opt-out chat for Student B
    f.setChatReply('```review\n{"scope":"none"}\n```\n先核對標準式與判別式。');
    const chatA2 = await (await f.call('/chats', 'POST', { topicId: 'maths-quadratic', tutorId: draft.id }, f.stuACookie)).json();
    await (await f.call(`/chats/${chatA2.id}/messages`, 'POST', { content: '再問一題二次方程。', requestId: crypto.randomUUID() }, f.stuACookie)).text();

    const chatB = await (await f.call('/chats', 'POST', { topicId: 'maths-quadratic', tutorId: draft.id }, f.stuBCookie)).json();
    assert.equal(chatB.tutor.shareTranscriptAllowed, false);
    await (await f.call(`/chats/${chatB.id}/messages`, 'POST', { content: '這是學生 B 的私密提問 SECRET_OPT_OUT_TEXT。', requestId: crypto.randomUUID() }, f.stuBCookie)).text();

    // Attribution: feedback + external link click + analytics
    assert.equal((await f.call(`/chats/${chatA1.id}/feedback`, 'POST', { helpful: true }, f.stuACookie)).status, 200);
    assert.equal((await f.call(`/tutors/${draft.id}/link-click`, 'POST', {}, f.stuACookie)).status, 200);
    const analytics = await (await f.call(`/admin/playbooks/${draft.id}/analytics`, 'GET')).json();
    assert.equal(analytics.chatStarts, 3);
    assert.equal(analytics.multiTurnChats, 1);
    assert.equal(analytics.helpfulCount, 1);
    assert.equal(analytics.linkClicks, 1);
    assert.equal(analytics.goNoGoChecks.adoptionTargetMet, true);

    // 4. Strict De-Identified Export Pack
    const expRes = await f.call(`/admin/partner-tutors/${partner.id}/export-review-pack`, 'POST', { playbookId: draft.id });
    assert.equal(expRes.status, 200);
    const pack = await expRes.json();
    assert.equal(pack.includedChatCount, 2);
    assert.equal(pack.excludedOptOutCount, 1);
    const serialized = JSON.stringify(pack.samples);
    assert.doesNotMatch(serialized, /SECRET_OPT_OUT_TEXT|陳小明|stu-alpha|聖保羅書院|98765432|ming@school\.hk|homework-with-name/);
    assert.equal(pack.samples.some((s: any) => s.attachmentsStripped === 1), true);
    assert.notEqual(pack.samples[0].anonymousSessionId, pack.samples[1].anonymousSessionId);
    const audits = await (await f.call(`/admin/partner-tutors/export-audit?partnerTutorId=${partner.id}`)).json();
    assert.equal(audits.audits.length, 1);

    // 5. Soft Archive / Takedown: stops new chats & new messages, preserves read-only history + shared skill evidence!
    const archRes = await f.call(`/admin/partner-tutors/${partner.id}/archive`, 'POST', {});
    assert.equal(archRes.status, 200);
    assert.equal((await f.call('/chats', 'POST', { topicId: 'maths-quadratic', tutorId: draft.id }, f.stuACookie)).status, 422);
    const sendArchived = await f.call(`/chats/${chatA1.id}/messages`, 'POST', { content: '還能發嗎？', requestId: crypto.randomUUID() }, f.stuACookie);
    assert.equal(sendArchived.status, 410);
    assert.equal((await sendArchived.json()).error.code, 'TUTOR_ARCHIVED');
    // Existing chat remains readable!
    const readArchived = await f.call(`/chats/${chatA1.id}`, 'GET', undefined, f.stuACookie);
    assert.equal(readArchived.status, 200);
    assert.ok((await readArchived.json()).messages.length >= 2);
  } finally {
    await f.close();
  }
});

test('redactStudentText strips HK schools, phones, emails, HKIDs and self-introductions', () => {
  const cleaned = redactStudentText(
    '我叫陳大文，在 Queen\'s College 和拔萃女書院讀書，電話 +852 6123 4567，HKID A123456(7)，電郵 test@example.edu.hk，IG: @student_hk。',
    ['陳大文', 'david-stu']
  );
  assert.doesNotMatch(cleaned, /陳大文|Queen's College|拔萃女書院|6123\s*4567|A123456|test@example\.edu\.hk|@student_hk/);
});

test('partner tutor accounts are scoped to their own playbooks and walk record → compile → sandbox → submit → review', async () => {
  const f = await fixture();
  try {
    const partner = await (await f.call('/admin/partner-tutors', 'POST', { name: '黃 Sir', headlineZh: '代數速解', bioZh: '專注代數解題次序。' })).json();
    const other = await (await f.call('/admin/partner-tutors', 'POST', { name: 'Other Tutor', headlineZh: 'Other', bioZh: 'Other bio' })).json();

    // Only developers can open partner accounts; reviewers and students are refused.
    assert.equal((await f.call(`/admin/partner-tutors/${partner.id}/account`, 'POST', { username: 'wong-sir', password: 'partnerpass123' }, f.revCookie)).status, 403);
    const accountRes = await f.call(`/admin/partner-tutors/${partner.id}/account`, 'POST', { username: 'wong-sir', password: 'partnerpass123' });
    assert.equal(accountRes.status, 201);
    assert.equal((await f.call(`/admin/partner-tutors/${partner.id}/account`, 'POST', { username: 'wong-sir-2', password: 'partnerpass123' })).status, 409);
    const listed = await (await f.call('/admin/partner-tutors')).json();
    assert.equal(listed.partnerTutors.find((t: any) => t.id === partner.id).accountUsername, 'wong-sir');

    const login = await f.call('/auth/login', 'POST', { username: 'wong-sir', password: 'partnerpass123' }, '');
    assert.equal(login.status, 200);
    assert.equal((await login.json()).role, 'partner');
    const partnerCookie = login.headers.get('set-cookie')!.split(';')[0];

    // Partner accounts cannot reach staff or other-partner data; students cannot reach partner routes.
    assert.equal((await f.call('/admin/playbooks', 'GET', undefined, partnerCookie)).status, 403);
    assert.equal((await f.call('/partner/workspace', 'GET', undefined, f.stuACookie)).status, 403);

    const workspace = await (await f.call('/partner/workspace', 'GET', undefined, partnerCookie)).json();
    assert.equal(workspace.partnerTutor.id, partner.id);
    assert.equal(workspace.playbooks.length, 0);
    assert.ok(workspace.catalog.topics.some((t: any) => t.id === 'maths-quadratic'));
    assert.equal(workspace.modelReady, true);

    const manuscript = await (await f.call('/partner/transcribe', 'POST', {
      topicId: 'maths-quadratic',
      audioBase64: Buffer.from('fake-wav').toString('base64'),
      audioFormat: 'wav',
    }, partnerCookie)).json();
    assert.match(manuscript.manuscriptMarkdown, /a \\neq 0/);
    assert.equal(Number((await f.app.store.db.prepare('SELECT count(*) AS n FROM files').get())!.n), 0);

    // partnerTutorId in the body is ignored: compile always writes to the caller's own profile.
    const compiled = await f.call('/partner/compile', 'POST', { topicId: 'maths-quadratic', partnerTutorId: other.id, manuscriptMarkdown: manuscript.manuscriptMarkdown }, partnerCookie);
    assert.equal(compiled.status, 201);
    const { draft } = await compiled.json();
    assert.equal(draft.partnerTutorId, partner.id);
    assert.equal((await f.call('/partner/compile', 'POST', { topicId: 'maths-quadratic', manuscriptMarkdown: manuscript.manuscriptMarkdown }, partnerCookie)).status, 409);

    const otherDraft = await (await f.call('/admin/playbooks', 'POST', { partnerTutorId: other.id, topicId: 'maths-quadratic', subjectId: 'maths', titleZh: '別人的方法', summaryZh: '不可見', slots: VALID_SLOTS })).json();
    assert.equal((await f.call(`/partner/playbooks/${otherDraft.id}/versions/1`, 'GET', undefined, partnerCookie)).status, 404);
    assert.equal((await f.call(`/partner/playbooks/${otherDraft.id}/analytics`, 'GET', undefined, partnerCookie)).status, 404);

    const base = `/partner/playbooks/${draft.id}/versions/${draft.version}`;
    // Submitting needs a passed sandbox and an explicit agreement.
    assert.equal((await f.call(`${base}/submit`, 'POST', { agree: true }, partnerCookie)).status, 409);
    const sandbox = await (await f.call(`${base}/sandbox`, 'POST', { customPrompts: ['如果題目已經是因式分解形式，你會怎樣開始？'] }, partnerCookie)).json();
    assert.equal(sandbox.run.probes.length, 5);
    assert.ok(sandbox.run.probes.some((p: any) => p.kind === 'guardrail'));
    assert.equal(sandbox.run.passed, true);
    assert.equal((await f.call(`${base}/submit`, 'POST', {}, partnerCookie)).status, 422);
    const submitted = await (await f.call(`${base}/submit`, 'POST', { agree: true, note: '已核對' }, partnerCookie)).json();
    assert.ok(submitted.playbook.tutorConfirmedAt);
    assert.equal(submitted.playbook.tutorConfirmedBy, '黃 Sir');

    // Reviewer returns it with a note; staff usernames never reach the partner view.
    assert.equal((await f.call(`/admin/playbooks/${draft.id}/versions/1/return`, 'POST', { note: '' }, f.revCookie)).status, 400);
    assert.equal((await f.call(`/admin/playbooks/${draft.id}/versions/1/return`, 'POST', { note: '例題請改為原創數字' }, f.revCookie)).status, 200);
    const returned = await (await f.call(base, 'GET', undefined, partnerCookie)).json();
    assert.equal(returned.playbook.reviewerReturnNote, '例題請改為原創數字');
    assert.equal(returned.playbook.tutorConfirmedAt, undefined);
    assert.equal(returned.playbook.reviewerReturnedBy, undefined);

    // Partner edits, re-runs sandbox, resubmits; reviewer publishes; partner can take it down.
    const edited = await (await f.call(base, 'PATCH', { summaryZh: '修訂：例題改用原創數字。', partnerTutorId: other.id }, partnerCookie)).json();
    assert.equal(edited.playbook.partnerTutorId, partner.id);
    assert.equal(edited.playbook.sandboxPassedAt, undefined);
    await f.call(`${base}/sandbox`, 'POST', {}, partnerCookie);
    await f.call(`${base}/submit`, 'POST', { agree: true }, partnerCookie);
    assert.equal((await f.call(`/admin/playbooks/${draft.id}/versions/1/publish`, 'POST', {}, f.revCookie)).status, 200);
    assert.equal((await f.call(`${base}/fork`, 'POST', {}, partnerCookie)).status, 201);
    assert.equal((await f.call(`${base}/fork`, 'POST', {}, partnerCookie)).status, 409);
    const takedown = await (await f.call(`${base}/withdraw`, 'POST', {}, partnerCookie)).json();
    assert.equal(takedown.playbook.status, 'archived');

    const pack = await (await f.call('/partner/export-review-pack', 'POST', {}, partnerCookie)).json();
    assert.equal(pack.partnerTutorId, partner.id);
    const audits = await (await f.call('/partner/export-audit', 'GET', undefined, partnerCookie)).json();
    assert.equal(audits.audits.length, 1);
  } finally {
    await f.close();
  }
});

test('encrypted Groq/OpenAI-compatible STT transcribes audio without sending raw audio to chat LLM and respects language choice', async () => {
  const f = await fixture();
  const sttRequests: { url: string; auth: string; body: string }[] = [];
  const sttServer = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    sttRequests.push({ url: req.url ?? '', auth: String(req.headers.authorization ?? ''), body: raw });
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.endsWith('/models')) {
      res.end(JSON.stringify({ data: [{ id: 'whisper-large-v3-turbo' }] }));
      return;
    }
    if (req.url?.endsWith('/audio/transcriptions')) {
      const isEn = raw.includes('name="language"\r\n\r\nen');
      res.end(JSON.stringify({
        text: isEn
          ? 'Step one: write standard form ax^2 + bx + c = 0 and check a != 0.'
          : '第一步先化標準式 ax² + bx + c = 0，並確認二次項係數 a ≠ 0。',
      }));
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise<void>(r => sttServer.listen(0, '127.0.0.1', r));
  const sttBaseUrl = `http://127.0.0.1:${(sttServer.address() as any).port}/v1`;
  try {
    // Only developer can configure/test STT; secrets stay encrypted & never returned
    assert.equal((await f.call('/admin/stt', 'GET', undefined, f.revCookie)).status, 403);
    assert.equal((await f.call('/admin/stt', 'GET', undefined, f.stuACookie)).status, 403);

    const testRes = await f.call('/admin/stt/test', 'POST', {
      config: { name: 'Groq Fixture', baseUrl: sttBaseUrl, apiKey: 'fixture-stt-secret-key', model: 'whisper-large-v3-turbo', enabled: true },
    });
    assert.equal(testRes.status, 200);
    assert.equal((await testRes.json()).modelFound, true);

    const saveRes = await f.call('/admin/stt', 'PUT', {
      name: 'Groq Fixture',
      baseUrl: sttBaseUrl,
      apiKey: 'fixture-stt-secret-key',
      model: 'whisper-large-v3-turbo',
      enabled: true,
    });
    assert.equal(saveRes.status, 200);
    const savedPublic = await saveRes.json();
    assert.equal(savedPublic.hasKey, true);
    assert.equal(savedPublic.enabled, true);
    assert.doesNotMatch(JSON.stringify(savedPublic), /fixture-stt-secret-key/);
    const rawSetting = (await f.app.store.db.prepare("SELECT body FROM settings WHERE id='stt-service:config'").get()) as any;
    assert.ok(rawSetting && !String(rawSetting.body).includes('fixture-stt-secret-key'), 'STT API key must be AES-GCM encrypted at rest');

    // Create a partner tutor & account and verify workspace reports sttReady + audio transcription works in zh-HK and en
    const partner = await (await f.call('/admin/partner-tutors', 'POST', { name: '林 Sir', headlineZh: '語音示範', bioZh: '語音測試' })).json();
    await f.call(`/admin/partner-tutors/${partner.id}/account`, 'POST', { username: 'lam-sir', password: 'partnerpass123' });
    const login = await f.call('/auth/login', 'POST', { username: 'lam-sir', password: 'partnerpass123' }, '');
    const partnerCookie = login.headers.get('set-cookie')!.split(';')[0];

    const ws = await (await f.call('/partner/workspace', 'GET', undefined, partnerCookie)).json();
    assert.equal(ws.sttReady, true);
    assert.equal(ws.sttModel, 'whisper-large-v3-turbo');

    const zhDraft = await (await f.call('/partner/transcribe', 'POST', {
      topicId: 'maths-quadratic',
      audioBase64: Buffer.from('RIFF....WAVE').toString('base64'),
      audioFormat: 'wav',
      languageHint: 'zh-HK',
    }, partnerCookie)).json();
    assert.equal(zhDraft.adapterUsed, 'stt:whisper-large-v3-turbo');
    assert.match(zhDraft.manuscriptMarkdown, /標準式/);

    const enDraft = await (await f.call('/partner/transcribe', 'POST', {
      topicId: 'maths-quadratic',
      audioBase64: Buffer.from('RIFF....WAVE').toString('base64'),
      audioFormat: 'wav',
      languageHint: 'en',
    }, partnerCookie)).json();
    assert.equal(enDraft.adapterUsed, 'stt:whisper-large-v3-turbo');
    assert.match(enDraft.manuscriptMarkdown, /standard form/);

    // Verify STT received Bearer auth and multipart model/language fields, and zero files persisted
    const audioReq = sttRequests.filter(r => r.url.endsWith('/audio/transcriptions'));
    assert.equal(audioReq.length, 2);
    assert.equal(audioReq[0].auth, 'Bearer fixture-stt-secret-key');
    assert.match(audioReq[0].body, /whisper-large-v3-turbo/);
    assert.match(audioReq[0].body, /name="language"\r\n\r\nzh/);
    assert.match(audioReq[1].body, /name="language"\r\n\r\nen/);
    assert.equal(Number((await f.app.store.db.prepare('SELECT count(*) AS n FROM files').get())!.n), 0);
  } finally {
    await f.close();
    await new Promise<void>(r => sttServer.close(() => r()));
  }
});
