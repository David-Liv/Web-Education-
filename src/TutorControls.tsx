import { useEffect, useState } from 'react';
import { TUTORS, tutorName, tutorOptionSupported } from './tutors';
import type { LessonDocument, PublicTutorOption, TutorId } from './tutors';
import type { Chat } from './types';
import { useApp } from './state';
import { api, realMode } from './api/client';
import { Badge, Modal, Icon, RichText } from './components';
import { ui, useInterfaceLanguage } from './i18n';

export function TutorPicker({
  value,
  onChange,
  topicId,
  onOptionsLoaded,
}: {
  value: TutorId;
  onChange: (id: TutorId) => void;
  topicId: string;
  onOptionsLoaded?: (options: PublicTutorOption[]) => void;
}) {
  const english = useInterfaceLanguage() === 'en';
  const [options, setOptions] = useState<PublicTutorOption[]>(TUTORS);
  const [profileOption, setProfileOption] = useState<PublicTutorOption | null>(null);

  useEffect(() => {
    let active = true;
    void api<{ tutors?: PublicTutorOption[] }>('/tutors')
      .then(res => {
        if (!active || !Array.isArray(res?.tutors) || !res.tutors.length) return;
        setOptions(res.tutors);
        onOptionsLoaded?.(res.tutors);
      })
      .catch(() => {
        if (active) onOptionsLoaded?.(TUTORS);
      });
    return () => { active = false; };
  }, []);

  const builtIns = options.filter(t => t.kind === 'builtin');
  const partnersForTopic = options.filter(t => t.kind === 'partner' && tutorOptionSupported(t, topicId));

  async function openExternal(option: PublicTutorOption) {
    const url = option.partnerTutor?.externalUrl;
    if (!url) return;
    void api(`/tutors/${encodeURIComponent(option.id)}/link-click`, 'POST', {}).catch(() => {});
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <fieldset className="tutor-picker">
      <legend>{ui('選擇教學方法')}</legend>
      <div className="tutor-group-label">{ui('平台內置教學方法')}</div>
      <div className="tutor-picker-grid">
        {builtIns.map(t => {
          const supported = tutorOptionSupported(t, topicId);
          return (
            <label className={value === t.id ? 'selected' : ''} key={t.id}>
              <input
                type="radio"
                name="tutor"
                value={t.id}
                checked={value === t.id}
                disabled={!supported}
                onChange={() => onChange(t.id)}
              />
              <span>
                <strong>{t.name}</strong>
                <small>{english ? t.en : t.zh}</small>
                {!supported && <small>{ui('此主題尚未開放')}</small>}
              </span>
            </label>
          );
        })}
      </div>

      {partnersForTopic.length > 0 && (
        <>
          <div className="tutor-group-label" style={{ marginTop: 14 }}>
            {ui('本單元合作導師授權方法（AI 模擬）')}
          </div>
          <div className="tutor-picker-grid">
            {partnersForTopic.map(t => {
              const highlights = (english ? t.highlightsEn : t.highlightsZh) ?? [];
              return (
                <label className={`partner-tutor-card ${value === t.id ? 'selected' : ''}`} key={`${t.id}@${t.version}`}>
                  <input
                    type="radio"
                    name="tutor"
                    value={t.id}
                    checked={value === t.id}
                    onChange={() => onChange(t.id)}
                  />
                  <span>
                    <div className="tutor-card-head">
                      <strong>{t.name}</strong>
                      <Badge tone="green">{t.delivery === 'pdf-first' ? 'PDF' : ui('對話')}</Badge>
                    </div>
                    <small>{english ? t.en : t.zh}</small>
                    {highlights.length > 0 && (
                      <ul className="tutor-highlights">
                        {highlights.slice(0, 3).map((h, idx) => <li key={idx}>{h}</li>)}
                      </ul>
                    )}
                    <small className="tutor-disclaimer">{english ? t.disclaimerEn : t.disclaimerZh}</small>
                    <small className="tutor-privacy-hint">
                      {ui('純文字對話去名化後可能供導師改進方法，可隨時於設定關閉。')}
                    </small>
                    {t.partnerTutor && (
                      <button
                        type="button"
                        className="text-link tutor-profile-trigger"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); setProfileOption(t); }}
                      >
                        {ui('查看合作導師簡介')}
                      </button>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}

      {profileOption?.partnerTutor && (
        <Modal
          title={profileOption.partnerTutor.name}
          subtitle={english ? profileOption.partnerTutor.headlineEn : profileOption.partnerTutor.headlineZh}
          onClose={() => setProfileOption(null)}
        >
          <p>{english ? profileOption.partnerTutor.bioEn : profileOption.partnerTutor.bioZh}</p>
          {profileOption.partnerTutor.credentials && (
            <p className="small muted">{ui('教學資歷：{0}', [profileOption.partnerTutor.credentials])}</p>
          )}
          <div className="info-callout" style={{ marginTop: 12 }}>
            <Icon name="bulb" />
            <p>{english ? profileOption.disclaimerEn : profileOption.disclaimerZh}</p>
          </div>
          <div className="modal-actions">
            {profileOption.partnerTutor.externalUrl && (
              <button type="button" className="btn secondary" onClick={() => void openExternal(profileOption)}>
                {english ? profileOption.partnerTutor.externalLabelEn : profileOption.partnerTutor.externalLabelZh}
                <Icon name="external" size={14} />
              </button>
            )}
            <button type="button" className="btn primary" onClick={() => { onChange(profileOption.id); setProfileOption(null); }}>
              {ui('選用此教學方法')}
            </button>
          </div>
        </Modal>
      )}
    </fieldset>
  );
}

export function TutorDocumentCard({ chat, document, onAnswer, onRevise, disabled = false }: { chat: Chat; document: LessonDocument; onAnswer: (d: LessonDocument) => void; onRevise: (d: LessonDocument) => void; disabled?: boolean }) {
  const { toast } = useApp(), [repairing, setRepairing] = useState(false); const path = `/chats/${chat.id}/documents/${document.id}`;
  async function repair() { setRepairing(true); try { await api(path + '/render', 'POST', {}); toast('課件已重新排版'); } catch (e) { toast((e as Error).message, 'error'); } finally { setRepairing(false); } }
  return <section className="tutor-document"><div className="tutor-document-mark"><Icon name="file" size={25} /></div><div><div className="small muted">{ui('第 {0} 課', [document.number])} · v{document.version} · PDF</div><h3>{document.title}</h3><p>{document.objective}</p><div className="tutor-document-actions"><a className="btn primary" href={`${import.meta.env.VITE_API_BASE_URL ?? '/api/v1'}${path}`} download>{ui('下載課件')}<Icon name="arrow" size={14} /></a><button type="button" className="btn secondary" disabled={disabled} onClick={() => onAnswer(document)}>{ui('討論這份課件')}</button><button type="button" className="btn ghost" disabled={disabled} onClick={() => onRevise(document)}>{ui('修訂內容')}</button></div><details><summary>{ui('課件資訊')}</summary><p className="small muted">{ui('{0} 道練習 · 下載不另扣點', [document.questions])} · {Math.ceil(document.size / 1024)} KB</p><button type="button" className="btn ghost" disabled={repairing || !realMode} onClick={() => void repair()}>{repairing ? ui('整理中…') : ui('重新排版現有內容（免費）')}</button></details></div></section>;
}

export function TutorSettings({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const { db, mutate, toast } = useApp(), [draft, setDraft] = useState(chat.teaching), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState<Record<string, boolean>>({}), [pending, setPending] = useState<Record<string, boolean>>({}), [resources, setResources] = useState<{ id: string; title: string; url: string; use: string }[]>([]);
  useEffect(() => { void api('/tutors').then(v => setResources(v.resources ?? [])).catch(() => {}); }, []);
  const records = (db.tutorMemory?.records ?? []).filter(r => r.topicId === chat.topicId), terms = (db.tutorMemory?.terms ?? []).filter(t => records.some(r => r.id === t.recordId));
  async function confirm(id: string, value: boolean, previous: boolean) { setConfirmed(s => ({ ...s, [id]: value })); setPending(s => ({ ...s, [id]: true })); try { await mutate('/tutor-memory/' + id, 'PUT', { confirmed: value }); } catch { setConfirmed(s => ({ ...s, [id]: previous })); } finally { setPending(s => ({ ...s, [id]: false })); } }
  async function save() { if (!draft) return; setBusy(true); try { const { sourceIds, ...values } = draft; await mutate(`/chats/${chat.id}/teaching`, 'PATCH', values); toast('學習設定已儲存'); onClose(); } catch { } finally { setBusy(false); } }
  return <Modal title={ui('學習設定與筆記')} subtitle={`${tutorName(chat.tutor)} · ${chat.tutor?.version ? 'v' + chat.tutor.version : ui('原有教學版本')}`} onClose={onClose}>{draft && <><div className="form-grid">{([['mission', '學習目的'], ['success', '學會後能做到甚麼'], ['constraints', '時間與限制'], ['outOfScope', '這次先不學甚麼'], ['preferences', '我的學習偏好']] as const).map(([key, label]) => <label className="field full" key={key}><span>{ui(label)}</span><textarea maxLength={1200} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>)}</div><button className="btn primary" disabled={busy} onClick={() => void save()}>{ui('儲存設定')}</button></>}
    <h3>{ui('學習筆記')}</h3><p className="small muted">{ui('這些筆記幫助導師接著教，不代表正式測驗成績。')}</p>{!records.length && <p className="small muted">{ui('作答或說明你的理解後，相關筆記會保留在這裡。')}</p>}{records.slice(-15).reverse().map(r => <div className="tutor-record" key={r.id}><RichText text={r.text} /><details><summary>{ui('查看依據')}</summary><p>{r.quote}</p><p className="small muted">{ui('學習對話中的理解記錄')}</p></details><label><input type="checkbox" checked={confirmed[r.id] ?? !!r.confirmed} disabled={pending[r.id]} onChange={e => void confirm(r.id, e.target.checked, !!r.confirmed)} />{ui('這符合我的理解')}</label></div>)}
    {terms.length > 0 && <><h3>{ui('我的概念速查')}</h3>{terms.map(t => <p key={t.recordId}><strong>{t.term}</strong>：{t.definition}</p>)}</>}
    {chat.documents?.length ? <><h3>{ui('課程速查')}</h3>{chat.documents.map(d => <details key={d.id}><summary>{ui('第 {0} 課', [d.number])} · {d.title} · v{d.version}</summary><RichText text={d.reference} /></details>)}</> : null}
    <h3>{ui('參考資料')}</h3>{resources.filter(r => chat.teaching?.sourceIds.includes(r.id)).map(r => <p key={r.id}><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a></p>)}{chat.subjectId === 'maths' && <p className="small muted">{ui('尚未收錄經核實的計算器按鍵教學。')}</p>}</Modal>;
}
