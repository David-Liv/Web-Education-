import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createPilot } from './app.ts';
import { Billing, defaults, hkPeriod, periodEnd, initialPolicy, normalizeTokens, requestModelPurpose } from './billing.ts';
import { generate } from './models.ts';
import { units } from './studio-state.ts';

async function fixture() {
  let mode = 'text', calls = 0; const seenModels: string[] = [];
  const provider = createServer(async (req, res) => { let raw = ''; for await (const c of req) raw += c; const body = JSON.parse(raw); calls++; seenModels.push(body.model); res.setHeader('Content-Type', 'application/json');
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
  async function chat(requestId = crypto.randomUUID()) { const c = await call('/chats', 'POST', { topicId: units[0].topicId, mode: 'explain' }); return { id: c.data.id, requestId, send: (content = 'Explain this idea') => call(`/chats/${c.data.id}/messages`, 'POST', { content, requestId }) }; }
  return { app, config, call, chat, identities, billing: new Billing(app.store), mode: (m: string) => { mode = m; calls = 0; }, calls: () => calls, seenModels: () => [...seenModels], close: async () => { await app.close(); await new Promise<void>(r => provider.close(() => r())); } };
}

test('approved defaults and Hong Kong month boundaries are deterministic; absent tokens stay unknown', () => {
  const p = initialPolicy(); assert.deepEqual(Object.values(p.plans).map(p => p.credits), [500, 2000, 5000]); assert.deepEqual(defaults.map(m => p.models[m].credits), [2, 5, 20]); assert.ok(p.plans.Free.models.includes(defaults[1])); assert.ok(!p.plans.Free.models.includes(defaults[2])); assert.equal(p.models['pggo-抗截断-gemini-3.1-pro-preview'], undefined);
  assert.equal(hkPeriod(new Date('2026-11-30T15:59:59Z')), '2026-11'); assert.equal(hkPeriod(new Date('2026-11-30T16:00:00Z')), '2026-12'); assert.equal(periodEnd('2026-12'), '2026-12-31T16:00:00.000Z'); assert.deepEqual(normalizeTokens({}), { input: null, output: null, total: null });
});
test('mock checkout is owner-scoped and idempotent, grants only cap difference, and never calls AI', async () => { const f = await fixture(); try {
  const id = crypto.randomUUID(), o = await f.call('/billing/orders', 'POST', { target: 'Plus', requestId: id }); assert.equal(o.status, 201); assert.equal((await f.call('/billing/orders', 'POST', { target: 'Plus', requestId: id })).data.id, o.data.id);
  assert.equal((await f.call(`/billing/orders/${o.data.id}/pay`, 'POST', { channel: 'mock-card' }, 'other')).status, 404);
  const paid = await f.call(`/billing/orders/${o.data.id}/pay`, 'POST', { channel: 'mock-card', amount: 0 }); assert.equal(paid.data.status, 'mock-paid'); assert.equal((await f.call(`/billing/orders/${o.data.id}/pay`, 'POST', { channel: 'mock-card' })).data.paidAt, paid.data.paidAt);
  const b = (await f.call('/billing')).data; assert.equal(b.account.plan, 'Plus'); assert.equal(b.cap, 2000); assert.equal(b.orders.length, 1); assert.equal(f.calls(), 0); assert.match((await f.call(`/billing/orders/${o.data.id}/receipt`)).text, /NO REAL PAYMENT/); assert.equal((await f.call(`/billing/orders/${o.data.id}/receipt`, 'GET', undefined, 'other')).status, 404);
} finally { await f.close(); } });
test('server ignores client model override, captures once, replays SSE, and logs tokens without exposing response text', async () => { const f = await fixture(); try {
  const c = await f.chat(), first = await c.send(); assert.equal(first.status, 200); assert.match(first.text, /event: done/); assert.equal((await c.send()).text.includes('event: done'), true); assert.equal(f.calls(), 1);
  const b = (await f.call('/billing')).data; assert.equal(b.spent, 2); assert.equal(b.available, 498); assert.equal(b.held, 0); assert.equal(b.usage[0].tokens.total, 42);
  const list = (await f.call('/admin/usage', 'GET', undefined, 'owner')).data; assert.equal(list.total, 1); const l = list.rows[0]; assert.equal(l.model, defaults[0]); assert.deepEqual(l.request, { model: defaults[0], stream: false, msg_count: 2, chars: l.request.chars, has_tools: false, tools_count: 0, first_role: 'system', temperature: null, max_tokens: 2400 });
  const detail = await f.call('/admin/usage/' + l.id, 'GET', undefined, 'owner'); assert.equal('response' in detail.data, false); assert.ok(!detail.text.includes('Private response')); const exported = await f.call('/admin/usage/' + l.id + '/export', 'GET', undefined, 'owner'); assert.match(exported.data.response, /Private response/); assert.ok(!exported.text.includes('fixture-secret-key')); assert.match(exported.text, /REDACTED/);
  const raw = await f.app.store.db.prepare('SELECT content FROM ai_usage_logs WHERE id=?').get(l.id); assert.ok(!raw!.content.includes('Private response')); assert.equal((await f.call('/admin/usage', 'GET')).status, 403); assert.equal((await f.call('/admin/usage/export', 'GET', undefined, 'reviewer')).status, 403);
  assert.equal((await c.send('Different content')).status, 409); assert.equal(f.calls(), 1);
} finally { await f.close(); } });
test('upstream errors release credits and preserve HTTP code, redacted error, and unknown token values', async () => { const f = await fixture(); try {
  f.mode('error'); const c = await f.chat(); assert.equal((await c.send()).status, 200); const b = (await f.call('/billing')).data; assert.equal(b.spent, 0); assert.equal(b.available, 500); assert.equal(b.usage[0].status, 'released');
  const l = (await f.call('/admin/usage', 'GET', undefined, 'owner')).data.rows[0]; assert.equal(l.httpStatus, 503); assert.equal(l.error.type, 'UPSTREAM_ERROR'); assert.ok(!JSON.stringify(l).includes('fixture-secret-key')); assert.equal(l.tokens.total, null);
} finally { await f.close(); } });
test('insufficient balance and concurrent requests cannot overspend or make a second provider call', async () => { const f = await fixture(); try {
  const p = await f.billing.policy(); p.plans.Free.credits = 2; await f.billing.updatePolicy(f.identities.owner.id, p); f.mode('slow');
  const [a, b] = await Promise.all([f.chat(), f.chat()]); const results = await Promise.all([a.send(), b.send()]); assert.deepEqual(results.map(r => r.status).sort(), [200, 402]); assert.equal(f.calls(), 1); const v = await f.billing.view(f.identities.student.id); assert.equal(v.available, 0); assert.equal(v.spent, 2); assert.equal(v.held, 0);
  assert.equal((await f.call('/billing/model', 'PUT', { model: defaults[2] })).status, 403); assert.equal((await f.call('/billing/model', 'PUT', { model: defaults[1] })).status, 200);
} finally { await f.close(); } });
test('price and quota changes preserve operation snapshots; changing plan cannot refill prior spend', async () => { const f = await fixture(); try {
  await (await f.chat()).send(); let p = await f.billing.policy(); const old = structuredClone(p); p.models[defaults[0]].credits = 9; p.plans.Free.credits = 3; await f.billing.updatePolicy(f.identities.owner.id, p); assert.equal((await f.billing.view(f.identities.student.id)).available, 1); assert.equal((await f.billing.view(f.identities.student.id)).usage[0].cost, 2);
  await assert.rejects(f.billing.updatePolicy(f.identities.owner.id, old), /重新載入/); await f.billing.adminAccount(f.identities.owner.id, f.identities.student.id, 'Plus'); assert.equal((await f.billing.view(f.identities.student.id)).available, 1998); await f.billing.adminAccount(f.identities.owner.id, f.identities.student.id, 'Free'); assert.equal((await f.billing.view(f.identities.student.id)).available, 1);
} finally { await f.close(); } });
test('downgrade, cancellation and monthly reset use lazy Hong Kong boundaries without rollover', async () => { const f = await fixture(); try {
  let now = new Date('2026-11-15T04:00:00Z'); const b = new Billing(f.app.store, () => now); await b.adminAccount(f.identities.owner.id, f.identities.student.id, 'Pro'); const o = await b.order(f.identities.student.id, 'Plus', crypto.randomUUID()); assert.equal(o.amount, 0); await b.pay(f.identities.student.id, o.id, 'mock-fps'); assert.equal((await b.view(f.identities.student.id)).account.plan, 'Pro'); now = new Date('2026-11-30T16:00:00Z'); assert.equal((await b.view(f.identities.student.id)).account.plan, 'Plus'); assert.equal((await b.view(f.identities.student.id)).available, 2000); await b.subscription(f.identities.student.id, 'cancel'); assert.equal((await b.view(f.identities.student.id)).account.plan, 'Plus'); await b.subscription(f.identities.student.id, 'restore'); assert.equal((await b.view(f.identities.student.id)).account.pendingPlan, null); await b.subscription(f.identities.student.id, 'cancel'); now = new Date('2026-12-31T16:00:00Z'); assert.equal((await b.view(f.identities.student.id)).account.plan, 'Free');
} finally { await f.close(); } });
test('admin testing is logged as platform use, while normal admin learning uses the assigned plan', async () => { const f = await fixture(); try {
  assert.equal((await f.call('/admin/model/test', 'POST', {}, 'owner')).status, 200); const v = await f.billing.view(f.identities.owner.id); assert.equal(v.spent, 0); const row = (await f.call('/admin/usage', 'GET', undefined, 'owner')).data.rows[0]; assert.equal(row.plan, 'Platform'); assert.equal(row.credit, 0);
  assert.equal((await f.call('/admin/billing/policy', 'PUT', initialPolicy(), 'student')).status, 403); assert.equal((await f.call('/admin/billing/users', 'GET', undefined, 'reviewer')).status, 403);
} finally { await f.close(); } });
test('invalid quick exercise and final invalid assessment release credit; repairs charge once with every attempt logged', async () => { const f = await fixture(); try {
  f.mode('bad'); const create = (purpose: string) => f.call('/studio/quizzes', 'POST', { subjectId: 'maths', purpose, source: 'ai', count: 1, requestId: crypto.randomUUID() });
  assert.equal((await create('quick')).data.quiz, null); assert.equal((await f.call('/billing')).data.spent, 0); const invalid = await create('assessment'); assert.equal(invalid.status, 422); assert.equal(f.calls(), 4); assert.equal((await f.call('/billing')).data.spent, 0);
  f.mode('repair'); const repaired = await create('assessment'); assert.equal(repaired.status, 201, repaired.text); assert.equal(f.calls(), 2); const v = (await f.call('/billing')).data; assert.equal(v.spent, 2); assert.equal(v.held, 0); const logs = (await f.call('/admin/usage', 'GET', undefined, 'owner')).data.rows; assert.equal(logs.filter((l: any) => l.operationId === logs[0].operationId).length, 2);
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
    // Quick exercises use the conversation default, not the independent-quiz default.
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
    // The compatibility endpoint without a purpose changes conversations only.
    await f.call('/billing/model', 'PUT', {model:defaults[0]});
    assert.deepEqual((await f.call('/billing')).data.account.models, {...choices, chat:defaults[0]});
  } finally { await f.close(); }
});

test('forbidden model routes are rejected before any provider call, including admin tests and policy updates', async () => {
  const f = await fixture(); try {
    for (const model of ['bdgo-抗截断-gemini-3.8-flash', 'bdgo-gemini-3.8-flash', 'pggo-gemini-3.8-flash', 'gemini-3.8-flash']) {
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

test('legacy settings migrate without erasing usage and new accounts inherit each plan-purpose default', async () => {
  const f = await fixture(); try {
    await (await f.chat()).send();
    const policy=initialPolicy(); policy.version=78;
    policy.models['bdgo-gemini-4-argon']={enabled:true,credits:20};
    policy.plans.Pro.models.push('bdgo-gemini-4-argon'); policy.plans.Pro.defaultModel='bdgo-gemini-4-argon';
    await f.app.store.db.prepare("INSERT INTO settings VALUES('billing-policy',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(JSON.stringify(policy));
    const old=(await f.call('/billing')).data.account; delete old.models;old.plan='Pro';old.model='bdgo-gemini-4-argon';
    await f.app.store.db.prepare('UPDATE billing_accounts SET body=? WHERE user_id=?').run(JSON.stringify(old),f.identities.student.id);
    const view=(await f.call('/billing')).data;
    assert.deepEqual(view.account.models,{quiz:defaults[2],chat:defaults[2],evaluation:defaults[2]});
    assert.equal(view.spent,2);assert.equal(view.cap,5000);assert.equal(view.usage[0].model,defaults[0]);
    assert.ok(Object.keys(view.policy.models).every(m=>m.startsWith('pggo-抗截断-')));
    assert.ok(!view.policy.plans.Pro.models.includes('bdgo-gemini-4-argon'));
    const p=await f.billing.policy();p.plans.Free.defaultModels={quiz:defaults[1],chat:defaults[0],evaluation:defaults[1]};
    await f.billing.updatePolicy(f.identities.owner.id,p);
    const inherited=(await f.call('/billing','GET',undefined,'other')).data.account.models;
    assert.deepEqual(inherited,p.plans.Free.defaultModels);
    await f.call('/billing/model','PUT',{purpose:'evaluation',model:defaults[0]},'other');
    assert.deepEqual((await f.call('/billing','GET',undefined,'other')).data.account.models,{...inherited,evaluation:defaults[0]});
  } finally { await f.close(); }
});
