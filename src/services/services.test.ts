import { beforeEach, describe, expect, it } from 'vitest';
import { WaqtiDB, getSettings, saveSettings } from '../db/db';
import { ActiveTimerExistsError, getActiveTimer, pauseTimer, resumeTimer, startTimer, stopTimer } from './timer';
import { createProject, updateProject, deleteProject } from './projects';
import { addManualSession, updateSession } from './sessions';
import { exportBackup, importBackup, validateBackup, sessionsToCsv } from './backup';
import { byDay, byTaskType, periodSummary, projectStats } from './stats';

const MIN = 60_000;
const HOUR = 3_600_000;

let db: WaqtiDB;
let counter = 0;

beforeEach(async () => {
  db = new WaqtiDB(`test-db-${++counter}`);
  await db.open();
});

async function newProject(rate = 250) {
  return createProject({ name: 'مشروع تجريبي', startDate: '2026-01-01', status: 'new', hourlyRate: rate }, db);
}

describe('timer service', () => {
  it('start → pause → resume → stop records a session excluding paused time', async () => {
    const p = await newProject();
    const t0 = Date.UTC(2026, 0, 5, 9, 0, 0);
    await startTimer({ projectId: p.id, hourlyRate: p.hourlyRate }, db, t0);
    await pauseTimer(db, t0 + 30 * MIN);
    await resumeTimer(db, t0 + 60 * MIN); // 30 min paused
    const s = await stopTimer({ note: 'تصميم' }, db, t0 + 2 * HOUR);
    expect(s).not.toBeNull();
    expect(s!.durationSeconds).toBe(90 * 60);
    expect(s!.cost).toBe(375);
    expect(s!.pauses).toHaveLength(1);
    expect(s!.source).toBe('timer');
    expect(await getActiveTimer(db)).toBeUndefined();
    // project auto-moved to active
    expect((await db.projects.get(p.id))!.status).toBe('active');
  });

  it('stopping while paused does not count the open pause', async () => {
    const p = await newProject();
    const t0 = Date.UTC(2026, 0, 5, 9, 0, 0);
    await startTimer({ projectId: p.id, hourlyRate: 250 }, db, t0);
    await pauseTimer(db, t0 + 20 * MIN);
    const s = await stopTimer({}, db, t0 + 3 * HOUR);
    expect(s!.durationSeconds).toBe(20 * 60);
  });

  it('refuses to start a second timer app-wide', async () => {
    const a = await newProject();
    const b = await newProject();
    await startTimer({ projectId: a.id, hourlyRate: 250 }, db);
    await expect(startTimer({ projectId: b.id, hourlyRate: 250 }, db)).rejects.toBeInstanceOf(ActiveTimerExistsError);
    const t = await getActiveTimer(db);
    expect(t!.projectId).toBe(a.id);
  });

  it('restores a running timer from the database after an app restart', async () => {
    const p = await newProject();
    const t0 = Date.UTC(2026, 0, 5, 9, 0, 0);
    await startTimer({ projectId: p.id, hourlyRate: 250 }, db, t0);
    // simulate the app being closed: open a fresh connection to the same database
    db.close();
    const reopened = new WaqtiDB(db.name);
    await reopened.open();
    const t = await getActiveTimer(reopened);
    expect(t).toBeDefined();
    expect(t!.startedAt).toBe(t0);
    const s = await stopTimer({}, reopened, t0 + 3.5 * HOUR);
    expect(s!.durationSeconds).toBe(3.5 * 3600);
    expect(s!.cost).toBe(875);
  });

  it('locks the rate at start time (later rate changes do not affect it)', async () => {
    const p = await newProject(250);
    const t0 = Date.UTC(2026, 0, 5, 9, 0, 0);
    await startTimer({ projectId: p.id, hourlyRate: p.hourlyRate }, db, t0);
    await updateProject(p.id, { hourlyRate: 400 }, {}, db);
    const s = await stopTimer({}, db, t0 + HOUR);
    expect(s!.hourlyRate).toBe(250);
    expect(s!.cost).toBe(250);
  });
});

