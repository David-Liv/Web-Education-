import { useEffect, useState } from 'react';
import { api, realMode } from './api/client';
import { Badge, Modal } from './components';
import { ui, useInterfaceLanguage } from './i18n';
import { useApp } from './state';
import { CURRENT_TERMS_VERSION } from './tutors';
import type { UserConsentView } from './tutors';

function TermsSummaryContent() {
  useInterfaceLanguage();
  return (
    <div className="terms-summary">
      <p>{ui('歡迎使用「學序 HOKSE」。登入或建立帳戶即表示你了解並同意以下核心條款（版本 {0}）：', [CURRENT_TERMS_VERSION])}</p>
      <ul>
        <li>{ui('學習紀錄私隱：你的個人成績、錯題簿、筆記、日曆及內置 AI 導師（David／Matt）對話只屬於你的私人帳戶，絕不向外部補習導師公開。')}</li>
        <li>{ui('合作導師方法透明聲明：平台日後上架的「合作導師教學方法」由 AI 按該導師授權的方法包輔導，並非真人導師即時回覆，對話及課件內嚴禁廣告推銷或保分承諾。')}</li>
        <li>{ui('去名化教學優化授權（可隨時關閉）：僅當你主動選用「合作導師」對話時，平台可將純文字對話自動去名化（剔除姓名、電郵、電話、疑似校名及全部圖片附件，並配發單段獨立隨機匿名號），供合作導師改進教學方法。你可隨時在「個人設定」一鍵關閉，不影響任何功能使用。')}</li>
        <li>{ui('下架與證據保障：若某合作導師方法日後下架，你既有對話仍可只讀回顧，跨導師共享的技能作答證據永久歸你個人所有。')}</li>
      </ul>
    </div>
  );
}

export function TermsAgreementField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  useInterfaceLanguage();
  const [open, setOpen] = useState(false);
  return (
    <div className="terms-box">
      <label className="checkbox-label" style={{ margin: 0 }}>
        <input type="checkbox" required checked={checked} onChange={e => onChange(e.target.checked)} />
        <span>
          {ui('我已閱讀並同意《使用者協議與私隱聲明》（含合作導師對話去名化改進條款，可於設定隨時關閉）')}{' '}
          <button type="button" className="text-link terms-inline-btn" onClick={() => setOpen(true)}>
            {ui('查看條款詳情')}
          </button>
        </span>
      </label>
      {open && (
        <Modal
          title={ui('使用者協議與私隱聲明')}
          subtitle={ui('版本 {0}', [CURRENT_TERMS_VERSION])}
          onClose={() => setOpen(false)}
        >
          <TermsSummaryContent />
          <div className="modal-actions">
            <button type="button" className="btn primary" onClick={() => { onChange(true); setOpen(false); }}>
              {ui('我明白並同意')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function TermsUpdateGateModal() {
  useInterfaceLanguage();
  const { toast } = useApp();
  const [consent, setConsent] = useState<UserConsentView | null>(null);
  const [sharePartnerChats, setSharePartnerChats] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!realMode) return;
    let active = true;
    void api<UserConsentView>('/me/consent')
      .then(v => {
        if (!active) return;
        setConsent(v);
        setSharePartnerChats(v.sharePartnerChats);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  if (!realMode || !consent?.needsAcceptance) return null;

  async function accept() {
    setBusy(true);
    try {
      const updated = await api<UserConsentView>('/me/consent', 'PUT', {
        acceptTermsVersion: consent!.currentVersion,
        sharePartnerChats,
      });
      setConsent(updated);
      toast('已保存使用者協議與私隱偏好');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={ui('請確認新版使用者協議與私隱聲明')}
      subtitle={ui('版本 {0} · 保障你的學習紀錄與私隱選擇權', [consent.currentVersion])}
      onClose={() => {}}
    >
      <TermsSummaryContent />
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={sharePartnerChats}
          onChange={e => setSharePartnerChats(e.target.checked)}
        />
        <span>{ui('允許將我日後選用「合作導師」產生的純文字對話去名化後，用於改進該導師教學方法（僅限合作導師對話，可隨時於設定關閉）')}</span>
      </label>
      <div className="modal-actions">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void accept()}>
          {busy ? ui('儲存中…') : ui('同意並繼續學習')}
        </button>
      </div>
    </Modal>
  );
}

export function PrivacyConsentCard() {
  useInterfaceLanguage();
  const { toast } = useApp();
  const [consent, setConsent] = useState<UserConsentView | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!realMode) return;
    let active = true;
    void api<UserConsentView>('/me/consent')
      .then(v => { if (active) setConsent(v); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  if (!realMode) return null;

  async function toggleShare(next: boolean) {
    setBusy(true);
    try {
      const updated = await api<UserConsentView>('/me/consent', 'PUT', { sharePartnerChats: next });
      setConsent(updated);
      toast(next ? '已開啟合作導師去名化改進授權（僅影響後續新對話）' : '已關閉合作導師對話分享（後續新對話不會被匯出）');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card pilot-card">
      <div className="row-between">
        <h2>{ui('私隱授權與合作導師對話設定')}</h2>
        <Badge tone={consent?.needsAcceptance ? 'amber' : 'green'}>
          {consent?.acceptedVersion ? ui('協議 {0}', [consent.acceptedVersion]) : ui('待確認協議')}
        </Badge>
      </div>
      <p className="small muted">
        {ui('內置導師（David／Matt）、個人成績、錯題簿與討論區永遠不會分享給外部導師。以下開關只控制日後新建「合作導師」對話是否納入純文字去名化復盤。')}
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          disabled={busy || !consent}
          checked={consent?.sharePartnerChats ?? true}
          onChange={e => void toggleShare(e.target.checked)}
        />
        <span>
          <strong>{ui('允許將我的合作導師對話去名化後用於優化教學方法')}</strong>
          <br />
          <small className="muted">
            {ui('絕不包含你上傳的圖片附件與個人識別資料；每段對話使用獨立隨機匿名編號。隨時關閉，僅影響之後的新對話。')}
          </small>
        </span>
      </label>
      <div className="pilot-actions">
        <button type="button" className="btn ghost" onClick={() => setDetailsOpen(true)}>
          {ui('查看協議全文摘要')}
        </button>
      </div>
      {detailsOpen && (
        <Modal
          title={ui('使用者協議與私隱聲明')}
          subtitle={ui('版本 {0}', [consent?.currentVersion ?? CURRENT_TERMS_VERSION])}
          onClose={() => setDetailsOpen(false)}
        >
          <TermsSummaryContent />
        </Modal>
      )}
    </section>
  );
}
