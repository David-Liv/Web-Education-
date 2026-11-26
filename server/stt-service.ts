import type { Store } from './store.ts';
import { reject } from './learning.ts';

export const DEFAULT_STT_BASE_URL = 'https://api.groq.com/openai/v1';
export const DEFAULT_STT_MODEL = 'whisper-large-v3-turbo';
const STT_SETTING_KEY = 'stt-service:config';

export type SttLanguageHint = 'zh-HK' | 'en' | 'auto';

export interface SttConfig {
  name: string;
  baseUrl: string;
  secret: string;
  model: string;
  enabled: boolean;
  tested?: { at: string; model: string; ok: boolean };
}

export interface PublicSttConfig {
  name: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  hasKey: boolean;
  source: 'database' | 'env' | 'none';
  tested?: { at: string; model: string; ok: boolean };
}

function cleanBaseUrl(raw: unknown): string {
  const text = String(raw ?? '').trim().replace(/\/+$/, '');
  if (!text) reject('請提供語音轉寫服務的 API Base URL');
  if (text.length > 300) reject('API Base URL 過長（最多 300 字元）');
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    reject('API Base URL 格式無效，請使用 https:// 網址');
  }
  const local = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) || parsed.username || parsed.password) {
    reject('語音轉寫服務只支援不含帳密的 https:// 網址（本機測試除外）');
  }
  return parsed.toString().replace(/\/+$/, '');
}

function cleanModel(raw: unknown): string {
  const model = String(raw ?? '').trim();
  if (!model || !/^[a-zA-Z0-9._:/-]{1,120}$/.test(model)) {
    reject('請提供有效的語音轉寫 Model ID（例如 whisper-large-v3-turbo）');
  }
  return model;
}

function envFallbackConfig(): SttConfig | null {
  const secret = (process.env.HOKSE_STT_API_KEY || process.env.GROQ_API_KEY || '').trim();
  if (!secret) return null;
  const baseUrl = (process.env.HOKSE_STT_BASE_URL || DEFAULT_STT_BASE_URL).trim().replace(/\/+$/, '');
  const model = (process.env.HOKSE_STT_MODEL || DEFAULT_STT_MODEL).trim();
  return { name: 'Groq Whisper Free', baseUrl, secret, model, enabled: true };
}

export async function loadSttConfig(store: Store): Promise<{ config: SttConfig | null; source: 'database' | 'env' | 'none' }> {
  const row = (await store.db.prepare('SELECT body FROM settings WHERE id=?').get(STT_SETTING_KEY)) as any;
  if (row?.body) {
    const parsed = JSON.parse(row.body) as Omit<SttConfig, 'secret'> & { secret?: string };
    const secret = parsed.secret ? store.decrypt(parsed.secret) : '';
    return {
      config: {
        name: parsed.name || 'Groq Whisper Free',
        baseUrl: parsed.baseUrl || DEFAULT_STT_BASE_URL,
        model: parsed.model || DEFAULT_STT_MODEL,
        enabled: Boolean(parsed.enabled),
        secret,
        tested: parsed.tested,
      },
      source: 'database',
    };
  }
  const env = envFallbackConfig();
  return env ? { config: env, source: 'env' } : { config: null, source: 'none' };
}

export async function getActiveSttConfig(store: Store): Promise<SttConfig | null> {
  const { config } = await loadSttConfig(store);
  if (!config || !config.enabled || !config.secret || !config.baseUrl || !config.model) return null;
  return config;
}

export function publicSttConfig(config: SttConfig | null, source: 'database' | 'env' | 'none'): PublicSttConfig {
  if (!config) {
    return {
      name: 'Groq Whisper Free',
      baseUrl: DEFAULT_STT_BASE_URL,
      model: DEFAULT_STT_MODEL,
      enabled: false,
      hasKey: false,
      source: 'none',
    };
  }
  return {
    name: config.name,
    baseUrl: config.baseUrl,
    model: config.model,
    enabled: config.enabled,
    hasKey: Boolean(config.secret),
    source,
    tested: config.tested,
  };
}

export function validateSttDraft(input: any, previous: SttConfig | null): SttConfig {
  const baseUrl = cleanBaseUrl(input?.baseUrl ?? previous?.baseUrl ?? DEFAULT_STT_BASE_URL);
  const model = cleanModel(input?.model ?? previous?.model ?? DEFAULT_STT_MODEL);
  const name = String(input?.name ?? previous?.name ?? 'Groq Whisper Free').trim().slice(0, 80) || 'Groq Whisper Free';
  const sameUrl = previous && previous.baseUrl.replace(/\/+$/, '') === baseUrl;
  const incomingKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : '';
  const clearKey = input?.clearKey === true;
  const secret = clearKey ? '' : incomingKey || (sameUrl ? previous?.secret ?? '' : '');
  const enabled = Boolean(input?.enabled);
  if (enabled && !secret) reject('啟用語音轉寫服務前請輸入有效的 API Key');
  return {
    name,
    baseUrl,
    model,
    secret,
    enabled,
    tested: sameUrl && !incomingKey && !clearKey && previous?.model === model ? previous?.tested : undefined,
  };
}

