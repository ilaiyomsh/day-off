/**
 * Day-off domain types. The app's UI is built against these; the monday services
 * (src/services) map board items <-> these shapes. Dates are ISO day-keys 'YYYY-MM-DD'.
 */

export type AbsenceType = 'vacation' | 'sick' | 'reserves';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

/** A day-key in 'YYYY-MM-DD' form (local calendar day, no time). */
export type DayKey = string;

export interface Attachment {
  name: string;
  size?: number;
  /** Object URL for a freshly-picked local file, or a monday asset URL. */
  url?: string;
}

/** One absence request = one item on the requests board. */
export interface DayOffRequest {
  id: string;
  employeeId: string;
  type: AbsenceType;
  start: DayKey;
  end: DayKey;
  status: RequestStatus;
  note?: string;
  managerNote?: string;
  /** Day-key the request was submitted (item created_at). */
  submittedAt: DayKey;
  decidedBy?: string;
  decidedAt?: DayKey;
  attachment?: Attachment;
}

/** Company-wide day off / holiday = one item on the company-days board. */
export interface CompanyDay {
  id: string;
  start: DayKey;
  end: DayKey;
  name: string;
  /** true = mandatory (office closed); false = optional (רשות). */
  mandatory: boolean;
  /** Free classification label from the general-type status column (display only). */
  classification?: string;
}

/** Annual entitlement for (employee × type × year) = one row on the entitlements board. */
export interface Entitlement {
  employeeId: string;
  type: AbsenceType;
  year: number;
  entitled: number;
}

/** A team member, resolved from the monday users API. */
export interface Employee {
  id: string;
  name: string;
  title?: string;
  initials: string;
  /** Accent color (hex) derived from the user id. */
  color: string;
  photoUrl?: string;
}

/** Computed balance for an (employee × type × year). `used`/`pending` are derived
 *  live from requests; `entitled` comes from the entitlements board (0 = no quota). */
export interface Balance {
  entitled: number;
  used: number;
  pending: number;
}

/** Payload for creating/editing a request from the request modal. */
export interface RequestDraft {
  type: AbsenceType;
  start: DayKey;
  end: DayKey;
  note?: string;
  attachment?: Attachment;
}

/** Payload for creating/editing a company day. */
export interface CompanyDayDraft {
  id?: string;
  start: DayKey;
  end: DayKey;
  name: string;
  mandatory: boolean;
}
