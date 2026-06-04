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

/**
 * Column-id mapping for the single "vacations" board. Every day-off entry —
 * personal request OR general/company day — is one item on this board; the
 * `kindColumnId` status discriminates between them.
 */
export interface VacationColumnMap {
  /** Status column whose label separates general (company) from personal entries. */
  kindColumnId?: string;
  /** People column — the employee a personal entry belongs to. */
  personColumnId?: string;
  /** Date column — the entry's start day. */
  startDateColumnId?: string;
  /** Date column — the entry's end day. */
  endDateColumnId?: string;
  /** Numbers column the app fills with the computed number of workdays. */
  workdaysColumnId?: string;
  /** Status column classifying a PERSONAL entry (vacation / sick / reserves). */
  personalTypeColumnId?: string;
  /** Status column classifying a GENERAL entry (holiday / company day / …, free labels). */
  generalTypeColumnId?: string;
  /** Status column holding the approval state of a personal request. */
  approvalStatusColumnId?: string;
  empNoteColumnId?: string;
  mgrNoteColumnId?: string;
  decidedByColumnId?: string;
  decidedAtColumnId?: string;
  fileColumnId?: string;
  /** Checkbox column — a general/company day is mandatory (office closed). */
  mandatoryColumnId?: string;
}

/** Maps each absence type → the label text used by the personal-type status column. */
export type TypeValueMap = Record<AbsenceType, string>;
/** Maps each request status → the label text used by the approval status column. */
export type StatusValueMap = Record<RequestStatus, string>;
/** The two labels of the kind/discriminator status column. */
export interface KindValueMap {
  /** Label that marks an item as a general / company-wide day. */
  general: string;
  /** Label that marks an item as a personal day-off request. */
  personal: string;
}

/**
 * A team — a named group with its own managers and employees (monday user ids).
 * A user may appear in several teams, and may be a manager in one while an
 * employee in another. `managers` may approve requests and see the manager tabs.
 */
export interface Team {
  id: string;
  name: string;
  /** Monday user ids that manage this team (approve + see manager tabs). */
  managers: string[];
  /** Monday user ids that belong to this team as regular members. */
  employees: string[];
}

/**
 * Day-off settings — custom object app (no reliable context.boardId, so the
 * board + column mappings + team/roles are configured here). All day-off data
 * lives on ONE board; the kind status column splits general vs personal.
 */
export interface DayOffSettings {
  /** The single board where every day-off entry (personal + general) lives. */
  vacationBoardId: string | null;
  columns: VacationColumnMap;
  /** Labels in the kind status column that mean general / personal. */
  kindValues: KindValueMap;
  /** Personal-type enum → board status label (vacation/sick/reserves). */
  typeValues: TypeValueMap;
  /** Approval status enum → board status label (pending/approved/rejected). */
  statusValues: StatusValueMap;
  /** Teams — each with its own managers + employees. Source of truth for roles. */
  teams: Team[];
  languageOverride?: Language | null;
  lastModifiedAt?: string | null;
}

export const DEFAULT_SETTINGS: DayOffSettings = {
  vacationBoardId: null,
  columns: {},
  kindValues: { general: '', personal: '' },
  typeValues: { vacation: '', sick: '', reserves: '' },
  statusValues: { pending: '', approved: '', rejected: '' },
  teams: [],
  languageOverride: null,
  lastModifiedAt: null,
};

export interface AppError {
  message: string;
  details?: unknown;
}
