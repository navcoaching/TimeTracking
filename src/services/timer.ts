import { db, uid, type WaqtiDB } from '../db/db';
import { calcCost, countedSeconds } from '../lib/calc';
import type { ActiveTimer, WorkSession } from '../types';

export class ActiveTimerExistsError extends Error {
  constructor(public readonly timer: ActiveTimer) {
    super('يوجد مؤقت نشط بالفعل');
    this.name = 'ActiveTimerExistsError';
  }
}

export async function getActiveTimer(database: WaqtiDB = db): Promise<ActiveTimer | undefined> {
  return database.activeTimer.get('active');
}

/**
 * Start a timer for a project. Fails with ActiveTimerExistsError when another
 * timer is already running/paused — the UI must stop or discard it first.
 */
export async function startTimer(
  input: { projectId: string; hourlyRate: number; note?: string; taskType?: string },
  database: WaqtiDB = db,
  now: number = Date.now(),
): Promise<ActiveTimer> {
  return database.transaction('rw', database.activeTimer, database.projects, async () => {
    const existing = await database.activeTimer.get('active');
    if (existing) throw new ActiveTimerExistsError(existing);
    const timer: ActiveTimer = {
      id: 'active',
      projectId: input.projectId,
      startedAt: now,
      status: 'running',
      pauses: [],
      note: input.note,
      taskType: input.taskType,
      hourlyRate: input.hourlyRate,
    };
    await database.activeTimer.put(timer);
    const project = await database.projects.get(input.projectId);
    if (project && project.status !== 'active') {
      await database.projects.update(project.id, { status: 'active', updatedAt: now });
    }
    return timer;
  });
}

export async function pauseTimer(database: WaqtiDB = db, now: number = Date.now()): Promise<ActiveTimer> {
  return database.transaction('rw', database.activeTimer, async () => {
    const t = await database.activeTimer.get('active');
    if (!t) throw new Error('لا يوجد مؤقت نشط');
    if (t.status === 'paused') return t;
    const next: ActiveTimer = { ...t, status: 'paused', pausedAt: now };
    await database.activeTimer.put(next);
    return next;
  });
}

export async function resumeTimer(database: WaqtiDB = db, now: number = Date.now()): Promise<ActiveTimer> {
  return database.transaction('rw', database.activeTimer, async () => {
    const t = await database.activeTimer.get('active');
    if (!t) throw new Error('لا يوجد مؤقت نشط');
    if (t.status === 'running' || t.pausedAt === undefined) return t;
    const next: ActiveTimer = {
      ...t,
      status: 'running',
      pauses: [...t.pauses, { start: t.pausedAt, end: Math.max(t.pausedAt, now) }],
      pausedAt: undefined,
    };
    await database.activeTimer.put(next);
    return next;
  });
}

export async function updateTimerMeta(
  patch: { note?: string; taskType?: string },
  database: WaqtiDB = db,
): Promise<void> {
  // `update` is atomic — concurrent note/taskType writes cannot clobber each other.
  await database.activeTimer.update('active', patch);
}

/**
 * Stop the active timer and persist it as a WorkSession.
 * Duration is computed from the stored wall-clock timestamps, never from a UI tick.
 */
export async function stopTimer(
  patch: { note?: string; taskType?: string } = {},
  database: WaqtiDB = db,
  now: number = Date.now(),
): Promise<WorkSession | null> {
  return database.transaction('rw', database.activeTimer, database.sessions, async () => {
    const t = await database.activeTimer.get('active');
    if (!t) return null;
    const pauses = [...t.pauses];
    if (t.status === 'paused' && t.pausedAt !== undefined) {
      pauses.push({ start: t.pausedAt, end: Math.max(t.pausedAt, now) });
    }
    const endedAt = Math.max(now, t.startedAt);
    const durationSeconds = countedSeconds(t.startedAt, endedAt, pauses);
    const session: WorkSession = {
      id: uid(),
      projectId: t.projectId,
      startedAt: t.startedAt,
      endedAt,
      pauses,
      durationSeconds,
      hourlyRate: t.hourlyRate,
      cost: calcCost(durationSeconds, t.hourlyRate),
      note: patch.note ?? t.note,
      taskType: patch.taskType ?? t.taskType,
      source: 'timer',
      manuallyEdited: false,
      createdAt: now,
      updatedAt: now,
    };
    await database.activeTimer.delete('active');
    // Sessions shorter than one counted second are dropped (nothing to bill).
    if (durationSeconds <= 0) return null;
    await database.sessions.put(session);
    return session;
  });
}

export async function discardTimer(database: WaqtiDB = db): Promise<void> {
  await database.activeTimer.delete('active');
}
