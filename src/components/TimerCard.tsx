import { useEffect, useRef, useState } from 'react';
import { useActiveTimers, useNow, useSettings } from '../hooks';
import { t } from '../i18n';
import { calcCost, timerElapsedSeconds } from '../lib/calc';
import { formatClock, formatMoney, formatTime } from '../lib/format';
import { ActiveTimerExistsError, discardTimer, pauseTimer, resumeTimer, startTimer, stopTimer, updateTimerMeta } from '../services/timer';
import type { ActiveTimer, Project } from '../types';
import { PauseIcon, PlayIcon, StopIcon } from './Icons';
import { useConfirm } from './Modal';
import { useToast } from './Toast';
import { db } from '../db/db';

/**
 * Timer control for a project. `timer` is this project's own open timer (or null).
 * Elapsed time is always derived from persisted timestamps (timerElapsedSeconds) —
 * the 1s tick only refreshes the display.
 */
export function TimerCard({ project, timer }: { project: Project; timer: ActiveTimer | null }) {
  const toast = useToast();
  const confirm = useConfirm();
  const settings = useSettings();
  const mine = timer;
  const others = (useActiveTimers() ?? []).filter((x) => x.projectId !== project.id);
  const other = !settings.allowConcurrentTimers && others.length ? others[0] : null;
  const now = useNow(!!mine);
  const [note, setNote] = useState(mine?.note ?? '');
  const [taskType, setTaskType] = useState(mine?.taskType ?? '');
  const [busy, setBusy] = useState(false);

  // Sync local fields when a timer appears/disappears (e.g. restored after reopening the app)
  useEffect(() => {
    setNote(mine?.note ?? '');
    setTaskType(mine?.taskType ?? '');
  }, [mine?.startedAt, mine?.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsed = mine ? timerElapsedSeconds(mine, now) : 0;
  const liveCost = mine ? calcCost(elapsed, mine.hourlyRate) : 0;
  const status = mine ? mine.status : 'idle';

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'حدث خطأ غير متوقع');
    } finally {
      setBusy(false);
    }
  };

  const onStart = () =>
    run(async () => {
      try {
        await startTimer({ projectId: project.id, hourlyRate: project.hourlyRate, note: note || undefined, taskType: taskType || undefined });
        toast.success(t().timer.started);
      } catch (e) {
        if (e instanceof ActiveTimerExistsError) {
          const otherProject = await db.projects.get(e.timer.projectId);
          const ok = await confirm({
            title: t().timer.conflictTitle,
            message: (
              <>
                <p>
                  المؤقت الحالي يعمل على مشروع «{otherProject?.name ?? 'غير معروف'}» منذ {formatTime(e.timer.startedAt)}.
                </p>
                <p className="mt-8">{t().timer.conflictMessage}</p>
              </>
            ),
            confirmText: t().timer.conflictConfirm,
          });
          if (!ok) return;
          await stopTimer(e.timer.projectId);
          await startTimer({ projectId: project.id, hourlyRate: project.hourlyRate, note: note || undefined, taskType: taskType || undefined });
          toast.success('تم حفظ الجلسة السابقة وبدأ المؤقت');
        } else throw e;
      }
    });

  const onStop = () =>
    run(async () => {
      const s = await stopTimer(project.id, { note: note || undefined, taskType: taskType || undefined });
      if (s) toast.success(`${t().timer.saved}: ${formatClock(s.durationSeconds)} — ${formatMoney(s.cost)}`);
      else toast.info('الجلسة أقل من ثانية ولم تُحفظ');
      setNote('');
      setTaskType('');
    });

  const onDiscard = () =>
    run(async () => {
      const ok = await confirm({ title: 'إلغاء المؤقت دون حفظ؟', message: 'سيتم تجاهل الوقت المنقضي ولن تُسجل جلسة.', confirmText: 'إلغاء المؤقت', danger: true });
      if (!ok) return;
      await discardTimer(project.id);
      toast.info(t().timer.discarded);
    });

  const persistMeta = (patch: { note?: string; taskType?: string }) => {
    if (mine) void updateTimerMeta(project.id, patch);
  };
  // Persist the note shortly after typing stops so it survives closing the app mid-session.
  const noteTimer = useRef<number | undefined>(undefined);
  const onNoteChange = (v: string) => {
    setNote(v);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => persistMeta({ note: v || undefined }), 400);
  };

  return (
    <div className={`timer-card ${status}`}>
      <div className="timer-status">
        <span className={`dot ${status}`} aria-hidden />
        {status === 'running' ? t().timer.running : status === 'paused' ? t().timer.paused : t().timer.idle}
        {mine && <span className="muted"> · منذ {formatTime(mine.startedAt)}</span>}
      </div>
      <div className="timer-clock" aria-live="off">
        {formatClock(elapsed)}
      </div>
      <div className="timer-cost">{formatMoney(liveCost, { decimals: 2 })}</div>
      <div className="xs muted">
        سعر الساعة المعتمد: <span className="num">{mine ? mine.hourlyRate : project.hourlyRate}</span> {t().common.perHour}
      </div>

      {other && (
        <div className="card mt-12" style={{ borderColor: 'var(--warning)', textAlign: 'start' }}>
          <p className="small">
            <strong>تنبيه:</strong> يوجد مؤقت نشط لمشروع آخر. بدء هذا المشروع سيطلب منك إنهاء الجلسة الحالية أولًا (يمكنك السماح بمؤقتات متزامنة من الإعدادات).
          </p>
        </div>
      )}

      <div className="mt-12" style={{ textAlign: 'start' }}>
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor="timer-note">{t().timer.noteLabel}</label>
          <input id="timer-note" className="input" placeholder={t().timer.notePlaceholder} value={note} onChange={(e) => onNoteChange(e.target.value)} onBlur={() => persistMeta({ note: note || undefined })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>{t().timer.taskType}</label>
          <div className="chips">
            {settings.taskTypes.map((tt) => (
              <button
                key={tt}
                type="button"
                className={`chip ${taskType === tt ? 'active' : ''}`}
                onClick={() => {
                  const v = taskType === tt ? '' : tt;
                  setTaskType(v);
                  persistMeta({ taskType: v || undefined });
                }}
              >
                {tt}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="timer-actions">
        {!mine && (
          <button className="btn success lg span" onClick={onStart} disabled={busy}>
            <PlayIcon /> {t().timer.start}
          </button>
        )}
        {mine && mine.status === 'running' && (
          <button className="btn warning lg" onClick={() => run(() => pauseTimer(project.id))} disabled={busy}>
            <PauseIcon /> {t().timer.pause}
          </button>
        )}
        {mine && mine.status === 'paused' && (
          <button className="btn success lg" onClick={() => run(() => resumeTimer(project.id))} disabled={busy}>
            <PlayIcon /> {t().timer.resume}
          </button>
        )}
        {mine && (
          <button className="btn primary lg" onClick={onStop} disabled={busy}>
            <StopIcon /> {t().timer.stop}
          </button>
        )}
        {mine && (
          <button className="btn ghost sm span" onClick={onDiscard} disabled={busy}>
            {t().timer.discard}
          </button>
        )}
      </div>
    </div>
  );
}
