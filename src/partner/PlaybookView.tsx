import { ui, useInterfaceLanguage } from '../i18n';
import { Icon } from '../components';
import { DELIVERY_OPTIONS, SLOT_META } from '../partner-studio';
import type { ChapterId, PlaybookVersionView } from '../partner-studio';
import type { ComplianceFinding } from '../tutors';

export function FindingsList({ findings }: { findings: ComplianceFinding[] }) {
  useInterfaceLanguage();
  if (!findings.length) {
    return (
      <div className="ps-banner green" role="status">
        <Icon name="checkCircle" size={18} />
        <p>{ui('合規掃描沒有發現問題。')}</p>
      </div>
    );
  }
  const blockers = findings.filter(f => f.severity === 'blocker');
  return (
    <div className={`ps-findings ${blockers.length ? 'red' : 'amber'}`} role="status">
      <strong>
        {blockers.length ? ui('有 {0} 項紅線問題，修改後才可提交', [blockers.length]) : ui('有 {0} 項提醒，平台審核時會特別核對', [findings.length])}
      </strong>
      <ul>
        {findings.map((f, i) => (
          <li key={`${f.code}-${i}`}>
            <span className={`badge ${f.severity === 'blocker' ? 'red' : 'amber'}`}>{f.severity === 'blocker' ? ui('紅線') : ui('提醒')}</span>
            <span>
              <strong>{ui(SLOT_META[f.slot as ChapterId]?.title ?? f.slot)}</strong> · {ui(f.message)}
              {f.match && <q>{f.match}</q>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Items({ items }: { items: string[] }) {
  if (!items.length) return <p className="small muted">{ui('（未填寫）')}</p>;
  return <ul className="ps-view-list">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
}

/** Read-only rendering of a playbook version, shared by the tutor (published versions) and reviewers. */
export function PlaybookView({ playbook }: { playbook: PlaybookVersionView }) {
  const language = useInterfaceLanguage();
  const { slots } = playbook;
  const delivery = DELIVERY_OPTIONS.find(o => o.id === slots.style.delivery);
  return (
    <div className="ps-view">
      <section className="ps-view-card">
        <h4>{language === 'en' ? playbook.titleEn : playbook.titleZh}</h4>
        <p>{language === 'en' ? playbook.summaryEn : playbook.summaryZh}</p>
        <div className="chip-row">
          {(language === 'en' ? playbook.highlightsEn : playbook.highlightsZh).map(h => <span key={h} className="badge green">{h}</span>)}
        </div>
      </section>
      <section>
        <h4>{ui(SLOT_META.style.title)}</h4>
        <p className="small muted">{delivery ? ui(delivery.label) : slots.style.delivery}</p>
        <p className="ps-view-text">{language === 'en' ? slots.style.personaEn : slots.style.personaZh}</p>
        <Items items={slots.style.pacingRules} />
      </section>
      <section>
        <h4>{ui(SLOT_META.decisionTree.title)} · {slots.decisionTree.title}</h4>
        <ol className="ps-view-list">{slots.decisionTree.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        {slots.decisionTree.mnemonics.length > 0 && <div className="chip-row">{slots.decisionTree.mnemonics.map(m => <span key={m} className="badge blue">{m}</span>)}</div>}
      </section>
      <section>
        <h4>{ui(SLOT_META.traps.title)}</h4>
        {slots.traps.map((t, i) => (
          <dl key={i} className="ps-view-group">
            <dt>{ui('題型')}</dt><dd>{t.pattern}</dd>
            <dt>{ui('失分點')}</dt><dd>{t.warning}</dd>
            <dt>{ui('避開方法')}</dt><dd>{t.fix}</dd>
          </dl>
        ))}
      </section>
      <section>
        <h4>{ui(SLOT_META.examples.title)}</h4>
        {slots.examples.map((e, i) => (
          <dl key={i} className="ps-view-group">
            <dt>{ui('題目')}</dt><dd><strong>{e.title}</strong><br />{e.prompt}</dd>
            <dt>{ui('拆解')}</dt><dd className="ps-view-text">{e.walkthrough}</dd>
            <dt>{ui('要點')}</dt><dd>{e.takeaway}</dd>
          </dl>
        ))}
      </section>
      <section>
        <h4>{ui(SLOT_META.boundaries.title)}</h4>
        <div className="ps-view-columns">
          <div><h5>{ui('涵蓋')}</h5><Items items={slots.boundaries.inScope} /></div>
          <div><h5>{ui('不涵蓋')}</h5><Items items={slots.boundaries.outOfScope} /></div>
          <div><h5>{ui('資料缺口')}</h5><Items items={slots.boundaries.resourceGaps} /></div>
        </div>
      </section>
    </div>
  );
}
