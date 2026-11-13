import { ui, useInterfaceLanguage, readableDate, weekday } from "../i18n";
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../state';
import { useFocus } from '../focus';
import { api, realMode } from '../api/client';
import { addDays, dailyCapacity, mastery } from '../domain';
import { Badge, Icon, Modal, Progress, SectionTitle, SubjectIcon } from '../components';
import type { Task } from '../types';

// Seven real daily totals, one labelled column per Hong Kong school weekday.
function TinyChartBars({ dates, minutes, today }: { dates: string[]; minutes: number[]; today: string }) {
    const max = Math.max(...minutes, 1);
    return (
        <ol className="desk-bars" aria-label={ui("最近七天學習時間變化")}>
            {dates.map((d, i) => {
                const dayIndex = (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7;
                return (
                    <li key={d} className={d === today ? 'today' : ''}>
                        <span className="desk-bar-value">{minutes[i] || ''}</span>
                        <span className="desk-bar-track" aria-hidden="true">
                            <span className="desk-bar" style={{ height: `${Math.max(minutes[i] ? 6 : 2, minutes[i] / max * 100)}%` }}/>
                        </span>
                        <span className="desk-bar-day">
                            <span className="sr-only">{readableDate(d)} · {ui("{0} 分鐘", [minutes[i]])}</span>
                            <span aria-hidden="true">{d === today ? ui("今日") : weekday(dayIndex)}</span>
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

// One destination per task, shared by the title, the row link and the focus button.
const taskHref = (task: Task) => task.kind === 'review' ? '/review' : task.kind === 'practice' ? `/quizzes?subjectId=${task.subjectId}&topicId=${task.topicId ?? ''}` : `/subjects/${task.subjectId}?topic=${task.topicId ?? ''}`;
const taskTone = (task: Task) => task.kind === 'review' ? 'green' : task.kind === 'practice' ? 'blue' : 'amber';

function greeting(name: string) {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Hong_Kong' }).format(new Date()));
    if (hour >= 5 && hour < 12) return ui("早晨，{0}。", [name]);
    if (hour >= 12 && hour < 18) return ui("午安，{0}。", [name]);
    if (hour >= 18 && hour < 23) return ui("晚上好，{0}。", [name]);
    return ui("夜深了，{0}。", [name]);
}

export function Dashboard() {
    useInterfaceLanguage();
    const { db, catalog, applyTask, refresh, toast } = useApp();
    const focus = useFocus();
    const navigate = useNavigate();
    const [report, setReport] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const today = db.profile.date;
    const weekDates = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const minutes = weekDates.map(date => db.events.filter(e => e.date === date).reduce((s, e) => s + e.minutes, 0));
    const weekTotal = minutes.reduce((a, b) => a + b, 0);
    const selectedSubjects = catalog.subjects.filter(s => db.profile.subjects.includes(s.id) && s.ready);
    const scoredTopics = catalog.topics.map(t => ({ ...t, ...mastery(t.id, db.evidence) })).filter(t => t.count > 0);
    const stable = scoredTopics.filter(t => db.pilot ? t.label.startsWith('較穩定') : t.count >= 3 && t.score! >= 80);
    const due = db.reviews.filter(r => r.dueDate <= today && r.lastReviewed !== today);
    const tasks = db.tasks.filter(t => t.date === today && t.kind !== 'exam').sort((a, b) => a.start.localeCompare(b.start));
    const finished = tasks.filter(t => t.status === 'done').length;
    const next = tasks.find(t => t.status === 'pending');
    const nextTitle = next ? ui(next.title) : '';
    const rest = tasks.filter(t => t !== next);
    const goal = catalog.programmes.find(p => p.id === db.profile.primaryProgramme);
    const recent = db.chats[0];
    const weakest = scoredTopics.filter(t => t.count >= 3).sort((a, b) => (a.score ?? 100) - (b.score ?? 100))[0];
    const studioReport = db.studio?.report;

    const kindLabel = (task: Task) => task.kind === 'review' ? ui("溫習") : task.kind === 'practice' ? ui("練習") : ui("學習");

    const toggle = async (task: Task, isUndo = false) => {
        if (busyId === task.id) return;
        const nextStatus = task.status === 'done' ? 'pending' : 'done';
        setBusyId(task.id);
        applyTask({ ...task, status: nextStatus });
        try {
            const saved = await api<Task>(`/tasks/${task.id}`, 'PATCH', { status: nextStatus });
            applyTask(saved);
            void refresh().catch(() => { });
            if (isUndo) {
                toast('已恢復任務');
            } else if (nextStatus === 'done') {
                toast('又完成了一小步！', 'success', { duration: 4000, action: { label: '撤銷', run: () => void toggle(saved, true) } });
            } else {
                toast('已恢復任務');
            }
        } catch (err) {
            applyTask(task);
            toast((err as Error).message, 'error');
        } finally {
            setBusyId(current => current === task.id ? null : current);
        }
    };

    const begin = (task: Task) => {
        if (!focus.session) focus.start(task.minutes, task.title, task.id);
        navigate(taskHref(task));
    };

    const row = (task: Task) => {
        const title = ui(task.title);
        return (
            <li className={`desk-task ${task.status === 'done' ? 'done' : ''}`} key={task.id}>
                <button type="button" className="desk-check" disabled={busyId === task.id} aria-pressed={task.status === 'done'} aria-label={task.status === 'done' ? ui("取消完成 {0}", [title]) : ui("完成 {0}", [title])} onClick={() => void toggle(task)}>
                    <span>{task.status === 'done' && <Icon name="check" size={13}/>}</span>
                </button>
                <SubjectIcon id={task.subjectId} size="sm"/>
                <Link className="desk-task-copy" to={taskHref(task)}>
                    <strong>{title}</strong>
                    <small>{ui("{0} · {1} 分鐘", [task.start, task.minutes])}</small>
                </Link>
                <Badge tone={taskTone(task)}>{kindLabel(task)}</Badge>
            </li>
        );
    };

    return (
        <div className="dashboard desk-page page-enter">
            <header className="desk-head">
                <div>
                    <h1>{greeting(db.profile.name)}</h1>
                    <p>
                        {readableDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}
                        <span aria-hidden="true"> · </span>
                        {ui('{0} / {1} 項今日任務已完成', [finished, tasks.length])}
                    </p>
                </div>
                <div className="heading-actions">
                    <button className="btn secondary" onClick={() => setReport(true)}>
                        <Icon name="chart" size={17}/>
                        {ui("我的學習報告")}
                    </button>
                </div>
            </header>

            <div className="desk">
                <section className="desk-sheet" aria-labelledby="desk-today">
                    <div className="desk-sheet-head">
                        <h2 id="desk-today">{ui("今天的學習清單")}</h2>
                        <div className="desk-sheet-tools">
                            {!focus.session && (
                                <button type="button" className="btn secondary small-btn" onClick={focus.openLauncher}>
                                    <Icon name="clock" size={15}/>
                                    <span>{ui("自由專注")}</span>
                                    {focus.todayOpenMinutes > 0 && <span className="desk-open-tally">· {ui("{0} 分鐘", [focus.todayOpenMinutes])}</span>}
                                </button>
                            )}
                            {realMode && (
                                <Link className="text-link" to="/studio">
                                    {ui("我的學習流程")}
                                    <Icon name="arrow" size={14}/>
                                </Link>
                            )}
                            <Link className="text-link" to="/calendar">
                                {ui("打開日曆")}
                                <Icon name="arrow" size={15}/>
                            </Link>
                        </div>
                    </div>

                    {next && (
                        <article className="desk-next">
                            <button
                                type="button"
                                className="desk-check"
                                disabled={busyId === next.id}
                                aria-pressed={false}
                                aria-label={ui("完成 {0}", [nextTitle])}
                                title={ui("完成 {0}", [nextTitle])}
                                onClick={() => void toggle(next)}
                            >
                                <span/>
                            </button>
                            <SubjectIcon id={next.subjectId}/>
                            <div className="desk-next-copy">
                                <div className="desk-next-meta">
                                    <Badge tone={taskTone(next)}>{kindLabel(next)}</Badge>
                                    <span>{ui("{0} · {1} 分鐘", [next.start, next.minutes])}</span>
                                </div>
                                <h3><Link to={taskHref(next)}>{nextTitle}</Link></h3>
                            </div>
                            <div className="desk-next-actions">
                                {focus.session ? (
                                    <Link className="btn primary" to={taskHref(next)}>
                                        {ui("前往學習")}
                                        <Icon name="arrow" size={16}/>
                                    </Link>
                                ) : (
                                    <button type="button" className="btn primary" onClick={() => begin(next)}>
                                        <Icon name="play" size={16}/>
                                        {ui("開始專注")}
                                        <span className="desk-next-minutes">{ui("{0} 分鐘", [next.minutes])}</span>
                                    </button>
                                )}
                            </div>
                        </article>
                    )}

                    {tasks.length > 0 && !next && (
                        <article className="desk-next desk-next-done">
                            <span className="subject-icon" style={{ '--subject': '#2f6a52' } as CSSProperties}><Icon name="checkCircle" size={22}/></span>
                            <div className="desk-next-copy">
                                <h3>{ui("今日排程任務已全部完成")}</h3>
                                <p className="desk-next-sub">{ui("想再溫習一會，可隨時開啟一段自由專注。")}</p>
                            </div>
                            <div className="desk-next-actions">
                                {focus.session ? (
                                    <Link className="btn secondary" to="/review">{ui("前往每日溫習")}<Icon name="arrow" size={16}/></Link>
                                ) : (
                                    <button type="button" className="btn secondary" onClick={focus.openLauncher}>
                                        <Icon name="maximize" size={15}/>
                                        {ui("開啟自由專注")}
                                    </button>
                                )}
                            </div>
                        </article>
                    )}

                    {!tasks.length ? (
                        <div className="compact-empty">
                            <Icon name="calendar"/>
                            <p>{ui("還沒有今日任務，先建立你的備試計劃。")}</p>
                            <div className="compact-empty-actions">
                                {!focus.session && (
                                    <button type="button" className="btn secondary small-btn" onClick={focus.openLauncher}>
                                        <Icon name="maximize" size={14}/>
                                        {ui("開啟自由專注")}
                                    </button>
                                )}
                                <Link className="btn primary small-btn" to="/start">{ui("設定我的備試計劃")}</Link>
                            </div>
                        </div>
                    ) : (
                        rest.length > 0 && <ol className="desk-list">{rest.map(row)}</ol>
                    )}

                    <footer className="desk-review">
                        <span className="desk-review-summary">
                            <Icon name="review" size={18}/>
                            <span>{ui('建議 {0} 分鐘 · {1} 個待回顧知識點', [Math.min(20, Math.floor(dailyCapacity(db.profile, today) * db.profile.reviewPercent / 100)), due.length])}</span>
                        </span>
                        <Link className="text-link" to="/review">
                            {due.length ? ui("開始今日溫習") : ui("前往每日溫習")}
                            <Icon name="arrow" size={15}/>
                        </Link>
                    </footer>
                </section>

                <aside className="desk-side">
                    <nav className="desk-help" aria-labelledby="desk-help-title">
                        <h2 id="desk-help-title">{ui("提問與討論")}</h2>
                        <Link className="desk-help-row" to={recent ? `/learn/${recent.id}` : '/learn'}>
                            <span className="desk-help-icon ai"><Icon name="chat" size={19}/></span>
                            <span>
                                <strong>{recent ? ui("接著上次的思考") : ui("AI 學習室")}</strong>
                                <small>{recent ? ui(recent.title) : ui("開啟你的第一個學習對話")}</small>
                            </span>
                            <Icon name="right" size={16}/>
                        </Link>
                        <Link className="desk-help-row" to="/forum">
                            <span className="desk-help-icon"><Icon name="forum" size={19}/></span>
                            <span>
                                <strong>{ui("同學討論區")}</strong>
                                <small>{ui("去討論區提問")}</small>
                            </span>
                            <Icon name="right" size={16}/>
                        </Link>
                    </nav>

                    {next ? (
                        <details className="desk-insight desk-insight-quiet">
                            <summary>
                                <Icon name="bulb" size={16}/>
                                <span>{ui("完成清單後可再看：{0}", [weakest ? weakest.name : ui("快速摸底")])}</span>
                                <Icon name="down" size={15}/>
                            </summary>
                            <div className="desk-insight-body">
                                <p>{weakest ? ui("最近練習表現為 {0}%。重看概念，再做幾題獨立練習，讓下一步更清楚。", [weakest.score]) : ui("不用一次測完所有科目。先選一科，看看有哪些已經懂得、哪些值得再練。")}</p>
                                <Link to={weakest ? `/subjects/${weakest.subjectId}?topic=${weakest.id}` : '/quizzes?kind=diagnostic'} className="text-link">
                                    {weakest ? ui("前往這個知識點") : ui("開始快速摸底")}
                                    <Icon name="arrow" size={15}/>
                                </Link>
                            </div>
                        </details>
                    ) : (
                        <section className="desk-insight">
                            <h2><Icon name="bulb" size={17}/>{ui("給你的一點建議")}</h2>
                            <h3>{weakest ? ui("先花一點時間在「{0}」", [weakest.name]) : ui("從一份短小測開始認識自己")}</h3>
                            <p>{weakest ? ui("最近練習表現為 {0}%。重看概念，再做幾題獨立練習，讓下一步更清楚。", [weakest.score]) : ui("不用一次測完所有科目。先選一科，看看有哪些已經懂得、哪些值得再練。")}</p>
                            <Link to={weakest ? `/subjects/${weakest.subjectId}?topic=${weakest.id}` : '/quizzes?kind=diagnostic'} className="text-link">
                                {weakest ? ui("前往這個知識點") : ui("開始快速摸底")}
                                <Icon name="arrow" size={15}/>
                            </Link>
                        </section>
                    )}
                </aside>
            </div>

            <div className="desk-lower">
                <section className="card desk-week" aria-labelledby="desk-week-title">
                    <div className="desk-card-head">
                        <h2 id="desk-week-title">{ui("本週的學習節奏")}</h2>
                        <Badge>{ui("最近 7 天")}</Badge>
                    </div>
                    <p className="desk-week-total">
                        <strong>{Math.round(weekTotal)}</strong>
                        <span>{ui("已記錄學習分鐘")}</span>
                    </p>
                    <TinyChartBars dates={weekDates} minutes={minutes} today={today}/>
                    <dl className="desk-facts">
                        <div>
                            <dt>{ui("較穩固的知識點")}</dt>
                            <dd>
                                <strong>{stable.length}</strong> {ui("/ {0} 已評估", [scoredTopics.length])}
                                <small>{ui("依獨立作答證據")}</small>
                            </dd>
                        </div>
                    </dl>
                </section>

                <section className="card desk-goal" aria-labelledby="desk-goal-title">
                    <div className="desk-card-head">
                        <h2 id="desk-goal-title">{ui("我的升學方向")}</h2>
                        <Link to="/goals" className="icon-btn" aria-label={ui("編輯升學目標")}><Icon name="pencil" size={16}/></Link>
                    </div>
                    <p className="desk-goal-name">
                        <strong>{goal?.institution ?? 'DSE'}</strong>
                        <span>{goal?.name ?? ui("先為自己定一個目標")}</span>
                    </p>
                    <p className="small muted">{goal?.institutionName ?? ui("成績目標與升學方向")}</p>
                    <div className="desk-goal-foot">
                        <p className="score-source">{ui("{0} 規則參考 · 目標由本人設定", [goal?.formulaYear ?? 2027])}</p>
                        <Link to="/goals" className="text-link">
                            {ui("查看收分與科目差距")}
                            <Icon name="arrow" size={15}/>
                        </Link>
                    </div>
                </section>
            </div>

            <SectionTitle title={ui("我的學科")} to="/subjects" link={ui("探索所有學科")}/>
            <div className="subject-cards">
                {selectedSubjects.map(subject => {
                    const ts = catalog.topics.filter(t => t.subjectId === subject.id);
                    const scored = ts.map(t => mastery(t.id, db.evidence)).filter(m => m.count > 0);
                    const average = scored.length ? Math.round(scored.reduce((a, b) => a + (b.score ?? 0), 0) / scored.length) : 0;
                    return (
                        <Link className="subject-card" key={subject.id} to={`/subjects/${subject.id}`}>
                            <div className="subject-card-top">
                                <SubjectIcon id={subject.id}/>
                                <Icon name="right" size={16}/>
                            </div>
                            <h3>{subject.name}</h3>
                            {subject.name !== subject.en && <p>{subject.en}</p>}
                            <div className="subject-progress-label">
                                <span>{ui("已評估練習表現")}</span>
                                <strong>{scored.length ? average + '%' : ui("未評估")}</strong>
                            </div>
                            <Progress value={average} color={subject.color}/>
                            <small>{ui("{0} / {1} 個知識點有作答證據", [scored.length, ts.length])}</small>
                        </Link>
                    );
                })}
            </div>

            {report && (
                <Modal title={ui("我的學習報告")} subtitle={ui("每一項數據，都有學習紀錄可追溯。")} onClose={() => setReport(false)} wide>
                    <div className="report-numbers">
                        <div><strong>{db.events.length}</strong><span>{ui("學習紀錄")}</span></div>
                        <div><strong>{db.evidence.filter(e => e.independent).length}</strong><span>{ui("獨立作答證據")}</span></div>
                        <div><strong>{db.reviewSessions.reduce((s, r) => s + r.completedIds.length, 0)}</strong><span>{ui("完成複習項目")}</span></div>
                    </div>
                    {scoredTopics.map(t => (
                        <div className="report-topic" key={t.id}>
                            <div>
                                <strong>{t.name}</strong>
                                <small>{ui("{0} 道不同題目 · {1}", [t.count, ui(t.label)])}</small>
                            </div>
                            <Progress value={t.score ?? 0}/>
                            <strong>{t.score}%</strong>
                        </div>
                    ))}
                    {!scoredTopics.length && <p className="muted">{ui("完成快速摸底後，這裡會呈現你的知識點證據。")}</p>}
                    {studioReport && (
                        <section className="report-studio-section">
                            <div className="row-between" style={{ marginBottom: 10 }}>
                                <h3>{ui("看見最近兩週的小進步")}</h3>
                                <span className="small muted">{ui("{0} — {1} · 實際有紀錄 {2} 天", [studioReport.from, studioReport.to, studioReport.activeDays])}</span>
                            </div>
                            <p className="small">{ui(studioReport.message)}</p>
                            <p className="small muted" style={{ marginTop: 8 }}>
                                {ui("{0} 次作答 · {1} 次無提示且未重複的獨立作答 · {2} 項待糾正 · {3} 項待辦。活動用時是安排／記錄值，不是有效專注時間。", [studioReport.attempts, studioReport.independent, studioReport.disputed, studioReport.tasksPending])}
                            </p>
                            {studioReport.skills.map(s => (
                                <div className="pilot-list-row" key={s.id}>
                                    <strong>{ui(s.name)}</strong>
                                    <Badge>{ui(s.label)}</Badge>
                                    <span>{s.score === null ? ui("未知") : ui("{0}% 參考", [s.score])}</span>
                                </div>
                            ))}
                            <div style={{ marginTop: 14 }}>
                                <Link to="/studio" className="btn secondary small-btn" onClick={() => setReport(false)}>
                                    {ui("選下一個小步驟")}
                                    <Icon name="arrow" size={14}/>
                                </Link>
                            </div>
                        </section>
                    )}
                    <div className="info-callout">
                        <Icon name="bulb"/>
                        <p>{ui("練習表現取最近最多五道不同題目的獨立作答。未作答不當作零分，看過提示的練習不計入獨立證據。")}</p>
                    </div>
                </Modal>
            )}
        </div>
    );
}
