import { db, uid, type WaqtiDB } from '../db/db';
import { calcCost, countedSeconds, validateSessionTimes } from '../lib/calc';
import type { PauseInterval, WorkSession } from '../types';

export interface ManualSessionInput {
  projectId: string;
  startedAt: number;
  endedAt: number;
  hourlyRate: number;
  note?: string;
  taskType?: string;
  pauses?: PauseInterval[];
}

/** Record a session by hand (start/end timestamps or a duration converted by the UI). */
export async function addManualSession(input: ManualSessionInput, database: WaqtiDB = db): Promise<WorkSession> {
  const pauses = input.pauses ?? [];
  const err = validateSessionTimes(input.startedAt, input.endedAt, pauses);
  if (err) throw new Error(err);
  if (!Number.isFinite(input.hourlyRate) || input.hourlyRate < 0) throw new Error('سعر الساعة غير صحيح');
  const now = Date.now();
  const durationSeconds = countedSeconds(input.startedAt, input.endedAt, pauses);
  const session: WorkSession = {
    id: uid(),
    projectId: input.projectId,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    pauses,
    durationSeconds,
    hourlyRate: input.hourlyRate,
    cost: calcCost(durationSeconds, input.hourlyRate),
    note: input.note?.trim() || undefined,
    taskType: input.taskType || undefined,
    source: 'manual',
    manuallyEdited: false,
    createdAt: now,
    updatedAt: now,
  };
  await database.sessions.put(session);
  return session;
}

/**
 * Edit an existing session. Duration and cost are recomputed from the new
 * timestamps and the session is flagged `manuallyEdited`.
 */
export async function updateSession(
  id: string,
  patch: Partial<Pick<WorkSession, 'startedAt' | 'endedAt' | 'pauses' | 'note' | 'taskType' | 'hourlyRate' | 'projectId'>>,
  database: WaqtiDB = db,
): Promise<WorkSession> {
  const existing = await database.sessions.get(id);
  if (!existing) throw new Error('الجلسة غير موجودة');
  const merged = { ...existing, ...patch };
  const err = validateSessionTimes(merged.startedAt, merged.endedAt, merged.pauses);
  if (err) throw new Error(err);
  if (!Number.isFinite(merged.hourlyRate) || merged.hourlyRate < 0) throw new Error('سعر الساعة غير صحيح');
  const durationSeconds = countedSeconds(merged.startedAt, merged.endedAt, merged.pauses);
  const next: WorkSession = {
    ...merged,
    note: merged.note?.trim() || undefined,
    durationSeconds,
    cost: calcCost(durationSeconds, merged.hourlyRate),
    manuallyEdited: true,
    updatedAt: Date.now(),
  };
  await database.sessions.put(next);
  return next;
}

export async function deleteSession(id: string, database: WaqtiDB = db): Promise<void> {
  await database.sessions.delete(id);
}

/** Repairs a session whose stored cost/duration disagree with its timestamps (e.g. corrupted import). */
export function normalizeSession(s: WorkSession): WorkSession {
  const pauses = Array.isArray(s.pauses) ? s.pauses : [];
  const durationSeconds = countedSeconds(s.startedAt, s.endedAt, pauses);
  const hourlyRate = Number.isFinite(s.hourlyRate) && s.hourlyRate >= 0 ? s.hourlyRate : 0;
  return { ...s, pauses, durationSeconds, hourlyRate, cost: calcCost(durationSeconds, hourlyRate) };
}
