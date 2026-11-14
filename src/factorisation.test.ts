import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  applyGuidedAction,
  checkFactorisationAnswer,
  evaluateAst,
  parsePolynomial,
} from './factorisation-check';
import type { GuidedItemState } from './factorisation-check';
import {
  computeFactorisationProgress,
  FACTORISATION_MASTER_CHECKLIST,
  FACTORISATION_PARTS,
  findFactorisationSlot,
} from './data/factorisation-guide';
import { InlineMathText } from './TopicGuidedCourse';
import { recordGuidedInteraction } from '../server/practice-state';
import { tutorInstructions, tutorResources } from '../server/tutors';

function extractMathFromPrompt(prompt: string): string {
  const match = prompt.match(/\$([^$]+)\$/);
  if (!match) throw new Error(`Missing $...$ expression in prompt: ${prompt}`);
  return match[1];
}

const EVAL_ENVS = [
  { a: 7, b: 11, k: 13, m: 5, n: 17, p: 19, q: 3, r: 23, s: 2, t: 29, u: 7, v: 11, w: 13, x: 5, y: 17, z: 19 },
  { a: -5, b: 13, k: -7, m: 11, n: -3, p: 7, q: -11, r: 5, s: -13, t: 3, u: -17, v: 7, w: -5, x: 13, y: -3, z: 11 },
  { a: 3, b: -7, k: 5, m: -13, n: 11, p: -3, q: 17, r: -7, s: 19, t: -5, u: 3, v: -11, w: 7, x: -17, y: 5, z: -3 },
];

describe('factorisation study guide mathematical integrity', () => {
  it('verifies every worked example across all 7 parts is algebraically identical to its original prompt', () => {
    expect(FACTORISATION_PARTS).toHaveLength(7);
    for (const part of FACTORISATION_PARTS) {
      const rawPrompt = part.workedExample.promptTex.includes('\\Longrightarrow')
        ? part.workedExample.promptTex.split('\\Longrightarrow')[1].replace(/\\text\{[^}]*\}/g, '').replace(/\\quad/g, '').trim()
        : part.workedExample.promptTex;
      const pAst = parsePolynomial(rawPrompt);
      const aAst = parsePolynomial(part.workedExample.answerTex);
      expect(pAst.ast, `Worked prompt AST for ${part.id}`).toBeDefined();
      expect(aAst.ast, `Worked answer AST for ${part.id}`).toBeDefined();
      for (const env of EVAL_ENVS) {
        expect(evaluateAst(aAst.ast!, env), `Worked example mismatch in ${part.id}`).toBe(evaluateAst(pAst.ast!, env));
      }
    }
  });

  it('verifies all 49 warm-up and check variants across 7 parts are algebraically valid and pass the oracle', () => {
    let variantCount = 0;
    const ids = new Set<string>();

    for (const part of FACTORISATION_PARTS) {
      const slots = [part.warmup, ...part.checks];
      expect(part.checks).toHaveLength(2);

      for (const slot of slots) {
        for (const variant of slot.variants) {
          variantCount += 1;
          expect(ids.has(variant.id), `Duplicate variant id ${variant.id}`).toBe(false);
          ids.add(variant.id);

          const exprZh = extractMathFromPrompt(variant.promptZh);
          const exprEn = extractMathFromPrompt(variant.promptEn);
          expect(exprZh).toBe(exprEn);

          const promptParsed = parsePolynomial(exprZh);
          const ansTexParsed = parsePolynomial(variant.answerTex);
          expect(promptParsed.ast, `Prompt parse failed: ${variant.id}`).toBeDefined();
          expect(ansTexParsed.ast, `AnswerTex parse failed: ${variant.id}`).toBeDefined();

          for (const env of EVAL_ENVS) {
            expect(evaluateAst(ansTexParsed.ast!, env), `Algebraic mismatch in ${variant.id}`).toBe(
              evaluateAst(promptParsed.ast!, env),
            );
          }

          if (variant.kind === 'choice') {
            expect(variant.options).toHaveLength(4);
            const idx = variant.answer.charCodeAt(0) - 65;
            const correctOpt = extractMathFromPrompt(variant.options![idx]);
            const optParsed = parsePolynomial(correctOpt);
            expect(optParsed.ast).toBeDefined();
            for (const env of EVAL_ENVS) {
              expect(evaluateAst(optParsed.ast!, env), `Choice option ${variant.answer} mismatch in ${variant.id}`).toBe(
                evaluateAst(promptParsed.ast!, env),
              );
            }
            // Distractors must NOT equal the prompt!
            variant.options!.forEach((opt, i) => {
              if (i === idx) return;
              const dParsed = parsePolynomial(extractMathFromPrompt(opt));
              expect(dParsed.ast).toBeDefined();
              const allEqual = EVAL_ENVS.every(env => evaluateAst(dParsed.ast!, env) === evaluateAst(promptParsed.ast!, env));
              expect(allEqual, `Distractor ${i} in ${variant.id} is accidentally equivalent!`).toBe(false);
            });
            expect(checkFactorisationAnswer(variant, variant.answer).verdict).toBe('correct');
          } else {
            // Canonical answer passes oracle
            expect(checkFactorisationAnswer(variant, variant.answer).verdict, `Oracle rejected canonical answer for ${variant.id}`).toBe('correct');
            // Pasting the unfactorised prompt is caught as unfactorised
            expect(checkFactorisationAnswer(variant, exprZh).code, `Unfactorised prompt was not caught for ${variant.id}`).toBe('unfactorised');
          }
        }
      }
    }
    expect(variantCount).toBe(49);
  });
});

