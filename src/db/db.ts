import Dexie, { type Table } from 'dexie';
import type { ActiveTimer, Project, Settings, WorkSession } from '../types';

export const DEFAULT_HOURLY_RATE = 250;
export const SCHEMA_VERSION = 1;

export const DEFAULT_TASK_TYPES = ['تصميم', 'برمجة', 'اجتماع', 'تعديلات', 'مراجعة', 'أخرى'];

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  defaultHourlyRate: DEFAULT_HOURLY_RATE,
  currency: 'SAR',
  theme: 'system',
  language: 'ar',
  taskTypes: DEFAULT_TASK_TYPES,
};

export class WaqtiDB extends Dexie {
  projects!: Table<Project, string>;
  sessions!: Table<WorkSession, string>;
  settings!: Table<Settings, string>;
  activeTimer!: Table<ActiveTimer, string>;

  constructor(name = 'waqti-db') {
    super(name);
    // Version 1 — initial schema.
    // Future schema changes: add `this.version(2).stores({...}).upgrade(tx => ...)` below;
    // Dexie applies migrations sequentially and never drops existing data on upgrade.
    this.version(SCHEMA_VERSION).stores({
      projects: 'id, name, status, archived, updatedAt, createdAt',
      sessions: 'id, projectId, startedAt, endedAt, [projectId+startedAt]',
      settings: 'id',
      activeTimer: 'id',
    });
  }
}

export const db = new WaqtiDB();

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getSettings(database: WaqtiDB = db): Promise<Settings> {
  const s = await database.settings.get('settings');
  if (s) return { ...DEFAULT_SETTINGS, ...s };
  await database.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Settings>, database: WaqtiDB = db): Promise<Settings> {
  const current = await getSettings(database);
  const next = { ...current, ...patch, id: 'settings' as const };
  await database.settings.put(next);
  return next;
}
