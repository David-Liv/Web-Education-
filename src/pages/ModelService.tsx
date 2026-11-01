import {useEffect,useState} from 'react';
import {api} from '../api/client';
import {Badge} from '../components';
import {useApp} from '../state';

interface SavedModel {name:string;baseUrl:string;model:string;protocol:'openai-chat'|'openai-responses';enabled:boolean;hasKey:boolean;models?:string[];tested?:{at:string;model:string;ok:boolean}}
interface ModelDraft {name:string;baseUrl:string;apiKey:string;model:string;protocol:SavedModel['protocol'];enabled:boolean;clearKey:boolean}
const empty:ModelDraft={name:'我的模型服務',baseUrl:'',apiKey:'',model:'',protocol:'openai-chat',enabled:false,clearKey:false};
const normalUrl=(value:string)=>value.trim().replace(/\/+$/,'');

export function ModelServiceSettings(){
 const {toast}=useApp();
 const [saved,setSaved]=useState<SavedModel|null>(null),[draft,setDraft]=useState<ModelDraft>(empty),[models,setModels]=useState<string[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[test,setTest]=useState('');
 function acceptSaved(value:SavedModel|null){setSaved(value);setDraft(value?{name:value.name,baseUrl:value.baseUrl,apiKey:'',model:value.model,protocol:value.protocol,enabled:value.enabled,clearKey:false}:empty);setModels(value?.models??[])}
 useEffect(()=>{let current=true;void api<SavedModel|null>('/admin/model').then(value=>{if(current)acceptSaved(value)}).catch(e=>{if(current)setError((e as Error).message)}).finally(()=>{if(current)setLoading(false)});return()=>{current=false}},[]);
 function edit(patch:Partial<ModelDraft>){setDraft(value=>({...value,...patch}));setTest('');setNotice('');if('baseUrl' in patch||'apiKey' in patch||'protocol' in patch||'clearKey' in patch)setModels([])}
 async function run(action:string,fn:()=>Promise<void>){setBusy(action);setError('');setNotice('');try{await fn()}catch(e){setError((e as Error).message)}finally{setBusy('')}}
 const sameService=!!saved&&normalUrl(draft.baseUrl)===normalUrl(saved.baseUrl),keySaved=sameService&&saved.hasKey&&!draft.clearKey;
 const validService=!!draft.baseUrl.trim(),validSelection=validService&&!!draft.model.trim();
 if(loading)return <section className="card pilot-card"><p role="status">正在讀取全站模型設定…</p></section>;
 return <section className="card pilot-card model-service"><div className="row-between"><h2>全站 AI 模型</h2><Badge tone={saved?.enabled&&saved.model?'green':'amber'}>{saved?.enabled&&saved.model?'已啟用':'尚未啟用'}</Badge></div>
  <div className="model-active" aria-label="目前全站模型"><strong>目前全部使用者共用</strong><p>{saved?.enabled&&saved.model?`${saved.name} · ${saved.model}`:'尚未啟用模型。學生仍可使用固定練習。'}</p>{saved?.model&&!saved.enabled&&<small>已保存的模型：{saved.model}（停用中）</small>}<p className="small muted">以下為設定草稿。獲取列表和測試不會切換全站模型；按「儲存並套用」後，所有帳戶的新 AI 請求才使用新設定。進行中的請求與歷史紀錄保留原來的模型。</p></div>
  <fieldset className="model-settings-fields" disabled={!!busy}><div className="form-grid">
   <label className="field"><span>服務名稱</span><input value={draft.name} maxLength={80} onChange={e=>edit({name:e.target.value})}/></label>
   <label className="field"><span>API Base URL</span><input type="url" value={draft.baseUrl} onChange={e=>edit({baseUrl:e.target.value})} placeholder="https://你的提供方/v1" autoComplete="off"/></label>
   <label className="field"><span>API Key {keySaved?'（已保存；留空保留）':''}</span><input type="password" value={draft.apiKey} onChange={e=>edit({apiKey:e.target.value})} autoComplete="off" placeholder={keySaved?'不需要重新輸入密鑰':'輸入此服務的 API Key'}/></label>
   <label className="field"><span>接口協議</span><select value={draft.protocol} onChange={e=>edit({protocol:e.target.value as SavedModel['protocol']})}><option value="openai-chat">OpenAI 相容 Chat Completions</option><option value="openai-responses">OpenAI 相容 Responses</option></select></label>
  </div>
  <div className="pilot-actions"><button className="btn secondary" disabled={!!busy||!validService} onClick={()=>void run('models',async()=>{const result=await api<{models:string[]}>('/admin/model/models','POST',{config:draft});setModels(result.models);setNotice(`已取得 ${result.models.length} 個模型。請選擇一個；沒有自動測試或啟用任何模型。`)})}>{busy==='models'?'正在獲取…':'獲取模型列表'}</button><span className="small muted">只取得清單，不逐一呼叫模型生成內容。</span></div>
  <label className="field"><span>選擇全站模型</span><select value={draft.model} onChange={e=>edit({model:e.target.value,enabled:!!e.target.value})}><option value="">請選擇模型</option>{draft.model&&!models.includes(draft.model)&&<option value={draft.model}>目前／手填：{draft.model}</option>}{models.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
  <details className="model-manual"><summary>清單沒有需要的模型？手動填入 Model ID</summary><label className="field"><span>手動 Model ID</span><input value={draft.model} maxLength={200} onChange={e=>edit({model:e.target.value,enabled:!!e.target.value.trim()})}/></label></details>
  <label className="checkbox-label"><input type="checkbox" checked={draft.enabled} onChange={e=>edit({enabled:e.target.checked})}/>啟用此模型供全部使用者使用</label>
  {sameService&&saved.hasKey&&<label className="checkbox-label"><input type="checkbox" checked={draft.clearKey} onChange={e=>edit({clearKey:e.target.checked})}/>套用時清除已保存的 API Key</label>}
  <div className="pilot-actions"><button className="btn secondary" disabled={!!busy||!validSelection} onClick={()=>void run('test',async()=>{const result=await api<{text:string}>('/admin/model/test','POST',{config:{...draft,enabled:true}});setTest(result.text);setNotice('所選模型文字測試成功；草稿尚未套用至全站。')})}>{busy==='test'?'正在測試…':'測試此模型'}</button><button className="btn primary" disabled={!!busy||!validService||draft.enabled&&!validSelection} onClick={()=>void run('save',async()=>{const value=await api<SavedModel>('/admin/model','PUT',draft);const fetched=models;acceptSaved(value);if(fetched.length)setModels(fetched);setTest('');setNotice(value.enabled?`全部使用者的新 AI 請求將使用 ${value.model}。`:'服務設定已保存，全站 AI 目前停用。');toast(value.enabled?'全站模型已更新':'全站 AI 已停用')})}>{busy==='save'?'正在套用…':'儲存並套用至全部使用者'}</button></div>
  </fieldset>{error&&<p role="alert" className="form-error">{error}</p>}{notice&&<p role="status" className="model-explanation">{notice}</p>}{test&&<div className="model-test"><strong>草稿文字測試回覆</strong><p>{test}</p><small>文字測試只確認此模型能回覆；圖片、原生串流、結構化輸出和教學品質需另行驗證。</small></div>}
  <p className="small muted">API Key加密保存在服務端，學生不用設定，也不能更換全站模型。應用不設固定 HK$100 金額上限；提供方的限額及錯誤會照實顯示。</p>
 </section>;
}
