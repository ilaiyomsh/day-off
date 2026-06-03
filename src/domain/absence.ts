/**
 * Absence-type config + balance analytics (pure). Labels are i18n KEYS, resolved
 * by callers via t(); colors are CSS custom properties from tokens.css.
 */
import type { AbsenceType, Balance, DayOffRequest, Entitlement, RequestStatus } from './types';
import { eachDay, fromKey, isWeekend, workdaysBetween } from './dates';

export interface AbsenceTypeMeta {
  id: AbsenceType;
  /** i18n key, e.g. 'types.vacation'. */
  labelKey: string;
  /** CSS variable reference for chips/meters. */
  color: string;
  /** Raw hex (for canvas/inline contexts that can't use a CSS var). */
  hex: string;
}

export const ABSENCE_TYPES: Record<AbsenceType, AbsenceTypeMeta> = {
  vacation: { id: 'vacation', labelKey: 'types.vacation', color: 'var(--color-event-vacation)', hex: '#00c875' },
  sick: { id: 'sick', labelKey: 'types.sick', color: 'var(--color-event-sick)', hex: '#e2445c' },
  reserves: { id: 'reserves', labelKey: 'types.reserves', color: 'var(--color-event-reserves)', hex: '#579bfc' },
};

export const TYPE_ORDER: AbsenceType[] = ['vacation', 'sick', 'reserves'];

/** Icon name (see src/components/ui/Icon) per absence type. */
export const TYPE_ICON: Record<AbsenceType, string> = {
  vacation: 'plane',
  sick: 'alert',
  reserves: 'briefcase',
};

/** i18n keys for status labels. */
export const STATUS_LABEL_KEY: Record<RequestStatus, string> = {
  pending: 'status.pending',
  approved: 'status.approved',
  rejected: 'status.rejected',
};

/** Documentation-hint i18n key for the attachment field, per type. */
export const DOC_HINT_KEY: Record<AbsenceType, string> = {
  vacation: 'request.docHint.vacation',
  sick: 'request.docHint.sick',
  reserves: 'request.docHint.reserves',
};

/** Year a request is attributed to (its start year) — matches the prototype's balance logic. */
export function requestYear(r: Pick<DayOffRequest, 'start'>): number {
  return Number(r.start.slice(0, 4));
}

/** Sum of pending workdays for (employee × type × year). */
export function pendingDaysFor(requests: DayOffRequest[], employeeId: string, type: AbsenceType, year: number): number {
  return requests
    .filter((r) => r.employeeId === employeeId && r.type === type && r.status === 'pending' && requestYear(r) === year)
    .reduce((s, r) => s + workdaysBetween(r.start, r.end), 0);
}

/**
 * Balance for (employee × type × year). `entitled` from the entitlements board;
 * `used` = approved workdays; `pending` = pending workdays. (Attributed by start year.)
 */
export function computeBalance(
  requests: DayOffRequest[],
  entitlements: Entitlement[],
  employeeId: string,
  type: AbsenceType,
  year: number,
): Balance {
  const ent = entitlements.find((e) => e.employeeId === employeeId && e.type === type && e.year === year);
  const mine = requests.filter((r) => r.employeeId === employeeId && r.type === type && requestYear(r) === year);
  const used = mine.filter((r) => r.status === 'approved').reduce((s, r) => s + workdaysBetween(r.start, r.end), 0);
  const pending = mine.filter((r) => r.status === 'pending').reduce((s, r) => s + workdaysBetween(r.start, r.end), 0);
  return { entitled: ent?.entitled ?? 0, used, pending };
}

/** Workday day-keys of a request that fall inside `year` (clipped) — for the dashboard breakdown. */
export function reqWorkdayKeysInYear(r: DayOffRequest, year: number): string[] {
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;
  if (r.end < yStart || r.start > yEnd) return [];
  const s = r.start < yStart ? yStart : r.start;
  const e = r.end > yEnd ? yEnd : r.end;
  return eachDay(s, e).filter((k) => !isWeekend(fromKey(k)));
}
