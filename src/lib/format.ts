/** Formatting helpers — Arabic (Saudi) locale, Western digits for clarity in numbers. */

// Arabic (Saudi) wording, Western digits, Gregorian calendar (ar-SA defaults to Hijri).
const NUM_LOCALE = 'ar-SA-u-nu-latn-ca-gregory';

export function formatMoney(amount: number, opts: { decimals?: 'auto' | 2 } = {}): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const hasFraction = Math.abs(n - Math.round(n)) > 0.0001;
  const minimumFractionDigits = opts.decimals === 2 || hasFraction ? 2 : 0;
  const formatted = new Intl.NumberFormat(NUM_LOCALE, {
    minimumFractionDigits,
    maximumFractionDigits: 2,
  }).format(n);
  return `${formatted} ر.س`;
}

export function formatNumber(n: number, maxFraction = 2): string {
  return new Intl.NumberFormat(NUM_LOCALE, { maximumFractionDigits: maxFraction }).format(n);
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** HH:MM:SS for live timer */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}

/** Human duration: "3 س 30 د" ; with seconds when `withSeconds` */
export function formatDuration(totalSeconds: number, withSeconds = false): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} س`);
  if (m > 0 || h > 0) parts.push(`${m} د`);
  if (withSeconds || (h === 0 && m === 0)) parts.push(`${sec} ث`);
  return parts.join(' ');
}

/** Decimal hours e.g. 3.5 */
export function formatHours(totalSeconds: number): string {
  return formatNumber(totalSeconds / 3600, 2);
}

export function formatDate(ts: number | string | Date): string {
  const d = new Date(ts);
  return new Intl.DateTimeFormat(NUM_LOCALE, { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' }).format(d);
}

/** YYYY/MM/DD — built by hand to avoid locale bidi marks breaking inside LTR number spans */
export function formatDateShort(ts: number | string | Date): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

export function formatTime(ts: number | Date): string {
  return new Intl.DateTimeFormat(NUM_LOCALE, { hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
}

export function formatDateTime(ts: number | Date): string {
  return `${formatDateShort(ts)} ${formatTime(ts)}`;
}

/** Local date key YYYY-MM-DD */
export function dateKey(ts: number | Date): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** For <input type="datetime-local"> */
export function toLocalInputValue(ts: number): string {
  const d = new Date(ts);
  return `${dateKey(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fromLocalInputValue(v: string): number {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : NaN;
}

export function todayKey(): string {
  return dateKey(Date.now());
}
