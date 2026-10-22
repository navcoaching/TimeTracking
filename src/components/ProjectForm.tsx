import { useEffect, useState } from 'react';
import { useSettings } from '../hooks';
import { t } from '../i18n';
import { STATUS_LABELS, createProject, updateProject, validateProjectInput, type ProjectInput } from '../services/projects';
import type { Project, ProjectStatus } from '../types';
import { Sheet } from './Modal';
import { useToast } from './Toast';
import { todayKey } from '../lib/format';

const STATUSES: ProjectStatus[] = ['new', 'active', 'paused', 'completed'];

export function ProjectForm({ project, onClose, onSaved }: { project?: Project; onClose: () => void; onSaved?: (p: Project) => void }) {
  const settings = useSettings();
  const toast = useToast();
  const [form, setForm] = useState<ProjectInput>({
    name: project?.name ?? '',
    client: project?.client ?? '',
    description: project?.description ?? '',
    startDate: project?.startDate ?? todayKey(),
    status: project?.status ?? 'new',
    hourlyRate: project?.hourlyRate ?? settings.defaultHourlyRate,
    notes: project?.notes ?? '',
  });
  const [recalc, setRecalc] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Pick up the default rate once settings load (new project only)
  useEffect(() => {
    if (!project) setForm((f) => ({ ...f, hourlyRate: settings.defaultHourlyRate }));
  }, [settings.defaultHourlyRate, project]);

  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const rateChanged = project && form.hourlyRate !== project.hourlyRate;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateProjectInput(form);
    if (v) return setErr(v);
    setBusy(true);
    try {
      let saved: Project;
      if (project) {
        saved = await updateProject(project.id, { ...form }, { recalculateHistory: rateChanged && recalc });
        toast.success('تم تحديث المشروع');
      } else {
        saved = await createProject(form);
        toast.success('تم إنشاء المشروع');
      }
      onSaved?.(saved);
      onClose();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={project ? 'تعديل المشروع' : 'مشروع جديد'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="p-name">اسم المشروع *</label>
          <input id="p-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus required />
        </div>
        <div className="field">
          <label htmlFor="p-client">اسم العميل ({t().common.optional})</label>
          <input id="p-client" className="input" value={form.client} onChange={(e) => set('client', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="p-desc">وصف المشروع ({t().common.optional})</label>
          <textarea id="p-desc" className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="p-date">تاريخ البدء</label>
            <input id="p-date" type="date" className="input" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="p-rate">سعر الساعة ({t().common.currency})</label>
            <input id="p-rate" type="number" inputMode="decimal" min={0} step="0.01" className="input" value={form.hourlyRate} onChange={(e) => set('hourlyRate', parseFloat(e.target.value))} />
          </div>
        </div>
        {rateChanged && (
          <div className="card" style={{ marginBottom: 14, padding: 12 }}>
            <p className="small">
              غيّرت سعر الساعة. افتراضيًا يُطبّق السعر الجديد على الجلسات <strong>الجديدة فقط</strong>، وتبقى الجلسات السابقة بسعرها المعتمد.
            </p>
            <label className="row mt-8" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={recalc} onChange={(e) => setRecalc(e.target.checked)} style={{ width: 20, height: 20 }} />
              <span className="small">إعادة احتساب جميع الجلسات السابقة بالسعر الجديد</span>
            </label>
          </div>
        )}
        <div className="field">
          <label>الحالة</label>
          <div className="segmented" role="radiogroup">
            {STATUSES.map((s) => (
              <button type="button" key={s} role="radio" aria-checked={form.status === s} className={form.status === s ? 'active' : ''} onClick={() => set('status', s)}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="p-notes">ملاحظات إضافية</label>
          <textarea id="p-notes" className="textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
        {err && <p className="error" role="alert">{err}</p>}
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t().common.cancel}
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {t().common.save}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
