import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClockIcon, FolderIcon, PlayIcon, PlusIcon } from '../components/Icons';
import { EmptyState, Page } from '../components/Layout';
import { ProjectForm } from '../components/ProjectForm';
import { useActiveTimer, useAllSessions, useNow, useProjects, useSettings } from '../hooks';
import { calcCost, timerElapsedSeconds } from '../lib/calc';
import { formatClock, formatDuration, formatHours, formatMoney, formatNumber } from '../lib/format';
import { STATUS_LABELS } from '../services/projects';
import { groupByProject, last7Days, periodSummary, projectStats, recentProjects } from '../services/stats';
import { startTimer } from '../services/timer';
import { useToast } from '../components/Toast';

const DAY_NAMES = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

export function Dashboard() {
  const projects = useProjects({ includeArchived: true });
  const sessions = useAllSessions();
  const timer = useActiveTimer();
  const settings = useSettings();
  const toast = useToast();
  const nav = useNavigate();
  const now = useNow(!!timer);
  const [showNew, setShowNew] = useState(false);
  const [quickId, setQuickId] = useState('');

  const visible = useMemo(() => (projects ?? []).filter((p) => !p.archived), [projects]);
  const stats = useMemo(() => {
    const s = sessions ?? [];
    const total = projectStats(s);
    const live = timer ? timerElapsedSeconds(timer, now) : 0;
    return {
      count: visible.length,
      active: visible.filter((p) => p.status === 'active').length,
      totalSeconds: total.totalSeconds + live,
      totalCost: Math.round((total.totalCost + (timer ? calcCost(live, timer.hourlyRate) : 0)) * 100) / 100,
      periods: periodSummary(s, now),
      liveSeconds: live,
      week: last7Days(s, now),
    };
  }, [sessions, visible, timer, now]);

  const byProject = useMemo(() => groupByProject(sessions ?? []), [sessions]);
  const recent = useMemo(() => recentProjects(projects ?? [], sessions ?? [], 5), [projects, sessions]);
  const timerProject = timer ? projects?.find((p) => p.id === timer.projectId) : undefined;
  const maxSec = Math.max(1, ...stats.week.map((d) => d.seconds));

  const quickStart = async () => {
    const p = visible.find((x) => x.id === quickId);
    if (!p) return toast.error('اختر مشروعًا أولًا');
    if (timer) return nav(`/projects/${p.id}`);
    try {
      await startTimer({ projectId: p.id, hourlyRate: p.hourlyRate });
      toast.success('بدأ المؤقت');
      nav(`/projects/${p.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطأ');
    }
  };

  if (projects === undefined || sessions === undefined) {
    return (
      <Page title="وقتي">
        <p className="muted">جارٍ التحميل…</p>
      </Page>
    );
  }

  return (
    <Page title="لوحة التحكم">
      {timer && (
        <Link to={`/projects/${timer.projectId}`} className="card" style={{ display: 'block', borderColor: timer.status === 'running' ? 'var(--success)' : 'var(--warning)', marginBottom: 14 }}>
          <div className="row between">
            <div className="col" style={{ gap: 2 }}>
              <span className="row small bold">
                <span className={`dot ${timer.status}`} /> {timer.status === 'running' ? 'جلسة مفتوحة الآن' : 'جلسة متوقفة مؤقتًا'}
              </span>
              <span className="muted small truncate">{timerProject?.name ?? '…'}</span>
            </div>
            <div className="col" style={{ alignItems: 'flex-end', gap: 0 }}>
              <span className="num bold" style={{ fontSize: '1.3rem' }}>
                {formatClock(stats.liveSeconds)}
              </span>
              <span className="small" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                {formatMoney(calcCost(stats.liveSeconds, timer.hourlyRate), { decimals: 2 })}
              </span>
            </div>
          </div>
        </Link>
      )}

      {visible.length === 0 && !timer ? (
        <EmptyState
          icon={<FolderIcon />}
          title="ابدأ بإنشاء أول مشروع"
          text={`سعر الساعة الافتراضي ${formatNumber(settings.defaultHourlyRate)} ر.س ويمكن تغييره من الإعدادات.`}
          action={
            <button className="btn primary lg" onClick={() => setShowNew(true)}>
              <PlusIcon /> مشروع جديد
            </button>
          }
        />
      ) : (
        <>
          <div className="grid-4">
            <div className="stat primary">
              <span className="label">إجمالي قيمة العمل</span>
              <span className="value">{formatMoney(stats.totalCost)}</span>
            </div>
            <div className="stat">
              <span className="label">إجمالي ساعات العمل</span>
              <span className="value">
                <span className="num">{formatHours(stats.totalSeconds)}</span> <span className="small muted">ساعة</span>
              </span>
              <span className="xs muted">{formatDuration(stats.totalSeconds)}</span>
            </div>
            <div className="stat">
              <span className="label">عدد المشاريع</span>
              <span className="value num">{stats.count}</span>
            </div>
            <div className="stat">
              <span className="label">قيد التنفيذ</span>
              <span className="value num">{stats.active}</span>
            </div>
          </div>

          <div className="section-title">
            <h2>ملخص وقت العمل</h2>
          </div>
          <div className="card">
            <div className="grid-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {[
                ['اليوم', stats.periods.today],
                ['هذا الأسبوع', stats.periods.week],
                ['هذا الشهر', stats.periods.month],
              ].map(([label, sec]) => (
                <div key={label as string} className="col" style={{ gap: 2, textAlign: 'center' }}>
                  <span className="xs muted">{label}</span>
                  <span className="bold num" style={{ fontSize: '1.05rem' }}>
                    {formatHours(sec as number)} س
                  </span>
                  <span className="xs muted">{formatMoney(calcCost(sec as number, settings.defaultHourlyRate))}</span>
                </div>
              ))}
            </div>
            <p className="xs muted mt-8" style={{ textAlign: 'center' }}>
              القيم أعلاه تقديرية بسعر الساعة الافتراضي؛ التكلفة الفعلية تُحسب لكل جلسة بسعرها المعتمد.
            </p>
            <div className="bars mt-12" aria-label="آخر 7 أيام">
              {stats.week.map((d) => {
                const date = new Date(d.key);
                return (
                  <div className="bar" key={d.key} title={`${d.key}: ${formatDuration(d.seconds)}`}>
                    <span className="val num">{d.seconds ? formatHours(d.seconds) : ''}</span>
                    <div className="fill" style={{ height: `${Math.max(2, (d.seconds / maxSec) * 80)}%`, opacity: d.seconds ? 1 : 0.25 }} />
                    <span className="lbl">{DAY_NAMES[date.getDay()]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="section-title">
            <h2>مؤقت سريع</h2>
          </div>
          <div className="card row">
            <select className="select flex-1" value={quickId} onChange={(e) => setQuickId(e.target.value)} aria-label="اختر مشروعًا">
              <option value="">اختر مشروعًا…</option>
              {visible
                .filter((p) => p.status !== 'completed')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <button className="btn success" onClick={quickStart} disabled={!quickId}>
              <PlayIcon /> {timer ? 'افتح' : 'ابدأ'}
            </button>
          </div>

          <div className="section-title">
            <h2>آخر المشاريع</h2>
            <Link to="/projects" className="small" style={{ color: 'var(--primary)', fontWeight: 700 }}>
              عرض الكل
            </Link>
          </div>
          <div className="list">
            {recent.map((p) => {
              const st = projectStats(byProject.get(p.id) ?? []);
              return (
                <Link key={p.id} to={`/projects/${p.id}`} className="item">
                  <div className="body">
                    <div className="title truncate">{p.name}</div>
                    <div className="meta">
                      <span className={`badge ${p.status}`}>{STATUS_LABELS[p.status]}</span>
                      {p.client && <span>{p.client}</span>}
                      <span className="row" style={{ gap: 4 }}>
                        <ClockIcon style={{ width: 14, height: 14 }} /> {formatDuration(st.totalSeconds)}
                      </span>
                    </div>
                  </div>
                  <div className="end">
                    <div className="cost">{formatMoney(st.totalCost)}</div>
                    <div className="xs muted num">{st.sessionCount} جلسة</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {visible.length > 0 && (
        <button className="btn primary fab no-print" onClick={() => setShowNew(true)}>
          <PlusIcon /> مشروع جديد
        </button>
      )}
      {showNew && <ProjectForm onClose={() => setShowNew(false)} onSaved={(p) => nav(`/projects/${p.id}`)} />}
    </Page>
  );
}
