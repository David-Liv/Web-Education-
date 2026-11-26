import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ui, useInterfaceLanguage } from '../i18n';
import { Icon } from '../components';
import { latestByTopic, RECORDING_CHAPTERS, UNIT_STAGE_LABEL, unitStage } from '../partner-studio';
import type { PartnerSubject, PartnerTopic } from '../partner-studio';
import { partnerTopicsWithLocalWork } from '../platform/partner-drafts';
import { subjectOf, usePartner } from './partner-context';

export function SubjectMark({ subject }: { subject?: PartnerSubject }) {
  return (
    <span className="ps-subject" style={{ '--subject': subject?.color ?? '#3c8272' } as CSSProperties} aria-hidden="true">
      {subject?.id === 'maths' ? <Icon name="maths" size={17} /> : subject?.id === 'chem' ? <Icon name="chem" size={17} /> : subject?.icon ?? '學'}
    </span>
  );
}

export function topicLabel(topic: PartnerTopic | undefined, language: string, fallback = ''): string {
  if (!topic) return fallback;
  return language === 'en' ? topic.en || topic.name : topic.name;
}

export function shortDate(iso?: string): string {
  if (!iso) return '—';
  const formatted = new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en-GB' : 'zh-HK', { month: 'short', day: 'numeric', timeZone: 'Asia/Hong_Kong' }).format(new Date(iso));
  return formatted.replace(/(\d)(?=[月日])/g, '$1\u2060').replace(/([月])(?=\d)/g, '$1\u2060').replace(/ /g, '\u00a0');
}

