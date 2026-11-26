import { useEffect, useState } from 'react';
import { ui, useInterfaceLanguage } from '../i18n';
import { api } from '../api/client';
import { Confirm, Icon } from '../components';
import { useApp } from '../state';
import type { PartnerTutorView, PlaybookVersionView, SandboxRunView } from '../partner-studio';
import { FindingsList, PlaybookView } from './PlaybookView';
import { SandboxRunResult } from './SandboxStep';
import { shortDate } from './PartnerHome';
import { PartnerTutorAdmin } from './PartnerTutorAdmin';
import './partner.css';

type Filter = 'queue' | 'published' | 'all';

function ReviewDetail({ playbook, tutorName, topicName, onDone }: { playbook: PlaybookVersionView; tutorName: string; topicName: string; onDone: () => void }) {
  useInterfaceLanguage();
  const { toast } = useApp();
  const [runs, setRuns] = useState<SandboxRunView[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'' | 'publish' | 'archive'>('');
  const base = `/admin/playbooks/${encodeURIComponent(playbook.id)}/versions/${playbook.version}`;

  useEffect(() => {
    let alive = true;
    api<{ sandboxRuns: SandboxRunView[] }>(base).then(res => { if (alive) setRuns(res.sandboxRuns); }).catch(() => undefined);
    return () => { alive = false; };
  }, [base]);

  const act = async (action: 'publish' | 'archive' | 'return', body: unknown, message: string) => {
    setBusy(true);
    setError('');
    try {
      await api(`${base}/${action}`, 'POST', body);
      toast(message);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const run = runs.find(r => r.id === playbook.sandboxRunId) ?? runs[0];
  const awaiting = playbook.status === 'draft' && Boolean(playbook.tutorConfirmedAt);

  return (
    <article className="ps-review-detail" aria-label={ui('方法包詳情')}>
      <header>
        <h3>{tutorName} · {topicName}</h3>
        <p className="small muted">
          {ui('第 {0} 版', [playbook.version])} · {playbook.status === 'published' ? ui('已上架') : playbook.status === 'archived' ? ui('已下架') : awaiting ? ui('等待審核') : ui('草稿')}
          {playbook.tutorConfirmedAt && ` · ${ui('導師於 {0} 提交', [shortDate(playbook.tutorConfirmedAt)])}`}
        </p>
      </header>
      {playbook.tutorConfirmNote && (
        <div className="ps-banner blue"><Icon name="chat" size={18} /><p><strong>{ui('導師備註')}</strong> {playbook.tutorConfirmNote}</p></div>
      )}
      <FindingsList findings={playbook.complianceFindings} />
      {run ? <SandboxRunResult run={run} /> : <p className="small muted">{ui('未有沙盒試聊紀錄。')}</p>}
      <PlaybookView playbook={playbook} />
      {playbook.manuscript && (
        <details className="ps-audit">
          <summary>{ui('查看導師核對過的講稿')}</summary>
          <pre className="ps-manuscript-preview">{playbook.manuscript}</pre>
        </details>
      )}
      {error && <p className="form-error" role="alert">{ui(error)}</p>}
      {awaiting && (
        <section className="ps-review-actions">
          <label className="field">
            <span>{ui('退回原因（退回時必填）')}</span>
            <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder={ui('例如：例題二疑似出版社習題原題，請改為原創數字。')} />
          </label>
          <div className="ps-step-actions inline">
            <button type="button" className="btn secondary" disabled={busy || note.trim().length < 4} onClick={() => void act('return', { note: note.trim() }, '已退回導師修改')}>
              <Icon name="flag" size={16} />
              {ui('退回修改')}
            </button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => setConfirm('publish')}>
              <Icon name="checkCircle" size={16} />
              {ui('核准並上架')}
            </button>
          </div>
        </section>
      )}
      {playbook.status === 'published' && (
        <div className="ps-step-actions inline">
          <button type="button" className="btn ghost" disabled={busy} onClick={() => setConfirm('archive')}>{ui('下架此版本')}</button>
        </div>
      )}
      {confirm && (
        <Confirm
          title={confirm === 'publish' ? ui('確定核准並上架？') : ui('確定下架此版本？')}
          description={confirm === 'publish' ? ui('請確認已核對版權、合規提醒和試聊結果。上架後，同一方法的舊版本會停止開新對話。') : ui('學生不能再用此版本開新對話，舊對話保留唯讀。')}
          onClose={() => setConfirm('')}
          onConfirm={() => { const action = confirm; setConfirm(''); void act(action, {}, action === 'publish' ? '已上架' : '已下架'); }}
        />
      )}
    </article>
  );
}

export function PlaybookReviewConsole({ developer }: { developer: boolean }) {
  useInterfaceLanguage();
  const { catalog } = useApp();
  const [view, setView] = useState<'review' | 'tutors'>('review');
  const [filter, setFilter] = useState<Filter>('queue');
  const [playbooks, setPlaybooks] = useState<PlaybookVersionView[]>([]);
  const [tutors, setTutors] = useState<PartnerTutorView[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const [p, t] = await Promise.all([api<{ playbooks: PlaybookVersionView[] }>('/admin/playbooks'), api<{ partnerTutors: PartnerTutorView[] }>('/admin/partner-tutors')]);
      setPlaybooks(p.playbooks);
      setTutors(t.partnerTutors);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => { void load(); }, []);

  const queue = playbooks.filter(p => p.status === 'draft' && p.tutorConfirmedAt);
  const shown = filter === 'queue' ? queue : filter === 'published' ? playbooks.filter(p => p.status === 'published') : playbooks;
  const keyOf = (p: PlaybookVersionView) => `${p.id}@${p.version}`;
  const current = shown.find(p => keyOf(p) === selected) ?? shown[0];
  const tutorName = (id: string) => tutors.find(t => t.id === id)?.name ?? id;
  const topicName = (id: string) => catalog.topics.find(t => t.id === id)?.name ?? id;

  return (
    <section className="card pilot-card ps-review">
      <div className="row-between">
        <h2>{ui('合作導師與教學方法包')}</h2>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'review'} className={view === 'review' ? 'active' : ''} onClick={() => setView('review')}>{ui('審核方法包')}{queue.length > 0 && ` · ${queue.length}`}</button>
          <button type="button" role="tab" aria-selected={view === 'tutors'} className={view === 'tutors' ? 'active' : ''} onClick={() => setView('tutors')}>{ui('合作導師資料')}</button>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{ui(error)}</p>}
      {view === 'tutors' && <PartnerTutorAdmin tutors={tutors} developer={developer} onChange={() => void load()} />}
      {view === 'review' && (
        <div className="ps-review-layout">
          <div className="ps-review-list">
            <div className="segmented" role="tablist">
              {([['queue', '待審核'], ['published', '已上架'], ['all', '全部']] as [Filter, string][]).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? 'active' : ''} onClick={() => { setFilter(id); setSelected(''); }}>{ui(label)}</button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="small muted">{filter === 'queue' ? ui('目前沒有等待審核的方法包。') : ui('沒有相符的方法包。')}</p>
            ) : (
              <ul>
                {shown.map(p => (
                  <li key={keyOf(p)}>
                    <button type="button" className={current && keyOf(current) === keyOf(p) ? 'active' : ''} onClick={() => setSelected(keyOf(p))}>
                      <strong>{tutorName(p.partnerTutorId)} · {topicName(p.topicId)}</strong>
                      <span className="small muted">
                        {ui('第 {0} 版', [p.version])} · {p.status === 'published' ? ui('已上架') : p.status === 'archived' ? ui('已下架') : p.tutorConfirmedAt ? ui('等待審核') : ui('草稿')}
                        {p.complianceFindings.length > 0 && ` · ${ui('{0} 項提醒', [p.complianceFindings.length])}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {current && <ReviewDetail key={keyOf(current) + current.updatedAt} playbook={current} tutorName={tutorName(current.partnerTutorId)} topicName={topicName(current.topicId)} onDone={() => void load()} />}
        </div>
      )}
    </section>
  );
}
