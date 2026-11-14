import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import katex from 'katex';
import { realMode } from './api/client';
import { useApp } from './state';
import { mastery } from './domain';
import { ui, useInterfaceLanguage } from './i18n';
import { Badge, Empty, Formula, Icon, Progress, SubjectIcon } from './components';
import { SkillPractice } from './LearningPractice';
import { englishExamples, englishSummaries } from './data/teaching';
import {
  computeFactorisationProgress,
  FACTORISATION_MASTER_CHECKLIST,
  FACTORISATION_PARTS,
  FACTORISATION_TOPIC_ID,
} from './data/factorisation-guide';
import type { FactorisationPart, FactorisationSlot } from './data/factorisation-guide';
import type { FactorisationCheckResult, GuidedItemState } from './factorisation-check';
import type { Chat, Subject, Topic } from './types';

function renderInlineLatex(tex: string): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, trust: false, displayMode: false });
  } catch {
    return tex;
  }
}

function renderMathOnly(segment: string, nextKey: () => number): ReactNode[] {
  const out: ReactNode[] = [];
  const mathParts = segment.split(/(\$[^$]+\$)/g);
  for (const part of mathParts) {
    if (!part) continue;
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      const tex = part.slice(1, -1);
      out.push(
        <span
          key={nextKey()}
          className="inline-katex"
          dangerouslySetInnerHTML={{ __html: renderInlineLatex(tex) }}
        />,
      );
    } else {
      out.push(<span key={nextKey()}>{part}</span>);
    }
  }
  return out;
}

export function InlineMathText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let key = 0;
  const nextKey = () => key++;
  const boldParts = text.split(/(\*\*[\s\S]+?\*\*)/g);

  for (const segment of boldParts) {
    if (!segment) continue;
    if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
      nodes.push(<strong key={nextKey()}>{renderMathOnly(segment.slice(2, -2), nextKey)}</strong>);
    } else {
      nodes.push(...renderMathOnly(segment, nextKey));
    }
  }
  return <>{nodes}</>;
}

interface GuidedActionResponse {
  itemId: string;
  mode: 'warmup' | 'check';
  state: GuidedItemState;
  check?: FactorisationCheckResult;
  guided: Record<string, GuidedItemState>;
}

