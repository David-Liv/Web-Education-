import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, realMode } from '../api/client';
import { useApp } from '../state';
import { Badge, Icon, Modal, PlanGate, Progress, Skeleton } from '../components';
import { ui, interfaceLocale, useInterfaceLanguage } from '../i18n';
import { hasPlanFeature } from '../billing-types';
import type { RealtimeProgressView, WeakSpotReport } from '../billing-types';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(interfaceLocale(), { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function WeakSpotReportModal({
  onClose,
  highlightSkillId,
}: {
  onClose: () => void;
  highlightSkillId?: string;
}) {
  useInterfaceLanguage();
  const { db, billing } = useApp();
  const canAccess = !realMode || hasPlanFeature(billing?.account.plan, 'weak-spot-report', db.pilot?.identity.role);
  const [report, setReport] = useState<WeakSpotReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(canAccess && realMode);

  useEffect(() => {
    if (!canAccess || !realMode) return;
    let live = true;
    setLoading(true);
    setError('');
    void api<WeakSpotReport>('/learning/weak-spot-report')
      .then(data => { if (live) setReport(data); })
      .catch(e => { if (live) setError((e as Error).message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [canAccess]);

  return (
    <Modal title={ui('弱項診斷報告')} subtitle={ui('依真實獨立作答與錯題記錄整理補弱優先次序。')} onClose={onClose} wide>
      {!canAccess ? (
        <PlanGate
          requiredPlan="Pro"
          title="弱項診斷報告為 Pro 專屬功能"
          description="升級至 Pro 即可解鎖個人弱項診斷報告，並在系統偵測到重複失誤或高提示依賴時收到主動提醒與一鍵補弱建議。"
        />
      ) : !realMode ? (
        <p className="muted">{ui('請在邀請制真實版本登入後查看個人弱項診斷報告。')}</p>
      ) : loading ? (
        <Skeleton rows={4} />
      ) : error ? (
        <p className="form-error" role="alert">{ui(error)}</p>
      ) : report ? (
        <div className="weak-report">
          <p>{ui(report.summary)}</p>
          <div className="report-numbers">
            <div><strong>{report.totalAttempts}</strong><span>{ui('累計有效作答')}</span></div>
            <div><strong>{report.independentRate === null ? '—' : `${report.independentRate}%`}</strong><span>{ui('無提示獨立比例')}</span></div>
            <div><strong>{report.unresolvedMistakes}</strong><span>{ui('待訂正錯題')}</span></div>
          </div>

          {report.errorCauses.length > 0 && (
            <section className="weak-causes">
              <h3>{ui('高頻錯因分佈')}</h3>
              <div className="chip-row">
                {report.errorCauses.map(c => (
                  <Badge key={c.cause} tone="amber">{ui(c.cause)} · {c.count}</Badge>
                ))}
              </div>
            </section>
          )}

          <section className="weak-list">
            <h3>{ui('優先補強知識點')}</h3>
            {report.weakSpots.map(item => (
              <article
                className={`weak-item ${highlightSkillId === item.skillId ? 'is-highlighted' : ''}`}
                key={item.skillId}
              >
                <div className="row-between">
                  <strong>{ui(item.skillName)}</strong>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {highlightSkillId === item.skillId && <Badge tone="amber">{ui('剛偵測到的弱項')}</Badge>}
                    {item.paused && <Badge tone="red">{ui('需先換方法')}</Badge>}
                    <Badge tone={item.score !== null && item.score >= 80 ? 'green' : 'amber'}>
                      {item.score === null ? ui('證據不足') : `${item.score}%`}
                    </Badge>
                  </div>
                </div>
                {item.score !== null && <Progress value={item.score} />}
                <p className="small muted">
                  {ui('{0} 次作答 · {1} 次獨立 · {2} 次提示', [item.attempts, item.independentAttempts, item.hintedAttempts])}
                  {item.topCause ? ` · ${ui('常見錯因：{0}', [ui(item.topCause)])}` : ''}
                </p>
                <div className="row-between" style={{ marginTop: 8 }}>
                  <span className="small">{ui(item.recommendation)}</span>
                  <Link className="btn secondary small-btn" to={item.actionUrl} onClick={onClose}>
                    {ui('立即針對練習')}
                    <Icon name="arrow" size={13} />
                  </Link>
                </div>
              </article>
            ))}
          </section>

          <div className="info-callout">
            <Icon name="bulb" />
            <p>{ui(report.caveat)}</p>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export function RealtimeProgressPanel() {
  useInterfaceLanguage();
  const { db, billing } = useApp();
  const canRealtime = hasPlanFeature(billing?.account.plan, 'realtime-progress', db.pilot?.identity.role);
  const [data, setData] = useState<RealtimeProgressView | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    if (!realMode || !canRealtime) return;
    setSyncing(true);
    try {
      setData(await api<RealtimeProgressView>('/learning/realtime-progress'));
    } catch {
      // Quiet fallback; dashboard core remains usable.
    } finally {
      setSyncing(false);
    }
  }, [canRealtime]);

  useEffect(() => {
    if (!realMode || !canRealtime) return;
    void load();
    const onFocus = () => { if (!document.hidden) void load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [canRealtime, load, db.events.length, db.tasks.length]);

  if (!realMode) return null;

  if (!canRealtime) {
    return (
      <PlanGate
        compact
        requiredPlan="Pro"
        title="即時學習進度更新"
        description="升級至 Pro 後，跨分頁與每次提交將自動同步各技能即時變動 Δ 與近 24 小時學習脈動。"
      />
    );
  }

  return (
    <section className="card realtime-panel" aria-label={ui('即時學習進度')}>
      <div className="row-between">
        <div className="realtime-title">
          <span className="realtime-dot" aria-hidden="true" />
          <h2>{ui('即時學習進度')}</h2>
          <Badge tone="green">Pro</Badge>
        </div>
        <div className="realtime-meta">
          <span className="small muted">
            {data ? ui('已同步 {0}', [formatTime(data.syncedAt)]) : ui('正在同步…')}
          </span>
          <button type="button" className="icon-btn" disabled={syncing} aria-label={ui('立即同步進度')} onClick={() => void load()}>
            <Icon name="refresh" size={15} />
          </button>
        </div>
      </div>

      {data && (
        <>
          <div className="realtime-kpis">
            <div><small>{ui('今日已記錄')}</small><strong>{ui('{0} 分鐘', [data.todayMinutes])}</strong></div>
            <div><small>{ui('今日任務')}</small><strong>{data.todayTasksDone} / {data.todayTasksTotal}</strong></div>
            <div><small>{ui('近 24 小時作答')}</small><strong>{ui('{0} 題', [data.recentAttempts24h])}</strong></div>
          </div>
          {data.activeSkills.length > 0 && (
            <div className="realtime-skills">
              {data.activeSkills.slice(0, 4).map(s => (
                <div className="realtime-skill-chip" key={s.skillId}>
                  <strong>{ui(s.skillName)}</strong>
                  <div className="row-between">
                    <span className="small muted">{s.score === null ? ui('待評估') : `${s.score}%`}</span>
                    {s.delta !== null && (
                      <span className={`realtime-delta ${s.delta >= 0 ? 'up' : 'down'}`}>
                        {s.delta >= 0 ? `+${s.delta}%` : `${s.delta}%`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
