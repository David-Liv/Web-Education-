import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { LanguageSwitch, ui, useInterfaceLanguage } from '../i18n';
import { api } from '../api/client';
import { Icon } from '../components';
import type { PartnerWorkspace } from '../partner-studio';
import { PartnerContext } from './partner-context';
import { PartnerHome } from './PartnerHome';
import { UnitPipeline } from './UnitPipeline';
import { PartnerInsights } from './PartnerInsights';
import './partner.css';

interface Notice { id: number; message: string; tone: 'success' | 'error' }

export function PartnerApp({ name, demo = false, onLogout }: { name: string; demo?: boolean; onLogout: () => void }) {
  useInterfaceLanguage();
  const [workspace, setWorkspace] = useState<PartnerWorkspace>();
  const [error, setError] = useState('');
  const [notices, setNotices] = useState<Notice[]>([]);
  const timers = useRef<number[]>([]);

  const reload = useCallback(async () => {
    setError('');
    try {
      setWorkspace(await api<PartnerWorkspace>('/partner/workspace'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setNotices(list => [...list.slice(-2), { id, message, tone }]);
    timers.current.push(window.setTimeout(() => setNotices(list => list.filter(n => n.id !== id)), tone === 'error' ? 7000 : 4200));
  }, []);

  useEffect(() => {
    void reload();
    const pending = timers.current;
    return () => pending.forEach(t => clearTimeout(t));
  }, [reload]);

  const logout = async () => {
    if (!demo) await api('/auth/logout', 'POST').catch(() => undefined);
    onLogout();
  };

  return (
    <div className="ps-shell">
      <header className="ps-topbar">
        <div className="ps-brand">
          <img src="/favicon.svg" width="28" height="28" alt="" />
          <div>
            <strong>{ui('學序')}</strong>
            <span>{ui('合作導師工作室')}</span>
          </div>
        </div>
        <nav className="ps-nav" aria-label={ui('合作導師導覽')}>
          <NavLink to="/partner" end>{ui('我的單元')}</NavLink>
          <NavLink to="/partner/insights">{ui('數據與回饋')}</NavLink>
        </nav>
        <div className="ps-account">
          {demo && <span className="badge amber">{ui('演示模式')}</span>}
          <span className="ps-account-name">{name}</span>
          <LanguageSwitch />
          <button type="button" className="btn secondary small-btn" onClick={() => void logout()}>
            {demo ? ui('返回學生界面') : ui('登出')}
          </button>
        </div>
      </header>
      <main className="ps-main" id="partner-main">
        {error && !workspace && (
          <section className="ps-panel ps-center" role="alert">
            <Icon name="alert" size={22} />
            <h1>{ui('暫時未能載入合作導師工作室')}</h1>
            <p className="muted">{ui(error)}</p>
            <button type="button" className="btn primary" onClick={() => void reload()}>
              <Icon name="refresh" size={16} />
              {ui('重新載入')}
            </button>
          </section>
        )}
        {!workspace && !error && (
          <div className="ps-loading" aria-busy="true" aria-label={ui('正在載入')}>
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}
        {workspace && (
          <PartnerContext.Provider value={{ workspace, reload, notify, demo }}>
            <Routes>
              <Route path="/partner" element={<PartnerHome />} />
              <Route path="/partner/units/:topicId" element={<UnitPipeline />} />
              <Route path="/partner/insights" element={<PartnerInsights />} />
              <Route path="*" element={<Navigate to="/partner" replace />} />
            </Routes>
          </PartnerContext.Provider>
        )}
      </main>
      <div className="ps-toasts" aria-live="polite">
        {notices.map(n => (
          <div key={n.id} className={`ps-toast ${n.tone}`}>
            <Icon name={n.tone === 'error' ? 'alert' : 'checkCircle'} size={16} />
            <span>{ui(n.message)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
