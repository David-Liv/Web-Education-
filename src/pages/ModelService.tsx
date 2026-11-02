import { ui, useInterfaceLanguage } from "../i18n";
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Badge } from '../components';
import { useApp } from '../state';
import { isAllowedModel, modelDisplayName } from '../model-catalog';
interface SavedModel {
    name: string;
    baseUrl: string;
    model: string;
    protocol: 'openai-chat' | 'openai-responses';
    enabled: boolean;
    hasKey: boolean;
    models?: string[];
    tested?: {
        at: string;
        model: string;
        ok: boolean;
    };
}
interface ModelDraft {
    name: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    protocol: SavedModel['protocol'];
    enabled: boolean;
    clearKey: boolean;
}
const empty: ModelDraft = { name: '我的模型服務', baseUrl: '', apiKey: '', model: '', protocol: 'openai-chat', enabled: false, clearKey: false };
const normalUrl = (value: string) => value.trim().replace(/\/+$/, '');
export function ModelServiceSettings() {
    useInterfaceLanguage();
    const { toast } = useApp();
    const [saved, setSaved] = useState<SavedModel | null>(null), [draft, setDraft] = useState<ModelDraft>(empty), [models, setModels] = useState<string[]>([]);
    const [loading, setLoading] = useState(true), [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [test, setTest] = useState('');
    function acceptSaved(value: SavedModel | null) { setSaved(value); setDraft(value ? { name: value.name, baseUrl: value.baseUrl, apiKey: '', model: value.model, protocol: value.protocol, enabled: value.enabled, clearKey: false } : empty); setModels(value?.models ?? []); }
    useEffect(() => { let current = true; void api<SavedModel | null>('/admin/model').then(value => { if (current)
        acceptSaved(value); }).catch(e => { if (current)
        setError((e as Error).message); }).finally(() => { if (current)
        setLoading(false); }); return () => { current = false; }; }, []);
    function edit(patch: Partial<ModelDraft>) { setDraft(value => ({ ...value, ...patch })); setTest(''); setNotice(''); if ('baseUrl' in patch || 'apiKey' in patch || 'protocol' in patch || 'clearKey' in patch)
        setModels([]); }
    async function run(action: string, fn: () => Promise<void>) { setBusy(action); setError(''); setNotice(''); try {
        await fn();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy('');
    } }
    const sameService = !!saved && normalUrl(draft.baseUrl) === normalUrl(saved.baseUrl), keySaved = sameService && saved.hasKey && !draft.clearKey;
    const validService = !!draft.baseUrl.trim(), validSelection = validService && isAllowedModel(draft.model.trim());
    if (loading)
        return <section className="card pilot-card"><p role="status">{ui("正在讀取全站模型設定…")}</p></section>;
    return <section className="card pilot-card model-service"><div className="row-between"><h2>{ui("共用 AI 服務")}</h2><Badge tone={saved?.enabled && saved.model ? 'green' : 'amber'}>{saved?.enabled && saved.model ? ui("已啟用") : ui("尚未啟用")}</Badge></div>
  <div className="model-active" aria-label={ui("目前全站模型")}><strong>{ui("全部使用者共用服務地址及密鑰")}</strong><p>{saved?.enabled && saved.model ? `${saved.name} · ${modelDisplayName(saved.model)}` : ui("尚未啟用模型。學生仍可使用固定練習。")}</p>{saved?.model && !saved.enabled && <small>{ui("已保存的模型：{0}（停用中）", [modelDisplayName(saved.model)])}</small>}<p className="small muted">{ui("這裡設定共用連線與管理測試模型。學生實際使用套餐允許的模型，預設模型與單價請到「套餐設定」調整。獲取列表與測試不會更換學生模型。")}</p></div>
  <fieldset className="model-settings-fields" disabled={!!busy}><div className="form-grid">
   <label className="field"><span>{ui("服務名稱")}</span><input value={draft.name} maxLength={80} onChange={e => edit({ name: e.target.value })}/></label>
   <label className="field"><span>API Base URL</span><input type="url" value={draft.baseUrl} onChange={e => edit({ baseUrl: e.target.value })} placeholder={ui("https://你的提供方/v1")} autoComplete="off"/></label>
   <label className="field"><span>API Key {keySaved ? ui("（已保存；留空保留）") : ''}</span><input type="password" value={draft.apiKey} onChange={e => edit({ apiKey: e.target.value })} autoComplete="off" placeholder={keySaved ? ui("不需要重新輸入密鑰") : ui("輸入此服務的 API Key")}/></label>
   <label className="field"><span>{ui("接口協議")}</span><select value={draft.protocol} onChange={e => edit({ protocol: e.target.value as SavedModel['protocol'] })}><option value="openai-chat">{ui("OpenAI 相容 Chat Completions")}</option><option value="openai-responses">{ui("OpenAI 相容 Responses")}</option></select></label>
  </div>
  <div className="pilot-actions"><button className="btn secondary" disabled={!!busy || !validService} onClick={() => void run('models', async () => { const result = await api<{
        models: string[];
    }>('/admin/model/models', 'POST', { config: draft }); setModels(result.models); setNotice(`已取得 ${result.models.length} 個模型。請選擇一個；沒有自動測試或啟用任何模型。`); })}>{busy === 'models' ? ui("正在獲取…") : ui("獲取模型列表")}</button><span className="small muted">{ui("只取得清單，不逐一呼叫模型生成內容。")}</span></div>
  <label className="field"><span>{ui("選擇管理測試模型")}</span><select value={draft.model} onChange={e => edit({ model: e.target.value, enabled: !!e.target.value })}><option value="">{ui("請選擇模型")}</option>{draft.model && !models.includes(draft.model) && <option value={draft.model}>{ui("目前／手填：{0}", [modelDisplayName(draft.model)])}</option>}{models.filter(isAllowedModel).map(id => <option key={id} value={id}>{modelDisplayName(id)}</option>)}</select></label>
  <details className="model-manual"><summary>{ui("清單沒有需要的模型？手動填入 Model ID")}</summary><label className="field"><span>{ui("手動 Model ID")}</span><input value={draft.model} maxLength={200} onChange={e => edit({ model: e.target.value, enabled: !!e.target.value.trim() })}/></label></details>
  <label className="checkbox-label"><input type="checkbox" checked={draft.enabled} onChange={e => edit({ enabled: e.target.checked })}/>{ui("啟用共用 AI 服務")}</label>
  {sameService && saved.hasKey && <label className="checkbox-label"><input type="checkbox" checked={draft.clearKey} onChange={e => edit({ clearKey: e.target.checked })}/>{ui("套用時清除已保存的 API Key")}</label>}
  <div className="pilot-actions"><button className="btn secondary" disabled={!!busy || !validSelection} onClick={() => void run('test', async () => { const result = await api<{
        text: string;
    }>('/admin/model/test', 'POST', { config: { ...draft, enabled: true } }); setTest(result.text); setNotice('所選模型文字測試成功；草稿尚未套用至全站。'); })}>{busy === 'test' ? ui("正在測試…") : ui("測試此模型")}</button><button className="btn primary" disabled={!!busy || !validService || draft.enabled && !validSelection} onClick={() => void run('save', async () => { const value = await api<SavedModel>('/admin/model', 'PUT', draft); const fetched = models; acceptSaved(value); if (fetched.length)
        setModels(fetched); setTest(''); setNotice(value.enabled ? '共用服務已更新；學生模型由套餐設定管理。' : '服務設定已保存，全站 AI 目前停用。'); toast(value.enabled ? '全站模型已更新' : '全站 AI 已停用'); })}>{busy === 'save' ? ui("正在套用…") : ui("儲存並套用至全部使用者")}</button></div>
  </fieldset>{error && <p role="alert" className="form-error">{ui(error)}</p>}{notice && <p role="status" className="model-explanation">{ui(notice)}</p>}{test && <div className="model-test"><strong>{ui("草稿文字測試回覆")}</strong><p>{ui(test)}</p><small>{ui("文字測試只確認此模型能回覆；圖片、原生串流、結構化輸出和教學品質需另行驗證。")}</small></div>}
  <p className="small muted">{ui("API Key 加密保存在服務端。學生可選擇套餐允許的模型。內部 credit 並非提供方的真實費用上限；管理測試會實際呼叫 API，但不扣學生 credit。")}</p>
 </section>;
}
