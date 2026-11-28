import { version } from '../../package.json';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import chineseGuide from '../../docs/user-guide.md?raw';
import englishGuide from '../../docs/user-guide.en.md?raw';
import { realMode } from '../api/client';
import { Badge, Icon, Modal, PageHeading } from '../components';
import { GuideStepCarousel, renderGuideBlocks } from '../GuideCarousel';
import {
  buildFilteredGuideMarkdown,
  GUIDE_GROUP_LABELS,
  GUIDE_GROUP_ORDER,
  isGuideSectionUnlocked,
  parseGuideMarkdown,
  resolveEffectiveGuidePlan,
} from '../guide-parser';
import type { GuidePreviewPlan, GuideSection } from '../guide-parser';
import { useLanguageSettings } from '../i18n';
import { useApp } from '../state';

export function UserGuidePage() {
  const [params, setParams] = useSearchParams();
  const { language, setLanguage } = useLanguageSettings();
  const { db, billing } = useApp();
  const requestedLanguage = params.get('lang');
  useEffect(() => {
    if (requestedLanguage === 'en') setLanguage('en');
    else if (requestedLanguage === 'zh' || requestedLanguage === 'zh-HK') setLanguage('zh-HK');
  }, [requestedLanguage]);
  const english = language === 'en';
  const guide = english ? englishGuide : chineseGuide;
  return (
    <GuideContent
      guide={guide}
      english={english}
      plan={billing?.account.plan}
      role={db.pilot?.identity.role}
      onLanguageChange={value => {
        setLanguage(value ? 'en' : 'zh-HK');
        setParams({ lang: value ? 'en' : 'zh-HK' });
      }}
    />
  );
}

