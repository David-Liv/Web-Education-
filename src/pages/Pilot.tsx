import { AiCostNotice } from './Billing';
import { ui, useInterfaceLanguage } from "../i18n";
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useApp } from '../state';
import { Badge, Icon, PageHeading, Progress } from '../components';
import { gradeOrder } from '../domain';
import type { ContentPack, VersionedPreview } from '../pilot-types';
export function PilotPage() {
    useInterfaceLanguage();
    const { db, mutate, toast, refresh } = useApp(), navigate = useNavigate();
    const [params] = useSearchParams();
    const [lesson, setLesson] = useState<Pick<ContentPack, 'topicId' | 'title' | 'lessons'> | null>(null), [busy, setBusy] = useState(false), [preview, setPreview] = useState<VersionedPreview | null>(null), [explanation, setExplanation] = useState('');
    useEffect(() => { void api('/plans/reconcile', 'POST', {}).then(r => { if (r.changed) {
        toast(`已在今天內調整 ${r.changed} 項未鎖定活動；總時長維持不變`);
        void refresh();
    } }).catch(() => { }); }, []);
    const info = db.pilot;
    async function start(topicId: string, kind = 'diagnostic', skillId?: string) { setBusy(true); try {
        const p = info?.content.find(p => p.topicId === topicId);
        const result = await mutate('/quizzes', 'POST', { subjectId: p?.id === 'acids' ? 'chem' : 'maths', topicIds: [topicId], kind, skillId, count: kind === 'diagnostic' ? 5 : 1 });
        navigate(`/quizzes/${result.quiz.id}`);
    }
    catch { }
    finally {
        setBusy(false);
    } }
    return <div className="page-enter"><AiCostNotice/><PageHeading eyebrow="ONE STEP YOU CAN SEE" title={ui("先找到起點，再把理解學紮實。")} description={ui("每個單元約 10–15 分鐘摸底。學習、獨立作答和隔時復測會留下不同的證據。")}/><div className="pilot-banner"><Icon name="leaf"/><div><strong>{ui("真實記錄 · 首期兩個單元")}</strong><p>{ui("成績由學校預估或完整模擬試提供；這裡的進展只涵蓋已測技能。AI 未設定時仍可學習教材和完成測驗。")}</p></div></div>
    {!info?.content.length && <section className="card pilot-card"><h2>{ui("教材正在完成復核")}</h2><p>{ui("二次方程及酸鹼與滴定需完成內容復核後，才開放正式摸底。你可以先設定目標與每日時間。")}</p><Link className="btn primary" to="/goals">{ui("設定我的目標")}</Link>{info?.identity.role !== 'student' && <Link className="btn secondary" to="/developer">{ui("前往內容復核")}</Link>}</section>}
    <div className="pilot-grid">{info?.content.map(p => <section className="card pilot-card" key={p.id}><Badge tone="green">{ui("內容 v{0} · 已發布", [p.version])}</Badge><h2>{ui(p.title)}</h2><p className="muted">{ui("從關鍵方法出發，完成後再選擇補弱或復測。")}</p><div className="pilot-actions"><button className="btn primary" disabled={busy} onClick={() => void start(p.topicId)}>{ui("開始 10–15 分鐘摸底")}</button><button className="btn secondary" onClick={() => void api(`/content/${p.topicId}`).then(setLesson).catch(e => toast(e.message, 'error'))}>{ui("閱讀教學")}</button><Link className="btn ghost" to={`/quizzes?subjectId=${p.id === 'acids' ? 'chem' : 'maths'}&topicId=${p.topicId}`}>{ui("自己選題")}</Link></div></section>)}</div>
    {lesson && <section className="card pilot-card"><div className="row-between"><h2>{lesson.title}</h2><button className="btn ghost" onClick={() => setLesson(null)}>{ui("收起")}</button></div>{lesson.lessons.map(l => <div key={l.title} className="lesson-block"><h3>{l.title}</h3><p>{l.text}</p></div>)}<button className="btn primary" onClick={() => void mutate('/events', 'POST', { topicId: lesson.topicId, type: 'lesson', minutes: 10 }).then(() => toast('已保存學習記錄，將加入回顧；閱讀不直接提升掌握狀態')).catch(() => { })}>{ui("完成閱讀，加入回顧")}</button></section>}
    {!!info?.skills.length && <section className="card pilot-card"><div className="section-title"><h2>{ui("每項技能的證據")}</h2><Badge>{ui("規則 pilot-1.0 · 初始參數")}</Badge></div><div className="skill-grid">{info.skills.map(s => <article className="skill-state" key={s.id}><div className="row-between"><strong>{ui(s.name)}</strong><Badge tone={s.label.startsWith('較穩定') ? 'green' : s.label === '需加強' ? 'amber' : 'neutral'}>{ui(s.label)}</Badge></div><Progress value={s.score ?? 0}/><p>{s.score === null ? ui("尚未評估") : ui("{0}% · {1} 道獨立題 · {2} 類題目", [s.score, s.count, s.families])}</p><small className="muted">{s.delayed ? ui("已有相隔至少 24 小時的證據") : ui("仍需隔時復測與不同題型證據")}</small></article>)}</div><p className="small muted">{ui("初步掌握至少兩題；較穩定需至少三題、兩類題目、相隔 24 小時及關鍵條件通過。這些是可修訂的初始規則。")}</p></section>}
    {info?.cycles.filter(c => c.paused).map(c => <section className="card pilot-card pause-card" key={c.skillId}><Badge tone="amber">{ui("先停一停")}</Badge><h3>{info.skills.find(s => s.id === c.skillId)?.name}</h3><p>{ui("這個補救周期已有兩次錯誤。先看看完整示例，或補前置能力，再決定下一步。")}</p><button className="btn secondary" onClick={() => void mutate('/remediation', 'POST', { skillId: c.skillId, action: 'worked-example' }).then(r => { setLesson({ topicId: r.topicId, title: r.title, lessons: r.lessons }); toast('已記錄補救動作，後續仍需不同新題驗證'); }).catch(() => { })}>{ui("查看教學與前置補救")}</button></section>)}
    <section className="card pilot-card"><h2>{ui("把下一步排進日曆")}</h2><p>{ui("先保留已完成、鎖定及到期回顧，再按目標、先修與可用時間安排。時間不足的項目會另外列出。")}</p><button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); try {
        setPreview(await api('/plans/preview', 'POST', { maintainTopic: params.get('maintain') || undefined }));
        setExplanation('');
    }
    catch (e) {
        toast((e as Error).message, 'error');
    }
    finally {
        setBusy(false);
    } }}>{ui("預覽 14 天計劃")}</button>{preview && <div className="preview-details"><h3>{ui("{0} 個活動 · {1} 分鐘", [preview.tasks.length, preview.tasks.reduce((n, t) => n + t.minutes, 0)])}</h3>{preview.tasks.map(t => <div className="pilot-list-row" key={t.id}><span>{t.date} {t.start}</span><strong>{ui(t.title)}</strong><span>{ui("{0} 分鐘", [t.minutes])}</span><small>{ui(t.reason)}</small></div>)}{preview.unscheduled.map(t => <p key={t.id} className="form-error">{ui("未排入：{0} — {1}", [t.title, t.reason])}</p>)}<div className="pilot-actions"><button className="btn primary" onClick={() => void mutate('/plans/apply', 'POST', { previewId: preview.previewId }).then(() => { setPreview(null); toast('已套用剛才預覽的版本'); }).catch(() => { })}>{ui("確認此版本")}</button><button className="btn secondary" disabled={busy} onClick={async () => { setBusy(true); try {
        setExplanation((await api('/plans/explain', 'POST', { previewId: preview.previewId })).explanation);
    }
    catch (e) {
        toast((e as Error).message, 'error');
    }
    finally {
        setBusy(false);
    } }}>{ui("請 AI 解釋取捨")}</button></div>{explanation && <p className="model-explanation">{explanation}</p>}</div>}</section>
    <StrategyPanel onPreview={setPreview}/>
  </div>;
}
function StrategyPanel({ onPreview }: {
    onPreview: (p: VersionedPreview) => void;
}) {
    useInterfaceLanguage();
    const { db, catalog, toast } = useApp();
    const [rows, setRows] = useState<Record<string, {
        low: string;
        high: string;
    }>>({}), [result, setResult] = useState<any>(null);
    const p = catalog.programmes.find(p => p.id === db.profile.primaryProgramme);
    const edges = Object.entries(db.profile.targetGrades).flatMap(([id, target]) => { const current = db.profile.grades[id]; if (!current || current === 'U' || !gradeOrder.includes(current) || !gradeOrder.includes(target))
        return []; return gradeOrder.slice(gradeOrder.indexOf(current), gradeOrder.indexOf(target)).map(from => ({ id, from, to: gradeOrder[gradeOrder.indexOf(from) + 1], key: `${id}:${from}` })); });
    return <section className="card pilot-card"><h2>{ui("科目提分情景比較")}</h2><p className="muted">{ui("{0} 每個組合重新計算 Best N。整科提分時間是另外填寫的假設，不由這兩個單元直接推算。", [p ? ui("主目標：{0}", [p.name]) : ui("先到升學目標選擇主目標課程。")])}</p>{edges.map(e => <div className="cost-row" key={e.key}><span>{catalog.subjects.find(s => s.id === e.id)?.short ?? e.id} {e.from} → {e.to}</span><label>{ui("最少小時")}<input type="number" min={0} value={rows[e.key]?.low ?? ''} onChange={x => setRows(r => ({ ...r, [e.key]: { low: x.target.value, high: r[e.key]?.high ?? '' } }))}/></label><label>{ui("最多小時")}<input type="number" min={0} value={rows[e.key]?.high ?? ''} onChange={x => setRows(r => ({ ...r, [e.key]: { low: r[e.key]?.low ?? '', high: x.target.value } }))}/></label></div>)}<button className="btn secondary" disabled={!p} onClick={async () => { try {
        const costs = edges.filter(e => rows[e.key]?.low !== '' && rows[e.key]?.high !== '' && rows[e.key]).map(e => ({ subjectId: e.id, from: e.from, to: e.to, hours: [Number(rows[e.key].low), Number(rows[e.key].high)], source: '使用者填寫的情景成本假設，未經校準' }));
        setResult(await api('/strategy', 'POST', { costs, budgetHours: db.profile.dailyMinutes.reduce((a, b) => a + b, 0) * 2 / 60 }));
    }
    catch (e) {
        toast((e as Error).message, 'error');
    } }}>{ui("比較兩週時間內的組合")}</button>{result && <div className="preview-details"><p>{ui("目前計分：{0} · {1}", [result.baseline ?? ui("資料不足"), result.missing ?? ui("以下依所填假設計算")])}</p>{result.conflicts?.length > 0 && <p className="form-error">{ui("目標與必要門檻衝突：{0}", [result.conflicts.join('、')])}</p>}{result.paths?.slice(0, 4).map((r: any, i: number) => <div className="pilot-list-row" key={i}><strong>{ui("方案 {0}：加權分情景 +{1}", [i + 1, r.gain])}</strong><span>{r.hours ? ui("{0}–{1} 小時", [r.hours[0], r.hours[1]]) : ui("成本待估")}</span><small>{Object.entries(r.grades).filter(([id, g]) => g !== db.profile.grades[id]).map(([id, g]) => `${id} → ${g}`).join('；') || ui("維持目前基準")} · {r.feasible === null ? ui("時間可行性未知") : r.feasible ? ui("按上限可排入情景預算") : ui("超出情景預算")}</small><button className="btn ghost" onClick={() => void api('/plans/preview', 'POST', { subjectFocus: Object.keys(r.grades).filter(id => r.grades[id] !== db.profile.grades[id]) }).then(p => { onPreview(p); toast('已產生對應科目優先的日曆預覽，請在上方檢視後確認'); }).catch(e => toast(e.message, 'error'))}>{ui("按這些科目優先預覽日曆")}</button></div>)}</div>}</section>;
}
export function PilotSettings() { useInterfaceLanguage(); const { db } = useApp(); return <div className="page-enter"><PageHeading eyebrow="YOUR OWN SPACE" title={ui("帳戶與學習設定")} description={ui("記錄保存於服務端，使用自己的邀請帳戶繼續。")}/><section className="card pilot-card"><h2>{db.profile.name}</h2><p>{db.pilot?.identity.username} · {db.pilot?.identity.role === 'student' ? ui("學生") : db.pilot?.identity.role === 'reviewer' ? ui("內容復核者") : ui("開發者")}</p><div className="pilot-actions"><Link className="btn primary" to="/goals">{ui("成績、目標與每日時間")}</Link>{db.pilot?.identity.role !== 'student' && <Link className="btn secondary" to="/developer">{ui("開發者與內容設定")}</Link>}<button className="btn secondary" onClick={async () => { const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = '我的學序記錄.json'; a.click(); URL.revokeObjectURL(url); }}>{ui("匯出我的記錄")}</button><button className="btn ghost" onClick={() => void api('/auth/logout', 'POST').then(() => { for (const key of Object.keys(localStorage))
    if (key.startsWith('hokse.quiz-draft.'))
        localStorage.removeItem(key); window.location.assign('/'); })}>{ui("登出")}</button></div><p className="small muted">{ui("真實帳戶使用香港日期；示範資料重設與演示時鐘只存在於演示模式。")}</p></section></div>; }