describe('sessions service', () => {
  it('adds a manual session and rejects invalid ranges', async () => {
    const p = await newProject();
    const end = Date.now() - HOUR;
    const s = await addManualSession({ projectId: p.id, startedAt: end - 30 * MIN, endedAt: end, hourlyRate: 250 }, db);
    expect(s.durationSeconds).toBe(1800);
    expect(s.cost).toBe(125);
    expect(s.source).toBe('manual');
    await expect(addManualSession({ projectId: p.id, startedAt: end, endedAt: end - 1000, hourlyRate: 250 }, db)).rejects.toThrow();
    await expect(addManualSession({ projectId: p.id, startedAt: end, endedAt: end, hourlyRate: 250 }, db)).rejects.toThrow();
  });

  it('editing a session recomputes its cost and flags it as manually edited', async () => {
    const p = await newProject();
    const end = Date.now() - HOUR;
    const s = await addManualSession({ projectId: p.id, startedAt: end - HOUR, endedAt: end, hourlyRate: 250 }, db);
    expect(s.cost).toBe(250);
    const edited = await updateSession(s.id, { endedAt: end + 30 * MIN }, db);
    expect(edited.durationSeconds).toBe(5400);
    expect(edited.cost).toBe(375);
    expect(edited.manuallyEdited).toBe(true);
  });
});

describe('rates', () => {
  it('changing the default rate does not touch old sessions or existing projects', async () => {
    const p = await newProject(250);
    const end = Date.now() - HOUR;
    const s = await addManualSession({ projectId: p.id, startedAt: end - HOUR, endedAt: end, hourlyRate: 250 }, db);
    await saveSettings({ defaultHourlyRate: 300 }, db);
    expect((await getSettings(db)).defaultHourlyRate).toBe(300);
    expect((await db.sessions.get(s.id))!.cost).toBe(250);
    expect((await db.projects.get(p.id))!.hourlyRate).toBe(250);
  });

  it('changing a project rate applies to new sessions only unless recalculation is requested', async () => {
    const p = await newProject(250);
    const end = Date.now() - HOUR;
    const old = await addManualSession({ projectId: p.id, startedAt: end - HOUR, endedAt: end, hourlyRate: 250 }, db);
    const updated = await updateProject(p.id, { hourlyRate: 400 }, {}, db);
    expect((await db.sessions.get(old.id))!.cost).toBe(250);
    const fresh = await addManualSession({ projectId: p.id, startedAt: end, endedAt: end + 30 * MIN, hourlyRate: updated.hourlyRate }, db);
    expect(fresh.cost).toBe(200);
    // explicit recalculation
    await updateProject(p.id, { hourlyRate: 500 }, { recalculateHistory: true }, db);
    expect((await db.sessions.get(old.id))!.cost).toBe(500);
    expect((await db.sessions.get(fresh.id))!.cost).toBe(250);
  });
});

