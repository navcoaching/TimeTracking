import { db, getSettings, uid, type WaqtiDB } from '../db/db';
import { calcCost } from '../lib/calc';
import type { Project, ProjectStatus } from '../types';

export interface ProjectInput {
  name: string;
  client?: string;
  description?: string;
  startDate: string;
  status: ProjectStatus;
  hourlyRate: number;
  notes?: string;
}

export function validateProjectInput(input: ProjectInput): string | null {
  if (!input.name || !input.name.trim()) return 'اسم المشروع مطلوب';
  if (!Number.isFinite(input.hourlyRate) || input.hourlyRate < 0) return 'سعر الساعة غير صحيح';
  if (!input.startDate) return 'تاريخ البدء مطلوب';
  return null;
}

export async function createProject(input: ProjectInput, database: WaqtiDB = db): Promise<Project> {
  const err = validateProjectInput(input);
  if (err) throw new Error(err);
  const now = Date.now();
  const project: Project = {
    id: uid(),
    name: input.name.trim(),
    client: input.client?.trim() || undefined,
    description: input.description?.trim() || undefined,
    startDate: input.startDate,
    status: input.status,
    hourlyRate: input.hourlyRate,
    notes: input.notes?.trim() || undefined,
    archived: false,
    pricing: { marginPercent: 0, extraCosts: 0, discount: 0 },
    createdAt: now,
    updatedAt: now,
  };
  await database.projects.put(project);
  return project;
}

/**
 * Update a project. A rate change applies to NEW sessions only, unless
 * `recalculateHistory` is true, in which case existing sessions are re-costed.
 */
export async function updateProject(
  id: string,
  patch: Partial<Omit<Project, 'id' | 'createdAt'>>,
  opts: { recalculateHistory?: boolean } = {},
  database: WaqtiDB = db,
): Promise<Project> {
  return database.transaction('rw', database.projects, database.sessions, async () => {
    const existing = await database.projects.get(id);
    if (!existing) throw new Error('المشروع غير موجود');
    const next: Project = { ...existing, ...patch, id, updatedAt: Date.now() };
    if (patch.name !== undefined && !patch.name.trim()) throw new Error('اسم المشروع مطلوب');
    if (patch.hourlyRate !== undefined && (!Number.isFinite(patch.hourlyRate) || patch.hourlyRate < 0)) {
      throw new Error('سعر الساعة غير صحيح');
    }
    await database.projects.put(next);
    if (opts.recalculateHistory && patch.hourlyRate !== undefined && patch.hourlyRate !== existing.hourlyRate) {
      const sessions = await database.sessions.where('projectId').equals(id).toArray();
      const now = Date.now();
      await database.sessions.bulkPut(
        sessions.map((s) => ({
          ...s,
          hourlyRate: next.hourlyRate,
          cost: calcCost(s.durationSeconds, next.hourlyRate),
          updatedAt: now,
        })),
      );
    }
    return next;
  });
}

export async function setArchived(id: string, archived: boolean, database: WaqtiDB = db): Promise<void> {
  await database.projects.update(id, { archived, updatedAt: Date.now() });
}

/** Deletes a project with all of its sessions (and its active timer if any). */
export async function deleteProject(id: string, database: WaqtiDB = db): Promise<void> {
  await database.transaction('rw', database.projects, database.sessions, database.activeTimer, async () => {
    const t = await database.activeTimer.get('active');
    if (t?.projectId === id) await database.activeTimer.delete('active');
    await database.sessions.where('projectId').equals(id).delete();
    await database.projects.delete(id);
  });
}

export async function defaultProjectInput(database: WaqtiDB = db): Promise<ProjectInput> {
  const settings = await getSettings(database);
  const d = new Date();
  const startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { name: '', client: '', description: '', startDate, status: 'new', hourlyRate: settings.defaultHourlyRate, notes: '' };
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  new: 'جديد',
  active: 'قيد التنفيذ',
  paused: 'متوقف مؤقتًا',
  completed: 'مكتمل',
};
