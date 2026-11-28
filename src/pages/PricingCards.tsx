import { Icon } from '../components';
import { ui, useInterfaceLanguage } from '../i18n';
import { modelDisplayName } from '../model-catalog';
import type { BillingView, PlanId } from '../billing-types';

export const plans: PlanId[] = ['Free', 'Plus', 'Pro'];
export const hkPrice = (n: number) =>
  `HK$${n.toLocaleString('en-HK', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

interface TierFeature { kind: 'check' | 'cross' | 'bot'; label: string }

const TIER_CONTENT: Record<PlanId, { popular?: boolean; leadIn?: string; features: TierFeature[] }> = {
  Free: {
    features: [
      { kind: 'check', label: '學習總覽與基礎日曆' },
      { kind: 'check', label: '每日溫習與基礎學習資源' },
      { kind: 'cross', label: '數學 By Topic 題目索引' },
      { kind: 'cross', label: 'AI 專題測驗' },
      { kind: 'cross', label: 'AI 學習計劃' },
    ],
  },
  Plus: {
    popular: true,
    leadIn: '包含 Free 所有功能，另加：',
    features: [
      { kind: 'check', label: '溫習日曆完整功能' },
      { kind: 'check', label: '開放使用全部 AI 模型' },
      { kind: 'check', label: '數學 By Topic 題目索引' },
      { kind: 'check', label: 'AI 專題測驗' },
      { kind: 'check', label: 'AI 學習計劃' },
    ],
  },
  Pro: {
    leadIn: '包含 Plus 所有功能，另加：',
    features: [
      { kind: 'bot', label: '最高使用額度' },
      { kind: 'check', label: '討論區貼文優先曝光' },
      { kind: 'check', label: '即時學習進度更新' },
      { kind: 'check', label: 'AI 與導師設計混合測驗' },
      { kind: 'check', label: '弱項診斷報告與主動提醒' },
    ],
  },
};

export function PricingCards({
  billing: b,
  busy,
  onSelect,
}: {
  billing: BillingView;
  busy: boolean;
  onSelect: (planId: PlanId) => void;
}) {
  useInterfaceLanguage();
  const a = b.account;
  return (
    <section className="pricing-tiers" aria-label={ui('方案比較')}>
      {plans.map(id => {
        const p = b.policy.plans[id];
        const tier = TIER_CONTENT[id];
        const current = id === a.plan;
        const scheduled = !current && a.pendingPlan === id;
        const approxQuestions = Math.max(1, Math.round(p.credits / 2));
        const tierTone = id === 'Plus' ? 'tier-paid tier-popular' : id === 'Pro' ? 'tier-paid tier-pro' : 'tier-free';
        return (
          <article
            key={id}
            className={`pricing-tier ${tierTone} ${current ? 'is-current-plan' : ''}`}
          >
            <div className="tier-head">
              <h2>{id}</h2>
              {tier.popular && <span className="tier-popular-pill">{ui('最受歡迎')}</span>}
            </div>

            <p className="tier-price">
              <strong className="tier-amount">{hkPrice(p.price)}</strong>
              <span className="tier-period">/ {ui('30 天')}</span>
            </p>

            <div className="tier-quota">
              <strong>{ui('{0} credits / 30 天', [p.credits.toLocaleString()])}</strong>
              <span>
                {p.weeklyCredits
                  ? ui('約 {0} 條問題 · 每週上限 {1} credit', [approxQuestions.toLocaleString(), p.weeklyCredits])
                  : ui('約 {0} 條問題', [approxQuestions.toLocaleString()])}
              </span>
            </div>

            <hr className="tier-divider" />

            <div className="tier-body">
              {tier.leadIn && <p className="tier-lead">{ui(tier.leadIn)}</p>}
              <ul className="tier-features">
                {tier.features.map(item => (
                  <li key={item.label} className={`tier-feature is-${item.kind}`}>
                    <span className={`tier-feature-mark mark-${item.kind}`} aria-hidden="true">
                      {item.kind === 'check' ? <Icon name="check" size={16} /> : item.kind === 'cross' ? <Icon name="x" size={15} /> : <Icon name="bot" size={14} />}
                    </span>
                    <span>{ui(item.label)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <details className="tier-models">
              <summary>{ui('查看開放模型（{0}）', [p.models.length])}</summary>
              <ul className="model-list">
                {p.models.map(m => (
                  <li key={m}>
                    {modelDisplayName(m)}
                    <small>{b.policy.models[m]?.credits} credit</small>
                  </li>
                ))}
              </ul>
            </details>

            <button
              type="button"
              className={`tier-cta ${current || scheduled ? 'is-current' : 'is-action'}`}
              disabled={current || scheduled || busy}
              onClick={() => onSelect(id)}
            >
              {current ? ui('目前套餐') : scheduled ? ui('已排定下期轉用') : ui('選擇 {0}', [id])}
            </button>
          </article>
        );
      })}
    </section>
  );
}