describe('persistence & backup', () => {
  it('data survives reopening the database (page refresh)', async () => {
    const p = await newProject();
    const end = Date.now() - HOUR;
    await addManualSession({ projectId: p.id, startedAt: end - HOUR, endedAt: end, hourlyRate: 250 }, db);
    db.close();
    const reopened = new WaqtiDB(db.name);
    expect(await reopened.projects.count()).toBe(1);
    expect(await reopened.sessions.count()).toBe(1);
  });

  it('exports and imports a backup round-trip (replace mode)', async () => {
    const p = await newProject();
    const end = Date.now() - HOUR;
    await addManualSession({ projectId: p.id, startedAt: end - HOUR, endedAt: end, hourlyRate: 250, note: 'اجتماع' }, db);
    await saveSettings({ defaultHourlyRate: 275 }, db);
    const backup = await exportBackup(db);
    const json = JSON.parse(JSON.stringify(backup));

    const target = new WaqtiDB(`test-import-${counter}`);
    await createProject({ name: 'سيُحذف', startDate: '2026-01-01', status: 'new', hourlyRate: 1 }, target);
    const v = validateBackup(json);
    expect(v.ok).toBe(true);
    await importBackup(v.data!, 'replace', target);
    const projects = await target.projects.toArray();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('مشروع تجريبي');
    expect(await target.sessions.count()).toBe(1);
    expect((await getSettings(target)).defaultHourlyRate).toBe(275);
  });

  it('merge mode keeps existing data', async () => {
    const p = await newProject();
    const backup = await exportBackup(db);
    const target = new WaqtiDB(`test-merge-${counter}`);
    await createProject({ name: 'موجود', startDate: '2026-01-01', status: 'new', hourlyRate: 250 }, target);
    await importBackup(validateBackup(JSON.parse(JSON.stringify(backup))).data!, 'merge', target);
    expect(await target.projects.count()).toBe(2);
    expect(await target.projects.get(p.id)).toBeDefined();
  });

  it('rejects corrupt or foreign files and drops broken records', () => {
    expect(validateBackup('nope').ok).toBe(false);
    expect(validateBackup({ app: 'other', schemaVersion: 1, projects: [], sessions: [] }).ok).toBe(false);
    expect(validateBackup({ app: 'waqti', schemaVersion: 99, projects: [], sessions: [] }).ok).toBe(false);
    const v = validateBackup({
      app: 'waqti',
      schemaVersion: 1,
      projects: [{ id: 'a', name: 'ok' }, { name: 'no id' }],
      sessions: [
        { id: 's1', projectId: 'a', startedAt: 1000, endedAt: 1000 + HOUR, hourlyRate: 250, cost: -999 },
        { id: 's2', projectId: 'missing', startedAt: 1000, endedAt: 2000 },
        { id: 's3', projectId: 'a', startedAt: 5000, endedAt: 1000 },
      ],
    });
    expect(v.ok).toBe(true);
    expect(v.data!.projects).toHaveLength(1);
    expect(v.data!.sessions).toHaveLength(1);
    // corrupted cost is recomputed from timestamps
    expect(v.data!.sessions[0].cost).toBe(250);
    expect(v.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('handles an unfinished (active) timer inside a backup', () => {
    const v = validateBackup({
      app: 'waqti',
      schemaVersion: 1,
      projects: [{ id: 'a', name: 'ok' }],
      sessions: [],
      activeTimer: { projectId: 'a', startedAt: 1000, status: 'paused' },
    });
    expect(v.ok).toBe(true);
    expect(v.data!.activeTimer!.status).toBe('paused');
    expect(v.data!.activeTimer!.pausedAt).toBeDefined();
  });

  it('produces Excel-friendly CSV with BOM', async () => {
    const p = await newProject();
    const end = Date.now() - HOUR;
    await addManualSession({ projectId: p.id, startedAt: end - HOUR, endedAt: end, hourlyRate: 250, note: 'فيه, فاصلة' }, db);
    const csv = sessionsToCsv(await db.sessions.toArray(), await db.projects.toArray());
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"فيه, فاصلة"');
    expect(csv).toContain('250.00');
  });
});

describe('stats', () => {
  it('aggregates project totals, averages and distributions', async () => {
    const p = await newProject();
    const base = new Date(2026, 0, 5, 9, 0, 0).getTime();
    await addManualSession({ projectId: p.id, startedAt: base, endedAt: base + HOUR, hourlyRate: 250, taskType: 'تصميم' }, db);
    await addManualSession({ projectId: p.id, startedAt: base + 2 * HOUR, endedAt: base + 2.5 * HOUR, hourlyRate: 250, taskType: 'برمجة' }, db);
    const sessions = await db.sessions.toArray();
    const st = projectStats(sessions);
    expect(st.totalSeconds).toBe(5400);
    expect(st.totalCost).toBe(375);
    expect(st.avgSessionSeconds).toBe(2700);
    const days = byDay(sessions);
    expect(days).toHaveLength(1);
    expect(days[0].seconds).toBe(5400);
    const types = byTaskType(sessions);
    expect(types[0].type).toBe('تصميم');
    const summary = periodSummary(sessions, base + 3 * HOUR);
    expect(summary.today).toBe(5400);
  });

  it('deleting a project removes its sessions', async () => {
    const p = await newProject();
    const end = Date.now() - HOUR;
    await addManualSession({ projectId: p.id, startedAt: end - HOUR, endedAt: end, hourlyRate: 250 }, db);
    await deleteProject(p.id, db);
    expect(await db.sessions.count()).toBe(0);
  });
});
