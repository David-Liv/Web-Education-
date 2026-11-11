import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { passwordHash, passwordMatches } from './store.ts';
import type { Store } from './store.ts';
import type { Identity } from '../src/pilot-types.ts';
import { reject } from './learning.ts';

export type RegistrationMode = 'closed' | 'passcode' | 'open';
export type OtpPurpose = 'register' | 'reset' | 'bind';

export interface AuthMailConfig {
  senderName: string;
  webhookUrl: string;
  secret: string;
  enabled: boolean;
  mode: RegistrationMode;
  passcode: string;
  tested?: { at: string; to: string; ok: boolean; remainingDailyQuota?: number };
}

export interface PublicAuthMailConfig {
  senderName: string;
  webhookUrl: string;
  enabled: boolean;
  mode: RegistrationMode;
  hasSecret: boolean;
  hasPasscode: boolean;
  tested?: { at: string; to: string; ok: boolean; remainingDailyQuota?: number };
  gasTemplate: string;
}

interface BoundEmailRecord {
  userId: string;
  email: string;
  normalized: string;
  verifiedAt: string;
}

interface OtpChallenge {
  purpose: OtpPurpose;
  email: string;
  normalized: string;
  codeHash: string;
  sentAt: number;
  expiresAt: number;
  attempts: number;
  windowStart: number;
  sentCountInWindow: number;
}

const CONFIG_KEY = 'auth-mail:config';
const USER_EMAIL_PREFIX = 'auth-mail:user:';
const EMAIL_INDEX_PREFIX = 'auth-mail:email:';
const OTP_PREFIX = 'auth-mail:otp:';

const OTP_COOLDOWN_MS = 60_000;
const OTP_TTL_MS = 10 * 60_000;
const OTP_WINDOW_MS = 60 * 60_000;
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;

const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'mailinator.com',
  'yopmail.com',
  'sharklasers.com',
  'trashmail.com',
  'getnada.com',
  'maildrop.cc',
  'dispostable.com',
  'throwawaymail.com',
  'fakeinbox.com',
  'mohmal.com',
]);

export const GAS_WEBHOOK_TEMPLATE = `// Google Apps Script (script.google.com) — 學序 HOKSE 電郵驗證碼發信服務
// 1. 貼上此程式碼並填入下方 SHARED_SECRET（與學序管理後台的共享密鑰一致）
// 2. 點選右上角「部署 → 新增部署作業」，類型選「網頁應用程式 (Web App)」
// 3. 執行身分選「我 (Me)」，誰可以存取選「所有人 (Anyone)」，部署後複製 /exec 網址到學序後台

const SHARED_SECRET = '請替換為你的共享密鑰';

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!SHARED_SECRET || data.secret !== SHARED_SECRET) {
      return json({ ok: false, error: 'SHARED_SECRET_MISMATCH' });
    }
    if (!data.to || !data.subject || !data.text) {
      return json({ ok: false, error: 'MISSING_FIELDS' });
    }
    MailApp.sendEmail({
      to: String(data.to),
      subject: String(data.subject),
      body: String(data.text),
      name: String(data.senderName || '學序 HOKSE'),
      htmlBody: data.html ? String(data.html) : undefined,
    });
    return json({ ok: true, remainingDailyQuota: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  }
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}`;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const bufA = createHash('sha256').update(a).digest();
  const bufB = createHash('sha256').update(b).digest();
  return timingSafeEqual(bufA, bufB) && a.length === b.length;
}

export function normalizeEmail(raw: unknown): { email: string; normalized: string } {
  const clean = String(raw ?? '').trim().toLowerCase();
  const atIndex = clean.indexOf('@');
  if (clean.length < 5 || clean.length > 120 || atIndex <= 0 || atIndex !== clean.lastIndexOf('@')) {
    reject('請填寫有效的電郵地址');
  }
  const local = clean.slice(0, atIndex);
  const domain = clean.slice(atIndex + 1);
  const domainLabels = domain.split('.');
  if (
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
    domainLabels.length < 2 ||
    domainLabels.at(-1)!.length < 2 ||
    domainLabels.some(part => !part || part.startsWith('-') || part.endsWith('-') || !/^[a-z0-9-]+$/.test(part))
  ) {
    reject('請填寫有效的電郵地址');
  }
  for (const blocked of DISPOSABLE_DOMAINS) {
    if (domain === blocked || domain.endsWith('.' + blocked)) {
      reject('不支援使用臨時或一次性電郵地址');
    }
  }
  const plusIndex = local.indexOf('+');
  const baseLocal = plusIndex >= 0 ? local.slice(0, plusIndex) : local;
  const canonicalDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
  const canonicalLocal = canonicalDomain === 'gmail.com' ? baseLocal.replaceAll('.', '') : baseLocal;
  if (!canonicalLocal) reject('請填寫有效的電郵地址');
  return { email: clean, normalized: `${canonicalLocal}@${canonicalDomain}` };
}

