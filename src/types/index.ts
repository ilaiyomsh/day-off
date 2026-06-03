export type Language = 'he' | 'en';
export type Dir = 'rtl' | 'ltr';

export interface MondayUser {
  id?: string;
  name?: string;
  isAdmin?: boolean;
}

export interface MondaySdkContext {
  instanceId?: number;
  boardId?: number;
  user?: { id?: string; name?: string; currentLanguage?: string; isAdmin?: boolean };
  theme?: string;
}

export interface MondayContextValue {
  context: MondaySdkContext | null;
  currentUser: MondayUser;
  language: Language;
  dir: Dir;
  locale: string;
  isMobile: boolean;
}

import type { AbsenceType, RequestStatus } from '../domain/types';

/** Column-id mapping for the requests board (one item per absence request). */
export interface RequestColumnMap {
  personColumnId?: string;
  typeColumnId?: string;
  timelineColumnId?: string;
  statusColumnId?: string;
  empNoteColumnId?: string;
  mgrNoteColumnId?: string;
  decidedByColumnId?: string;
  decidedAtColumnId?: string;
  fileColumnId?: string;
}

/** Column-id mapping for the company-days board (item name = holiday name). */
export interface CompanyDayColumnMap {
  timelineColumnId?: string;
  mandatoryColumnId?: string;
}

/** Column-id mapping for the entitlements board (row per employee × type × year). */
export interface EntitlementColumnMap {
  personColumnId?: string;
  typeColumnId?: string;
  yearColumnId?: string;
  entitledColumnId?: string;
}

/** Maps each absence type → the label text used by the board's Type status column. */
export type TypeValueMap = Record<AbsenceType, string>;
/** Maps each request status → the label text used by the board's Status column. */
export type StatusValueMap = Record<RequestStatus, string>;

/**
 * Day-off settings — custom object app (no reliable context.boardId, so boards +
 * column mappings + team/roles are configured here).
 */
export interface DayOffSettings {
  /** Board where day-off requests live (one item per request). */
  requestsBoardId: string | null;
  /** Board of company-wide days off / holidays. */
  companyDaysBoardId: string | null;
  /** Board of annual entitlements (employee × type × year). */
  entitlementsBoardId: string | null;
  requestColumns: RequestColumnMap;
  companyDayColumns: CompanyDayColumnMap;
  entitlementColumns: EntitlementColumnMap;
  /** Type/status enum → board status-column label. Admin maps these in Settings. */
  typeValues: TypeValueMap;
  statusValues: StatusValueMap;
  /** Team member monday user IDs shown in the team/dashboard views. */
  team: string[];
  /** Subset of `team` (or any user IDs) that may approve and see manager tabs. */
  managers: string[];
  languageOverride?: Language | null;
  lastModifiedAt?: string | null;
}

export const DEFAULT_SETTINGS: DayOffSettings = {
  requestsBoardId: null,
  companyDaysBoardId: null,
  entitlementsBoardId: null,
  requestColumns: {},
  companyDayColumns: {},
  entitlementColumns: {},
  typeValues: { vacation: '', sick: '', reserves: '' },
  statusValues: { pending: '', approved: '', rejected: '' },
  team: [],
  managers: [],
  languageOverride: null,
  lastModifiedAt: null,
};

export interface AppError {
  message: string;
  details?: unknown;
}
