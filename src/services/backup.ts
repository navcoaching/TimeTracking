import { DEFAULT_SETTINGS, SCHEMA_VERSION, db, type WaqtiDB } from '../db/db';
import type { ActiveTimer, BackupFile, Project, ProjectStatus, Settings, WorkSession } from '../types';
import { normalizeSession } from './sessions';

const STATUSES: ProjectStatus[] = ['new', 'active', 'paused', 'completed'];

export async function exportBackup(database: WaqtiDB = db): Promise<BackupFile> {
  const [projects, sessions, settings, activeTimer] = await Promise.all([
    database.projects.toArray(),
    database.sessions.toArray(),
    database.settings.get('settings'),
    database.activeTimer.get('active'),
  ]);
  return {
    app: 'waqti',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    projects,
    sessions,
    settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
    activeTimer: activeTimer ?? null,
  };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  data?: BackupFile;
  stats?: { projects: number; sessions: number };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validates and sanitizes a backup payload (parsed JSON). Invalid records are
 * dropped with a warning; structural problems are hard errors.
 */
export function validateBackup(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['الملف ليس نسخة احتياطية صالحة (ليس كائن JSON)'], warnings };
  if (raw.app !== 'waqti') errors.push('الملف لا يبدو نسخة احتياطية من تطبيق «وقتي»');
  if (!isNum(raw.schemaVersion)) errors.push('رقم إصدار المخطط مفقود');
  else if (raw.schemaVersion > SCHEMA_VERSION) errors.push(`النسخة الاحتياطية من إصدار أحدث (${raw.schemaVersion}) من هذا التطبيق`);
  if (!Array.isArray(raw.projects)) errors.push('قائمة المشاريع مفقودة أو غير صحيحة');
  if (!Array.isArray(raw.sessions)) errors.push('قائمة الجلسات مفقودة أو غير صحيحة');
  if (errors.length) return { ok: false, errors, warnings };

  const projects: Project[] = [];
  const ids = new Set<string>();
  for (const p of raw.projects as unknown[]) {
    if (!isObj(p) || typeof p.id !== 'string' || typeof p.name !== 'string' || !p.name.trim()) {
      warnings.push('تم تجاوز مشروع بدون معرّف أو اسم صالح');
      continue;
    }
    if (ids.has(p.id)) {
      warnings.push(`مشروع مكرر تم تجاوزه: ${p.name}`);
      continue;
    }
    ids.add(p.id);
    const now = Date.now();
    projects.push({
      id: p.id,
      name: p.name,
      client: typeof p.client === 'string' ? p.client : undefined,
      description: typeof p.description === 'string' ? p.description : undefined,
      startDate: typeof p.startDate === 'string' ? p.startDate : new Date(now).toISOString().slice(0, 10),
      status: STATUSES.includes(p.status as ProjectStatus) ? (p.status as ProjectStatus) : 'new',
      hourlyRate: isNum(p.hourlyRate) && p.hourlyRate >= 0 ? p.hourlyRate : DEFAULT_SETTINGS.defaultHourlyRate,
      notes: typeof p.notes === 'string' ? p.notes : undefined,
      archived: p.archived === true,
      pricing: isObj(p.pricing)
        ? {
            marginPercent: isNum(p.pricing.marginPercent) ? p.pricing.marginPercent : 0,
            extraCosts: isNum(p.pricing.extraCosts) ? p.pricing.extraCosts : 0,
            discount: isNum(p.pricing.discount) ? p.pricing.discount : 0,
            finalPrice: isNum(p.pricing.finalPrice) ? p.pricing.finalPrice : undefined,
          }
        : { marginPercent: 0, extraCosts: 0, discount: 0 },
      createdAt: isNum(p.createdAt) ? p.createdAt : now,
      updatedAt: isNum(p.updatedAt) ? p.updatedAt : now,
    });
  }

  const sessions: WorkSession[] = [];
  const sids = new Set<string>();
  for (const s of raw.sessions as unknown[]) {
    if (!isObj(s) || typeof s.id !== 'string' || typeof s.projectId !== 'string') {
      warnings.push('تم تجاوز جلسة بدون معرّف صالح');
      continue;
    }
    if (!ids.has(s.projectId)) {
      warnings.push('تم تجاوز جلسة تشير إلى مشروع غير موجود');
      continue;
    }
    if (!isNum(s.startedAt) || !isNum(s.endedAt) || s.endedAt <= s.startedAt) {
      warnings.push('تم تجاوز جلسة ذات توقيت غير صالح');
      continue;
    }
    if (sids.has(s.id)) {
      warnings.push('جلسة مكررة تم تجاوزها');
      continue;
    }
    sids.add(s.id);
    const pauses = Array.isArray(s.pauses)
      ? (s.pauses as unknown[]).filter((p): p is { start: number; end: number } => isObj(p) && isNum(p.start) && isNum(p.end) && p.end >= p.start)
      : [];
    const now = Date.now();
    sessions.push(
      normalizeSession({
        id: s.id,
        projectId: s.projectId,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        pauses,
        durationSeconds: 0,
        hourlyRate: isNum(s.hourlyRate) ? s.hourlyRate : DEFAULT_SETTINGS.defaultHourlyRate,
        cost: 0,
        note: typeof s.note === 'string' ? s.note : undefined,
        taskType: typeof s.taskType === 'string' ? s.taskType : undefined,
        source: s.source === 'manual' ? 'manual' : 'timer',
        manuallyEdited: s.manuallyEdited === true,
        createdAt: isNum(s.createdAt) ? s.createdAt : now,
        updatedAt: isNum(s.updatedAt) ? s.updatedAt : now,
      }),
    );
  }

  const rs = isObj(raw.settings) ? raw.settings : {};
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    defaultHourlyRate: isNum(rs.defaultHourlyRate) && rs.defaultHourlyRate >= 0 ? rs.defaultHourlyRate : DEFAULT_SETTINGS.defaultHourlyRate,
    theme: rs.theme === 'light' || rs.theme === 'dark' ? rs.theme : 'system',
    taskTypes: Array.isArray(rs.taskTypes) ? (rs.taskTypes as unknown[]).filter((t): t is string => typeof t === 'string') : DEFAULT_SETTINGS.taskTypes,
  };

  let activeTimer: ActiveTimer | null = null;
  const rt = raw.activeTimer;
  if (isObj(rt) && typeof rt.projectId === 'string' && ids.has(rt.projectId) && isNum(rt.startedAt)) {
    activeTimer = {
      id: 'active',
      projectId: rt.projectId,
      startedAt: rt.startedAt,
      status: rt.status === 'paused' ? 'paused' : 'running',
      pauses: Array.isArray(rt.pauses) ? (rt.pauses as unknown[]).filter((p): p is { start: number; end: number } => isObj(p) && isNum(p.start) && isNum(p.end)) : [],
      pausedAt: isNum(rt.pausedAt) ? rt.pausedAt : undefined,
      note: typeof rt.note === 'string' ? rt.note : undefined,
      taskType: typeof rt.taskType === 'string' ? rt.taskType : undefined,
      hourlyRate: isNum(rt.hourlyRate) ? rt.hourlyRate : settings.defaultHourlyRate,
    };
    if (activeTimer.status === 'paused' && activeTimer.pausedAt === undefined) activeTimer.pausedAt = Date.now();
  } else if (rt != null) {
    warnings.push('تم تجاوز مؤقت نشط غير صالح في النسخة الاحتياطية');
  }

  return {
    ok: true,
    errors,
    warnings,
    data: {
      app: 'waqti',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
      projects,
      sessions,
      settings,
      activeTimer,
    },
    stats: { projects: projects.length, sessions: sessions.length },
  };
}

