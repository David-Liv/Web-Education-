import { ui, useInterfaceLanguage } from "../i18n";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state';
import { Badge, Modal, Icon } from '../components';
import type { Task } from '../types';
export function StudyReportButton() {
    useInterfaceLanguage();
    const { db } = useApp();
    const [open, setOpen] = useState(false);
    const r = db.studio?.report;
    if (!r)
        return null;
    return <><button className="btn secondary" onClick={() => setOpen(true)}><Icon name="trend" size={16}/>{ui("雙周學習回顧")}</button>{open && <Modal title={ui("看見最近兩週的小進步")} subtitle={ui("{0} — {1} · 實際有紀錄 {2} 天", [r.from, r.to, r.activeDays])} wide onClose={() => setOpen(false)}><p>{ui(r.message)}</p><div className="report-numbers"><div><strong>{r.learningEvents}</strong><span>{ui("學習活動")}</span></div><div><strong>{r.reviewEvents}</strong><span>{ui("復習活動")}</span></div><div><strong>{r.tasksDone}</strong><span>{ui("完成任務")}</span></div></div><p className="small muted">{ui("{0} 次作答 · {1} 次無提示且未重複的獨立作答 · {2} 項待糾正 · {3} 項待辦。活動用時是安排／記錄值，不是有效專注時間。", [r.attempts, r.independent, r.disputed, r.tasksPending])}</p>{r.skills.map(s => <div className="pilot-list-row" key={s.id}><strong>{ui(s.name)}</strong><Badge>{ui(s.label)}</Badge><span>{s.score === null ? ui("未知") : ui("{0}% 參考", [s.score])}</span></div>)}<div className="info-callout"><p>{ui("暫定狀態依本平台練習與AI參考回饋計算，不等於整科DSE等級。資料少時不繪製可靠進步曲線。")}</p></div><Link to="/studio" className="btn primary" onClick={() => setOpen(false)}>{ui("選下一個小步驟")}</Link></Modal>}</>;
}
export function CalendarTools({ date, onSelect }: {
    date: string;
    onSelect: (t: Task) => void;
}) {
    useInterfaceLanguage();
    const { db, mutate, toast } = useApp();
    const [busy, setBusy] = useState(false);
    if (!db.studio)
        return null;
    const rest = db.profile.restDates?.includes(date), floating = db.tasks.filter(t => t.schedule === 'floating' && t.status === 'pending');
    return <section className="card pilot-card"><div className="row-between"><div><h3>{rest ? ui("今天先休息，也是一種安排") : ui("清單與日曆，是同一份任務")}</h3><p className="small muted">{ui("待辦保留預計時間，選定時段後才佔用日曆。休息只影響 {0}，不改每週預算。", [date])}</p></div><button className="btn secondary" disabled={busy} onClick={async () => { setBusy(true); try {
        await mutate('/studio/rest', 'POST', { date, rest: !rest });
        toast(rest ? '已恢復當天可用時間；待辦可自行重新安排' : '未鎖定待辦已留在清單，沒有追繳到明天');
    }
    catch { }
    finally {
        setBusy(false);
    } }}>{rest ? ui("恢復安排") : ui("這一天先休息")}</button></div>{floating.length ? floating.map(t => <div className="pilot-list-row" key={t.id}><strong>{ui(t.title)}</strong><small>{ui("{0} · 約{1}分鐘 · 待安排", [t.date, t.minutes])}</small><button className="btn ghost" onClick={() => onSelect(t)}>{ui("安排／調整")}</button><button className="btn ghost" onClick={() => void mutate(`/tasks/${t.id}`, 'PATCH', { status: 'done' }).catch(() => { })}>{ui("已完成")}</button></div>) : <p className="small muted">{ui("暫無待安排任務。新增任務時可選擇「先放清單」。")}</p>}</section>;
}
