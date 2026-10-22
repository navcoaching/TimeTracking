import { useEffect, useRef, useState } from 'react';
import { AlertIcon, DownloadIcon, TrashIcon, UploadIcon } from '../components/Icons';
import { Page } from '../components/Layout';
import { Sheet, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useAllSessions, useProjects, useSettings } from '../hooks';
import { formatDateTime, formatNumber } from '../lib/format';
import { backupFilename, downloadText, exportBackup, importBackup, sessionsToCsv, validateBackup, wipeAllData, type ImportMode, type ValidationResult } from '../services/backup';
import { saveSettings } from '../db/db';
import type { Settings as SettingsT } from '../types';

export function Settings() {
  const settings = useSettings();
  const projects = useProjects({ includeArchived: true });
  const sessions = useAllSessions();
  const toast = useToast();
  const confirm = useConfirm();
  const [rate, setRate] = useState(String(settings.defaultHourlyRate));
  const [newType, setNewType] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ValidationResult | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => setRate(String(settings.defaultHourlyRate)), [settings.defaultHourlyRate]);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const saveRate = async () => {
    const n = parseFloat(rate);
    if (!Number.isFinite(n) || n < 0) return toast.error('سعر الساعة غير صحيح');
    await saveSettings({ defaultHourlyRate: n });
    toast.success('تم حفظ السعر الافتراضي. المشاريع والجلسات القائمة لم تتغير.');
  };

  const setTheme = (theme: SettingsT['theme']) => saveSettings({ theme });

  const addType = async () => {
    const v = newType.trim();
    if (!v) return;
    if (settings.taskTypes.includes(v)) return toast.error('النوع موجود مسبقًا');
    await saveSettings({ taskTypes: [...settings.taskTypes, v] });
    setNewType('');
  };
  const removeType = (tt: string) => saveSettings({ taskTypes: settings.taskTypes.filter((x) => x !== tt) });

  const doExport = async () => {
    const data = await exportBackup();
    downloadText(backupFilename(), JSON.stringify(data, null, 2), 'application/json');
    toast.success('تم تصدير النسخة الاحتياطية');
  };

  const exportCsv = () => {
    if (!sessions?.length) return toast.error('لا توجد جلسات');
    downloadText(backupFilename('waqti-sessions', 'csv'), sessionsToCsv(sessions, projects ?? []), 'text/csv;charset=utf-8');
    toast.success('تم تصدير CSV');
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      const v = validateBackup(parsed);
      if (!v.ok) return toast.error(v.errors[0] ?? 'ملف غير صالح');
      setPending(v);
    } catch {
      toast.error('تعذر قراءة الملف: ليس JSON صالحًا');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doImport = async (mode: ImportMode) => {
    if (!pending?.data) return;
    const hasData = (projects?.length ?? 0) + (sessions?.length ?? 0) > 0;
    if (mode === 'replace' && hasData) {
      const ok = await confirm({
        title: 'استبدال جميع البيانات الحالية؟',
        message: `لديك حاليًا ${projects?.length ?? 0} مشروع و${sessions?.length ?? 0} جلسة سيتم حذفها واستبدالها بمحتوى النسخة الاحتياطية. يُنصح بتصدير نسخة احتياطية أولًا.`,
        confirmText: 'استبدال',
        danger: true,
      });
      if (!ok) return;
    }
    await importBackup(pending.data, mode);
    toast.success(`تم الاستيراد: ${pending.stats?.projects} مشروع، ${pending.stats?.sessions} جلسة`);
    setPending(null);
  };

  const wipe = async () => {
    const ok = await confirm({
      title: 'حذف جميع البيانات؟',
      message: 'سيتم حذف كل المشاريع والجلسات والإعدادات والمؤقت النشط من هذا الجهاز نهائيًا. لا يمكن التراجع. هل صدّرت نسخة احتياطية؟',
      confirmText: 'نعم، احذف كل شيء',
      danger: true,
    });
    if (!ok) return;
    const ok2 = await confirm({ title: 'تأكيد أخير', message: 'هذه العملية نهائية ولا يمكن استرجاع البيانات بعدها.', confirmText: 'حذف نهائي', danger: true });
    if (!ok2) return;
    await wipeAllData();
    toast.success('تم حذف جميع البيانات');
  };

  const requestPersist = async () => {
    if (!navigator.storage?.persist) return toast.error('المتصفح لا يدعم هذه الميزة');
    const r = await navigator.storage.persist();
    setPersisted(r);
    toast[r ? 'success' : 'info'](r ? 'تم تفعيل التخزين الدائم' : 'لم يمنح المتصفح التخزين الدائم (ثبّت التطبيق على الشاشة الرئيسية ثم أعد المحاولة)');
  };

  return (
    <Page title="الإعدادات">
      <div className="section-title">
        <h2>سعر الساعة الافتراضي</h2>
      </div>
      <div className="card">
        <div className="row">
          <input type="number" inputMode="decimal" min={0} step="0.01" className="input flex-1" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="سعر الساعة الافتراضي" />
          <span className="muted small">ر.س/ساعة</span>
          <button className="btn primary" onClick={saveRate}>
            حفظ
          </button>
        </div>
        <p className="help mt-8">يُستخدم هذا السعر للمشاريع الجديدة فقط. لتغيير سعر مشروع قائم، عدّله من صفحة المشروع.</p>
      </div>

      <div className="section-title">
        <h2>المظهر</h2>
      </div>
      <div className="card">
        <div className="segmented">
          {(['system', 'light', 'dark'] as const).map((th) => (
            <button key={th} className={settings.theme === th ? 'active' : ''} onClick={() => setTheme(th)}>
              {th === 'system' ? 'حسب النظام' : th === 'light' ? 'فاتح' : 'داكن'}
            </button>
          ))}
        </div>
      </div>

      <div className="section-title">
        <h2>أنواع المهام</h2>
      </div>
      <div className="card">
        <div className="chips">
          {settings.taskTypes.map((tt) => (
            <button key={tt} className="chip" onClick={() => removeType(tt)} title="إزالة" aria-label={`إزالة ${tt}`}>
              {tt} ×
            </button>
          ))}
        </div>
        <div className="row mt-12">
          <input className="input flex-1" value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="نوع مهمة جديد" onKeyDown={(e) => e.key === 'Enter' && addType()} />
          <button className="btn" onClick={addType}>
            إضافة
          </button>
        </div>
      </div>

      <div className="section-title">
        <h2>النسخ الاحتياطي</h2>
      </div>
      <div className="card col" style={{ gap: 10 }}>
        <p className="small muted">
          البيانات محفوظة محليًا على هذا الجهاز فقط (IndexedDB) ولا تتم مزامنتها مع أي جهاز آخر. صدّر نسخة احتياطية بانتظام واحتفظ بها في مكان آمن.
        </p>
        <div className="small">
          <span className="num">{projects?.length ?? 0}</span> مشروع · <span className="num">{sessions?.length ?? 0}</span> جلسة
        </div>
        <button className="btn primary block" onClick={doExport}>
          <DownloadIcon /> تصدير نسخة احتياطية (JSON)
        </button>
        <button className="btn block" onClick={() => fileRef.current?.click()}>
          <UploadIcon /> استيراد نسخة احتياطية
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="btn ghost block" onClick={exportCsv}>
          <DownloadIcon /> تصدير سجل الجلسات (CSV لـ Excel)
        </button>
        <div className="row between small mt-8">
          <span className="muted">التخزين الدائم: {persisted === null ? 'غير معروف' : persisted ? 'مفعّل ✓' : 'غير مفعّل'}</span>
          {persisted === false && (
            <button className="btn sm" onClick={requestPersist}>
              تفعيل
            </button>
          )}
        </div>
        <p className="help">التخزين الدائم يطلب من المتصفح عدم حذف بيانات التطبيق تلقائيًا عند امتلاء مساحة الجهاز.</p>
      </div>

      <div className="section-title">
        <h2>التثبيت على الجوال</h2>
      </div>
      <div className="card small col" style={{ gap: 8 }}>
        <p>
          <strong>iPhone (Safari):</strong> افتح الرابط في Safari ← زر المشاركة ← «إضافة إلى الشاشة الرئيسية».
        </p>
        <p>
          <strong>Android (Chrome):</strong> قائمة ⋮ ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
        </p>
        <p className="muted">بعد التثبيت يعمل التطبيق بواجهة كاملة ودون اتصال بالإنترنت.</p>
      </div>

      <div className="section-title">
        <h2 style={{ color: 'var(--danger)' }}>منطقة الخطر</h2>
      </div>
      <div className="card">
        <button className="btn danger block" onClick={wipe}>
          <TrashIcon /> حذف جميع البيانات
        </button>
      </div>

      <p className="xs muted mt-16" style={{ textAlign: 'center' }}>
        وقتي — الإصدار 1.0.0 · البيانات محلية 100٪
      </p>

      {pending?.data && (
        <Sheet title="استيراد نسخة احتياطية" onClose={() => setPending(null)}>
          <div className="card" style={{ padding: 12 }}>
            <div className="kv">
              <span className="k">تاريخ النسخة</span>
              <span className="v">{formatDateTime(new Date(pending.data.exportedAt).getTime() || Date.now())}</span>
            </div>
            <div className="kv">
              <span className="k">المشاريع</span>
              <span className="v num">{pending.stats?.projects}</span>
            </div>
            <div className="kv">
              <span className="k">الجلسات</span>
              <span className="v num">{pending.stats?.sessions}</span>
            </div>
            <div className="kv">
              <span className="k">سعر الساعة الافتراضي في النسخة</span>
              <span className="v num">{formatNumber(pending.data.settings.defaultHourlyRate)}</span>
            </div>
            {pending.data.activeTimer && (
              <div className="kv">
                <span className="k">تحتوي على مؤقت مفتوح</span>
                <span className="v">نعم</span>
              </div>
            )}
          </div>
          {pending.warnings.length > 0 && (
            <div className="card mt-12" style={{ padding: 12, borderColor: 'var(--warning)' }}>
              <p className="small row bold">
                <AlertIcon style={{ width: 18, height: 18, color: 'var(--warning)' }} /> تحذيرات ({pending.warnings.length})
              </p>
              <ul className="xs muted" style={{ paddingInlineStart: 18, margin: '6px 0 0' }}>
                {pending.warnings.slice(0, 8).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {pending.warnings.length > 8 && <li>…</li>}
              </ul>
            </div>
          )}
          <p className="small muted mt-12">
            <strong>دمج:</strong> يضيف السجلات ويحدّث المتطابقة بالمعرّف مع الاحتفاظ ببياناتك الحالية. <strong>استبدال:</strong> يحذف كل ما لديك ويستعيد النسخة كما هي.
          </p>
          <div className="form-actions">
            <button className="btn" onClick={() => doImport('merge')}>
              دمج مع الحالي
            </button>
            <button className="btn danger" onClick={() => doImport('replace')}>
              استبدال الكل
            </button>
          </div>
        </Sheet>
      )}
    </Page>
  );
}
