import { useEffect, useMemo, useState } from 'react';
import { ui, useInterfaceLanguage } from '../i18n';
import { api } from '../api/client';
import { Icon } from '../components';
import { exportPackToText, percent } from '../partner-studio';
import type { ExportAuditView, ExportPackView, PlaybookAnalyticsView } from '../partner-studio';
import { downloadTextFile } from '../platform/partner-media';
import { topicOf, usePartner } from './partner-context';
import { shortDate, topicLabel } from './PartnerHome';

export function PartnerInsights() {
  const language = useInterfaceLanguage();
  const { workspace, notify } = usePartner();
  const released = useMemo(() => {
    const ids = new Map<string, string>();
    for (const pb of workspace.playbooks) if (pb.status !== 'draft' || pb.publishedAt) ids.set(pb.id, pb.topicId);
    return [...ids.entries()].map(([id, topicId]) => ({ id, topicId }));
  }, [workspace.playbooks]);
  const [rows, setRows] = useState<PlaybookAnalyticsView[]>([]);
  const [loading, setLoading] = useState(true);
  const [audits, setAudits] = useState<ExportAuditView[]>([]);
  const [scope, setScope] = useState('');
  const [pack, setPack] = useState<ExportPackView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all(released.map(r => api<PlaybookAnalyticsView>(`/partner/playbooks/${encodeURIComponent(r.id)}/analytics`)))
      .then(list => { if (alive) setRows(list); })
      .catch(e => { if (alive) setError((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [released]);

  useEffect(() => {
    api<{ audits: ExportAuditView[] }>('/partner/export-audit').then(res => setAudits(res.audits)).catch(() => undefined);
  }, [pack]);

  const exportPack = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<ExportPackView>('/partner/export-review-pack', 'POST', { playbookId: scope || undefined });
      setPack(result);
      notify('已產生去名化樣本，下載前請先閱讀私隱說明');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const nameFor = (topicId: string) => topicLabel(topicOf(workspace, topicId), language, topicId);

  return (
    <div className="ps-insights page-enter">
      <header className="ps-heading">
        <h1>{ui('數據與回饋')}</h1>
        <p>{ui('看看學生怎樣使用你的方法。所有數字只來自已上架的版本；對話樣本經去名化處理，只包括同意分享的學生。')}</p>
      </header>

      <section className="ps-panel" aria-labelledby="ps-usage-title">
        <div className="ps-panel-head">
          <h2 id="ps-usage-title">{ui('各單元使用情況')}</h2>
        </div>
        {loading && released.length > 0 && <div className="skeleton" aria-label={ui('正在載入')} />}
        {!loading && released.length === 0 && (
          <div className="ps-empty">
            <Icon name="chart" size={22} />
            <div>
              <h3>{ui('方法上架後，這裡會顯示學生使用數據')}</h3>
              <p className="muted">{ui('包括選用次數、在單元內的佔比、多輪對話比例和學生覺得有幫助的比例。')}</p>
            </div>
          </div>
        )}
        {!loading && rows.length > 0 && (
          <div className="ps-table-wrap">
            <table className="ps-table">
              <thead>
                <tr>
                  <th scope="col">{ui('單元')}</th>
                  <th scope="col">{ui('開始對話')}</th>
                  <th scope="col">{ui('單元內佔比')}</th>
                  <th scope="col">{ui('多輪對話')}</th>
                  <th scope="col">{ui('覺得有幫助')}</th>
                  <th scope="col">{ui('資料卡點擊')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.playbookId}>
                    <th scope="row">{nameFor(r.topicId)}</th>
                    <td>{r.chatStarts}</td>
                    <td>{percent(r.adoptionShare)}<small>{ui('共 {0} 次', [r.topicTotalChatStarts])}</small></td>
                    <td>{percent(r.multiTurnRate)}<small>{ui('{0} 段', [r.multiTurnChats])}</small></td>
                    <td>{percent(r.helpfulRate)}<small>{ui('{0} 讚 · {1} 未有幫助', [r.helpfulCount, r.notHelpfulCount])}</small></td>
                    <td>{r.linkClicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ps-panel" aria-labelledby="ps-export-title">
        <div className="ps-panel-head">
          <h2 id="ps-export-title">{ui('去名化對話樣本')}</h2>
        </div>
        <p className="muted small">{ui('用來了解學生在哪裡卡住，以便改進下一版方法。每次下載都會記錄在案。')}</p>
        <ul className="ps-tips">
          <li><Icon name="shield" size={14} />{ui('只包括同意協議、且沒有關閉分享的學生對話')}</li>
          <li><Icon name="shield" size={14} />{ui('已移除姓名、帳戶、電郵、電話、學校、圖片和附件')}</li>
          <li><Icon name="shield" size={14} />{ui('每段對話用隨機編號並打亂次序，不能追蹤同一位學生')}</li>
          <li><Icon name="shield" size={14} />{ui('只可用於改進教學方法，不可轉發或嘗試辨認學生')}</li>
        </ul>
        <div className="ps-export-row">
          <label className="field">
            <span>{ui('範圍')}</span>
            <select value={scope} onChange={e => setScope(e.target.value)}>
              <option value="">{ui('全部單元')}</option>
              {released.map(r => <option key={r.id} value={r.id}>{nameFor(r.topicId)}</option>)}
            </select>
          </label>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void exportPack()}>
            <Icon name="file" size={16} />
            {busy ? ui('正在整理…') : ui('產生樣本')}
          </button>
        </div>
        {error && <p className="form-error" role="alert">{ui(error)}</p>}
        {pack && (
          <div className="ps-export-result">
            <p>{ui('包括 {0} 段對話；另有 {1} 段因學生關閉分享而排除。', [pack.includedChatCount, pack.excludedOptOutCount])}</p>
            <button type="button" className="btn secondary" disabled={!pack.includedChatCount} onClick={() => downloadTextFile(`hokse-review-${pack.exportId.slice(0, 8)}.txt`, exportPackToText(pack))}>
              <Icon name="arrowDown" size={16} />
              {ui('下載文字檔')}
            </button>
          </div>
        )}
        {audits.length > 0 && (
          <details className="ps-audit">
            <summary>{ui('下載紀錄（{0}）', [audits.length])}</summary>
            <ul>
              {audits.map(a => (
                <li key={a.id}>
                  <span>{shortDate(a.createdAt)}</span>
                  <span>{a.playbookId ? nameFor(released.find(r => r.id === a.playbookId)?.topicId ?? '') || a.playbookId : ui('全部單元')}</span>
                  <span>{ui('{0} 段對話', [a.chatCount])}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
