import { useState } from 'react';
import { ui, useInterfaceLanguage } from '../i18n';
import { api } from '../api/client';
import { Confirm, Icon } from '../components';
import type { PlaybookVersionView } from '../partner-studio';
import { usePartner } from './partner-context';
import { shortDate } from './PartnerHome';
import type { UnitStepProps } from './UnitPipeline';

const AGREEMENT = '我確認：這套方法是我本人的教學方法；例題為我自編或已獲授權；內容不含收費、聯絡方式或成績保證；我同意平台以 AI 按此方法輔導學生，並向學生標明「非真人即時回覆」。';

export function SubmitStep({ current, versions, go, readOnly }: UnitStepProps & { current: PlaybookVersionView; versions: PlaybookVersionView[] }) {
  useInterfaceLanguage();
  const { reload, notify } = usePartner();
  const [agree, setAgree] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmTakedown, setConfirmTakedown] = useState(false);
  const base = `/partner/playbooks/${encodeURIComponent(current.id)}/versions/${current.version}`;
  const blockers = current.complianceFindings.filter(f => f.severity === 'blocker').length;
  const live = versions.find(v => v.status === 'published');

  const act = async (path: string, body: unknown, message: string, after?: () => void) => {
    setBusy(true);
    setError('');
    try {
      await api(path, 'POST', body);
      await reload();
      notify(message);
      after?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    { label: '草稿已生成', at: current.createdAt, done: true },
    { label: '沙盒試聊通過', at: current.sandboxPassedAt, done: Boolean(current.sandboxPassedAt) || current.status !== 'draft' },
    { label: '你已確認並提交', at: current.tutorConfirmedAt, done: Boolean(current.tutorConfirmedAt) || current.status !== 'draft' },
    { label: '平台審核通過並上架', at: current.publishedAt, done: Boolean(current.publishedAt) },
  ];

  return (
    <div className="ps-submit">
      <div className="ps-step-head">
        <h2>{ui('提交審核（第 {0} 版）', [current.version])}</h2>
        <p className="muted">{ui('平台會復核版權、合規和試聊結果；通過後，學生就可以在這個單元的 AI 學習室選用你的方法。')}</p>
      </div>

      <ol className="ps-timeline">
        {steps.map(s => (
          <li key={s.label} className={s.done ? 'done' : ''}>
            <span className="ps-timeline-dot" aria-hidden="true">{s.done && <Icon name="check" size={12} />}</span>
            <strong>{ui(s.label)}</strong>
            <span className="small muted">{s.done && s.at ? shortDate(s.at) : ''}</span>
          </li>
        ))}
      </ol>

      {current.status === 'draft' && current.reviewerReturnNote && !current.tutorConfirmedAt && (
        <div className="ps-banner red" role="status">
          <Icon name="flag" size={18} />
          <div>
            <strong>{ui('平台退回修改')}</strong>
            <p>{current.reviewerReturnNote}</p>
          </div>
          <button type="button" className="btn secondary small-btn" onClick={() => go('playbook')}>{ui('去修改')}</button>
        </div>
      )}

      {current.status === 'draft' && !current.tutorConfirmedAt && (
        <section className="ps-panel ps-agreement">
          <h3>{ui('確認聲明')}</h3>
          {!current.sandboxPassedAt && <p className="small muted">{ui('需要先通過沙盒試聊才可以提交。')}</p>}
          {blockers > 0 && <p className="form-error small">{ui('方法包仍有 {0} 項紅線問題，請先修改。', [blockers])}</p>}
          <label className="ps-agree">
            <input type="checkbox" checked={agree} disabled={readOnly} onChange={e => setAgree(e.target.checked)} />
            <span>{ui(AGREEMENT)}</span>
          </label>
          <label className="field">
            <span>{ui('給審核同事的備註（選填）')}</span>
            <textarea rows={3} maxLength={500} value={note} disabled={readOnly} onChange={e => setNote(e.target.value)} placeholder={ui('例如：例題二的數字是我自己改編的。')} />
          </label>
          <div className="ps-step-actions inline">
            <button type="button" className="btn primary" disabled={readOnly || busy || !agree || !current.sandboxPassedAt || blockers > 0} onClick={() => void act(`${base}/submit`, { agree: true, note: note.trim() || undefined }, '已提交平台審核')}>
              <Icon name="send" size={16} />
              {busy ? ui('正在提交…') : ui('提交平台審核')}
            </button>
          </div>
        </section>
      )}

      {current.status === 'draft' && current.tutorConfirmedAt && (
        <section className="ps-panel">
          <h3>{ui('等待平台審核')}</h3>
          <p className="muted">{ui('你在 {0} 提交了這一版。審核期間內容鎖定；如發現要修改，可以先撤回。', [shortDate(current.tutorConfirmedAt)])}</p>
          {live && <p className="small muted">{ui('目前上架中的仍是第 {0} 版，新版通過後會自動取代。', [live.version])}</p>}
          <div className="ps-step-actions inline">
            <button type="button" className="btn secondary" disabled={readOnly || busy} onClick={() => void act(`${base}/withdraw`, {}, '已撤回提交，可以繼續修改')}>
              <Icon name="reset" size={16} />
              {ui('撤回提交')}
            </button>
          </div>
        </section>
      )}

      {current.status === 'published' && (
        <section className="ps-panel">
          <h3>{ui('已上架')}</h3>
          <p className="muted">{ui('學生在這個單元的 AI 學習室可以選用你的方法，回覆會標明由 AI 按你的方法輔導。數據可在「數據與回饋」查看。')}</p>
          <div className="ps-step-actions inline">
            <button type="button" className="btn primary" disabled={readOnly || busy} onClick={() => void act(`${base}/fork`, {}, '已建立新版本草稿', () => go('playbook'))}>
              <Icon name="pencil" size={16} />
              {ui('建立新版本來修改')}
            </button>
            <button type="button" className="btn ghost" disabled={readOnly || busy} onClick={() => setConfirmTakedown(true)}>
              {ui('下架這個方法')}
            </button>
          </div>
        </section>
      )}

      {current.status === 'archived' && (
        <section className="ps-panel">
          <h3>{ui('已下架')}</h3>
          <p className="muted">{ui('學生不能再用這一版開新對話，舊對話仍可唯讀查看。你可以用這一版的內容建立新草稿，再走一次審核。')}</p>
          <div className="ps-step-actions inline">
            <button type="button" className="btn primary" disabled={readOnly || busy} onClick={() => void act(`${base}/fork`, {}, '已建立新版本草稿', () => go('playbook'))}>
              <Icon name="pencil" size={16} />
              {ui('以這一版建立新草稿')}
            </button>
          </div>
        </section>
      )}

      {error && <p className="form-error" role="alert">{ui(error)}</p>}

      {versions.length > 1 && (
        <section className="ps-panel">
          <h3>{ui('版本紀錄')}</h3>
          <ul className="ps-versions">
            {versions.map(v => (
              <li key={v.version}>
                <strong>{ui('第 {0} 版', [v.version])}</strong>
                <span className={`badge ${v.status === 'published' ? 'green' : v.status === 'archived' ? 'neutral' : 'blue'}`}>{v.status === 'published' ? ui('已上架') : v.status === 'archived' ? ui('已下架') : ui('草稿')}</span>
                <span className="small muted">{shortDate(v.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirmTakedown && (
        <Confirm
          title={ui('確定下架這個方法？')}
          description={ui('下架後學生不能再用它開新對話，進行中的對話也會停止回覆；舊對話紀錄仍會保留供學生查看。')}
          onClose={() => setConfirmTakedown(false)}
          onConfirm={() => { setConfirmTakedown(false); void act(`${base}/withdraw`, {}, '已下架'); }}
        />
      )}
    </div>
  );
}
