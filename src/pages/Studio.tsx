import { ui, systemLabel, useInterfaceLanguage } from "../i18n";
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, realMode } from '../api/client';
import { useApp } from '../state';
import { Badge, Modal, PageHeading, Progress } from '../components';
import { AiCostNotice } from './Billing';
import { StudyReportButton } from './StudyWidgets';
import type { StudyAttempt, StudyQuizView, StudioSubject } from '../studio-types';
import type { Grade, PlanPreview } from '../types';
export function StudioPage() {
    useInterfaceLanguage();
    const { db, mutate, refresh, toast } = useApp(), navigate = useNavigate();
    const [params] = useSearchParams();
    const [subject, setSubject] = useState<StudioSubject>('maths'), [count, setCount] = useState(3), [target, setTarget] = useState<Grade>('3'), [minutes, setMinutes] = useState(30), [quiz, setQuiz] = useState<StudyQuizView | null>(null), [answers, setAnswers] = useState<Record<string, {
        value: string;
        steps: string;
    }>>({}), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [hint, setHint] = useState<Record<string, string>>({}), [material, setMaterial] = useState(''), [preview, setPreview] = useState<PlanPreview | null>(null), [dispute, setDispute] = useState<StudyAttempt | null>(null), [reason, setReason] = useState('');
    const abort = useRef<AbortController | null>(null), requestId = useRef<string | null>(null), requestSignature = useRef('');
    const studio = db.studio, unit = studio?.units.find(u => u.subjectId === subject);
    const owner = db.pilot?.identity.id ?? 'demo', key = quiz ? `hokse.studio.${owner}.${quiz.id}` : '';
    useEffect(() => () => abort.current?.abort(), []);
    useEffect(() => { const id = params.get('quiz'), q = studio?.quizzes.find(q => q.id === id), s = params.get('subject'); if (q) {
        setQuiz(q);
        setSubject(q.subjectId);
    }
    else if (['chi', 'eng', 'maths'].includes(s ?? ''))
        setSubject(s as StudioSubject); }, [params.get('quiz'), params.get('subject'), !!studio]);
    useEffect(() => { setTarget(db.profile.targetGrades[subject] ?? '3'); }, [subject]);
    useEffect(() => { if (!quiz)
        return; let draft = {}; try {
        draft = JSON.parse(localStorage.getItem(key) ?? '{}');
    }
    catch { } setAnswers(quiz.submittedAt ? quiz.answers : { ...quiz.answers, ...draft }); setHint({}); }, [quiz?.id]);
    useEffect(() => { if (quiz && !quiz.submittedAt)
        try {
            localStorage.setItem(key, JSON.stringify(answers));
        }
        catch { } }, [answers, key, quiz?.submittedAt]);
    if (!realMode || !studio || !unit)
        return <section className="card pilot-card"><h1>{ui("三科自主學習")}</h1><p>{ui("請使用邀請制真實版本登入。示範版不會呼叫AI或產生真實評估。")}</p><Link to="/help">{ui("查看使用指南")}</Link></section>;
    async function create(purpose: 'quick' | 'assessment', source: 'fixed' | 'ai') {
        setBusy(true);
        setNotice('');
        abort.current = new AbortController();
        const signature = JSON.stringify({ subject, count, purpose, source });
        if (requestSignature.current !== signature) {
            requestId.current = null;
            requestSignature.current = signature;
        }
        requestId.current ??= crypto.randomUUID();
        try {
            const result = await api('/studio/quizzes', 'POST', { subjectId: subject, count, purpose, source, requestId: requestId.current }, abort.current.signal);
            if (result.quiz === null) {
                setNotice(result.notice + '\n' + result.text);
                requestId.current = null;
                return;
            }
            setQuiz(result);
            setAnswers(result.answers);
            requestId.current = null;
            await refresh();
        }
        catch (e) {
            setNotice((e as Error).name === 'AbortError' ? '已停止；原有紀錄保留。' : (e as Error).message);
        }
        finally {
            setBusy(false);
            abort.current = null;
        }
    }
    async function submit() { if (!quiz)
        return; setBusy(true); setNotice(''); try {
        await api(`/studio/quizzes/${quiz.id}/answers`, 'PUT', { answers });
        const result = await api<StudyQuizView>(`/studio/quizzes/${quiz.id}/submit`, 'POST', {});
        setQuiz(result);
        localStorage.removeItem(key);
        await refresh();
    }
    catch (e) {
        setNotice((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function openChat(mode: 'reading' | 'writing' | 'solve') {
        setBusy(true);
        try {
            const c = await mutate('/chats', 'POST', { topicId: unit!.topicId, mode, title: unit!.title });
            const prompt = mode === 'writing' ? `請針對以下文字的內容、結構與表達給修改建議，不必提供官方等級：\n${material}` : mode === 'reading' ? `請導讀以下材料或本單元參考，最後附兩道隨堂小題，直接回覆即可：\n${material || unit!.lesson}` : `請幫我理解以下問題，先提示方法再給一個隨堂練習：\n${material || unit!.lesson}`;
            navigate(`/learn/${c.id}`, { state: { initialPrompt: prompt } });
        }
        catch { }
        finally {
            setBusy(false);
        }
    }
    async function plan(maintain = false) { setBusy(true); try {
        setPreview(await api('/plans/preview', 'POST', maintain ? { maintainTopic: unit!.topicId, subjectFocus: db.profile.subjects.filter(s => s !== subject) } : { subjectFocus: [subject] }));
    }
    catch (e) {
        toast((e as Error).message, 'error');
    }
    finally {
        setBusy(false);
    } }
    const skills = studio.skills.filter(s => s.subjectId === subject), paused = skills.some(s => s.paused);
    return <div className="page-enter studio-page"><PageHeading eyebrow="YOUR NEXT SMALL STEP" title={ui("今天，先弄懂一件事。")} description={ui("數學、中文與英文的自主學習輔助。大學目標可以之後再填。")} action={<StudyReportButton />}/>
 <div className="studio-grid"><section className="card pilot-card"><h2>{ui("選一個學習起點")}</h2><div className="form-grid"><label className="field"><span>{ui("學科")}</span><select value={subject} disabled={busy} onChange={e => { setSubject(e.target.value as StudioSubject); requestId.current = null; }}><option value="maths">{ui("數學")}</option><option value="chi">{ui("中文")}</option><option value="eng">{ui("英文")}</option></select></label><label className="field"><span>{ui("自己的目標等級")}</span><select value={target} onChange={e => setTarget(e.target.value as Grade)}>{['2', '3', '4', '5', '5*', '5**'].map(g => <option key={g} value={g}>{g}</option>)}</select></label><label className="field"><span>{ui("每天可用時間（分鐘）")}</span><input type="number" min={0} max={480} value={minutes} onChange={e => setMinutes(Number(e.target.value))}/></label><label className="field"><span>{ui("起步題數")}</span><select value={count} disabled={busy} onChange={e => { setCount(Number(e.target.value)); requestId.current = null; }}>{[3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label></div><button className="btn secondary" disabled={busy} onClick={() => void mutate('/profile', 'PATCH', { targetGrades: { ...db.profile.targetGrades, [subject]: target }, dailyMinutes: Array(7).fill(minutes) }).then(() => toast('已保存目標與每日時間；仍可在目標頁逐天調整')).catch(() => { })}>{ui("保存目標與時間")}</button><p className="small muted">{ui("整科成績可留空；小題只反映涉及技能，不換算整科等級。此設定會覆蓋七天預算，逐日設定可到")}<Link to="/goals">{ui("目標頁")}</Link>{ui("調整。")}</p>
 <h3>{ui(unit.title)}</h3><p className="studio-lesson">{unit.lesson}</p><Badge>{ui("原創學習參考 · 不是官方定級")}</Badge>
 {paused && <div className="info-callout amber"><p>{ui("同一技能連續遇到困難。先看上方例子、換個方法或休息，不自動追加題目。")}</p><button className="btn secondary" onClick={() => void mutate('/studio/resume', 'POST', { subjectId: subject }).then(() => toast('已記錄主動繼續；舊弱項仍保留')).catch(() => { })}>{ui("看過示例，主動繼續")}</button></div>}
 <div className="studio-actions"><button className="btn secondary" disabled={busy || paused} onClick={() => void create('quick', 'fixed')}>{ui("固定隨堂練習")}</button><button className="btn secondary" disabled={busy || paused} onClick={() => void create('assessment', 'fixed')}>{ui("固定獨立小測")}</button><button className="btn secondary" disabled={busy || paused} onClick={() => void create('quick', 'ai')}>{ui("AI隨堂練習 · 快速")}</button><button className="btn primary" disabled={busy || paused} onClick={() => void create('assessment', 'ai')}>{ui("生成獨立小測")}</button></div><p className="small muted">{ui("只有AI獨立小測生成會檢查及有限返工。隨堂練習一次生成；固定練習無需AI。未配置模型時，主觀題只顯示參考要點。首期AI數學小測驗算二次方程求根；建模與步驟可用固定題及講解。")}</p>{busy && <div role="status">{ui("正在處理…")}{abort.current && <button className="btn ghost" onClick={() => abort.current?.abort()}>{ui("停止生成")}</button>}</div>}
 <label className="field"><span>{ui("貼上文章、作文或想問的問題（可留空）")}</span><textarea rows={4} maxLength={8000} value={material} onChange={e => setMaterial(e.target.value)}/></label><div className="studio-actions"><button className="btn ghost" disabled={busy} onClick={() => void openChat(subject === 'maths' ? 'solve' : 'reading')}>{ui("導讀／講解＋隨堂題")}</button>{subject !== 'maths' && <button className="btn ghost" disabled={busy || !material.trim()} onClick={() => void openChat('writing')}>{ui("寫作建議")}</button>}</div>
 </section><aside><section className="card pilot-card"><h2>{ui("我的暫定技能")}</h2>{skills.map(s => <div className="studio-skill" key={s.id}><strong>{ui(s.name)}</strong><Badge>{ui(s.label)}</Badge><small>{ui("{0}次可用回饋 · {1}類獨立題 · {2}", [s.count, s.independentCount, s.score === null ? ui("未評估") : ui("{0}%參考", [s.score])])}</small>{s.score !== null && <Progress value={s.score}/>}</div>)}<p className="small muted">{ui("快速練習可幫助推薦；獨立新題與跨時段復測再增強判斷。提示、重複題和被質疑的回饋不增加可靠獨立證據。")}</p><button className="btn primary" disabled={busy} onClick={() => void plan()}>{ui("預覽下一步與兩週計劃")}</button></section><section className="card pilot-card"><h3>{ui("繼續之前的練習")}</h3>{studio.quizzes.slice(0, 8).map(q => <button className="studio-history" key={q.id} onClick={() => { setQuiz(q); setSubject(q.subjectId); }}><strong>{ui(q.title)}</strong><small>{q.submittedAt ? ui("查看回饋") : ui("繼續作答")} · {q.source === 'ai' ? ui("AI原創") : ui("固定參考")}</small></button>)}<Link to="/pilot">{ui("已審校題庫與原有流程")}</Link></section></aside></div>
 {notice && <div className="info-callout amber studio-notice" role="status"><p>{ui(notice)}</p></div>}
 <AiCostNotice/>{quiz && <section className="card pilot-card"><div className="row-between"><h2>{ui(quiz.title)}</h2><Badge>{quiz.purpose === 'quick' ? ui("隨堂輔助") : ui("獨立小測")} · {quiz.source === 'ai' ? ui("AI原創／{0}次生成", [quiz.generationAttempts]) : ui("固定原創")}</Badge></div>{quiz.questions.map((q, i) => { const a = answers[q.id] ?? { value: '', steps: '' }, f = quiz.results.find(a => a.itemId === q.id); return <article className="studio-question" key={q.id}><h3>{i + 1}. {q.prompt}</h3>{q.passage && <blockquote>{q.passage}</blockquote>}{quiz.submittedAt ? <><p>{ui("你的答案：{0}", [quiz.answers[q.id]?.value || ui("未作答")])}</p>{f && <><Badge>{f.disputed ? ui("已標記待糾正") : f.feedback.score === null ? ui("尚未判定") : ui("{0}% 參考", [f.feedback.score])}</Badge><p>{ui(f.feedback.text)}</p><p className="small muted">{ui(f.feedback.reason)} · {f.feedback.source === 'ai' ? ui("AI參考") : f.feedback.source === 'code' ? ui("代碼核對參考答案") : ui("沒有採用評分")} · {f.independent ? ui("本次為獨立新題") : ui("隨堂／重複／輔助作答")}</p><button className="btn ghost" onClick={() => { setDispute(f); setReason(''); }}>{ui("這個回饋有問題")}</button></>}</> : <>{q.kind === 'choice' ? <div className="answer-options">{q.options?.map((o, n) => <button className={`answer-option ${a.value === String.fromCharCode(65 + n) ? 'selected' : ''}`} key={n} onClick={() => setAnswers(old => ({ ...old, [q.id]: { ...a, value: String.fromCharCode(65 + n) } }))}>{String.fromCharCode(65 + n)}. {o}</button>)}</div> : <label className="field"><span>{ui("你的答案")}</span><textarea rows={q.kind === 'short' ? 4 : 2} value={a.value} onChange={e => setAnswers(old => ({ ...old, [q.id]: { ...a, value: e.target.value } }))}/></label>}<label className="field"><span>{ui("步驟或判斷依據（可選）")}</span><textarea rows={2} value={a.steps} onChange={e => setAnswers(old => ({ ...old, [q.id]: { ...a, steps: e.target.value } }))}/></label><button className="btn ghost" disabled={busy} onClick={async () => { try {
        const h = await mutate(`/studio/quizzes/${quiz.id}/hint`, 'POST', { itemId: q.id });
        setHint(old => ({ ...old, [q.id]: h.hint }));
    }
    catch { } }}>{ui("給一點提示")}</button>{hint[q.id] && <p className="hint-box">{ui("{0}（已記錄輔助）", [hint[q.id]])}</p>}</>}</article>; })}{!quiz.submittedAt ? <div className="studio-actions"><AiCostNotice conditional/><button className="btn secondary" disabled={busy} onClick={() => void mutate(`/studio/quizzes/${quiz.id}/answers`, 'PUT', { answers }).then(() => toast('已保存，可之後繼續')).catch(() => { })}>{ui("保存作答")}</button><button className="btn primary" disabled={busy} onClick={() => void submit()}>{ui("提交並查看下一步")}</button></div> : <div className="studio-actions"><button className="btn primary" disabled={busy} onClick={() => void plan()}>{ui("查看下一步計劃")}</button><Link className="btn secondary" to="/review">{ui("每日復習")}</Link><button className="btn secondary" disabled={busy} onClick={() => void plan(true)}>{ui("預覽維持與轉科")}</button><Link className="btn ghost" to="/goals">{ui("查看目標／衝高情景")}</Link><button className="btn ghost" onClick={() => { setQuiz(null); setNotice(''); }}>{ui("繼續補強／選另一科")}</button></div>}</section>}
 {preview && <Modal title={ui("先看看，再放進日曆")} wide onClose={() => setPreview(null)}>{preview.weeks.map(w => <div className="pilot-list-row" key={w.week}><strong>{ui("第{0}週 · {1}", [w.week, systemLabel(w.title)])}</strong><span>{ui("{0}分鐘", [w.minutes])}</span></div>)}{preview.tasks.map(t => <div className="pilot-list-row" key={t.id}><span>{t.date} {t.start}</span><strong>{ui(t.title)}</strong><small>{ui(t.reason)}</small></div>)}{preview.unscheduled.map(t => <p key={t.id}>{ui(t.title)}：{ui(t.reason)}</p>)}<button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); try {
        await mutate('/plans/apply', 'POST', { previewId: preview.previewId });
        setPreview(null);
        navigate('/calendar');
    }
    catch { }
    finally {
        setBusy(false);
    } }}>{ui("確認加入日曆")}</button></Modal>}
 {dispute && <Modal title={ui("留下需要修正的地方")} onClose={() => setDispute(null)}><p>{ui("標記後，這次回饋暫不參與技能計算；原作答與回饋仍保留。")}</p><textarea className="question-answer-input" rows={4} value={reason} onChange={e => setReason(e.target.value)} maxLength={1000}/><button className="btn primary" disabled={!reason.trim() || busy} onClick={async () => { setBusy(true); try {
        await mutate(`/studio/attempts/${dispute.id}/dispute`, 'POST', { reason });
        if (quiz)
            setQuiz(await api(`/studio/quizzes/${quiz.id}`));
        setDispute(null);
    }
    catch { }
    finally {
        setBusy(false);
    } }}>{ui("保存糾正記錄")}</button></Modal>}
 </div>;
}
