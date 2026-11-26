import { useState } from 'react';
import { ui, useInterfaceLanguage } from '../i18n';
import { api } from '../api/client';
import { Icon, Tabs } from '../components';
import { DELIVERY_OPTIONS, SLOT_META } from '../partner-studio';
import type { ChapterId, PlaybookVersionView } from '../partner-studio';
import { validatePlaybookSlots } from '../tutors';
import type { PlaybookSlots } from '../tutors';
import { usePartner } from './partner-context';
import { FindingsList, PlaybookView } from './PlaybookView';
import type { UnitStepProps } from './UnitPipeline';

type Tab = 'card' | ChapterId;

function ListEditor({ label, hint, items, onChange, max, multiline = false, disabled }: { label: string; hint?: string; items: string[]; onChange: (items: string[]) => void; max: number; multiline?: boolean; disabled: boolean }) {
  return (
    <fieldset className="ps-list-editor" disabled={disabled}>
      <legend>{ui(label)}</legend>
      {hint && <p className="small muted">{ui(hint)}</p>}
      <ol>
        {items.map((item, i) => (
          <li key={i}>
            {multiline ? (
              <textarea rows={2} value={item} aria-label={`${ui(label)} ${i + 1}`} onChange={e => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            ) : (
              <input value={item} aria-label={`${ui(label)} ${i + 1}`} onChange={e => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            )}
            <button type="button" className="icon-btn" aria-label={ui('刪除第 {0} 項', [i + 1])} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Icon name="trash" size={15} />
            </button>
          </li>
        ))}
      </ol>
      {items.length < max && (
        <button type="button" className="btn ghost small-btn" onClick={() => onChange([...items, ''])}>
          <Icon name="plus" size={14} />
          {ui('新增一項')}
        </button>
      )}
    </fieldset>
  );
}

interface FieldDef<T> { key: keyof T & string; label: string; rows: number }

function GroupEditor<T extends Record<string, string>>({ label, items, fields, blank, onChange, max, disabled }: { label: string; items: T[]; fields: FieldDef<T>[]; blank: T; onChange: (items: T[]) => void; max: number; disabled: boolean }) {
  return (
    <fieldset className="ps-group-editor" disabled={disabled}>
      <legend className="sr-only">{ui(label)}</legend>
      {items.map((item, i) => (
        <div key={i} className="ps-group-item">
          <div className="row-between">
            <strong>{ui(label)} {i + 1}</strong>
            {items.length > 1 && (
              <button type="button" className="btn ghost small-btn" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                <Icon name="trash" size={14} />
                {ui('刪除')}
              </button>
            )}
          </div>
          {fields.map(f => (
            <label key={f.key} className="field">
              <span>{ui(f.label)}</span>
              <textarea rows={f.rows} value={item[f.key]} onChange={e => onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} />
            </label>
          ))}
        </div>
      ))}
      {items.length < max && (
        <button type="button" className="btn secondary small-btn" onClick={() => onChange([...items, { ...blank }])}>
          <Icon name="plus" size={14} />
          {ui('新增{0}', [ui(label)])}
        </button>
      )}
    </fieldset>
  );
}

interface CardFields { titleZh: string; titleEn: string; summaryZh: string; summaryEn: string; highlightsZh: string[]; highlightsEn: string[] }

export function PlaybookEditor({ current, go, readOnly }: UnitStepProps & { current: PlaybookVersionView }) {
  useInterfaceLanguage();
  const { reload, notify } = usePartner();
  const [tab, setTab] = useState<Tab>('card');
  const [slots, setSlots] = useState<PlaybookSlots>(() => structuredClone(current.slots));
  const [card, setCard] = useState<CardFields>(() => ({ titleZh: current.titleZh, titleEn: current.titleEn, summaryZh: current.summaryZh, summaryEn: current.summaryEn, highlightsZh: [...current.highlightsZh], highlightsEn: [...current.highlightsEn] }));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editable = current.status === 'draft' && !readOnly;
  const locked = Boolean(current.tutorConfirmedAt);

  if (current.status !== 'draft') {
    return (
      <div className="ps-playbook">
        <div className="ps-step-head">
          <h2>{ui('方法包（第 {0} 版）', [current.version])}</h2>
          <p className="muted">{current.status === 'published' ? ui('這一版已上架，內容不可再改。要修改請建立新版本，新版本審核通過後才會取代這一版。') : ui('這一版已下架，內容只供查看。')}</p>
        </div>
        <PlaybookView playbook={current} />
        <div className="ps-step-actions">
          <button type="button" className="btn primary" onClick={() => go('submit')}>
            {ui('查看狀態與建立新版本')}
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </div>
    );
  }

  const patchSlots = (next: PlaybookSlots) => { setSlots(next); setDirty(true); };
  const patchCard = (next: Partial<CardFields>) => { setCard(c => ({ ...c, ...next })); setDirty(true); };

  const save = async () => {
    const clean: PlaybookSlots = {
      ...slots,
      style: { ...slots.style, pacingRules: slots.style.pacingRules.map(s => s.trim()).filter(Boolean) },
      decisionTree: { ...slots.decisionTree, steps: slots.decisionTree.steps.map(s => s.trim()).filter(Boolean), mnemonics: slots.decisionTree.mnemonics.map(s => s.trim()).filter(Boolean) },
      boundaries: {
        inScope: slots.boundaries.inScope.map(s => s.trim()).filter(Boolean),
        outOfScope: slots.boundaries.outOfScope.map(s => s.trim()).filter(Boolean),
        resourceGaps: slots.boundaries.resourceGaps.map(s => s.trim()).filter(Boolean),
      },
    };
    const problem = validatePlaybookSlots(clean);
    if (problem) { setError(problem); return; }
    if (!card.titleZh.trim() || !card.summaryZh.trim()) { setError('請填寫方法名稱和一句簡介'); return; }
    setBusy(true);
    setError('');
    try {
      await api(`/partner/playbooks/${encodeURIComponent(current.id)}/versions/${current.version}`, 'PATCH', {
        ...card,
        highlightsZh: card.highlightsZh.map(s => s.trim()).filter(Boolean),
        highlightsEn: card.highlightsEn.map(s => s.trim()).filter(Boolean),
        slots: clean,
      });
      setDirty(false);
      await reload();
      notify('已儲存。內容有改動，請重新進行沙盒試聊');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disabled = !editable || locked || busy;
  const tabs = [{ id: 'card', label: '學生看到的卡片' }, ...(Object.keys(SLOT_META) as ChapterId[]).map(id => ({ id, label: SLOT_META[id].title, count: current.complianceFindings.filter(f => f.slot === id).length || undefined }))];

  return (
    <div className="ps-playbook">
      <div className="ps-step-head">
        <h2>{ui('核對方法包（第 {0} 版草稿）', [current.version])}</h2>
        <p className="muted">{ui('AI 已把講稿提煉成五個部分。逐項讀一遍，改成你會說的話；學生只會看到卡片，五個部分只供 AI 內部使用。')}</p>
      </div>

      {current.reviewerReturnNote && (
        <div className="ps-banner red" role="status">
          <Icon name="flag" size={18} />
          <div>
            <strong>{ui('平台退回修改')}</strong>
            <p>{current.reviewerReturnNote}</p>
          </div>
        </div>
      )}
      {locked && (
        <div className="ps-banner amber" role="status">
          <Icon name="lock" size={18} />
          <p>{ui('這一版已提交審核，內容暫時鎖定。如需修改，請先在「提交審核」步驟撤回提交。')}</p>
        </div>
      )}
      <FindingsList findings={current.complianceFindings} />

      <Tabs items={tabs} value={tab} onChange={id => setTab(id as Tab)} />
      <div className="ps-slot-panel">
        <p className="small muted ps-slot-hint">{tab === 'card' ? ui('學生在 AI 學習室選擇教學方法時會看到這張卡片。') : ui(SLOT_META[tab].detail)}</p>

        {tab === 'card' && (
          <fieldset className="ps-form-grid" disabled={disabled}>
            <label className="field"><span>{ui('方法名稱（中文）')}</span><input maxLength={100} value={card.titleZh} onChange={e => patchCard({ titleZh: e.target.value })} /></label>
            <label className="field"><span>{ui('方法名稱（英文）')}</span><input maxLength={100} value={card.titleEn} onChange={e => patchCard({ titleEn: e.target.value })} /></label>
            <label className="field"><span>{ui('一句簡介（中文）')}</span><textarea rows={2} maxLength={300} value={card.summaryZh} onChange={e => patchCard({ summaryZh: e.target.value })} /></label>
            <label className="field"><span>{ui('一句簡介（英文）')}</span><textarea rows={2} maxLength={300} value={card.summaryEn} onChange={e => patchCard({ summaryEn: e.target.value })} /></label>
            <ListEditor label="亮點（中文）" items={card.highlightsZh} max={4} disabled={disabled} onChange={highlightsZh => patchCard({ highlightsZh })} />
            <ListEditor label="亮點（英文）" items={card.highlightsEn} max={4} disabled={disabled} onChange={highlightsEn => patchCard({ highlightsEn })} />
          </fieldset>
        )}

        {tab === 'style' && (
          <fieldset className="ps-form-stack" disabled={disabled}>
            <label className="field">
              <span>{ui('教學形式')}</span>
              <select value={slots.style.delivery} onChange={e => patchSlots({ ...slots, style: { ...slots.style, delivery: e.target.value as PlaybookSlots['style']['delivery'] } })}>
                {DELIVERY_OPTIONS.map(o => <option key={o.id} value={o.id}>{ui(o.label)}</option>)}
              </select>
            </label>
            <label className="field"><span>{ui('教學風格與提問策略（中文）')}</span><textarea rows={4} value={slots.style.personaZh} onChange={e => patchSlots({ ...slots, style: { ...slots.style, personaZh: e.target.value } })} /></label>
            <label className="field"><span>{ui('教學風格與提問策略（英文）')}</span><textarea rows={4} value={slots.style.personaEn} onChange={e => patchSlots({ ...slots, style: { ...slots.style, personaEn: e.target.value } })} /></label>
            <ListEditor label="節奏規則" hint="例如：每次只推進一步；學生答錯先問他第一步檢查了甚麼。" items={slots.style.pacingRules} max={10} multiline disabled={disabled} onChange={pacingRules => patchSlots({ ...slots, style: { ...slots.style, pacingRules } })} />
          </fieldset>
        )}

        {tab === 'decisionTree' && (
          <fieldset className="ps-form-stack" disabled={disabled}>
            <label className="field"><span>{ui('決策樹名稱')}</span><input maxLength={160} value={slots.decisionTree.title} onChange={e => patchSlots({ ...slots, decisionTree: { ...slots.decisionTree, title: e.target.value } })} /></label>
            <ListEditor label="判斷步驟（按次序）" items={slots.decisionTree.steps} max={12} multiline disabled={disabled} onChange={steps => patchSlots({ ...slots, decisionTree: { ...slots.decisionTree, steps } })} />
            <ListEditor label="口訣" items={slots.decisionTree.mnemonics} max={10} disabled={disabled} onChange={mnemonics => patchSlots({ ...slots, decisionTree: { ...slots.decisionTree, mnemonics } })} />
          </fieldset>
        )}

        {tab === 'traps' && (
          <GroupEditor
            label="陷阱"
            items={slots.traps}
            max={12}
            disabled={disabled}
            blank={{ pattern: '', warning: '', fix: '' }}
            fields={[{ key: 'pattern', label: '題型', rows: 2 }, { key: 'warning', label: '學生常見失分點', rows: 2 }, { key: 'fix', label: '避開方法', rows: 2 }]}
            onChange={traps => patchSlots({ ...slots, traps })}
          />
        )}

        {tab === 'examples' && (
          <GroupEditor
            label="例題"
            items={slots.examples}
            max={8}
            disabled={disabled}
            blank={{ title: '', prompt: '', walkthrough: '', takeaway: '' }}
            fields={[{ key: 'title', label: '例題名稱', rows: 1 }, { key: 'prompt', label: '題目（必須原創）', rows: 3 }, { key: 'walkthrough', label: '按你的步驟拆解', rows: 6 }, { key: 'takeaway', label: '要點', rows: 2 }]}
            onChange={examples => patchSlots({ ...slots, examples })}
          />
        )}

        {tab === 'boundaries' && (
          <fieldset className="ps-form-stack" disabled={disabled}>
            <ListEditor label="涵蓋範圍" items={slots.boundaries.inScope} max={12} disabled={disabled} onChange={inScope => patchSlots({ ...slots, boundaries: { ...slots.boundaries, inScope } })} />
            <ListEditor label="不涵蓋" items={slots.boundaries.outOfScope} max={12} disabled={disabled} onChange={outOfScope => patchSlots({ ...slots, boundaries: { ...slots.boundaries, outOfScope } })} />
            <ListEditor label="資料缺口" hint="例如：未核實的計算機按鍵次序。AI 會如實告訴學生這部分未有資料。" items={slots.boundaries.resourceGaps} max={12} disabled={disabled} onChange={resourceGaps => patchSlots({ ...slots, boundaries: { ...slots.boundaries, resourceGaps } })} />
          </fieldset>
        )}
      </div>

      {error && <p className="form-error" role="alert">{ui(error)}</p>}

      <div className="ps-step-actions ps-sticky-actions">
        {dirty && <span className="small muted">{ui('有未儲存的修改；儲存後需要重新試聊。')}</span>}
        {editable && !locked && (
          <button type="button" className="btn secondary" disabled={!dirty || busy} onClick={() => void save()}>
            <Icon name="check" size={16} />
            {busy ? ui('正在儲存…') : ui('儲存修改')}
          </button>
        )}
        <button type="button" className="btn primary" disabled={dirty} onClick={() => go(locked ? 'submit' : 'sandbox')}>
          {locked ? ui('查看提交狀態') : ui('去沙盒試聊')}
          <Icon name="arrow" size={16} />
        </button>
      </div>
    </div>
  );
}
