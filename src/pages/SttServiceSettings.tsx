import { useEffect, useState } from 'react';
import { ui, useInterfaceLanguage } from '../i18n';
import { api } from '../api/client';
import { Badge } from '../components';
import { useApp } from '../state';

interface SavedStt {
  name: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  hasKey: boolean;
  source: 'database' | 'env' | 'none';
}

interface SttDraft {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  clearKey: boolean;
}

const DEFAULT_DRAFT: SttDraft = {
  name: 'Groq Whisper Free',
  baseUrl: 'https://api.groq.com/openai/v1',
  apiKey: '',
  model: 'whisper-large-v3-turbo',
  enabled: false,
  clearKey: false,
};

const norm = (value: string) => value.trim().replace(/\/+$/, '');

export function SttServiceSettings() {
  useInterfaceLanguage();
  const { toast } = useApp();
  const [saved, setSaved] = useState<SavedStt | null>(null);
  const [draft, setDraft] = useState<SttDraft>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const accept = (value: SavedStt) => {
    setSaved(value);
    setDraft({
      name: value.name || DEFAULT_DRAFT.name,
      baseUrl: value.baseUrl || DEFAULT_DRAFT.baseUrl,
      apiKey: '',
      model: value.model || DEFAULT_DRAFT.model,
      enabled: value.enabled,
      clearKey: false,
    });
  };

  useEffect(() => {
    let alive = true;
    void api<SavedStt>('/admin/stt')
      .then(v => { if (alive) accept(v); })
      .catch(e => { if (alive) setError((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const edit = (patch: Partial<SttDraft>) => {
    setDraft(v => ({ ...v, ...patch }));
    setError('');
    setNotice('');
  };

  const run = async (action: string, fn: () => Promise<void>) => {
    setBusy(action);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const sameUrl = Boolean(saved && norm(draft.baseUrl) === norm(saved.baseUrl));
  const keySaved = Boolean(sameUrl && saved?.hasKey && !draft.clearKey);
  const canSave = Boolean(draft.baseUrl.trim() && draft.model.trim() && (!draft.enabled || draft.apiKey.trim() || keySaved));
  const canTest = Boolean(draft.baseUrl.trim() && draft.model.trim() && (draft.apiKey.trim() || keySaved));

  if (loading) return <section className="card pilot-card"><p role="status">{ui('正在讀取語音轉寫設定…')}</p></section>;

  return (
    <section className="card pilot-card model-service">
      <div className="row-between">
        <h2>{ui('語音轉寫服務（Groq Whisper）')}</h2>
        <Badge tone={saved?.enabled && saved.hasKey ? 'green' : 'amber'}>
          {saved?.enabled && saved.hasKey ? ui('已啟用') : ui('尚未啟用')}
        </Badge>
      </div>
      <div className="model-active">
        <strong>{ui('供合作導師把錄音／音檔轉成可編輯文字')}</strong>
        <p>
          {saved?.enabled && saved.hasKey
            ? `${saved.name} · ${saved.model}`
            : ui('尚未啟用語音轉寫服務；預設使用 Groq Free 的 whisper-large-v3-turbo，轉寫後只把文字交給主模型編譯。')}
        </p>
        <p className="small muted">{ui('API Key 加密保存在資料庫 settings 表，不會寫入程式碼或回傳給瀏覽器。')}</p>
      </div>
      <fieldset className="model-settings-fields" disabled={Boolean(busy)}>
        <div className="form-grid">
          <label className="field"><span>{ui('服務名稱')}</span><input value={draft.name} maxLength={80} onChange={e => edit({ name: e.target.value })} /></label>
          <label className="field"><span>API Base URL</span><input type="url" value={draft.baseUrl} onChange={e => edit({ baseUrl: e.target.value })} placeholder="https://api.groq.com/openai/v1" autoComplete="off" /></label>
          <label className="field"><span>API Key {keySaved ? ui('（已保存；留空保留）') : ''}</span><input type="password" value={draft.apiKey} onChange={e => edit({ apiKey: e.target.value })} autoComplete="off" placeholder={keySaved ? ui('不需要重新輸入密鑰') : ui('輸入 Groq 或 OpenAI 相容轉寫 API Key')} /></label>
          <label className="field"><span>{ui('轉寫模型 ID')}</span><input value={draft.model} maxLength={120} onChange={e => edit({ model: e.target.value })} placeholder="whisper-large-v3-turbo" /></label>
        </div>
        <label className="checkbox-label"><input type="checkbox" checked={draft.enabled} onChange={e => edit({ enabled: e.target.checked })} />{ui('啟用語音轉寫服務')}</label>
        {sameUrl && saved?.hasKey && saved.source === 'database' && (
          <label className="checkbox-label"><input type="checkbox" checked={draft.clearKey} onChange={e => edit({ clearKey: e.target.checked })} />{ui('套用時清除已保存的語音轉寫 Key')}</label>
        )}
        <div className="pilot-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={Boolean(busy) || !canTest}
            onClick={() => void run('test', async () => {
              const res = await api<{ ok: boolean; model: string; modelFound: boolean }>('/admin/stt/test', 'POST', { config: draft });
              setNotice(res.modelFound ? ui('連線成功：已確認模型 {0} 可用。', [res.model]) : ui('連線成功，但清單中未見 {0}，請核對模型 ID。', [res.model]));
            })}
          >
            {busy === 'test' ? ui('正在測試…') : ui('測試語音轉寫連線')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={Boolean(busy) || !canSave}
            onClick={() => void run('save', async () => {
              const res = await api<SavedStt>('/admin/stt', 'PUT', draft);
              accept(res);
              setNotice(res.enabled ? ui('語音轉寫設定已保存並啟用。') : ui('語音轉寫設定已保存（目前停用）。'));
              toast(ui('語音轉寫設定已更新'));
            })}
          >
            {busy === 'save' ? ui('正在保存…') : ui('儲存語音轉寫設定')}
          </button>
        </div>
      </fieldset>
      {error && <p role="alert" className="form-error">{ui(error)}</p>}
      {notice && <p role="status" className="model-explanation">{notice}</p>}
    </section>
  );
}
