import { describe, expect, it } from 'vitest';
import { calcCost, calcPricing, countedSeconds, timerElapsedSeconds, validateSessionTimes } from './calc';
import type { ActiveTimer } from '../types';

const RATE = 250;
const MIN = 60;
const HOUR = 3600;

describe('calcCost', () => {
  it('matches the specification examples at 250 SAR/hour', () => {
    expect(calcCost(30 * MIN, RATE)).toBe(125);
    expect(calcCost(1 * HOUR, RATE)).toBe(250);
    expect(calcCost(1.5 * HOUR, RATE)).toBe(375);
    expect(calcCost(2 * HOUR + 15 * MIN, RATE)).toBe(562.5);
    expect(calcCost(3 * HOUR + 30 * MIN, RATE)).toBe(875);
    expect(calcCost(8 * HOUR, RATE)).toBe(2000);
  });

  it('is second-precise and never rounds to whole hours', () => {
    expect(calcCost(1, RATE)).toBe(0.07); // 250/3600 = 0.0694 → 0.07
    expect(calcCost(HOUR + 1, RATE)).toBe(250.07);
    expect(calcCost(59 * MIN, RATE)).toBe(245.83);
  });

  it('returns 0 for negative, zero or invalid inputs', () => {
    expect(calcCost(0, RATE)).toBe(0);
    expect(calcCost(-100, RATE)).toBe(0);
    expect(calcCost(NaN, RATE)).toBe(0);
    expect(calcCost(HOUR, NaN)).toBe(0);
  });
});

describe('countedSeconds', () => {
  const t0 = Date.UTC(2026, 0, 1, 9, 0, 0);
  it('excludes paused time', () => {
    // 2h session with a 30 min pause → 1h30 counted
    const pauses = [{ start: t0 + 30 * MIN * 1000, end: t0 + 60 * MIN * 1000 }];
    expect(countedSeconds(t0, t0 + 2 * HOUR * 1000, pauses)).toBe(1.5 * HOUR);
    expect(calcCost(countedSeconds(t0, t0 + 2 * HOUR * 1000, pauses), RATE)).toBe(375);
  });
  it('handles multiple pauses', () => {
    const pauses = [
      { start: t0 + 10 * MIN * 1000, end: t0 + 20 * MIN * 1000 },
      { start: t0 + 40 * MIN * 1000, end: t0 + 45 * MIN * 1000 },
    ];
    expect(countedSeconds(t0, t0 + HOUR * 1000, pauses)).toBe(45 * MIN);
  });
  it('clips pauses outside the window and never goes negative', () => {
    const pauses = [{ start: t0 - HOUR * 1000, end: t0 + 3 * HOUR * 1000 }];
    expect(countedSeconds(t0, t0 + HOUR * 1000, pauses)).toBe(0);
    expect(countedSeconds(t0 + 1000, t0)).toBe(0);
  });
});

describe('timerElapsedSeconds (restore after app close / background)', () => {
  const start = Date.UTC(2026, 0, 1, 9, 0, 0);
  it('computes from wall-clock timestamps, independent of UI ticks', () => {
    const timer: ActiveTimer = { id: 'active', projectId: 'p', startedAt: start, status: 'running', pauses: [], hourlyRate: RATE };
    // app was closed for 3.5 hours; on reopen the elapsed time is still exact
    expect(timerElapsedSeconds(timer, start + 3.5 * HOUR * 1000)).toBe(3.5 * HOUR);
  });
  it('does not add time while paused', () => {
    const timer: ActiveTimer = {
      id: 'active',
      projectId: 'p',
      startedAt: start,
      status: 'paused',
      pauses: [],
      pausedAt: start + 20 * MIN * 1000,
      hourlyRate: RATE,
    };
    // 2 hours later, still paused → only 20 minutes counted
    expect(timerElapsedSeconds(timer, start + 2 * HOUR * 1000)).toBe(20 * MIN);
  });
  it('counts completed pauses plus the current pause', () => {
    const timer: ActiveTimer = {
      id: 'active',
      projectId: 'p',
      startedAt: start,
      status: 'paused',
      pauses: [{ start: start + 10 * MIN * 1000, end: start + 15 * MIN * 1000 }],
      pausedAt: start + 30 * MIN * 1000,
      hourlyRate: RATE,
    };
    expect(timerElapsedSeconds(timer, start + HOUR * 1000)).toBe(25 * MIN);
  });
});

describe('validateSessionTimes', () => {
  const t0 = Date.now() - HOUR * 1000;
  it('rejects negative or zero durations', () => {
    expect(validateSessionTimes(t0, t0)).not.toBeNull();
    expect(validateSessionTimes(t0, t0 - 1000)).not.toBeNull();
  });
  it('rejects future sessions and invalid numbers', () => {
    expect(validateSessionTimes(t0, Date.now() + HOUR * 1000)).not.toBeNull();
    expect(validateSessionTimes(NaN, t0)).not.toBeNull();
  });
  it('rejects sessions fully consumed by pauses', () => {
    expect(validateSessionTimes(t0, t0 + 1000, [{ start: t0, end: t0 + 1000 }])).not.toBeNull();
  });
  it('accepts a valid past session', () => {
    expect(validateSessionTimes(t0, t0 + 30 * MIN * 1000)).toBeNull();
  });
});

describe('calcPricing', () => {
  it('applies margin, extra costs and discount transparently', () => {
    const b = calcPricing({ timeCost: 875, marginPercent: 20, extraCosts: 100, discount: 50 });
    expect(b.marginAmount).toBe(175);
    expect(b.subtotal).toBe(1150);
    expect(b.suggestedPrice).toBe(1100);
    expect(b.differenceFromCost).toBe(225);
  });
  it('defaults to time cost when no adjustments', () => {
    expect(calcPricing({ timeCost: 375 }).suggestedPrice).toBe(375);
  });
  it('never goes below zero', () => {
    expect(calcPricing({ timeCost: 100, discount: 500 }).suggestedPrice).toBe(0);
  });
});