export async function saveSttConfig(store: Store, config: SttConfig): Promise<PublicSttConfig> {
  const stored = {
    name: config.name,
    baseUrl: config.baseUrl,
    model: config.model,
    enabled: config.enabled,
    secret: config.secret ? store.encrypt(config.secret) : '',
    tested: config.tested,
  };
  await store.db
    .prepare('INSERT INTO settings(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
    .run(STT_SETTING_KEY, JSON.stringify(stored));
  return publicSttConfig(config, 'database');
}

const MIME_BY_FORMAT: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
};

function sanitizeProviderError(status: number, bodyText: string, secret: string): string {
  const safe = secret ? bodyText.replaceAll(secret, '[redacted]') : bodyText;
  if (status === 401 || status === 403) return '語音轉寫 API Key 無效或無權限，請開發者檢查設定';
  if (status === 429) return '語音轉寫免費額度暫時達上限，請稍等片刻再試';
  if (status === 413) return '音訊檔案超過轉寫服務大小上限，請縮短錄音分段';
  let msg = '';
  try {
    const parsed = JSON.parse(safe);
    msg = String(parsed?.error?.message ?? '');
  } catch {
    msg = safe.slice(0, 160);
  }
  return msg ? `語音轉寫服務回傳錯誤（HTTP ${status}）：${msg.slice(0, 180)}` : `語音轉寫服務暫時未能回應（HTTP ${status}）`;
}

/** Verify API key and model availability via GET /models without consuming audio quota. */
export async function testSttConfig(config: SttConfig, signal?: AbortSignal): Promise<{ ok: true; model: string; modelFound: boolean }> {
  if (!config.secret) reject('測試前請提供 API Key');
  const res = await fetch(`${config.baseUrl}/models`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.secret}` },
    signal: signal ?? AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) reject(sanitizeProviderError(res.status, text, config.secret), 502, 'STT_TEST_FAILED');
  let ids: string[] = [];
  try {
    const parsed = JSON.parse(text);
    ids = Array.isArray(parsed?.data) ? parsed.data.map((m: any) => String(m?.id ?? '')).filter(Boolean) : [];
  } catch {
    /* some OpenAI-compatible proxies omit /models array */
  }
  return { ok: true, model: config.model, modelFound: ids.length === 0 || ids.includes(config.model) };
}

/** Transcribe temporary in-memory audio bytes via OpenAI-compatible /audio/transcriptions (e.g. Groq Whisper v3 Turbo). */
export async function transcribeAudioWithStt(
  config: SttConfig,
  input: {
    audioBase64: string;
    audioFormat: 'wav' | 'mp3' | 'm4a' | 'ogg' | 'webm';
    languageHint?: SttLanguageHint;
    topicTitle?: string;
  },
  signal?: AbortSignal
): Promise<{ text: string; model: string }> {
  const bytes = Buffer.from(input.audioBase64, 'base64');
  if (!bytes.length) reject('音訊內容為空，請重新錄音或選擇音檔');

  const form = new FormData();
  const mime = MIME_BY_FORMAT[input.audioFormat] ?? 'audio/wav';
  form.append('file', new Blob([bytes], { type: mime }), `segment.${input.audioFormat}`);
  form.append('model', config.model);
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const topicSuffix = input.topicTitle ? `單元：${input.topicTitle}。` : '';
  if (input.languageHint === 'en') {
    form.append('language', 'en');
    form.append('prompt', `HKDSE lesson explanation in English. ${input.topicTitle ? `Topic: ${input.topicTitle}.` : ''}`);
  } else if (input.languageHint === 'zh-HK') {
    form.append('language', 'zh');
    form.append('prompt', `香港中學文憑試（HKDSE）教學講解，使用繁體中文並保留英文學科術語。${topicSuffix}`);
  } else {
    // Auto-detect Cantonese/Chinese + English code-switching without forcing a single language
    form.append('prompt', `香港中學文憑試（HKDSE）教學講解，繁體中文夾雜英文術語。${topicSuffix}`);
  }

  const res = await fetch(`${config.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.secret}` },
    body: form,
    signal: signal ?? AbortSignal.timeout(120000),
  });
  const raw = await res.text();
  if (!res.ok) reject(sanitizeProviderError(res.status, raw, config.secret), 502, 'STT_FAILED');

  let text = '';
  try {
    const parsed = JSON.parse(raw);
    text = String(parsed?.text ?? '').trim();
  } catch {
    text = raw.trim();
  }
  if (!text) reject('語音轉寫結果為空，請確認錄音有清楚人聲後再試', 502, 'EMPTY_TRANSCRIPT');
  return { text: text.slice(0, 60000), model: config.model };
}
