import {Sidebar} from './Sidebar';
import {primaryNav,studyNav,askNav,exploreNav,toolNav} from './navigation';
import { AdminGuidePage } from './pages/AdminGuide';
import {LanguageSwitch} from './i18n';
import { ui, useInterfaceLanguage } from "./i18n";
import { useEffect, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from './state';
import { Icon, Modal } from './components';
import type { IconName } from './components';
import { FocusPill, useFocus } from './focus';
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
import { ForumPage } from './pages/Forum';
import { api, realMode } from './api/client';
import type { ForumNotificationView } from './forum-types';
import { BillingPage } from './pages/Billing';
type SearchResult = { key: string; icon: IconName; title: string; detail?: string; go: () => void };
const shortcutLabel = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
export default function App() {
    const lang = useInterfaceLanguage();
    const { db, billing, catalog, rawCatalog, mutate } = useApp();
    const focus = useFocus();
    const location = useLocation();
    const navigate = useNavigate();
    const [mobile, setMobile] = useState(false);
    const [collapsed,setCollapsed]=useState(()=>{try{return localStorage.getItem('hokse.sidebar-collapsed')==='true'}catch{return false}});
    const toggleSidebar=()=>setCollapsed(value=>{const next=!value;try{localStorage.setItem('hokse.sidebar-collapsed',String(next))}catch{}return next});
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [notice, setNotice] = useState(false);
    const [forumUnread, setForumUnread] = useState(0);
    const [forumNotices, setForumNotices] = useState<ForumNotificationView[]>([]);
    useEffect(() => {
        const syncForum = () => { void api<{ unreadCount: number; items: ForumNotificationView[] }>('/forum/notifications').then(res => { setForumUnread(res.unreadCount); setForumNotices(res.items); }).catch(() => {}); };
        syncForum();
        window.addEventListener('hokse:forum-notifications-changed', syncForum);
        return () => window.removeEventListener('hokse:forum-notifications-changed', syncForum);
    }, [location.pathname]);
    const [help, setHelp] = useState(false);
    useEffect(() => { setMobile(false); const frame = requestAnimationFrame(() => { const target = location.hash ? document.getElementById(location.hash.slice(1)) : null; if (target)
        target.scrollIntoView();
    else
        window.scrollTo({ top: 0 }); }); return () => cancelAnimationFrame(frame); }, [location.pathname, location.hash]);
    useEffect(() => { const listener = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(v => !v);
    } if (e.key === 'Escape')
        setMobile(false); }; document.addEventListener('keydown', listener); return () => document.removeEventListener('keydown', listener); }, []);
    const navEntries: { to: string; label: string; group: string }[] = [
        ...(realMode ? [{ to: '/studio', label: '我的學習流程', group: '學習工作台' }] : []),
        ...primaryNav.map(([to, label]) => ({ to, label, group: '學習工作台' })),
        ...studyNav.map(([to, label]) => ({ to, label, group: '我的學習' })),
        ...askNav.map(([to, label]) => ({ to, label, group: '提問與討論' })),
        ...exploreNav.map(([to, label]) => ({ to, label, group: '探索更多' })),
        { to: '/resources/maths', label: '數學題目索引', group: '探索更多' },
        ...toolNav.map(([to, label]) => ({ to, label, group: '帳戶與說明' })),
        ...(realMode ? [{ to: '/billing', label: '套餐與帳單', group: '帳戶與說明' }, { to: '/developer', label: '內容與開發設定', group: '帳戶與說明' }] : []),
    ];
    const current = [...navEntries].sort((a, b) => b.to.length - a.to.length).find(entry => location.pathname === entry.to || location.pathname.startsWith(entry.to + '/'));
    const dueCount = db.reviews.filter(r => r.dueDate <= db.profile.date && r.lastReviewed !== db.profile.date).length;
    // Opening the panel is not the same as reading it: replies stay unread until the
    // student follows one or explicitly marks everything as read.
    const unread = !db.notificationsRead || forumUnread > 0;
    const markAllRead = () => {
        const prevUnread = forumUnread;
        const prevNotices = forumNotices;
        setForumUnread(0);
        setForumNotices(items => items.map(n => ({ ...n, read: true })));
        void Promise.all([mutate('/notifications/read'), api('/forum/notifications/read', 'POST')]).catch(() => {
            setForumUnread(prevUnread);
            setForumNotices(prevNotices);
        });
    };
    const closeSearch = () => { setSearchOpen(false); setQuery(''); setActive(0); };
    const q = query.trim().toLowerCase();
    const results: SearchResult[] = !q ? [] : [
        ...catalog.topics.filter(t => {
            const raw = rawCatalog.topics.find(rt => rt.id === t.id);
            return `${t.name} ${t.en} ${raw?.name ?? ''} ${raw?.unit ?? ''} ${raw?.module ?? ''}`.toLowerCase().includes(q);
        }).slice(0, 6).map(t => ({ key: 'topic-' + t.id, icon: 'book' as IconName, title: t.name, detail: `${t.module} · ${t.papers.join(ui("、"))}`, go: () => navigate(`/subjects/${t.subjectId}?topic=${t.id}`) })),
        ...db.chats.filter(c => c.title.toLowerCase().includes(q)).slice(0, 3).map(c => ({ key: 'chat-' + c.id, icon: 'chat' as IconName, title: c.title, go: () => navigate(`/learn/${c.id}`) })),
        ...catalog.resources.filter(r => {
            const raw = rawCatalog.resources.find(rr => rr.id === r.id);
            return `${r.title} ${r.description} ${raw?.title ?? ''} ${raw?.description ?? ''}`.toLowerCase().includes(q);
        }).slice(0, 3).map(r => ({ key: 'resource-' + r.id, icon: 'folder' as IconName, title: r.title, go: () => navigate(`/resources?q=${encodeURIComponent(query.trim())}`) })),
    ];
    const choose = (result: SearchResult) => { closeSearch(); result.go(); };
    const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); setActive(i => (i + 1) % results.length); }
        else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); setActive(i => (i - 1 + results.length) % results.length); }
        else if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active]); }
    };
    const immersive = !!focus.session?.immersive;
    const pageTitle = ui(current?.label ?? (location.pathname === '/admin/help' ? '管理員使用指南' : location.pathname === '/start' ? '開始備試' : '個人設定'));
    const groupTitle = ui(current?.group ?? '帳戶與說明');
    return <div className={`app-shell ${collapsed?'sidebar-collapsed':''} ${immersive?'focus-immersive':''}`}>{mobile && <button className="nav-scrim" aria-label={ui("關閉導覽")} onClick={() => setMobile(false)}/>}<Sidebar mobile={mobile} collapsed={collapsed} onToggle={toggleSidebar} onClose={()=>setMobile(false)}/><div className="app-main" inert={mobile || undefined}>
    <header className="topbar"><div className="breadcrumb"><button type="button" className="icon-btn mobile-only" aria-label={ui("開啟導覽")} aria-expanded={mobile} aria-controls="main-sidebar" onClick={() => setMobile(true)}><Icon name="menu"/></button><span>{groupTitle}</span><Icon name="right" size={13}/><strong>{pageTitle}</strong></div>
    <button aria-label={ui("搜尋知識點、對話或資源")} className="global-search" onClick={() => setSearchOpen(true)}><Icon name="search" size={17}/><span>{ui("搜尋知識點、對話或資源")}</span><kbd>{shortcutLabel}</kbd></button>
    <div className="topbar-actions"><FocusPill/><LanguageSwitch/>{billing && <Link className="credit-pill" to="/billing">{billing.account.plan} · {billing.available} credit</Link>}<span className="demo-pill"><i />{db.profile.year} {realMode ? ui("備試空間") : ui("備試示範")}</span><button className={`icon-btn notification-btn ${unread ? 'unread' : ''}`} aria-label={ui("查看通知")} onClick={() => setNotice(true)}><Icon name="bell" size={20}/></button></div></header>
    <main className={`page-content ${location.pathname.startsWith('/learn') ? 'chat-page-content' : ''}`}><Routes><Route path="/admin/help" element={<AdminGuidePage/>}/><Route path="/" element={<Navigate to="/overview" replace/>}/><Route path="/studio" element={<StudioPage />}/><Route path="/pilot" element={<PilotPage />}/><Route path="/developer" element={<DeveloperPage />}/><Route path="/billing" element={<BillingPage />}/><Route path="/overview" element={<Dashboard />}/><Route path="/calendar" element={<CalendarPage />}/><Route path="/review" element={<DailyReviewPage />}/><Route path="/subjects/:subjectId?" element={<SubjectsPage />}/><Route path="/learn/:chatId?" element={<LearnPage />}/><Route path="/quizzes/:quizId?" element={<QuizPage />}/><Route path="/mistakes" element={<WrongPage />}/><Route path="/forum" element={<ForumPage />}/><Route path="/forum/post/:postId" element={<ForumPage />}/><Route path="/resources" element={<ResourcesPage />}/><Route path="/resources/maths" element={<MathsIndexPage />}/><Route path="/help" element={<UserGuidePage />}/><Route path="/goals" element={<GoalsPage />}/><Route path="/settings" element={<SettingsPage />}/><Route path="/start" element={<OnboardingPage />}/><Route path="*" element={<div className="empty-state"><h1>{ui("這一頁還沒找到")}</h1><Link className="btn primary" to="/overview">{ui("返回學習總覽")}</Link></div>}/></Routes></main>
    <footer className="app-footer"><Link to="/help">{ui("使用指南")}</Link><button onClick={() => setHelp(true)}>{realMode ? ui("關於學習空間") : ui("關於此學習示範")} <Icon name="help" size={13}/></button></footer></div>
    <nav className="mobile-tabbar" aria-label={ui("手機快捷導覽")} inert={mobile || undefined}>
        <NavLink to="/overview" end className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}><Icon name="dashboard" size={20}/><span>{ui("總覽")}</span></NavLink>
        <NavLink to="/review" aria-label={ui("每日溫習")} className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}><span className="mobile-tab-icon"><Icon name="review" size={20}/>{dueCount > 0 && <em className="mobile-tab-badge">{dueCount}</em>}</span><span>{lang === 'en' ? 'Review' : ui("每日溫習")}</span></NavLink>
        <NavLink to="/learn" aria-label={ui("AI 學習室")} className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}><Icon name="chat" size={20}/><span>{lang === 'en' ? 'AI Study' : ui("AI 學習室")}</span></NavLink>
        <NavLink to="/forum" className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}><span className="mobile-tab-icon"><Icon name="forum" size={20}/>{forumUnread > 0 && <i className="mobile-tab-dot" aria-hidden="true"/>}</span><span>{ui("討論區")}</span></NavLink>
        <button type="button" className={`mobile-tab ${mobile ? 'active' : ''}`} aria-expanded={mobile} aria-controls="main-sidebar" onClick={() => setMobile(v => !v)}><Icon name="menu" size={20}/><span>{ui("更多")}</span></button>
    </nav>
    {searchOpen && <Modal title={ui("找到下一個學習起點")} onClose={closeSearch}><div className="search-input"><Icon name="search"/><input autoFocus value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={onSearchKey} placeholder={ui("例如：酸和鹽基、閱讀推斷、二次方程")} role="combobox" aria-expanded={results.length > 0} aria-controls="global-search-results" aria-activedescendant={results[active] ? `search-${results[active].key}` : undefined}/>{query && <button type="button" className="icon-btn" aria-label={ui("清除搜尋")} onClick={() => { setQuery(''); setActive(0); }}><Icon name="x" size={16}/></button>}</div>{!query && <div className="search-suggestions"><p className="small muted">{ui("試試這些知識點")}</p>{['二次方程', '酸和鹽基', '閱讀', '微分'].map(s => { const label = ui(s); return <button className="chip" key={s} onClick={() => setQuery(label)}>{label}</button>; })}</div>}{results.length > 0 && <div className="search-results" id="global-search-results" role="listbox">{results.map((r, i) => <button key={r.key} id={`search-${r.key}`} role="option" aria-selected={i === active} className={i === active ? 'active' : ''} onMouseEnter={() => setActive(i)} onClick={() => choose(r)}><Icon name={r.icon}/><div><strong>{r.title}</strong>{r.detail && <small>{r.detail}</small>}</div><Icon name="arrow" size={16}/></button>)}</div>}{query && !results.length && <p className="muted search-empty" role="status">{ui("沒有找到相符內容，試試另一個關鍵字。")}</p>}</Modal>}
    {notice && <Modal title={ui("你的學習小提醒")} onClose={() => setNotice(false)}>{unread && <div className="notice-actions"><button type="button" className="btn ghost small-btn" onClick={markAllRead}><Icon name="check" size={15}/>{ui("全部標為已讀")}</button></div>}{forumNotices.slice(0, 5).map(n => <div key={n.id} className={`notification-card ${n.read ? '' : 'unread'}`}><Icon name="forum"/><div><strong>{ui("{0} 回覆了你的討論：{1}", [n.actorLabel, n.postTitle])}</strong><p>{n.excerpt}</p><Link to={`/forum/post/${n.postId}`} className="text-link" onClick={() => { setNotice(false); markAllRead(); }}>{ui("查看討論回覆")}<Icon name="arrow" size={14}/></Link></div></div>)}<div className="notification-card"><Icon name="review"/><div><strong>{ui("今天有 {0} 個知識點值得再回想", [db.reviews.filter(r => r.dueDate <= db.profile.date).length])}</strong><p>{ui("從昨天學過的內容開始，花一點時間鞏固。")}</p><Link to="/review" className="text-link" onClick={() => setNotice(false)}>{ui("前往每日溫習")}<Icon name="arrow" size={14}/></Link></div></div><div className="notification-card"><Icon name="graduation"/><div><strong>{ui("讓學習目標更具體")}</strong><p>{ui("選擇一個主目標與兩個備選，看看哪些科目最值得先加強。")}</p><Link to="/goals" className="text-link" onClick={() => setNotice(false)}>{ui("查看升學目標")}<Icon name="arrow" size={14}/></Link></div></div></Modal>}
    {help && <Modal title={ui("歡迎來到學序")} onClose={() => setHelp(false)}><p>{realMode ? ui("這是邀請制的 DSE 學習空間。學習、練習與日曆記錄保存在自己的服務端帳戶。") : ui("這是一個可以操作的 DSE 學習產品示範。練習、進度、筆記和日曆會保存在這個瀏覽器。")}</p><div className="info-callout"><Icon name="bulb"/><p>{realMode ? ui("三科自主輔導使用AI參考回饋；測驗生成獨立檢查，聊天與隨堂題快速回覆。已審校題庫保留原有規則。") : ui("選擇題、數值題與排程容量檢查會實際計算；AI 講解、作文批改、口語評價和學習收益建議目前使用示例。")}</p></div><p className="muted small">{ui("{0}{1}。考試日期以來源狀態為準。升學資料按原有年份呈現，並非 2028 錄取保證。", [realMode ? ui("香港日期：") : ui("示範時鐘："), db.profile.date])}</p><Link className="btn secondary" to="/help" onClick={() => setHelp(false)}>{ui("閱讀使用指南")}<Icon name="book"/></Link><Link className="btn primary" to="/start" onClick={() => setHelp(false)}>{ui("開始建立我的計劃")}<Icon name="arrow"/></Link></Modal>}</div>;
}
