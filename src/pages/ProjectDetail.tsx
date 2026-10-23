import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArchiveIcon, ChartIcon, ClockIcon, EditIcon, PlusIcon, TrashIcon } from '../components/Icons';
import { EmptyState, Page } from '../components/Layout';
import { useConfirm } from '../components/Modal';
import { ProjectForm } from '../components/ProjectForm';
import { SessionForm } from '../components/SessionForm';
import { SessionItem } from '../components/SessionItem';
import { TimerCard } from '../components/TimerCard';
import { useToast } from '../components/Toast';
import { useActiveTimerFor, useProject, useProjectSessions } from '../hooks';
import { formatDate, formatDuration, formatHours, formatMoney } from '../lib/format';
import { STATUS_LABELS, deleteProject, setArchived } from '../services/projects';
import { projectStats } from '../services/stats';
import type { WorkSession } from '../types';

export function ProjectDetail() {
  const { id } = useParams();
  const project = useProject(id);
  const sessions = useProjectSessions(id);
  const timer = useActiveTimerFor(id);
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState<WorkSession | null>(null);

  const stats = useMemo(() => projectStats(sessions ?? []), [sessions]);

  if (project === undefined) return <Page title="…" back="/projects"><p className="muted">جارٍ التحميل…</p></Page>;
  if (project === null)
    return (
      <Page title="غير موجود" back="/projects">
        <EmptyState icon={<ClockIcon />} title="المشروع غير موجود" text="ربما تم حذفه." />
      </Page>
    );

  const onArchive = async () => {
    const ok = await confirm({
      title: project.archived ? 'إلغاء أرشفة المشروع؟' : 'أرشفة المشروع؟',
      message: project.archived ? 'سيظهر المشروع مجددًا في القوائم الرئيسية.' : 'سيُخفى المشروع من القوائم الرئيسية مع الاحتفاظ بجميع جلساته وبياناته.',
      confirmText: project.archived ? 'إلغاء الأرشفة' : 'أرشفة',
    });
    if (!ok) return;
    await setArchived(project.id, !project.archived);
    toast.success(project.archived ? 'تم إلغاء الأرشفة' : 'تمت الأرشفة');
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: 'حذف المشروع نهائيًا؟',
      message: `سيتم حذف المشروع «${project.name}» مع ${stats.sessionCount} جلسة عمل. لا يمكن التراجع عن هذه العملية.`,
      confirmText: 'حذف نهائي',
      danger: true,
    });
    if (!ok) return;
    await deleteProject(project.id);
    toast.success('تم حذف المشروع');
    nav('/projects', { replace: true });
  };

  return (
    <Page
      title={project.name}
      back="/projects"
      actions={
        <button className="btn icon ghost" aria-label="تعديل المشروع" onClick={() => setEdit(true)}>
          <EditIcon />
        </button>
      }
    >
      <div className="row wrap small" style={{ marginBottom: 12 }}>
        <span className={`badge ${project.archived ? 'archived' : project.status}`}>{project.archived ? 'مؤرشف' : STATUS_LABELS[project.status]}</span>
        {project.client && <span className="muted">العميل: {project.client}</span>}
        <span className="muted">بدأ {formatDate(project.startDate)}</span>
      </div>
      {project.description && <p className="small muted" style={{ marginBottom: 12 }}>{project.description}</p>}

      {!project.archived && project.status !== 'completed' ? (
        <TimerCard project={project} timer={timer ?? null} />
      ) : (
        <div className="card small muted">
          {project.archived ? 'المشروع مؤرشف. ألغِ الأرشفة لتشغيل المؤقت.' : 'المشروع مكتمل. غيّر الحالة لتشغيل المؤقت مجددًا.'}
        </div>
      )}

      <div className="grid-4 mt-16">
        <div className="stat primary">
          <span className="label">إجمالي التكلفة</span>
          <span className="value">{formatMoney(stats.totalCost)}</span>
        </div>
        <div className="stat">
          <span className="label">إجمالي الوقت</span>
          <span className="value small">{formatDuration(stats.totalSeconds)}</span>
          <span className="xs muted num">{formatHours(stats.totalSeconds)} ساعة</span>
        </div>
        <div className="stat">
          <span className="label">عدد الجلسات</span>
          <span className="value num">{stats.sessionCount}</span>
        </div>
        <div className="stat">
          <span className="label">متوسط الجلسة</span>
          <span className="value small">{stats.sessionCount ? formatDuration(stats.avgSessionSeconds) : '—'}</span>
        </div>
      </div>

      <div className="row mt-12 gap-8">
        <Link to={`/reports?project=${project.id}`} className="btn ghost flex-1">
          <ChartIcon /> التقرير والتسعير
        </Link>
        <button className="btn ghost flex-1" onClick={() => setManual(true)}>
          <PlusIcon /> جلسة يدوية
        </button>
      </div>

      {project.notes && (
        <>
          <div className="section-title">
            <h2>ملاحظات المشروع</h2>
          </div>
          <div className="card small" style={{ whiteSpace: 'pre-wrap' }}>
            {project.notes}
          </div>
        </>
      )}

      <div className="section-title">
        <h2>سجل الجلسات</h2>
        <span className="small muted num">{stats.sessionCount}</span>
      </div>
      {sessions && sessions.length === 0 ? (
        <EmptyState icon={<ClockIcon />} title="لا توجد جلسات بعد" text="ابدأ المؤقت أو سجّل جلسة يدويًا." />
      ) : (
        <div className="list">{sessions?.map((s) => <SessionItem key={s.id} session={s} onEdit={() => setEditing(s)} />)}</div>
      )}

      <div className="row mt-16 gap-8 no-print">
        <button className="btn ghost flex-1" onClick={onArchive}>
          <ArchiveIcon /> {project.archived ? 'إلغاء الأرشفة' : 'أرشفة'}
        </button>
        <button className="btn danger flex-1" onClick={onDelete}>
          <TrashIcon /> حذف المشروع
        </button>
      </div>

      {edit && <ProjectForm project={project} onClose={() => setEdit(false)} />}
      {manual && <SessionForm project={project} onClose={() => setManual(false)} />}
      {editing && <SessionForm session={editing} project={project} onClose={() => setEditing(null)} />}
    </Page>
  );
}
