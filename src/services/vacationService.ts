/**
 * vacationService — the single funnel between the one "vacations" board and the
 * app's domain objects. Every item on the board is either a PERSONAL day-off
 * request or a GENERAL (company-wide) day; the `kindColumnId` status label
 * discriminates. `listEntries` reads the board once and splits into both lists,
 * so the data provider keeps its existing `requests` / `companyDays` surface.
 *
 * Replaces the former requestsService + companyDaysService + entitlementsService
 * (the yearly-quota concept was removed). All monday I/O goes through `mondayApi`;
 * pure (de)serialization lives in columnMap.ts. Every catch logs/throws.
 *
 * NOTE: file UPLOAD for new attachments stays out of scope (needs monday's
 * multipart endpoint). Existing file assets are parsed on read only.
 */
import { mondayApi } from './mondayApi';
import { logger } from '../core';
import {
  parsePeople,
  formatPeople,
  parseStatusText,
  formatStatusLabel,
  formatLongText,
  parseTimeline,
  formatTimeline,
  parseDateText,
  formatDate,
  parseCheckbox,
  formatCheckbox,
  parseFile,
} from './columnMap';
import type { ColumnValues } from './mondayApi';
import type { VacationColumnMap, TypeValueMap, StatusValueMap, KindValueMap } from '../types';
import type {
  AbsenceType,
  RequestStatus,
  DayOffRequest,
  RequestDraft,
  CompanyDay,
  CompanyDayDraft,
  DayKey,
} from '../domain/types';
import { TYPE_ORDER } from '../domain/absence';

export interface VacationCtx {
  boardId: string;
  cols: VacationColumnMap;
  kindValues: KindValueMap;
  typeValues: TypeValueMap;
  statusValues: StatusValueMap;
}

const STATUS_ORDER: RequestStatus[] = ['pending', 'approved', 'rejected'];

interface RawColumnValue {
  id: string;
  type?: string;
  text?: string | null;
  value?: string | null;
}

interface RawItem {
  id: string | number;
  name?: string | null;
  created_at?: string | null;
  column_values?: RawColumnValue[] | null;
}

const ENTRIES_QUERY = `query ($id: [ID!], $cursor: String) {
  boards(ids: $id) {
    items_page(limit: 100, cursor: $cursor) {
      cursor
      items { id name created_at column_values { id type text value } }
    }
  }
}`;

/** Reverse-lookup a board label → its enum key (case/whitespace-insensitive). */
function enumFromLabel<K extends string>(map: Record<K, string>, order: K[], label: string): K | undefined {
  const want = label.trim();
  if (want === '') return undefined;
  for (const key of order) if (map[key].trim() === want) return key;
  const lower = want.toLowerCase();
  for (const key of order) if (map[key].trim().toLowerCase() === lower) return key;
  return undefined;
}

function byId(item: RawItem): Map<string, RawColumnValue> {
  const out = new Map<string, RawColumnValue>();
  for (const cv of item.column_values ?? []) out.set(cv.id, cv);
  return out;
}

