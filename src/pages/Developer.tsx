import { ui, interfaceLocale, useInterfaceLanguage } from "../i18n";
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useApp } from '../state';
import { Badge, PageHeading } from '../components';
import type { ContentPack, Identity } from '../pilot-types';
import { AdminBilling, AdminUsage } from './Billing';
import { ModelServiceSettings } from './ModelService';
export function DeveloperPage() {
    useInterfaceLanguage();
    const [params, setParams] = useSearchParams();
    const tab = ['content', 'grading', 'users', 'model', 'billing', 'usage'].includes(params.get('tab') ?? '') ? params.get('tab')! : 'content';
    const setTab = (value: string) => setParams({ tab: value });
    const { db, refresh, toast } = useApp();
    const [packs, setPacks] = useState<ContentPack[]>([]), [users, setUsers] = useState<Identity[]>([]), [error, setError] = useState(''), [selected, setSelected] = useState(''), [index, setIndex] = useState(0), [method, setMethod] = useState(''), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
    const [account, setAccount] = useState({ username: '', name: '', password: '', role: 'student' }), [importText, setImportText] = useState(''), [csv, setCsv] = useState(false), [validation, setValidation] = useState<any>(null), [pending, setPending] = useState<any[]>([]);
    const developer = db.pilot?.identity.role === 'developer', allowed = developer || db.pilot?.identity.role === 'reviewer';
    const load = async () => { setError(''); try {
        setPacks(await api('/admin/content'));
        if (developer)
            setUsers(await api('/admin/users'));
        setPending(await api('/admin/grading'));
    }
    catch (e) {
        setError((e as Error).message);
    } };
    useEffect(() => { if (allowed)
        void load(); }, [allowed]);
    if (!allowed)
        return <section className="card pilot-card"><h2>{ui("此頁供內容復核者與開發者使用")}</h2><Link className="btn primary" to="/pilot">{ui("返回學習流程")}</Link></section>;
    const pack = packs.find(p => `${p.id}@${p.version}` === selected) ?? packs[0], q = pack?.questions[index] ?? pack?.questions[0];
    async function action(fn: () => Promise<void>) { setBusy(true); setError(''); try {
        await fn();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    const importBody = () => { if (csv) {
        if (!pack)
            throw new Error('請先選擇範本內容包');
        const { questions, reviews, status, professionalVerified, publishedAt, ...metadata } = pack;
        return { csv: importText, metadata: { ...metadata, version: pack.version + 1 } };
    } return { pack: JSON.parse(importText) }; };
    return <div className="page-enter"><PageHeading eyebrow="MAKE THE RULES REVIEWABLE" title={ui("內容與開發工作台")} description={ui("復核、發布及模型設定各自留存狀態；學生不會取得 API 密鑰。")}/><div className="pilot-actions">{[['content', '內容復核'], ['grading', '待批改'], ...(developer ? [['users', '邀請帳戶'], ['model', '模型服務'], ['billing', '套餐設定'], ['usage', 'AI 使用日誌']] : [])].map(([id, label]) => <button className={`btn ${tab === id ? 'primary' : 'secondary'}`} key={id} onClick={() => { setTab(id); setError(''); }}>{ui(label)}</button>)}</div>{error && <p role="alert" className="form-error">{ui(error)}</p>}
    {tab === 'content' && <><section className="card pilot-card"><div className="row-between"><h2>{ui("逐題復核與版本發布")}</h2><Badge>{ui("不是教師認證／難度校準")}</Badge></div><label className="field"><span>{ui("內容包")}</span><select value={pack ? `${pack.id}@${pack.version}` : ''} onChange={e => { setSelected(e.target.value); setIndex(0); setConfirmed(false); setMethod(''); }}>{packs.map(p => <option value={`${p.id}@${p.version}`} key={`${p.id}@${p.version}`}>{ui(p.title)} v{p.version} · {p.status === 'published' ? ui("已發布") : ui("待復核")}</option>)}</select></label>{pack && <><p>{ui("{0} 題 · {1} 題完成雙人復核", [pack.questions.length, pack.questions.filter(q => new Set(pack.reviews.filter(r => r.questionId === q.id).map(r => r.userId)).size >= 2).length])}</p><div className="pilot-actions"><a className="btn secondary" href={`/api/v1/admin/content/${pack.id}/${pack.version}/csv`}>{ui("下載 CSV 審核包")}</a><button className="btn primary" disabled={busy || pack.status === 'published'} onClick={() => void action(async () => { await api(`/admin/content/${pack.id}/${pack.version}/publish`, 'POST', {}); await load(); await refresh(); toast('內容版本已發布，學生頁現在可用'); })}>{ui("發布此版本")}</button></div><div className="question-dots">{pack.questions.map((item, n) => <button key={item.id} className={q?.id === item.id ? 'active' : ''} onClick={() => { setIndex(n); setConfirmed(false); setMethod(''); }}>{n + 1}</button>)}</div>{pack.lessons.map((l, i) => <LessonReview key={`${pack.id}:${pack.version}:${i}`} pack={pack} index={i} done={load}/>)}{q && <div className="review-question"><Badge>{q.id} · {q.familyId}</Badge><h3>{q.prompt}</h3>{q.options && <p>{q.options.map((x, n) => `${String.fromCharCode(65 + n)}. ${x}`).join('；')}</p>}<p><strong>{ui("答案：")}</strong>{q.answer}</p><p><strong>{ui("解析：")}</strong>{q.explanation}</p><p><strong>{ui("技能：")}</strong>{q.skillIds.map(id => ui(pack.skills.find(s => s.id === id)?.name ?? id)).join(', ')}</p><p><strong>{ui("評分點：")}</strong>{q.scoring.map(s => ui('{0}，{1} 分{2}',[s.id,s.marks,s.critical?ui('，關鍵條件'):''])).join('; ')}</p><p className="small muted">{ui("來源：{0}", [q.source])}</p>{pack.reviews.filter(r => r.questionId === q.id).map(r => <p key={r.userId} className="review-receipt">✓ {r.reviewer} · {r.method} · {new Date(r.at).toLocaleString(interfaceLocale())}</p>)}{pack.status === 'draft' && <><label className="field"><span>{ui("本次如何核對答案、步驟及標籤？")}</span><textarea value={method} onChange={e => setMethod(e.target.value)} rows={3} placeholder={ui("請先獨立解題，再記下核對方法、等價答案或仍有疑問的地方。")}/></label><label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>{ui("我已實際檢查此題的條件、答案、評分點及技能標籤")}</label><button className="btn primary" disabled={busy || !confirmed || method.trim().length < 8} onClick={() => void action(async () => { await api(`/admin/content/${pack.id}/${pack.version}/review`, 'POST', { questionId: q.id, method, confirmed }); setConfirmed(false); setMethod(''); await load(); toast('已記錄本帳戶的復核；發布仍需第二個不同帳戶'); })}>{ui("保存這一題的復核")}</button></>}</div>}</>}</section><section className="card pilot-card"><h2>{ui("匯入新的審核版本")}</h2><p className="muted">{ui("可匯入完整 JSON 內容包，或用選中內容包作技能與教學範本匯入 CSV。先校驗預覽，再確認新增草稿；不覆寫已發布版本。")}</p><input type="file" accept=".csv,.json,text/csv,application/json" onChange={e => { const file = e.target.files?.[0]; if (file)
        void file.text().then(text => { setImportText(text); setCsv(file.name.toLowerCase().endsWith('.csv')); setValidation(null); }); }}/><label className="field"><span>{ui("內容（亦可直接貼上）")}</span><textarea rows={6} value={importText} onChange={e => { setImportText(e.target.value); setValidation(null); }}/></label><label className="checkbox-label"><input type="checkbox" checked={csv} onChange={e => { setCsv(e.target.checked); setValidation(null); }}/>{ui("CSV 格式，使用所選內容包的下一版本")}</label><div className="pilot-actions"><button className="btn secondary" disabled={busy || !importText.trim()} onClick={() => void action(async () => setValidation(await api('/admin/content/import', 'POST', { ...importBody(), preview: true })))}>{ui("校驗與預覽")}</button><button className="btn primary" disabled={busy || !validation?.valid} onClick={() => void action(async () => { await api('/admin/content/import', 'POST', { ...importBody(), preview: false }); setValidation(null); setImportText(''); await load(); toast('新版本草稿已建立，仍需逐題復核'); })}>{ui("確認匯入草稿")}</button></div>{validation && <p>{validation.valid ? ui("校驗通過：{0} v{1}，{2} 題。尚未發布。", [validation.pack.title, validation.pack.version, validation.pack.questions.length]) : validation.errors?.join('；')}</p>}</section></>}
    {tab === 'users' && developer && <section className="card pilot-card"><h2>{ui("分配邀請帳戶")}</h2><form onSubmit={e => { e.preventDefault(); void action(async () => { await api('/admin/users', 'POST', account); setAccount({ username: '', name: '', password: '', role: 'student' }); await load(); toast('邀請帳戶已建立；請自行交給指定使用者'); }); }}><div className="form-grid"><label className="field"><span>{ui("帳戶名稱")}</span><input required pattern="[a-zA-Z0-9_.-]{2,40}" value={account.username} onChange={e => setAccount({ ...account, username: e.target.value })}/></label><label className="field"><span>{ui("顯示名字")}</span><input required maxLength={30} value={account.name} onChange={e => setAccount({ ...account, name: e.target.value })}/></label><label className="field"><span>{ui("初始密碼（至少 10 字元）")}</span><input required type="password" minLength={10} value={account.password} onChange={e => setAccount({ ...account, password: e.target.value })} autoComplete="new-password"/></label><label className="field"><span>{ui("角色")}</span><select value={account.role} onChange={e => setAccount({ ...account, role: e.target.value })}><option value="student">{ui("學生")}</option><option value="reviewer">{ui("內容復核者")}</option><option value="developer">{ui("開發者")}</option></select></label></div><button className="btn primary" disabled={busy}>{ui("建立帳戶")}</button></form>{users.map(u => <div className="pilot-list-row" key={u.id}><strong>{u.name}</strong><span>{u.role}</span><small>{u.username}</small></div>)}</section>}
    {tab === 'billing' && developer && <AdminBilling/>}{tab === 'usage' && developer && <AdminUsage/>}{tab === 'model' && developer && <ModelServiceSettings />}
    {tab === 'grading' && <section className="card pilot-card"><h2>{ui("需要人工核對的作答")}</h2>{!pending.length && <p>{ui("目前沒有待批改作答。")}</p>}{pending.map((row: any) => <ManualGrade key={`${row.userId}:${row.quizId}:${row.question.id}`} row={row} done={() => void load()}/>)}</section>}
  </div>;
}
function ManualGrade({ row, done }: {
    row: any;
    done: () => void;
}) { useInterfaceLanguage(); const { toast } = useApp(); const [awarded, setAwarded] = useState(''), [feedback, setFeedback] = useState(''), [critical, setCritical] = useState(false), [busy, setBusy] = useState(false); return <article className="review-question"><Badge>{row.studentName} · {row.quizId}</Badge><h3>{row.question.prompt}</h3><p>{ui("作答：{0}", [row.answer?.value])}</p><p>{ui("步驟：{0}", [row.answer?.steps])}</p><p>{ui("參考答案：{0}", [row.question.answer])}</p>{row.attachmentUrl && <a className="text-link" href={row.attachmentUrl} target="_blank" rel="noreferrer">{ui("查看此作答附件")}</a>}<label className="field"><span>{ui("得分（滿分 {0}）", [row.question.marks])}</span><input type="number" min={0} max={row.question.marks} value={awarded} onChange={e => setAwarded(e.target.value)}/></label><label className="field"><span>{ui("依評分點給出回饋")}</span><textarea value={feedback} onChange={e => setFeedback(e.target.value)}/></label><label className="checkbox-label"><input type="checkbox" checked={critical} onChange={e => setCritical(e.target.checked)}/>{ui("關鍵評分條件通過")}</label><button className="btn primary" disabled={busy || awarded === '' || feedback.trim().length < 8} onClick={async () => { setBusy(true); try {
    await api('/admin/grading', 'POST', { userId: row.userId, quizId: row.quizId, questionId: row.question.id, awarded: Number(awarded), feedback, criticalPassed: critical });
    done();
    toast('人工批改及證據已保存');
}
catch (e) {
    toast((e as Error).message, 'error');
}
finally {
    setBusy(false);
} }}>{ui("保存批改")}</button></article>; }
function LessonReview({ pack, index, done }: {
    pack: ContentPack;
    index: number;
    done: () => Promise<void>;
}) { useInterfaceLanguage(); const { toast } = useApp(); const [method, setMethod] = useState(''), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false); const id = 'lesson-' + index, lesson = pack.lessons[index]; return <details className="review-question"><summary>{ui("教學段落 {0}：{1} · {2} 人復核", [index + 1, lesson.title, new Set(pack.reviews.filter(r => r.questionId === id).map(r => r.userId)).size])}</summary><p>{lesson.text}</p>{pack.status === 'draft' && <><label className="field"><span>{ui("本段的概念、示例及步驟如何核對？")}</span><textarea value={method} onChange={e => setMethod(e.target.value)}/></label><label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>{ui("已實際核對本段教材與示例，疑問已處理")}</label><button className="btn secondary" disabled={busy || !confirmed || method.trim().length < 8} onClick={async () => { setBusy(true); try {
    await api('/admin/content/' + pack.id + '/' + pack.version + '/review', 'POST', { questionId: id, method, confirmed });
    setMethod('');
    setConfirmed(false);
    await done();
    toast('已保存這一段教材的復核');
}
catch (e) {
    toast((e as Error).message, 'error');
}
finally {
    setBusy(false);
} }}>{ui("保存本段復核")}</button></>}</details>; }
