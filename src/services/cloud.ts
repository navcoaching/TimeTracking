import { useObservable } from 'dexie-react-hooks';
import type { DXCUserInteraction, SyncState, UserLogin } from 'dexie-cloud-addon';
import { BehaviorSubject } from 'rxjs';
import { CLOUD_ENABLED, db } from '../db/db';

/** Thin, typed wrappers around db.cloud so the UI never touches the addon directly. */

// Inert observables used when the build has no cloud URL (db.cloud is then undefined).
const NO_USER = new BehaviorSubject<UserLogin | undefined>(undefined);
const NO_SYNC = new BehaviorSubject<SyncState | undefined>(undefined);
const NO_UI = new BehaviorSubject<DXCUserInteraction | undefined>(undefined);

export function useCloudUser(): UserLogin | undefined {
  return useObservable(() => (CLOUD_ENABLED ? db.cloud.currentUser : NO_USER), []);
}

export function useSyncState(): SyncState | undefined {
  return useObservable(() => (CLOUD_ENABLED ? db.cloud.syncState : NO_SYNC), []);
}

export function useCloudInteraction(): DXCUserInteraction | undefined {
  return useObservable(() => (CLOUD_ENABLED ? db.cloud.userInteraction : NO_UI), []);
}

export async function cloudLogin(email?: string) {
  if (!CLOUD_ENABLED) throw new Error('المزامنة غير مفعّلة في هذا الإصدار');
  await db.cloud.login(email ? { email, grant_type: 'otp' } : undefined);
}

export async function cloudLogout() {
  if (!CLOUD_ENABLED) return;
  await db.cloud.logout();
}

export async function cloudSyncNow() {
  if (!CLOUD_ENABLED) return;
  await db.cloud.sync({ wait: true, purpose: 'push' });
}

export const SYNC_PHASE_LABEL: Record<string, string> = {
  initial: 'لم تبدأ',
  'not-in-sync': 'تغييرات بانتظار المزامنة',
  pushing: 'جارٍ الرفع…',
  pulling: 'جارٍ التنزيل…',
  'in-sync': 'متزامن ✓',
  error: 'خطأ في المزامنة',
  offline: 'دون اتصال (ستُزامن عند الاتصال)',
};

/** Arabic labels for Dexie Cloud's built-in prompts (we render our own GUI). */
export const INTERACTION_LABELS: Record<string, { title: string; hint?: string; field?: string; submit: string }> = {
  email: { title: 'تسجيل الدخول للمزامنة', hint: 'أدخل بريدك الإلكتروني وسنرسل لك رمز تحقق لمرة واحدة.', field: 'البريد الإلكتروني', submit: 'إرسال الرمز' },
  otp: { title: 'رمز التحقق', hint: 'أدخل الرمز الذي وصلك على بريدك.', field: 'الرمز', submit: 'تأكيد' },
  'message-alert': { title: 'تنبيه', submit: 'حسنًا' },
  'logout-confirmation': { title: 'تأكيد تسجيل الخروج', hint: 'توجد تغييرات لم تُزامن بعد وستُفقد إذا سجّلت الخروج الآن.', submit: 'تسجيل الخروج' },
  generic: { title: 'المزامنة', submit: 'متابعة' },
};
