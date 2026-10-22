import { useMemo, useState } from 'react';
import { useProjects, useSettings } from '../hooks';
import { t } from '../i18n';
import { calcCost, countedSeconds, validateSessionTimes } from '../lib/calc';
import { formatDuration, formatMoney, fromLocalInputValue, toLocalInputValue } from '../lib/format';
import { addManualSession, updateSession } from '../services/sessions';
import type { Project, WorkSession } from '../types';
import { Sheet } from './Modal';
import { useToast } from './Toast';

type Mode = 'range' | 'duration';

/**
 * Create a manual session or edit an existing one.
 * Supports entering an explicit start/end or a start + duration (hours/minutes).
 */
export function SessionForm({
  session,
  project,
  onClose,
}: {
  session?: WorkSession;
  /** Fixed project (from the project page). When omitted a selector is shown. */
  project?: Project;
  onClose: () => void;
}) {
  const toast = useToast();
  const settings = useSettings();
  const projects = useProjects({ includeArchived: true }) ?? [];
  const initialEnd = session?.endedAt ?? Date.now();
  const initialStart = session?.startedAt ?? initialEnd - 3600_000;

  const [projectId, setProjectId] = useState(session?.projectId ?? project?.id ?? '');
  const [mode, setMode] = useState<Mode>('range');
  const [start, setStart] = useState(toLocalInputValue(initialStart));
  const [end, setEnd] = useState(toLocalInputValue(initialEnd));
  const [hours, setHours] = useState(String(Math.floor((initialEnd - initialStart) / 3600_000)));
  const [minutes, setMinutes] = useState(String(Math.round(((initialEnd - initialStart) % 3600_000) / 60_000)));
  const [note, setNote] = useState(session?.note ?? '');
  const [taskType, setTaskType] = useState(session?.taskType ?? '');
  const selectedProject = projects.find((p) => p.id === projectId) ?? project;
  const [rate, setRate] = useState<number>(session?.hourlyRate ?? selectedProject?.hourlyRate ?? settings.defaultHourlyRate);
  const [rateTouched, setRateTouched] = useState(!!session);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const computed = useMemo(() => {
    const s = fromLocalInputValue(start);
    let e: number;
    if (mode === 'range') e = fromLocalInputValue(end);
    else e = s + (parseInt(hours || '0', 10) * 3600 + parseInt(minutes || '0', 10) * 60) * 1000;
    const pauses = session?.pauses ?? [];
    const v = validateSessionTimes(s, e, pauses);
    const secs = v ? 0 : countedSeconds(s, e, pauses);
    return { s, e, v, secs, cost: calcCost(secs, rate) };
  }, [start, end, hours, minutes, mode, rate, session]);

  const effectiveRate = rateTouched ? rate : selectedProject?.hourlyRate ?? rate;

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!projectId) return setErr('اختر المشروع');
    if (computed.v) return setErr(computed.v);
    if (!Number.isFinite(effectiveRate) || effectiveRate < 0) return setErr('سعر الساعة غير صحيح');
    setBusy(true);
    try {
      if (session) {
        await updateSession(session.id, { projectId, startedAt: computed.s, endedAt: computed.e, note, taskType: taskType || undefined, hourlyRate: effectiveRate });
        toast.success('تم تعديل الجلسة وإعادة احتساب تكلفتها');
      } else {
        await addManualSession({ projectId, startedAt: computed.s, endedAt: computed.e, hourlyRate: effectiveRate, note, taskType: taskType || undefined });
        toast.success('تم تسجيل الجلسة');
      }
      onClose();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={session ? 'تعديل الجلسة' : 'تسجيل جلسة يدويًا'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {!project && (
          <div className="field">
            <label htmlFor="s-project">المشروع</label>
            <select
              id="s-project"
              className="select"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                if (!rateTouched) {
                  const p = projects.find((x) => x.id === e.target.value);
                  if (p) setRate(p.hourlyRate);
                }
              }}
            >
              <option value="">— اختر —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archived ? ' (مؤرشف)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {session?.pauses?.length ? (
          <p className="help" style={{ marginBottom: 10 }}>
            تحتوي هذه الجلسة على {session.pauses.length} فترة توقف مؤقت تُستثنى من المدة تلقائيًا.
          </p>
        ) : null}
        <div className="field">
          <label>طريقة الإدخال</label>
          <div className="segmented">
            <button type="button" className={mode === 'range' ? 'active' : ''} onClick={() => setMode('range')}>
              بداية ونهاية
            </button>
            <button type="button" className={mode === 'duration' ? 'active' : ''} onClick={() => setMode('duration')}>
              بداية ومدة
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="s-start">وقت البداية</label>
          <input id="s-start" type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        {mode === 'range' ? (
          <div className="field">
            <label htmlFor="s-end">وقت النهاية</label>
            <input id="s-end" type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        ) : (
          <div className="grid-2">
            <div className="field">
              <label htmlFor="s-h">ساعات</label>
              <input id="s-h" type="number" inputMode="numeric" min={0} className="input" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="s-m">دقائق</label>
              <input id="s-m" type="number" inputMode="numeric" min={0} max={59} className="input" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
          </div>
        )}
        <div className="field">
          <label htmlFor="s-rate">سعر الساعة المعتمد للجلسة ({t().common.currency})</label>
          <input
            id="s-rate"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="input"
            value={effectiveRate}
            onChange={(e) => {
              setRateTouched(true);
              setRate(parseFloat(e.target.value));
            }}
          />
        </div>
        <div className="field">
          <label>{t().timer.taskType}</label>
          <div className="chips">
            {settings.taskTypes.map((tt) => (
              <button key={tt} type="button" className={`chip ${taskType === tt ? 'active' : ''}`} onClick={() => setTaskType(taskType === tt ? '' : tt)}>
                {tt}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="s-note">الملاحظات</label>
          <input id="s-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t().timer.notePlaceholder} />
        </div>

        <div className="card" style={{ padding: 12, marginBottom: 14 }}>
          <div className="kv">
            <span className="k">المدة المحتسبة</span>
            <span className="v">{computed.v ? '—' : formatDuration(computed.secs)}</span>
          </div>
          <div className="kv total">
            <span className="k">التكلفة</span>
            <span className="v">{computed.v ? '—' : formatMoney(calcCost(computed.secs, effectiveRate), { decimals: 2 })}</span>
          </div>
        </div>
        {(err || computed.v) && (
          <p className="error" role="alert">
            {err ?? computed.v}
          </p>
        )}
        {session && <p className="help">سيتم وسم الجلسة بأنها «معدّلة يدويًا».</p>}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t().common.cancel}
          </button>
          <button type="submit" className="btn primary" disabled={busy || !!computed.v}>
            {t().common.save}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
