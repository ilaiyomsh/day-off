/**
 * entitlementsService — maps the entitlements board -> Entitlement domain objects.
 *
 * Board shape (one row per employee × type × year):
 *   - person col (EntitlementColumnMap.personColumnId) -> employeeId (first person)
 *   - type col   (EntitlementColumnMap.typeColumnId)   -> AbsenceType, mapped via
 *                  ctx.typeValues (status/dropdown/text — the column `text` label)
 *   - year col   (EntitlementColumnMap.yearColumnId)   -> number
 *   - entitled   (EntitlementColumnMap.entitledColumnId) -> number
 *
 * Read-only (entitlements are managed on the board itself). All monday I/O goes
 * through the `mondayApi` funnel; pure parsing lives in columnMap.ts.
 */

import mondayApi from './mondayApi';
import type { AbsenceType, Entitlement } from '../domain/types';
import type { EntitlementColumnMap, TypeValueMap } from '../types';
import { parsePeople, parseStatusText, parseNumberText } from './columnMap';

export interface EntCtx {
  boardId: string;
  cols: EntitlementColumnMap;
  typeValues: TypeValueMap;
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

function columnIds(cols: EntitlementColumnMap): string[] {
  return [
    cols.personColumnId,
    cols.typeColumnId,
    cols.yearColumnId,
    cols.entitledColumnId,
  ].filter((id): id is string => Boolean(id));
}

function byId(item: RawItem): Map<string, RawColumnValue> {
  const map = new Map<string, RawColumnValue>();
  for (const cv of item.column_values ?? []) map.set(cv.id, cv);
  return map;
}

/** Build a reverse lookup: board label text -> AbsenceType, from ctx.typeValues. */
function buildTypeLookup(typeValues: TypeValueMap): Map<string, AbsenceType> {
  const lookup = new Map<string, AbsenceType>();
  (Object.keys(typeValues) as AbsenceType[]).forEach((type) => {
    const label = typeValues[type];
    if (label) lookup.set(label.trim(), type);
  });
  return lookup;
}

/** List all entitlement rows from the configured board. */
export async function listEntitlements(ctx: EntCtx): Promise<Entitlement[]> {
  const ids = columnIds(ctx.cols);
  const raw = (await mondayApi.getAllItems(
    ctx.boardId,
    ids.length ? ids : undefined,
  )) as RawItem[];

  const typeLookup = buildTypeLookup(ctx.typeValues);
  const out: Entitlement[] = [];

  for (const item of raw) {
    const cv = byId(item);

    const employeeId = ctx.cols.personColumnId
      ? parsePeople(cv.get(ctx.cols.personColumnId)?.value)[0]
      : undefined;
    if (!employeeId) continue;

    const typeLabel = ctx.cols.typeColumnId
      ? parseStatusText(cv.get(ctx.cols.typeColumnId)?.text)
      : '';
    const type = typeLookup.get(typeLabel.trim());
    if (!type) continue;

    const year = ctx.cols.yearColumnId
      ? parseNumberText(cv.get(ctx.cols.yearColumnId)?.text)
      : null;
    if (year == null) continue;

    const entitled = ctx.cols.entitledColumnId
      ? parseNumberText(cv.get(ctx.cols.entitledColumnId)?.text)
      : null;

    out.push({
      employeeId,
      type,
      year,
      entitled: entitled ?? 0,
    });
  }

  return out;
}