export function PartnerHome() {
  const language = useInterfaceLanguage();
  const navigate = useNavigate();
  const { workspace } = usePartner();
  const { partnerTutor, catalog } = workspace;
  const [subjectId, setSubjectId] = useState(catalog.subjects[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const latest = useMemo(() => latestByTopic(workspace.playbooks), [workspace.playbooks]);
  const localWork = useMemo(() => partnerTopicsWithLocalWork(partnerTutor.id), [partnerTutor.id]);
  const activeTopicIds = [...new Set([...latest.keys(), ...localWork])].filter(id => catalog.topics.some(t => t.id === id));
  const archived = partnerTutor.status !== 'active';

  const q = query.trim().toLowerCase();
  const pickable = catalog.topics.filter(
    t => !activeTopicIds.includes(t.id) && (q ? `${t.name} ${t.en} ${t.module}`.toLowerCase().includes(q) : t.subjectId === subjectId)
  );
  const totalMinutes = RECORDING_CHAPTERS.reduce((sum, c) => sum + c.minutes[1], 0);

  return (
    <div className="ps-home page-enter">
      <header className="ps-heading">
        <h1>{ui('你好，{0}', [partnerTutor.name])}</h1>
        <p>{ui('錄下你教一個單元的方法，平台把它整理成學生可選的 AI 教學方法；每一版都要你確認、平台審核後才會上架。')}</p>
      </header>

      {archived && (
        <div className="ps-banner red" role="status">
          <Icon name="lock" size={18} />
          <p>{ui('你的合作導師資料已下架，目前只可查看紀錄。如有疑問請聯絡平台。')}</p>
        </div>
      )}
      {!workspace.modelReady && !archived && (
        <div className="ps-banner amber" role="status">
          <Icon name="alert" size={18} />
          <p>{ui('平台暫未接通 AI 模型：你仍可準備、錄音後用文字輸入講稿；語音轉寫、編譯和試聊會在接通後開放。')}</p>
        </div>
      )}

      <div className="ps-home-grid">
        <div className="ps-home-main">
          <section className="ps-panel" aria-labelledby="ps-my-units">
            <div className="ps-panel-head">
              <h2 id="ps-my-units">{ui('我的單元方法')}</h2>
              <span className="muted small">{ui('{0} 個單元', [activeTopicIds.length])}</span>
            </div>
            {activeTopicIds.length === 0 ? (
              <div className="ps-empty">
                <Icon name="mic" size={22} />
                <div>
                  <h3>{ui('先選一個你最拿手的單元')}</h3>
                  <p className="muted">{ui('按提綱錄五段，合共約 {0} 分鐘；講錯可以重錄，錄音轉成文字後即刪除。', [totalMinutes])}</p>
                </div>
              </div>
            ) : (
              <ul className="ps-unit-list">
                {activeTopicIds.map(topicId => {
                  const topic = catalog.topics.find(t => t.id === topicId)!;
                  const pb = latest.get(topicId);
                  const stage = unitStage(pb, localWork.has(topicId));
                  const meta = UNIT_STAGE_LABEL[stage];
                  return (
                    <li key={topicId}>
                      <Link to={`/partner/units/${topicId}`} className="ps-unit-row">
                        <SubjectMark subject={subjectOf(workspace, topic.subjectId)} />
                        <div className="ps-unit-name">
                          <strong>{topicLabel(topic, language)}</strong>
                          <span>{pb ? ui('{0} · 第 {1} 版 · 更新於 {2}', [ui(topic.module), pb.version, shortDate(pb.updatedAt)]) : ui(topic.module)}</span>
                        </div>
                        <span className={`badge ${meta.tone}`}>{ui(meta.label)}</span>
                        <Icon name="right" size={16} className="ps-row-arrow" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {!archived && (
            <section className="ps-panel" aria-labelledby="ps-new-unit">
              <div className="ps-panel-head">
                <h2 id="ps-new-unit">{ui('開始新單元')}</h2>
              </div>
              <div className="ps-picker-tools">
                <div className="segmented" role="tablist" aria-label={ui('學科')}>
                  {catalog.subjects.map(s => (
                    <button key={s.id} type="button" role="tab" aria-selected={!q && subjectId === s.id} className={!q && subjectId === s.id ? 'active' : ''} onClick={() => { setSubjectId(s.id); setQuery(''); }}>
                      {language === 'en' ? s.en : s.name}
                    </button>
                  ))}
                </div>
                <label className="ps-search">
                  <Icon name="search" size={16} />
                  <span className="sr-only">{ui('搜尋單元')}</span>
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder={ui('搜尋單元，例如：二次方程')} />
                </label>
              </div>
              {pickable.length === 0 ? (
                <p className="muted ps-picker-empty">{ui('沒有相符的單元。')}</p>
              ) : (
                <ul className="ps-topic-grid">
                  {pickable.slice(0, 24).map(t => (
                    <li key={t.id}>
                      <button type="button" className="ps-topic" onClick={() => navigate(`/partner/units/${t.id}`)}>
                        <strong>{topicLabel(t, language)}</strong>
                        <span>{ui(t.module)}</span>
                        <Icon name="plus" size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <aside className="ps-home-aside">
          <section className="ps-panel ps-profile" aria-labelledby="ps-profile-title">
            <h2 id="ps-profile-title">{ui('學生看到的資料卡')}</h2>
            <div className="ps-profile-card">
              <strong>{partnerTutor.name}</strong>
              <p>{language === 'en' ? partnerTutor.headlineEn || partnerTutor.headlineZh : partnerTutor.headlineZh}</p>
              {partnerTutor.credentials && <span className="small muted">{partnerTutor.credentials}</span>}
              {partnerTutor.externalUrl && (
                <span className="ps-profile-link">
                  <Icon name="external" size={14} />
                  {language === 'en' ? partnerTutor.externalLabelEn : partnerTutor.externalLabelZh}
                </span>
              )}
            </div>
            <p className="small muted">{ui('資料卡由平台與你協定後設定。需要修改介紹或外部連結，請聯絡平台。')}</p>
          </section>
          <section className="ps-panel ps-how" aria-labelledby="ps-how-title">
            <h2 id="ps-how-title">{ui('一個單元怎樣上架')}</h2>
            <ol>
              <li><strong>{ui('按提綱錄音')}</strong><span>{ui('五段，每段 1–5 分鐘，可附板書相片')}</span></li>
              <li><strong>{ui('校對講稿')}</strong><span>{ui('AI 轉寫後由你修正公式和用詞')}</span></li>
              <li><strong>{ui('核對方法包')}</strong><span>{ui('AI 提煉成五個部分，你逐項修改')}</span></li>
              <li><strong>{ui('沙盒試聊')}</strong><span>{ui('模擬學生提問，檢查教法與安全')}</span></li>
              <li><strong>{ui('提交審核')}</strong><span>{ui('平台復核版權與合規後上架')}</span></li>
            </ol>
            <p className="small muted">{ui('今日 AI 處理餘額：{0} / {1}', [workspace.remainingModelCalls, workspace.dailyModelCalls])}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