export function publicAuthMailConfig(config: AuthMailConfig | null): PublicAuthMailConfig {
  if (!config) {
    return {
      senderName: '學序 HOKSE',
      webhookUrl: '',
      enabled: false,
      mode: 'closed',
      hasSecret: false,
      hasPasscode: false,
      gasTemplate: GAS_WEBHOOK_TEMPLATE,
    };
  }
  return {
    senderName: config.senderName,
    webhookUrl: config.webhookUrl,
    enabled: config.enabled,
    mode: config.mode,
    hasSecret: !!config.secret,
    hasPasscode: !!config.passcode,
    tested: config.tested,
    gasTemplate: GAS_WEBHOOK_TEMPLATE,
  };
}

export function validateAuthMailConfig(input: any, previous: AuthMailConfig | null): AuthMailConfig {
  const senderName = String(input?.senderName ?? previous?.senderName ?? '學序 HOKSE').trim().slice(0, 60) || '學序 HOKSE';
  const mode: RegistrationMode = ['closed', 'passcode', 'open'].includes(input?.mode) ? input.mode : (previous?.mode ?? 'closed');
  const enabled = Boolean(input?.enabled);
  const rawUrl = String(input?.webhookUrl ?? '').trim();

  let webhookUrl = '';
  if (rawUrl) {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      reject('請填寫有效的 Google Apps Script Webhook URL');
    }
    if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol)) {
      reject('Webhook 地址不可含帳密或片段，且須為 HTTPS');
    }
    const isLocalHttp = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
    const isGasHttps = url.protocol === 'https:' && url.hostname === 'script.google.com' && url.pathname.startsWith('/macros/');
    if (!isLocalHttp && !isGasHttps) {
      reject('請填寫有效的 Google Apps Script Webhook URL');
    }
    webhookUrl = isGasHttps
      ? `https://script.google.com${url.pathname}`
      : `http://127.0.0.1:${url.port || '80'}${url.pathname}`;
  }

  const sameUrl = !!previous && previous.webhookUrl === webhookUrl;
  const secret = input?.clearSecret
    ? ''
    : typeof input?.secret === 'string' && input.secret.trim()
      ? input.secret.trim()
      : sameUrl
        ? previous.secret
        : '';
  const passcode = input?.clearPasscode
    ? ''
    : typeof input?.passcode === 'string' && input.passcode.trim()
      ? input.passcode.trim()
      : previous?.passcode ?? '';

  if (secret.length > 200) reject('共享密鑰過長（最多 200 字元）');
  if (passcode && (passcode.length < 4 || passcode.length > 80)) {
    reject('班級註冊通行碼需為 4–80 字元');
  }
  if (enabled && (!webhookUrl || !secret)) {
    reject('啟用電郵驗證服務前，請先填寫 Webhook URL 與共享密鑰');
  }
  if (mode === 'passcode' && !passcode) {
    reject('選擇「電郵驗證碼 + 班級通行碼」模式時，請設定至少 4 字元的註冊通行碼');
  }

  const sameConnection = sameUrl && previous?.secret === secret;
  return {
    senderName,
    webhookUrl,
    secret,
    enabled,
    mode,
    passcode,
    tested: sameConnection ? previous?.tested : undefined,
  };
}

export async function getAuthMailConfig(store: Store): Promise<AuthMailConfig | null> {
  const row = await store.db.prepare('SELECT body FROM settings WHERE id=?').get(CONFIG_KEY);
  if (!row) return null;
  return JSON.parse(store.decrypt(row.body)) as AuthMailConfig;
}

