import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ui, useInterfaceLanguage } from '../i18n';
import { Icon } from '../components';
import { defaultStep, PIPELINE_STEPS, stepAvailable, stepDone, UNIT_STAGE_LABEL, unitStage } from '../partner-studio';
import type { ChapterTranscripts, PipelineContext, PipelineStep, PlaybookVersionView } from '../partner-studio';
import { clearPartnerDraft, loadPartnerDraft, savePartnerDraft } from '../platform/partner-drafts';
import type { PartnerLocalDraft } from '../platform/partner-drafts';
import { subjectOf, topicOf, usePartner } from './partner-context';
import { SubjectMark, topicLabel } from './PartnerHome';
import { PrepareStep, RecordStep } from './RecordStep';
import { ManuscriptStep } from './ManuscriptStep';
import { PlaybookEditor } from './PlaybookEditor';
import { SandboxStep } from './SandboxStep';
import { SubmitStep } from './SubmitStep';

export interface UnitStepProps {
  topicId: string;
  topicName: string;
  current?: PlaybookVersionView;
  draft: PartnerLocalDraft;
  updateDraft: (patch: Partial<PartnerLocalDraft>) => void;
  discardDraft: () => void;
  go: (step: PipelineStep) => void;
  readOnly: boolean;
}

export function UnitPipeline() {
  const { topicId = '' } = useParams();
  return <UnitPipelineView key={topicId} topicId={topicId} />;
}

function UnitPipelineView({ topicId }: { topicId: string }) {
  const language = useInterfaceLanguage();
  const { workspace } = usePartner();
  const partnerId = workspace.partnerTutor.id;
  const topic = topicOf(workspace, topicId);
  const [draft, setDraft] = useState<PartnerLocalDraft>(() => loadPartnerDraft(partnerId, topicId));
  const [step, setStep] = useState<PipelineStep | null>(null);

  if (!topic) {
    return (
      <section className="ps-panel ps-center">
        <h1>{ui('找不到這個單元')}</h1>
        <Link className="btn primary" to="/partner">{ui('返回我的單元')}</Link>
      </section>
    );
  }

  const versions = workspace.playbooks.filter(p => p.topicId === topicId).sort((a, b) => b.version - a.version);
  const current = versions[0];
  const transcripts: ChapterTranscripts = draft.transcripts;
  const ctx: PipelineContext = {
    current,
    hasTranscripts: Object.values(transcripts).some(t => t?.text.trim()),
    manuscriptChars: draft.manuscript.trim().length,
  };
  const active = step && stepAvailable(step, ctx) ? step : defaultStep(ctx);
  const stage = unitStage(current, ctx.hasTranscripts || ctx.manuscriptChars > 0);
  const topicName = topicLabel(topic, language);
  const readOnly = workspace.partnerTutor.status !== 'active';

  const updateDraft = (patch: Partial<PartnerLocalDraft>) => {
    setDraft(prev => {
      const next = { ...prev, ...patch };
      savePartnerDraft(partnerId, topicId, next);
      return next;
    });
  };
  const discardDraft = () => {
    clearPartnerDraft(partnerId, topicId);
    setDraft(loadPartnerDraft(partnerId, topicId));
  };
  const go = (next: PipelineStep) => {
    setStep(next);
    requestAnimationFrame(() => document.getElementById('ps-step-panel')?.focus({ preventScroll: false }));
  };
  const props: UnitStepProps = { topicId, topicName, current, draft, updateDraft, discardDraft, go, readOnly };

  return (
    <div className="ps-unit page-enter">
      <Link to="/partner" className="back-link">
        <Icon name="left" size={14} />
        {ui('我的單元')}
      </Link>
      <header className="ps-unit-head">
        <SubjectMark subject={subjectOf(workspace, topic.subjectId)} />
        <div>
          <h1>{topicName}</h1>
          <p className="muted small">
            {ui(topic.module)}
            {current ? ` · ${ui('第 {0} 版', [current.version])}` : ''}
          </p>
        </div>
        <span className={`badge ${UNIT_STAGE_LABEL[stage].tone}`}>{ui(UNIT_STAGE_LABEL[stage].label)}</span>
      </header>

      <nav className="ps-rail" aria-label={ui('製作進度')}>
        <ol>
          {PIPELINE_STEPS.map((s, index) => {
            const available = stepAvailable(s.id, ctx);
            const done = stepDone(s.id, ctx);
            const isActive = s.id === active;
            return (
              <li key={s.id} className={`${isActive ? 'active' : ''} ${done ? 'done' : ''} ${available ? '' : 'locked'}`}>
                <button type="button" disabled={!available} aria-current={isActive ? 'step' : undefined} onClick={() => go(s.id)}>
                  <span className="ps-rail-dot" aria-hidden="true">{done && !isActive ? <Icon name="check" size={13} /> : index + 1}</span>
                  <span className="ps-rail-label">{ui(s.label)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section id="ps-step-panel" className="ps-step" tabIndex={-1} aria-label={ui(PIPELINE_STEPS.find(s => s.id === active)!.label)}>
        {active === 'prepare' && <PrepareStep {...props} />}
        {active === 'record' && <RecordStep {...props} />}
        {active === 'manuscript' && <ManuscriptStep {...props} />}
        {active === 'playbook' && current && <PlaybookEditor key={`${current.id}-${current.version}-${current.updatedAt}`} {...props} current={current} />}
        {active === 'sandbox' && current && <SandboxStep key={`${current.id}-${current.version}`} {...props} current={current} />}
        {active === 'submit' && current && <SubmitStep {...props} current={current} versions={versions} />}
      </section>
    </div>
  );
}
