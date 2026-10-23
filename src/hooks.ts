import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_SETTINGS, db } from './db/db';
import type { ActiveTimer, Project, Settings, WorkSession } from './types';

/** Ticks every second while `enabled`, and re-syncs immediately when the tab becomes visible again. */
export function useNow(enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    const onVis = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [enabled]);
  return now;
}

export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get('settings'), []);
  return s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS;
}

export function useActiveTimer(): ActiveTimer | undefined | null {
  // undefined = loading, null = none
  const t = useLiveQuery(async () => (await db.activeTimer.get('active')) ?? null, []);
  return t;
}

export function useProjects(opts: { includeArchived?: boolean } = {}): Project[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.projects.orderBy('updatedAt').reverse().toArray();
    return opts.includeArchived ? all : all.filter((p) => !p.archived);
  }, [opts.includeArchived]);
}

export function useProject(id: string | undefined): Project | undefined | null {
  return useLiveQuery(async () => (id ? (await db.projects.get(id)) ?? null : null), [id]);
}

export function useAllSessions(): WorkSession[] | undefined {
  return useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().toArray(), []);
}

export function useProjectSessions(projectId: string | undefined): WorkSession[] | undefined {
  return useLiveQuery(
    async () => (projectId ? db.sessions.where('projectId').equals(projectId).reverse().sortBy('startedAt') : []),
    [projectId],
  );
}

/** Applies theme setting to <html data-theme> and keeps it in sync with the OS when 'system'. */
export function useApplyTheme(theme: Settings['theme']) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      const meta = document.querySelector('meta[name="theme-color"]:not([media])') as HTMLMetaElement | null;
      if (meta) meta.content = dark ? '#0a1628' : '#1d4ed8';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}