export async function putAuthMailConfig(store: Store, config: AuthMailConfig): Promise<void> {
  await store.db
    .prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
    .run(CONFIG_KEY, store.encrypt(JSON.stringify(config)));
}

export async function getUserBoundEmail(store: Store, userId: string): Promise<string | null> {
  const row = await store.db.prepare('SELECT body FROM settings WHERE id=?').get(USER_EMAIL_PREFIX + userId);
  if (!row) return null;
  const record = JSON.parse(store.decrypt(row.body)) as BoundEmailRecord;
  return record.email;
}

export async function listUserBoundEmails(store: Store): Promise<Record<string, string>> {
  const rows = await store.db
    .prepare('SELECT id, body FROM settings WHERE id LIKE ?')
    .all(USER_EMAIL_PREFIX + '%');
  const map: Record<string, string> = {};
  for (const row of rows) {
    try {
      const record = JSON.parse(store.decrypt(row.body)) as BoundEmailRecord;
      map[record.userId] = record.email;
    } catch {}
  }
  return map;
}

export async function findUserByEmail(store: Store, rawOrNormalizedEmail: string): Promise<Identity | null> {
  const { normalized } = normalizeEmail(rawOrNormalizedEmail);
  const indexKey = EMAIL_INDEX_PREFIX + sha256(normalized);
  const row = await store.db.prepare('SELECT body FROM settings WHERE id=?').get(indexKey);
  if (!row) return null;
  const record = JSON.parse(store.decrypt(row.body)) as BoundEmailRecord;
  const user = await store.db.prepare('SELECT id, username, name, role FROM users WHERE id=?').get(record.userId);
  return (user as Identity) ?? null;
}

export async function bindUserEmail(store: Store, userId: string, email: string, normalized: string): Promise<string> {
  const indexKey = EMAIL_INDEX_PREFIX + sha256(normalized);
  const currentOwnerRow = await store.db.prepare('SELECT body FROM settings WHERE id=?').get(indexKey);
  if (currentOwnerRow) {
    const owner = JSON.parse(store.decrypt(currentOwnerRow.body)) as BoundEmailRecord;
    if (owner.userId !== userId) {
      reject('此電郵已綁定其他帳戶', 409, 'EMAIL_TAKEN');
    }
  }
  const existingRow = await store.db.prepare('SELECT body FROM settings WHERE id=?').get(USER_EMAIL_PREFIX + userId);
  if (existingRow) {
    try {
      const previous = JSON.parse(store.decrypt(existingRow.body)) as BoundEmailRecord;
      if (previous.normalized !== normalized) {
        await store.db.prepare('DELETE FROM settings WHERE id=?').run(EMAIL_INDEX_PREFIX + sha256(previous.normalized));
      }
    } catch {}
  }
  const verifiedAt = new Date().toISOString();
  const payload = store.encrypt(JSON.stringify({ userId, email, normalized, verifiedAt } satisfies BoundEmailRecord));
  await store.db
    .prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
    .run(USER_EMAIL_PREFIX + userId, payload);
  await store.db
    .prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
    .run(indexKey, payload);
  return verifiedAt;
}

export async function publicAuthStatus(store: Store, identity: Identity | null, allowSetup = true) {
  const config = await getAuthMailConfig(store);
  const serviceReady = Boolean(config?.enabled && config.webhookUrl && config.secret);
  const registrationMode: RegistrationMode = serviceReady ? config!.mode : 'closed';
  const email = identity ? await getUserBoundEmail(store, identity.id) : null;
  return {
    identity,
    setupRequired: (await store.userCount()) === 0 && allowSetup !== false,
    registrationMode,
    passwordResetEnabled: serviceReady,
    emailServiceEnabled: serviceReady,
    email,
  };
}

export async function resolveLoginUsername(store: Store, rawIdentifier: unknown): Promise<string> {
  const value = String(rawIdentifier ?? '').trim().toLowerCase();
  if (value.includes('@')) {
    const user = await findUserByEmail(store, value);
    return user ? user.username : '__unmatched_email__';
  }
  if (!/^[a-z0-9_.-]{2,40}$/.test(value)) {
    reject('請輸入有效的帳戶名稱（2–40 個英數字元）或已驗證電郵');
  }
  return value;
}