export function GuideContent({
  guide,
  english,
  admin = false,
  plan,
  role,
  onLanguageChange,
}: {
  guide: string;
  english: boolean;
  admin?: boolean;
  plan?: 'Free' | 'Plus' | 'Pro';
  role?: string;
  onLanguageChange: (english: boolean) => void;
}) {
  const [previewPlan, setPreviewPlan] = useState<GuidePreviewPlan>('actual');
  const [lockedModal, setLockedModal] = useState<GuideSection | null>(null);
  const [zoomImage, setZoomImage] = useState<{ alt: string; src: string } | null>(null);
  const [download, setDownload] = useState('');

  const parsed = useMemo(() => parseGuideMarkdown(guide), [guide]);
  const isStaff = !admin && realMode && (role === 'developer' || role === 'reviewer');
  const access = useMemo(
    () => (admin
      ? { effectivePlan: 'Pro' as const, bypassAll: true, isPreview: false }
      : resolveEffectiveGuidePlan({ realMode, plan, role, previewPlan })),
    [admin, plan, role, previewPlan]
  );

  const unlockedIds = useMemo(
    () => new Set(parsed.sections.filter(s => isGuideSectionUnlocked(s, access)).map(s => s.id)),
    [parsed, access]
  );

  const unlockedSections = useMemo(
    () => parsed.sections.filter(s => unlockedIds.has(s.id)),
    [parsed, unlockedIds]
  );

  const downloadSource = useMemo(
    () => (admin ? guide : buildFilteredGuideMarkdown(parsed, unlockedIds)),
    [admin, guide, parsed, unlockedIds]
  );

  useEffect(() => {
    const url = URL.createObjectURL(new Blob([downloadSource], { type: 'text/markdown;charset=utf-8' }));
    setDownload(url);
    return () => URL.revokeObjectURL(url);
  }, [downloadSource]);

  const lockedCount = parsed.sections.length - unlockedSections.length;
  const groupedToc = !admin && parsed.hasGroups;

  const renderTocItem = (section: GuideSection) => {
    const unlocked = unlockedIds.has(section.id);
    if (unlocked) {
      return (
        <a key={section.id} href={`#${section.id}`} className="guide-toc-link">
          <span>{section.title}</span>
          {!admin && section.meta.plan !== 'Free' && (
            <span className={`guide-toc-tier tier-${section.meta.plan.toLowerCase()}`}>{section.meta.plan}</span>
          )}
        </a>
      );
    }
    return (
      <button
        key={section.id}
        type="button"
        className="guide-toc-locked"
        onClick={() => setLockedModal(section)}
        aria-label={
          english
            ? `${section.title} — locked, requires ${section.meta.plan}`
            : `${section.title} — 尚未解鎖，需要 ${section.meta.plan}`
        }
      >
        <span>{section.title}</span>
        <span className="guide-toc-lock-meta">
          <span className={`guide-toc-tier tier-${section.meta.plan.toLowerCase()}`}>{section.meta.plan}</span>
          <span className="guide-lock-emoji" aria-hidden="true">🔐</span>
        </span>
      </button>
    );
  };

  return (
    <div className="page-enter user-guide">
      <PageHeading
        eyebrow="A LITTLE GUIDANCE, YOUR OWN PACE"
        title={admin ? (english ? 'Administrator Guide' : '管理員使用指南') : (english ? 'HOKSE User Guide' : '學序使用指南')}
        description={
          admin
            ? (english ? 'Manage accounts, content, AI settings and day-to-day operations.' : '管理帳戶、內容、AI 設定與日常營運。')
            : (english ? 'Visual step-by-step walkthroughs tailored to your unlocked features.' : '看圖按步驟上手，只顯示你目前帳戶已解鎖的功能說明。')
        }
        action={
          <>
            <div className="segmented" aria-label="Guide language">
              <button
                type="button"
                className={!english ? 'active' : ''}
                aria-pressed={!english}
                onClick={() => { if (english) { setDownload(''); onLanguageChange(false); } }}
              >
                中文
              </button>
              <button
                type="button"
                className={english ? 'active' : ''}
                aria-pressed={english}
                onClick={() => { if (!english) { setDownload(''); onLanguageChange(true); } }}
              >
                English
              </button>
            </div>
            <a
              className="btn secondary"
              href={admin ? `/api/v1/admin/guide?lang=${english ? 'en' : 'zh-HK'}&download=1` : download || undefined}
              download={
                admin
                  ? (english ? 'HOKSE-Admin-Guide-English.md' : 'HOKSE-管理員指南-中文.md')
                  : (english ? 'HOKSE-User-Guide-English.md' : 'HOKSE-使用指南-中文.md')
              }
            >
              <Icon name="arrowDown" size={16} />
              {english ? 'Download guide' : '下載指南'}
            </a>
          </>
        }
      />

      {admin ? (
        <div className="guide-intro card">
          {renderGuideBlocks(parsed.intro)}
          <Badge tone="green">{english ? 'Administrator access' : '管理員專用'}</Badge>
        </div>
      ) : (
        <div className="guide-status-bar card">
          <div className="guide-status-main">
            <Badge tone="green">
              {!realMode
                ? (english ? 'Demo · All unlocked' : '示範版 · 全部已解鎖')
                : access.bypassAll
                  ? (english ? 'All chapters unlocked' : '全部章節已解鎖')
                  : `${access.effectivePlan}`}
            </Badge>
            <span className="guide-status-summary">
              {english
                ? `Showing ${unlockedSections.length} of ${parsed.sections.length} chapters${lockedCount > 0 ? ` · ${lockedCount} locked` : ''}`
                : `已顯示 ${unlockedSections.length} / ${parsed.sections.length} 個已解鎖章節${lockedCount > 0 ? ` · 另有 ${lockedCount} 章未開放` : ''}`}
            </span>
            <Badge>{`v${version}`}</Badge>
          </div>
          <div className="guide-status-actions">
            {isStaff && (
              <div className="segmented guide-preview-switch" aria-label={english ? 'Preview plan view' : '預覽套餐視角'}>
                {(['actual', 'Free', 'Plus', 'Pro'] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    className={previewPlan === option ? 'active' : ''}
                    aria-pressed={previewPlan === option}
                    onClick={() => setPreviewPlan(option)}
                  >
                    {option === 'actual' ? (english ? 'All' : '全部') : option}
                  </button>
                ))}
              </div>
            )}
            {realMode && lockedCount > 0 && (
              <Link className="btn primary" to="/billing">
                <Icon name="sparkles" size={15} />
                {english ? 'Upgrade plan' : '升級解鎖全部'}
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="guide-layout">
        <nav className="card guide-contents" aria-label={english ? 'Guide contents' : '使用指南目錄'}>
          <div className="guide-toc-title">{english ? 'Find what you need' : '快速找到需要的說明'}</div>
          {groupedToc ? (
            GUIDE_GROUP_ORDER.map(groupId => {
              const items = parsed.sections.filter(s => s.meta.group === groupId);
              if (!items.length) return null;
              return (
                <div key={groupId} className="guide-toc-group">
                  <div className="guide-toc-group-label">
                    {english ? GUIDE_GROUP_LABELS[groupId].en : GUIDE_GROUP_LABELS[groupId].zh}
                  </div>
                  <div className="guide-toc-list">
                    {items.map(renderTocItem)}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="guide-toc-list">{parsed.sections.map(renderTocItem)}</div>
          )}
        </nav>

        <article className="guide-article">
          {unlockedSections.map(section => (
            <section
              className={`card guide-section ${section.id === 'changelog' ? 'is-changelog' : ''}`}
              id={section.id}
              key={section.id}
            >
              <div className="guide-section-head">
                <h2>{section.title}</h2>
                {!admin && section.meta.plan !== 'Free' && (
                  <Badge tone="green">{section.meta.plan}</Badge>
                )}
              </div>
              {section.lead && (
                <div className="guide-section-lead">
                  {renderGuideBlocks(section.lead, (alt, src) => setZoomImage({ alt, src }))}
                </div>
              )}
              {section.slides.length > 0 && (
                <GuideStepCarousel
                  slides={section.slides}
                  english={english}
                  sectionTitle={section.title}
                />
              )}
              {section.after && (
                <div className="guide-section-after">
                  {renderGuideBlocks(section.after, (alt, src) => setZoomImage({ alt, src }))}
                </div>
              )}
            </section>
          ))}
        </article>
      </div>

      {lockedModal && (
        <Modal
          title={english ? 'Feature not yet unlocked' : '此功能尚未開放'}
          onClose={() => setLockedModal(null)}
        >
          <div className="guide-locked-dialog">
            <div className="guide-locked-hero">
              <span className="guide-locked-emoji" aria-hidden="true">🔐</span>
              <div>
                <div className="guide-locked-meta">
                  <Badge tone="green">{lockedModal.meta.plan}</Badge>
                  <strong>{lockedModal.title}</strong>
                </div>
                <p>
                  {english
                    ? `This feature is not yet unlocked on your current plan. Upgrade to ${lockedModal.meta.plan} to unlock it and view the full step-by-step guide.`
                    : `該功能尚未開放，請升級至 ${lockedModal.meta.plan} 套餐即可立即解鎖功能與完整圖解說明。`}
                </p>
              </div>
            </div>
            {lockedModal.meta.teaser && (
              <p className="guide-locked-teaser">{lockedModal.meta.teaser}</p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setLockedModal(null)}>
                {english ? 'Close' : '先看已解鎖說明'}
              </button>
              <Link className="btn primary" to="/billing" onClick={() => setLockedModal(null)}>
                {english ? `Upgrade to ${lockedModal.meta.plan}` : `前往升級至 ${lockedModal.meta.plan}`}
                <Icon name="arrow" size={14} />
              </Link>
            </div>
          </div>
        </Modal>
      )}

      {zoomImage && (
        <Modal title={zoomImage.alt || (english ? 'Preview' : '圖片預覽')} onClose={() => setZoomImage(null)} wide>
          <div className="guide-lightbox">
            <img src={zoomImage.src} alt={zoomImage.alt} />
          </div>
        </Modal>
      )}
    </div>
  );
}
