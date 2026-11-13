import { ui, useInterfaceLanguage } from "../i18n";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../state';
import { api, getQuiz } from '../api/client';
import { realMode } from '../api/client';
import { PilotQuizPage } from './PilotQuiz';
import { boardForSubject } from '../forum-types';
import { Badge, Empty, Icon, MediaInput, AttachmentPreview, Modal, NetworkError, PageHeading, Progress, SubjectIcon, Skeleton } from '../components';
import type { Answer, Attachment, PublicQuestion, Quiz } from '../types';
interface QuestionOption {
    id: string;
    topicId: string;
    paper: string;
    kind: string;
    difficulty: string;
}
export function QuizPage() { useInterfaceLanguage(); const { quizId } = useParams(); if (realMode)
    return <PilotQuizPage />; return quizId ? <QuizSession key={quizId} id={quizId}/> : <QuizSetup />; }
function QuizSetup() {
    useInterfaceLanguage();
    const { db, catalog, mutate, toast } = useApp();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [subject, setSubject] = useState(params.get('subjectId') ?? 'maths');
    const [topic, setTopic] = useState(params.get('topicId') ?? 'all');
    const [paper, setPaper] = useState('all');
    const [kind, setKind] = useState(params.get('kind') === 'diagnostic' ? 'diagnostic' : 'practice');
    const [questionKind, setQuestionKind] = useState('all');
    const [difficulty, setDifficulty] = useState('all');
    const [count, setCount] = useState(5);
    const [duration, setDuration] = useState(10);
    const [options, setOptions] = useState<QuestionOption[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(async () => { setError(''); try {
        setOptions(await api('/question-options'));
    }
    catch (e) {
        setError((e as Error).message);
    } }, []);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => { setSubject(params.get('subjectId') ?? 'maths'); setTopic(params.get('topicId') ?? 'all'); setKind(params.get('kind') === 'diagnostic' ? 'diagnostic' : 'practice'); setPaper('all'); }, [params.toString()]);
    const available = options.filter(q => catalog.topics.find(t => t.id === q.topicId)?.subjectId === subject && (topic === 'all' || q.topicId === topic) && (paper === 'all' || q.paper === paper) && (questionKind === 'all' || q.kind === questionKind) && (difficulty === 'all' || q.difficulty === difficulty));
    const subjectTopics = catalog.topics.filter(t => t.subjectId === subject && options.some(q => q.topicId === t.id));
    const papers = [...new Set(options.filter(q => catalog.topics.find(t => t.id === q.topicId)?.subjectId === subject).map(q => q.paper))];
    const counts = [...new Set([1, 3, 5, 10, Math.min(20, available.length)])].filter(n => n > 0 && n <= available.length).sort((a, b) => a - b);
    const actualCount = counts.includes(count) ? count : counts.at(-1) ?? 0;
    const start = async () => { setBusy(true); try {
        const result = await mutate<{
            quiz: Quiz;
            questions: PublicQuestion[];
        }>('/quizzes', 'POST', { subjectId: subject, topicIds: topic === 'all' ? [] : [topic], paper, questionKind, difficulty, count: actualCount, kind, durationMinutes: duration });
        navigate(`/quizzes/${result.quiz.id}`);
    }
    catch { }
    finally {
        setBusy(false);
    } };
    if (error)
        return <NetworkError error={error} retry={() => void load()}/>;
    return <div className="page-enter"><PageHeading eyebrow="PRACTISE WITH A PURPOSE" title={kind === 'diagnostic' ? ui("先認識自己，再決定下一步。") : ui("每一道題，都讓理解更清楚。")} description={kind === 'diagnostic' ? ui("短小測只涵蓋已開放的示例技能；不換算成預測 DSE 等級。") : ui("選一個知識點，給自己一次獨立思考的機會。")} action={<Link className="btn secondary" to="/mistakes"><Icon name="reset" size={16}/>{ui("從錯題開始")}</Link>}/><div className="quiz-layout"><section className="card quiz-config"><div className="section-title" style={{ marginTop: 0 }}><h2>{ui("建立你的練習")}</h2><Badge tone="green">{ui("原創演示題庫")}</Badge></div><div className="form-grid"><label className="field"><span>{ui("學科")}</span><select value={subject} onChange={e => { setSubject(e.target.value); setTopic('all'); setPaper('all'); setQuestionKind('all'); }}>{catalog.subjects.filter(s => s.ready).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="field"><span>{ui("知識點 / 模組")}</span><select value={topic} onChange={e => setTopic(e.target.value)}><option value="all">{ui("所有已開放的知識點")}</option>{subjectTopics.map(t => <option value={t.id} key={t.id}>{t.module === 'M1' || t.module === 'M2' ? t.module + ' · ' : ''}{t.name}</option>)}</select></label><label className="field"><span>{ui("試卷")}</span><select value={paper} onChange={e => setPaper(e.target.value)}><option value="all">{ui("不限試卷")}</option>{papers.map(p => <option key={p} value={p}>{p}</option>)}</select></label><label className="field"><span>{ui("題型")}</span><select value={questionKind} onChange={e => setQuestionKind(e.target.value)}><option value="all">{ui("混合題型")}</option><option value="choice">{ui("多項選擇")}</option><option value="numeric">{ui("數值計算")}</option><option value="short">{ui("短答 / 解釋")}</option><option value="essay">{ui("寫作任務")}</option><option value="audio">{ui("口語錄音")}</option></select></label><label className="field"><span>{ui("難度")}</span><select value={difficulty} onChange={e => setDifficulty(e.target.value)}><option value="all">{ui("所有程度")}</option><option value="基礎">{ui("基礎概念")}</option><option value="進階">{ui("進階應用")}</option></select></label><label className="field"><span>{ui("題量")}</span><select value={actualCount} onChange={e => setCount(Number(e.target.value))} disabled={!available.length}>{!counts.length ? <option value={0}>{ui("此組合暫無題目")}</option> : counts.map(n => <option key={n} value={n}>{ui("{0} 題", [n])}</option>)}</select></label><label className="field"><span>{ui("練習方式")}</span><select value={kind} onChange={e => setKind(e.target.value)}><option value="practice">{ui("自由練習")}</option><option value="timed">{ui("計時小測")}</option><option value="diagnostic">{ui("快速摸底")}</option></select></label><label className="field"><span>{ui("{0}（分鐘）", [kind === 'timed' ? ui("時間限制") : ui("建議時間")])}</span><input type="number" min={1} max={180} value={duration} onChange={e => setDuration(Math.max(1, Number(e.target.value)))}/></label></div><div className="info-callout"><Icon name="bulb"/><p>{ui("目前條件有 {0} 道演示題。選擇題與數值題會實際判分；文字、作文與口語題保留答案並提供標示清楚的示範回饋。", [available.length])}</p></div><button className="btn primary" disabled={busy || !actualCount} onClick={() => void start()}><Icon name="play" size={16}/>{busy ? ui("正在準備題目…") : ui("開始這次練習")}<Icon name="arrow" size={16}/></button>{!available.length && options.length > 0 && <p className="small muted" style={{ marginTop: 13 }}>{ui("可試試放寬題型或試卷篩選，亦可前往學科目錄查看已有內容。")}</p>}</section><aside className="quiz-side"><section className="quiz-feature"><h3><Icon name="compass" size={17}/>{ui("先摸底，再加強")}</h3><p>{ui("短練習幫你發現薄弱概念，沒有作答的知識點保持未評估。")}</p></section><section className="quiz-feature"><h3><Icon name="bulb" size={17}/>{ui("有提示，也有選擇")}</h3><p>{ui("自由練習可以看提示；使用提示的作答不列入獨立掌握證據。")}</p></section><section className="quiz-feature"><h3><Icon name="review" size={17}/>{ui("做完，接著溫習")}</h3><p>{ui("錯題與知識點會連到每日溫習，下一次就知道從哪裡開始。")}</p></section></aside></div><section className="quiz-history"><div className="section-title"><h2>{ui("繼續你的練習紀錄")}</h2><span className="small muted">{ui("草稿與計時會在重新整理後保留")}</span></div><div className="card">{db.quizzes.length ? db.quizzes.slice().reverse().slice(0, 8).map(q => <Link key={q.id} className="quiz-history-row" to={`/quizzes/${q.id}`}><SubjectIcon id={q.subjectId}/><div><strong>{ui(q.title)}</strong><small>{ui("{0} 題 · {1}", [q.questionIds.length, q.kind === 'timed' ? ui("計時小測") : q.kind === 'diagnostic' ? ui("快速摸底") : q.kind === 'review' ? ui("每日溫習") : ui("自由練習")])}</small></div><Badge tone={q.submittedAt ? 'green' : 'amber'}>{q.submittedAt ? ui("查看結果") : ui("繼續作答")}</Badge><Icon name="right" size={15}/></Link>) : <Empty icon="quiz" title={ui("第一份練習，從這裡開始。")} description={ui("選一個知識點，做幾題看看自己目前的理解。")}/>}</div></section></div>;
}
function QuizSession({ id }: {
    id: string;
}) {
    useInterfaceLanguage();
    const { db, catalog, mutate, toast } = useApp();
    const navigate = useNavigate();
    const [loaded, setLoaded] = useState<{
        quiz: Quiz;
        questions: PublicQuestion[];
    }>();
    const [error, setError] = useState('');
    const [answers, setAnswers] = useState<Record<string, Answer>>({});
    const [index, setIndex] = useState(0);
    const [remaining, setRemaining] = useState(0);
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [saved, setSaved] = useState('');
    const [hintOpen, setHintOpen] = useState(false);
    const answerRef = useRef(answers);
    const submitted = useRef(false);
    const timerSubmission = useRef(false);
    const initialized = useRef(false);
    const loadedRef = useRef(loaded);
    answerRef.current = answers;
    loadedRef.current = loaded;
    const load = useCallback(async () => { setError(''); try {
        const result = await getQuiz(id);
        setLoaded(result);
        let draft: Record<string, Answer> = {};
        try {
            draft = JSON.parse(localStorage.getItem(`hokse.quiz-draft.${id}`) ?? '{}');
        }
        catch { }
        setAnswers(result.quiz.submittedAt ? result.quiz.answers : { ...result.quiz.answers, ...draft });
        initialized.current = true;
        submitted.current = !!result.quiz.submittedAt;
        setRemaining(Math.max(0, result.quiz.durationMinutes * 60 - Math.floor((Date.now() - new Date(result.quiz.startedAt).getTime()) / 1000)));
    }
    catch (e) {
        setError((e as Error).message);
    } }, [id]);
    useEffect(() => { void load(); }, [load]);
    const submit = useCallback(async (auto = false) => { if (submitted.current)
        return; submitted.current = true; setBusy(true); try {
        const result = await mutate<Quiz>(`/quizzes/${id}/submit`, 'POST', { answers: answerRef.current });
        setLoaded(old => old ? { ...old, quiz: result } : old);
        setConfirm(false);
        localStorage.removeItem(`hokse.quiz-draft.${id}`);
        if (auto)
            toast('時間到，已提交目前作答並保留紀錄');
    }
    catch {
        submitted.current = false;
    }
    finally {
        setBusy(false);
    } }, [id, mutate]);
    useEffect(() => { if (!initialized.current || !loaded || loaded.quiz.submittedAt)
        return; const timer = setTimeout(() => { void api(`/quizzes/${id}/answers`, 'PUT', { answers }).then(() => setSaved('已自動儲存')).catch(e => setSaved(e.message)); }, 650); return () => clearTimeout(timer); }, [answers, loaded?.quiz.submittedAt, id]);
    useEffect(() => { if (!loaded || loaded.quiz.submittedAt || loaded.quiz.kind !== 'timed')
        return; const tick = () => { const seconds = Math.max(0, loaded.quiz.durationMinutes * 60 - Math.floor((Date.now() - new Date(loaded.quiz.startedAt).getTime()) / 1000)); setRemaining(seconds); if (seconds === 0 && !timerSubmission.current) {
        timerSubmission.current = true;
        void submit(true);
    } }; tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer); }, [loaded?.quiz.id, loaded?.quiz.submittedAt, submit]);
    useEffect(() => { setHintOpen(!!answers[loaded?.questions[index]?.id ?? '']?.hinted); }, [index, loaded?.quiz.id]);
    if (error)
        return <NetworkError error={error} retry={() => void load()}/>;
    if (!loaded)
        return <Skeleton rows={4}/>;
    const { quiz, questions } = loaded;
    const answered = Object.values(answers).filter(a => a.value.trim() || a.attachmentId).length;
    if (quiz.submittedAt) {
        const marks = quiz.results ?? [];
        const objective = marks.filter(m => m.awarded !== null);
        const total = objective.reduce((s, m) => s + m.max, 0);
        const awarded = objective.reduce((s, m) => s + (m.awarded ?? 0), 0);
        const pending = marks.filter(m => m.awarded === null).length;
        return <div className="quiz-session page-enter"><Link className="back-link" to="/quizzes"><Icon name="left" size={15}/>{ui("所有測驗")}</Link><div className="quiz-results-header"><div className="result-score">{total ? awarded : '—'}<small>{total ? `/${total}` : ''}</small></div><div><div className="eyebrow">EVERY ANSWER IS A NEW START</div><h2>{ui("每一次練習，都有值得留下的發現。")}</h2><p>{ui("{0} · 已批改 {1} / {2} 題{3}", [quiz.title, objective.length, marks.length, pending ? ui(" · {0} 題待正式批改", [pending]) : ''])}</p><p>{ui("知識點、錯題與每日溫習已同步更新。")}</p></div></div>{marks.map((mark, i) => { const q = questions.find(q => q.id === mark.questionId)!; return <article className="result-item" key={mark.questionId}><div className="row-between"><Badge>{i + 1} · {catalog.topics.find(t => t.id === q.topicId)?.name}</Badge><Badge tone={mark.correct === null ? 'amber' : mark.correct ? 'green' : 'red'}>{mark.correct === null ? ui("待批改 · 模擬回饋") : mark.correct ? ui("答對了") : ui("再想清楚一點")}{mark.awarded !== null ? ` ${mark.awarded}/${mark.max}` : ''}</Badge></div><h3>{q.prompt}</h3><div className="result-answer"><div><small>{ui("你的作答")}</small>{quiz.answers[q.id]?.value || (quiz.answers[q.id]?.attachmentId ? '已附上錄音／圖片' : '未作答')}</div><div><small>{mark.correct === null ? ui("示範作答方向") : ui("參考答案")}</small>{mark.expected}{q.kind === 'choice' && q.options ? ' · ' + q.options[mark.expected.charCodeAt(0) - 65] : ''}</div></div>{quiz.answers[q.id]?.attachmentId && db.attachments.find(a => a.id === quiz.answers[q.id].attachmentId) && <AttachmentPreview attachment={db.attachments.find(a => a.id === quiz.answers[q.id].attachmentId)!}/>}<p>{mark.explanation}</p>{quiz.answers[q.id]?.hinted && <p className="small muted" style={{ marginTop: 10 }}>{ui("這一題使用過提示，沒有列入獨立掌握證據。")}</p>}<div style={{ marginTop: 10 }}><Link className="text-link" to="/forum" state={{ composeDraft: { boardId: boardForSubject(quiz.subjectId, catalog.subjects), flair: 'help', title: '', questionRef: { sourceKind: 'quiz-result', subjectId: quiz.subjectId, topicName: catalog.topics.find(t => t.id === q.topicId)?.name, title: `${quiz.title} · Q${i + 1}`, promptExcerpt: q.prompt.slice(0, 260) } } }}><Icon name="forum" size={14}/>{ui("去討論區討論此題")}</Link></div></article>; })}<div className="result-actions"><Link className="btn primary" to="/review"><Icon name="review"/>{ui("回到每日溫習")}</Link><Link className="btn secondary" to={`/quizzes?subjectId=${quiz.subjectId}&topicId=${quiz.topicIds.length === 1 ? quiz.topicIds[0] : ''}`}><Icon name="reset"/>{ui("再練一組")}</Link><Link className="btn secondary" to="/calendar"><Icon name="calendar"/>{ui("看看接下來的計劃")}</Link><Link className="btn ghost" to="/start">{ui("繼續設定備試目標")}<Icon name="arrow" size={16}/></Link></div></div>;
    }
    const q = questions[index];
    const answer = answers[q.id] ?? { value: '' };
    const attachment = db.attachments.find(a => a.id === answer.attachmentId);
    const update = (patch: Partial<Answer>) => { setSaved('正在儲存…'); setAnswers(old => { const next = { ...old, [q.id]: { ...(old[q.id] ?? { value: '' }), ...patch } }; localStorage.setItem(`hokse.quiz-draft.${id}`, JSON.stringify(next)); answerRef.current = next; return next; }); };
    return <div className="quiz-session page-enter"><Link className="back-link" to="/quizzes"><Icon name="left" size={15}/>{ui("儲存並返回測驗")}</Link><header className="quiz-session-header"><div><div className="eyebrow">TAKE YOUR TIME, THINK IT THROUGH</div><h1>{ui(quiz.title)}</h1><p>{ui("{0} · {1} 題 · {2}", [ui(q.paper), quiz.questionIds.length, quiz.kind === 'timed' ? ui("到時將提交當前作答") : ui("自由練習，先想清楚再作答")])}</p></div>{quiz.kind === 'timed' ? <span className={`timer-pill ${remaining < 60 ? 'urgent' : ''}`}><Icon name="clock" size={16}/>{Math.floor(remaining / 60).toString().padStart(2, '0')}:{(remaining % 60).toString().padStart(2, '0')}</span> : <Badge tone="green"><Icon name="leaf" size={12}/>{ui("跟著自己的步伐")}</Badge>}</header><Progress value={answered / questions.length * 100}/><div className="question-layout" style={{ marginTop: 23 }}><aside className="card question-navigator"><h3>{ui("我的作答進度")}</h3><div className="question-dots">{questions.map((question, i) => <button key={question.id} className={`${i === index ? 'active' : ''} ${answers[question.id]?.value || answers[question.id]?.attachmentId ? 'answered' : ''}`} onClick={() => setIndex(i)} aria-label={ui("前往第 {0} 題", [i + 1])}>{i + 1}</button>)}</div><small>{ui("{0}/{1} 題已作答", [answered, questions.length])}</small><small>{saved || ui("草稿會自動保存")}</small></aside><article className="card question-card"><div className="question-number"><span>QUESTION {String(index + 1).padStart(2, '0')} / {String(questions.length).padStart(2, '0')}</span><Badge>{ui("{0} 分 · {1}", [q.marks, q.difficulty])}</Badge></div><h2>{q.prompt}</h2>{q.passage && <div className="passage">{q.passage}</div>}{q.audio && <div className="audio-lesson"><Icon name="headphones"/><div><strong>{ui("Green Fair · 原創示範錄音")}</strong><audio controls src={q.audio}/></div></div>}{q.kind === 'choice' ? <div className="answer-options">{q.options?.map((option, i) => { const letter = String.fromCharCode(65 + i); return <button key={letter} className={`answer-option ${answer.value === letter ? 'selected' : ''}`} onClick={() => update({ value: letter })}><span className="answer-letter">{letter}</span>{option}{answer.value === letter && <Icon name="check" size={16} style={{ marginLeft: 'auto' }}/>}</button>; })}</div> : q.kind === 'numeric' ? <input className="question-answer-input" inputMode="decimal" value={answer.value} onChange={e => update({ value: e.target.value })} placeholder={ui("輸入你的數值答案")} aria-label={ui("數值答案")}/> : <><textarea className="question-answer-input" rows={q.kind === 'essay' ? 9 : 5} value={answer.value} onChange={e => update({ value: e.target.value })} placeholder={q.kind === 'audio' ? ui("可以先寫下你的思路，再錄製回應。") : ui("把你的思路或文章寫在這裡……")} aria-label={ui("你的作答")}/><div className="row-between"><MediaInput allowImage={q.kind !== 'audio'} onAttached={a => update({ attachmentId: a.id })}/><span className="small muted">{ui("{0} 字／字元", [answer.value.length])}</span></div>{attachment && <AttachmentPreview attachment={attachment} onRemove={() => update({ attachmentId: undefined })}/>}</>}{hintOpen && <div className="hint-box"><strong>{ui("一點提示")}</strong><p>{q.hint}</p><small>{ui("本題已標示為使用提示，不列入獨立證據。")}</small></div>}<div className="question-actions"><button className="btn ghost" disabled={quiz.kind === 'timed' || hintOpen} onClick={() => { setHintOpen(true); update({ hinted: true }); }}><Icon name="bulb" size={16}/>{quiz.kind === 'timed' ? ui("計時小測不提供提示") : ui("給我一點提示")}</button><div><button className="btn secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}><Icon name="left" size={15}/>{ui("上一題")}</button>{index < questions.length - 1 ? <button className="btn primary" onClick={() => setIndex(index + 1)}>{ui("下一題")}<Icon name="right" size={15}/></button> : <button className="btn primary" disabled={busy} onClick={() => setConfirm(true)}><Icon name="check" size={16}/>{ui("提交作答")}</button>}</div></div></article></div>{confirm && <Modal title={ui("準備好看看這次的發現了嗎？")} onClose={() => setConfirm(false)}><p className="muted">{ui("已完成 {0} / {1} 題。{2}", [answered, questions.length, answered < questions.length ? ui("未作答的客觀題會按零分記錄；你也可以返回繼續。") : ui("提交後可查看解析與知識點回饋。")])}</p><div className="modal-actions"><button className="btn secondary" onClick={() => setConfirm(false)}>{ui("繼續作答")}</button><button className="btn primary" disabled={busy} onClick={() => void submit()}>{busy ? ui("提交中…") : ui("確認提交")}</button></div></Modal>}</div>;
}
