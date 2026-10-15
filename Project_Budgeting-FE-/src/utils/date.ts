/**
 * The one date format used across the app: DD/MM/YYYY (and DD/MM/YYYY, hh:mm AM/PM for
 * timestamps). Accepts API values ("2026-10-13", "2026-10-13T08:30:00Z"), Date objects or
 * timestamps; blank / invalid input returns `fallback`.
 */

type DateInput = string | number | Date | null | undefined;

const pad = (n: number) => String(n).padStart(2, '0');

/** Date-only strings ("2026-10-13") are read as local calendar dates - `new Date("2026-10-13")`
 * is UTC midnight and can show the previous day west of Greenwich. */
export function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 13/10/2026 */
export function formatDate(value: DateInput, fallback = '—'): string {
  const d = toDate(value);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : fallback;
}

/** 13/10/2026, 02:30 PM */
export function formatDateTime(value: DateInput, fallback = '—'): string {
  const d = toDate(value);
  if (!d) return fallback;
  const h = d.getHours();
  return `${formatDate(d)}, ${pad(h % 12 || 12)}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

/** 02:30 PM */
export function formatTime(value: DateInput, fallback = '—'): string {
  const d = toDate(value);
  if (!d) return fallback;
  const h = d.getHours();
  return `${pad(h % 12 || 12)}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}