function GuidedProblemRow({
  part,
  slot,
  itemState,
  lang,
  onAskAi,
}: {
  part: FactorisationPart;
  slot: FactorisationSlot;
  itemState?: GuidedItemState;
  lang: 'zh-HK' | 'en';
  onAskAi: (prompt: string) => Promise<void>;
}) {
  const { mutate } = useApp();
  const isEn = lang === 'en';
  const variantCount = slot.variants.length;
  const variantIndex = (itemState?.variantIndex ?? 0) % variantCount;
  const variant = slot.variants[variantIndex];

  const [draft, setDraft] = useState(itemState?.lastAnswer ?? '');
  const [hintStep, setHintStep] = useState(0);
  const [showSteps, setShowSteps] = useState(false);
  const [lastCheck, setLastCheck] = useState<FactorisationCheckResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(itemState?.lastAnswer ?? '');
    setHintStep(0);
    setShowSteps(false);
    setLastCheck(null);
  }, [slot.id, variantIndex]);

  const hints = isEn ? variant.hintsEn : variant.hintsZh;
  const steps = isEn ? variant.stepsEn : variant.stepsZh;
  const promptText = isEn ? variant.promptEn : variant.promptZh;

  const ensureAssistedRecorded = async () => {
    if (itemState?.assistedCurrent) return;
    await mutate<GuidedActionResponse>('/learning/guided', 'POST', {
      topicId: FACTORISATION_TOPIC_ID,
      itemId: slot.id,
      action: 'assist',
      language: lang,
    });
  };

  const handleSubmit = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      const res = await mutate<GuidedActionResponse>('/learning/guided', 'POST', {
        topicId: FACTORISATION_TOPIC_ID,
        itemId: slot.id,
        action: 'submit',
        answer: draft,
        language: lang,
      });
      if (res.check) setLastCheck(res.check);
    } catch {
      // Error toast is already surfaced by mutate
    } finally {
      setBusy(false);
    }
  };

  const handleNextHint = async () => {
    if (busy || hintStep >= hints.length) return;
    setBusy(true);
    try {
      await ensureAssistedRecorded();
      setHintStep(s => Math.min(hints.length, s + 1));
    } catch {
      // Ignore
    } finally {
      setBusy(false);
    }
  };

  const handleShowSteps = async () => {
    if (busy) return;
    if (showSteps) {
      setShowSteps(false);
      return;
    }
    setBusy(true);
    try {
      await ensureAssistedRecorded();
      setShowSteps(true);
    } catch {
      // Ignore
    } finally {
      setBusy(false);
    }
  };

  const handleNextVariant = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await mutate<GuidedActionResponse>('/learning/guided', 'POST', {
        topicId: FACTORISATION_TOPIC_ID,
        itemId: slot.id,
        action: 'next-variant',
        language: lang,
      });
      setDraft('');
      setHintStep(0);
      setShowSteps(false);
      setLastCheck(null);
    } catch {
      // Ignore
    } finally {
      setBusy(false);
    }
  };

  const handleAskQuestionAi = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (slot.mode === 'check' && !itemState?.independent) {
        await ensureAssistedRecorded();
      }
      const cleanQ = promptText.replace(/\$/g, '');
      const attemptNote = draft.trim()
        ? isEn
          ? ` My current attempt is "${draft.trim()}".`
          : `我目前嘗試寫了「${draft.trim()}」。`
        : '';
      const aiPrompt = isEn
        ? `I am working on Factorisation Part ${part.number} (${part.titleEn}): "${cleanQ}".${attemptNote} Please guide me step by step in short turns instead of giving a long wall of text.`
        : `我在做因式分解 Part ${part.number}（${part.titleZh}）：「${cleanQ}」。${attemptNote}請一步步引導我拆解重點，不要一次過輸出太長篇幅。`;
      await onAskAi(aiPrompt);
    } finally {
      setBusy(false);
    }
  };

  const canRetryFresh =
    variantCount > 1 &&
    (slot.mode === 'check'
      ? !itemState?.independent && !!(itemState?.assistedCurrent || itemState?.wrongCurrent || itemState?.solved)
      : !!itemState?.solved || !!itemState?.assistedCurrent);

  const statusBadge =
    slot.mode === 'warmup' ? (
      itemState?.solved ? (
        <Badge tone="green">{ui('熱身已完成')}</Badge>
      ) : (
        <Badge>{ui('引導熱身 · 不計入獨立進度')}</Badge>
      )
    ) : itemState?.independent ? (
      <Badge tone="green">{ui('已獨立通過')}</Badge>
    ) : itemState?.solved ? (
      <Badge tone="amber">{ui('輔助完成 · 可換新題獨立驗證')}</Badge>
    ) : itemState?.assistedCurrent || itemState?.wrongCurrent ? (
      <Badge tone="amber">{ui('本題已用提示／試錯 · 可換新題驗證')}</Badge>
    ) : (
      <Badge>{ui('獨立檢核')}</Badge>
    );

  return (
    <div className={`guided-problem ${itemState?.independent ? 'is-mastered' : ''}`}>
      <div className="guided-problem-head">
        <div className="guided-problem-title">
          <strong>{isEn ? slot.titleEn : slot.titleZh}</strong>
          {variantCount > 1 && (
            <span className="guided-variant-tag">
              {ui('題型變體 {0}/{1}', [variantIndex + 1, variantCount])}
            </span>
          )}
        </div>
        {statusBadge}
      </div>

      <p className="guided-problem-prompt">
        <InlineMathText text={promptText} />
      </p>

      {variant.kind === 'choice' && variant.options ? (
        <div className="guided-choice-grid" role="radiogroup" aria-label={isEn ? slot.titleEn : slot.titleZh}>
          {variant.options.map((opt, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const selected = draft.trim().toUpperCase() === letter;
            return (
              <button
                type="button"
                key={letter}
                className={`answer-option guided-choice-option ${selected ? 'selected' : ''}`}
                disabled={busy}
                onClick={() => setDraft(letter)}
              >
                <span className="choice-letter">{letter}.</span>
                <span className="choice-math">
                  <InlineMathText text={opt.includes('$') ? opt : `$${opt}$`} />
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="guided-input-row">
          <input
            type="text"
            className="guided-math-input"
            value={draft}
            disabled={busy}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder={
              isEn
                ? 'Enter factorised form, e.g. 6a(2b - 3a + 1) or (2x - 3)(x + 4)'
                : '輸入因式分解結果，例如 6a(2b - 3a + 1) 或 (2x - 3)(x + 4)'
            }
            aria-label={isEn ? slot.titleEn : slot.titleZh}
          />
          <button
            type="button"
            className="btn primary"
            disabled={busy || !draft.trim()}
            onClick={() => void handleSubmit()}
          >
            <Icon name="check" size={16} />
            {ui('核對答案')}
          </button>
        </div>
      )}

      {variant.kind === 'choice' && (
        <div className="guided-choice-submit">
          <button
            type="button"
            className="btn primary"
            disabled={busy || !draft.trim()}
            onClick={() => void handleSubmit()}
          >
            <Icon name="check" size={16} />
            {ui('核對選項')}
          </button>
        </div>
      )}

      <div className="guided-assist-bar">
        <button
          type="button"
          className="btn ghost"
          disabled={busy || hintStep >= hints.length}
          onClick={() => void handleNextHint()}
        >
          <Icon name="bulb" size={15} />
          {hintStep === 0
            ? ui('提示（共 {0} 步）', [hints.length])
            : hintStep < hints.length
              ? ui('下一步提示（{0}/{1}）', [hintStep, hints.length])
              : ui('已顯示全部提示')}
        </button>

        <button type="button" className="btn ghost" disabled={busy} onClick={() => void handleShowSteps()}>
          <Icon name="list" size={15} />
          {showSteps ? ui('收起拆解') : ui('查看完整拆解')}
        </button>

        <button type="button" className="btn ghost" disabled={busy} onClick={() => void handleAskQuestionAi()}>
          <Icon name="chat" size={15} />
          {ui('請 AI 講解這題')}
        </button>

        {canRetryFresh && (
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void handleNextVariant()}>
            <Icon name="refresh" size={15} />
            {slot.mode === 'check' ? ui('換同型新題獨立再試') : ui('換另一題熱身')}
          </button>
        )}
      </div>

      {lastCheck && (
        <div
          className={`guided-feedback ${
            lastCheck.verdict === 'correct'
              ? 'tone-green'
              : lastCheck.verdict === 'partly-correct' || lastCheck.verdict === 'invalid'
                ? 'tone-amber'
                : 'tone-red'
          }`}
          role="status"
        >
          <Icon
            name={lastCheck.verdict === 'correct' ? 'checkCircle' : 'alert'}
            size={17}
          />
          <div>
            <p>{isEn ? lastCheck.messageEn : lastCheck.messageZh}</p>
            {slot.mode === 'check' &&
              lastCheck.verdict === 'correct' &&
              !itemState?.independent && (
                <small>
                  {ui('此題曾使用提示或多次嘗試，不會虛報為獨立掌握；按「換同型新題獨立再試」即可取得本題進度。')}
                </small>
              )}
          </div>
        </div>
      )}

      {hintStep > 0 && (
        <div className="guided-hints-panel">
          {hints.slice(0, hintStep).map((h, i) => (
            <div className="guided-hint-step" key={i}>
              <span className="guided-step-num">{i + 1}</span>
              <p>
                <InlineMathText text={h} />
              </p>
            </div>
          ))}
        </div>
      )}

      {showSteps && (
        <div className="guided-steps-panel">
          <strong>{ui('標準分步拆解')}</strong>
          <ol>
            {steps.map((s, i) => (
              <li key={i}>
                <InlineMathText text={s} />
              </li>
            ))}
          </ol>
          <p className="guided-final-answer">
            <span>{ui('參考答案：')}</span>
            <InlineMathText text={`$${variant.answerTex}$`} />
          </p>
        </div>
      )}
    </div>
  );
}

export function DirectTopicPage({
  subject,
  topic,
  onBack,
}: {
  subject: Subject;
  topic: Topic;
  onBack: () => void;
}) {
  const interfaceLang = useInterfaceLanguage();
  const { db, mutate, toast } = useApp();
  const navigate = useNavigate();

  const [lang, setLang] = useState<'zh-HK' | 'en'>(
    interfaceLang === 'en' ? 'en' : db.profile.teachingLanguage,
  );
  const [startingAi, setStartingAi] = useState(false);

  useEffect(() => {
    setLang(interfaceLang === 'en' ? 'en' : db.profile.teachingLanguage);
  }, [interfaceLang, db.profile.teachingLanguage, topic.id]);

  const isEn = lang === 'en';
  const isFactorisation = topic.id === FACTORISATION_TOPIC_ID;
  const guidedMap = db.learning?.guided ?? {};
  const facProgress = computeFactorisationProgress(guidedMap);
  const formalMastery = mastery(topic.id, db.evidence);

  const openTopicAi = async (initialPrompt?: string) => {
    if (startingAi) return;
    setStartingAi(true);
    try {
      const reusable = isFactorisation
        ? db.chats.find(
            c =>
              c.topicId === topic.id &&
              c.mode === 'explain' &&
              (!c.tutor || c.tutor.id === 'david'),
          )
        : undefined;
      const chat =
        reusable ??
        (await mutate<Chat>('/chats', 'POST', {
          topicId: topic.id,
          mode: 'explain',
          tutorId: 'david',
          title: isFactorisation ? ui('因式分解 · AI 分段講解') : topic.name,
        }));
      navigate(
        `/learn/${chat.id}`,
        initialPrompt ? { state: { initialPrompt } } : undefined,
      );
    } catch {
      // Handled by mutate toast
    } finally {
      setStartingAi(false);
    }
  };

  if (!topic.ready) {
    return (
      <div className="page-enter topic-direct-page">
        <button type="button" className="back-link topic-back-btn" onClick={onBack}>
          <Icon name="left" size={15} />
          {ui('返回{0}知識地圖', [subject.name])}
        </button>
        <Empty
          icon="leaf"
          title={ui('課題已列入，內容仍在籌備')}
          description={ui('這個節點暫未提供講解和題目，不會產生虛假的掌握度。')}
          action={
            <a className="btn secondary" href={topic.source} target="_blank" rel="noreferrer">
              {ui('查看課程資料')}
              <Icon name="external" size={15} />
            </a>
          }
        />
      </div>
    );
  }

  const hasPublishedQuizInRealMode = ['maths-quadratic', 'chem-acids'].includes(topic.id);
  const directPracticeHref =
    !realMode || hasPublishedQuizInRealMode
      ? `/quizzes?subjectId=${subject.id}&topicId=${topic.id}`
      : `/studio?subject=${subject.id}`;

  const displayPercent = isFactorisation
    ? facProgress.startedAny || !formalMastery.count
      ? facProgress.overallPercent
      : formalMastery.score ?? 0
    : formalMastery.score ?? 0;

  return (
    <div className="page-enter topic-direct-page">
      <div className="topic-topbar">
        <button type="button" className="back-link topic-back-btn" onClick={onBack}>
          <Icon name="left" size={15} />
          {ui('返回{0}知識地圖', [subject.name])}
        </button>

        {['maths', 'chem'].includes(subject.id) && (
          <div className="segmented" aria-label={ui('教學語言')}>
            <button
              type="button"
              className={lang === 'zh-HK' ? 'active' : ''}
              onClick={() => setLang('zh-HK')}
            >
              {ui('繁中')}
            </button>
            <button
              type="button"
              className={lang === 'en' ? 'active' : ''}
              onClick={() => setLang('en')}
            >
              English
            </button>
          </div>
        )}
      </div>

      <header className="card topic-hero-surface">
        <div className="topic-hero-main">
          <div className="topic-hero-heading">
            <SubjectIcon id={subject.id} size="lg" />
            <div>
              <h1>{isEn ? topic.en : topic.name}</h1>
              <p className="topic-meta-line">
                {subject.name} · {ui(topic.module)} · {topic.papers.map(p => ui(p)).join(' / ')}
              </p>
            </div>
          </div>

          <p className="topic-hero-lead">
            {isFactorisation
              ? ui('無須先填目標等級或時間設定——先看上方 7 個部分的結構與進度，再向下捲動逐部分學習方法並完成即時驗算練習。')
              : ui('直接由核心概念與例題開始理解，隨時在下方展開練習或向 AI 導師發問。')}
          </p>

          <div className="topic-hero-badges">
            <Badge tone="green">
              {isFactorisation ? ui('7 部分直入式導學 · 即時多項式驗算') : ui('原創學習示例')}
            </Badge>
            <Badge>{ui('不換算官方整科 DSE 等級')}</Badge>
          </div>
        </div>

        <div className="topic-hero-progress">
          <div className="topic-percent-row">
            <span>{isFactorisation ? ui('課題獨立掌握進度') : ui('目前練習掌握度')}</span>
            <strong className="topic-percent-num">{displayPercent}%</strong>
          </div>
          <Progress value={displayPercent} color={subject.color} />
          <small className="muted">
            {isFactorisation
              ? ui('已獨立通過 {0} / {1} 道檢核題（提示後答對可換同型新題再驗證）', [
                  facProgress.independentSolved,
                  facProgress.totalChecks,
                ])
              : formalMastery.count
                ? ui('根據 {0} 次已記錄作答計算 · {1}', [formalMastery.count, ui(formalMastery.label)])
                : ui('尚未有獨立作答記錄，可直接由下方開始')}
          </small>

          <div className="topic-hero-actions">
            {!isFactorisation && (
              <Link className="btn primary" to={directPracticeHref}>
                <Icon name="quiz" size={16} />
                {ui('立即練習這個課題')}
              </Link>
            )}
            <button
              type="button"
              className={`btn ${isFactorisation ? 'primary' : 'secondary'}`}
              disabled={startingAi}
              onClick={() =>
                void openTopicAi(
                  isFactorisation
                    ? isEn
                      ? 'Please give me a concise roadmap of HKDSE Factorisation and ask which of the 7 parts I want to tackle first.'
                      : '請用簡短步驟幫我梳理 DSE 因式分解的先後檢查順序，並問我想先攻克哪一部分。'
                    : undefined,
                )
              }
            >
              <Icon name="chat" size={16} />
              {startingAi
                ? ui('正在開啟…')
                : isFactorisation
                  ? ui('問 AI 分段講解')
                  : ui('問問 AI 導師')}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                void mutate('/events', 'POST', {
                  topicId: topic.id,
                  type: 'lesson',
                  minutes: 15,
                })
                  .then(() => toast('已記錄學習，加入今日鞏固'))
                  .catch(() => {})
              }
            >
              <Icon name="checkCircle" size={16} />
              {ui('記錄今日學習')}
            </button>
          </div>
        </div>
      </header>

      {isFactorisation ? (
        <>
          <section className="card topic-overview-section" aria-label={ui('課題各部分與進度總覽')}>
            <div className="topic-section-head">
              <div>
                <h2>{ui('課題 7 大部分與進度總覽')}</h2>
                <p className="small muted">
                  {ui('點選任何部分可直接跳至該段教學與練習；每部分包含精簡步驟、例題、熱身題及 2 道獨立檢核題。')}
                </p>
              </div>
              {!realMode && (
                <Link className="btn secondary" to={`/quizzes?subjectId=maths&topicId=${FACTORISATION_TOPIC_ID}`}>
                  <Icon name="quiz" size={15} />
                  {ui('4 題跨部分綜合小測')}
                </Link>
              )}
            </div>

            <div className="topic-parts-grid">
              {FACTORISATION_PARTS.map((part, idx) => {
                const prog = facProgress.parts[idx];
                const tone =
                  prog.percent === 100
                    ? 'done'
                    : prog.percent > 0 || prog.warmupDone || prog.assistedSolved > 0
                      ? 'active'
                      : 'idle';
                return (
                  <a
                    key={part.id}
                    href={`#${part.id}`}
                    className={`part-overview-card ${tone}`}
                    onClick={e => {
                      e.preventDefault();
                      document.getElementById(part.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    <div className="part-overview-top">
                      <span className="part-num-tag">Part {part.number}</span>
                      <strong className="part-pct-num">{prog.percent}%</strong>
                    </div>
                    <strong className="part-overview-title">
                      {isEn ? part.titleEn : part.titleZh}
                    </strong>
                    <small className="part-overview-short">
                      {isEn ? part.shortEn : part.shortZh}
                    </small>
                    <Progress value={prog.percent} color={subject.color} />
                    <span className="part-overview-meta">
                      {ui('獨立檢核 {0}/{1}', [prog.independentSolved, prog.totalChecks])}
                      {prog.warmupDone ? ` · ${ui('已熱身')}` : ''}
                    </span>
                  </a>
                );
              })}
            </div>

            <div className="topic-priority-block">
              <h3 className="topic-priority-heading">
                {isEn ? FACTORISATION_MASTER_CHECKLIST.titleEn : FACTORISATION_MASTER_CHECKLIST.titleZh}
              </h3>
              <div className="topic-priority-strip">
                {FACTORISATION_MASTER_CHECKLIST.rules.map(rule => (
                  <div className="priority-step-item" key={rule.badgeEn}>
                    <span className="priority-step-badge">{isEn ? rule.badgeEn : rule.badgeZh}</span>
                    <div>
                      <strong>{isEn ? rule.titleEn : rule.titleZh}</strong>
                      <p>
                        <InlineMathText text={isEn ? rule.detailEn : rule.detailZh} />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="topic-parts-stack">
            {FACTORISATION_PARTS.map((part, idx) => {
              const prog = facProgress.parts[idx];
              const methodSteps = isEn ? part.stepsEn : part.stepsZh;
              return (
                <section id={part.id} key={part.id} className="card topic-part-section">
                  <div className="topic-part-header">
                    <div>
                      <div className="topic-part-title-row">
                        <span className="part-pill">Part {part.number}</span>
                        <h2>{isEn ? part.titleEn : part.titleZh}</h2>
                      </div>
                      <p className="muted">{isEn ? part.goalEn : part.goalZh}</p>
                    </div>
                    <div className="topic-part-actions">
                      <Badge tone={prog.percent === 100 ? 'green' : prog.percent > 0 ? 'amber' : 'neutral'}>
                        {ui('{0}% · 檢核 {1}/{2}', [prog.percent, prog.independentSolved, prog.totalChecks])}
                      </Badge>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={startingAi}
                        onClick={() => void openTopicAi(isEn ? part.aiStarterEn : part.aiStarterZh)}
                      >
                        <Icon name="sparkles" size={15} />
                        {ui('請 AI 講解這部分')}
                      </button>
                    </div>
                  </div>

                  <div className="part-teach-grid">
                    <div className="part-method-col">
                      <h3>{ui('解題步驟')}</h3>
                      <ol className="part-steps-list">
                        {methodSteps.map((s, sIdx) => (
                          <li key={sIdx}>
                            <InlineMathText text={s} />
                          </li>
                        ))}
                      </ol>

                      <div className="part-trap-callout">
                        <Icon name="alert" size={17} />
                        <div>
                          <strong>{ui('常犯陷阱')}</strong>
                          <p>
                            <InlineMathText text={isEn ? part.trapEn : part.trapZh} />
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="part-worked-col">
                      <h3>{ui('逐步例題示範')}</h3>
                      <div className="worked-prompt-box">
                        <span className="small muted">{ui('題目')}</span>
                        <Formula tex={part.workedExample.promptTex} />
                      </div>
                      <div className="worked-steps-list">
                        {part.workedExample.steps.map((ws, wIdx) => (
                          <div className="worked-step-row" key={wIdx}>
                            <span className="worked-step-index">{wIdx + 1}</span>
                            <div className="worked-step-body">
                              <small>
                                <strong>{isEn ? ws.labelEn : ws.labelZh}</strong> · {isEn ? ws.noteEn : ws.noteZh}
                              </small>
                              <div className="worked-step-math">
                                <InlineMathText text={`$${ws.mathTex}$`} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="worked-final-row">
                        <span>{ui('最終答案')}</span>
                        <strong>
                          <InlineMathText text={`$${part.workedExample.answerTex}$`} />
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="part-practice-zone">
                    <h3>{ui('即學即練（第 {0} 部分）', [part.number])}</h3>
                    <GuidedProblemRow
                      part={part}
                      slot={part.warmup}
                      itemState={guidedMap[part.warmup.id]}
                      lang={lang}
                      onAskAi={openTopicAi}
                    />
                    {part.checks.map(checkSlot => (
                      <GuidedProblemRow
                        key={checkSlot.id}
                        part={part}
                        slot={checkSlot}
                        itemState={guidedMap[checkSlot.id]}
                        lang={lang}
                        onAskAi={openTopicAi}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <section className="card topic-standard-section">
          <h2>{ui('核心概念與示範')}</h2>
          <div className="lesson-content">
            {(!realMode && isEn && englishSummaries[topic.id]
              ? englishSummaries[topic.id]
              : topic.summary
            ).map((s, i) => (
              <div className="lesson-point" key={s}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <p>{s}</p>
              </div>
            ))}
            {topic.formula && <Formula tex={topic.formula} />}
            {topic.example && (
              <div className="example-box">
                <Icon name="bulb" size={20} />
                <div>
                  <strong>{isEn ? ui('Worked example / 示例') : ui('用一個例子想清楚')}</strong>
                  <p>{isEn ? englishExamples[topic.id]?.example ?? topic.example : topic.example}</p>
                </div>
              </div>
            )}
            {topic.misconception && (
              <div className="misconception-box">
                <Icon name="alert" size={17} />
                <p>
                  {isEn
                    ? englishExamples[topic.id]?.misconception ?? topic.misconception
                    : topic.misconception}
                </p>
              </div>
            )}
            {topic.id === 'eng-listening' && (
              <div className="audio-lesson">
                <Icon name="headphones" />
                <div>
                  <strong>Green Fair — Volunteer Briefing</strong>
                  <p className="small muted">{ui('原創合成錄音 · 可播放及回看逐字稿')}</p>
                  <audio controls src="/audio/listening-demo.wav" />
                  <details>
                    <summary>{ui('查看逐字稿')}</summary>
                    <p>
                      Our school&apos;s green fair will be on Friday, the eighteenth of March.
                      Volunteers should meet in the library at eight thirty in the morning. The fair
                      itself starts at nine. Please bring a reusable water bottle. We will provide
                      name badges. Thank you for helping our school become a greener place.
                    </p>
                  </details>
                </div>
              </div>
            )}
          </div>

          {realMode && topic.id === 'maths-quadratic' && (
            <div className="topic-inline-practice">
              <SkillPractice onCreated={q => navigate('/studio?quiz=' + q.id)} />
            </div>
          )}

          <div className="lesson-actions">
            <Link className="btn primary" to={directPracticeHref}>
              <Icon name="quiz" />
              {ui('立即練習這個課題')}
            </Link>
            <button
              type="button"
              className="btn secondary"
              disabled={startingAi}
              onClick={() => void openTopicAi()}
            >
              <Icon name="chat" />
              {startingAi ? ui('正在開啟…') : ui('問問 AI 導師')}
            </button>
          </div>
        </section>
      )}

      <div className="source-note">
        <Icon name="file" size={14} />
        <span>
          {isFactorisation
            ? ui('本頁教材與 49 道變體題均為本平台原創結構化教學內容，長篇解析已拆分為分段 AI 講解知識庫，不含任何歷屆試題原文。')
            : ui(topic.source)}
        </span>
        {topic.source.startsWith('http') && (
          <a href={topic.source} target="_blank" rel="noreferrer">
            {ui('課程來源')}
            <Icon name="external" size={13} />
          </a>
        )}
      </div>
    </div>
  );
}