function checkRateLimit(
  attempts: Map<string, { n: number; until: number }>,
  key: string,
  max = 12
) {
  const rate = attempts.get(key);
  if (rate && rate.until > Date.now() && rate.n >= max) {
    reject('嘗試次數較多，請十分鐘後再試', 429);
  }
  attempts.set(key, { n: rate && rate.until > Date.now() ? rate.n + 1 : 1, until: Date.now() + 600_000 });
}

export async function handlePublicAuthMailRoutes(
  store: Store,
  path: string,
  method: string,
  input: any,
  ip: string,
  attempts: Map<string, { n: number; until: number }>,
  cookie: (value: string, maxAge: number) => void,
  send: (data: unknown, status?: number) => void
): Promise<boolean> {
  if (path === '/auth/register/code' && method === 'POST') {
    checkRateLimit(attempts, `${ip}:register-code`, 15);
    const config = verifyRegistrationAccess(await getAuthMailConfig(store), input.passcode);
    const { email, normalized } = normalizeEmail(input.email);
    if (await findUserByEmail(store, normalized)) {
      reject('此電郵已綁定現有帳戶，請直接登入或使用忘記密碼', 409, 'EMAIL_TAKEN');
    }
    const sent = await issueOtpCode(store, config, 'register', email);
    send({ ok: true, email: sent.email, cooldownSeconds: sent.cooldownSeconds });
    return true;
  }

  if (path === '/auth/register' && method === 'POST') {
    const username = String(input.username ?? '').trim().toLowerCase();
    const name = String(input.name ?? '').trim();
    const password = String(input.password ?? '');
    checkRateLimit(attempts, `${ip}:register:${username || 'anon'}`, 12);
    verifyRegistrationAccess(await getAuthMailConfig(store), input.passcode);
    if (!/^[a-z0-9_.-]{2,40}$/.test(username) || !name || name.length > 30 || password.length < 10 || password.length > 200) {
      reject('帳戶需 2–40 個英數字元、顯示名字 1–30 字，且密碼至少 10 字元');
    }
    if (await store.db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) {
      reject('此帳戶名稱已被使用，請換一個', 409, 'USERNAME_TAKEN');
    }
    const { email, normalized } = normalizeEmail(input.email);
    if (await findUserByEmail(store, normalized)) {
      reject('此電郵已綁定現有帳戶，請直接登入', 409, 'EMAIL_TAKEN');
    }
    await consumeOtpCode(store, 'register', email, input.code);
    const user = await store.transaction(async () => {
      if (await store.db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) {
        reject('此帳戶名稱已被使用，請換一個', 409, 'USERNAME_TAKEN');
      }
      const created = await store.createUser(username, password, name.slice(0, 30), 'student');
      await bindUserEmail(store, created.id, email, normalized);
      return created;
    });
    attempts.delete(`${ip}:register:${username}`);
    cookie(await store.session(user), 604800);
    send({ ...user, email }, 201);
    return true;
  }

  if (path === '/auth/reset/code' && method === 'POST') {
    checkRateLimit(attempts, `${ip}:reset-code`, 12);
    const config = await getAuthMailConfig(store);
    if (!config || !config.enabled || !config.webhookUrl || !config.secret) {
      reject('目前未啟用電郵重設密碼服務，請聯絡試用負責人', 503, 'MAIL_NOT_CONFIGURED');
    }
    const { email, normalized } = normalizeEmail(input.email);
    const targetUser = await findUserByEmail(store, normalized);
    if (!targetUser) {
      reject('找不到綁定此電郵的帳戶', 404, 'USER_NOT_FOUND');
    }
    if (targetUser.role === 'developer') {
      reject('管理員帳戶不開放公開電郵重設密碼，請使用私有維護流程', 403, 'FORBIDDEN');
    }
    const sent = await issueOtpCode(store, config, 'reset', email);
    send({ ok: true, email: sent.email, cooldownSeconds: sent.cooldownSeconds });
    return true;
  }

  if (path === '/auth/reset' && method === 'POST') {
    const password = String(input.password ?? '');
    checkRateLimit(attempts, `${ip}:reset`, 12);
    if (password.length < 10 || password.length > 200) {
      reject('新密碼需為 10–200 字元');
    }
    const { email, normalized } = normalizeEmail(input.email);
    const targetUser = await findUserByEmail(store, normalized);
    if (!targetUser) {
      reject('找不到綁定此電郵的帳戶', 404, 'USER_NOT_FOUND');
    }
    if (targetUser.role === 'developer') {
      reject('管理員帳戶不開放公開電郵重設密碼，請使用私有維護流程', 403, 'FORBIDDEN');
    }
    await consumeOtpCode(store, 'reset', email, input.code);
    await store.transaction(async () => {
      await store.db.prepare('UPDATE users SET password=? WHERE id=?').run(passwordHash(password), targetUser.id);
      await store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(targetUser.id);
    });
    attempts.delete(`${ip}:reset`);
    send({ ok: true, username: targetUser.username });
    return true;
  }

  return false;
}

