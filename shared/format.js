// Formatting. Every figure in the app goes through here so "Cr." reads the
// same everywhere.

const groupDigits = (n) => Math.round(n).toLocaleString('en-US');

/** 1500000 -> "1,500,000". null -> "—". */
export function formatCredits(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return groupDigits(value);
}

/** 412640000 -> "412.6M", 850000 -> "850K", 0 -> "0". */
export function formatCompact(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trim(value / 1e9, abs >= 1e10 ? 1 : 2)}B`;
  if (abs >= 1e6) return `${trim(value / 1e6, abs >= 1e8 ? 0 : abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e3) return `${trim(value / 1e3, abs >= 1e5 ? 0 : 1)}K`;
  return String(Math.round(value));
}

const trim = (n, digits) => Number(n.toFixed(digits)).toString();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "2026-11-14" -> "Saturday 14 November". */
export function formatLongDay(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]}`;
}

/** "2026-11-14" -> "14 November 2026". */
export function formatFullDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

/** "2026-10-19" -> "19 Oct 2026" (or "19 Oct" with { year: false }). Dates are UTC days. */
export function formatDay(iso, { year = true } = {}) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return year ? `${d} ${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`;
}

export const todayUtc = () => new Date().toISOString().slice(0, 10);

/** Whole UTC days from a to b. */
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

/** "today", "yesterday", "12 days ago", "5 months ago". */
export function relativeDay(iso, today = todayUtc()) {
  if (!iso) return 'never';
  const days = daysBetween(iso, today);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 45) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30.4)} months ago`;
  const years = days / 365.25;
  return `${years < 2 ? years.toFixed(1) : Math.round(years)} years ago`;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Skyline GTS-R (R31) '87" -> "Skyline GTS-R (R31)". The year is shown on its own. */
export function modelName(name) {
  return String(name || '').replace(/\s+'\d{2}$/, '').trim();
}

/** 2954 lbs -> 1340 kg. The official list is imperial; GT7 itself shows both. */
export const lbsToKg = (lbs) => (typeof lbs === 'number' ? Math.round(lbs * 0.45359237) : null);
export const hpToKw = (hp) => (typeof hp === 'number' ? Math.round(hp * 0.7457) : null);
