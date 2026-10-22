import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FolderIcon, PlusIcon, SearchIcon } from '../components/Icons';
import { EmptyState, Page } from '../components/Layout';
import { ProjectForm } from '../components/ProjectForm';
import { useAllSessions, useProjects } from '../hooks';
import { formatDuration, formatMoney } from '../lib/format';
import { STATUS_LABELS } from '../services/projects';
import { groupByProject, projectStats } from '../services/stats';
import type { ProjectStatus } from '../types';

type Filter = 'all' | ProjectStatus | 'archived';

export function Projects() {
  const projects = useProjects({ includeArchived: true });
  const sessions = useAllSessions();
  const nav = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);

  const byProject = useMemo(() => groupByProject(sessions ?? []), [sessions]);
  const list = useMemo(() => {
    let l = projects ?? [];
    if (filter === 'archived') l = l.filter((p) => p.archived);
    else {
      l = l.filter((p) => !p.archived);
      if (filter !== 'all') l = l.filter((p) => p.status === filter);
    }
    const s = q.trim().toLowerCase();
    if (s) l = l.filter((p) => p.name.toLowerCase().includes(s) || p.client?.toLowerCase().includes(s));
    return l;
  }, [projects, filter, q]);

  const filters: { k: Filter; label: string }[] = [
    { k: 'all', label: 'الكل' },
    { k: 'active', label: STATUS_LABELS.active },
    { k: 'new', label: STATUS_LABELS.new },
    { k: 'paused', label: STATUS_LABELS.paused },
    { k: 'completed', label: STATUS_LABELS.completed },
    { k: 'archived', label: 'المؤرشفة' },
  ];

  return (
    <Page title="المشاريع">
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="input row flex-1" style={{ gap: 8 }}>
          <SearchIcon style={{ width: 18, height: 18, color: 'var(--muted)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث باسم المشروع أو العميل" style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, minWidth: 0 }} aria-label="بحث" />
        </div>
      </div>
      <div className="chips" style={{ marginBottom: 14, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4 }}>
        {filters.map((f) => (
          <button key={f.k} className={`chip ${filter === f.k ? 'active' : ''}`} onClick={() => setFilter(f.k)}>
            {f.label}
          </button>
        ))}
      </div>

      {projects && list.length === 0 ? (
        <EmptyState
          icon={<FolderIcon />}
          title={projects.length === 0 ? 'لا توجد مشاريع بعد' : 'لا توجد نتائج'}
          text={projects.length === 0 ? 'أنشئ مشروعك الأول وابدأ تسجيل ساعات العمل.' : 'جرّب تغيير الفلتر أو كلمة البحث.'}
          action={
            projects.length === 0 && (
              <button className="btn primary lg" onClick={() => setShowNew(true)}>
                <PlusIcon /> مشروع جديد
              </button>
            )
          }
        />
      ) : (
        <div className="list">
          {list.map((p) => {
            const st = projectStats(byProject.get(p.id) ?? []);
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="item">
                <div className="body">
                  <div className="title truncate">{p.name}</div>
                  <div className="meta">
                    <span className={`badge ${p.archived ? 'archived' : p.status}`}>{p.archived ? 'مؤرشف' : STATUS_LABELS[p.status]}</span>
                    {p.client && <span className="truncate">{p.client}</span>}
                    <span>{formatDuration(st.totalSeconds)}</span>
                  </div>
                </div>
                <div className="end">
                  <div className="cost">{formatMoney(st.totalCost)}</div>
                  <div className="xs muted">
                    <span className="num">{p.hourlyRate}</span> ر.س/س
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <button className="btn primary fab" onClick={() => setShowNew(true)}>
        <PlusIcon /> مشروع جديد
      </button>
      {showNew && <ProjectForm onClose={() => setShowNew(false)} onSaved={(p) => nav(`/projects/${p.id}`)} />}
    </Page>
  );
}
