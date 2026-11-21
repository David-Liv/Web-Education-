import {describe, expect, it} from 'vitest';
import {
  FOCUS_LOCK_KEYS,
  applyFocusReturn,
  clock,
  formatAwayDuration,
  isBlockedFocusShortcut,
  isExternalNavigationLink,
  recordFocusDeparture,
  type FocusSession,
} from './focus';

describe('Open Focus Plan A guards', () => {
  it('blocks external http(s) links while allowing in-site routes, hashes and local schemes', () => {
    const origin = 'https://web-education.onrender.com';
    expect(isExternalNavigationLink('https://youtube.com/watch?v=123', origin)).toBe(true);
    expect(isExternalNavigationLink('http://example.com/resource', origin)).toBe(true);
    expect(isExternalNavigationLink('https://web-education.onrender.com/subjects/maths', origin)).toBe(false);
    expect(isExternalNavigationLink('/learn', origin)).toBe(false);
    expect(isExternalNavigationLink('/resources/maths?topic=1', origin)).toBe(false);
    expect(isExternalNavigationLink('#section-1', origin)).toBe(false);
    expect(isExternalNavigationLink('mailto:test@example.com', origin)).toBe(false);
    expect(isExternalNavigationLink('blob:https://web-education.onrender.com/abc', origin)).toBe(false);
    expect(isExternalNavigationLink(null, origin)).toBe(false);
  });

  it('intercepts tab/window/fullscreen escape shortcuts without blocking normal study shortcuts', () => {
    expect(FOCUS_LOCK_KEYS).toContain('Escape');
    expect(isBlockedFocusShortcut({key: 't', ctrlKey: true, metaKey: false, altKey: false})).toBe(true);
    expect(isBlockedFocusShortcut({key: 'W', ctrlKey: false, metaKey: true, altKey: false})).toBe(true);
    expect(isBlockedFocusShortcut({key: 'n', ctrlKey: true, metaKey: false, altKey: false})).toBe(true);
    expect(isBlockedFocusShortcut({key: 'F11', ctrlKey: false, metaKey: false, altKey: false})).toBe(true);

    // Normal in-app shortcuts and typing remain available
    expect(isBlockedFocusShortcut({key: 'k', ctrlKey: true, metaKey: false, altKey: false})).toBe(false);
    expect(isBlockedFocusShortcut({key: 'c', ctrlKey: true, metaKey: false, altKey: false})).toBe(false);
    expect(isBlockedFocusShortcut({key: 'v', ctrlKey: true, metaKey: false, altKey: false})).toBe(false);
    expect(isBlockedFocusShortcut({key: 't', ctrlKey: false, metaKey: false, altKey: false})).toBe(false);
    expect(isBlockedFocusShortcut({key: 'Escape', ctrlKey: false, metaKey: false, altKey: false})).toBe(false);
  });

  it('records departures and accumulates away seconds cleanly', () => {
    const base: FocusSession = {
      mode: 'open',
      label: '自由專注溫習',
      totalSeconds: 1500,
      endsAt: Date.now() + 1500_000,
      remaining: 1500,
      immersive: false,
      leaveCount: 0,
      awaySeconds: 0,
      lastLeaveReason: null,
    };

    const leftTab = recordFocusDeparture(base, 'tab');
    expect(leftTab.leaveCount).toBe(1);
    expect(leftTab.lastLeaveReason).toBe('tab');

    const back1 = applyFocusReturn(leftTab, 14.4);
    expect(back1.awaySeconds).toBe(14);

    const leftFs = recordFocusDeparture(back1, 'fullscreen');
    expect(leftFs.leaveCount).toBe(2);
    expect(leftFs.lastLeaveReason).toBe('fullscreen');

    const back2 = applyFocusReturn(leftFs, 0.2);
    expect(back2.awaySeconds).toBe(15);
  });

  it('formats clocks and away durations readably', () => {
    expect(clock(1500)).toBe('25:00');
    expect(clock(65)).toBe('01:05');
    expect(formatAwayDuration(12)).toBe('12 秒');
    expect(formatAwayDuration(60)).toBe('1 分鐘');
    expect(formatAwayDuration(95)).toBe('1 分 35 秒');
  });
});
