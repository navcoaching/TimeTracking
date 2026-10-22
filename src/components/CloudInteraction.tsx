import { useEffect, useState } from 'react';
import { INTERACTION_LABELS, useCloudInteraction } from '../services/cloud';
import { Sheet } from './Modal';

/**
 * Renders Dexie Cloud's login/OTP/alert prompts as an Arabic bottom sheet.
 * Mounted once at app level; shows nothing unless the addon asks for input.
 */
export function CloudInteraction() {
  const ui = useCloudInteraction();
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => setValues({}), [ui?.type]);
  if (!ui) return null;

  const labels = INTERACTION_LABELS[ui.type] ?? INTERACTION_LABELS.generic;
  const fields = Object.entries(ui.fields ?? {}) as [string, { type?: string; label?: string; placeholder?: string }][];
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    ui.onSubmit(values as never);
  };

  return (
    <Sheet title={labels.title} onClose={ui.onCancel}>
      <form onSubmit={submit} noValidate>
        {labels.hint && <p className="small muted" style={{ marginBottom: 12 }}>{labels.hint}</p>}
        {ui.alerts?.map((a, i) => (
          <p key={i} className={a.type === 'error' ? 'error' : 'small'} style={{ marginBottom: 8 }} role={a.type === 'error' ? 'alert' : undefined}>
            {translateAlert(a)}
          </p>
        ))}
        {fields.map(([name, f]) => (
          <div className="field" key={name}>
            <label htmlFor={`dxc-${name}`}>{labels.field ?? f.label ?? name}</label>
            <input
              id={`dxc-${name}`}
              className="input"
              type={name === 'email' ? 'email' : 'text'}
              inputMode={name === 'otp' ? 'numeric' : name === 'email' ? 'email' : 'text'}
              autoComplete={name === 'otp' ? 'one-time-code' : name === 'email' ? 'email' : 'off'}
              dir="ltr"
              placeholder={f.placeholder}
              value={values[name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
              autoFocus
            />
          </div>
        ))}
        <div className="form-actions">
          {ui.cancelLabel && (
            <button type="button" className="btn ghost" onClick={ui.onCancel}>
              إلغاء
            </button>
          )}
          <button type="submit" className={`btn ${ui.type === 'logout-confirmation' ? 'danger solid' : 'primary'}`}>
            {labels.submit}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function translateAlert(a: { type: string; messageCode?: string; message: string; messageParams?: Record<string, string> }): string {
  switch (a.messageCode) {
    case 'OTP_SENT':
      return `أرسلنا رمز التحقق إلى ${a.messageParams?.email ?? 'بريدك'}.`;
    case 'INVALID_OTP':
      return 'الرمز غير صحيح. حاول مجددًا.';
    case 'INVALID_EMAIL':
      return 'البريد الإلكتروني غير صحيح.';
    case 'LOGOUT_CONFIRMATION':
      return 'توجد تغييرات لم تُزامن بعد.';
    case 'LICENSE_LIMIT_REACHED':
      return 'تم بلوغ حد رخصة الحساب السحابي. البيانات المحلية سليمة لكن المزامنة متوقفة.';
    default:
      if (/could not connect/i.test(a.message)) return 'تعذر الاتصال بخادم المزامنة. تحقق من الاتصال بالإنترنت، ومن أن نطاق التطبيق مضاف إلى القائمة البيضاء للقاعدة السحابية.';
      return a.message;
  }
}
