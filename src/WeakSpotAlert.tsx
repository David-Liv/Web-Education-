import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, realMode } from './api/client';
import { useApp } from './state';
import { useFocus } from './focus';
import { Badge, Icon } from './components';
import { ui, useInterfaceLanguage } from './i18n';
import { persistentStorage } from './platform/storage';
import { emitMascotReaction, getMascotSnapshot } from './mascot-events';
import { hasPlanFeature } from './billing-types';
import type { WeakSpotAlert } from './billing-types';
import { WeakSpotReportModal } from './pages/ProgressInsights';

const ALERT_EVENT = 'hokse:weak-spot-alert';
const OPEN_REPORT_EVENT = 'hokse:open-weak-spot-report';
const STORAGE_KEY = 'hokse.weakspot.alert.v1';
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

interface StoredAlertState {
  dismissed: Record<string, number>;
  lastShownAt: number;
}

function readStoredState(): StoredAlertState {
  try {
    const raw = persistentStorage.get(STORAGE_KEY);
    if (!raw) return { dismissed: {}, lastShownAt: 0 };
    const parsed = JSON.parse(raw) as Partial<StoredAlertState>;
    return {
      dismissed: parsed.dismissed && typeof parsed.dismissed === 'object' ? parsed.dismissed : {},
      lastShownAt: typeof parsed.lastShownAt === 'number' ? parsed.lastShownAt : 0,
    };
  } catch {
    return { dismissed: {}, lastShownAt: 0 };
  }
}

function recordAlertShown(signalId: string, now = Date.now()) {
  const prev = readStoredState();
  const entries = Object.entries({ ...prev.dismissed, [signalId]: now })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  persistentStorage.set(
    STORAGE_KEY,
    JSON.stringify({ dismissed: Object.fromEntries(entries), lastShownAt: now }),
  );
}

export function dispatchWeakSpotAlert(alert: WeakSpotAlert) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<WeakSpotAlert>(ALERT_EVENT, { detail: alert }));
}

export function WeakSpotAlertHost() {
  useInterfaceLanguage();
  const { db, billing } = useApp();
  const focus = useFocus();
  const location = useLocation();
  const canWeakReport =
    realMode && hasPlanFeature(billing?.account.plan, 'weak-spot-report', db.pilot?.identity.role);
  const [fallbackAlert, setFallbackAlert] = useState<WeakSpotAlert | null>(null);
  const [reportModal, setReportModal] = useState<{ open: boolean; highlightSkillId?: string }>({
    open: false,
  });

  const presentAlert = useCallback(
    (alert: WeakSpotAlert | null | undefined, freshFromSubmit: boolean) => {
      if (!alert || !canWeakReport || focus.isLocked || location.pathname.startsWith('/quizzes/')) {
        return;
      }
      const now = Date.now();
      const stored = readStoredState();
      if (stored.dismissed[alert.signalId]) return;
      if (!freshFromSubmit && now - stored.lastShownAt < COOLDOWN_MS) return;

      recordAlertShown(alert.signalId, now);
      const { prefs } = getMascotSnapshot();
      if (!prefs.hidden) {
        emitMascotReaction({
          mood: 'sus',
          messageKey: '偵測到薄弱環節（{0}），要看看弱項報告嗎？',
          messageArgs: [ui(alert.skillName)],
          actionEvent: OPEN_REPORT_EVENT,
          actionDetail: { skillId: alert.skillId },
          actionLabelKey: '查看報告',
          durationMs: 14000,
          priority: 4,
        });
      } else {
        setFallbackAlert(alert);
      }
    },
    [canWeakReport, focus.isLocked, location.pathname],
  );

  useEffect(() => {
    const onAlert = (event: Event) => {
      const detail = (event as CustomEvent<WeakSpotAlert>).detail;
      presentAlert(detail, true);
    };
    const onOpenReport = (event: Event) => {
      const detail = (event as CustomEvent<{ skillId?: string } | undefined>).detail;
      setFallbackAlert(null);
      setReportModal({ open: true, highlightSkillId: detail?.skillId });
    };
    window.addEventListener(ALERT_EVENT, onAlert);
    window.addEventListener(OPEN_REPORT_EVENT, onOpenReport);
    return () => {
      window.removeEventListener(ALERT_EVENT, onAlert);
      window.removeEventListener(OPEN_REPORT_EVENT, onOpenReport);
    };
  }, [presentAlert]);

  useEffect(() => {
    if (!canWeakReport || focus.isLocked) return;
    if (location.pathname !== '/overview' && location.pathname !== '/studio') return;
    let active = true;
    void api<{ alert: WeakSpotAlert | null }>('/learning/weak-spot-signal')
      .then(res => {
        if (active && res.alert) presentAlert(res.alert, false);
      })
      .catch(() => {
        // Quiet fallback; never disrupt study flow.
      });
    return () => {
      active = false;
    };
  }, [canWeakReport, focus.isLocked, location.pathname, presentAlert]);

  return (
    <>
      {fallbackAlert && !focus.isLocked && (
        <aside
          className="weak-nudge-card"
          role="status"
          aria-live="polite"
          data-testid="weak-spot-nudge"
        >
          <div className="weak-nudge-head">
            <span className="weak-nudge-icon" aria-hidden="true">
              <Icon name="target" size={16} />
            </span>
            <div className="weak-nudge-copy">
              <div className="row-between">
                <strong>{ui('偵測到薄弱環節')}</strong>
                <Badge tone="green">Pro</Badge>
              </div>
              <p>
                {ui('你在「{0}」最近遇到重複困難，要查看弱項診斷報告嗎？', [
                  ui(fallbackAlert.skillName),
                ])}
              </p>
            </div>
          </div>
          <div className="weak-nudge-actions">
            <button
              type="button"
              className="btn primary small-btn"
              onClick={() => {
                const skillId = fallbackAlert.skillId;
                setFallbackAlert(null);
                setReportModal({ open: true, highlightSkillId: skillId });
              }}
            >
              {ui('查看報告')}
            </button>
            <button
              type="button"
              className="btn ghost small-btn"
              onClick={() => setFallbackAlert(null)}
            >
              {ui('稍後再說')}
            </button>
          </div>
        </aside>
      )}
      {reportModal.open && (
        <WeakSpotReportModal
          highlightSkillId={reportModal.highlightSkillId}
          onClose={() => setReportModal({ open: false })}
        />
      )}
    </>
  );
}
