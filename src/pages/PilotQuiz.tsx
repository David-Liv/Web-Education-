import { AiCostNotice } from './Billing';
import { boardForSubject } from '../forum-types';
import { ui, interfaceLocale, useInterfaceLanguage } from "../i18n";
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../state';
import { api, getQuiz } from '../api/client';
import { AttachmentPreview, Badge, MediaInput, PageHeading, Progress } from '../components';
import type { Answer, PublicQuestion, Quiz } from '../types';
export function PilotQuizPage() { useInterfaceLanguage(); const { quizId } = useParams(); return quizId ? <Session key={quizId} id={quizId}/> : <Setup />; }
function Setup() { useInterfaceLanguage(); const { db, mutate, toast } = useApp(), navigate = useNavigate(); const [params] = useSearchParams(); const [topic, setTopic] = useState(params.get('topicId') ?? (params.get('subjectId') === 'chem' ? 'chem-acids' : 'maths-quadratic')), [kind, setKind] = useState(params.get('kind') ?? 'practice'), [count, setCount] = useState(5), [busy, setBusy] = useState(false); return <div className="page-enter"><AiCostNotice/><PageHeading eyebrow="PRACTISE WITH A PURPOSE" title={ui("給理解一次獨立作答的機會。")} description={ui("正式證據使用已復核的題目。未答、答錯與待批改分開記錄。")}/><section className="card pilot-card"><div className="form-grid"><label className="field"><span>{ui("已發布單元")}</span><select value={topic} onChange={e => setTopic(e.target.value)}>{db.pilot?.content.map(p => <option value={p.topicId} key={p.id}>{ui(p.title)}</option>)}</select></label><label className="field"><span>{ui("練習方式")}</span><select value={kind} onChange={e => setKind(e.target.value)}><option value="practice">{ui("獨立練習")}</option><option value="diagnostic">{ui("10–15 分鐘單元摸底")}</option><option value="review">{ui("隔時復測")}</option><option value="timed">{ui("12 分鐘限時小測")}</option></select></label><label className="field"><span>{ui("題數（摸底按藍圖選題）")}</span><select value={count} onChange={e => setCount(Number(e.target.value))}>{[1, 3, 5, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}</select></label></div><button className="btn primary" disabled={busy || !db.pilot?.content.length} onClick={async () => { setBusy(true); try {
    const p = db.pilot?.content.find(p => p.topicId === topic);
    if (!p)
        throw new Error('請先選擇已發布內容');
    const r = await mutate('/quizzes', 'POST', { topicIds: [topic], subjectId: p.id === 'acids' ? 'chem' : 'maths', kind, count, durationMinutes: 12 });
    navigate(`/quizzes/${r.quiz.id}`);
}
catch (e) {
    toast((e as Error).message, 'error');
}
finally {
    setBusy(false);
} }}>{ui("開始練習")}</button>{!db.pilot?.content.length && <p>{ui("此帳戶尚未有可用的正式題庫；內容發布後即可開始。")}</p>}</section><section className="card pilot-card"><h2>{ui("繼續之前的練習")}</h2>{db.quizzes.slice().reverse().map(q => <Link className="pilot-list-row" key={q.id} to={`/quizzes/${q.id}`}><strong>{ui(q.title)}</strong><span>{q.submittedAt ? ui("查看結果") : ui("繼續作答")}</span><small>{new Date(q.startedAt).toLocaleString(interfaceLocale())}</small></Link>)}</section></div>; }
function Session({ id }: {
    id: string;
}) {
    useInterfaceLanguage();
    const { db, catalog, mutate, toast } = useApp(), navigate = useNavigate();
    const [loaded, setLoaded] = useState<{
        quiz: Quiz;
        questions: PublicQuestion[];
    } | null>(null), [answers, setAnswers] = useState<Record<string, Answer>>({}), [index, setIndex] = useState(0), [hint, setHint] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(''), [seconds, setSeconds] = useState(0);
    const answerRef = useRef(answers), submitted = useRef(false), initialized = useRef(false);
    answerRef.current = answers;
    const owner = db.pilot!.identity.id, key = `hokse.quiz-draft.${owner}.${id}`;
    useEffect(() => { void getQuiz(id).then(r => { setLoaded(r); submitted.current = !!r.quiz.submittedAt; let draft = {}; try {
        draft = JSON.parse(localStorage.getItem(key) ?? '{}');
    }
    catch { } setAnswers(r.quiz.submittedAt ? r.quiz.answers : { ...r.quiz.answers, ...draft }); initialized.current = true; }).catch(e => setError(e.message)); }, [id, key]);
    useEffect(() => { if (!initialized.current || submitted.current || !loaded)
        return; localStorage.setItem(key, JSON.stringify(answers)); const t = setTimeout(() => void api(`/quizzes/${id}/answers`, 'PUT', { answers }).then(() => setSaved('已保存')).catch(e => setSaved(e.message)), 600); return () => clearTimeout(t); }, [answers, id, key, loaded?.quiz.submittedAt]);
    async function submit() { if (submitted.current)
        return; submitted.current = true; setBusy(true); try {
        const quiz = await mutate<Quiz>(`/quizzes/${id}/submit`, 'POST', { answers: answerRef.current });
        setLoaded(old => old ? { ...old, quiz } : old);
        localStorage.removeItem(key);
    }
    catch (e) {
        submitted.current = false;
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    useEffect(() => { if (!loaded || loaded.quiz.submittedAt || loaded.quiz.kind !== 'timed')
        return; const tick = () => { const remain = Math.max(0, Math.ceil((Date.parse(loaded.quiz.startedAt) + loaded.quiz.durationMinutes * 60000 - Date.now()) / 1000)); setSeconds(remain); if (!remain && !submitted.current)
        void submit(); }; tick(); const t = setInterval(tick, 1000); return () => clearInterval(t); }, [loaded?.quiz.id, loaded?.quiz.submittedAt]);
    if (!loaded)
        return <section className="card pilot-card">{ui(error) || ui("正在取回你的測驗…")}</section>;
    const quiz = loaded.quiz;
    async function retry(skillId?: string) { setBusy(true); try {
        const r = await mutate('/quizzes', 'POST', { subjectId: quiz.subjectId, topicIds: quiz.topicIds, skillId, count: 1, kind: 'practice' });
        navigate(`/quizzes/${r.quiz.id}`);
    }
    catch { }
    finally {
        setBusy(false);
    } }
    if (quiz.submittedAt) {
        const marks = quiz.results ?? [], graded = marks.filter(m => m.awarded !== null), total = graded.reduce((n, m) => n + m.max, 0), awarded = graded.reduce((n, m) => n + (m.awarded ?? 0), 0), response = (quiz as any).response;
        return <div className="page-enter"><AiCostNotice/><PageHeading eyebrow="EVIDENCE YOU CAN UNDERSTAND" title={ui("看看這次學會了甚麼。")} description={ui("{0} · 已批改 {1}/{2} 題 · {3}", [ui(quiz.title), graded.length, marks.length, total ? ui("{0}/{1} 分", [awarded, total]) : ui("尚無正式分數")])}/><div className="pilot-banner"><strong>{ui("本次結果只涵蓋單元技能，不能直接換算 DSE 等級。")}</strong></div>{response?.skills && <section className="card pilot-card"><h2>{ui("本次技能證據")}</h2>{response.skills.map((s: any) => <div className="pilot-list-row" key={s.id}><strong>{ui(s.name)}</strong><Badge>{ui(s.label)}</Badge><small>{ui("{0} 道獨立題、{1} 類題目 · {2}", [s.count, s.families, s.delayed ? ui("已有隔時證據") : ui("仍待隔時復測")])}</small></div>)}</section>}{marks.map((m, i) => { const q = loaded.questions.find(q => q.id === m.questionId)!; const mistake = db.pilot?.errors.filter(e => e.questionId === q.id).at(-1); return <article className="card pilot-card" key={m.questionId}><div className="row-between"><Badge>{ui("第 {0} 題", [i + 1])}</Badge><Badge tone={m.state === 'unanswered' ? 'neutral' : m.correct ? 'green' : 'amber'}>{m.state === 'unanswered' ? ui("未作答 · 不當作不懂") : m.state === 'pending' ? ui("待人工批改") : m.correct ? ui("答對") : ui("待補強")}</Badge></div><h3>{q.prompt}</h3><p>{ui("你的答案：{0}", [quiz.answers[q.id]?.value || ui("未填寫")])}</p>{quiz.answers[q.id]?.steps && <p>{ui("你的步驟：{0}", [quiz.answers[q.id]?.steps])}</p>}<p>{ui("參考答案：{0}", [m.expected])}</p><p>{m.explanation}</p>{!db.evidence.some(e => e.quizId === id && e.questionId === q.id && e.independent) && <p className="small muted">{ui("本題沒有新增獨立證據，可能未答、待批改、使用過提示或已見過相同題目。")}</p>}{mistake && <div className="error-confirm"><p>{ui(mistake.observed)}</p>{mistake.candidates.map((c, i) => <p key={i}>{ui("候選：{0} — {1}", [ui(c.reason), ui(c.evidence)])}</p>)}<label className="field"><span>{ui("這次較接近哪種情況？你可以修正系統判斷")}</span><select value={mistake.selected ?? '不確定'} onChange={e => void mutate(`/wrong/${q.id}`, 'PATCH', { reason: e.target.value }).catch(() => { })}>{['不確定', '概念混淆', '運算失誤', '條件遺漏', '單位換算', '方法選擇', '輸入失誤', '前置知識不足'].map(s => <option key={s} value={s}>{ui(s)}</option>)}</select></label><button className="btn ghost" disabled={busy} onClick={() => void retry((q as any).skillIds?.[0])}>{ui("一道同類新題")}</button><button className="btn ghost" disabled={busy} onClick={async () => { setBusy(true); try {
            await mutate(`/wrong/${q.id}/analyse`, 'POST', {});
            toast('已更新錯因候選；請核對依據後再確認');
        }
        catch { }
        finally {
            setBusy(false);
        } }}>{ui("請 AI 提出錯因候選")}</button></div>}<div style={{ marginTop: 10 }}><Link className="text-link" to="/forum" state={{ composeDraft: { boardId: boardForSubject(quiz.subjectId, catalog.subjects), flair: 'help', title: '', questionRef: { sourceKind: 'quiz-result', subjectId: quiz.subjectId, topicName: catalog.topics.find(t => t.id === q.topicId)?.name, title: `${quiz.title} · Q${i + 1}`, promptExcerpt: q.prompt.slice(0, 260) } } }}>{ui("去討論區討論此題")}</Link></div></article>; })}{response?.nextStep && <section className="card pilot-card next-step"><Badge tone="green">{ui("下一步")}</Badge><h2>{ui("把這次發現，變成下一個小進步。")}</h2><p>{response.pausedSkills?.length ? ui("有技能需要先做前置補救，請回學習流程查看。") : ui("你可以繼續補弱，也可預覽把部分時間轉移到其他學科。整科是否達標仍依學校或完整模擬試。")}</p><div className="pilot-actions"><Link className="btn primary" to="/pilot">{ui("繼續補強／前置補救")}</Link><Link className="btn secondary" to={`/pilot?maintain=${encodeURIComponent(quiz.topicIds[0])}`}>{ui("預覽維持與時間調配")}</Link><Link className="btn secondary" to="/goals">{ui("查看較高目標情景")}</Link></div></section>}<div className="pilot-actions"><Link className="btn primary" to="/review">{ui("每日復習")}</Link><Link className="btn secondary" to="/pilot">{ui("查看學習與計劃")}</Link><Link className="btn ghost" to="/quizzes">{ui("所有練習")}</Link></div></div>;
    }
    const q = loaded.questions[index], answer = answers[q.id] ?? { value: '' };
    const update = (patch: Partial<Answer>) => { setSaved('保存中…'); setAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] ?? { value: '' }), ...patch } })); };
    return <div className="page-enter quiz-session"><Link className="back-link" to="/quizzes">{ui("保存並返回")}</Link><AiCostNotice/><PageHeading eyebrow="TAKE YOUR TIME" title={ui(quiz.title)} description={quiz.kind === 'diagnostic' ? ui("建議 10–15 分鐘，可保存後繼續；未答技能保留未知。") : quiz.kind === 'timed' ? ui("剩餘 {0}:{1}，到時提交已保存答案。", [Math.floor(seconds / 60), String(seconds % 60).padStart(2, '0')]) : ui("先獨立思考，必要時可以使用提示。")}/><Progress value={(index + 1) / loaded.questions.length * 100}/><section className="card pilot-card"><div className="question-dots">{loaded.questions.map((q, n) => <button className={n === index ? 'active' : answers[q.id]?.value ? 'answered' : ''} key={q.id} onClick={() => setIndex(n)}>{n + 1}</button>)}</div><p className="small muted">{ui("第 {0}/{1} 題 · {2}", [index + 1, loaded.questions.length, ui(saved)])}</p><h2>{q.prompt}</h2>{q.kind === 'choice' ? <div className="answer-options">{q.options?.map((o, n) => <button key={n} className={`answer-option ${answer.value === String.fromCharCode(65 + n) ? 'selected' : ''}`} onClick={() => update({ value: String.fromCharCode(65 + n) })}><span className="answer-letter">{String.fromCharCode(65 + n)}</span>{o}</button>)}</div> : <label className="field"><span>{ui("你的答案")}</span><input value={answer.value} onChange={e => update({ value: e.target.value })} aria-label={ui("你的答案")}/></label>}<label className="field"><span>{(q as any).requiresSteps ? ui("請附關鍵步驟（會由復核者核對）") : ui("簡短步驟或判斷依據（有助釐清錯因）")}</span><textarea rows={3} value={answer.steps ?? ''} onChange={e => update({ steps: e.target.value })} placeholder={ui("例如：先換成 dm³，再使用 n=cV")}/></label><MediaInput onAttached={a => update({ attachmentId: a.id })}/>{answer.attachmentId && db.attachments.find(a => a.id === answer.attachmentId) && <AttachmentPreview attachment={db.attachments.find(a => a.id === answer.attachmentId)!}/>}<div className="pilot-actions"><button className="btn ghost" disabled={busy || quiz.kind === 'timed'} onClick={async () => { setBusy(true); try {
        const r = await mutate(`/quizzes/${id}/hint`, 'POST', { questionId: q.id });
        setHint(h => ({ ...h, [q.id]: r.hint }));
        update({ hinted: true });
    }
    catch { }
    finally {
        setBusy(false);
    } }}>{ui("需要一點提示")}</button><button className="btn secondary" disabled={!index} onClick={() => setIndex(index - 1)}>{ui("上一題")}</button>{index < loaded.questions.length - 1 ? <button className="btn primary" onClick={() => setIndex(index + 1)}>{ui("下一題")}</button> : <button className="btn primary" disabled={busy} onClick={() => void submit()}>{ui("提交並查看發現")}</button>}</div>{hint[q.id] && <div className="hint-box"><p>{hint[q.id]}</p><small>{ui("服務端已記錄提示；本題不列入獨立掌握證據。")}</small></div>}{error && <p className="form-error" role="alert">{ui(error)}</p>}</section></div>;
}
