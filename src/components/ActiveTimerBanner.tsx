import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useActiveTimer, useNow, useProject } from '../hooks';
import { timerElapsedSeconds } from '../lib/calc';
import { formatClock } from '../lib/format';
import { t } from '../i18n';
import { PauseIcon, PlayIcon } from './Icons';
import { pauseTimer, resumeTimer } from '../services/timer';

/** Persistent banner shown on every page while a timer is running/paused (except the project's own page). */
export function ActiveTimerBanner() {
  const timer = useActiveTimer();
  const project = useProject(timer?.projectId);
  const now = useNow(!!timer);
  const loc = useLocation();
  const nav = useNavigate();
  const visible = !!timer && loc.pathname !== `/projects/${timer.projectId}`;
  useEffect(() => {
    document.documentElement.toggleAttribute('data-banner', visible);
    return () => document.documentElement.removeAttribute('data-banner');
  }, [visible]);
  if (!timer || !visible) return null;
  const elapsed = timerElapsedSeconds(timer, now);
  const running = timer.status === 'running';
  return (
    <div className="active-banner no-print" role="status">
      <span className={`dot ${timer.status}`} aria-hidden />
      <button className="flex-1 col" style={{ background: 'none', border: 0, textAlign: 'start', padding: 0, cursor: 'pointer', color: 'inherit', gap: 0 }} onClick={() => nav(`/projects/${timer.projectId}`)}>
        <span className="xs" style={{ opacity: 0.8 }}>
          {running ? t().timer.running : t().timer.paused} · {project?.name ?? '…'}
        </span>
        <span className="clock">{formatClock(elapsed)}</span>
      </button>
      <button className={`btn ${running ? 'warning' : 'success'}`} onClick={() => (running ? pauseTimer() : resumeTimer())} aria-label={running ? t().timer.pause : t().timer.resume}>
        {running ? <PauseIcon /> : <PlayIcon />}
        {running ? t().timer.pause : t().timer.resume}
      </button>
    </div>
  );
}
