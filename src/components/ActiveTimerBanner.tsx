import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useActiveTimers, useNow, useProjects } from '../hooks';
import { timerElapsedSeconds } from '../lib/calc';
import { formatClock } from '../lib/format';
import { t } from '../i18n';
import { PauseIcon, PlayIcon } from './Icons';
import { pauseTimer, resumeTimer } from '../services/timer';

/**
 * Persistent banner shown on every page while timers are open.
 * One timer: shows it with a pause/resume control. Several: shows the count and
 * the total running clock; tapping opens the dashboard where each is listed.
 */
export function ActiveTimerBanner() {
  const timers = useActiveTimers() ?? [];
  const projects = useProjects({ includeArchived: true }) ?? [];
  const now = useNow(timers.length > 0);
  const loc = useLocation();
  const nav = useNavigate();
  const others = timers.filter((x) => loc.pathname !== `/projects/${x.projectId}`);
  const visible = others.length > 0 && loc.pathname !== '/';
  useEffect(() => {
    document.documentElement.toggleAttribute('data-banner', visible);
    return () => document.documentElement.removeAttribute('data-banner');
  }, [visible]);
  if (!visible) return null;

  if (others.length === 1) {
    const timer = others[0];
    const project = projects.find((p) => p.id === timer.projectId);
    const running = timer.status === 'running';
    return (
      <div className="active-banner no-print" role="status">
        <span className={`dot ${timer.status}`} aria-hidden />
        <button className="flex-1 col" style={{ background: 'none', border: 0, textAlign: 'start', padding: 0, cursor: 'pointer', color: 'inherit', gap: 0 }} onClick={() => nav(`/projects/${timer.projectId}`)}>
          <span className="xs" style={{ opacity: 0.8 }}>
            {running ? t().timer.running : t().timer.paused} · {project?.name ?? '…'}
          </span>
          <span className="clock">{formatClock(timerElapsedSeconds(timer, now))}</span>
        </button>
        <button className={`btn ${running ? 'warning' : 'success'}`} onClick={() => (running ? pauseTimer(timer.projectId) : resumeTimer(timer.projectId))} aria-label={running ? t().timer.pause : t().timer.resume}>
          {running ? <PauseIcon /> : <PlayIcon />}
          {running ? t().timer.pause : t().timer.resume}
        </button>
      </div>
    );
  }

  const running = others.filter((x) => x.status === 'running').length;
  return (
    <div className="active-banner no-print" role="status">
      <span className={`dot ${running ? 'running' : 'paused'}`} aria-hidden />
      <button className="flex-1 col" style={{ background: 'none', border: 0, textAlign: 'start', padding: 0, cursor: 'pointer', color: 'inherit', gap: 0 }} onClick={() => nav('/')}>
        <span className="xs" style={{ opacity: 0.8 }}>
          <span className="num">{others.length}</span> مؤقتات مفتوحة · <span className="num">{running}</span> تعمل الآن
        </span>
        <span className="clock">{formatClock(others.reduce((s, x) => s + timerElapsedSeconds(x, now), 0))}</span>
      </button>
      <button className="btn" onClick={() => nav('/')}>
        عرض الكل
      </button>
    </div>
  );
}
