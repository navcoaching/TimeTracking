import { EditIcon, TrashIcon } from './Icons';
import { useConfirm } from './Modal';
import { useToast } from './Toast';
import { formatDateShort, formatDuration, formatMoney, formatTime } from '../lib/format';
import { deleteSession } from '../services/sessions';
import type { WorkSession } from '../types';

export function SessionItem({ session: s, projectName, onEdit }: { session: WorkSession; projectName?: string; onEdit: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const onDelete = async () => {
    const ok = await confirm({
      title: 'حذف الجلسة؟',
      message: `جلسة ${formatDateShort(s.startedAt)} بمدة ${formatDuration(s.durationSeconds)} (${formatMoney(s.cost)}). لا يمكن التراجع.`,
      confirmText: 'حذف',
      danger: true,
    });
    if (!ok) return;
    await deleteSession(s.id);
    toast.success('تم حذف الجلسة');
  };
  return (
    <div className="item" style={{ alignItems: 'stretch' }}>
      <div className="body">
        {projectName && <div className="title truncate">{projectName}</div>}
        <div className={projectName ? 'small' : 'title'}>
          <span className="num">{formatDateShort(s.startedAt)}</span> · من <span className="num">{formatTime(s.startedAt)}</span> إلى <span className="num">{formatTime(s.endedAt)}</span>
        </div>
        <div className="meta">
          <span className="bold" style={{ color: 'var(--text)' }}>
            {formatDuration(s.durationSeconds)}
          </span>
          <span>
            <span className="num">{s.hourlyRate}</span> ر.س/س
          </span>
          {s.taskType && <span className="badge">{s.taskType}</span>}
          {s.source === 'manual' && <span className="badge">يدوي</span>}
          {s.manuallyEdited && <span className="badge edited">معدّلة يدويًا</span>}
          {s.pauses.length > 0 && <span>{s.pauses.length} توقف</span>}
        </div>
        {s.note && <div className="small muted mt-8 truncate">{s.note}</div>}
      </div>
      <div className="end col" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div className="cost">{formatMoney(s.cost, { decimals: 2 })}</div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn icon ghost sm" aria-label="تعديل الجلسة" onClick={onEdit} style={{ width: 38 }}>
            <EditIcon style={{ width: 16, height: 16 }} />
          </button>
          <button className="btn icon danger sm" aria-label="حذف الجلسة" onClick={onDelete} style={{ width: 38 }}>
            <TrashIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
