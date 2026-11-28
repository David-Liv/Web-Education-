import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, realMode } from '../api/client';
import { useApp } from '../state';
import { Badge, Icon, Modal, PageHeading, Progress } from '../components';
import { ui, interfaceLocale, useInterfaceLanguage } from '../i18n';
import { defaultModelCredits, isAllowedModel, mergeDiscoveredModels, modelDisplayName, modelPurposes, modelPurposeLabels } from '../model-catalog';
import { hkPrice, plans, PricingCards } from './PricingCards';
import type { ModelPurpose } from '../model-catalog';
import type { BillingOrder, BillingPolicy, TokenUsage, UsageLog } from '../billing-types';

const date = (value: string) => new Date(value).toLocaleString(interfaceLocale(), { timeZone: 'Asia/Hong_Kong', dateStyle: 'medium', timeStyle: 'short' });
const state = (s: string) => ui(({ held: '已預留', charged: '已結算', released: '已退回', pending: '待確認', 'mock-paid': '模擬付款成功', scheduled: '已排定變更', success: '成功', error: '失敗' } as Record<string, string>)[s] ?? s);
function Tokens({ tokens }: { tokens: TokenUsage }) { return <div className="billing-metrics token-metrics">{(['input', 'output', 'total'] as const).map((key, i) => <div key={key}><small>{ui(['輸入 token', '輸出 token', '合計 token'][i])}</small><strong>{tokens[key] === null ? ui('未提供') : tokens[key]!.toLocaleString()}</strong></div>)}</div>; }

export function AiCostNotice({ conditional = false, purpose }: { conditional?: boolean; purpose?: ModelPurpose }) {
  const { billing } = useApp(); if (!realMode || !billing) return null;
  const selectedPurpose = purpose ?? (conditional ? 'evaluation' : 'chat');
  const model = billing.account.models[selectedPurpose], price = billing.policy.models[model]?.credits;
  return <p className="ai-price-note"><Icon name="sparkles" size={14}/><span>{conditional ? ui('僅在需要 AI 批改時扣點；純規則判分免費。') : ui('按可用回覆扣點，自動檢查不另扣點。')} {ui(modelPurposeLabels[selectedPurpose])} · {modelDisplayName(model)} · {price ?? '—'} credit · <Link to="/billing">{ui('可用 {0} credit', [billing.available])}</Link></span></p>;
}

