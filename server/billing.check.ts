import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createPilot } from './app.ts';
import { Billing, defaults, hkPeriod, periodEnd, initialPolicy, migrateModelPolicy, normalizeTokens, requestModelPurpose } from './billing.ts';
import { generate } from './models.ts';
import { buildAdaptiveQuizProfile, detectWeakSpotAlert, units } from './studio-state.ts';
import { generateAssessment } from './quiz-contract.ts';
import { checkRegistrationIpQuota, normalizeEmail, recordRegistrationIp } from './auth-mail.ts';

async function fixture() {
  let mode = 'text', calls = 0; const seenModels: string[] = []; const seenBodies: any[] = [];
  const provider = createServer(async (req, res) => { let raw = ''; for await (const c of req) raw += c; const body = JSON.parse(raw); calls++; seenModels.push(body.model); seenBodies.push(body); res.setHeader('Content-Type', 'application/json');
    if (mode === 'slow') await new Promise(r => setTimeout(r, 150));
    if (mode === 'error') { res.writeHead(503); res.end(JSON.stringify({ error: { message: 'fixture-secret-key Authorization: Bearer danger-secret' } })); return; }
    let text = '```review\n{"scope":"none"}\n```\nPrivate response fixture-secret-key <script>alert(1)</script>';
    if (mode === 'bad' || mode === 'repair' && calls === 1) text = 'invalid quiz';
    else if (mode === 'repair') text = JSON.stringify({ contractVersion: 'learning-contract-v2', items: [{ skillId: units[0].skills[0].id, kind: 'numeric', prompt: 'Solve x²−7x+10=0. Give the larger root.', answer: '5', explanation: 'The roots are 2 and 5.', hint: 'Factorise.', criterion: 'Find the larger root.', check: { a: 1, b: -7, c: 10, root: 'larger' } }] });
    if (mode === 'grade-bad') text = '{}';
    if (mode === 'grade') text = JSON.stringify({feedback:JSON.parse(body.messages[1].content).map((row:any)=>({itemId:row.item.id,score:80,verdict:'correct',text:'A specific fixture comment.',reason:'A fixture criterion match.'}))});
    res.end(JSON.stringify({ choices: [{ message: { content: text } }], ...(mode === 'missing-tokens' ? {} : { usage: { prompt_tokens: 31, completion_tokens: 11, total_tokens: 42 } }) }));
  });
  await new Promise<void>(r => provider.listen(0, '127.0.0.1', r));
  const app = createPilot({ database: ':memory:', allowSetup: false }), base = `http://127.0.0.1:${await app.listen(0)}`;
  const owner = await app.store.createUser('owner', 'fixture-password', 'Owner', 'developer'), student = await app.store.createUser('student', 'fixture-password', 'Student', 'student'), other = await app.store.createUser('other', 'fixture-password', 'Other', 'student'), reviewer = await app.store.createUser('reviewer', 'fixture-password', 'Reviewer', 'reviewer');
  const identities = { owner, student, other, reviewer }, cookies = {} as Record<keyof typeof identities, string>; for (const [k, u] of Object.entries(identities)) cookies[k as keyof typeof identities] = 'hokse_session=' + await app.store.session(u);
  const config = { id: 'default', name: 'Fixture', baseUrl: `http://127.0.0.1:${(provider.address() as { port: number }).port}/v1`, secret: 'fixture-secret-key', model: defaults[1], protocol: 'openai-chat' as const, enabled: true }; await app.store.putModel(config);
  async function call(path: string, method = 'GET', body?: unknown, who: keyof typeof identities = 'student', requestId = crypto.randomUUID()) { const res = await fetch(base + '/api/v1' + path, { method, headers: { Cookie: cookies[who], 'X-Hokse-Client': '1', 'X-Hokse-Request-ID': requestId, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); const text = await res.text(); let data: any; try { data = JSON.parse(text); } catch { data = text; } return { status: res.status, data, text }; }
  async function chat(requestId = crypto.randomUUID(), who: keyof typeof identities = 'student') { const c = await call('/chats', 'POST', { topicId: units[0].topicId, mode: 'explain' }, who); return { id: c.data.id, requestId, send: (content = 'Explain this idea') => call(`/chats/${c.data.id}/messages`, 'POST', { content, requestId }, who) }; }
  return { app, config, call, chat, identities, billing: new Billing(app.store), mode: (m: string) => { mode = m; calls = 0; }, calls: () => calls, seenModels: () => [...seenModels], seenBodies: () => [...seenBodies], close: async () => { await app.close(); await new Promise<void>(r => provider.close(() => r())); } };
}

test('approved two-tier defaults, 100/2000/5000 quotas, weekly Free limit, and Hong Kong helpers are deterministic', () => {
  const p = initialPolicy();
  assert.deepEqual(Object.values(p.plans).map(x => x.credits), [100, 2000, 5000]);
  assert.equal(p.plans.Free.weeklyCredits, 30);
  assert.equal(p.plans.Plus.weeklyCredits, null);
  assert.equal(p.plans.Pro.weeklyCredits, null);
  assert.deepEqual(defaults.map(m => p.models[m].credits), [2, 5, 20]);
  // Two-tier model gating: Free = lite only; Plus & Pro = all enabled models.
  assert.ok(p.plans.Free.models.includes(defaults[0]));
  assert.ok(!p.plans.Free.models.includes(defaults[1]));
  assert.ok(!p.plans.Free.models.includes(defaults[2]));
  assert.ok(p.plans.Plus.models.includes(defaults[2]));
  assert.ok(p.plans.Pro.models.includes(defaults[2]));
  assert.equal(p.models['pggo-抗截断-gemini-3.1-pro-preview'], undefined);
  assert.equal(hkPeriod(new Date('2026-11-30T15:59:59Z')), '2026-11');
  assert.equal(hkPeriod(new Date('2026-11-30T16:00:00Z')), '2026-12');
  assert.equal(periodEnd('2026-12'), '2026-12-31T16:00:00.000Z');
  assert.deepEqual(normalizeTokens({}), { input: null, output: null, total: null });
});

test('mock checkout charges full 30-day price (no proration exploit), carries over remaining balance on upgrade, and never calls AI', async () => { const f = await fixture(); try {
  // Unused Free (100 left) upgrades to Plus -> full HK$39, fresh 30-day cycle, 2000 + 100 = 2100.
  const id = crypto.randomUUID(), o = await f.call('/billing/orders', 'POST', { target: 'Plus', requestId: id });
  assert.equal(o.status, 201);
  assert.equal(o.data.amount, 39);
  assert.equal(o.data.carryover, 100);
  assert.equal((await f.call('/billing/orders', 'POST', { target: 'Plus', requestId: id })).data.id, o.data.id);
  assert.equal((await f.call(`/billing/orders/${o.data.id}/pay`, 'POST', { channel: 'mock-card' }, 'other')).status, 404);
  const paid = await f.call(`/billing/orders/${o.data.id}/pay`, 'POST', { channel: 'mock-card', amount: 0 });
  assert.equal(paid.data.status, 'mock-paid');
  assert.equal((await f.call(`/billing/orders/${o.data.id}/pay`, 'POST', { channel: 'mock-card' })).data.paidAt, paid.data.paidAt);
  const b = (await f.call('/billing')).data;
  assert.equal(b.account.plan, 'Plus');
  assert.equal(b.baseCap, 2000);
  assert.equal(b.carryover, 100);
  assert.equal(b.cap, 2100);
  assert.equal(b.available, 2100);
  assert.equal(b.orders.length, 1);
  assert.equal(f.calls(), 0);
  assert.match((await f.call(`/billing/orders/${o.data.id}/receipt`)).text, /NO REAL PAYMENT/);
  assert.equal((await f.call(`/billing/orders/${o.data.id}/receipt`, 'GET', undefined, 'other')).status, 404);

  // Another student spends 2 cr on Free (98 left) -> upgrades to Plus -> 2098; spends all 100 -> upgrades -> 2000.
  await (await f.chat(crypto.randomUUID(), 'other')).send();
  const o2 = await f.call('/billing/orders', 'POST', { target: 'Plus', requestId: crypto.randomUUID() }, 'other');
  assert.equal(o2.data.carryover, 98);
  await f.call(`/billing/orders/${o2.data.id}/pay`, 'POST', { channel: 'mock-fps' }, 'other');
  const b2 = (await f.call('/billing', 'GET', undefined, 'other')).data;
  assert.equal(b2.cap, 2098);
  assert.equal(b2.available, 2098);
} finally { await f.close(); } });

test('server ignores client model override, captures once, replays SSE, and logs tokens without exposing response text', async () => { const f = await fixture(); try {
  const c = await f.chat(), first = await c.send(); assert.equal(first.status, 200); assert.match(first.text, /event: done/); assert.equal((await c.send()).text.includes('event: done'), true); assert.equal(f.calls(), 1);
  const b = (await f.call('/billing')).data; assert.equal(b.spent, 2); assert.equal(b.available, 98); assert.equal(b.weeklySpent, 2); assert.equal(b.weeklyAvailable, 28); assert.equal(b.held, 0); assert.equal(b.usage[0].tokens.total, 42);
  const list = (await f.call('/admin/usage', 'GET', undefined, 'owner')).data; assert.equal(list.total, 1); const l = list.rows[0]; assert.equal(l.model, defaults[0]); assert.deepEqual(l.request, { model: defaults[0], stream: false, msg_count: 2, chars: l.request.chars, has_tools: false, tools_count: 0, first_role: 'system', temperature: null, max_tokens: 60000 });
  const detail = await f.call('/admin/usage/' + l.id, 'GET', undefined, 'owner'); assert.equal('response' in detail.data, false); assert.ok(!detail.text.includes('Private response')); const exported = await f.call('/admin/usage/' + l.id + '/export', 'GET', undefined, 'owner'); assert.match(exported.data.response, /Private response/); assert.ok(!exported.text.includes('fixture-secret-key')); assert.match(exported.text, /REDACTED/);
  const raw = await f.app.store.db.prepare('SELECT content FROM ai_usage_logs WHERE id=?').get(l.id); assert.ok(!raw!.content.includes('Private response')); assert.equal((await f.call('/admin/usage', 'GET')).status, 403); assert.equal((await f.call('/admin/usage/export', 'GET', undefined, 'reviewer')).status, 403);
  assert.equal((await c.send('Different content')).status, 409); assert.equal(f.calls(), 1);
} finally { await f.close(); } });

test('upstream errors release credits and preserve HTTP code, redacted error, and unknown token values', async () => { const f = await fixture(); try {
  f.mode('error'); const c = await f.chat(); assert.equal((await c.send()).status, 200); const b = (await f.call('/billing')).data; assert.equal(b.spent, 0); assert.equal(b.available, 100); assert.equal(b.usage[0].status, 'released');
  const l = (await f.call('/admin/usage', 'GET', undefined, 'owner')).data.rows[0]; assert.equal(l.httpStatus, 503); assert.equal(l.error.type, 'UPSTREAM_ERROR'); assert.ok(!JSON.stringify(l).includes('fixture-secret-key')); assert.equal(l.tokens.total, null);
} finally { await f.close(); } });

test('insufficient balance, weekly Free cap, and concurrent requests cannot overspend; Free is restricted to Lite models', async () => { const f = await fixture(); try {
  const p = await f.billing.policy(); p.plans.Free.credits = 2; await f.billing.updatePolicy(f.identities.owner.id, p); f.mode('slow');
  const [a, b] = await Promise.all([f.chat(), f.chat()]); const results = await Promise.all([a.send(), b.send()]); assert.deepEqual(results.map(r => r.status).sort(), [200, 402]); assert.equal(f.calls(), 1); const v = await f.billing.view(f.identities.student.id); assert.equal(v.available, 0); assert.equal(v.spent, 2); assert.equal(v.held, 0);
  // Free rejects both flagship and non-lite standard models, but allows another lite model.
  assert.equal((await f.call('/billing/model', 'PUT', { model: defaults[2] })).status, 403);
  assert.equal((await f.call('/billing/model', 'PUT', { model: defaults[1] })).status, 403);
  assert.equal((await f.call('/billing/model', 'PUT', { model: 'pggo-抗截断-gemini-3.1-flash-lite' })).status, 200);

  // Rolling 7-day weekly cap on Free blocks spending beyond weeklyCredits even when 30-day pool still has credits.
  const p2 = await f.billing.policy(); p2.plans.Free.credits = 100; p2.plans.Free.weeklyCredits = 4; await f.billing.updatePolicy(f.identities.owner.id, p2);
  f.mode('text');
  assert.equal((await (await f.chat(crypto.randomUUID(), 'other')).send()).status, 200); // 2/4
  assert.equal((await (await f.chat(crypto.randomUUID(), 'other')).send()).status, 200); // 4/4
  const capped = await (await f.chat(crypto.randomUUID(), 'other')).send(); // 6 > 4 -> 402 WEEKLY_CREDIT_LIMIT
  assert.equal(capped.status, 402);
  assert.equal(capped.data.error.code, 'WEEKLY_CREDIT_LIMIT');
  // Upgrading to Plus immediately lifts the weekly Free cap.
  const order = await f.call('/billing/orders', 'POST', { target: 'Plus', requestId: crypto.randomUUID() }, 'other');
  await f.call(`/billing/orders/${order.data.id}/pay`, 'POST', { channel: 'mock-card' }, 'other');
  assert.equal((await (await f.chat(crypto.randomUUID(), 'other')).send()).status, 200);
} finally { await f.close(); } });

test('price and quota changes preserve operation snapshots; changing plan cannot refill prior spend', async () => { const f = await fixture(); try {
  await (await f.chat()).send(); let p = await f.billing.policy(); const old = structuredClone(p); p.models[defaults[0]].credits = 9; p.plans.Free.credits = 3; await f.billing.updatePolicy(f.identities.owner.id, p); assert.equal((await f.billing.view(f.identities.student.id)).available, 1); assert.equal((await f.billing.view(f.identities.student.id)).usage[0].cost, 2);
  await assert.rejects(f.billing.updatePolicy(f.identities.owner.id, old), /重新載入/); await f.billing.adminAccount(f.identities.owner.id, f.identities.student.id, 'Plus'); assert.equal((await f.billing.view(f.identities.student.id)).available, 1998); await f.billing.adminAccount(f.identities.owner.id, f.identities.student.id, 'Free'); assert.equal((await f.billing.view(f.identities.student.id)).available, 1);
} finally { await f.close(); } });

test('downgrade, cancellation and 30-day rolling cycle reset clear carryover so neither Free nor renewals snowball', async () => { const f = await fixture(); try {
  let now = new Date('2026-11-15T04:00:00Z'); const b = new Billing(f.app.store, () => now);
  // Start on Free (100), upgrade to Plus (gets 2,100 for 30 days until Dec 15).
  const up = await b.order(f.identities.student.id, 'Plus', crypto.randomUUID());
  await b.pay(f.identities.student.id, up.id, 'mock-card');
  assert.equal((await b.view(f.identities.student.id)).available, 2100);
  // Schedule downgrade to Free -> stays Plus during the 30-day window.
  await b.subscription(f.identities.student.id, 'cancel');
  now = new Date('2026-12-01T00:00:00Z'); // Still inside 30-day cycle!
  assert.equal((await b.view(f.identities.student.id)).account.plan, 'Plus');
  await b.subscription(f.identities.student.id, 'restore');
  assert.equal((await b.view(f.identities.student.id)).account.pendingPlan, null);
  // Advance past 30 days -> renewal resets cleanly to 2,000 (carryover = 0, no infinite stacking).
  now = new Date('2026-12-15T04:00:01Z');
  const renewed = await b.view(f.identities.student.id);
  assert.equal(renewed.account.plan, 'Plus');
  assert.equal(renewed.carryover, 0);
  assert.equal(renewed.available, 2000);
  // Upgrade Plus -> Pro mid-cycle -> carries over 2,000 to 7,000 for fresh 30 days, then cancel -> resets to Free 100 after 30 days.
  const upPro = await b.order(f.identities.student.id, 'Pro', crypto.randomUUID());
  assert.equal(upPro.amount, 79);
  await b.pay(f.identities.student.id, upPro.id, 'mock-fps');
  assert.equal((await b.view(f.identities.student.id)).available, 7000);
  await b.subscription(f.identities.student.id, 'cancel');
  now = new Date('2027-01-14T04:00:02Z');
  const backFree = await b.view(f.identities.student.id);
  assert.equal(backFree.account.plan, 'Free');
  assert.equal(backFree.available, 100);
  assert.equal(backFree.carryover, 0);
  // Another 30 days idle on Free -> STILL 100, never 200!
  now = new Date('2027-02-15T04:00:02Z');
  assert.equal((await b.view(f.identities.student.id)).available, 100);
} finally { await f.close(); } });

test('admin testing is logged as platform use, while normal admin learning uses the assigned plan', async () => { const f = await fixture(); try {
  assert.equal((await f.call('/admin/model/test', 'POST', {}, 'owner')).status, 200); const v = await f.billing.view(f.identities.owner.id); assert.equal(v.spent, 0); const row = (await f.call('/admin/usage', 'GET', undefined, 'owner')).data.rows[0]; assert.equal(row.plan, 'Platform'); assert.equal(row.credit, 0);
  assert.equal((await f.call('/admin/billing/policy', 'PUT', initialPolicy(), 'student')).status, 403); assert.equal((await f.call('/admin/billing/users', 'GET', undefined, 'reviewer')).status, 403);
} finally { await f.close(); } });

test('invalid quick exercise and final invalid assessment release credit; repairs charge once with every attempt logged (Plus+)', async () => { const f = await fixture(); try {
  // Free is gated from AI-made topic quizzes with 403 PLAN_REQUIRED.
  const create = (purpose: string, source = 'ai') => f.call('/studio/quizzes', 'POST', { subjectId: 'maths', purpose, source, count: 1, requestId: crypto.randomUUID() });
  assert.equal((await create('quick')).status, 403);
  await f.billing.adminAccount(f.identities.owner.id, f.identities.student.id, 'Plus');
  f.mode('bad');
  assert.equal((await create('quick')).data.quiz, null); assert.equal((await f.call('/billing')).data.spent, 0); const invalid = await create('assessment'); assert.equal(invalid.status, 422); assert.equal(f.calls(), 4); assert.equal((await f.call('/billing')).data.spent, 0);
  f.mode('repair'); const repaired = await create('assessment'); assert.equal(repaired.status, 201, repaired.text); assert.equal(f.calls(), 2); const v = (await f.call('/billing')).data; assert.equal(v.spent, 5); assert.equal(v.held, 0); const logs = (await f.call('/admin/usage', 'GET', undefined, 'owner')).data.rows; assert.equal(logs.filter((l: any) => l.operationId === logs[0].operationId).length, 2);
} finally { await f.close(); } });

test('fixed objective marking is free; unusable AI grading is released', async () => { const f = await fixture(); try {
  const create = (subjectId: string) => f.call('/studio/quizzes', 'POST', { subjectId, purpose: 'quick', source: 'fixed', count: 1, requestId: crypto.randomUUID() }); const q = (await create('maths')).data; await f.call(`/studio/quizzes/${q.id}/answers`, 'PUT', { answers: { [q.questions[0].id]: { value: '5', steps: '' } } }); await f.call(`/studio/quizzes/${q.id}/submit`, 'POST', {}); assert.equal(f.calls(), 0);
  const chi = (await create('chi')).data; await f.call(`/studio/quizzes/${chi.id}/answers`, 'PUT', { answers: { [chi.questions[0].id]: { value: 'My answer', steps: '' } } }); f.mode('grade-bad'); assert.equal((await f.call(`/studio/quizzes/${chi.id}/submit`, 'POST', {})).status, 200); assert.equal(f.calls(), 1); assert.equal((await f.call('/billing')).data.spent, 0); assert.equal((await f.call('/billing')).data.held, 0);
} finally { await f.close(); } });

test('cancellation releases a reservation and a new service instance reuses persisted successful operations', async () => { const f = await fixture(); try {
  f.mode('slow'); const controller = new AbortController(); const billing = f.billing; const run = billing.run(f.identities.student, '/fixture', {}, 'cancel-id', controller.signal, async send => { const text = await generate(f.config, [{ role: 'user', content: 'hello' }]); send({ text }); }, () => {}); setTimeout(() => controller.abort(), 30); await assert.rejects(run); assert.equal((await billing.view(f.identities.student.id)).held, 0); assert.equal((await billing.view(f.identities.student.id)).spent, 0);
  f.mode('text'); let delivered: any; const work = async (send: (data: unknown) => void) => { send({ text: await generate(f.config, [{ role: 'user', content: 'hello' }]) }); }; await billing.run(f.identities.student, '/fixture', {}, 'persistent-id', new AbortController().signal, work, data => { delivered = data; }); const calls = f.calls(); await new Billing(f.app.store).run(f.identities.student, '/fixture', {}, 'persistent-id', new AbortController().signal, work, data => assert.deepEqual(data, delivered)); assert.equal(f.calls(), calls); assert.equal((await billing.view(f.identities.student.id)).spent, 2);
} finally { await f.close(); } });

test('log retention and pagination do not erase the credit ledger or expose another user in personal usage',async()=>{const f=await fixture();try{
  await(await f.chat()).send();const original=(await f.app.store.db.prepare('SELECT * FROM ai_usage_logs').get())!, now=Date.now();
  await f.app.store.transaction(async()=>{for(let i=0;i<1002;i++){const id=crypto.randomUUID(),at=new Date(now+i).toISOString(),body={...JSON.parse(original.body),id,at};await f.app.store.db.prepare('INSERT INTO ai_usage_logs VALUES(?,?,?,?,?,?,?)').run(id,original.user_id,original.operation_id,at,'success',JSON.stringify(body),original.content)}});
  const all=await f.billing.logs(new URLSearchParams());assert.equal(all.total,1000);assert.equal(all.rows.length,20);assert.equal((await f.billing.logs(new URLSearchParams('page=2'))).rows.length,20);assert.equal((await f.call('/billing','GET',undefined,'other')).data.usage.length,0);
  await f.app.store.db.prepare('UPDATE ai_usage_logs SET started_at=?').run(new Date(now-31*86400000).toISOString());assert.equal((await f.billing.logs(new URLSearchParams())).total,0);assert.equal((await f.billing.view(f.identities.student.id)).spent,2);assert.equal(Number((await f.app.store.db.prepare('SELECT COUNT(*) AS n FROM credit_operations').get())!.n),1);
}finally{await f.close()}});

test('three defaults are isolated, enforced per request, and charged using the actual selected model', async () => {
  const f = await fixture(); try {
    await f.billing.adminAccount(f.identities.owner.id, f.identities.student.id, 'Pro');
    const choices = {quiz:defaults[0], chat:defaults[1], evaluation:defaults[2]};
    for (const [purpose, model] of Object.entries(choices)) assert.equal((await f.call('/billing/model', 'PUT', {purpose, model})).status, 200);
    assert.deepEqual((await f.call('/billing')).data.account.models, choices);
    assert.equal((await f.call('/billing', 'GET', undefined, 'other')).data.account.models.chat, defaults[0]);
    const chat = await f.chat(); await chat.send(); assert.equal(f.seenModels().at(-1), defaults[1]);
    f.mode('bad'); await f.call('/studio/quizzes', 'POST', {subjectId:'maths',purpose:'quick',source:'ai',count:1,requestId:crypto.randomUUID()});
    assert.equal(f.seenModels().at(-1), defaults[1]);
    f.mode('repair'); const quiz = await f.call('/studio/quizzes', 'POST', {subjectId:'maths',purpose:'assessment',source:'ai',count:1,requestId:crypto.randomUUID()});
    assert.equal(quiz.status, 201, quiz.text); assert.deepEqual(f.seenModels().slice(-2), [defaults[0], defaults[0]]);
    const chi = (await f.call('/studio/quizzes', 'POST', {subjectId:'chi',purpose:'quick',source:'fixed',count:1,requestId:crypto.randomUUID()})).data;
    await f.call(`/studio/quizzes/${chi.id}/answers`, 'PUT', {answers:{[chi.questions[0].id]:{value:'My own answer',steps:''}}});
    f.mode('grade'); assert.equal((await f.call(`/studio/quizzes/${chi.id}/submit`, 'POST', {})).status, 200);
    assert.equal(f.seenModels().at(-1), defaults[2]);
    const view = (await f.call('/billing')).data;
    assert.equal(view.spent, 27); // chat 5 + repaired independent quiz 2 + evaluation 20.
    assert.equal(view.held, 0); assert.deepEqual(view.account.models, choices);
    assert.equal(requestModelPurpose('/errors/example/analyse', {}), 'evaluation');
    assert.equal(requestModelPurpose('/plans/example/explain', {}), 'chat');
    await f.call('/billing/model', 'PUT', {model:defaults[0]});
    assert.deepEqual((await f.call('/billing')).data.account.models, {...choices, chat:defaults[0]});
  } finally { await f.close(); }
});

test('malformed model IDs are rejected before any provider call, while any valid prefix can be added and used', async () => {
  const f = await fixture(); try {
    for (const model of ['pggo-抗截断-', '-bad-model', 'bad model']) {
      assert.equal((await f.call('/billing/model', 'PUT', {model,purpose:'quiz'})).status, 403);
      const config = {...f.config, model};
      assert.equal((await f.call('/admin/model/test', 'POST', {config}, 'owner')).status, 403);
      assert.equal((await f.call('/admin/model', 'PUT', config, 'owner')).status, 403);
      await assert.rejects(generate(config,[{role:'user',content:'Should never be sent'}]), /抗截斷/);
      const p = await f.billing.policy(); p.models[model] = {enabled:true,credits:1};
      assert.equal((await f.call('/admin/billing/policy', 'PUT', p, 'owner')).status, 403);
    }
    assert.equal((await f.call('/billing/model', 'PUT', {model:defaults[0],purpose:'unknown'})).status, 400);
    const p = await f.billing.policy(); p.models[defaults[1]].enabled=false;p.reviewModel=defaults[0];
    for (const plan of Object.values(p.plans)) {plan.models=plan.models.filter(m=>m!==defaults[1]);plan.defaultModel=defaults[0];plan.defaultModels={quiz:defaults[0],chat:defaults[0],evaluation:defaults[0]};}
    await f.billing.updatePolicy(f.identities.owner.id,p);
    assert.equal((await f.call('/billing/model', 'PUT', {model:defaults[1],purpose:'chat'})).status,403);
    assert.equal(f.calls(), 0); assert.equal((await f.call('/billing')).data.spent,0);
  } finally { await f.close(); }
});

test('legacy v1 policy auto-migrates 500->100 Free + lite-only Free + all-model Plus/Pro without erasing usage', async () => {
  const f = await fixture(); try {
    await (await f.chat()).send();
    const v1Policy: any = {
      version: 78,
      models: {
        [defaults[0]]: { credits: 2, enabled: true },
        'pggo-抗截断-gemini-3.1-flash-lite': { credits: 2, enabled: true },
        [defaults[1]]: { credits: 5, enabled: true },
        [defaults[2]]: { credits: 20, enabled: true },
        'bdgo-gemini-4-argon': { credits: 20, enabled: false },
      },
      plans: {
        Free: { price: 0, credits: 500, models: [defaults[0], 'pggo-抗截断-gemini-3.1-flash-lite', defaults[1]], defaultModel: defaults[0] },
        Plus: { price: 39, credits: 2000, models: [defaults[0], defaults[1]], defaultModel: defaults[1] },
        Pro: { price: 79, credits: 5000, models: [defaults[0], defaults[1], defaults[2], 'bdgo-gemini-4-argon'], defaultModel: 'bdgo-gemini-4-argon' },
      },
    };
    const migrated = migrateModelPolicy(v1Policy);
    assert.equal(migrated.schemaVersion, 2);
    assert.equal(migrated.plans.Free.credits, 100);
    assert.equal(migrated.plans.Free.weeklyCredits, 30);
    assert.deepEqual(migrated.plans.Free.models, [defaults[0], 'pggo-抗截断-gemini-3.1-flash-lite']);
    assert.ok(migrated.plans.Plus.models.includes(defaults[2]));
    await f.app.store.db.prepare("INSERT INTO settings VALUES('billing-policy',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(JSON.stringify(v1Policy));
    const old=(await f.call('/billing')).data.account; delete old.models; old.plan='Pro'; old.model='bdgo-gemini-4-argon';
    await f.app.store.db.prepare('UPDATE billing_accounts SET body=? WHERE user_id=?').run(JSON.stringify(old),f.identities.student.id);
    const view=(await f.call('/billing')).data;
    assert.deepEqual(view.account.models,{quiz:defaults[2],chat:defaults[2],evaluation:defaults[2]});
    assert.equal(view.spent,2); assert.equal(view.cap,5000); assert.equal(view.usage[0].model,defaults[0]);
    assert.ok(!view.policy.plans.Pro.models.includes('bdgo-gemini-4-argon'));
    const p=await f.billing.policy(); p.plans.Free.defaultModels={quiz:'pggo-抗截断-gemini-3.1-flash-lite',chat:defaults[0],evaluation:'pggo-抗截断-gemini-3.1-flash-lite'};
    await f.billing.updatePolicy(f.identities.owner.id,p);
    const inherited=(await f.call('/billing','GET',undefined,'other')).data.account.models;
    assert.deepEqual(inherited,p.plans.Free.defaultModels);
    await f.call('/billing/model','PUT',{purpose:'evaluation',model:defaults[0]},'other');
    assert.deepEqual((await f.call('/billing','GET',undefined,'other')).data.account.models,{...inherited,evaluation:defaults[0]});
  } finally { await f.close(); }
});

test('plan feature gates enforce Free/Plus/Pro boundaries, developer/reviewer bypass, weak-spot report, hybrid quizzes, realtime progress, and Pro 48h forum boost', async () => {
  const f = await fixture(); try {
    // Free student is blocked on Plus+ and Pro-only endpoints.
    assert.equal((await f.call('/plans/preview', 'POST', {})).status, 403);
    assert.equal((await f.call('/studio/rest', 'POST', { date: '2026-11-28', rest: true })).status, 403);
    assert.equal((await f.call('/learning/weak-spot-report')).status, 403);
    assert.equal((await f.call('/learning/weak-spot-signal')).status, 403);
    assert.equal((await f.call('/learning/realtime-progress')).status, 403);
    assert.equal((await f.call('/studio/quizzes', 'POST', { subjectId: 'maths', purpose: 'assessment', source: 'hybrid', count: 2, requestId: crypto.randomUUID() })).status, 403);
    assert.equal((await f.call('/forum/posts', 'POST', { boardId: 'lounge', flair: 'chat', visibility: 'public', title: 'Try boost on free', body: 'Should be blocked', boost: true })).status, 403);

    // Developer & reviewer bypass feature gates even on Free.
    assert.equal((await f.call('/learning/weak-spot-report', 'GET', undefined, 'owner')).status, 200);
    assert.equal((await f.call('/learning/weak-spot-signal', 'GET', undefined, 'owner')).status, 200);
    assert.equal((await f.call('/learning/realtime-progress', 'GET', undefined, 'reviewer')).status, 200);

    // Upgrade student to Plus: unlocks AI plan, rest day, AI quiz — while Pro-only (weak-spot report/signal, realtime progress, hybrid quiz) stays 403.
    await f.billing.adminAccount(f.identities.owner.id, f.identities.student.id, 'Plus');
    assert.equal((await f.call('/plans/preview', 'POST', {})).status, 200);
    assert.equal((await f.call('/studio/rest', 'POST', { date: '2026-11-28', rest: true })).status, 200);
    assert.equal((await f.call('/learning/weak-spot-report')).status, 403);
    assert.equal((await f.call('/learning/weak-spot-signal')).status, 403);
    assert.equal((await f.call('/learning/realtime-progress')).status, 403);
    assert.equal((await f.call('/studio/quizzes', 'POST', { subjectId: 'maths', purpose: 'assessment', source: 'hybrid', count: 2, requestId: crypto.randomUUID() })).status, 403);

    // Upgrade student to Pro: unlocks weak-spot report/signal, realtime progress, hybrid teacher+AI quiz, and 48h boosted anonymous forum posts.
    await f.billing.adminAccount(f.identities.owner.id, f.identities.student.id, 'Pro');
    const weak = await f.call('/learning/weak-spot-report');
    assert.equal(weak.status, 200);
    assert.ok(Array.isArray(weak.data.weakSpots));
    const sig = await f.call('/learning/weak-spot-signal');
    assert.equal(sig.status, 200);
    assert.equal(sig.data.alert, null);
    const rt = await f.call('/learning/realtime-progress');
    assert.equal(rt.status, 200);
    assert.ok(typeof rt.data.syncedAt === 'string');

    f.mode('repair');
    const hybrid = await f.call('/studio/quizzes', 'POST', { subjectId: 'maths', purpose: 'assessment', source: 'hybrid', count: 2, requestId: crypto.randomUUID() });
    assert.equal(hybrid.status, 201, hybrid.text);
    assert.equal(hybrid.data.source, 'hybrid');
    assert.equal(hybrid.data.questions.length, 2);

    // Forum boost: Free user posts normally, then Pro user posts anonymously with boost -> Pro post ranks above regular post on 'hot' without revealing identity.
    const normalPost = await f.call('/forum/posts', 'POST', { boardId: 'lounge', flair: 'chat', visibility: 'public', title: 'Normal free post', body: 'Hello from free', isAnonymous: false }, 'other');
    assert.equal(normalPost.status, 201);
    assert.equal(normalPost.data.boosted, false);
    const proPost = await f.call('/forum/posts', 'POST', { boardId: 'lounge', flair: 'help', visibility: 'public', title: 'Boosted pro anonymous post', body: 'Need help on quadratic', isAnonymous: true }, 'student');
    assert.equal(proPost.status, 201);
    assert.equal(proPost.data.boosted, true);
    assert.equal(proPost.data.authorLabel, '匿名同學');
    const feed = (await f.call('/forum/posts?boardId=lounge&sort=hot', 'GET', undefined, 'other')).data.posts;
    const proIdx = feed.findIndex((x: any) => x.id === proPost.data.id);
    const normalIdx = feed.findIndex((x: any) => x.id === normalPost.data.id);
    assert.ok(proIdx >= 0 && normalIdx >= 0 && proIdx < normalIdx);
    // Official pinned post remains above boosted posts.
    const pinnedIdx = feed.findIndex((x: any) => x.pinned);
    assert.ok(pinnedIdx >= 0 && pinnedIdx < proIdx);
  } finally { await f.close(); }
});

test('anti-multi-account registration blocks disposable domains, normalizes provider aliases, and rate-limits open vs passcode IPs', async () => {
  const f = await fixture(); try {
    assert.throws(() => normalizeEmail('tester@yopmail.fr'), /臨時或一次性/);
    assert.throws(() => normalizeEmail('tester@burnermail.io'), /臨時或一次性/);
    assert.equal(normalizeEmail('Student+free1@protonmail.com').normalized, normalizeEmail('student+free2@pm.me').normalized);
    assert.equal(normalizeEmail('User.Name+1@googlemail.com').normalized, normalizeEmail('username@gmail.com').normalized);
    assert.equal(normalizeEmail('Test+1@me.com').normalized, normalizeEmail('test@icloud.com').normalized);
    const ip = '203.0.113.42';
    for (let i = 0; i < 3; i++) {
      await checkRegistrationIpQuota(f.app.store, ip, 'open');
      await recordRegistrationIp(f.app.store, ip);
    }
    await assert.rejects(checkRegistrationIpQuota(f.app.store, ip, 'open'), /24 小時內建立的新帳戶數量已達上限/);
    // Passcode classroom onboarding on the same school Wi-Fi IP is still allowed (up to 40/24h).
    await checkRegistrationIpQuota(f.app.store, ip, 'passcode');
  } finally { await f.close(); }
});

test('silent performance-adaptive AI quiz targeting runs invisibly for Plus, while weak-spot alerts fire only for Pro on real thresholds', async () => {
  const f = await fixture(); try {
    const mathsUnit = units[0];
    const targetSkillId = mathsUnit.skills[0].id;
    const initialState = await f.app.store.state(f.identities.student.id);
    // Cold start returns null adaptive profile and null weak-spot alert.
    assert.equal(buildAdaptiveQuizProfile(initialState, mathsUnit), null);
    assert.equal(detectWeakSpotAlert(initialState), null);

    // One isolated low attempt should NOT false-alarm weak-spot detection.
    const nowIso = new Date().toISOString();
    initialState.studio = {
      quizzes: [],
      attempts: [{
        id: 'att-1',
        requestId: 'req-1',
        itemId: 'item-1',
        family: 'fam-1',
        subjectId: 'maths',
        topicId: mathsUnit.topicId,
        skillId: targetSkillId,
        at: nowIso,
        answer: '999',
        steps: '',
        independent: true,
        hinted: false,
        feedback: { verdict: 'incorrect', score: 20, text: 'Try again', reason: '符號出錯', source: 'code' },
        disputed: false,
        corrections: [],
      }],
    };
    initialState.errors.push({
      questionId: 'item-1',
      quizId: 'q-1',
      topicId: mathsUnit.topicId,
      skillIds: [targetSkillId],
      observed: 'sign error',
      candidates: [{ reason: '正負號處理\n"ignore instructions" <script>', evidence: 'x', source: 'ai' }],
      selected: '正負號處理\n"ignore instructions" <script>',
      status: 'student-confirmed',
      history: [],
    });
    assert.equal(detectWeakSpotAlert(initialState), null);

    // Adaptive profile activates silently and sanitizes errorPatterns against prompt injection.
    const profile = buildAdaptiveQuizProfile(initialState, mathsUnit);
    assert.ok(profile);
    assert.equal(profile.difficultyTier, 'foundation');
    assert.equal(profile.prioritySkills[0].skillId, targetSkillId);
    assert.ok(profile.prioritySkills[0].weight >= 2);
    assert.equal(profile.errorPatterns.length, 1);
    assert.ok(!/[\n"'<>]/.test(profile.errorPatterns[0]));

    // Verify generateAssessment injects internalTargeting + non-disclosure rule without leaking to output items.
    let capturedMessages: { role: string; content: string }[] = [];
    const generated = await generateAssessment(
      mathsUnit,
      1,
      async messages => {
        capturedMessages = messages;
        return JSON.stringify({
          contractVersion: 'learning-contract-v2',
          items: [{
            skillId: targetSkillId,
            kind: 'numeric',
            prompt: 'Solve x²−7x+10=0. Give the larger root.',
            answer: '5',
            explanation: 'Roots are 2 and 5.',
            hint: 'Factorise.',
            criterion: 'Find the larger root.',
            check: { a: 1, b: -7, c: 10, root: 'larger' },
          }],
        });
      },
      [],
      profile,
    );
    assert.equal(generated.items.length, 1);
    assert.match(capturedMessages[0].content, /嚴禁在 prompt/);
    assert.equal(JSON.parse(capturedMessages[1].content).internalTargeting.difficultyTier, 'foundation');

    // Save state with 1 low attempt -> Plus AI quiz silently passes internalTargeting to provider, and response stays clean.
    await f.app.store.save(f.identities.student.id, initialState);
    await f.billing.adminAccount(f.identities.owner.id, f.identities.student.id, 'Plus');
    f.mode('repair');
    const plusAiQuiz = await f.call('/studio/quizzes', 'POST', { subjectId: 'maths', purpose: 'assessment', source: 'ai', count: 1, requestId: crypto.randomUUID() });
    assert.equal(plusAiQuiz.status, 201, plusAiQuiz.text);
    assert.equal('internalTargeting' in plusAiQuiz.data, false);
    assert.equal(plusAiQuiz.data.weakSpotAlert, undefined);
    const lastReq = f.seenBodies().at(-1);
    assert.ok(JSON.parse(lastReq.messages[1].content).internalTargeting);

    // Submit a wrong answer on Plus (now 2 consecutive low attempts) -> Plus NEVER gets weakSpotAlert nag!
    const qId = plusAiQuiz.data.id;
    const itemId = plusAiQuiz.data.questions[0].id;
    await f.call(`/studio/quizzes/${qId}/answers`, 'PUT', { answers: { [itemId]: { value: '999', steps: '' } } });
    const plusSubmit = await f.call(`/studio/quizzes/${qId}/submit`, 'POST', {});
    assert.equal(plusSubmit.status, 200);
    assert.equal(plusSubmit.data.weakSpotAlert, undefined);

    // Upgrade to Pro -> weak-spot signal endpoint now returns the detected weak spot cleanly!
    await f.billing.adminAccount(f.identities.owner.id, f.identities.student.id, 'Pro');
    const proSignal = await f.call('/learning/weak-spot-signal');
    assert.equal(proSignal.status, 200);
    assert.ok(proSignal.data.alert);
    assert.equal(proSignal.data.alert.skillId, targetSkillId);
    assert.ok(['paused', 'low-score'].includes(proSignal.data.alert.triggerKind));

    // Also verify post-submit weakSpotAlert fires on Pro for a fresh weak quiz (on Chinese/English or resumed maths), and clears once passed!
    await f.call('/studio/resume', 'POST', { subjectId: 'maths', skillId: targetSkillId });
    const fixedAfterResume = await f.call('/studio/quizzes', 'POST', { subjectId: 'maths', purpose: 'assessment', source: 'fixed', skillId: targetSkillId, count: 1, requestId: crypto.randomUUID() });
    assert.equal(fixedAfterResume.status, 201, fixedAfterResume.text);
    const fItemId = fixedAfterResume.data.questions[0].id;
    await f.call(`/studio/quizzes/${fixedAfterResume.data.id}/answers`, 'PUT', { answers: { [fItemId]: { value: '99999', steps: '' } } });
    const proWrongSubmit = await f.call(`/studio/quizzes/${fixedAfterResume.data.id}/submit`, 'POST', {});
    assert.equal(proWrongSubmit.status, 200);
    assert.ok(proWrongSubmit.data.weakSpotAlert);
    assert.equal(proWrongSubmit.data.weakSpotAlert.skillId, targetSkillId);

    // After a clean independent pass (score 100%), low-score alert clears automatically.
    const passState = await f.app.store.state(f.identities.student.id);
    passState.studio!.resumedAt = { [targetSkillId]: new Date(Date.now() + 1000).toISOString() };
    passState.studio!.attempts.push({
      id: 'att-pass',
      requestId: 'req-pass',
      itemId: 'item-pass',
      family: 'fam-pass',
      subjectId: 'maths',
      topicId: mathsUnit.topicId,
      skillId: targetSkillId,
      at: new Date(Date.now() + 2000).toISOString(),
      answer: '5',
      steps: '',
      independent: true,
      hinted: false,
      feedback: { verdict: 'correct', score: 100, text: 'Great', reason: 'Matched', source: 'code' },
      disputed: false,
      corrections: [],
    });
    assert.equal(detectWeakSpotAlert(passState, Date.now() + 3000), null);
  } finally { await f.close(); }
});
