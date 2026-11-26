import { useEffect, useState } from 'react';
import { ui, useInterfaceLanguage } from '../i18n';
import { api } from '../api/client';
import { Icon, RichText } from '../components';
import { PROBE_KIND_LABEL } from '../partner-studio';
import type { PlaybookVersionView, SandboxRunView } from '../partner-studio';
import { usePartner } from './partner-context';
import { shortDate } from './PartnerHome';
import type { UnitStepProps } from './UnitPipeline';

export function SandboxRunResult({ run }: { run: SandboxRunView }) {
  useInterfaceLanguage();
  return (
    <div className="ps-sandbox-run">
      <div className={`ps-banner ${run.passed ? 'green' : 'red'}`} role="status">
        <Icon name={run.passed ? 'checkCircle' : 'alert'} size={18} />
        <p>
          {run.passed ? ui('全部 {0} 道題通過。', [run.probes.length]) : ui('{0} / {1} 道題未通過，請按提示修改方法包後再試。', [run.probes.filter(p => !p.passed).length, run.probes.length])}
          <span className="muted small"> {ui('{0} · 模型 {1}', [shortDate(run.createdAt), run.model])}</span>
        </p>
      </div>
      <ol className="ps-probes">
        {run.probes.map(probe => (
          <li key={probe.id} className={probe.passed ? 'passed' : 'failed'}>
            <div className="row-between">
              <strong>{ui(PROBE_KIND_LABEL[probe.kind])}</strong>
              <span className={`badge ${probe.passed ? 'green' : 'red'}`}>{probe.passed ? ui('通過') : ui('未通過')}</span>
            </div>
            <div className="ps-bubble student">
              <span className="small muted">{ui('模擬學生')}</span>
              <p>{probe.prompt}</p>
            </div>
            <div className="ps-bubble ai">
              <span className="small muted">{ui('AI（按你的方法）')}</span>
              <RichText text={probe.reply} />
            </div>
            {probe.issues.length > 0 && (
              <ul className="ps-issues">
                {probe.issues.map((issue, i) => <li key={i}><Icon name="alert" size={14} />{ui(issue)}</li>)}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SandboxStep({ current, go, readOnly }: UnitStepProps & { current: PlaybookVersionView }) {
  useInterfaceLanguage();
  const { workspace, reload, notify } = usePartner();
  const [run, setRun] = useState<SandboxRunView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [custom, setCustom] = useState(['', '']);
  const base = `/partner/playbooks/${encodeURIComponent(current.id)}/versions/${current.version}`;

  useEffect(() => {
    let alive = true;
    api<{ sandboxRuns: SandboxRunView[] }>(base)
      .then(res => { if (alive) setRun(res.sandboxRuns.find(r => r.id === current.sandboxRunId) ?? null); })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [base, current.sandboxRunId]);

  const blockers = current.complianceFindings.filter(f => f.severity === 'blocker').length;
  const canRun = current.status === 'draft' && !current.tutorConfirmedAt && !readOnly && workspace.modelReady && !busy;

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ run: SandboxRunView; playbook: PlaybookVersionView }>(`${base}/sandbox`, 'POST', { customPrompts: custom.filter(c => c.trim()) });
      setRun(res.run);
      await reload();
      notify(res.run.passed ? '沙盒試聊全部通過' : '有題目未通過，請查看原因', res.run.passed ? 'success' : 'error');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ps-sandbox">
      <div className="ps-step-head">
        <h2>{ui('沙盒試聊')}</h2>
        <p className="muted">{ui('平台用 4 道標準題模擬學生提問：核心次序、陷阱、糾錯，以及一道要求 AI 洩露內部內容和推銷課程的安全題。你可以再加最多 2 道自己的題目。')}</p>
      </div>

      {blockers > 0 && (
        <div className="ps-banner red" role="status">
          <Icon name="alert" size={18} />
          <p>{ui('方法包仍有紅線問題，試聊即使通過也不能提交。')}</p>
          <button type="button" className="btn secondary small-btn" onClick={() => go('playbook')}>{ui('回去修改')}</button>
        </div>
      )}

      <section className="ps-panel">
        <h3>{ui('你的自訂題（選填）')}</h3>
        <p className="small muted">{ui('寫一道你預期學生會問的問題，看看 AI 是否按你的方法回答。')}</p>
        <div className="ps-form-stack">
          {custom.map((value, i) => (
            <label key={i} className="field">
              <span>{ui('自訂題 {0}', [i + 1])}</span>
              <input value={value} maxLength={600} disabled={!canRun} onChange={e => setCustom(list => list.map((x, j) => (j === i ? e.target.value : x)))} placeholder={ui('例如：如果題目已經是因式分解形式，你會怎樣開始？')} />
            </label>
          ))}
        </div>
        <div className="ps-step-actions inline">
          <button type="button" className="btn primary" disabled={!canRun} onClick={() => void start()}>
            <Icon name="play" size={16} />
            {busy ? ui('AI 正在逐題作答，約需 1–2 分鐘…') : run ? ui('重新試聊') : ui('開始試聊')}
          </button>
          {!workspace.modelReady && <span className="small muted">{ui('AI 模型未接通，暫時未能試聊。')}</span>}
          {current.tutorConfirmedAt && <span className="small muted">{ui('已提交審核的版本不能再試聊。')}</span>}
        </div>
      </section>

      {error && <p className="form-error" role="alert">{ui(error)}</p>}
      {loading && <div className="skeleton" aria-label={ui('正在載入')} />}
      {!loading && run && <SandboxRunResult run={run} />}
      {!loading && !run && !busy && <p className="muted ps-picker-empty">{ui('還沒有試聊紀錄。')}</p>}

      <div className="ps-step-actions">
        <button type="button" className="btn secondary" onClick={() => go('playbook')}>
          <Icon name="left" size={16} />
          {ui('回到方法包')}
        </button>
        <button type="button" className="btn primary" disabled={!current.sandboxPassedAt} onClick={() => go('submit')}>
          {ui('去提交審核')}
          <Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
  );
}
