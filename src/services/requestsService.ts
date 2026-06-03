/**
 * requestsService — maps the monday "requests" board (one item per absence
 * request) <-> the app's `DayOffRequest` shape. All API goes through the
 * `mondayApi` funnel; column (de)serialization uses the pure helpers in
 * `./columnMap`. Type/status enums map to/from board status-column labels via
 * the admin-configured `typeValues` / `statusValues`.
 *
 * NOTE: file UPLOAD for new attachments is out of scope for v1 (monday file
 * upload needs a multipart endpoint). Existing file-column assets are parsed on
 * read; the file column is NOT written on create/update.
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
  parseFile,
} from './columnMap';
import type { ColumnValues } from './mondayApi';
import type { RequestColumnMap, TypeValueMap, StatusValueMap } from '../types';
import type { AbsenceType, RequestStatus, DayOffRequest, RequestDraft, DayKey } from '../domain/types';
import { TYPE_ORDER } from '../domain/absence';

export interface RequestsCtx {
  boardId: string;
  cols: RequestColumnMap;
  typeValues: TypeValueMap;
  statusValues: StatusValueMap;
}

const STATUS_ORDER: RequestStatus[] = ['pending', 'approved', 'rejected'];

/** A column_value as returned by the items query. */
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

/** Items query that also pulls `created_at` (needed for `submittedAt`). */
const REQUESTS_QUERY = `query ($id: [ID!], $cursor: String) {
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
  for (const key of order) {
    if (map[key].trim() === want) return key;
  }
  // case-insensitive fallback
  const lower = want.toLowerCase();
  for (const key of order) {
    if (map[key].trim().toLowerCase() === lower) return key;
  }
  return undefined;
}

/** Index a raw item's column_values by column id. */
function byId(item: RawItem): Map<string, RawColumnValue> {
  const out = new Map<string, RawColumnValue>();
  for (const cv of item.column_values ?? []) out.set(cv.id, cv);
  return out;
}

/** A monday `created_at` (ISO timestamp) → a day-key, or null if absent/invalid. */
function createdAtKey(created?: string | null): DayKey | null {
  if (created == null || created.trim() === '') return null;
  const d = new Date(created);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Map a raw board item → DayOffRequest, or null when it can't form a valid request. */
function mapItem(ctx: RequestsCtx, item: RawItem): DayOffRequest | null {
  const { cols } = ctx;
  const cv = byId(item);
  const get = (colId?: string) => (colId ? cv.get(colId) : undefined);

  // Employee (people column) — first person id.
  const employeeId = parsePeople(get(cols.personColumnId)?.value)[0];
  if (!employeeId) return null;

  // Range (timeline column).
  const range = parseTimeline(get(cols.timelineColumnId)?.value);
  if (!range) return null;

  // Type (status column → enum).
  const typeLabel = parseStatusText(get(cols.typeColumnId)?.text);
  const type: AbsenceType = enumFromLabel(ctx.typeValues, TYPE_ORDER, typeLabel) ?? 'vacation';

  // Status (status column → enum).
  const statusLabel = parseStatusText(get(cols.statusColumnId)?.text);
  const status: RequestStatus = enumFromLabel(ctx.statusValues, STATUS_ORDER, statusLabel) ?? 'pending';

  const note = get(cols.empNoteColumnId)?.text?.trim() || undefined;
  const managerNote = get(cols.mgrNoteColumnId)?.text?.trim() || undefined;
  const decidedBy = parsePeople(get(cols.decidedByColumnId)?.value)[0];
  const decidedAt = parseDateText(get(cols.decidedAtColumnId)?.text) ?? undefined;
  const attachment = parseFile(get(cols.fileColumnId)?.value);

  // submittedAt: item created_at if present, else the request start.
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

export async function listRequests(ctx: RequestsCtx): Promise<DayOffRequest[]> {
  try {
    type Page = { cursor: string | null; items: RawItem[] };
    const items: RawItem[] = [];
    let cursor: string | null = null;
    do {
      const data: { boards: { items_page: Page }[] } = await mondayApi.query<{
        boards: { items_page: Page }[];
      }>(REQUESTS_QUERY, { id: [String(ctx.boardId)], cursor });
      const page: Page | undefined = data.boards?.[0]?.items_page;
      if (page?.items) items.push(...page.items);
      cursor = page?.cursor ?? null;
    } while (cursor);

    const out: DayOffRequest[] = [];
    for (const item of items) {
      const mapped = mapItem(ctx, item);
      if (mapped) out.push(mapped);
    }
    return out;
  } catch (err) {
    logger.error('requestsService', 'listRequests failed', err);
    throw err;
  }
}

/** Build the column_values for a request's content (type, range, employee note). */
function draftColumns(ctx: RequestsCtx, draft: RequestDraft): ColumnValues {
  const { cols, typeValues } = ctx;
  const out: ColumnValues = {};
  if (cols.typeColumnId) out[cols.typeColumnId] = formatStatusLabel(typeValues[draft.type]);
  if (cols.timelineColumnId) out[cols.timelineColumnId] = formatTimeline(draft.start, draft.end);
  if (cols.empNoteColumnId) out[cols.empNoteColumnId] = formatLongText(draft.note ?? '');
  return out;
}

/**
 * Create a request item. `name` is a prebuilt, already-localized label (built by
 * the caller from type + range). If omitted, defaults to `${employeeId} ${start}`
 * (ids/keys only — never a Hebrew literal).
 */
export async function createRequest(
  ctx: RequestsCtx,
  employeeId: string,
  draft: RequestDraft,
  name?: string,
): Promise<void> {
  const { cols, statusValues } = ctx;
  const itemName = name && name.trim() !== '' ? name : `${employeeId} ${draft.start}`;
  try {
    const columns = draftColumns(ctx, draft);
    if (cols.personColumnId) columns[cols.personColumnId] = formatPeople([employeeId]);
    if (cols.statusColumnId) columns[cols.statusColumnId] = formatStatusLabel(statusValues.pending);

    if (draft.attachment) {
      // TODO(attachment-upload): writing a new file column needs monday's
      // multipart add_file_to_column endpoint — out of scope for v1.
      logger.info('requestsService', 'attachment provided on create — skipping upload (v1 out of scope)', {
        name: draft.attachment.name,
      });
    }

    await mondayApi.createItem(ctx.boardId, itemName, columns);
  } catch (err) {
    logger.error('requestsService', 'createRequest failed', err);
    throw err;
  }
}

/** Update a request's content and reset its status back to pending. */
export async function updateRequest(ctx: RequestsCtx, id: string, draft: RequestDraft): Promise<void> {
  const { cols, statusValues } = ctx;
  try {
    const columns = draftColumns(ctx, draft);
    if (cols.statusColumnId) columns[cols.statusColumnId] = formatStatusLabel(statusValues.pending);

    if (draft.attachment) {
      // TODO(attachment-upload): see createRequest — file upload is out of scope for v1.
      logger.info('requestsService', 'attachment provided on update — skipping upload (v1 out of scope)', {
        name: draft.attachment.name,
      });
    }

    await mondayApi.updateMultipleColumnValues(ctx.boardId, id, columns);
  } catch (err) {
    logger.error('requestsService', 'updateRequest failed', err);
    throw err;
  }
}

/** Set a request's status (approve/reject) + the deciding manager and date. */
export async function setStatus(
  ctx: RequestsCtx,
  id: string,
  status: RequestStatus,
  decidedBy: string,
  decidedAt: DayKey,
  managerNote?: string,
): Promise<void> {
  const { cols, statusValues } = ctx;
  try {
    const columns: ColumnValues = {};
    if (cols.statusColumnId) columns[cols.statusColumnId] = formatStatusLabel(statusValues[status]);
    if (cols.decidedByColumnId) columns[cols.decidedByColumnId] = formatPeople([decidedBy]);
    if (cols.decidedAtColumnId) columns[cols.decidedAtColumnId] = formatDate(decidedAt);
    if (managerNote != null && cols.mgrNoteColumnId) columns[cols.mgrNoteColumnId] = formatLongText(managerNote);

    await mondayApi.updateMultipleColumnValues(ctx.boardId, id, columns);
  } catch (err) {
    logger.error('requestsService', 'setStatus failed', err);
    throw err;
  }
}

export async function deleteRequest(id: string): Promise<void> {
  try {
    await mondayApi.deleteItem(id);
  } catch (err) {
    logger.error('requestsService', 'deleteRequest failed', err);
    throw err;
  }
}
