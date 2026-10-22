import { useMemo, useState } from 'react';
import { ClockIcon, DownloadIcon, PlusIcon } from '../components/Icons';
import { EmptyState, Page } from '../components/Layout';
import { SessionForm } from '../components/SessionForm';
import { SessionItem } from '../components/SessionItem';
import { useToast } from '../components/Toast';
import { useAllSessions, useProjects } from '../hooks';
import { formatDuration, formatMoney } from '../lib/format';
import { backupFilename, downloadText, sessionsToCsv } from '../services/backup';
import type { WorkSession } from '../types';

export function Sessions() {
  const sessions = useAllSessions();
  const projects = useProjects({ includeArchived: true });
  const toast = useToast();
  const [projectId, setProjectId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WorkSession | null>(null);

  const names = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects]);
  const list = useMemo(() => {
    let l = sessions ?? [];
    if (projectId) l = l.filter((s) => s.projectId === projectId);
    if (from) l = l.filter((s) => s.startedAt >= new Date(from).setHours(0, 0, 0, 0));
    if (to) l = l.filter((s) => s.startedAt <= new Date(to).setHours(23, 59, 59, 999));
    const t = q.trim().toLowerCase();
    if (t) l = l.filter((s) => s.note?.toLowerCase().includes(t) || s.taskType?.toLowerCase().includes(t) || names.get(s.projectId)?.toLowerCase().includes(t));
    return l;
  }, [sessions, projectId, from, to, q, names]);

  const totals = useMemo(
    () => ({
      seconds: list.reduce((a, s) => a + s.durationSeconds, 0),
      cost: Math.round(list.reduce((a, s) => a + s.cost, 0) * 100) / 100,
    }),
    [list],
  );

  const exportCsv = () => {
    if (!list.length) return toast.error('لا توجد جلسات للتصدير');
    downloadText(backupFilename('waqti-sessions', 'csv'), sessionsToCsv(list, projects ?? []), 'text/csv;charset=utf-8');
    toast.success('تم تصدير ملف CSV');
  };

  return (
    <Page
      title="سجل جلسات العمل"
      actions={
        <button className="btn icon ghost" aria-label="تصدير CSV" onClick={exportCsv}>
          <DownloadIcon />
        </button>
      }
    >
      <div className="card" style={{ padding: 12 }}>
        <div className="field" style={{ marginBottom: 10 }}>
          <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="تصفية حسب المشروع">
            <option value="">كل المشاريع</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid-2">
          <div className="field" style={{ marginBottom: 10 }}>
            <label htmlFor="f-from">من تاريخ</label>
            <input id="f-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label htmlFor="f-to">إلى تاريخ</label>
            <input id="f-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <input className="input" placeholder="بحث في الملاحظات أو نوع المهمة" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
      </div>

      <div className="row between mt-12 small">
        <span className="muted">
          <span className="num">{list.length}</span> جلسة · {formatDuration(totals.seconds)}
        </span>
        <span className="bold" style={{ color: 'var(--primary)' }}>
          {formatMoney(totals.cost)}
        </span>
      </div>

      {sessions && list.length === 0 ? (
        <EmptyState icon={<ClockIcon />} title="لا توجد جلسات" text={sessions.length ? 'لا توجد نتائج مطابقة للتصفية.' : 'ابدأ مؤقتًا من صفحة مشروع أو سجّل جلسة يدويًا.'} />
      ) : (
        <div className="list mt-12">
          {list.map((s) => (
            <SessionItem key={s.id} session={s} projectName={names.get(s.projectId) ?? 'مشروع محذوف'} onEdit={() => setEditing(s)} />
          ))}
        </div>
      )}

      <button className="btn primary fab" onClick={() => setAdding(true)} disabled={!projects?.length}>
        <PlusIcon /> جلسة يدوية
      </button>
      {adding && <SessionForm onClose={() => setAdding(false)} />}
      {editing && <SessionForm session={editing} onClose={() => setEditing(null)} />}
    </Page>
  );
}
