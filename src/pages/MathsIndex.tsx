import { ui, useInterfaceLanguage } from "../i18n";
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Empty, Icon, NetworkError, PageHeading, Skeleton, Tabs } from '../components';
interface Source {
    id: string;
    name: string;
    url: string;
    coverage: string;
    note: string;
}
interface QuestionIndex {
    id: string;
    kind: string;
    sourceId: string;
    year: number;
    paper: string;
    number: number;
    topic: string;
    knowledgePoints?: string[];
    sourceDifficultyLabels: string[];
    displayDifficulty: string;
    publisherTargetLevel?: string;
    sourceCorrectPercentage?: number | null;
    url: string;
    linkScope?: string;
    sourceLocation?: string;
}
interface Collection {
    id: string;
    sourceId: string;
    language: string;
    topic: string;
    sourceTopicLabel: string;
    paper: string;
    coverage: string;
    yearRange: number[];
    url: string | null;
    sourceUrl: string;
    difficulty: string;
    contentStatus: string;
}
interface MathsIndex {
    schemaVersion: number;
    checkedAt: string;
    sources: Source[];
    questions: QuestionIndex[];
    collections: Collection[];
    audit: {
        overlappingDifficultyQuestions: number;
    };
}
export function MathsIndexPage() {
    useInterfaceLanguage();
    const [data, setData] = useState<MathsIndex | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
    const [mode, setMode] = useState('questions'), [source, setSource] = useState('all'), [topic, setTopic] = useState('all'), [difficulty, setDifficulty] = useState('all'), [year, setYear] = useState('all'), [query, setQuery] = useState(''), [page, setPage] = useState(1);
    useEffect(() => { const controller = new AbortController(); setError(''); fetch('/data/maths-source-index.json', { signal: controller.signal }).then(async (r) => { if (!r.ok)
        throw new Error('題目索引暫時未能讀取'); const result = await r.json(); if (result.schemaVersion !== 1 || !Array.isArray(result.questions) || !Array.isArray(result.collections))
        throw new Error('題目索引格式需要更新'); setData(result); }).catch(e => { if (e.name !== 'AbortError')
        setError(e.message); }); return () => controller.abort(); }, [attempt]);
    useEffect(() => setPage(1), [mode, source, topic, difficulty, year, query]);
    const topics = useMemo(() => [...new Set([...(data?.questions ?? []), ...(data?.collections ?? [])].map(q => q.topic))].sort((a, b) => a.localeCompare(b, 'zh-Hant')), [data]);
    const filteredQuestions = (data?.questions ?? []).filter(q => (source === 'all' || q.sourceId === source) && (topic === 'all' || q.topic === topic) && (year === 'all' || String(q.year) === year) && (difficulty === 'all' || q.sourceDifficultyLabels.includes(difficulty) || q.publisherTargetLevel === difficulty) && `${q.id} ${ui(q.topic)} ${q.knowledgePoints?.join(' ') ?? ''}`.toLowerCase().includes(query.toLowerCase()));
    const filteredCollections = (data?.collections ?? []).filter(c => (source === 'all' || c.sourceId === source) && (topic === 'all' || c.topic === topic) && (difficulty === 'all' || difficulty === '待標註') && (year === 'all' || (Number(year) >= c.yearRange[0] && Number(year) <= c.yearRange[1])) && `${ui(c.topic)} ${ui(c.sourceTopicLabel)} ${c.paper} ${ui(c.language)}`.toLowerCase().includes(query.toLowerCase()));
    const count = mode === 'questions' ? filteredQuestions.length : filteredCollections.length, totalPages = Math.max(1, Math.ceil(count / 24)), currentPage = Math.min(page, totalPages), offset = (currentPage - 1) * 24;
    if (error)
        return <NetworkError error={error} retry={() => setAttempt(n => n + 1)}/>;
    if (!data)
        return <Skeleton rows={5}/>;
    const sourceName = (id: string) => data.sources.find(s => s.id === id)?.name ?? id;
    return <div className="page-enter maths-index"><PageHeading eyebrow="FIND A TOPIC, TRACE THE SOURCE" title={ui("數學題目，按課題慢慢找。")} description={ui("外部題目與文件索引 · 核對 {0} · 數學必修", [data.checkedAt])} action={<Link className="btn secondary" to="/help#guide-8"><Icon name="help" size={16}/>{ui("使用與難度說明")}</Link>}/>
    <div className="pilot-banner"><Icon name="book"/><div><strong>{ui("這裡先幫你找題；正式測驗在「專題測驗」。")}</strong><p>{ui("原題與答案在來源網站查看。來源難度、出版者目標程度及官方 DSE 成績分開；2028 課綱逐題適用性仍待核對。")}</p></div></div>
    <div className="source-overview">{data.sources.map(s => <section className="card source-summary" key={s.id}><Badge>{s.id === 'dselib' ? ui("逐題元資料") : s.id === 'oup' ? ui("公開樣本練習") : ui("課題文件入口")}</Badge><h2>{ui(s.name)}</h2><p>{ui(s.coverage)}</p><details><summary>{ui("覆蓋狀態與標籤依據")}</summary><p>{ui(s.note)}</p><a className="text-link" href={s.url} target="_blank" rel="noopener noreferrer">{ui("查看來源")}<Icon name="external" size={13}/></a></details></section>)}</div>
    <div className="index-tabs"><Tabs value={mode} onChange={setMode} items={[{ id: 'questions', label: '逐題索引', count: data.questions.length }, { id: 'collections', label: '課題文件', count: data.collections.filter(c => c.url).length }]}/><div className="pilot-actions"><a className="btn ghost" href="/data/maths-questions.csv" download><Icon name="arrowDown" size={15}/>{ui("逐題 CSV")}</a><a className="btn ghost" href="/data/maths-collections.csv" download><Icon name="arrowDown" size={15}/>{ui("文件 CSV")}</a></div></div>
    <section className="card index-filters" aria-label={ui("題目索引篩選")}><label className="field"><span>{ui("來源")}</span><select aria-label={ui("來源")} value={source} onChange={e => setSource(e.target.value)}><option value="all">{ui("全部來源")}</option>{data.sources.map(s => <option key={s.id} value={s.id}>{ui(s.name)}</option>)}</select></label><label className="field"><span>{ui("知識點／By Topic")}</span><select aria-label={ui("知識點／By Topic")} value={topic} onChange={e => setTopic(e.target.value)}><option value="all">{ui("全部課題")}</option>{topics.map(t => <option key={t} value={t}>{ui(t)}</option>)}</select></label><label className="field"><span>{ui("來源難度／出版者目標")}</span><select aria-label={ui("來源難度／出版者目標")} value={difficulty} onChange={e => setDifficulty(e.target.value)}><option value="all">{ui("全部／含未標註")}</option>{['簡單', '中等', '困難', '極難', '待標註'].map(d => <option key={d} value={d}>{ui(d)}</option>)}{['2+', '4+', '5**'].map(d => <option key={d} value={d}>{ui("出版者目標 {0}", [d])}</option>)}</select></label><label className="field"><span>{ui("年份")}</span><select aria-label={ui("年份")} value={year} onChange={e => setYear(e.target.value)}><option value="all">{ui("全部年份")}</option>{Array.from({ length: 13 }, (_, i) => 2024 - i).map(y => <option key={y} value={y}>{y}</option>)}</select></label><label className="field index-search"><span>{ui("搜尋題號或知識點")}</span><input aria-label={ui("搜尋題號或知識點")} value={query} onChange={e => setQuery(e.target.value)} placeholder={ui("例如 Q7、垂直條件、二次方程")}/></label></section>
    <p className="small muted index-count" role="status">{ui("找到 {0} {1}。{2}", [count, mode === 'questions' ? ui("道題目元資料") : ui("個分類位置"), mode === 'questions' ? ui("{0} 道歷屆題同時在「困難／極難」分組；篩選保留交集，不重複計題。", [data.audit.overlappingDifficultyQuestions]) : ui("文件入口未讀取逐題正文，沒有題數或難度；其中 3 個英文位置在來源沒有連結。")])}</p>
    {count === 0 ? <Empty icon="search" title={ui("這組條件暫時沒有題目")} description={ui("可放寬來源、年份或程度篩選；沒有依據的欄位不會補上猜測值。")} action={<button className="btn secondary" onClick={() => { setSource('all'); setTopic('all'); setDifficulty('all'); setYear('all'); setQuery(''); }}>{ui("清除篩選")}</button>}/> : <div className="index-results">{mode === 'questions' ? filteredQuestions.slice(offset, offset + 24).map(q => <article className="card index-result" key={q.id}><div className="row-between"><Badge>{ui(sourceName(q.sourceId))}</Badge><Badge tone="green">{ui(q.displayDifficulty)}</Badge></div><h3>{q.kind === 'publisher-exercise' ? ui("牛津 4A 第2章 · 習題2 Q{0}", [q.number]) : ui("{0} DSE 卷二 · Q{1}", [q.year, q.number])}</h3><p className="index-topic">{ui(q.topic)}</p>{q.knowledgePoints && <p className="small muted">{ui("細分知識點（平台初步映射）：{0}", [q.knowledgePoints.map(p=>ui(p)).join(' · ')])}</p>}{q.sourceDifficultyLabels.length > 0 && <p className="small muted">{ui("來源全部難度：{0}", [q.sourceDifficultyLabels.map(p=>ui(p)).join(' / ')])}</p>}{q.sourceCorrectPercentage !== undefined && q.sourceCorrectPercentage !== null && <p className="small muted">{ui("來源所列正確率 {0}% · 樣本與官方統計未核實", [q.sourceCorrectPercentage])}</p>}<p className="small muted">{q.kind === 'publisher-exercise' ? ui("出版者自編練習；目標程度不套用到參照歷屆題。") : ui(q.linkScope)}</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><a className="btn secondary" href={q.url} target="_blank" rel="noopener noreferrer">{q.kind === 'publisher-exercise' ? ui("到官方樣本查看") : ui("到來源尋找本題")}<Icon name="external" size={14}/></a><Link className="btn ghost" to="/forum" state={{ composeDraft: { boardId: 'sub-maths', flair: 'help', title: q.kind === 'publisher-exercise' ? `牛津 4A 第2章 習題2 Q${q.number}` : `${q.year} DSE Maths Paper 2 Q${q.number}`, questionRef: { sourceKind: 'maths-index', subjectId: 'maths', topicName: q.topic, title: q.kind === 'publisher-exercise' ? `牛津 4A 習題2 Q${q.number}` : `${q.year} DSE 卷二 Q${q.number}`, promptExcerpt: `${q.topic}${q.knowledgePoints?.length ? ' · ' + q.knowledgePoints.join(' / ') : ''}`, externalUrl: q.url } } }}><Icon name="forum" size={14}/>{ui("去討論區討論")}</Link></div></article>) : filteredCollections.slice(offset, offset + 24).map(c => <article className="card index-result" key={c.id}><div className="row-between"><Badge>{c.language === 'en' ? ui("英文") : ui("中文")} · {ui(c.paper)}</Badge><Badge>{ui("難度待標註")}</Badge></div><h3>{ui(c.topic)}</h3><p className="small muted">{ui("DSE Treasure · {0} · {1}集合", [ui(c.coverage), c.paper === 'LQ' ? ui("長題目") : ui("選擇題")])}</p><p className="small muted">{ui("原始分類：{0}。{1}", [ui(c.sourceTopicLabel), c.url ? ui("已提取分類入口；未讀取文件正文。") : ui("來源此位置未提供連結。")])}</p><a className="btn secondary" href={c.url ?? c.sourceUrl} target="_blank" rel="noopener noreferrer">{c.url ? ui("開啟來源文件入口") : ui("回分類來源頁")}<Icon name="external" size={14}/></a></article>)}</div>}
    {totalPages > 1 && <nav className="index-pagination" aria-label={ui("題目索引分頁")}><button className="btn secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>{ui("上一頁")}</button><span>{ui("第 {0} / {1} 頁", [currentPage, totalPages])}</span><button className="btn secondary" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>{ui("下一頁")}</button></nav>}
    <p className="small muted">{ui("需要判斷自己的程度，可在平台已發布單元完成測驗。外部網站的作答不會自動同步為正式掌握證據。")}</p>
  </div>;
}
