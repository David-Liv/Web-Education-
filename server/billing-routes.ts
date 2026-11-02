import type { ServerResponse } from 'node:http';
import type { Identity } from '../src/pilot-types.ts';
import type { BillingPolicy, PlanId } from '../src/billing-types.ts';
import { Billing } from './billing.ts';
import { reject } from './learning.ts';
import { isAllowedModel } from '../src/model-catalog.ts';

export async function billingRoutes(billing: Billing, identity: Identity, path: string, method: string, input: any, query: URLSearchParams, send: (data: unknown, status?: number) => void, res: ServerResponse) {
  if (!path.startsWith('/billing') && !path.startsWith('/admin/billing') && !path.startsWith('/admin/usage')) return false;
  if (path.startsWith('/admin/') && identity.role !== 'developer') reject('此功能僅供管理員使用', 403, 'FORBIDDEN');
  const download = (value: unknown, name: string, jsonl = false) => { res.writeHead(200, { 'Content-Type': jsonl ? 'application/x-ndjson; charset=utf-8' : 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(jsonl ? (value as unknown[]).map(v => JSON.stringify(v)).join('\n') + '\n' : JSON.stringify(value, null, 2)); };
  if (path === '/billing' && method === 'GET') send(await billing.view(identity.id));
  else if (path === '/billing/model' && method === 'PUT') send(await billing.selectModel(identity.id, String(input.model), input.purpose));
  else if (path === '/billing/subscription' && method === 'POST') send(await billing.subscription(identity.id, input.action));
  else if (path === '/billing/orders' && method === 'POST') send(await billing.order(identity.id, input.target, input.requestId), 201);
  else if (/^\/billing\/orders\/[^/]+\/pay$/.test(path) && method === 'POST') send(await billing.pay(identity.id, path.split('/')[3], input.channel));
  else if (/^\/billing\/orders\/[^/]+\/receipt$/.test(path) && method === 'GET') { const order = (await billing.view(identity.id)).orders.find(o => o.id === path.split('/')[3]); if (!order) reject('訂單不存在', 404); download({ notice: 'SIMULATION ONLY — NO REAL PAYMENT / 模擬交易，未真實收費', account: { name: identity.name, username: identity.username }, order }, `hokse-mock-receipt-${order!.id}.json`); }
  else if (path === '/admin/billing/policy' && method === 'GET') { const provider = await billing.store.model(); send({ policy: await billing.policy(), discoveredModels: (provider?.models ?? []).filter(isAllowedModel) }); }
  else if (path === '/admin/billing/policy' && method === 'PUT') send(await billing.updatePolicy(identity.id, input as BillingPolicy));
  else if (path === '/admin/billing/users' && method === 'GET') { const users = await billing.store.db.prepare('SELECT id,name,username,role FROM users ORDER BY username').all(); const result = []; for (const user of users) { const view = await billing.view(user.id); result.push({ ...user, ...view.account, spent: view.spent, held: view.held, available: view.available }); } send(result); }
  else if (/^\/admin\/billing\/users\/[^/]+$/.test(path) && method === 'PATCH') send(await billing.adminAccount(identity.id, path.split('/')[4], input.plan as PlanId));
  else if (path === '/admin/billing/audit' && method === 'GET') send((await billing.store.db.prepare('SELECT actor_id,created_at,body FROM billing_audit ORDER BY created_at DESC LIMIT 100').all()).map(r => ({ actorId: r.actor_id, at: r.created_at, ...JSON.parse(r.body) })));
  else if (path === '/admin/usage' && method === 'GET') send(await billing.logs(query));
  else if (path === '/admin/usage/export' && method === 'GET') download((await billing.logs(query, true)).rows, 'hokse-ai-usage.jsonl', true);
  else if (/^\/admin\/usage\/[^/]+\/export$/.test(path) && method === 'GET') download(await billing.logDetail(path.split('/')[3], true), `hokse-ai-${path.split('/')[3]}.json`);
  else if (/^\/admin\/usage\/[^/]+$/.test(path) && method === 'GET') send(await billing.logDetail(path.split('/')[3]));
  else reject('找不到此套餐接口', 404);
  return true;
}
