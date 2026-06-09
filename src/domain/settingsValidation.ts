/**
 * settingsValidation — the single source of truth for "is this app configured
 * enough to read the vacations board?" (Day-off integration W1.3).
 *
 * The contract (integration plan §4.4) demands that a half-configured board
 * fail LOUDLY — never all-pending or silently-empty reads. So beyond the board
 * id, the five contract-critical column mappings (kind / person / startDate /
 * endDate / approvalStatus) and the two label maps (kindValues, statusValues)
 * are required. A label-map entry counts as configured when it carries a stable
 * monday label ID (W1.2 shape) OR a non-empty label text (legacy blobs saved
 * before label IDs were stored keep working — text is a valid fallback).
 *
 * Consumed by: `core.ts` (app-core settings validation → `useSettings().validation`),
 * `SettingsDialog` (draft validation: per-field errors + disabled Save), and
 * `DayOffView` (the misconfiguration screen). Pure module — no I/O, no React.
 */
import type { DayOffSettings, VacationColumnMap, KindValueMap, StatusValueMap } from '../types';
import type { RequestStatus } from './types';

/** Error-map values are i18n keys; `columns.<field>` keys carry per-column errors. */
export type SettingsErrors = Record<string, string>;

export interface SettingsValidationResult {
  isValid: boolean;
  errors: SettingsErrors;
}

/**
 * The contract-critical column mappings (plan §5/W1.3). `labelKey` points at the
 * existing `settings.fields.*` i18n labels so error texts name the column the
 * same way the mapping UI does. Other columns (workdays, personalType, notes,
 * audit, file, mandatory) stay optional — features degrade gracefully without
 * them; only these five gate correct reads.
 */
export const REQUIRED_COLUMN_FIELDS: { key: keyof VacationColumnMap; labelKey: string }[] = [
  { key: 'kindColumnId', labelKey: 'kind' },
  { key: 'personColumnId', labelKey: 'person' },
  { key: 'startDateColumnId', labelKey: 'startDate' },
  { key: 'endDateColumnId', labelKey: 'endDate' },
  { key: 'approvalStatusColumnId', labelKey: 'approvalStatus' },
];

const REQUIRED_STATUS_KEYS: RequestStatus[] = ['pending', 'approved', 'rejected'];

function hasText(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim() !== '';
}

/** A kind/status label is mapped when it has a stable label ID or (legacy) a text. */
function kindMapComplete(kindValues: KindValueMap | undefined): boolean {
  if (!kindValues) return false;
  return (
    (hasText(kindValues.generalLabelId) || hasText(kindValues.general)) &&
    (hasText(kindValues.personalLabelId) || hasText(kindValues.personal))
  );
}

function statusMapComplete(statusValues: StatusValueMap | undefined): boolean {
  if (!statusValues) return false;
  return REQUIRED_STATUS_KEYS.every(
    (key) => hasText(statusValues.labelIds?.[key]) || hasText(statusValues[key]),
  );
}

/**
 * Validate the settings blob. Until W1.3 only `vacationBoardId` was required —
 * a board with unmapped columns produced silently-empty request lists and
 * all-pending approval reads. Now every contract-critical mapping is required.
 */
export function validateDayOffSettings(settings: DayOffSettings): SettingsValidationResult {
  const errors: SettingsErrors = {};
  if (!settings.vacationBoardId) errors.vacationBoardId = 'app.notConfigured';

  const columns = settings.columns ?? {};
  let anyColumnMissing = false;
  for (const field of REQUIRED_COLUMN_FIELDS) {
    if (!hasText(columns[field.key])) {
      errors[`columns.${field.key}`] = 'settings.validation.columnRequired';
      anyColumnMissing = true;
    }
  }
  // Aggregate key — keyof DayOffSettings, so the SettingsDialogShell tab dot
  // (which matches tab `fields` against error keys) can light up.
  if (anyColumnMissing) errors.columns = 'settings.validation.columnRequired';

  if (!kindMapComplete(settings.kindValues)) errors.kindValues = 'settings.validation.kindValuesRequired';
  if (!statusMapComplete(settings.statusValues)) errors.statusValues = 'settings.validation.statusValuesRequired';

  return { isValid: Object.keys(errors).length === 0, errors };
}

/**
 * One human-readable line per validation failure (for the misconfiguration
 * screen). Column issues carry the column's `settings.fields.*` label key for a
 * `{{field}}` interpolation; the rest are self-contained message keys.
 */
export interface SettingsValidationIssue {
  messageKey: string;
  /** Present on column issues: i18n key of the column's display name. */
  fieldLabelKey?: string;
}

export function settingsValidationIssues(errors: SettingsErrors): SettingsValidationIssue[] {
  const issues: SettingsValidationIssue[] = [];
  if (errors.vacationBoardId) issues.push({ messageKey: errors.vacationBoardId });
  for (const field of REQUIRED_COLUMN_FIELDS) {
    if (errors[`columns.${field.key}`]) {
      issues.push({
        messageKey: 'settings.validation.columnMissing',
        fieldLabelKey: `settings.fields.${field.labelKey}`,
      });
    }
  }
  if (errors.kindValues) issues.push({ messageKey: errors.kindValues });
  if (errors.statusValues) issues.push({ messageKey: errors.statusValues });
  return issues;
}
