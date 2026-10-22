import Dexie, { type Table } from 'dexie';
import dexieCloud from 'dexie-cloud-addon';
import type { ActiveTimer, Project, Settings, WorkSession } from '../types';

export const DEFAULT_HOURLY_RATE = 250;
export const SCHEMA_VERSION = 2;

export const DEFAULT_TASK_TYPES = ['تصميم', 'برمجة', 'اجتماع', 'تعديلات', 'مراجعة', 'أخرى'];

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  defaultHourlyRate: DEFAULT_HOURLY_RATE,
  currency: 'SAR',
  theme: 'system',
  language: 'ar',
  taskTypes: DEFAULT_TASK_TYPES,
};

/**
 * Optional cloud sync (Dexie Cloud). When VITE_DEXIE_CLOUD_URL is not set the
 * app is 100% local — exactly as before. When set, the same local database is
 * synced to the cloud after the user signs in (email + one-time code).
 */
export const CLOUD_URL: string = (import.meta.env?.VITE_DEXIE_CLOUD_URL as string | undefined)?.trim() ?? '';
export const CLOUD_ENABLED = CLOUD_URL.length > 0;

const STORES = {
  projects: 'id, name, status, archived, updatedAt, createdAt',
  sessions: 'id, projectId, startedAt, endedAt, [projectId+startedAt]',
  settings: 'id',
  activeTimer: 'id',
};

export class WaqtiDB extends Dexie {
  projects!: Table<Project, string>;
  sessions!: Table<WorkSession, string>;
  settings!: Table<Settings, string>;
  activeTimer!: Table<ActiveTimer, string>;

  constructor(name = 'waqti-db', opts: { cloud?: boolean } = {}) {
    super(name, opts.cloud ? { addons: [dexieCloud] } : {});
    // Version 1 — initial schema.
    this.version(1).stores(STORES);
    // Version 2 — same user tables; when the cloud addon is active it appends its own
    // bookkeeping tables ($syncState, realms, members …) to this version.
    // Dexie applies migrations sequentially and never drops existing data on upgrade.
    this.version(SCHEMA_VERSION).stores(STORES);

    if (opts.cloud && CLOUD_URL) {
      this.cloud.configure({
        databaseUrl: CLOUD_URL,
        requireAuth: false, // app keeps working locally; user signs in from Settings
        customLoginGui: true, // Arabic login UI rendered by <CloudInteraction/>
        nameSuffix: false, // keep using the existing local DB so prior data gets synced up
        tryUseServiceWorker: false,
        periodicSync: { minInterval: 60_000 },
      });
    }
  }
}

export const db = new WaqtiDB('waqti-db', { cloud: CLOUD_ENABLED });

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
