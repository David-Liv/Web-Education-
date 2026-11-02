import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type { Store, ModelConfig } from './store.ts';
import type { Identity } from '../src/pilot-types.ts';
import type { BillingPolicy, BillingAccount, BillingOrder, BillingView, PlanId, CreditUsage, UsageLog, TokenUsage } from '../src/billing-types.ts';
import { reject } from './learning.ts';
import { isAllowedModel, modelDisplayName, modelPurposes } from '../src/model-catalog.ts';
import type { ModelPurpose } from '../src/model-catalog.ts';

const plans: PlanId[] = ['Free', 'Plus', 'Pro'];
export const defaults = ['pggo-抗截断-gemini-3.5-flash-lite', 'pggo-抗截断-gemini-3.8-flash', 'pggo-抗截断-gemini-4-argon'];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function hkPeriod(now = new Date()) { return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 7); }
export function periodEnd(period: string) { const [y, m] = period.split('-').map(Number); return new Date(Date.UTC(y, m, 1) - 8 * 3600000).toISOString(); }
const emptyTokens = (): TokenUsage => ({ input: null, output: null, total: null });
export function initialPolicy(): BillingPolicy {
  const models: BillingPolicy['models'] = {};
  for (const suffix of ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-4-argon']) models['pggo-抗截断-' + suffix] = { credits: suffix.includes('lite') ? 2 : suffix.includes('argon') ? 20 : 5, enabled: true };
  const light = Object.keys(models).filter(id => !id.includes('argon'));
  return { version: 1, models, plans: { Free: { price: 0, credits: 500, models: light, defaultModel: defaults[0] }, Plus: { price: 39, credits: 2000, models: light, defaultModel: defaults[1] }, Pro: { price: 79, credits: 5000, models: Object.keys(models), defaultModel: defaults[2] } } };
}
const purposeModels = (model: string) => ({ quiz: model, chat: model, evaluation: model });
const counterpart = (model: string) => 'pggo-抗截断-' + modelDisplayName(model);
export function requestModelPurpose(path: string, input: any): ModelPurpose {
  if (path === '/studio/quizzes' && input?.purpose === 'assessment') return 'quiz';
  if (path.endsWith('/submit') || path.endsWith('/analyse')) return 'evaluation';
  return 'chat'; // Chat, guided/quick exercises and plan explanations stay on the fast path.
}
function permitted(policy: BillingPolicy, plan: PlanId, model: string) {
  return isAllowedModel(model) && policy.plans[plan].models.includes(model) && !!policy.models[model]?.enabled;
}
function planDefault(policy: BillingPolicy, plan: PlanId, purpose: ModelPurpose) {
  return policy.plans[plan].defaultModels?.[purpose] ?? policy.plans[plan].defaultModel;
}
// Old JSON settings need no DDL migration. Preserve prices/quotas and historical ledgers.
export function migrateModelPolicy(input: BillingPolicy): BillingPolicy {
  const p = structuredClone(input);
  p.models = Object.fromEntries(Object.entries(p.models).filter(([id]) => isAllowedModel(id)));
  for (const id of plans) {
    const rule = p.plans[id];
    rule.models = [...new Set(rule.models.map(m => isAllowedModel(m) ? m : counterpart(m)))].filter(m => p.models[m]?.enabled);
    const pick = (model: string) => {
      const m = isAllowedModel(model) ? model : counterpart(model);
      return rule.models.includes(m) ? m : rule.models[0] ?? '';
    };
    rule.defaultModels = Object.fromEntries(modelPurposes.map(k => [k, pick(rule.defaultModels?.[k] ?? rule.defaultModel)])) as Record<ModelPurpose, string>;
    rule.defaultModel = rule.defaultModels.chat;
  }
  return p;
}
export function redact(text: string, secret = '') {
  if (secret) text = text.split(secret).join('[REDACTED]');
  return text.replace(/\b(?:sk-[\w-]{8,}|sb_secret_[\w-]+)\b/gi, '[REDACTED]').replace(/((?:authorization|api[_ -]?key|cookie|set-cookie)\s*["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\r\n,}]+)/gi, '$1[REDACTED]').replace(/Bearer\s+[\w.+/=-]+/gi, 'Bearer [REDACTED]');
}
export function normalizeTokens(value: any): TokenUsage {
  const n = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
  return { input: n(value?.prompt_tokens ?? value?.input_tokens), output: n(value?.completion_tokens ?? value?.output_tokens), total: n(value?.total_tokens) };
}
function combinedTokens(logs: UsageLog[]): TokenUsage {
  const sum = (key: keyof TokenUsage) => logs.length && logs.every(l => l.tokens[key] !== null) ? logs.reduce((s, l) => s + l.tokens[key]!, 0) : null;
  return { input: sum('input'), output: sum('output'), total: sum('total') };
}
interface Operation extends CreditUsage { signature: string; result?: string; source: { path: string; requestId: string }; platform: boolean }
interface UsageContext { billing: Billing; identity: Identity; id: string; signature: string; source: Operation['source']; modelPurpose: ModelPurpose; platform: boolean; op?: Operation; logs: UsageLog[]; discarded: boolean; completed: boolean; signal: AbortSignal }
const context = new AsyncLocalStorage<UsageContext>();
export function discardUsage() { const ctx = context.getStore(); if (ctx) ctx.discarded = true; }
export async function usageModel(config: ModelConfig): Promise<ModelConfig> {
  const ctx = context.getStore(); if (!ctx || ctx.platform) return config;
  if (ctx.op) return { ...config, model: ctx.op.model };
  const view = await ctx.billing.view(ctx.identity.id);
  const model = view.account.models[ctx.modelPurpose];
  return { ...config, model };
}
export async function beginProvider(config: ModelConfig) {
  const ctx = context.getStore(); if (!ctx) return { config, signal: undefined };
  config = await usageModel(config);
  if (!isAllowedModel(config.model)) reject('只可使用抗截斷模型；此模型不可用', 403, 'MODEL_NOT_ALLOWED');
  if (!ctx.op) ctx.op = await ctx.billing.reserve(ctx, config.model);
  return { config: { ...config, model: ctx.op.model }, signal: ctx.signal };
}
export async function recordProvider(log: Omit<UsageLog, 'id' | 'userId' | 'username' | 'name' | 'operationId' | 'plan' | 'purpose'>, content: string, secret: string) {
  const ctx = context.getStore(); if (!ctx || !ctx.op) return;
  const row: UsageLog = { ...log, id: crypto.randomUUID(), userId: ctx.identity.id, username: ctx.identity.username, name: ctx.identity.name, operationId: ctx.id, plan: ctx.op.plan, purpose: ctx.op.purpose, error: log.error ? { ...log.error, message: redact(log.error.message, secret).slice(0, 2000) } : null };
  ctx.logs.push(row); await ctx.billing.log(row, redact(content, secret));
}
export async function finishUsage(result: unknown, status = 200) {
  const ctx = context.getStore(); if (!ctx || ctx.completed || !ctx.op) return;
  const usable = status < 400 && !ctx.discarded && ctx.logs.some(l => l.status === 'success');
  await ctx.billing.settle(ctx.identity.id, ctx.id, usable, result, ctx.logs, usable ? undefined : 'No usable AI result delivered'); ctx.completed = true;
}
// Store.save calls this inside the same short transaction as the learning result.
// A crash after commit can lose the replay cache, but cannot refund a saved result.
export async function checkpointUsage(store: Store, userId: string) {
  const ctx = context.getStore();
  if (!ctx || ctx.billing.store !== store || ctx.identity.id !== userId || !ctx.op || ctx.discarded || ctx.signal.aborted || !ctx.logs.some(l => l.status === 'success')) return;
  const row = await store.db.prepare('SELECT body FROM credit_operations WHERE id=? AND user_id=?').get(ctx.id, userId);
  if (!row) return; const op: Operation = JSON.parse(row.body); if (op.status !== 'held') return;
  op.status = 'charged'; op.updatedAt = ctx.billing.now().toISOString(); op.tokens = combinedTokens(ctx.logs); op.reason = 'Learning result saved atomically';
  await store.db.prepare('UPDATE credit_operations SET status=?,body=? WHERE id=?').run(op.status, JSON.stringify(op), ctx.id);
}
export class Billing {
  store: Store; now: () => Date;
  constructor(store: Store, now = () => new Date()) { this.store = store; this.now = now; }
  async policy(): Promise<BillingPolicy> { const row = await this.store.db.prepare("SELECT body FROM settings WHERE id='billing-policy'").get(); return migrateModelPolicy(row ? JSON.parse(row.body) : initialPolicy()); }
  private async audit(actor: string, action: string, before: unknown, after: unknown) { await this.store.db.prepare('INSERT INTO billing_audit VALUES(?,?,?,?)').run(crypto.randomUUID(), actor, this.now().toISOString(), JSON.stringify({ action, before, after })); }
  private async account(userId: string): Promise<BillingAccount> {
    const stamp = this.now().toISOString(), period = hkPeriod(this.now());
    const initial: BillingAccount = { plan: 'Free', period, renewal: true, pendingPlan: null, model: '', models: purposeModels(''), updatedAt: stamp };
    await this.store.db.prepare('INSERT INTO billing_accounts VALUES(?,?) ON CONFLICT DO NOTHING').run(userId, JSON.stringify(initial));
    const row = await this.store.db.prepare('SELECT body FROM billing_accounts WHERE user_id=?' + (this.store.db.kind === 'postgres' ? ' FOR UPDATE' : '')).get(userId);
    const account: BillingAccount = JSON.parse(row!.body);
    if (account.period !== period) { account.plan = account.pendingPlan ?? (account.renewal ? account.plan : 'Free'); account.period = period; account.pendingPlan = null; account.renewal = true; account.model = ''; account.models = purposeModels(''); account.updatedAt = stamp; await this.saveAccount(userId, account); }
    return account;
  }
  private async saveAccount(id: string, account: BillingAccount) { await this.store.db.prepare('UPDATE billing_accounts SET body=? WHERE user_id=?').run(JSON.stringify(account), id); }
  private async operations(userId: string, period?: string): Promise<Operation[]> { const rows = await this.store.db.prepare('SELECT body FROM credit_operations WHERE user_id=?' + (period ? ' AND period=?' : '') + ' ORDER BY created_at DESC').all(...(period ? [userId, period] : [userId])); return rows.map(r => JSON.parse(r.body)); }
  private async putOperation(op: Operation, userId: string) { await this.store.db.prepare('INSERT INTO credit_operations VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,body=excluded.body').run(op.id, userId, op.period, op.status, op.createdAt, JSON.stringify(op)); }
  private async recover(userId: string) {
    const stale = (await this.operations(userId)).filter(o => o.status === 'held' && Date.parse(o.createdAt) < this.now().getTime() - 5 * 60000);
    if (!stale.length) return;
    for (const op of stale) {
      op.status = 'released'; op.updatedAt = this.now().toISOString(); op.reason = 'Expired reservation; no committed delivery checkpoint';
      await this.putOperation(op, userId);
    }
  }
  async view(userId: string): Promise<BillingView> {
    return this.store.transaction(async () => {
      const account = await this.account(userId); await this.recover(userId); const policy = await this.policy(); const rule = policy.plans[account.plan];
      const before = JSON.stringify(account);
      // Migrate the previous shared selection to all three purposes once.
      const selected = account.models ?? purposeModels(account.model);
      account.models = Object.fromEntries(modelPurposes.map(k => {
        const m = selected[k] ?? '', mapped = isAllowedModel(m) ? m : counterpart(m);
        return [k, permitted(policy, account.plan, mapped) ? mapped : planDefault(policy, account.plan, k)];
      })) as Record<ModelPurpose, string>;
      account.model = account.models.chat; // Legacy read-only alias for older clients.
      if (JSON.stringify(account) !== before) await this.saveAccount(userId, account);
      const ops = await this.operations(userId, account.period), spent = ops.filter(o => o.status === 'charged' && !o.platform).reduce((s, o) => s + o.cost, 0), held = ops.filter(o => o.status === 'held' && !o.platform).reduce((s, o) => s + o.cost, 0);
      const orders = (await this.store.db.prepare('SELECT body FROM billing_orders WHERE user_id=? ORDER BY created_at DESC').all(userId)).map(r => JSON.parse(r.body));
      const usage = ops.slice(0, 100).map(({ signature, result, source, platform, ...op }) => op);
      return { account, policy, spent, held, available: Math.max(0, rule.credits - spent - held), cap: rule.credits, resetsAt: periodEnd(account.period), usage, orders: orders.slice(0, 100) };
    });
  }
  async selectModel(userId: string, model: string, purpose: ModelPurpose = 'chat') {
    if (!modelPurposes.includes(purpose)) reject('請選擇有效的模型用途');
    if (!isAllowedModel(model)) reject('只可使用抗截斷模型；此模型不可用', 403, 'MODEL_NOT_ALLOWED');
    return this.store.transaction(async () => {
      const { account: a, policy: p } = await this.view(userId);
      if (!permitted(p, a.plan, model)) reject('此套餐未開放這個模型', 403, 'MODEL_NOT_ALLOWED');
      a.models[purpose] = model; a.model = a.models.chat; a.updatedAt = this.now().toISOString();
      await this.saveAccount(userId, a); return { ok: true };
    });
  }
  async updatePolicy(actor: string, input: BillingPolicy) {
    if (!input || !input.plans || !input.models || Object.keys(input.models).length > 1000) reject('套餐設定格式無效');
    for (const [id, rule] of Object.entries(input.models)) {
      if (!isAllowedModel(id)) reject('只可使用抗截斷模型；此模型不可用', 403, 'MODEL_NOT_ALLOWED');
      if (id.length > 200 || !Number.isInteger(rule.credits) || rule.credits < 1 || rule.credits > 100000 || typeof rule.enabled !== 'boolean') reject('模型單價需為正整數');
    }
    for (const id of plans) { const p = input.plans[id]; if (!p || !Number.isInteger(p.credits) || p.credits < 0 || p.credits > 10000000 || !Number.isFinite(p.price) || p.price < 0 || p.price > 100000 || !Array.isArray(p.models) || !p.models.length || p.models.some(m => !input.models[m]?.enabled) || new Set(p.models).size !== p.models.length || !p.models.includes(p.defaultModel)) reject('請檢查套餐額度、價格、開放模型與預設模型'); }
    if (input.plans.Free.price !== 0) reject('Free 套餐價格必須為零');
    for (const id of plans) {
      const rule = input.plans[id];
      if (rule.defaultModels && modelPurposes.some(k => !rule.models.includes(rule.defaultModels![k]))) reject('請為每個用途選擇套餐允許的預設模型');
    }
    return this.store.transaction(async () => { if(this.store.db.kind==='postgres')await this.store.db.exec('SELECT pg_advisory_xact_lock(1784236904)'); const old = await this.policy(); if (input.version !== old.version) reject('設定已更新，請重新載入', 409, 'STALE_POLICY'); const next = migrateModelPolicy({ version: old.version + 1, plans: input.plans, models: input.models }); await this.store.db.prepare("INSERT INTO settings VALUES('billing-policy',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(JSON.stringify(next)); await this.audit(actor, 'policy', old, next); return next; });
  }
  async adminAccount(actor: string, userId: string, plan: PlanId) { if (!plans.includes(plan)) reject('套餐無效'); if (!await this.store.db.prepare('SELECT id FROM users WHERE id=?').get(userId)) reject('帳戶不存在', 404); return this.store.transaction(async () => { const before = await this.account(userId), next = { ...before, plan, pendingPlan: null, renewal: true, model: '', models: purposeModels(''), updatedAt: this.now().toISOString() }; await this.saveAccount(userId, next); await this.audit(actor, 'account:' + userId, before, next); return { ok: true }; }); }
  async subscription(userId: string, action: string) { return this.store.transaction(async () => { const a = await this.account(userId); if (action === 'cancel') { a.renewal = false; a.pendingPlan = 'Free'; } else if (action === 'restore') { a.renewal = true; a.pendingPlan = null; } else reject('訂閱操作無效'); a.updatedAt = this.now().toISOString(); await this.saveAccount(userId, a); await this.audit(userId, action, null, a); return { ok: true }; }); }
  async order(userId: string, target: PlanId, requestId: string) {
    if (!plans.includes(target) || !/^[\w-]{8,80}$/.test(requestId)) reject('套餐或訂單請求 ID 無效');
    return this.store.transaction(async () => {
      const a = await this.account(userId), policy = await this.policy(), old = await this.store.db.prepare('SELECT body FROM billing_orders WHERE user_id=? AND request_key=?').get(userId, requestId);
      if (old) { const o = JSON.parse(old.body); if (o.target !== target) reject('訂單請求 ID 已被使用', 409); return o; }
      if (a.plan === target) reject('目前已使用此套餐');
      const now = this.now(), start = new Date(a.period + '-01T00:00:00+08:00').getTime(), end = Date.parse(periodEnd(a.period));
      const upgrade = plans.indexOf(target) > plans.indexOf(a.plan);
      const order: BillingOrder = { id: crypto.randomUUID(), requestId, target, from: a.plan, amount: upgrade ? Math.round(Math.max(0, policy.plans[target].price - policy.plans[a.plan].price) * (end - now.getTime()) / (end - start) * 100) / 100 : 0, currency: 'HKD', status: 'pending', channel: null, createdAt: now.toISOString(), period: a.period, effectiveAt: upgrade ? now.toISOString() : periodEnd(a.period), credits: policy.plans[target].credits, policyVersion: policy.version, simulation: true };
      await this.store.db.prepare('INSERT INTO billing_orders VALUES(?,?,?,?,?,?)').run(order.id, userId, requestId, order.status, order.createdAt, JSON.stringify(order)); return order;
    });
  }
  async pay(userId: string, id: string, channel: string) {
    if (!['mock-card', 'mock-alipay', 'mock-fps'].includes(channel)) reject('請選擇模擬付款渠道');
    return this.store.transaction(async () => {
      const a = await this.account(userId), row = await this.store.db.prepare('SELECT body FROM billing_orders WHERE id=? AND user_id=?' + (this.store.db.kind === 'postgres' ? ' FOR UPDATE' : '')).get(id, userId); if (!row) reject('訂單不存在', 404);
      const o: BillingOrder = JSON.parse(row!.body); if (o.status !== 'pending') return o;
      if (o.period !== a.period || o.from !== a.plan || Date.parse(o.createdAt) < this.now().getTime() - 30 * 60000 || (await this.policy()).version !== o.policyVersion) reject('訂單已過期或套餐設定已更新，請重新確認', 409, 'STALE_ORDER');
      const upgrade = plans.indexOf(o.target) > plans.indexOf(a.plan); const before = { ...a };
      if (upgrade) { a.plan = o.target; a.model = ''; a.models = purposeModels(''); a.pendingPlan = null; a.renewal = true; } else { a.pendingPlan = o.target; a.renewal = true; }
      a.updatedAt = this.now().toISOString(); o.status = upgrade ? 'mock-paid' : 'scheduled'; o.channel = channel; o.paidAt = a.updatedAt;
      await this.saveAccount(userId, a); await this.store.db.prepare('UPDATE billing_orders SET status=?,body=? WHERE id=?').run(o.status, JSON.stringify(o), id); await this.audit(userId, 'mock-checkout', before, { account: a, order: o }); return o;
    });
  }
  async reserve(ctx: UsageContext, model: string): Promise<Operation> {
    return this.store.transaction(async () => {
      if (!isAllowedModel(model)) reject('只可使用抗截斷模型；此模型不可用', 403, 'MODEL_NOT_ALLOWED');
      const a = await this.account(ctx.identity.id); await this.recover(ctx.identity.id); const p = await this.policy(), rule = p.models[model];
      const oldRow = await this.store.db.prepare('SELECT body FROM credit_operations WHERE id=?').get(ctx.id), old: Operation | undefined = oldRow ? JSON.parse(oldRow.body) : undefined;
      if (old && old.signature !== ctx.signature) reject('AI 請求 ID 已用於不同內容', 409, 'REQUEST_CONFLICT');
      if (old?.status === 'held') reject('此 AI 操作仍在處理，請稍候', 409, 'AI_IN_PROGRESS');
      if (old?.status === 'charged') reject('此操作已完成，請重新載入學習記錄', 409, 'AI_ALREADY_DELIVERED');
      if (!ctx.platform && (!p.plans[a.plan].models.includes(model) || !rule?.enabled)) reject('此套餐未開放這個模型', 403, 'MODEL_NOT_ALLOWED');
      const cost = ctx.platform ? 0 : rule.credits, ops = await this.operations(ctx.identity.id, a.period), committed = ops.filter(o => o.status !== 'released' && !o.platform).reduce((sum, o) => sum + o.cost, 0);
      if (!ctx.platform && committed + cost > p.plans[a.plan].credits) reject('AI credit 不足；請等待下月重置或選擇其他套餐', 402, 'INSUFFICIENT_CREDITS');
      const stamp = this.now().toISOString(), op: Operation = { id: ctx.id, period: a.period, status: 'held', cost, createdAt: stamp, updatedAt: stamp, purpose: ctx.source.path, model, plan: ctx.platform ? 'Platform' : a.plan, signature: ctx.signature, tokens: emptyTokens(), source: ctx.source, platform: ctx.platform };
      await this.putOperation(op, ctx.identity.id); return op;
    });
  }
  async settle(userId: string, id: string, success: boolean, result: unknown, logs: UsageLog[], reason?: string) {
    await this.store.transaction(async () => { await this.account(userId); const row = await this.store.db.prepare('SELECT body FROM credit_operations WHERE id=? AND user_id=?').get(id, userId); if (!row) return; const op: Operation = JSON.parse(row.body); if (op.status === 'released' || op.status === 'charged' && (!success || op.result)) return; op.status = success ? 'charged' : 'released'; op.updatedAt = this.now().toISOString(); op.tokens = combinedTokens(logs); op.reason = reason; if (success) op.result = this.store.encrypt(JSON.stringify(result)); await this.putOperation(op, userId); });
  }
  async log(row: UsageLog, content: string) {
    await this.store.db.prepare('INSERT INTO ai_usage_logs VALUES(?,?,?,?,?,?,?)').run(row.id, row.userId, row.operationId, row.at, row.status, JSON.stringify(row), this.store.encrypt(content.slice(0, 30000)));
    await this.prune();
  }
  private async prune() {
    await this.store.db.prepare('DELETE FROM ai_usage_logs WHERE started_at<?').run(new Date(this.now().getTime() - 30 * 86400000).toISOString());
    await this.store.db.exec('DELETE FROM ai_usage_logs WHERE id IN (SELECT id FROM ai_usage_logs ORDER BY started_at DESC,id DESC LIMIT 100000000 OFFSET 1000)');
  }
  async logs(query: URLSearchParams, exportContent = false) {
    await this.prune();
    const search = (query.get('q') ?? '').toLowerCase().slice(0, 200), status = query.get('status'), from = query.get('from'), to = query.get('to');
    if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) reject('日期格式無效');
    const rows = await this.store.db.prepare(`SELECT l.body,${exportContent?'l.content,':''}o.status AS settlement,o.body AS operation FROM ai_usage_logs l LEFT JOIN credit_operations o ON o.id=l.operation_id ORDER BY l.started_at DESC,l.id DESC LIMIT 1000`).all();
    const all = rows.map(row => { const l: UsageLog = JSON.parse(row.body), op = row.operation ? JSON.parse(row.operation) : null; return { ...l, settlement: row.settlement, credit: op?.cost ?? 0, ...(exportContent ? { response: this.store.decrypt(row.content) } : {}) }; }).filter(l => (!search || `${l.name} ${l.username} ${l.model}`.toLowerCase().includes(search)) && (!status || status === 'all' || l.status === status));
    // Compare instants, so the date controls consistently use Hong Kong time.
    const filtered = all.filter(l => (!from || Date.parse(l.at) >= Date.parse(from + 'T00:00:00+08:00')) && (!to || Date.parse(l.at) < Date.parse(to + 'T00:00:00+08:00') + 86400000));
    const page = Math.max(1, Math.min(100000, Number(query.get('page')) || 1)), size = 20;
    return { total: filtered.length, page, rows: exportContent ? filtered : filtered.slice((page - 1) * size, page * size) };
  }
  async logDetail(id: string, exportContent = false) {
    await this.prune();
    const item = await this.store.db.prepare('SELECT body,content,operation_id FROM ai_usage_logs WHERE id=?').get(id);
    if (!item) reject('日誌不存在或已過保留期', 404);
    const op = await this.store.db.prepare('SELECT status,body FROM credit_operations WHERE id=?').get(item.operation_id);
    return { ...JSON.parse(item.body), settlement: op?.status, credit: op ? JSON.parse(op.body).cost : 0, ...(exportContent ? { response: this.store.decrypt(item.content) } : {}) };
  }
  async run(identity: Identity, path: string, input: any, key: string, signal: AbortSignal, work: (send: (data: unknown, status?: number) => void) => Promise<void>, deliver: (data: any, status: number) => void) {
    const requestId = String(input.requestId ?? input.previewId ?? key), id = hash(identity.id + ':' + path + ':' + requestId), signature = hash(JSON.stringify(input));
    const previous = await this.store.db.prepare('SELECT body FROM credit_operations WHERE id=? AND user_id=?').get(id, identity.id);
    if (previous) { const op: Operation = JSON.parse(previous.body); if(op.status==='held'&&Date.parse(op.createdAt)>this.now().getTime()-5*60000)reject('此 AI 操作仍在處理，請稍候',409,'AI_IN_PROGRESS'); if (op.signature !== signature) reject('AI 請求 ID 已用於不同內容', 409, 'REQUEST_CONFLICT'); if (op.status === 'charged' && op.result) { const saved = JSON.parse(this.store.decrypt(op.result)); deliver(saved.data, saved.status); return; } }
    const ctx: UsageContext = { billing: this, identity, id, signature, source: { path, requestId }, modelPurpose: requestModelPurpose(path, input), platform: path === '/admin/model/test', logs: [], discarded: false, completed: false, signal };
    await context.run(ctx, async () => { let response: { data: unknown; status: number } | undefined; try { await work((data, status = 200) => { response = { data, status }; }); if (response) { await finishUsage(response, response.status); deliver(response.data, response.status); } } catch (e) { if (ctx.op && !ctx.completed) await this.settle(identity.id, id, false, null, ctx.logs, (e as Error).message); throw e; } });
  }
}
