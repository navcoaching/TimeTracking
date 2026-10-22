import type { ActiveTimer, PauseInterval } from '../types';

/** cost = seconds / 3600 * hourlyRate, rounded to 2 decimals (currency) */
export function calcCost(seconds: number, hourlyRate: number): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(hourlyRate)) return 0;
  if (seconds <= 0 || hourlyRate <= 0) return 0;
  return Math.round((seconds / 3600) * hourlyRate * 100) / 100;
}

export function totalPauseMs(pauses: PauseInterval[]): number {
  return pauses.reduce((sum, p) => sum + Math.max(0, p.end - p.start), 0);
}

/**
 * Counted (billable) seconds for a session: wall-clock span minus pauses.
 * Never negative. Pauses are clipped to the [start, end] window.
 */
export function countedSeconds(startedAt: number, endedAt: number, pauses: PauseInterval[] = []): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return 0;
  const clipped = pauses.map((p) => ({
    start: Math.max(p.start, startedAt),
    end: Math.min(p.end, endedAt),
  }));
  const ms = endedAt - startedAt - totalPauseMs(clipped);
  return Math.max(0, Math.floor(ms / 1000));
}

/**
 * Elapsed counted seconds for an active timer at a given moment (`now`).
 * Uses persisted wall-clock timestamps only — never a UI tick counter —
 * so it stays correct after the app is backgrounded, closed or the device restarts.
 */
export function timerElapsedSeconds(timer: ActiveTimer, now: number = Date.now()): number {
  const pauses: PauseInterval[] = [...timer.pauses];
  if (timer.status === 'paused' && timer.pausedAt !== undefined) {
    pauses.push({ start: timer.pausedAt, end: now });
  }
  return countedSeconds(timer.startedAt, now, pauses);
}

/** Validation of a manual/edited session. Returns an Arabic error message or null. */
export function validateSessionTimes(startedAt: number, endedAt: number, pauses: PauseInterval[] = []): string | null {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return 'التاريخ أو الوقت غير صحيح';
  if (endedAt <= startedAt) return 'وقت النهاية يجب أن يكون بعد وقت البداية';
  if (endedAt > Date.now() + 60_000) return 'لا يمكن تسجيل جلسة في المستقبل';
  for (const p of pauses) {
    if (p.end < p.start) return 'فترة توقف غير صحيحة';
  }
  if (countedSeconds(startedAt, endedAt, pauses) <= 0) return 'المدة المحتسبة يجب أن تكون أكبر من صفر';
  return null;
}

export interface PricingInput {
  timeCost: number;
  marginPercent?: number;
  extraCosts?: number;
  discount?: number;
}

export interface PricingBreakdown {
  timeCost: number;
  marginPercent: number;
  marginAmount: number;
  extraCosts: number;
  subtotal: number;
  discount: number;
  suggestedPrice: number;
  differenceFromCost: number;
}

/**
 * suggested = (timeCost + timeCost * margin%) + extraCosts - discount, floored at 0.
 */
export function calcPricing(input: PricingInput): PricingBreakdown {
  const timeCost = round2(Math.max(0, input.timeCost || 0));
  const marginPercent = Math.max(0, input.marginPercent || 0);
  const extraCosts = round2(Math.max(0, input.extraCosts || 0));
  const discount = round2(Math.max(0, input.discount || 0));
  const marginAmount = round2((timeCost * marginPercent) / 100);
  const subtotal = round2(timeCost + marginAmount + extraCosts);
  const suggestedPrice = round2(Math.max(0, subtotal - discount));
  return {
    timeCost,
    marginPercent,
    marginAmount,
    extraCosts,
    subtotal,
    discount,
    suggestedPrice,
    differenceFromCost: round2(suggestedPrice - timeCost),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