export function BillingPage() {
  useInterfaceLanguage(); const { billing: b, refresh, toast } = useApp();
  const [order, setOrder] = useState<BillingOrder | null>(null), [receipt, setReceipt] = useState<BillingOrder | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!realMode || !b) return <section className="card pilot-card"><h1>{ui('套餐與帳單')}</h1><p>{ui('請在邀請制版本登入後使用套餐與帳單。')}</p></section>;
  async function action(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn(); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  const a = b.account, rule = b.policy.plans[a.plan];
  return (
    <div className="page-enter billing-page">
      <PageHeading title={ui('套餐與帳單')} description={ui('按自己的節奏選擇方案與模型，每 30 天為一個週期，清楚查看每次使用。')} />
      <div className="billing-simulation"><Icon name="bulb" size={18} /><div><strong>{ui('模擬交易，未真實收費')}</strong><p>{ui('付款渠道只演示成功流程，不收集卡號，不會扣款，也不會呼叫 AI。')}</p></div></div>
      {error && <p className="form-error" role="alert">{ui(error)}</p>}
      <PricingCards billing={b} busy={busy} onSelect={id => void action(async () => setOrder(await api('/billing/orders', 'POST', { target: id, requestId: crypto.randomUUID() })))} />

      <section className="card pilot-card">
        <div className="row-between"><h2>{ui('我的套餐')} <Badge tone="green">{a.plan}</Badge></h2><span className="small muted">{ui('本週期重置：{0}', [date(b.resetsAt)])}</span></div>
        <div className="billing-metrics">
          <div><small>{ui('本週期可用')}</small><strong>{b.available.toLocaleString()} <small>credit</small></strong></div>
          <div><small>{ui('已用／預留')}</small><strong>{b.spent} / {b.held}</strong></div>
          <div><small>{ui('本週期上限')}</small><strong>{b.cap.toLocaleString()}{b.carryover > 0 && <small> ({ui('含疊加 +{0}', [b.carryover.toLocaleString()])})</small>}</strong></div>
          <div><small>{ui('模擬月費')}</small><strong>{hkPrice(rule.price)}</strong></div>
        </div>
        <Progress value={b.cap ? ((b.spent + b.held) / b.cap) * 100 : 0} />
        {b.weeklyCap !== null && (
          <div className="billing-weekly-meter">
            <div className="row-between"><span>{ui('免費版每週用量上限（滾動 7 天）')}</span><strong>{ui('本週餘 {0} / {1} credit', [b.weeklyAvailable ?? 0, b.weeklyCap])}</strong></div>
            <Progress value={b.weeklyCap ? ((b.weeklySpent + b.weeklyHeld) / b.weeklyCap) * 100 : 0} color="#4d7d69" />
          </div>
        )}
        <p className="small muted">{ui('套餐以 30 天為一個週期。升級即時重開 30 天並保留剩餘未用額度疊加；週期到期重置為定額，Free 不累積。')}</p>
        <fieldset className="billing-model-defaults" disabled={busy}>
          <legend>{ui('我的 AI 模型')}</legend>
          <p className="small muted">{ui('按用途分別保存預設模型；更改一項不會更改其他項。')}</p>
          <div className="form-grid">{modelPurposes.map(mp => (
            <label className="field" key={mp}>
              <span>{ui(modelPurposeLabels[mp])}</span>
              <select aria-label={ui(modelPurposeLabels[mp])} value={a.models[mp]} onChange={e => void action(async () => { await api('/billing/model', 'PUT', { purpose: mp, model: e.target.value }); })}>
                {rule.models.filter(m => isAllowedModel(m) && b.policy.models[m]?.enabled).map(m => <option key={m} value={m}>{modelDisplayName(m)} · {b.policy.models[m].credits} credit</option>)}
              </select>
              <small className="muted">{ui({ quiz: '獨立測驗出題（包括內部檢查與返工）', chat: '聊天、導讀、隨堂練習及計劃講解', evaluation: '作答評估、批改及錯因分析' }[mp])}</small>
            </label>
          ))}</div>
        </fieldset>
        <p className="small muted">{ui('單價按一項有效操作計算，不是按 token。測驗內部返工只計一次；管理測試不扣學生額度。')}</p>
        {(a.pendingPlan || !a.renewal) && <p className="billing-pending">{ui('下期變更為 {0}，於 {1} 生效。', [a.pendingPlan ?? 'Free', date(b.resetsAt)])}</p>}
        <div className="pilot-actions">{a.plan !== 'Free' && <button className="btn secondary" disabled={busy} onClick={() => void action(async () => { await api('/billing/subscription', 'POST', { action: a.renewal && !a.pendingPlan ? 'cancel' : 'restore' }); })}>{a.renewal && !a.pendingPlan ? ui('取消續訂（期滿生效）') : ui('恢復續訂／撤銷變更')}</button>}</div>
      </section>

      <section className="card pilot-card">
        <h2>{ui('訂單與模擬收據')}</h2>
        {!b.orders.length ? <p className="muted">{ui('尚無訂單。')}</p> : <div className="billing-table-wrap"><table className="billing-table"><thead><tr>{['日期', '套餐', '金額', '狀態', '操作'].map(k => <th key={k}>{ui(k)}</th>)}</tr></thead><tbody>{b.orders.map(o => <tr key={o.id}><td>{date(o.createdAt)}<small>{o.id.slice(0, 8)}</small></td><td>{o.from} → {o.target}</td><td>{hkPrice(o.amount)}</td><td>{state(o.status)}</td><td>{o.status === 'pending' ? <button className="btn ghost" disabled={busy} onClick={() => setOrder(o)}>{ui('繼續確認')}</button> : <button className="btn ghost" onClick={() => setReceipt(o)}>{ui('查看收據')}</button>}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="card pilot-card">
        <h2>{ui('本週期 AI 用量')}</h2>
        <p className="small muted">{ui('顯示最近 100 項操作；token 只採用提供方實際返回的數值。')}</p>
        {!b.usage.length ? <p className="muted">{ui('尚無 AI 用量。')}</p> : <div className="billing-table-wrap"><table className="billing-table"><thead><tr>{['日期', '用途', '模型', 'credit', '狀態', '合計 token'].map(k => <th key={k}>{ui(k)}</th>)}</tr></thead><tbody>{b.usage.map(o => <tr key={o.id}><td>{date(o.createdAt)}</td><td>{purpose(o.purpose)}</td><td className="model-id">{modelDisplayName(o.model)}</td><td>{o.cost}</td><td>{state(o.status)}</td><td>{o.tokens.total ?? ui('未提供')}</td></tr>)}</tbody></table></div>}
      </section>

      {order && (
        <Modal title={ui('確認模擬訂單')} onClose={() => { if (!busy) { setOrder(null); setError(''); } }}>
          <p className="billing-simulation">{ui('模擬交易，未真實收費')}</p>
          <dl className="billing-detail">
            <dt>{ui('套餐')}</dt><dd>{order.from} → {order.target}</dd>
            <dt>{ui('本次模擬金額')}</dt><dd>{hkPrice(order.amount)}</dd>
            <dt>{ui('生效時間')}</dt><dd>{date(order.effectiveAt)}</dd>
            <dt>{ui('目標 30 天額度')}</dt><dd>{order.credits.toLocaleString()} credit{order.carryover ? ` + ${order.carryover.toLocaleString()} (${ui('剩餘點數疊加')})` : ''}</dd>
          </dl>
          <p>{ui('升級即時重開 30 天週期並保留剩餘未用額度疊加。降級保留本期權益，於目前 30 天週期結束後生效。訂單有效 30 分鐘。')}</p>
          <h3>{ui('選擇模擬付款渠道')}</h3>
          {error && <p role="alert" className="form-error">{ui(error)}</p>}
          <div className="billing-channels">{[['mock-card', '模擬信用卡'], ['mock-alipay', '模擬支付寶'], ['mock-fps', '模擬轉數快']].map(([id, label]) => <button className="btn secondary" disabled={busy} key={id} onClick={() => void action(async () => { const paid = await api<BillingOrder>(`/billing/orders/${order.id}/pay`, 'POST', { channel: id }); setOrder(null); setReceipt(paid); toast('模擬訂單已完成，沒有真實扣款'); })}>{ui(label)} <Icon name="arrow" size={15}/></button>)}</div>
        </Modal>
      )}
      {receipt && (
        <Modal title={ui('模擬收據')} onClose={() => setReceipt(null)}>
          <div className="receipt-success"><Icon name="checkCircle" size={38}/><h2>{state(receipt.status)}</h2><p>{ui('模擬交易，未真實收費')}</p></div>
          <dl className="billing-detail"><dt>{ui('訂單編號')}</dt><dd>{receipt.id}</dd><dt>{ui('套餐')}</dt><dd>{receipt.target}</dd><dt>{ui('金額')}</dt><dd>{hkPrice(receipt.amount)}</dd><dt>{ui('渠道')}</dt><dd>{channel(receipt.channel)}</dd><dt>{ui('生效時間')}</dt><dd>{date(receipt.effectiveAt)}</dd>{receipt.carryover ? <><dt>{ui('疊加餘額')}</dt><dd>+{receipt.carryover.toLocaleString()} credit</dd></> : null}</dl>
          <a className="btn primary" href={`/api/v1/billing/orders/${receipt.id}/receipt`}>{ui('下載模擬收據 JSON')}</a>
        </Modal>
      )}
    </div>
  );
}

const channel = (value: string | null) => value ? ui(({ 'mock-card': '模擬信用卡', 'mock-alipay': '模擬支付寶', 'mock-fps': '模擬轉數快' } as Record<string, string>)[value] ?? value) : '—';
function purpose(value: string) { return ui(value.includes('/messages') ? '學習對話' : value.endsWith('/submit') ? 'AI 批改' : value.includes('/studio/quizzes') ? 'AI 練習生成' : value.includes('/analyse') ? '錯因分析' : value.includes('/explain') ? '計劃講解' : value.includes('/test') ? '管理測試' : value); }

export function AdminBilling() {
  useInterfaceLanguage(); const { refresh } = useApp(); const [policy, setPolicy] = useState<BillingPolicy>(), [discovered, setDiscovered] = useState<string[]>([]), [users, setUsers] = useState<any[]>([]), [audit, setAudit] = useState<any[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [newModel, setNewModel] = useState('');
  async function load() { const [p, u, a] = await Promise.all([api('/admin/billing/policy'), api('/admin/billing/users'), api('/admin/billing/audit')]); setPolicy(p.policy); setDiscovered(p.discoveredModels); setUsers(u); setAudit(a); }
  useEffect(() => { void load().catch(e => setError(e.message)); }, []);
  async function action(fn: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await fn(); await load(); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  if (!policy) return <p role="status">{error ? ui(error) : ui('正在載入')}</p>;
  function edit(fn: (p: BillingPolicy) => void) { setPolicy(old => { const next = structuredClone(old!); fn(next); return next; }); }
  return <div className="billing-admin">{error && <p className="form-error" role="alert">{ui(error)}</p>}{notice && <p role="status">{ui(notice)}</p>}<section className="card pilot-card"><div className="row-between"><h2>{ui('套餐與模型規則')}</h2><Badge>v{policy.version}</Badge></div><p className="muted">{ui('修改只影響新操作；既有消耗和訂單保留快照。改套餐不會清空已用額度。')}</p><label className="field"><span>{ui('聊天練習復核模型（全站）')}</span><select aria-label={ui('聊天練習復核模型（全站）')} value={policy.reviewModel ?? 'pggo-抗截断-gemini-3.8-flash'} onChange={e => edit(n => { n.reviewModel = e.target.value; })}>{Object.entries(policy.models).filter(([, m]) => m.enabled).map(([id]) => <option key={id} value={id}>{modelDisplayName(id)}</option>)}</select></label><p className="small muted">{ui('用於聊天中的練習及題解，獨立於學生選擇的聊天模型；自動檢查不額外扣學生 credit。')}</p><div className="billing-plans">{plans.map(id => { const p = policy.plans[id]; return <div key={id}><h3>{id}</h3><label className="field"><span>{ui('模擬月費 HKD')}</span><input type="number" min="0" step="0.01" disabled={id === 'Free'} value={p.price} onChange={e => edit(n => { n.plans[id].price = Number(e.target.value); })} /></label><label className="field"><span>{ui('每 30 天 credit')}</span><input type="number" min="0" step="1" value={p.credits} onChange={e => edit(n => { n.plans[id].credits = Number(e.target.value); })} /></label><label className="field"><span>{ui('每週 credit 上限（留空不限）')}</span><input type="number" min="1" step="1" placeholder={ui('不限')} value={p.weeklyCredits ?? ''} onChange={e => edit(n => { n.plans[id].weeklyCredits = e.target.value === '' ? null : Number(e.target.value); })} /></label>{modelPurposes.map(mp => <label className="field" key={mp}><span>{ui(modelPurposeLabels[mp])}</span><select value={p.defaultModels?.[mp] ?? p.defaultModel} onChange={e => edit(n => { const r = n.plans[id]; r.defaultModels ??= { quiz: r.defaultModel, chat: r.defaultModel, evaluation: r.defaultModel }; r.defaultModels[mp] = e.target.value; r.defaultModel = r.defaultModels.chat; })}>{p.models.map(m => <option key={m} value={m}>{modelDisplayName(m)} · {policy.models[m]?.credits} credit</option>)}</select></label>)}</div>; })}</div><div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>{ui('模型')}</th><th>{ui('每次 credit')}</th><th>{ui('啟用')}</th>{plans.map(p => <th key={p}>{p}</th>)}</tr></thead><tbody>{Object.entries(policy.models).map(([id, m]) => <tr key={id}><td className="model-id">{modelDisplayName(id)}{modelDisplayName(id) !== id && <small>{id}</small>}</td><td><input aria-label={ui('{0} 單價', [id])} type="number" min="1" max="100000" value={m.credits} onChange={e => edit(n => { n.models[id].credits = Number(e.target.value); })} /></td><td><input type="checkbox" aria-label={ui('啟用 {0}', [id])} checked={m.enabled} onChange={e => edit(n => { n.models[id].enabled = e.target.checked; })} /></td>{plans.map(p => <td key={p}><input type="checkbox" aria-label={`${p} ${id}`} checked={policy.plans[p].models.includes(id)} onChange={e => edit(n => { n.plans[p].models = e.target.checked ? [...n.plans[p].models, id] : n.plans[p].models.filter(x => x !== id); })} /></td>)}</tr>)}</tbody></table></div><div className="billing-add-model"><input aria-label={ui('新增模型 ID')} placeholder={ui('新增模型 ID')} list="billing-discovered" value={newModel} onChange={e => setNewModel(e.target.value)} /><datalist id="billing-discovered">{discovered.filter(m => isAllowedModel(m) && !policy.models[m]).map(m => <option key={m}>{m}</option>)}</datalist><button className="btn secondary" disabled={!isAllowedModel(newModel.trim()) || !!policy.models[newModel.trim()]} onClick={() => { const id = newModel.trim(); edit(n => { n.models[id] = { enabled: false, credits: defaultModelCredits(id) }; }); setNewModel(''); }}>{ui('加入待設定模型')}</button>{discovered.length > 0 && <button className="btn secondary" disabled={busy} onClick={() => edit(n => { Object.assign(n, mergeDiscoveredModels(n, discovered, true).policy); })}>{ui('一鍵批量加入已發現模型')}</button>}<button className="btn secondary" disabled={busy} onClick={() => void (async () => { setBusy(true); setError(''); try { const res = await api<{ models: string[] }>('/admin/model/models', 'POST', {}); setDiscovered(res.models); edit(n => { Object.assign(n, mergeDiscoveredModels(n, res.models, true).policy); }); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } })()}>{ui('從服務拉取並批量加入')}</button></div><p className="small muted">{ui('新模型預設停用；設定單價、啟用並勾選套餐後才開放。停用模型前，請移除套餐權限並更換預設模型。')}</p><button className="btn primary" disabled={busy} onClick={() => void action(async () => { await api('/admin/billing/policy', 'PUT', policy); setNotice('規則已保存'); })}>{ui('儲存套餐規則')}</button></section>
    <section className="card pilot-card"><h2>{ui('用戶套餐與額度')}</h2><div className="billing-table-wrap"><table className="billing-table"><thead><tr>{['用戶', '套餐', '已用／預留', '可用 credit'].map(k => <th key={k}>{ui(k)}</th>)}</tr></thead><tbody>{users.map(u => <tr key={u.id}><td><strong>{u.name}</strong><small>@{u.username}</small></td><td><select aria-label={ui('{0} 套餐', [u.name])} disabled={busy} value={u.plan} onChange={e => void action(async () => { await api(`/admin/billing/users/${u.id}`, 'PATCH', { plan: e.target.value }); })}>{plans.map(p => <option key={p}>{p}</option>)}</select></td><td>{u.spent} / {u.held}</td><td>{u.available}</td></tr>)}</tbody></table></div></section>
    <section className="card pilot-card"><h2>{ui('設定變更紀錄')}</h2><p className="small muted">{ui('最近 100 項；記錄操作者、時間及變更前後值。')}</p>{audit.map(a => <details key={a.at + a.action}><summary>{date(a.at)} · {a.action} · {users.find(u => u.id === a.actorId)?.name ?? a.actorId}</summary><pre className="usage-json">{JSON.stringify({ before: a.before, after: a.after }, null, 2)}</pre></details>)}</section></div>;
}

export function AdminUsage() {
  useInterfaceLanguage(); const [q, setQ] = useState(''), [status, setStatus] = useState('all'), [from, setFrom] = useState(''), [to, setTo] = useState(''), [page, setPage] = useState(1), [result, setResult] = useState<{ total: number; rows: UsageLog[] }>({ total: 0, rows: [] }), [detail, setDetail] = useState<UsageLog | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(true);
  const loadVersion = useRef(0);
  const query = new URLSearchParams({ q, status, from, to, page: String(page) }).toString();
  async function load() { const version = ++loadVersion.current; setBusy(true); setError(''); try { const value = await api('/admin/usage?' + query); if (version === loadVersion.current) setResult(value); } catch (e) { if (version === loadVersion.current) setError((e as Error).message); } finally { if (version === loadVersion.current) setBusy(false); } }
  useEffect(() => { const timer = setTimeout(() => void load(), q ? 250 : 0); return () => clearTimeout(timer); }, [query]);
  return <section className="card pilot-card usage-panel"><div className="row-between"><h2>{ui('AI 使用日誌')}</h2><Badge>{busy ? ui('正在載入') : ui('共 {0} 條', [result.total])}</Badge></div><p className="muted">{ui('保留 30 天，最多 1,000 次上游呼叫。返回正文只在受保護的匯出檔案內提供。')}</p><div className="usage-filters"><label className="field"><span>{ui('搜尋用戶或模型')}</span><input value={q} placeholder={ui('搜尋用戶或模型')} onChange={e => { setQ(e.target.value); setPage(1); }} /></label><label className="field"><span>{ui('狀態')}</span><select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">{ui('全部狀態')}</option><option value="success">{ui('成功')}</option><option value="error">{ui('失敗')}</option></select></label><label className="field"><span>{ui('開始日期（香港）')}</span><input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label><label className="field"><span>{ui('結束日期（香港）')}</span><input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></label><button className="icon-btn" disabled={busy} aria-label={ui('重新整理')} onClick={() => void load()}><Icon name="refresh" /></button><a className="btn secondary" href={'/api/v1/admin/usage/export?' + query}>{ui('匯出篩選日誌')}</a></div>{error && <p className="form-error" role="alert">{ui(error)}</p>}
    <div className="billing-table-wrap"><table className="billing-table usage-table"><thead><tr>{['用戶', 'Plan', '時間', '用途', '步驟', '模型', '渠道', '端點', '狀態', '耗時', 'credit', '操作'].map(k => <th key={k}>{ui(k)}</th>)}</tr></thead><tbody>{result.rows.map(l => <tr key={l.id}><td><strong>{l.name}</strong><small>@{l.username}</small></td><td><Badge>{l.plan}</Badge></td><td>{date(l.at)}</td><td>{purpose(l.purpose)}</td><td>{ui(l.stage === 'review' ? '練習復核' : '內容生成')}</td><td className="model-id">{modelDisplayName(l.model)}</td><td><Badge>{l.channel}</Badge></td><td>{l.endpoint}</td><td><Badge tone={l.status === 'success' ? 'green' : 'red'}>{state(l.status)} {l.httpStatus ?? '—'}</Badge></td><td>{l.durationMs >= 1000 ? (l.durationMs / 1000).toFixed(1) + 's' : l.durationMs + 'ms'}</td><td>{l.credit}<small>{state(l.settlement ?? '')}</small></td><td><button className="icon-btn" aria-label={ui('查看請求詳情')} onClick={() => void api<UsageLog>('/admin/usage/' + l.id).then(setDetail).catch(e => setError(e.message))}><Icon name="eye" /></button></td></tr>)}</tbody></table>{!busy && !result.rows.length && <p className="usage-empty">{ui('沒有符合條件的日誌。')}</p>}</div><div className="row-between usage-pagination"><span>{ui('第 {0} 頁', [page])}</span><div className="pilot-actions"><button className="btn secondary" disabled={page <= 1 || busy} onClick={() => setPage(p => p - 1)}>{ui('上一頁')}</button><button className="btn secondary" disabled={page * 20 >= result.total || busy} onClick={() => setPage(p => p + 1)}>{ui('下一頁')}</button></div></div>
    {detail && <Modal title={ui('請求詳情')} onClose={() => setDetail(null)}><section className="usage-detail-block"><h3>{ui('基本資訊')}</h3><dl className="billing-detail"><dt>{ui('用戶')}</dt><dd>{detail.name} (@{detail.username})</dd><dt>Plan</dt><dd>{detail.plan}</dd><dt>{ui('時間')}</dt><dd>{date(detail.at)}</dd><dt>{ui('狀態')}</dt><dd>{state(detail.status)} · HTTP {detail.httpStatus ?? '—'}</dd><dt>{ui('耗時')}</dt><dd>{detail.durationMs}ms</dd><dt>{ui('模型')}</dt><dd>{modelDisplayName(detail.model)}</dd><dt>{ui('請求方式')}</dt><dd>{ui('上游非串流')}</dd><dt>{ui('credit 結算')}</dt><dd>{detail.credit} · {state(detail.settlement ?? '')}</dd></dl><p className="small muted">{ui('同一操作內重試共用一次 credit，列表每行不是額外扣點。')}</p></section><section className="usage-detail-block"><h3>{ui('請求資訊')}</h3><p>{ui('請求路徑')}</p><code>{detail.endpoint}</code><p>{ui('請求摘要')}</p><pre className="usage-json">{JSON.stringify(detail.request, null, 2)}</pre></section><section className="usage-detail-block"><h3>{ui('實際返回用量')}</h3><Tokens tokens={detail.tokens} /></section>{detail.error && <section className="usage-detail-block usage-error"><h3>{ui('錯誤資訊')}</h3><p>{detail.error.type} · {detail.error.code}</p><pre className="usage-json">{detail.error.message}</pre></section>}<p className="small muted">{ui('正文只可匯出查看，內容最多 30,000 字元。')}{detail.truncated && ' ' + ui('此記錄有截斷。')}</p><a className="btn secondary" href={`/api/v1/admin/usage/${detail.id}/export`}>{ui('匯出此日誌 JSON')}</a>{detail.stage === 'review' && <a className="btn secondary" href={'/api/v1/admin/usage/' + detail.id + '/review'}>{ui('匯出練習修訂記錄')}</a>}</Modal>}
  </section>;
}