export type ImportMode = 'replace' | 'merge';

/**
 * Import a validated backup.
 * - replace: wipes current data and restores the backup exactly.
 * - merge: adds/overwrites records by id, keeps everything else; the current
 *   active timer is kept if one exists.
 */
export async function importBackup(data: BackupFile, mode: ImportMode, database: WaqtiDB = db): Promise<void> {
  await database.transaction('rw', database.projects, database.sessions, database.settings, database.activeTimer, async () => {
    if (mode === 'replace') {
      await Promise.all([database.projects.clear(), database.sessions.clear(), database.activeTimer.clear()]);
      await database.settings.put(data.settings);
      if (data.activeTimer) await database.activeTimer.put(data.activeTimer);
    } else {
      const current = await database.activeTimer.get('active');
      if (!current && data.activeTimer) await database.activeTimer.put(data.activeTimer);
    }
    await database.projects.bulkPut(data.projects);
    await database.sessions.bulkPut(data.sessions);
  });
}

export async function wipeAllData(database: WaqtiDB = db): Promise<void> {
  await database.transaction('rw', database.projects, database.sessions, database.settings, database.activeTimer, async () => {
    await Promise.all([database.projects.clear(), database.sessions.clear(), database.settings.clear(), database.activeTimer.clear()]);
  });
}

/** CSV (UTF-8 with BOM so Excel opens Arabic correctly) */
export function sessionsToCsv(sessions: WorkSession[], projects: Project[]): string {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const header = ['المشروع', 'العميل', 'التاريخ', 'وقت البداية', 'وقت النهاية', 'المدة (ساعات)', 'المدة (دقائق)', 'سعر الساعة', 'التكلفة (ر.س)', 'نوع المهمة', 'الملاحظات', 'المصدر', 'معدّلة يدويًا'];
  const rows = sessions
    .slice()
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => {
      const p = byId.get(s.projectId);
      const start = new Date(s.startedAt);
      const end = new Date(s.endedAt);
      return [
        p?.name ?? '—',
        p?.client ?? '',
        localDate(start),
        localTime(start),
        localTime(end),
        (s.durationSeconds / 3600).toFixed(2),
        Math.round(s.durationSeconds / 60),
        s.hourlyRate,
        s.cost.toFixed(2),
        s.taskType ?? '',
        s.note ?? '',
        s.source === 'manual' ? 'يدوي' : 'مؤقت',
        s.manuallyEdited ? 'نعم' : 'لا',
      ];
    });
  const esc = (v: unknown) => {
    const str = String(v ?? '');
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function localTime(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function backupFilename(prefix = 'waqti-backup', ext = 'json') {
  const d = new Date();
  return `${prefix}-${localDate(d)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.${ext}`;
}
