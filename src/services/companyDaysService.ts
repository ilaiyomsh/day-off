/**
 * companyDaysService — maps the company-days board <-> CompanyDay domain objects.
 *
 * Board shape (one item per holiday / company day):
 *   - item name  = holiday name (CompanyDay.name)
 *   - timeline col (CompanyDayColumnMap.timelineColumnId) = start..end
 *   - mandatory col (CompanyDayColumnMap.mandatoryColumnId) = monday Checkbox
 *
 * All monday I/O goes through the `mondayApi` funnel. Pure (de)serialization is in
 * columnMap.ts. Every catch logs/throws (no console).
 */

import { logger } from '../core';
import mondayApi from './mondayApi';
import type { CompanyDay, CompanyDayDraft } from '../domain/types';
import type { CompanyDayColumnMap } from '../types';
import {
  parseTimeline,
  formatTimeline,
  parseCheckbox,
  formatCheckbox,
} from './columnMap';

export interface CompanyCtx {
  boardId: string;
  cols: CompanyDayColumnMap;
}

interface RawColumnValue {
  id: string;
  type?: string;
  text?: string | null;
  value?: string | null;
}

interface RawItem {
  id: string;
  name: string;
  column_values?: RawColumnValue[];
}

function columnIds(cols: CompanyDayColumnMap): string[] {
  return [cols.timelineColumnId, cols.mandatoryColumnId].filter(
    (id): id is string => Boolean(id),
  );
}

function byId(item: RawItem): Map<string, RawColumnValue> {
  const map = new Map<string, RawColumnValue>();
  for (const cv of item.column_values ?? []) map.set(cv.id, cv);
  return map;
}

/** List all company days from the configured board. */
export async function listCompanyDays(ctx: CompanyCtx): Promise<CompanyDay[]> {
  const ids = columnIds(ctx.cols);
  const raw = (await mondayApi.getAllItems(
    ctx.boardId,
    ids.length ? ids : undefined,
  )) as RawItem[];

  const out: CompanyDay[] = [];
  for (const item of raw) {
    const cv = byId(item);
    const timeline = ctx.cols.timelineColumnId
      ? parseTimeline(cv.get(ctx.cols.timelineColumnId)?.value)
      : null;
    if (!timeline) continue; // a company day needs a date range
    const mandatory = ctx.cols.mandatoryColumnId
      ? parseCheckbox(cv.get(ctx.cols.mandatoryColumnId)?.value)
      : false;
    out.push({
      id: String(item.id),
      name: item.name,
      start: timeline.from,
      end: timeline.to,
      mandatory,
    });
  }
  return out;
}

function draftColumnValues(
  cols: CompanyDayColumnMap,
  draft: CompanyDayDraft,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  if (cols.timelineColumnId) {
    values[cols.timelineColumnId] = formatTimeline(draft.start, draft.end);
  }
  if (cols.mandatoryColumnId) {
    values[cols.mandatoryColumnId] = formatCheckbox(draft.mandatory);
  }
  return values;
}

/** Create a new company day (item name = holiday name). */
export async function createCompanyDay(
  ctx: CompanyCtx,
  draft: CompanyDayDraft,
): Promise<void> {
  await mondayApi.createItem(
    ctx.boardId,
    draft.name,
    draftColumnValues(ctx.cols, draft),
  );
}

/** Update an existing company day. Renames the item and rewrites mapped columns. */
export async function updateCompanyDay(
  ctx: CompanyCtx,
  id: string,
  draft: CompanyDayDraft,
): Promise<void> {
  const values: Record<string, unknown> = {
    ...draftColumnValues(ctx.cols, draft),
    name: draft.name,
  };
  await mondayApi.updateMultipleColumnValues(ctx.boardId, id, values);
}

/** Delete a company day item. */
export async function deleteCompanyDay(id: string): Promise<void> {
  try {
    await mondayApi.deleteItem(id);
  } catch (err) {
    logger.error('companyDaysService', 'deleteCompanyDay failed', err);
    throw err;
  }
}
