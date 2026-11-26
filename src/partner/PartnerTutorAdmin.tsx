import { useState } from 'react';
import { ui, useInterfaceLanguage } from '../i18n';
import { api } from '../api/client';
import { Confirm, Icon } from '../components';
import { useApp } from '../state';
import type { PartnerTutorView } from '../partner-studio';

const emptyTutor = { name: '', headlineZh: '', headlineEn: '', bioZh: '', bioEn: '', credentials: '', externalUrl: '', externalLabelZh: '', externalLabelEn: '' };

function AccountForm({ tutor, onDone }: { tutor: PartnerTutorView; onDone: () => void }) {
  const { toast } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="ps-account-form"
      onSubmit={e => {
        e.preventDefault();
        setBusy(true);
        setError('');
        api(`/admin/partner-tutors/${encodeURIComponent(tutor.id)}/account`, 'POST', { username, password, name: tutor.name })
          .then(() => { toast('合作導師帳戶已建立；請以安全方式把登入資料交給導師'); onDone(); })
          .catch(err => setError((err as Error).message))
          .finally(() => setBusy(false));
      }}
    >
      <label className="field"><span>{ui('登入帳戶名稱')}</span><input required pattern="[a-zA-Z0-9_.\-]{2,40}" value={username} onChange={e => setUsername(e.target.value)} /></label>
      <label className="field"><span>{ui('初始密碼（至少 10 字元）')}</span><input required type="password" minLength={10} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button type="submit" className="btn primary small-btn" disabled={busy}>{ui('開設登入帳戶')}</button>
      {error && <p className="form-error small" role="alert">{ui(error)}</p>}
    </form>
  );
}

export function PartnerTutorAdmin({ tutors, developer, onChange }: { tutors: PartnerTutorView[]; developer: boolean; onChange: () => void }) {
  useInterfaceLanguage();
  const { toast } = useApp();
  const [form, setForm] = useState(emptyTutor);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accountFor, setAccountFor] = useState('');
  const [archiveId, setArchiveId] = useState('');
  const field = (key: keyof typeof emptyTutor, label: string, opts: { multiline?: boolean; required?: boolean; max?: number } = {}) => (
    <label className="field">
      <span>{ui(label)}</span>
      {opts.multiline ? (
        <textarea rows={3} required={opts.required} maxLength={opts.max} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
      ) : (
        <input required={opts.required} maxLength={opts.max} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
      )}
    </label>
  );

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/admin/partner-tutors', 'POST', { ...form, externalUrl: form.externalUrl.trim() || undefined });
      setForm(emptyTutor);
      setCreating(false);
      toast('已建立合作導師資料');
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ps-tutor-admin">
      <div className="row-between">
        <p className="small muted">{ui('合作導師資料卡會在學生選擇教學方法時顯示；外部連結只出現在資料卡，不會出現在對話內。')}</p>
        {!creating && <button type="button" className="btn secondary small-btn" onClick={() => setCreating(true)}><Icon name="plus" size={14} />{ui('新增合作導師')}</button>}
      </div>

      {creating && (
        <form className="ps-panel ps-form-grid" onSubmit={e => { e.preventDefault(); void create(); }}>
          {field('name', '導師名稱', { required: true, max: 60 })}
          {field('credentials', '資歷（選填）', { max: 200 })}
          {field('headlineZh', '一句定位（中文）', { required: true, max: 160 })}
          {field('headlineEn', '一句定位（英文）', { max: 160 })}
          {field('bioZh', '背景介紹（中文）', { multiline: true, required: true, max: 1200 })}
          {field('bioEn', '背景介紹（英文）', { multiline: true, max: 1200 })}
          {field('externalUrl', '外部專頁連結（選填，https://）', { max: 500 })}
          {field('externalLabelZh', '連結文字（中文）', { max: 40 })}
          <div className="ps-step-actions inline">
            <button type="button" className="btn ghost" onClick={() => setCreating(false)}>{ui('取消')}</button>
            <button type="submit" className="btn primary" disabled={busy}>{ui('建立資料')}</button>
          </div>
          {error && <p className="form-error small" role="alert">{ui(error)}</p>}
        </form>
      )}

      {tutors.length === 0 ? (
        <p className="small muted">{ui('還沒有合作導師。')}</p>
      ) : (
        <ul className="ps-tutor-list">
          {tutors.map(t => (
            <li key={t.id}>
              <div className="ps-tutor-row">
                <div>
                  <strong>{t.name}</strong>
                  <span className="small muted">{t.headlineZh}</span>
                </div>
                <span className={`badge ${t.status === 'active' ? 'green' : 'neutral'}`}>{t.status === 'active' ? ui('合作中') : ui('已下架')}</span>
                <span className="small">{t.accountUsername ? ui('登入帳戶：{0}', [t.accountUsername]) : ui('未開設登入帳戶')}</span>
                <div className="ps-tutor-actions">
                  {developer && t.status === 'active' && !t.accountUsername && (
                    <button type="button" className="btn secondary small-btn" onClick={() => setAccountFor(accountFor === t.id ? '' : t.id)}>{ui('開設帳戶')}</button>
                  )}
                  {t.status === 'active' && <button type="button" className="btn ghost small-btn" onClick={() => setArchiveId(t.id)}>{ui('下架導師')}</button>}
                </div>
              </div>
              {accountFor === t.id && <AccountForm tutor={t} onDone={() => { setAccountFor(''); onChange(); }} />}
            </li>
          ))}
        </ul>
      )}

      {archiveId && (
        <Confirm
          title={ui('確定下架這位合作導師？')}
          description={ui('他所有已上架的方法會一併下架，學生不能再開新對話；導師帳戶只可查看紀錄。')}
          onClose={() => setArchiveId('')}
          onConfirm={() => {
            const id = archiveId;
            setArchiveId('');
            api(`/admin/partner-tutors/${encodeURIComponent(id)}/archive`, 'POST').then(() => { toast('已下架合作導師'); onChange(); }).catch(err => toast((err as Error).message, 'error'));
          }}
        />
      )}
    </div>
  );
}