describe('polynomial factorisation oracle diagnostics', () => {
  it('accepts commuted brackets, reordered terms, and valid double sign-flips', () => {
    const quad = findFactorisationSlot('fac-p4-c1')!.slot.variants[0]; // (2x + 5)(3x - 2)
    expect(checkFactorisationAnswer(quad, '(3x - 2)(2x + 5)').verdict).toBe('correct');
    expect(checkFactorisationAnswer(quad, '(-2 + 3x)(5 + 2x)').verdict).toBe('correct');

    const opp = findFactorisationSlot('fac-p2-c2')!.slot.variants[0]; // (a - 2b)(3x - 5y)
    expect(checkFactorisationAnswer(opp, '(2b - a)(5y - 3x)').verdict).toBe('correct');
  });

  it('catches missing scalar GCF, missing variable GCF, nested brackets, fractions, and sign traps', () => {
    const part2 = findFactorisationSlot('fac-p2-c1')!.slot.variants[0]; // 3(2x - 3)(x + 2)
    expect(checkFactorisationAnswer(part2, '(2x - 3)(3x + 6)').code).toBe('missing-scalar-gcf');

    const part4 = findFactorisationSlot('fac-p4-c2')!.slot.variants[0]; // 3a^2(a - 6)(a + 2)
    expect(checkFactorisationAnswer(part4, '3a(a^2 - 6a)(a + 2)').code).toBe('missing-var-gcf');
    expect(checkFactorisationAnswer(part4, '3a^2(a^2 - 4a - 12)').code).toBe('incomplete-factors');

    const part4Frac = findFactorisationSlot('fac-p4-c1')!.slot.variants[0];
    expect(checkFactorisationAnswer(part4Frac, '6(x + 5/2)(x - 2/3)').code).toBe('fraction-or-decimal');
    expect(checkFactorisationAnswer(part4Frac, '6(x + 2.5)(x - 0.67)').code).toBe('fraction-or-decimal');

    const part6 = findFactorisationSlot('fac-p6-c1')!.slot.variants[0]; // (6 + 4x - 5y)(6 - 4x + 5y)
    expect(checkFactorisationAnswer(part6, '[6 + (4x - 5y)][6 - (4x - 5y)]').code).toBe('nested-brackets');
    expect(checkFactorisationAnswer(part6, '(6 + 4x - 5y)(4x - 5y - 6)').code).toBe('sign-error');
  });

  it('keeps guided/assisted mastery honest while allowing fresh-variant independent recovery', () => {
    const store: Record<string, GuidedItemState> = {};
    const slot = findFactorisationSlot('fac-p1-c1')!.slot;

    // Using hint before submitting marks solved=true but independent=false
    applyGuidedAction(store, {
      topicId: 'maths-factorisation',
      partId: 'part-1',
      itemId: slot.id,
      mode: 'check',
      action: 'assist',
      variantCount: slot.variants.length,
      variant: slot.variants[0],
    });
    const res1 = applyGuidedAction(store, {
      topicId: 'maths-factorisation',
      partId: 'part-1',
      itemId: slot.id,
      mode: 'check',
      action: 'submit',
      answer: slot.variants[0].answer,
      variantCount: slot.variants.length,
      variant: slot.variants[0],
    });
    expect(res1.state.solved).toBe(true);
    expect(res1.state.independent).toBe(false);
    expect(computeFactorisationProgress(store).overallPercent).toBe(0);

    // Switching to a fresh unseen variant resets assistedCurrent and allows earning independent mastery!
    const next = applyGuidedAction(store, {
      topicId: 'maths-factorisation',
      partId: 'part-1',
      itemId: slot.id,
      mode: 'check',
      action: 'next-variant',
      variantCount: slot.variants.length,
      variant: slot.variants[0],
    });
    expect(next.state.variantIndex).toBe(1);
    expect(next.state.assistedCurrent).toBe(false);

    const res2 = applyGuidedAction(store, {
      topicId: 'maths-factorisation',
      partId: 'part-1',
      itemId: slot.id,
      mode: 'check',
      action: 'submit',
      answer: slot.variants[1].answer,
      variantCount: slot.variants.length,
      variant: slot.variants[1],
    });
    expect(res2.state.independent).toBe(true);
    expect(computeFactorisationProgress(store).parts[0].percent).toBe(50);
  });

  it('validates server recordGuidedInteraction and active-Part chunk ordering in tutorInstructions', () => {
    const fakeStudentState: any = {
      profile: { grades: {}, targetGrades: { maths: '5' }, primaryProgramme: '', year: 2028, dailyMinutes: Array(7).fill(60) },
      chats: [],
      events: [],
    };
    const reject = (msg: string): never => {
      throw new Error(msg);
    };

    const r1 = recordGuidedInteraction(
      fakeStudentState,
      { topicId: 'maths-factorisation', itemId: 'fac-p1-c1', action: 'submit', answer: '7pq(2p - 3q)' },
      reject,
    );
    expect(r1.check?.verdict).toBe('correct');
    expect(r1.state.independent).toBe(true);
    expect(r1.progress.parts[0].percent).toBe(50);

    expect(() =>
      recordGuidedInteraction(fakeStudentState, { topicId: 'maths-quadratic', itemId: 'fac-p1-c1', action: 'assist' }, reject),
    ).toThrow();

    expect(tutorResources.some((r) => r.id === 'hokse-factorisation-part-6')).toBe(true);
    const facChat: any = {
      id: 'c1',
      topicId: 'maths-factorisation',
      tutor: { id: 'david', version: '1' },
      messages: [{ id: 'm1', role: 'user', content: '請用簡潔分段方式講解因式分解 Part 6（兩平方差），為什麼要寫中括號？', status: 'complete' }],
      documents: [],
    };
    const instructions = tutorInstructions(facChat, fakeStudentState, false);
    expect(instructions).toContain('因式分解分段 AI 講解指引');
    expect(instructions.indexOf('hokse-factorisation-part-6')).toBeLessThan(instructions.indexOf('hokse-factorisation-part-1'));
  });

  it('renders every guide string, solution step, hint, trap, and MC option with zero raw $ or ** tokens', () => {
    const samples: { label: string; text: string }[] = [];
    for (const rule of FACTORISATION_MASTER_CHECKLIST.rules) {
      samples.push({ label: `checklist-${rule.badgeEn}-zh`, text: rule.detailZh });
      samples.push({ label: `checklist-${rule.badgeEn}-en`, text: rule.detailEn });
    }
    for (const part of FACTORISATION_PARTS) {
      part.stepsZh.forEach((s, i) => samples.push({ label: `${part.id}-stepsZh-${i}`, text: s }));
      part.stepsEn.forEach((s, i) => samples.push({ label: `${part.id}-stepsEn-${i}`, text: s }));
      samples.push({ label: `${part.id}-trapZh`, text: part.trapZh });
      samples.push({ label: `${part.id}-trapEn`, text: part.trapEn });
      for (const slot of [part.warmup, ...part.checks]) {
        for (const v of slot.variants) {
          samples.push({ label: `${v.id}-promptZh`, text: v.promptZh });
          samples.push({ label: `${v.id}-promptEn`, text: v.promptEn });
          v.hintsZh.forEach((h, i) => samples.push({ label: `${v.id}-hintsZh-${i}`, text: h }));
          v.hintsEn.forEach((h, i) => samples.push({ label: `${v.id}-hintsEn-${i}`, text: h }));
          v.stepsZh.forEach((s, i) => samples.push({ label: `${v.id}-stepsZh-${i}`, text: s }));
          v.stepsEn.forEach((s, i) => samples.push({ label: `${v.id}-stepsEn-${i}`, text: s }));
          v.options?.forEach((opt, i) =>
            samples.push({ label: `${v.id}-opt-${i}`, text: opt.includes('$') ? opt : `$${opt}$` }),
          );
        }
      }
    }

    for (const sample of samples) {
      const html = renderToStaticMarkup(createElement(InlineMathText, { text: sample.text }));
      // Strip HTML tags to inspect visible text
      const visibleText = html.replace(/<[^>]+>/g, '');
      expect(visibleText, `Raw ** found in ${sample.label}: ${visibleText}`).not.toContain('**');
      expect(visibleText, `Raw $ found in ${sample.label}: ${visibleText}`).not.toContain('$');
    }
  });
});