export function PilotMistakes() { useInterfaceLanguage(); const { db, catalog, mutate } = useApp(); const latest = [...new Map(db.pilot?.errors.map(e => [e.questionId, e])).values()]; return <div className="page-enter"><PageHeading eyebrow="MISTAKES ARE CLUES" title={ui("留下依據，慢慢解開卡住的地方。")} description={ui("訂正、錯因確認和較穩定掌握分開記錄；一次重答不會清除弱項歷史。")}/>{!latest.length && <section className="card pilot-card"><p>{ui("完成測驗後，有依據的錯誤會收進這裡。")}</p><Link className="btn primary" to="/quizzes">{ui("開始練習")}</Link></section>}{latest.map(e => <section className="card pilot-card" key={e.questionId}><div className="row-between"><h2>{catalog.topics.find(t => t.id === e.topicId)?.name}</h2><Badge>{e.status === 'uncertain' ? ui("原因待確認") : e.status === 'reviewed' ? ui("已有復核依據") : ui("學生已確認")}</Badge></div><p>{ui(e.observed)}</p>{e.candidates.map((c, i) => <p key={i}>{ui("候選：{0} — {1}（{2}）", [c.reason, c.evidence, c.source === 'ai' ? ui("AI 建議") : ui("規則依據")])}</p>)}<label className="field"><span>{ui("你認為較接近哪種情況？")}</span><select value={e.selected ?? '不確定'} onChange={x => void mutate(`/wrong/${e.questionId}`, 'PATCH', { reason: x.target.value }).catch(() => { })}>{['不確定', '概念混淆', '運算失誤', '條件遺漏', '單位換算', '方法選擇', '輸入失誤', '前置知識不足'].map(s => <option key={s} value={s}>{ui(s)}</option>)}</select></label><p className="small muted">{ui("已保留 {0} 次確認／修訂記錄。", [e.history.length])}</p><div className="pilot-actions"><Link className="btn secondary" to={`/quizzes/${e.quizId}`}>{ui("查看原作答與解析")}</Link><Link className="btn primary" to="/pilot">{ui("補弱與前置檢查")}</Link></div></section>)}</div>; }
