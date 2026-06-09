/**
 * Pure date helpers for Day-off (RTL/Hebrew calendar, Israel weekend = Fri/Sat).
 * No i18n imports here so this stays unit-testable across timezones (`pnpm test:tz`).
 * The locale-aware formatters take their month/day NAMES as args — bind them via
 * `useL10n()` (src/domain/useL10n.ts) which pulls the arrays + `t()` from i18next.
 */
import type { DayKey, DayWindow } from './types';

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local-calendar day-key 'YYYY-MM-DD' for a Date. */
export function toKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(s: DayKey): Date {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

/** The inclusive [from,to] day window covering a whole calendar year. */
export function yearWindow(year: number): DayWindow {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** True when a [start, end] day-key range overlaps the inclusive [from, to]
 *  window (both ranges inclusive on both ends — integration contract §4.5:
 *  `start <= to AND end >= from`). Day-keys compare lexicographically. */
export function rangeOverlapsWindow(start: DayKey, end: DayKey, window: DayWindow): boolean {
  return start <= window.to && end >= window.from;
}

/** True when a [start, end] day-key range overlaps any day in `year`. */
export function rangeOverlapsYear(start: DayKey, end: DayKey, year: number): boolean {
  return rangeOverlapsWindow(start, end, yearWindow(year));
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Israel weekend: Friday (5) + Saturday (6). */
export function isWeekend(d: Date): boolean {
  const g = d.getDay();
  return g === 5 || g === 6;
}

export function sameDay(a: Date, b: Date): boolean {
  return toKey(a) === toKey(b);
}

/** Today as a local midnight Date (real current day — replaces the prototype's mock TODAY). */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function todayKey(): DayKey {
  return toKey(startOfToday());
}

/** Inclusive list of day-keys from start..end. */
export function eachDay(startKey: DayKey, endKey: DayKey): DayKey[] {
  const out: DayKey[] = [];
  let cur = fromKey(startKey);
  const end = fromKey(endKey);
  while (cur <= end) {
    out.push(toKey(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

/** Count of workdays (excludes Fri/Sat) in the inclusive range. */
export function workdaysBetween(startKey: DayKey, endKey: DayKey): number {
  return eachDay(startKey, endKey).filter((k) => !isWeekend(fromKey(k))).length;
}

/** Count of calendar days in the inclusive range. */
export function calDaysBetween(startKey: DayKey, endKey: DayKey): number {
  return eachDay(startKey, endKey).length;
}

/** 6×7 month matrix starting on Sunday (each row a week of Dates). */
export function buildMonthMatrix(monthDate: Date): Date[][] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = addDays(first, -first.getDay()); // back to Sunday
  const weeks: Date[][] = [];
  let cur = start;
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let d = 0; d < 7; d++) {
      row.push(cur);
      cur = addDays(cur, 1);
    }
    weeks.push(row);
  }
  return weeks;
}

/* ---------- locale-aware formatters (pure: names/labels passed in) ---------- */

export interface MonthDayNames {
  months: string[];
  monthsShort: string[];
  days: string[];
  daysShort: string[];
  /** Locale "in"-prefix glued to month names (Hebrew "ב"). */
  inPrefix: string;
  /** Locale geresh appended to short months (Hebrew "׳"). */
  geresh: string;
}

/** Labels for relative-day phrasing, supplied by i18n. */
export interface RelDayLabels {
  today: string;
  tomorrow: string;
  yesterday: string;
  inDays: (n: number) => string;
  agoDays: (n: number) => string;
}

/** "5 ספט׳" — short day + short month. */
export function fmtDate(key: DayKey, names: Pick<MonthDayNames, 'monthsShort' | 'geresh'>): string {
  const d = fromKey(key);
  const g = names.geresh;
  return `${d.getDate()} ${names.monthsShort[d.getMonth()]}${g}`.replace(g + g, g);
}

/** "שני, 5 בספטמבר 2026" (day name + long date). */
export function fmtDateLong(key: DayKey, names: Pick<MonthDayNames, 'days' | 'months' | 'inPrefix'>): string {
  const d = fromKey(key);
  return `${names.days[d.getDay()]}, ${d.getDate()} ${names.inPrefix}${names.months[d.getMonth()]} ${d.getFullYear()}`;
}

/** A date range, condensed when start/end share a month or year. */
export function fmtRange(
  startKey: DayKey,
  endKey: DayKey,
  names: Pick<MonthDayNames, 'months' | 'monthsShort' | 'inPrefix' | 'geresh'>,
): string {
  const a = fromKey(startKey);
  const b = fromKey(endKey);
  const p = names.inPrefix;
  if (startKey === endKey) return `${a.getDate()} ${p}${names.months[a.getMonth()]} ${a.getFullYear()}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
    return `${a.getDate()}–${b.getDate()} ${p}${names.months[a.getMonth()]} ${a.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear())
    return `${a.getDate()} ${p}${names.monthsShort[a.getMonth()]} – ${b.getDate()} ${p}${names.monthsShort[b.getMonth()]} ${a.getFullYear()}`;
  return `${fmtDate(startKey, names)} ${a.getFullYear()} – ${fmtDate(endKey, names)} ${b.getFullYear()}`;
}

/** Relative phrasing vs `today` (defaults to real today). */
export function relDays(key: DayKey, labels: RelDayLabels, today: Date = startOfToday()): string {
  const d = fromKey(key);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return labels.today;
  if (diff === 1) return labels.tomorrow;
  if (diff === -1) return labels.yesterday;
  if (diff > 1) return labels.inDays(diff);
  return labels.agoDays(Math.abs(diff));
}
