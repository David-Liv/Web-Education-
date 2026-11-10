import {Sidebar} from './Sidebar';
import {primaryNav,studyNav,exploreNav} from './navigation';
import { AdminGuidePage } from './pages/AdminGuide';
import {LanguageSwitch} from './i18n';
import { ui, useInterfaceLanguage } from "./i18n";
import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from './state';
import { Icon, Modal } from './components';
import type { IconName } from './components';
import { Dashboard } from './pages/Dashboard';
import { CalendarPage } from './pages/Calendar';
import { DailyReviewPage } from './pages/DailyReview';
import { SubjectsPage } from './pages/Subjects';
import { LearnPage } from './pages/Learn';
import { QuizPage } from './pages/Quiz';
import { WrongPage, ResourcesPage } from './pages/Library';
import { UniversityGoalsPage as GoalsPage } from './pages/UniversityGoals';
import { SettingsPage, OnboardingPage } from './pages/GoalSettings';
import { StudioPage } from './pages/Studio';
import { PilotPage } from './pages/Pilot';
import { DeveloperPage } from './pages/Developer';
import { UserGuidePage } from './pages/UserGuide';
import { MathsIndexPage } from './pages/MathsIndex';
import { realMode } from './api/client';
import { BillingPage } from './pages/Billing';
export default function App() {
    useInterfaceLanguage();
    const { db, billing, catalog, mutate } = useApp();
    const location = useLocation();
    const navigate = useNavigate();
    const [mobile, setMobile] = useState(false);
    const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem('hokse.sidebar-collapsed')==='true'}catch{return false}});
    const toggleSidebar=()=>setCollapsed(value=>{const next=!value;try{localStorage.setItem('hokse.sidebar-collapsed',String(next))}catch{}return next});
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [notice, setNotice] = useState(false);
    const [help, setHelp] = useState(false);
    useEffect(() => { setMobile(false); const frame = requestAnimationFrame(() => { const target = location.hash ? document.getElementById(location.hash.slice(1)) : null; if (target)
        target.scrollIntoView();
    else
        window.scrollTo({ top: 0 }); }); return () => cancelAnimationFrame(frame); }, [location.pathname, location.hash]);
    useEffect(() => { const listener = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(v => !v);
    } if (e.key === 'Escape')
        setMobile(false); }; document.addEventListener('keydown', listener); return () => document.removeEventListener('keydown', listener); }, []);
    const nav = [...(realMode ? [['/studio', '我的學習流程', 'leaf'] as [
                string,
                string,
                IconName
            ]] : []), ...primaryNav, ...studyNav, ...exploreNav, ...(realMode ? [['/billing', '套餐與帳單', 'file'] as [string,string,IconName]] : [])];
    const current = nav.find(([to]) => location.pathname.startsWith(to));
    const results = query.trim() ? catalog.topics.filter(t => `${t.name} ${t.en}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6) : [];
    return <div className={`app-shell ${collapsed?'sidebar-collapsed':''}`}>{mobile && <button className="nav-scrim" aria-label={ui("關閉導覽")} onClick={() => setMobile(false)}/>}<Sidebar mobile={mobile} collapsed={collapsed} onToggle={toggleSidebar} onClose={()=>setMobile(false)}/><div className="app-main"><header className="topbar"><div className="breadcrumb"><button className="icon-btn mobile-only" aria-label={ui("開啟導覽")} onClick={() => setMobile(true)}><Icon name="menu"/></button><span>{ui("我的學習")}</span><Icon name="right" size={13}/><strong>{ui(current?.[1] ?? (location.pathname === '/admin/help' ? '管理員使用指南' : location.pathname === '/start' ? '開始備試' : '個人設定'))}</strong></div><button aria-label={ui("搜尋知識點、對話或資源")} className="global-search" onClick={() => setSearchOpen(true)}><Icon name="search" size={17}/><span>{ui("搜尋知識點、對話或資源")}</span><kbd>⌘ K</kbd></button><div className="topbar-actions"><LanguageSwitch/>{billing && <Link className="credit-pill" to="/billing">{billing.account.plan} · {billing.available} credit</Link>}<Link className="demo-pill" to="/settings"><i />{db.profile.year} {realMode ? ui("備試空間") : ui("備試示範")}</Link><button className={`icon-btn notification-btn ${!db.notificationsRead ? 'unread' : ''}`} aria-label={ui("查看通知")} onClick={() => { setNotice(true); void mutate('/notifications/read').catch(() => { }); }}><Icon name="bell" size={20}/></button><Link className="avatar small" to="/settings" aria-label={ui("個人設定")}>{db.profile.name.slice(-1)}</Link></div></header><main className={`page-content ${location.pathname.startsWith('/learn') ? 'chat-page-content' : ''}`}><Routes><Route path="/admin/help" element={<AdminGuidePage/>}/><Route path="/" element={<Navigate to={realMode ? "/studio" : "/overview"} replace/>}/><Route path="/studio" element={<StudioPage />}/><Route path="/pilot" element={<PilotPage />}/><Route path="/developer" element={<DeveloperPage />}/><Route path="/billing" element={<BillingPage />}/><Route path="/overview" element={<Dashboard />}/><Route path="/calendar" element={<CalendarPage />}/><Route path="/review" element={<DailyReviewPage />}/><Route path="/subjects/:subjectId?" element={<SubjectsPage />}/><Route path="/learn/:chatId?" element={<LearnPage />}/><Route path="/quizzes/:quizId?" element={<QuizPage />}/><Route path="/mistakes" element={<WrongPage />}/><Route path="/resources" element={<ResourcesPage />}/><Route path="/resources/maths" element={<MathsIndexPage />}/><Route path="/help" element={<UserGuidePage />}/><Route path="/goals" element={<GoalsPage />}/><Route path="/settings" element={<SettingsPage />}/><Route path="/start" element={<OnboardingPage />}/><Route path="*" element={<div className="empty-state"><h1>{ui("這一頁還沒找到")}</h1><Link className="btn primary" to="/overview">{ui("返回學習總覽")}</Link></div>}/></Routes></main><footer className="app-footer"><span>{ui("一點一滴，學出自己的節奏。")}</span><Link to="/help">{ui("使用指南")}</Link><button onClick={() => setHelp(true)}>{realMode ? ui("關於學習空間") : ui("關於此學習示範")} <Icon name="help" size={13}/></button></footer></div>{searchOpen && <Modal title={ui("找到下一個學習起點")} onClose={() => setSearchOpen(false)}><div className="search-input"><Icon name="search"/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={ui("例如：酸和鹽基、閱讀推斷、二次方程")}/></div>{!query && <div className="search-suggestions"><p className="small muted">{ui("試試這些知識點")}</p>{['二次方程', '酸和鹽基', '閱讀', '微分'].map(s => <button className="chip" key={s} onClick={() => setQuery(s)}>{s}</button>)}</div>}<div className="search-results">{results.map(t => <button key={t.id} onClick={() => { setSearchOpen(false); navigate(`/subjects/${t.subjectId}?topic=${t.id}`); }}><Icon name="book"/><div><strong>{t.name}</strong><small>{ui(t.module)} · {t.papers.join('、')}</small></div><Icon name="arrow" size={16}/></button>)}{db.chats.filter(c => query && c.title.includes(query)).slice(0, 3).map(c => <button key={c.id} onClick={() => { setSearchOpen(false); navigate(`/learn/${c.id}`); }}><Icon name="chat"/><strong>{c.title}</strong></button>)}{catalog.resources.filter(r => query && `${r.title}${r.description}`.includes(query)).slice(0, 3).map(r => <button key={r.id} onClick={() => { setSearchOpen(false); navigate(`/resources?q=${encodeURIComponent(query)}`); }}><Icon name="folder"/><strong>{r.title}</strong></button>)}{query && !results.length && !db.chats.some(c => c.title.includes(query)) && !catalog.resources.some(r => `${r.title}${r.description}`.includes(query)) && <p className="muted">{ui("沒有找到相符內容，試試另一個關鍵字。")}</p>}</div></Modal>}{notice && <Modal title={ui("你的學習小提醒")} onClose={() => setNotice(false)}><div className="notification-card"><Icon name="review"/><div><strong>{ui("今天有 {0} 個知識點值得再回想", [db.reviews.filter(r => r.dueDate <= db.profile.date).length])}</strong><p>{ui("從昨天學過的內容開始，花一點時間鞏固。")}</p><Link to="/review" className="text-link" onClick={() => setNotice(false)}>{ui("前往每日溫習")}<Icon name="arrow" size={14}/></Link></div></div><div className="notification-card"><Icon name="graduation"/><div><strong>{ui("讓學習目標更具體")}</strong><p>{ui("選擇一個主目標與兩個備選，看看哪些科目最值得先加強。")}</p><Link to="/goals" className="text-link" onClick={() => setNotice(false)}>{ui("查看升學目標")}<Icon name="arrow" size={14}/></Link></div></div></Modal>}{help && <Modal title={ui("歡迎來到學序")} onClose={() => setHelp(false)}><p>{realMode ? ui("這是邀請制的 DSE 學習空間。學習、練習與日曆記錄保存在自己的服務端帳戶。") : ui("這是一個可以操作的 DSE 學習產品示範。練習、進度、筆記和日曆會保存在這個瀏覽器。")}</p><div className="info-callout"><Icon name="bulb"/><p>{realMode ? ui("三科自主輔導使用AI參考回饋；測驗生成獨立檢查，聊天與隨堂題快速回覆。已審校題庫保留原有規則。") : ui("選擇題、數值題與排程容量檢查會實際計算；AI 講解、作文批改、口語評價和學習收益建議目前使用示例。")}</p></div><p className="muted small">{ui("{0}{1}。考試日期以來源狀態為準。升學資料按原有年份呈現，並非 2028 錄取保證。", [realMode ? ui("香港日期：") : ui("示範時鐘："), db.profile.date])}</p><Link className="btn secondary" to="/help" onClick={() => setHelp(false)}>{ui("閱讀使用指南")}<Icon name="book"/></Link><Link className="btn primary" to="/start" onClick={() => setHelp(false)}>{ui("開始建立我的計劃")}<Icon name="arrow"/></Link></Modal>}</div>;
}