export async function handleAuthedAuthMailRoutes(
  store: Store,
  identity: Identity,
  path: string,
  method: string,
  input: any,
  send: (data: unknown, status?: number) => void
): Promise<boolean> {
  if (path === '/auth/email' && method === 'GET') {
    const config = await getAuthMailConfig(store);
    const serviceReady = Boolean(config?.enabled && config.webhookUrl && config.secret);
    send({
      email: await getUserBoundEmail(store, identity.id),
      emailServiceEnabled: serviceReady,
    });
    return true;
  }

  if (path === '/auth/email/code' && method === 'POST') {
    const config = await getAuthMailConfig(store);
    if (!config || !config.enabled || !config.webhookUrl || !config.secret) {
      reject('開發者尚未啟用電郵驗證服務', 503, 'MAIL_NOT_CONFIGURED');
    }
    const { email, normalized } = normalizeEmail(input.email);
    const existingOwner = await findUserByEmail(store, normalized);
    if (existingOwner) {
      reject(
        existingOwner.id === identity.id ? '此電郵已是本帳戶目前的綁定電郵' : '此電郵已綁定其他帳戶',
        409,
        'EMAIL_TAKEN'
      );
    }
    const sent = await issueOtpCode(store, config, 'bind', email);
    send({ ok: true, email: sent.email, cooldownSeconds: sent.cooldownSeconds });
    return true;
  }

  if (path === '/auth/email/bind' && method === 'POST') {
    const { email, normalized } = normalizeEmail(input.email);
    const existingOwner = await findUserByEmail(store, normalized);
    if (existingOwner && existingOwner.id !== identity.id) {
      reject('此電郵已綁定其他帳戶', 409, 'EMAIL_TAKEN');
    }
    await consumeOtpCode(store, 'bind', email, input.code);
    const verifiedAt = await store.transaction(() => bindUserEmail(store, identity.id, email, normalized));
    send({ ok: true, email, verifiedAt });
    return true;
  }

  if (path === '/admin/auth-mail') {
    if (identity.role !== 'developer') reject('此功能僅供獲授權的開發者／內容復核者', 403, 'FORBIDDEN');
    if (method === 'GET') {
      send(publicAuthMailConfig(await getAuthMailConfig(store)));
      return true;
    }
    if (method === 'PUT') {
      const config = validateAuthMailConfig(input, await getAuthMailConfig(store));
      await putAuthMailConfig(store, config);
      send(publicAuthMailConfig(config));
      return true;
    }
  }

  if (path === '/admin/auth-mail/test' && method === 'POST') {
    if (identity.role !== 'developer') reject('此功能僅供獲授權的開發者／內容復核者', 403, 'FORBIDDEN');
    const previous = await getAuthMailConfig(store);
    const isDraft = Object.hasOwn(input, 'config');
    if (isDraft && (!input.config || typeof input.config !== 'object' || Array.isArray(input.config))) {
      reject('請提供有效的電郵服務設定草稿');
    }
    const config = isDraft
      ? validateAuthMailConfig({ ...input.config, enabled: true, mode: 'closed' }, previous)
      : previous ?? reject('請先保存電郵發信設定');
    const { email } = normalizeEmail(input.to);
    const result = await deliverMail(config, {
      to: email,
      subject: '【學序 HOKSE】Google Apps Script 電郵發信測試成功',
      text: `你好：\n\n這是一封來自「${config.senderName}」的管理員連線測試郵件。\n如果你收到此郵件，代表 Google Apps Script Webhook 與共享密鑰配置正常，可以開放電郵驗證碼註冊與重設密碼。`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;border:1px solid #e5e7eb;border-radius:12px;color:#111827">
        <h2 style="margin:0 0 12px;font-size:18px">${config.senderName} · 電郵發信連線測試</h2>
        <p style="margin:0 0 12px;color:#374151">Google Apps Script Webhook 與共享密鑰驗證通過，郵件已成功送達 <strong>${email}</strong>。</p>
      </div>`,
    });
    const tested = {
      at: new Date().toISOString(),
      to: email,
      ok: true,
      ...(result.remainingDailyQuota !== undefined ? { remainingDailyQuota: result.remainingDailyQuota } : {}),
    };
    if (!isDraft && previous) {
      previous.tested = tested;
      await putAuthMailConfig(store, previous);
    }
    send({ ok: true, tested, scope: isDraft ? 'draft' : 'saved' });
    return true;
  }

  return false;
}

export async function deliverMail(
  config: AuthMailConfig,
  message: { to: string; subject: string; text: string; html: string }
): Promise<{ remainingDailyQuota?: number }> {
  if (!config.webhookUrl || !config.secret) {
    reject('開發者尚未完成電郵發信服務設定', 503, 'MAIL_NOT_CONFIGURED');
  }
  let response: Response;
  try {
    response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: config.secret,
        senderName: config.senderName || '學序 HOKSE',
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    reject('無法連接電郵發信服務，請檢查 Google Apps Script Webhook 地址與網絡', 502, 'MAIL_WEBHOOK_UNREACHABLE');
  }
  const raw = (await response.text()).slice(0, 4096);
  if (!response.ok) {
    reject(`電郵發信服務回傳 HTTP ${response.status}`, 502, 'MAIL_PROVIDER_ERROR');
  }
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    reject('電郵發信服務未返回有效 JSON；請確認 Google Apps Script 部署權限設為「所有人 (Anyone)」', 502, 'MAIL_PROTOCOL_ERROR');
  }
  if (!data || data.ok !== true) {
    const reason = data?.error === 'SHARED_SECRET_MISMATCH'
      ? '電郵發信服務共享密鑰不匹配'
      : `電郵發送失敗：${String(data?.error ?? '未知原因').slice(0, 200)}`;
    reject(reason, 502, 'MAIL_DELIVERY_FAILED');
  }
  return {
    remainingDailyQuota: typeof data.remainingDailyQuota === 'number' ? data.remainingDailyQuota : undefined,
  };
}

function buildOtpMail(purpose: OtpPurpose, code: string) {
  const actionLabel = purpose === 'register' ? '註冊學序帳戶' : purpose === 'reset' ? '重設學序登入密碼' : '綁定學序帳戶電郵';
  const subject = `【學序 HOKSE】你的驗證碼：${code}（${actionLabel}）`;
  const text = `你好：\n\n你正在進行「${actionLabel}」。\n你的 6 位數字驗證碼為：${code}\n\n此驗證碼於 10 分鐘內有效，請勿轉發給他人。如非本人操作，請忽略此郵件。`;
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;border:1px solid #e5e7eb;border-radius:12px;color:#111827">
    <h2 style="margin:0 0 12px;font-size:18px">學序 HOKSE · 電郵驗證</h2>
    <p style="margin:0 0 12px;color:#374151">你正在進行<strong>${actionLabel}</strong>，請在頁面輸入以下 6 位驗證碼：</p>
    <div style="font-size:28px;font-weight:700;letter-spacing:6px;padding:12px 16px;background:#f3f4f6;border-radius:8px;text-align:center;margin:16px 0">${code}</div>
    <p style="margin:0;font-size:12px;color:#6b7280">此驗證碼於 10 分鐘內有效，切勿轉發他人。如非本人操作，可安全忽略此郵件。</p>
  </div>`;
  return { subject, text, html };
}

export function verifyRegistrationAccess(config: AuthMailConfig | null, passcodeInput?: unknown): AuthMailConfig {
  if (!config || !config.enabled || !config.webhookUrl || !config.secret || config.mode === 'closed') {
    reject('目前未開放自助註冊，請向試用負責人索取邀請帳戶', 403, 'REGISTRATION_CLOSED');
  }
  if (config.mode === 'passcode') {
    const provided = String(passcodeInput ?? '').trim();
    if (!provided || !safeEqual(provided, config.passcode)) {
      reject('班級註冊通行碼不正確', 403, 'INVALID_PASSCODE');
    }
  }
  return config;
}

export async function issueOtpCode(
  store: Store,
  config: AuthMailConfig,
  purpose: OtpPurpose,
  rawEmail: unknown,
  now = Date.now()
): Promise<{ email: string; normalized: string; cooldownSeconds: number }> {
  const { email, normalized } = normalizeEmail(rawEmail);
  const key = `${OTP_PREFIX}${purpose}:${sha256(normalized)}`;
  const existingRow = await store.db.prepare('SELECT body FROM settings WHERE id=?').get(key);
  let windowStart = now;
  let sentCountInWindow = 0;

  if (existingRow) {
    try {
      const prev = JSON.parse(store.decrypt(existingRow.body)) as OtpChallenge;
      if (now - prev.sentAt < OTP_COOLDOWN_MS) {
        reject('驗證碼剛剛已發送，請稍候一分鐘再試', 429, 'OTP_COOLDOWN');
      }
      if (now - prev.windowStart < OTP_WINDOW_MS) {
        windowStart = prev.windowStart;
        sentCountInWindow = prev.sentCountInWindow;
        if (sentCountInWindow >= OTP_MAX_PER_HOUR) {
          reject('此電郵一小時內發送驗證碼次數已達上限，請稍後再試', 429, 'OTP_HOURLY_LIMIT');
        }
      }
    } catch (e) {
      if ((e as any)?.status) throw e;
    }
  }

  const code = String(randomInt(100000, 1000000));
  const mail = buildOtpMail(purpose, code);
  await deliverMail(config, { to: email, ...mail });

  const challenge: OtpChallenge = {
    purpose,
    email,
    normalized,
    codeHash: passwordHash(code),
    sentAt: now,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    windowStart,
    sentCountInWindow: sentCountInWindow + 1,
  };
  await store.db
    .prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
    .run(key, store.encrypt(JSON.stringify(challenge)));
  return { email, normalized, cooldownSeconds: 60 };
}

export async function consumeOtpCode(
  store: Store,
  purpose: OtpPurpose,
  rawEmail: unknown,
  rawCode: unknown,
  now = Date.now()
): Promise<{ email: string; normalized: string }> {
  const { email, normalized } = normalizeEmail(rawEmail);
  const code = String(rawCode ?? '').trim();
  if (!/^\d{6}$/.test(code)) {
    reject('請輸入 6 位數字驗證碼');
  }
  const key = `${OTP_PREFIX}${purpose}:${sha256(normalized)}`;
  const row = await store.db.prepare('SELECT body FROM settings WHERE id=?').get(key);
  if (!row) {
    reject('驗證碼不存在或已過期，請重新獲取', 400, 'OTP_EXPIRED');
  }
  const challenge = JSON.parse(store.decrypt(row.body)) as OtpChallenge;
  if (now > challenge.expiresAt) {
    await store.db.prepare('DELETE FROM settings WHERE id=?').run(key);
    reject('驗證碼已過期，請重新獲取', 400, 'OTP_EXPIRED');
  }
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await store.db.prepare('DELETE FROM settings WHERE id=?').run(key);
    reject('驗證碼錯誤次數過多已失效，請重新獲取', 429, 'OTP_MAX_ATTEMPTS');
  }
  if (!passwordMatches(code, challenge.codeHash)) {
    challenge.attempts += 1;
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      await store.db.prepare('DELETE FROM settings WHERE id=?').run(key);
      reject('驗證碼錯誤次數過多已失效，請重新獲取', 429, 'OTP_MAX_ATTEMPTS');
    }
    await store.db
      .prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
      .run(key, store.encrypt(JSON.stringify(challenge)));
    reject('驗證碼不正確', 400, 'OTP_INVALID');
  }
  await store.db.prepare('DELETE FROM settings WHERE id=?').run(key);
  return { email, normalized };
}
