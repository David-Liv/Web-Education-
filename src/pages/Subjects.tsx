import { ui, useInterfaceLanguage } from "../i18n";
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../state';
import { mastery } from '../domain';
import { Badge, Empty, Icon, PageHeading, Progress, SubjectIcon, Tabs } from '../components';
import { DirectTopicPage } from '../TopicGuidedCourse';
import { computeFactorisationProgress, FACTORISATION_TOPIC_ID } from '../data/factorisation-guide';
const paperInfo: Record<string, {
    name: string;
    weight: string;
    duration: string;
    description: string;
}[]> = { chi: [{ name: '卷一 · 閱讀', weight: '40%', duration: '1 小時 30 分鐘', description: '甲部指定篇章 30%；乙部課外閱讀 70%（卷內比例）' }, { name: '卷二 · 寫作', weight: '45%', duration: '2 小時 15 分鐘', description: '甲部實用寫作 30%；乙部命題寫作 70%（卷內比例）' }, { name: '校本評核', weight: '15%', duration: '閱讀匯報', description: '學校考生的文字報告與口頭匯報' }], eng: [{ name: '卷一 · Reading', weight: '20%', duration: '1.5 小時', description: 'A 必答；B1 / B2 選答' }, { name: '卷二 · Writing', weight: '25%', duration: '2 小時', description: 'A 短篇引導寫作；B 較長篇寫作' }, { name: '卷三 · Listening & Integrated Skills', weight: '30%', duration: '約 2 小時', description: 'A 必答；B1 / B2 綜合任務' }, { name: '卷四 · Speaking', weight: '10%', duration: '約 20 分鐘', description: '小組互動及個人回應' }, { name: '校本評核', weight: '15%', duration: '閱讀／觀賞', description: '學校考生的口語表現' }], maths: [{ name: '必修卷一 · 傳統題', weight: '65%', duration: '2 小時 15 分鐘', description: 'A(1)、A(2)、B 部分' }, { name: '必修卷二 · 選擇題', weight: '35%', duration: '1 小時 15 分鐘', description: '與卷一共用知識點記錄' }, { name: 'M1 / M2 · 延伸部分', weight: '各自評級', duration: '2 小時 30 分鐘', description: 'M1 微積分與統計；M2 代數與微積分' }], chem: [{ name: '卷一 · 必修', weight: '60%', duration: '2 小時 30 分鐘', description: 'A 選擇題；B 短答、結構及論述題' }, { name: '卷二 · 選修', weight: '20%', duration: '1 小時', description: '工業、物料、分析化學三選二' }, { name: '校本評核', weight: '20%', duration: '實驗與探究', description: '學校考生的實驗表現與探究技能' }] };
export function SubjectsPage() {
    useInterfaceLanguage();
    const { db, catalog } = useApp();
    const { subjectId } = useParams();
    const [params, setParams] = useSearchParams();
    const [category, setCategory] = useState('A');
    const [query, setQuery] = useState('');
    const [view, setView] = useState('knowledge');
    const [module, setModule] = useState('all');
    const [status, setStatus] = useState('all');
    const subject = catalog.subjects.find(s => s.id === subjectId);
    const topicId = params.get('topic');
    const selected = catalog.topics.find(t => t.id === topicId && t.subjectId === subjectId);
    if (!subjectId)
        return <div className="page-enter"><PageHeading eyebrow="YOUR SUBJECTS, YOUR PACE" title={ui("每一科，都有自己的學習路徑。")} description={ui("找到知識點，看看自己的掌握證據，再決定下一步。")} action={<Link className="btn secondary" to="/start"><Icon name="sliders" size={17}/>{ui("管理修讀科目")}</Link>}/><div className="catalog-banner"><Icon name="compass" size={32}/><div><h3>{ui("先走好今天的一小步")}</h3><p>{ui("中、英、數、化學已有原創學習示例；其他科目先提供官方目錄與資料入口。")}</p></div><Badge tone="green">{ui("2028 備試")}</Badge></div><div className="filter-row"><Tabs value={category} onChange={setCategory} items={[{ id: 'A', label: '甲類 · 高中科目' }, { id: 'B', label: '乙類 · 應用學習' }, { id: 'C', label: '丙類 · 其他語言' }]}/><div className="search-input compact"><Icon name="search" size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={ui("搜尋學科")} aria-label={ui("搜尋學科")}/></div></div><div className="catalog-grid">{catalog.subjects.filter(s => s.category === category && (!s.fromYear || s.fromYear <= db.profile.year) && (!s.untilYear || s.untilYear >= db.profile.year) && `${s.name}${s.en}`.toLowerCase().includes(query.toLowerCase())).map(s => <Link className={`catalog-card ${!s.ready ? 'coming-soon' : ''}`} to={`/subjects/${s.id}`} key={s.id}><div className="row-between"><SubjectIcon id={s.id}/>{s.ready ? <Badge tone="green">{ui("可開始學習")}</Badge> : <Badge>{ui("內容籌備中")}</Badge>}</div><h3>{s.name}</h3><p>{s.en}</p><div className="catalog-bottom"><span>{s.ready ? ui("{0} 個課題／技能", [catalog.topics.filter(t => t.subjectId === s.id).length]) : (s.group ?? (s.category === 'C' ? '外部語言考試' : '評核與課程資訊'))}</span><Icon name="arrow" size={16}/></div></Link>)}</div><div className="source-note"><Icon name="file" size={14}/><span>{ui("按已公布官方科目目錄整理；應用學習的開課批次與名稱仍須按應考年份核對。")}</span><a href="https://www.hkeaa.edu.hk/en/hkdse/assessment/subject_information/" target="_blank" rel="noreferrer">{ui("查看來源")}<Icon name="external" size={12}/></a></div></div>;
    if (!subject)
        return <Empty title={ui("找不到這個學科")} description={ui("返回科目目錄選擇另一科。")} action={<Link className="btn primary" to="/subjects">{ui("返回目錄")}</Link>}/>;
    if (selected)
        return <DirectTopicPage subject={subject} topic={selected} onBack={() => setParams({})} />;
    const facProg = computeFactorisationProgress(db.learning?.guided);
    const topicProgress = (id: string) => {
        const m = mastery(id, db.evidence);
        if (id === FACTORISATION_TOPIC_ID && (facProg.startedAny || !m.count)) {
            if (!facProg.startedAny) return { score: 0, count: 0, label: '未評估' };
            return { score: facProg.overallPercent, count: facProg.independentSolved || 1, label: facProg.overallPercent >= 75 ? '較穩固' : facProg.overallPercent >= 35 ? '學習中' : '需加強' };
        }
        return m;
    };
    const allTopics = catalog.topics.filter(t => t.subjectId === subjectId);
    const modules = [...new Set(allTopics.map(t => t.module))];
    const filtered = allTopics.filter(t => (module === 'all' || t.module === module) && `${t.name}${t.en}`.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || (status === 'ready' ? t.ready : status === 'weak' ? topicProgress(t.id).label === '需加強' : topicProgress(t.id).count === 0)));
    const groups = view === 'papers' ? [...new Set(filtered.flatMap(t => t.papers))] : [...new Set(filtered.map(t => t.unit))];
    return <div className="page-enter"><Link className="back-link" to="/subjects"><Icon name="left" size={15}/>{ui("所有學科")}</Link><header className="subject-header"><SubjectIcon id={subjectId} size="lg"/><div><div className="eyebrow">{subject.en.toUpperCase()}</div><h1>{subject.name}</h1><p>{subject.ready ? ui("按知識點累積證據，用適合自己的步伐學習。") : ui("課程入口已準備好，學習內容正在籌備。")}</p></div>{subject.ready && <Link className="btn primary" to={`/quizzes?subjectId=${subjectId}&kind=diagnostic`}><Icon name="compass" size={17}/>{ui("快速摸底")}</Link>}</header>{!subject.ready ? <Empty icon="leaf" title={ui("這一科的內容，正在慢慢準備。")} description={subject.category === 'B' ? ui("應用學習由課程提供機構評核，這裡不會套用普通卷一、卷二的結構。") : subject.category === 'C' ? ui("其他語言按指定的外部考試安排評核，詳細要求請查閱適用年份資料。") : ui("首版已開放中文、英文、數學和化學的代表性內容。")} action={<a className="btn secondary" href={subject.source} target="_blank" rel="noreferrer">{ui("查看官方科目資料")}<Icon name="external" size={16}/></a>}/> : <><div className="paper-summary">{(paperInfo[subjectId] ?? []).map(p => <div key={p.name}><div><strong>{ui(p.name)}</strong><Badge>{p.weight}</Badge></div><span>{ui(p.duration)}</span><small>{ui(p.description)}</small></div>)}</div><div className="section-title"><h2>{ui("你的知識地圖")}</h2><div className="segmented"><button className={view === 'knowledge' ? 'active' : ''} onClick={() => setView('knowledge')}>{ui("按課程")}</button><button className={view === 'papers' ? 'active' : ''} onClick={() => setView('papers')}>{ui("按試卷")}</button></div></div><div className="filter-row topic-filters"><div className="chip-row"><button className={`chip ${module === 'all' ? 'selected' : ''}`} onClick={() => setModule('all')}>{ui("全部")}</button>{modules.map(m => <button key={m} className={`chip ${module === m ? 'selected' : ''}`} onClick={() => setModule(m)}>{m}</button>)}</div><div className="filter-controls"><select value={status} onChange={e => setStatus(e.target.value)} aria-label={ui("篩選知識點狀態")}><option value="all">{ui("所有狀態")}</option><option value="ready">{ui("已有演示內容")}</option><option value="weak">{ui("需要加強")}</option><option value="unassessed">{ui("未評估")}</option></select><div className="search-input compact"><Icon name="search" size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={ui("搜尋知識點")} aria-label={ui("搜尋知識點")}/></div></div></div><div className="knowledge-map">{groups.map(group => <section className="knowledge-group" key={group}><div className="knowledge-group-title"><span className="group-dot" style={{ background: subject.color }}/><h3>{ui(group)}</h3><span>{ui("{0} 個知識點", [filtered.filter(t => view === 'papers' ? t.papers.includes(group) : t.unit === group).length])}</span></div>{filtered.filter(t => view === 'papers' ? t.papers.includes(group) : t.unit === group).map(t => { const m = topicProgress(t.id); return <button key={t.id} className="knowledge-row" onClick={() => setParams({ topic: t.id })}><span className={`knowledge-state ${t.ready ? 'ready' : ''}`}><Icon name={t.ready ? 'book' : 'lock'} size={16}/></span><div><strong>{t.name}</strong><small>{t.en}</small></div><span className="knowledge-paper">{t.papers.join(' / ')}</span>{t.ready ? <><span className="mini-progress"><Progress value={m.score ?? 0} color={subject.color}/></span><Badge tone={m.label === '需加強' ? 'amber' : m.label === '較穩固' ? 'green' : 'neutral'}>{m.count ? ui(m.label) : ui("未評估")}</Badge></> : <Badge>{ui("內容籌備中")}</Badge>}<Icon name="right" size={16}/></button>; })}</section>)}{!groups.length && <Empty title={ui("沒有相符的知識點")} description={ui("試試調整搜尋或狀態篩選。")}/>}</div><p className="small muted section-footnote">{ui("同一知識點跨卷共用練習證據。課程目錄不代表學校實際授課次序；校本評核資訊以學校考生為基礎。")}</p></>}</div>;
}
