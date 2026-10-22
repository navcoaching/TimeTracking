import { dateKey } from '../lib/format';
import type { Project, WorkSession } from '../types';

export interface ProjectStats {
  totalSeconds: number;
  totalCost: number;
  sessionCount: number;
  avgSessionSeconds: number;
  lastWorkedAt?: number;
}

export function projectStats(sessions: WorkSession[]): ProjectStats {
  const totalSeconds = sessions.reduce((s, x) => s + x.durationSeconds, 0);
  const totalCost = Math.round(sessions.reduce((s, x) => s + x.cost, 0) * 100) / 100;
  const sessionCount = sessions.length;
  return {
    totalSeconds,
    totalCost,
    sessionCount,
    avgSessionSeconds: sessionCount ? Math.round(totalSeconds / sessionCount) : 0,
    lastWorkedAt: sessions.length ? Math.max(...sessions.map((s) => s.endedAt)) : undefined,
  };
}

export function groupByProject(sessions: WorkSession[]): Map<string, WorkSession[]> {
  const m = new Map<string, WorkSession[]>();
  for (const s of sessions) {
    const arr = m.get(s.projectId) ?? [];
    arr.push(s);
    m.set(s.projectId, arr);
  }
  return m;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Week starts on Sunday (Saudi work week starts Sunday). */
export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

export function startOfMonth(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/** Seconds of a session that fall within [from, to) — proportional split of pauses is approximated by counted ratio. */
export function secondsWithin(s: WorkSession, from: number, to: number): number {
  const a = Math.max(s.startedAt, from);
  const b = Math.min(s.endedAt, to);
  if (b <= a) return 0;
  const span = s.endedAt - s.startedAt;
  if (span <= 0) return 0;
  // counted ratio: billable seconds / wall span
  const ratio = (s.durationSeconds * 1000) / span;
  return Math.round(((b - a) * ratio) / 1000);
}

export interface PeriodSummary {
  today: number;
  week: number;
  month: number;
}

export function periodSummary(sessions: WorkSession[], now = Date.now()): PeriodSummary {
  const dayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const far = now + 365 * 24 * 3600 * 1000;
  let today = 0,
    week = 0,
    month = 0;
  for (const s of sessions) {
    today += secondsWithin(s, dayStart, far);
    week += secondsWithin(s, weekStart, far);
    month += secondsWithin(s, monthStart, far);
  }
  return { today, week, month };
}

export interface DayBucket {
  key: string; // YYYY-MM-DD
  seconds: number;
  cost: number;
}

/** Distribution of time per local day (sessions crossing midnight are split). */
export function byDay(sessions: WorkSession[]): DayBucket[] {
  const m = new Map<string, DayBucket>();
  for (const s of sessions) {
    let cursor = s.startedAt;
    while (cursor < s.endedAt) {
      const dayStart = startOfDay(cursor);
      const nextDay = dayStart + 24 * 3600 * 1000;
      const sec = secondsWithin(s, dayStart, nextDay);
      if (sec > 0) {
        const key = dateKey(dayStart);
        const b = m.get(key) ?? { key, seconds: 0, cost: 0 };
        b.seconds += sec;
        b.cost = Math.round((b.cost + (sec / 3600) * s.hourlyRate) * 100) / 100;
        m.set(key, b);
      }
      cursor = nextDay;
    }
  }
  return [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export interface TypeBucket {
  type: string;
  seconds: number;
  cost: number;
  count: number;
}

export function byTaskType(sessions: WorkSession[]): TypeBucket[] {
  const m = new Map<string, TypeBucket>();
  for (const s of sessions) {
    const type = s.taskType?.trim() || 'غير مصنف';
    const b = m.get(type) ?? { type, seconds: 0, cost: 0, count: 0 };
    b.seconds += s.durationSeconds;
    b.cost = Math.round((b.cost + s.cost) * 100) / 100;
    b.count += 1;
    m.set(type, b);
  }
  return [...m.values()].sort((a, b) => b.seconds - a.seconds);
}

/** Last 7 local days (oldest → newest) for the dashboard chart */
export function last7Days(sessions: WorkSession[], now = Date.now()): DayBucket[] {
  const all = new Map(byDay(sessions).map((b) => [b.key, b]));
  const out: DayBucket[] = [];
  for (let i = 6; i >= 0; i--) {
    const ts = startOfDay(now) - i * 24 * 3600 * 1000;
    const key = dateKey(ts);
    out.push(all.get(key) ?? { key, seconds: 0, cost: 0 });
  }
  return out;
}

export function recentProjects(projects: Project[], sessions: WorkSession[], limit = 5): Project[] {
  const last = new Map<string, number>();
  for (const s of sessions) last.set(s.projectId, Math.max(last.get(s.projectId) ?? 0, s.endedAt));
  return projects
    .filter((p) => !p.archived)
    .slice()
    .sort((a, b) => (last.get(b.id) ?? b.updatedAt) - (last.get(a.id) ?? a.updatedAt))
    .slice(0, limit);
}
