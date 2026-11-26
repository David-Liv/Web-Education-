import { useState } from 'react';
import { ui, useInterfaceLanguage } from '../i18n';
import { api } from '../api/client';
import { Icon } from '../components';
import { assembleManuscript, DELIVERY_OPTIONS, MIN_MANUSCRIPT_CHARS, RECORDING_CHAPTERS } from '../partner-studio';
import type { PlaybookVersionView } from '../partner-studio';
import { usePartner } from './partner-context';
import type { UnitStepProps } from './UnitPipeline';

export function ManuscriptStep({ topicId, topicName, current, draft, updateDraft, discardDraft, go, readOnly }: UnitStepProps) {
  useInterfaceLanguage();
  const { workspace, reload, notify } = usePartner();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const assembled = assembleManuscript(topicName, draft.transcripts, s => ui(s));
  const text = draft.manuscript || assembled || current?.manuscript || '';
  const chars = text.trim().length;
  const missing = RECORDING_CHAPTERS.filter(c => !draft.transcripts[c.id]?.text.trim());
  const checks = RECORDING_CHAPTERS.flatMap(c => draft.transcripts[c.id]?.formulaChecks ?? []);
  const warnings = RECORDING_CHAPTERS.flatMap(c => draft.transcripts[c.id]?.warnings ?? []);
  const openDraft = current?.status === 'draft' ? current : undefined;
  const canCompile = !readOnly && !openDraft && workspace.modelReady && chars >= MIN_MANUSCRIPT_CHARS && !busy;

  const compile = async () => {
    setBusy(true);
    setError('');
    try {
      await api<{ draft: PlaybookVersionView }>('/partner/compile', 'POST', { topicId, manuscriptMarkdown: text, deliveryHint: draft.delivery });
      discardDraft();
      await reload();
      notify('方法包草稿已生成，請逐項核對');
      go('playbook');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ps-manuscript">
      <div className="ps-step-head">
        <h2>{ui('校對講稿')}</h2>
        <p className="muted">{ui('這份講稿是方法包的唯一來源。請修正聽錯的字、公式符號和條件；平台只保存你核對過的文字，不保存錄音。')}</p>
      </div>

      <div className="ps-manuscript-layout">
        <div className="ps-editor">
          <div className="row-between ps-editor-bar">
            <span className="small muted">{ui('{0} 字', [chars])}</span>
            <button type="button" className="btn ghost small-btn" disabled={readOnly || !assembled} onClick={() => updateDraft({ manuscript: assembled })}>
              <Icon name="refresh" size={14} />
              {ui('按五段重新合併')}
            </button>
          </div>
          <textarea
            className="ps-manuscript-text"
            value={text}
            disabled={readOnly}
            aria-label={ui('完整講稿')}
            onChange={e => updateDraft({ manuscript: e.target.value })}
            placeholder={ui('完成錄音段落後，講稿會自動合併在這裡。你也可以直接貼上自己寫好的講稿。')}
          />
        </div>

        <aside className="ps-manuscript-aside">
          <section className="ps-panel">
            <h3>{ui('提交前核對')}</h3>
            <ul className="ps-tips">
              <li><Icon name="check" size={14} />{ui('公式、正負號、括號及 a≠0 一類條件正確')}</li>
              <li><Icon name="check" size={14} />{ui('例題是你自編的，沒有照搬歷屆試題或出版社習題')}</li>
              <li><Icon name="check" size={14} />{ui('沒有收費、聯絡方式、補習社名稱或保證成績')}</li>
            </ul>
          </section>
          {missing.length > 0 && missing.length < 5 && (
            <section className="ps-checks amber">
              <strong>{ui('還有 {0} 段未錄', [missing.length])}</strong>
              <ul>{missing.map(c => <li key={c.id}>{ui(c.title)}</li>)}</ul>
              <button type="button" className="btn secondary small-btn" onClick={() => go('record')}>{ui('回去補錄')}</button>
            </section>
          )}
          {checks.length > 0 && (
            <section className="ps-checks amber">
              <strong>{ui('AI 標記需要核對的地方')}</strong>
              <ul>{checks.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </section>
          )}
          {warnings.length > 0 && (
            <section className="ps-checks red">
              <strong>{ui('版權或合規提醒')}</strong>
              <ul>{warnings.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </section>
          )}
          <section className="ps-panel">
            <h3>{ui('教學形式')}</h3>
            <p className="small">{ui(DELIVERY_OPTIONS.find(o => o.id === draft.delivery)!.label)}</p>
            <button type="button" className="btn ghost small-btn" onClick={() => go('prepare')}>{ui('修改')}</button>
          </section>
        </aside>
      </div>

      {error && <p className="form-error" role="alert">{ui(error)}</p>}
      {openDraft && (
        <div className="ps-banner amber" role="status">
          <Icon name="alert" size={18} />
          <p>{ui('這個單元已有未發布的草稿（第 {0} 版），請直接在「方法包」步驟修改。', [openDraft.version])}</p>
        </div>
      )}

      <div className="ps-step-actions">
        {chars > 0 && chars < MIN_MANUSCRIPT_CHARS && <span className="small muted">{ui('講稿至少需要 {0} 字。', [MIN_MANUSCRIPT_CHARS])}</span>}
        {openDraft ? (
          <button type="button" className="btn primary" onClick={() => go('playbook')}>
            {ui('前往方法包')}
            <Icon name="arrow" size={16} />
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={!canCompile} onClick={() => void compile()}>
            <Icon name="sparkles" size={16} />
            {busy ? ui('正在提煉五個部分，約需 30–60 秒…') : ui('生成方法包')}
          </button>
        )}
      </div>
    </div>
  );
}
