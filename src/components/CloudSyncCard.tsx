import { useState } from 'react';
import { CLOUD_ENABLED } from '../db/db';
import { SYNC_PHASE_LABEL, cloudLogin, cloudLogout, cloudSyncNow, useCloudUser, useSyncState } from '../services/cloud';
import { useToast } from './Toast';

/** Settings card: sign in / out and show sync status. Hidden when the build has no cloud URL. */
export function CloudSyncCard() {
  const user = useCloudUser();
  const sync = useSyncState();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  if (!CLOUD_ENABLED) {
    return (
      <div className="card small muted">
        المزامنة السحابية غير مفعّلة في هذا الإصدار. البيانات محلية على هذا الجهاز فقط. راجع ملف README لتفعيلها.
      </div>
    );
  }

  const loggedIn = !!user?.isLoggedIn;
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card col" style={{ gap: 10 }}>
      {loggedIn ? (
        <>
          <div className="kv">
            <span className="k">الحساب</span>
            <span className="v" dir="ltr">
              {user?.email ?? user?.userId}
            </span>
          </div>
          <div className="kv">
            <span className="k">حالة المزامنة</span>
            <span className="v" style={{ color: sync?.phase === 'error' ? 'var(--danger)' : sync?.phase === 'in-sync' ? 'var(--success)' : undefined }}>
              {SYNC_PHASE_LABEL[sync?.phase ?? 'initial'] ?? sync?.phase}
            </span>
          </div>
          {sync?.error && <p className="error xs">{String(sync.error.message ?? sync.error)}</p>}
          {user?.license?.status && user.license.status !== 'ok' && <p className="error small">رخصة الحساب السحابي غير فعّالة ({user.license.status}). المزامنة متوقفة والبيانات المحلية سليمة.</p>}
          <div className="row gap-8">
            <button className="btn flex-1" disabled={busy} onClick={() => run(cloudSyncNow, 'تمت المزامنة')}>
              مزامنة الآن
            </button>
            <button className="btn ghost flex-1" disabled={busy} onClick={() => run(cloudLogout, 'تم تسجيل الخروج')}>
              تسجيل الخروج
            </button>
          </div>
          <p className="help">تعمل المزامنة تلقائيًا عند الاتصال بالإنترنت. البيانات تبقى محفوظة محليًا وتعمل دون اتصال، وتُدمج التغييرات عند عودة الاتصال.</p>
        </>
      ) : (
        <>
          <p className="small muted">سجّل الدخول ببريدك الإلكتروني لمزامنة مشاريعك وجلساتك بين أجهزتك. لا كلمة مرور؛ يصلك رمز تحقق على البريد.</p>
          <div className="row">
            <input className="input flex-1" type="email" inputMode="email" dir="ltr" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="البريد الإلكتروني" />
            <button className="btn primary" disabled={busy} onClick={() => run(() => cloudLogin(email.trim() || undefined))}>
              تسجيل الدخول
            </button>
          </div>
          <p className="help">عند أول تسجيل دخول تُرفع بياناتك المحلية الحالية إلى حسابك، وعلى الجهاز الآخر سجّل الدخول بالبريد نفسه لتظهر البيانات.</p>
        </>
      )}
    </div>
  );
}