/** monday `created_at` (ISO) → day-key, or null. */
function createdAtKey(created?: string | null): DayKey | null {
  if (created == null || created.trim() === '') return null;
  const d = new Date(created);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Decide whether an item is a personal request or a general day.
 * The kind status label wins; when it's unmapped/ambiguous, fall back to the
 * presence of a person value (personal) vs. none (general).
 */
function isPersonal(ctx: VacationCtx, get: (id?: string) => RawColumnValue | undefined): boolean {
  const label = parseStatusText(get(ctx.cols.kindColumnId)?.text);
  const personal = ctx.kindValues.personal.trim();
  const general = ctx.kindValues.general.trim();
  if (label !== '') {
    if (personal !== '' && label.toLowerCase() === personal.toLowerCase()) return true;
    if (general !== '' && label.toLowerCase() === general.toLowerCase()) return false;
  }
  // Fallback: an entry with a person is personal.
  return parsePeople(get(ctx.cols.personColumnId)?.value).length > 0;
}

function mapRequest(ctx: VacationCtx, item: RawItem, get: (id?: string) => RawColumnValue | undefined): DayOffRequest | null {
  const { cols } = ctx;
  const employeeId = parsePeople(get(cols.personColumnId)?.value)[0];
  if (!employeeId) return null;
  const range = parseTimeline(get(cols.timelineColumnId)?.value);
  if (!range) return null;

  const typeLabel = parseStatusText(get(cols.personalTypeColumnId)?.text);
  const type: AbsenceType = enumFromLabel(ctx.typeValues, TYPE_ORDER, typeLabel) ?? 'vacation';
  const statusLabel = parseStatusText(get(cols.approvalStatusColumnId)?.text);
  const status: RequestStatus = enumFromLabel(ctx.statusValues, STATUS_ORDER, statusLabel) ?? 'pending';

  const note = get(cols.empNoteColumnId)?.text?.trim() || undefined;
  const managerNote = get(cols.mgrNoteColumnId)?.text?.trim() || undefined;
  const decidedBy = parsePeople(get(cols.decidedByColumnId)?.value)[0];
  const decidedAt = parseDateText(get(cols.decidedAtColumnId)?.text) ?? undefined;
  const attachment = parseFile(get(cols.fileColumnId)?.value);
  const submittedAt = createdAtKey(item.created_at) ?? range.from;

  return {
    id: String(item.id),
    employeeId,
    type,
    start: range.from,
    end: range.to,
    status,
    note,
    managerNote,
    submittedAt,
    decidedBy: decidedBy ?? undefined,
    decidedAt,
    attachment,
  };
}

function mapCompanyDay(ctx: VacationCtx, item: RawItem, get: (id?: string) => RawColumnValue | undefined): CompanyDay | null {
  const { cols } = ctx;
  const range = parseTimeline(get(cols.timelineColumnId)?.value);
  if (!range) return null; // a general day needs a date range
  const mandatory = cols.mandatoryColumnId ? parseCheckbox(get(cols.mandatoryColumnId)?.value) : false;
  const classification = parseStatusText(get(cols.generalTypeColumnId)?.text) || undefined;
  return { id: String(item.id), name: item.name ?? '', start: range.from, end: range.to, mandatory, classification };
}

/** Read the board once and split items into personal requests + general days. */
export async function listEntries(ctx: VacationCtx): Promise<{ requests: DayOffRequest[]; companyDays: CompanyDay[] }> {
  try {
    type Page = { cursor: string | null; items: RawItem[] };
    const items: RawItem[] = [];
    let cursor: string | null = null;
    do {
      const data: { boards: { items_page: Page }[] } = await mondayApi.query<{
        boards: { items_page: Page }[];
      }>(ENTRIES_QUERY, { id: [String(ctx.boardId)], cursor });
      const page: Page | undefined = data.boards?.[0]?.items_page;
      if (page?.items) items.push(...page.items);
      cursor = page?.cursor ?? null;
    } while (cursor);

    const requests: DayOffRequest[] = [];
    const companyDays: CompanyDay[] = [];
    for (const item of items) {
      const get = (id?: string) => (id ? byId(item).get(id) : undefined);
      if (isPersonal(ctx, get)) {
        const r = mapRequest(ctx, item, get);
        if (r) requests.push(r);
      } else {
        const c = mapCompanyDay(ctx, item, get);
        if (c) companyDays.push(c);
      }
    }
    return { requests, companyDays };
  } catch (err) {
    logger.error('vacationService', 'listEntries failed', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Personal request writes
// ---------------------------------------------------------------------------

function requestDraftColumns(ctx: VacationCtx, draft: RequestDraft): ColumnValues {
  const { cols, typeValues } = ctx;
  const out: ColumnValues = {};
  if (cols.personalTypeColumnId) out[cols.personalTypeColumnId] = formatStatusLabel(typeValues[draft.type]);
  if (cols.timelineColumnId) out[cols.timelineColumnId] = formatTimeline(draft.start, draft.end);
  if (cols.empNoteColumnId) out[cols.empNoteColumnId] = formatLongText(draft.note ?? '');
  return out;
}

export async function createRequest(ctx: VacationCtx, employeeId: string, draft: RequestDraft, name?: string): Promise<void> {
  const { cols, statusValues, kindValues } = ctx;
  const itemName = name && name.trim() !== '' ? name : `${employeeId} ${draft.start}`;
  try {
    const columns = requestDraftColumns(ctx, draft);
    if (cols.personColumnId) columns[cols.personColumnId] = formatPeople([employeeId]);
    if (cols.kindColumnId && kindValues.personal) columns[cols.kindColumnId] = formatStatusLabel(kindValues.personal);
    if (cols.approvalStatusColumnId) columns[cols.approvalStatusColumnId] = formatStatusLabel(statusValues.pending);
    if (draft.attachment) {
      logger.info('vacationService', 'attachment on create — skipping upload (v1 out of scope)', { name: draft.attachment.name });
    }
    await mondayApi.createItem(ctx.boardId, itemName, columns);
  } catch (err) {
    logger.error('vacationService', 'createRequest failed', err);
    throw err;
  }
}

export async function updateRequest(ctx: VacationCtx, id: string, draft: RequestDraft): Promise<void> {
  const { cols, statusValues } = ctx;
  try {
    const columns = requestDraftColumns(ctx, draft);
    if (cols.approvalStatusColumnId) columns[cols.approvalStatusColumnId] = formatStatusLabel(statusValues.pending);
    if (draft.attachment) {
      logger.info('vacationService', 'attachment on update — skipping upload (v1 out of scope)', { name: draft.attachment.name });
    }
    await mondayApi.updateMultipleColumnValues(ctx.boardId, id, columns);
  } catch (err) {
    logger.error('vacationService', 'updateRequest failed', err);
    throw err;
  }
}

export async function setStatus(
  ctx: VacationCtx,
  id: string,
  status: RequestStatus,
  decidedBy: string,
  decidedAt: DayKey,
  managerNote?: string,
): Promise<void> {
  const { cols, statusValues } = ctx;
  try {
    const columns: ColumnValues = {};
    if (cols.approvalStatusColumnId) columns[cols.approvalStatusColumnId] = formatStatusLabel(statusValues[status]);
    if (cols.decidedByColumnId) columns[cols.decidedByColumnId] = formatPeople([decidedBy]);
    if (cols.decidedAtColumnId) columns[cols.decidedAtColumnId] = formatDate(decidedAt);
    if (managerNote != null && cols.mgrNoteColumnId) columns[cols.mgrNoteColumnId] = formatLongText(managerNote);
    await mondayApi.updateMultipleColumnValues(ctx.boardId, id, columns);
  } catch (err) {
    logger.error('vacationService', 'setStatus failed', err);
    throw err;
  }
}

export async function deleteRequest(id: string): Promise<void> {
  try {
    await mondayApi.deleteItem(id);
  } catch (err) {
    logger.error('vacationService', 'deleteRequest failed', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// General / company-day writes
// ---------------------------------------------------------------------------

function companyDayColumns(ctx: VacationCtx, draft: CompanyDayDraft): ColumnValues {
  const { cols, kindValues } = ctx;
  const out: ColumnValues = {};
  if (cols.kindColumnId && kindValues.general) out[cols.kindColumnId] = formatStatusLabel(kindValues.general);
  if (cols.timelineColumnId) out[cols.timelineColumnId] = formatTimeline(draft.start, draft.end);
  if (cols.mandatoryColumnId) out[cols.mandatoryColumnId] = formatCheckbox(draft.mandatory);
  return out;
}

export async function saveCompanyDay(ctx: VacationCtx, draft: CompanyDayDraft): Promise<void> {
  try {
    if (draft.id) {
      await mondayApi.updateMultipleColumnValues(ctx.boardId, draft.id, { ...companyDayColumns(ctx, draft), name: draft.name });
    } else {
      await mondayApi.createItem(ctx.boardId, draft.name, companyDayColumns(ctx, draft));
    }
  } catch (err) {
    logger.error('vacationService', 'saveCompanyDay failed', err);
    throw err;
  }
}

export async function deleteCompanyDay(id: string): Promise<void> {
  try {
    await mondayApi.deleteItem(id);
  } catch (err) {
    logger.error('vacationService', 'deleteCompanyDay failed', err);
    throw err;
  }
}
