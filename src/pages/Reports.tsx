import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChartIcon, DownloadIcon, NavMark, PrintIcon } from '../components/Icons';
import { EmptyState, Page } from '../components/Layout';
import { useToast } from '../components/Toast';
import { useAllSessions, useProjects } from '../hooks';
import { calcPricing } from '../lib/calc';
import { formatDate, formatDateShort, formatDuration, formatHours, formatMoney, formatNumber, formatTime } from '../lib/format';
import { backupFilename, downloadText, sessionsToCsv } from '../services/backup';
import { updateProject } from '../services/projects';
import { byDay, byTaskType, projectStats } from '../services/stats';
import type { Project } from '../types';

export function Reports() {
  const projects = useProjects({ includeArchived: true });
  const sessions = useAllSessions();
  const [params, setParams] = useSearchParams();
  const projectId = params.get('project') ?? '';
  const project = projects?.find((p) => p.id === projectId);
  const toast = useToast();

  useEffect(() => {
    if (!projectId && projects?.length) setParams({ project: projects[0].id }, { replace: true });
  }, [projectId, projects, setParams]);

  const list = useMemo(() => (sessions ?? []).filter((s) => s.projectId === projectId).sort((a, b) => a.startedAt - b.startedAt), [sessions, projectId]);
  const stats = useMemo(() => projectStats(list), [list]);
  const days = useMemo(() => byDay(list), [list]);
  const types = useMemo(() => byTaskType(list), [list]);

  if (!projects || !sessions) return <Page title="التقارير"><p className="muted">جارٍ التحميل…</p></Page>;
  if (!projects.length)
    return (
      <Page title="التقارير">
        <EmptyState icon={<ChartIcon />} title="لا توجد مشاريع" text="أنشئ مشروعًا وسجّل جلسات ليظهر التقرير." />
      </Page>
    );

  const exportCsv = () => {
    downloadText(backupFilename(`waqti-${project?.name ?? 'report'}`, 'csv'), sessionsToCsv(list, projects), 'text/csv;charset=utf-8');
    toast.success('تم تصدير CSV');
  };

  return (
    <Page
      title="التقارير والتسعير"
      actions={
        <>
          <button className="btn icon ghost" aria-label="تصدير CSV" onClick={exportCsv} disabled={!list.length}>
            <DownloadIcon />
          </button>
          <button className="btn icon ghost" aria-label="طباعة / حفظ PDF" onClick={() => window.print()}>
            <PrintIcon />
          </button>
        </>
      }
    >
      <div className="field no-print">
        <select className="select" value={projectId} onChange={(e) => setParams({ project: e.target.value })} aria-label="اختر المشروع">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.archived ? ' (مؤرشف)' : ''}
            </option>
          ))}
        </select>
      </div>

      {project && (
        <>
          <div className="print-only report-head">
            <div>
              <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                <span className="brand-mark">
                  <NavMark />
                </span>
                <span className="brand-word">NAV BUILDS</span>
              </div>
              <h1>{project.name}</h1>
              {project.client && <p className="small muted">العميل: {project.client}</p>}
            </div>
            <div className="meta">
              <div>تقرير ساعات العمل</div>
              <div className="num">{formatDate(Date.now())}</div>
            </div>
          </div>

          <div className="grid-4">
            <div className="stat">
              <span className="label">إجمالي الساعات</span>
              <span className="value">
                <span className="num">{formatHours(stats.totalSeconds)}</span>
              </span>
              <span className="xs muted">{formatDuration(stats.totalSeconds)}</span>
            </div>
            <div className="stat primary">
              <span className="label">تكلفة الوقت</span>
              <span className="value">{formatMoney(stats.totalCost)}</span>
            </div>
            <div className="stat">
              <span className="label">الجلسات</span>
              <span className="value num">{stats.sessionCount}</span>
            </div>
            <div className="stat">
              <span className="label">سعر الساعة الحالي</span>
              <span className="value small">
                <span className="num">{formatNumber(project.hourlyRate)}</span> ر.س
              </span>
            </div>
          </div>

          <PricingTool project={project} timeCost={stats.totalCost} />

          <div className="section-title">
            <h2>توزيع الوقت حسب اليوم</h2>
          </div>
          <div className="card">
            {days.length === 0 ? (
              <p className="muted small">لا توجد بيانات.</p>
            ) : (
              days.map((d) => {
                const max = Math.max(...days.map((x) => x.seconds));
                return (
                  <div className="hbar" key={d.key}>
                    <span className="small num" style={{ width: 86 }}>
                      {formatDateShort(d.key)}
                    </span>
                    <div className="track">
                      <span style={{ width: `${(d.seconds / max) * 100}%` }} />
                    </div>
                    <span className="small bold" style={{ width: 70, textAlign: 'end' }}>
                      {formatDuration(d.seconds)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div className="section-title">
            <h2>توزيع الوقت حسب نوع المهمة</h2>
          </div>
          <div className="card">
            {types.length === 0 ? (
              <p className="muted small">لا توجد بيانات.</p>
            ) : (
              types.map((tb) => (
                <div className="hbar" key={tb.type}>
                  <span className="small" style={{ width: 86 }}>
                    {tb.type}
                  </span>
                  <div className="track">
                    <span style={{ width: `${(tb.seconds / Math.max(1, stats.totalSeconds)) * 100}%` }} />
                  </div>
                  <span className="small bold" style={{ width: 110, textAlign: 'end' }}>
                    {formatDuration(tb.seconds)} · {formatMoney(tb.cost)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="section-title">
            <h2>تفاصيل الجلسات</h2>
          </div>
          <div className="card table-wrap" style={{ padding: 8 }}>
            {list.length === 0 ? (
              <p className="muted small" style={{ padding: 8 }}>
                لا توجد جلسات.
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>من</th>
                    <th>إلى</th>
                    <th>المدة</th>
                    <th>السعر</th>
                    <th>التكلفة</th>
                    <th>المهمة / ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => (
                    <tr key={s.id}>
                      <td className="num">{formatDateShort(s.startedAt)}</td>
                      <td className="num">{formatTime(s.startedAt)}</td>
                      <td className="num">{formatTime(s.endedAt)}</td>
                      <td>{formatDuration(s.durationSeconds)}</td>
                      <td className="num">{s.hourlyRate}</td>
                      <td className="num bold">{s.cost.toFixed(2)}</td>
                      <td>
                        {s.taskType && <span className="badge">{s.taskType}</span>} {s.note}
                        {s.manuallyEdited && <span className="xs muted"> (معدّلة)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={3}>الإجمالي</th>
                    <th>{formatDuration(stats.totalSeconds)}</th>
                    <th />
                    <th className="num">{stats.totalCost.toFixed(2)}</th>
                    <th />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </Page>
  );
}

function PricingTool({ project, timeCost }: { project: Project; timeCost: number }) {
  const toast = useToast();
  const [margin, setMargin] = useState(project.pricing?.marginPercent ?? 0);
  const [extra, setExtra] = useState(project.pricing?.extraCosts ?? 0);
  const [discount, setDiscount] = useState(project.pricing?.discount ?? 0);
  const [finalPrice, setFinalPrice] = useState<string>(project.pricing?.finalPrice != null ? String(project.pricing.finalPrice) : '');

  useEffect(() => {
    setMargin(project.pricing?.marginPercent ?? 0);
    setExtra(project.pricing?.extraCosts ?? 0);
    setDiscount(project.pricing?.discount ?? 0);
    setFinalPrice(project.pricing?.finalPrice != null ? String(project.pricing.finalPrice) : '');
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const b = calcPricing({ timeCost, marginPercent: margin, extraCosts: extra, discount });
  const final = finalPrice.trim() === '' ? b.suggestedPrice : parseFloat(finalPrice);
  const finalValid = Number.isFinite(final) && final >= 0;

  const save = async () => {
    await updateProject(project.id, {
      pricing: { marginPercent: margin || 0, extraCosts: extra || 0, discount: discount || 0, finalPrice: finalPrice.trim() === '' ? undefined : finalValid ? final : undefined },
    });
    toast.success('تم حفظ إعدادات التسعير');
  };

  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  return (
    <>
      <div className="section-title">
        <h2>أداة تسعير المشروع</h2>
      </div>
      <div className="card">
        <div className="grid-2 no-print" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="field">
            <label htmlFor="pr-margin">هامش إضافي %</label>
            <input id="pr-margin" type="number" inputMode="decimal" min={0} className="input" value={margin} onChange={(e) => setMargin(num(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="pr-extra">مصاريف إضافية</label>
            <input id="pr-extra" type="number" inputMode="decimal" min={0} className="input" value={extra} onChange={(e) => setExtra(num(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="pr-disc">خصم</label>
            <input id="pr-disc" type="number" inputMode="decimal" min={0} className="input" value={discount} onChange={(e) => setDiscount(num(e.target.value))} />
          </div>
        </div>
        <div className="kv">
          <span className="k">تكلفة الوقت الفعلية</span>
          <span className="v">{formatMoney(b.timeCost, { decimals: 2 })}</span>
        </div>
        <div className="kv">
          <span className="k">
            + هامش <span className="num">{formatNumber(b.marginPercent)}</span>٪
          </span>
          <span className="v">{formatMoney(b.marginAmount, { decimals: 2 })}</span>
        </div>
        <div className="kv">
          <span className="k">+ مصاريف إضافية</span>
          <span className="v">{formatMoney(b.extraCosts, { decimals: 2 })}</span>
        </div>
        <div className="kv">
          <span className="k">= المجموع قبل الخصم</span>
          <span className="v">{formatMoney(b.subtotal, { decimals: 2 })}</span>
        </div>
        <div className="kv">
          <span className="k">− خصم</span>
          <span className="v">{formatMoney(b.discount, { decimals: 2 })}</span>
        </div>
        <div className="kv total">
          <span className="k">السعر المقترح</span>
          <span className="v">{formatMoney(b.suggestedPrice, { decimals: 2 })}</span>
        </div>
        <div className="kv">
          <span className="k">الفرق عن تكلفة الوقت</span>
          <span className="v" style={{ color: b.differenceFromCost >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {b.differenceFromCost >= 0 ? '+' : ''}
            {formatMoney(b.differenceFromCost, { decimals: 2 })}
          </span>
        </div>
        <div className="field mt-12 no-print">
          <label htmlFor="pr-final">السعر النهائي الذي ستقترحه على العميل (اتركه فارغًا لاعتماد السعر المقترح)</label>
          <input id="pr-final" type="number" inputMode="decimal" min={0} className="input" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} placeholder={String(b.suggestedPrice)} />
        </div>
        <div className="kv total">
          <span className="k">السعر النهائي للعميل</span>
          <span className="v">{finalValid ? formatMoney(final, { decimals: 2 }) : '—'}</span>
        </div>
        {finalValid && (
          <div className="kv">
            <span className="k">الفرق بين السعر النهائي وتكلفة الوقت</span>
            <span className="v" style={{ color: final - b.timeCost >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {final - b.timeCost >= 0 ? '+' : ''}
              {formatMoney(Math.round((final - b.timeCost) * 100) / 100, { decimals: 2 })}
            </span>
          </div>
        )}
        <p className="help mt-8">المعادلة: (تكلفة الوقت + تكلفة الوقت × الهامش٪) + المصاريف − الخصم. تكلفة الوقت = مجموع ثواني الجلسات ÷ 3600 × سعر الساعة المعتمد لكل جلسة.</p>
        <button className="btn primary block mt-12 no-print" onClick={save}>
          حفظ إعدادات التسعير
        </button>
      </div>
    </>
  );
}
