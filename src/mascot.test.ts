import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyApiAiWork,
  emitMascotReaction,
  finishAiWork,
  getMascotSnapshot,
  isWideStarBeanMood,
  markAiStreaming,
  resetMascotStoreForTests,
  resolveMascotVisual,
  startAiWork,
  updateStarBeanPrefs,
} from './mascot-events';

describe('Starbean mascot state machine', () => {
  afterEach(() => {
    resetMascotStoreForTests();
  });

  it('classifies AI POST endpoints cleanly without false positives', () => {
    expect(classifyApiAiWork('/studio/quizzes', 'POST')).toBe('quiz');
    expect(classifyApiAiWork('/quizzes', 'POST')).toBe('quiz');
    expect(classifyApiAiWork('/quizzes/q1/submit', 'POST')).toBe('grading');
    expect(classifyApiAiWork('/learning/items/1/analyse', 'POST')).toBe('grading');
    expect(classifyApiAiWork('/bootstrap', 'GET')).toBeNull();
    expect(classifyApiAiWork('/quizzes/q1/answers', 'PUT')).toBeNull();
  });

  it('tracks AI chat lifecycle from working (thinking -> streaming) to exhausted pancake finish', () => {
    startAiWork('chat-1', 'chat', '/learn/c1');
    let visual = resolveMascotVisual({
      dragging: false,
      jobs: getMascotSnapshot().jobs,
      reaction: getMascotSnapshot().reaction,
      focusRunning: false,
      idlePhase: 'active',
    });
    expect(visual.mood).toBe('thinking');
    expect(visual.aiBusy).toBe(true);
    expect(visual.wideCanvas).toBe(true);

    markAiStreaming('chat-1');
    visual = resolveMascotVisual({
      dragging: false,
      jobs: getMascotSnapshot().jobs,
      reaction: getMascotSnapshot().reaction,
      focusRunning: false,
      idlePhase: 'active',
    });
    expect(visual.mood).toBe('streaming');
    expect(visual.wideCanvas).toBe(true);

    finishAiWork('chat-1', 'done', { route: '/learn/c1', currentPath: '/overview' });
    visual = resolveMascotVisual({
      dragging: false,
      jobs: getMascotSnapshot().jobs,
      reaction: getMascotSnapshot().reaction,
      focusRunning: false,
      idlePhase: 'active',
    });
    expect(visual.mood).toBe('exhausted');
    expect(visual.wideCanvas).toBe(true);
    expect(visual.actionRoute).toBe('/learn/c1');
  });

  it('respects priority: dragging > sus > AI work > transient > focus > 3-stage idle', () => {
    startAiWork('quiz-1', 'quiz', '/studio');
    emitMascotReaction({ mood: 'sus', messageKey: '剛切走囉，回來繼續？', priority: 4 });

    const dragged = resolveMascotVisual({
      dragging: true,
      jobs: getMascotSnapshot().jobs,
      reaction: getMascotSnapshot().reaction,
      focusRunning: true,
      idlePhase: 'nap',
    });
    expect(dragged.mood).toBe('dragged');
    expect(dragged.wideCanvas).toBe(false);

    const sus = resolveMascotVisual({
      dragging: false,
      jobs: getMascotSnapshot().jobs,
      reaction: getMascotSnapshot().reaction,
      focusRunning: true,
      idlePhase: 'nap',
    });
    expect(sus.mood).toBe('sus');

    resetMascotStoreForTests();
    startAiWork('quiz-2', 'quiz', '/studio');
    const quizBusy = resolveMascotVisual({
      dragging: false,
      jobs: getMascotSnapshot().jobs,
      reaction: null,
      focusRunning: true,
      idlePhase: 'nap',
    });
    expect(quizBusy.mood).toBe('quizGenerating');
    expect(quizBusy.autoGlasses).toBe(true);
    expect(quizBusy.wideCanvas).toBe(true);

    finishAiWork('quiz-2', 'aborted');
    const focused = resolveMascotVisual({
      dragging: false,
      jobs: getMascotSnapshot().jobs,
      reaction: getMascotSnapshot().reaction,
      focusRunning: true,
      idlePhase: 'nap',
    });
    expect(focused.mood).toBe('focus');
    expect(focused.autoGlasses).toBe(true);

    // 3-stage idle progression: sitting -> rolling -> nap
    const sitting = resolveMascotVisual({
      dragging: false,
      jobs: [],
      reaction: null,
      focusRunning: false,
      idlePhase: 'sitting',
    });
    expect(sitting.mood).toBe('sitting');
    expect(sitting.wideCanvas).toBe(false);

    const rolling = resolveMascotVisual({
      dragging: false,
      jobs: [],
      reaction: null,
      focusRunning: false,
      idlePhase: 'rolling',
    });
    expect(rolling.mood).toBe('rolling');
    expect(rolling.wideCanvas).toBe(false);

    const nap = resolveMascotVisual({
      dragging: false,
      jobs: [],
      reaction: null,
      focusRunning: false,
      idlePhase: 'nap',
    });
    expect(nap.mood).toBe('nap');
    expect(nap.wideCanvas).toBe(true);
  });

  it('identifies wide horizontal scene moods accurately', () => {
    expect(isWideStarBeanMood('thinking')).toBe(true);
    expect(isWideStarBeanMood('streaming')).toBe(true);
    expect(isWideStarBeanMood('exhausted')).toBe(true);
    expect(isWideStarBeanMood('nap')).toBe(true);
    expect(isWideStarBeanMood('sitting')).toBe(false);
    expect(isWideStarBeanMood('rolling')).toBe(false);
    expect(isWideStarBeanMood('idle')).toBe(false);
  });

  it('emits error state when an AI call fails', () => {
    startAiWork('chat-err', 'chat', '/learn/c2');
    finishAiWork('chat-err', 'error');
    const snap = getMascotSnapshot();
    expect(snap.jobs).toHaveLength(0);
    expect(snap.reaction?.mood).toBe('error');
  });

  it('updates skin and dock preferences cleanly', () => {
    const next = updateStarBeanPrefs({
      color: 'emerald',
      accessory: 'sprout',
      dockedSide: 'right',
      hidden: true,
    });
    expect(next.color).toBe('emerald');
    expect(next.accessory).toBe('sprout');
    expect(next.dockedSide).toBe('right');
    expect(next.hidden).toBe(true);
    expect(getMascotSnapshot().prefs.color).toBe('emerald');
  });
});
