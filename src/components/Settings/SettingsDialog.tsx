import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsDialogShell, type SettingsTabDef, type SettingsTabRenderCtx } from '@axis/app-core';
import { useSettings, logger } from '../../core';
import { MONDAY_STATUS_COLORS, mondayApi } from '../../services/mondayApi';
import { PersonalTypeInUseError, isPersonalTypeLabelInUse } from '../../services/vacationService';
import { listAllUsers } from '../../services/usersService';
import { Icon, PeoplePicker } from '../ui';
import { CompanyDaysTab } from './CompanyDaysTab';
import { SearchableSelect, type SelectOption } from './SearchableSelect';
import type { DayOffSettings, Team, VacationColumnMap, PersonalTypeOption } from '../../types';
import type { RequestStatus, Employee } from '../../domain/types';
import type { MondayBoardOption } from '../../services/mondayApi';

/** A board column descriptor as returned by mondayApi.getBoard. */
interface BoardColumn {
  id: string;
  title: string;
  type: string;
  settings?: unknown;
  settings_str?: string;
}

interface BoardsResponse {
  boards?: { id: string; name: string; columns: BoardColumn[] }[] | null;
}

/** Mapping fields, in display order, each with its i18n label key under settings.fields. */
const COLUMN_FIELDS: { key: keyof VacationColumnMap; labelKey: string }[] = [
  { key: 'kindColumnId', labelKey: 'kind' },
  { key: 'personColumnId', labelKey: 'person' },
  { key: 'startDateColumnId', labelKey: 'startDate' },
  { key: 'endDateColumnId', labelKey: 'endDate' },
  { key: 'workdaysColumnId', labelKey: 'workdays' },
  { key: 'personalTypeColumnId', labelKey: 'personalType' },
  { key: 'approvalStatusColumnId', labelKey: 'approvalStatus' },
  { key: 'mandatoryColumnId', labelKey: 'mandatory' },
  { key: 'empNoteColumnId', labelKey: 'empNote' },
  { key: 'mgrNoteColumnId', labelKey: 'mgrNote' },
  { key: 'decidedByColumnId', labelKey: 'decidedBy' },
  { key: 'decidedAtColumnId', labelKey: 'decidedAt' },
  { key: 'fileColumnId', labelKey: 'file' },
];

const STATUS_KEYS: RequestStatus[] = ['pending', 'approved', 'rejected'];
type StatusLabelOption = PersonalTypeOption;
interface StatusColorChoice {
  id: string;
  colorValue: string | number;
  color: string;
}

function colorChoiceId(value: string | number): string {
  return typeof value === 'number' ? `n:${value}` : `s:${value}`;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseSettings(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return asRecord(parsed);
    } catch {
      return null;
    }
  }
  return asRecord(raw);
}

function parsePersonalTypeOptions(rawSettings: unknown): PersonalTypeOption[] {
  const settings = parseSettings(rawSettings);
  if (!settings) return [];
  const labels = asRecord(settings.labels);
  const labelsColors = asRecord(settings.labels_colors);
  const labelsIds = asRecord(settings.labels_ids);
  if (!labels) return [];

  const out: PersonalTypeOption[] = [];
  for (const [indexKey, rawTitle] of Object.entries(labels)) {
    if (typeof rawTitle !== 'string' || rawTitle.trim() === '') continue;
    const index = Number(indexKey);
    if (!Number.isFinite(index)) continue;
    const colorMeta = labelsColors ? asRecord(labelsColors[indexKey]) : null;
    const idFromIdsMap = labelsIds?.[indexKey];
    const idFromColorMeta = colorMeta?.id;
    const color =
      (typeof colorMeta?.color === 'string' && colorMeta.color) ||
      (typeof colorMeta?.border === 'string' && colorMeta.border) ||
      'var(--color-event-vacation)';
    out.push({
      id: String(idFromIdsMap ?? idFromColorMeta ?? indexKey),
      title: rawTitle,
      color,
      index,
    });
  }
  out.sort((a, b) => a.index - b.index);
  return out;
}

function normalizeLabel(label: string | undefined | null): string {
  return (label ?? '').trim().toLowerCase();
}

function findOptionIdByLabel(options: StatusLabelOption[], label: string | undefined | null): string | undefined {
  const normalized = normalizeLabel(label);
  if (!normalized) return undefined;
  return options.find((opt) => normalizeLabel(opt.title) === normalized)?.id;
}

function findOptionColorByLabel(options: StatusLabelOption[], label: string | undefined | null): string | undefined {
  const normalized = normalizeLabel(label);
  if (!normalized) return undefined;
  return options.find((opt) => normalizeLabel(opt.title) === normalized)?.color;
}

function samePersonalTypeOptions(a: PersonalTypeOption[], b: PersonalTypeOption[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id) return false;
    if (a[i].title !== b[i].title) return false;
    if (a[i].color !== b[i].color) return false;
    if (a[i].index !== b[i].index) return false;
  }
  return true;
}

function isStatusColumnType(type?: string): boolean {
  const normalized = (type ?? '').trim().toLowerCase();
  return normalized === 'color' || normalized === 'status';
}

function collectStatusColorChoices(options: PersonalTypeOption[]): StatusColorChoice[] {
  const byId = new Map<string, StatusColorChoice>(
    MONDAY_STATUS_COLORS.map((c) => [
      colorChoiceId(c.enum),
      {
        id: colorChoiceId(c.enum),
        colorValue: c.enum,
        color: c.hex,
      },
    ]),
  );
  // Keep any live board colors that don't map to the official list.
  for (const opt of options) {
    const value = opt.colorValue ?? opt.color;
    const id = colorChoiceId(value);
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        colorValue: value,
        color: opt.color,
      });
    }
  }
  return [...byId.values()];
}

/** Lazily load + cache the columns of the single configured board. */
function useBoardColumns(boardId: string | null) {
  const [columns, setColumns] = useState<Record<string, BoardColumn[]>>({});

  const load = useCallback(async (id: string) => {
    try {
      const data = (await mondayApi.getBoard(id)) as BoardsResponse;
      const cols = data.boards?.[0]?.columns ?? [];
      setColumns((prev) => ({ ...prev, [id]: cols }));
    } catch (err) {
      logger.error('SettingsDialog', 'failed to load board columns', { boardId: id, err });
      setColumns((prev) => ({ ...prev, [id]: [] }));
    }
  }, []);

  useEffect(() => {
    // Async board-columns fetch (setState happens after await, not synchronously).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (boardId) void load(boardId);
  }, [boardId, load]);

  return boardId ? columns[boardId] ?? [] : [];
}

function useAccountBoards(enabled: boolean) {
  const [boards, setBoards] = useState<MondayBoardOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void mondayApi
      .listBoardsByType(['board'])
      .then((items) => {
        if (!cancelled) setBoards(items);
      })
      .catch((err) => {
        logger.error('SettingsDialog', 'failed to load account boards', { err });
        if (!cancelled) setBoards([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { boards, loading };
}

/**
 * Day-off settings UI — built on app-core's SettingsDialogShell (#17). One board
 * holds every entry; the kind status column splits general vs personal. The shell
 * owns the frame/tabs/draft/save; this file declares the tabs + fields.
 * Tabs: Board (id), Mapping (column dropdowns + kind/type/status value maps),
 * Team & roles.
 */
export function SettingsDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const { boards, loading } = useAccountBoards(isOpen);
  const [personalTypeError, setPersonalTypeError] = useState<string | null>(null);

  const syncAndPersistPersonalTypes = useCallback(
    async (next: DayOffSettings): Promise<DayOffSettings> => {
      const boardId = next.vacationBoardId;
      const statusColumnId = next.columns.personalTypeColumnId;
      if (!boardId || !statusColumnId) return { ...next, personalTypes: [] };

      const liveMeta = await mondayApi.getStatusColumnSnapshotMeta(boardId, statusColumnId);
      const live = liveMeta.labels;
      const revision = liveMeta.revision;
      const edited = (next.personalTypes ?? []).slice().sort((a, b) => a.index - b.index);

      const isSame =
        edited.length === live.length &&
        edited.every((label) => {
          const src = live.find((l) => l.id === label.id);
          return (
            src != null &&
            src.title === label.title &&
            String(src.colorValue ?? src.color) === String(label.colorValue ?? label.color)
          );
        });
      if (!isSame) {
        if (!revision) throw new Error('Missing status column revision');
        const existingLabelIds = new Set(
          live.map((label) => Number(label.id)).filter((id) => Number.isFinite(id)),
        );
        const editedIds = new Set(edited.map((label) => label.id));
        const deactivated = live
          .filter((label) => !editedIds.has(label.id) && existingLabelIds.has(Number(label.id)))
          .map((label) => ({ ...label, isDeactivated: true }));
        for (const label of deactivated) {
          if (await isPersonalTypeLabelInUse(boardId, statusColumnId, label.id)) {
            throw new PersonalTypeInUseError();
          }
        }
        const payload = [...edited.map((label) => ({ ...label, isDeactivated: false })), ...deactivated];
        await mondayApi.updateStatusColumnSettings(boardId, statusColumnId, revision, payload, existingLabelIds);
      }
      const snapshot = isSame ? live : await mondayApi.getStatusColumnSnapshot(boardId, statusColumnId);
      return { ...next, personalTypes: snapshot };
    },
    [],
  );

  const tabs: SettingsTabDef<DayOffSettings>[] = [
    {
      id: 'general',
      label: t('settings.tabs.general'),
      fields: ['languageOverride'],
      render: ({ draft, setField }: SettingsTabRenderCtx<DayOffSettings>) => (
        <label style={{ display: 'block' }}>
          <span style={{ fontWeight: 600 }}>{t('settings.language.label')}</span>
          <select
            value={draft.languageOverride ?? 'he'}
            onChange={(e) => setField('languageOverride', e.target.value as DayOffSettings['languageOverride'])}
          >
            <option value="he">{t('settings.language.he')}</option>
            <option value="en">{t('settings.language.en')}</option>
          </select>
          <small style={{ color: 'var(--color-text-secondary)', display: 'block', marginTop: 4 }}>
            {t('settings.language.help')}
          </small>
        </label>
      ),
    },
    {
      id: 'board',
      label: t('settings.tabs.board'),
      fields: ['vacationBoardId'],
      render: (ctx: SettingsTabRenderCtx<DayOffSettings>) => (
        <BoardAndMappingTab
          ctx={ctx}
          boardOptions={boards}
          boardsLoading={loading}
          isOpen={isOpen}
          personalTypeError={personalTypeError}
          setPersonalTypeError={setPersonalTypeError}
        />
      ),
    },
    {
      id: 'team',
      label: t('settings.tabs.team'),
      render: ({ draft, setDraft }: SettingsTabRenderCtx<DayOffSettings>) => <TeamTab draft={draft} setDraft={setDraft} />,
    },
    {
      id: 'company',
      label: t('settings.tabs.company'),
      // Company days are live data (not part of the settings draft) — managed inline.
      render: () => <CompanyDaysTab />,
    },
  ];

  return (
    <SettingsDialogShell<DayOffSettings>
      isOpen={isOpen}
      onClose={onClose}
      title={t('settings.title')}
      settings={settings}
      onSave={async (next) => {
        try {
          setPersonalTypeError(null);
          const withTypes = await syncAndPersistPersonalTypes(next);
          await updateSettings(withTypes);
          return true;
        } catch (err) {
          if (err instanceof PersonalTypeInUseError) {
            setPersonalTypeError(t('settings.personalTypeInUse'));
            return false;
          }
          throw err;
        }
      }}
      tabs={tabs}
      validate={(draft): Record<string, string> => (draft.vacationBoardId ? {} : { vacationBoardId: 'app.notConfigured' })}
      labels={{
        save: t('common.save'),
        cancel: t('common.cancel'),
        export: t('common.export'),
        import: t('common.import'),
        invalid: t('settings.fixErrors'),
      }}
      allowExportImport
    />
  );
}

/** Mapping tab — column dropdowns + kind/type/status value maps for the one board. */
function BoardAndMappingTab({
  ctx,
  boardOptions,
  boardsLoading,
  isOpen,
  personalTypeError,
  setPersonalTypeError,
}: {
  ctx: SettingsTabRenderCtx<DayOffSettings>;
  boardOptions: MondayBoardOption[];
  boardsLoading: boolean;
  isOpen: boolean;
  personalTypeError: string | null;
  setPersonalTypeError: (msg: string | null) => void;
}) {
  const { t } = useTranslation();
  const { draft, setDraft, setField, errors } = ctx;
  const cols = useBoardColumns(draft.vacationBoardId);
  const disabled = !draft.vacationBoardId;
  const [personalTypesLoading, setPersonalTypesLoading] = useState(false);
  const [personalTypeChecking, setPersonalTypeChecking] = useState(false);
  const [kindOptionsLoading, setKindOptionsLoading] = useState(false);
  const [approvalStatusOptionsLoading, setApprovalStatusOptionsLoading] = useState(false);
  const [openColorPickerFor, setOpenColorPickerFor] = useState<string | null>(null);
  const lastPersonalTypesSyncKey = useRef<string>('');
  const lastKindSyncKey = useRef<string>('');
  const lastApprovalSyncKey = useRef<string>('');
  const personalTypesLoadGen = useRef(0);
  const kindOptionsLoadGen = useRef(0);
  const approvalStatusLoadGen = useRef(0);
  const colorPickerRootRef = useRef<HTMLDivElement | null>(null);

  const setColumn = (key: keyof VacationColumnMap, value: string | undefined) =>
    setField('columns', { ...draft.columns, [key]: value } as DayOffSettings['columns']);

  const columnOptions: SelectOption[] = cols.map((c) => ({ id: c.id, name: c.title }));
  const personalTypeSettingsRaw = useMemo(() => {
    const col = cols.find((c) => c.id === draft.columns.personalTypeColumnId);
    if (!col) return undefined;
    return col.settings ?? col.settings_str;
  }, [cols, draft.columns.personalTypeColumnId]);
  const kindColumn = useMemo(
    () => cols.find((c) => c.id === draft.columns.kindColumnId),
    [cols, draft.columns.kindColumnId],
  );
  const approvalStatusColumn = useMemo(
    () => cols.find((c) => c.id === draft.columns.approvalStatusColumnId),
    [cols, draft.columns.approvalStatusColumnId],
  );
  const personalTypeColumn = useMemo(
    () => cols.find((c) => c.id === draft.columns.personalTypeColumnId),
    [cols, draft.columns.personalTypeColumnId],
  );
  const detectedPersonalTypes = useMemo(
    () => parsePersonalTypeOptions(personalTypeSettingsRaw),
    [personalTypeSettingsRaw],
  );
  const [kindOptions, setKindOptions] = useState<StatusLabelOption[]>([]);
  const [approvalStatusOptions, setApprovalStatusOptions] = useState<StatusLabelOption[]>([]);
  const personalTypes = useMemo(() => {
    const draftList = draft.personalTypes ?? [];
    if (!draftList.length) return detectedPersonalTypes;
    const detectedById = new Map(detectedPersonalTypes.map((opt) => [opt.id, opt]));
    return draftList.map((draftOpt) => ({
      ...(detectedById.get(draftOpt.id) ?? {}),
      ...draftOpt,
    }));
  }, [detectedPersonalTypes, draft.personalTypes]);
  const personalTypeColorChoices = useMemo(() => collectStatusColorChoices(personalTypes), [personalTypes]);

  const setPersonalTypeLabel = (id: string, title: string) => {
    const next = personalTypes.map((opt) => (opt.id === id ? { ...opt, title } : opt));
    setField('personalTypes', next as DayOffSettings['personalTypes']);
  };
  const setPersonalTypeColor = (id: string, choiceId: string) => {
    const choice = personalTypeColorChoices.find((c) => c.id === choiceId);
    if (!choice) return;
    const next = personalTypes.map((opt) =>
      opt.id === id ? { ...opt, color: choice.color, colorValue: choice.colorValue } : opt,
    );
    setField('personalTypes', next as DayOffSettings['personalTypes']);
  };
  const removePersonalType = async (id: string) => {
    setPersonalTypeError(null);
    if (!id.startsWith('new-') && draft.vacationBoardId && draft.columns.personalTypeColumnId) {
      setPersonalTypeChecking(true);
      try {
        const inUse = await isPersonalTypeLabelInUse(
          draft.vacationBoardId,
          draft.columns.personalTypeColumnId,
          id,
        );
        if (inUse) {
          setPersonalTypeError(t('settings.personalTypeInUse'));
          return;
        }
      } catch (err) {
        logger.error('SettingsDialog', 'failed checking personal type usage', { err, id });
        setPersonalTypeError(t('settings.personalTypeCheckFailed'));
        return;
      } finally {
        setPersonalTypeChecking(false);
      }
    }
    const next = personalTypes.filter((opt) => opt.id !== id).map((opt, idx) => ({ ...opt, index: idx }));
    setField('personalTypes', next as DayOffSettings['personalTypes']);
  };
  const addPersonalType = () => {
    setPersonalTypeError(null);
    const next: PersonalTypeOption = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `new-${crypto.randomUUID()}`
          : `new-${Date.now()}`,
      title: t('settings.newStatusLabel'),
      color: personalTypeColorChoices[0]?.color ?? '#00c875',
      colorValue: personalTypeColorChoices[0]?.colorValue ?? 1,
      index: personalTypes.length,
      isDone: false,
      isDeactivated: false,
    };
    setField('personalTypes', [...personalTypes, next] as DayOffSettings['personalTypes']);
  };
  const setKindValue = (key: 'general' | 'personal', optionId: string | undefined) => {
    const label = kindOptions.find((opt) => opt.id === optionId)?.title ?? '';
    setField('kindValues', { ...draft.kindValues, [key]: label });
  };
  const setStatusValue = (status: RequestStatus, optionId: string | undefined) => {
    const label = approvalStatusOptions.find((opt) => opt.id === optionId)?.title ?? '';
    setDraft((d) => ({ ...d, statusValues: { ...d.statusValues, [status]: label } }));
  };

  useEffect(() => {
    if (!openColorPickerFor) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!colorPickerRootRef.current?.contains(target)) {
        setOpenColorPickerFor(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openColorPickerFor]);

  useEffect(() => {
    if (!isOpen) {
      lastPersonalTypesSyncKey.current = '';
      lastKindSyncKey.current = '';
      lastApprovalSyncKey.current = '';
      personalTypesLoadGen.current += 1;
      kindOptionsLoadGen.current += 1;
      approvalStatusLoadGen.current += 1;
      setPersonalTypesLoading(false);
      setKindOptionsLoading(false);
      setApprovalStatusOptionsLoading(false);
      setOpenColorPickerFor(null);
      return;
    }
    const boardId = draft.vacationBoardId;
    const columnId = draft.columns.personalTypeColumnId;
    const syncKey = `${boardId ?? ''}:${columnId ?? ''}`;
    if (lastPersonalTypesSyncKey.current === syncKey) return;
    lastPersonalTypesSyncKey.current = syncKey;

    if (!boardId || !columnId) {
      setField('personalTypes', [] as DayOffSettings['personalTypes']);
      return;
    }

    let cancelled = false;
    const loadGen = ++personalTypesLoadGen.current;
    setPersonalTypesLoading(true);
    void mondayApi
      .getStatusColumnSnapshot(boardId, columnId)
      .then((snapshot) => {
        if (cancelled) return;
        logger.error('SettingsDialog', 'DEBUG synced personal-type status labels', {
          boardId,
          columnId,
          columnType: personalTypeColumn?.type,
          labelsCount: snapshot.length,
        });
        setField('personalTypes', snapshot as DayOffSettings['personalTypes']);
      })
      .catch((err) => {
        logger.error('SettingsDialog', 'failed to sync personal-type labels', { boardId, columnId, err });
        if (cancelled) return;
        setField('personalTypes', [] as DayOffSettings['personalTypes']);
      })
      .finally(() => {
        if (loadGen === personalTypesLoadGen.current) setPersonalTypesLoading(false);
      });

    return () => {
      cancelled = true;
      lastPersonalTypesSyncKey.current = '';
      personalTypesLoadGen.current += 1;
    };
  }, [isOpen, draft.vacationBoardId, draft.columns.personalTypeColumnId, setField]);

  useEffect(() => {
    if (!isOpen) return;
    const boardId = draft.vacationBoardId;
    const columnId = draft.columns.kindColumnId;
    const syncKey = `${boardId ?? ''}:${columnId ?? ''}`;
    if (lastKindSyncKey.current === syncKey) return;
    lastKindSyncKey.current = syncKey;

    if (!boardId || !columnId) {
      setKindOptions([]);
      return;
    }

    let cancelled = false;
    const loadGen = ++kindOptionsLoadGen.current;
    setKindOptionsLoading(true);
    void mondayApi
      .getStatusColumnSnapshot(boardId, columnId)
      .then((snapshot) => {
        if (cancelled) return;
        logger.error('SettingsDialog', 'DEBUG synced kind status labels', {
          boardId,
          columnId,
          columnType: kindColumn?.type,
          labelsCount: snapshot.length,
        });
        setKindOptions(snapshot);
      })
      .catch((err) => {
        logger.error('SettingsDialog', 'failed to load kind status labels', { boardId, columnId, err });
        if (!cancelled) setKindOptions([]);
      })
      .finally(() => {
        if (loadGen === kindOptionsLoadGen.current) setKindOptionsLoading(false);
      });

    return () => {
      cancelled = true;
      lastKindSyncKey.current = '';
      kindOptionsLoadGen.current += 1;
    };
  }, [isOpen, draft.vacationBoardId, draft.columns.kindColumnId]);

  useEffect(() => {
    if (!isOpen) return;
    const boardId = draft.vacationBoardId;
    const columnId = draft.columns.approvalStatusColumnId;
    const syncKey = `${boardId ?? ''}:${columnId ?? ''}`;
    if (lastApprovalSyncKey.current === syncKey) return;
    lastApprovalSyncKey.current = syncKey;

    if (!boardId || !columnId) {
      setApprovalStatusOptions([]);
      return;
    }

    let cancelled = false;
    const loadGen = ++approvalStatusLoadGen.current;
    setApprovalStatusOptionsLoading(true);
    void mondayApi
      .getStatusColumnSnapshot(boardId, columnId)
      .then((snapshot) => {
        if (cancelled) return;
        logger.error('SettingsDialog', 'DEBUG synced approval status labels', {
          boardId,
          columnId,
          columnType: approvalStatusColumn?.type,
          labelsCount: snapshot.length,
        });
        setApprovalStatusOptions(snapshot);
      })
      .catch((err) => {
        logger.error('SettingsDialog', 'failed to load approval-status labels', { boardId, columnId, err });
        if (!cancelled) setApprovalStatusOptions([]);
      })
      .finally(() => {
        if (loadGen === approvalStatusLoadGen.current) setApprovalStatusOptionsLoading(false);
      });

    return () => {
      cancelled = true;
      lastApprovalSyncKey.current = '';
      approvalStatusLoadGen.current += 1;
    };
  }, [isOpen, draft.vacationBoardId, draft.columns.approvalStatusColumnId]);

  useEffect(() => {
    if (!samePersonalTypeOptions(draft.personalTypes ?? [], personalTypes)) {
      setField('personalTypes', personalTypes as DayOffSettings['personalTypes']);
    }
  }, [draft.personalTypes, personalTypes, setField]);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section style={{ display: 'grid', gap: 8 }}>
        <label style={{ display: 'block' }}>
          <span style={{ fontWeight: 600 }}>{t('settings.board.label')}</span>
          <SearchableSelect
            options={boardOptions}
            value={draft.vacationBoardId}
            loading={boardsLoading}
            loadingText={t('settings.board.loadingBoards')}
            placeholder={t('settings.board.searchPlaceholder')}
            searchPlaceholder={t('settings.board.searchInputPlaceholder')}
            noResultsText={t('settings.board.noResults')}
            clearText={t('settings.board.clear')}
            allowClear
            onChange={(id) => setField('vacationBoardId', (id ?? null) as DayOffSettings['vacationBoardId'])}
          />
          <small style={{ color: 'var(--color-text-secondary)', display: 'block', marginTop: 4 }}>
            {t('settings.board.help')}
          </small>
          {errors.vacationBoardId && (
            <span style={{ color: 'var(--color-danger)', fontSize: 13, display: 'block' }}>{t(errors.vacationBoardId)}</span>
          )}
        </label>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t('settings.sections.columns')}</h3>
        {disabled && <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.pickBoardFirst')}</small>}
        <div className="settings-columns-grid">
          {COLUMN_FIELDS.map(({ key, labelKey }) => (
            <label key={key} style={{ display: 'block' }}>
              {t(`settings.fields.${labelKey}`)}
              <SearchableSelect
                options={columnOptions}
                value={draft.columns[key] ?? ''}
                disabled={disabled}
                placeholder={t('settings.selectColumn')}
                searchPlaceholder={t('settings.column.searchInputPlaceholder')}
                noResultsText={t('settings.column.noResults')}
                clearText={t('settings.column.clear')}
                allowClear
                onChange={(id) => setColumn(key, id)}
              />
            </label>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t('settings.kindValues.title')}</h3>
        <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.kindValues.help')}</small>
        {!draft.vacationBoardId ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.pickBoardFirst')}</small>
        ) : kindOptionsLoading ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.loadingStatusLabels')}</small>
        ) : !draft.columns.kindColumnId ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.pickKindColumnFirst')}</small>
        ) : !isStatusColumnType(kindColumn?.type) ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.selectedColumnIsNotStatus')}</small>
        ) : kindOptions.length === 0 ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.kindValuesEmpty')}</small>
        ) : (
          <div className="settings-kind-grid">
            {(['general', 'personal'] as const).map((k) => (
              <label key={k} style={{ display: 'block' }}>
                <span className="settings-value-label">
                  {findOptionColorByLabel(kindOptions, draft.kindValues[k]) && (
                    <span
                      className="settings-value-dot"
                      style={{ backgroundColor: findOptionColorByLabel(kindOptions, draft.kindValues[k]) }}
                    />
                  )}
                  {t(`settings.kindValues.${k}`)}
                </span>
                <SearchableSelect
                  options={kindOptions.map((opt) => ({ id: opt.id, name: opt.title, color: opt.color }))}
                  value={findOptionIdByLabel(kindOptions, draft.kindValues[k])}
                  placeholder={t('settings.selectStatusLabel')}
                  searchPlaceholder={t('settings.column.searchInputPlaceholder')}
                  noResultsText={t('settings.column.noResults')}
                  clearText={t('settings.column.clear')}
                  allowClear
                  onChange={(id) => setKindValue(k, id)}
                />
              </label>
            ))}
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t('settings.typeValues.title')}</h3>
        <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.typeValues.help')}</small>
        {personalTypeError ? (
          <small style={{ color: 'var(--color-danger)', display: 'block' }}>{personalTypeError}</small>
        ) : null}
        {!draft.vacationBoardId ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.pickBoardFirst')}</small>
        ) : personalTypesLoading ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.loadingStatusLabels')}</small>
        ) : !draft.columns.personalTypeColumnId ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.pickPersonalTypeColumnFirst')}</small>
        ) : !isStatusColumnType(personalTypeColumn?.type) ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.selectedColumnIsNotStatus')}</small>
        ) : personalTypes.length === 0 ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.personalTypeValuesEmpty')}</small>
        ) : (
          <div className="settings-type-editor-grid">
            {personalTypes.map((typeOpt) => (
              <label key={typeOpt.id} className="settings-type-editor">
                <input
                  type="hidden"
                  value={String(typeOpt.colorValue ?? typeOpt.color)}
                  readOnly
                />
                <div className="settings-type-editor-color" ref={openColorPickerFor === typeOpt.id ? colorPickerRootRef : undefined}>
                  <button
                    type="button"
                    className="settings-type-editor-color-trigger"
                    aria-label={t('settings.typeColor')}
                    onClick={(e) => {
                      e.preventDefault();
                      setOpenColorPickerFor((curr) => (curr === typeOpt.id ? null : typeOpt.id));
                    }}
                  >
                    <span className="settings-type-editor-swatch" style={{ backgroundColor: typeOpt.color }} />
                  </button>
                  {openColorPickerFor === typeOpt.id && (
                    <div className="settings-type-editor-color-popover">
                      <div className="settings-type-editor-color-grid">
                        {personalTypeColorChoices.map((choice) => {
                          const selected = colorChoiceId(typeOpt.colorValue ?? typeOpt.color) === choice.id;
                          return (
                            <button
                              key={choice.id}
                              type="button"
                              className={`settings-type-editor-color-item ${selected ? 'is-selected' : ''}`}
                              style={{ backgroundColor: choice.color }}
                              onClick={(e) => {
                                e.preventDefault();
                                setPersonalTypeColor(typeOpt.id, choice.id);
                                setOpenColorPickerFor(null);
                              }}
                              aria-label={choice.color}
                              title={choice.color}
                            >
                              {selected ? <Icon name="check" size={14} style={{ color: '#fff' }} /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  className="settings-type-editor-input"
                  value={typeOpt.title}
                  onChange={(e) => setPersonalTypeLabel(typeOpt.id, e.target.value)}
                />
                <button
                  type="button"
                  className="settings-type-editor-remove"
                  onClick={() => void removePersonalType(typeOpt.id)}
                  disabled={personalTypeChecking}
                  aria-label={t('settings.removeStatusLabel')}
                  title={t('settings.removeStatusLabel')}
                >
                  <Icon name="trash" size={14} />
                </button>
              </label>
            ))}
          </div>
        )}
        {draft.vacationBoardId && draft.columns.personalTypeColumnId && isStatusColumnType(personalTypeColumn?.type) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={addPersonalType}>
            <Icon name="plus" size={14} /> {t('settings.addStatusLabel')}
          </button>
        )}
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t('settings.statusValues.title')}</h3>
        <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.statusValues.help')}</small>
        {!draft.vacationBoardId ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.pickBoardFirst')}</small>
        ) : approvalStatusOptionsLoading ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.loadingStatusLabels')}</small>
        ) : !draft.columns.approvalStatusColumnId ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.pickApprovalStatusColumnFirst')}</small>
        ) : !isStatusColumnType(approvalStatusColumn?.type) ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.selectedColumnIsNotStatus')}</small>
        ) : approvalStatusOptions.length === 0 ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.statusValuesEmpty')}</small>
        ) : (
          <div className="settings-status-grid">
            {STATUS_KEYS.map((status) => (
              <label key={status} style={{ display: 'block' }}>
                <span className="settings-value-label">
                  {findOptionColorByLabel(approvalStatusOptions, draft.statusValues[status]) && (
                    <span
                      className="settings-value-dot"
                      style={{ backgroundColor: findOptionColorByLabel(approvalStatusOptions, draft.statusValues[status]) }}
                    />
                  )}
                  {t(`settings.statusValues.${status}`)}
                </span>
                <SearchableSelect
                  options={approvalStatusOptions.map((opt) => ({ id: opt.id, name: opt.title, color: opt.color }))}
                  value={findOptionIdByLabel(approvalStatusOptions, draft.statusValues[status])}
                  placeholder={t('settings.selectStatusLabel')}
                  searchPlaceholder={t('settings.column.searchInputPlaceholder')}
                  noResultsText={t('settings.column.noResults')}
                  clearText={t('settings.column.clear')}
                  allowClear
                  onChange={(id) => setStatusValue(status, id)}
                />
              </label>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** A locally-unique id for a new team. */
function newTeamId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `team-${Date.now()}-${Math.floor(performance.now())}`;
}

/** Teams tab — one card per team, each with a managers + employees people-picker. */
function TeamTab({
  draft,
  setDraft,
}: {
  draft: DayOffSettings;
  setDraft: (updater: (d: DayOffSettings) => DayOffSettings) => void;
}) {
  const { t } = useTranslation();
  const [allUsers, setAllUsers] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Load the whole account directory once for the pickers.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const users = await listAllUsers();
        if (!cancelled) setAllUsers(users);
      } catch (err) {
        logger.error('SettingsDialog', 'failed to load users', { err });
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const teams = draft.teams;
  const totalManagers = new Set(teams.flatMap((tm) => tm.managers)).size;

  const patchTeam = (id: string, patch: Partial<Team>) =>
    setDraft((d) => ({ ...d, teams: d.teams.map((tm) => (tm.id === id ? { ...tm, ...patch } : tm)) }));
  // Managers & employees are mutually exclusive within a team.
  const setManagers = (id: string, ids: string[]) =>
    setDraft((d) => ({
      ...d,
      teams: d.teams.map((tm) =>
        tm.id === id ? { ...tm, managers: ids, employees: tm.employees.filter((x) => !ids.includes(x)) } : tm,
      ),
    }));
  const setEmployees = (id: string, ids: string[]) =>
    setDraft((d) => ({
      ...d,
      teams: d.teams.map((tm) =>
        tm.id === id ? { ...tm, employees: ids, managers: tm.managers.filter((x) => !ids.includes(x)) } : tm,
      ),
    }));
  const addTeam = () =>
    setDraft((d) => ({ ...d, teams: [...d.teams, { id: newTeamId(), name: '', managers: [], employees: [] }] }));
  const removeTeam = (id: string) => setDraft((d) => ({ ...d, teams: d.teams.filter((tm) => tm.id !== id) }));

  return (
    <div className="teams-tab">
      <div>
        <span style={{ fontWeight: 600 }}>{t('settings.team.title')}</span>
        <small style={{ color: 'var(--color-text-secondary)', display: 'block', marginTop: 2 }}>{t('settings.team.help')}</small>
      </div>

      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
        {t('settings.team.counts', { team: teams.length, managers: totalManagers })}
      </div>

      {loading ? (
        <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.team.loading')}</small>
      ) : failed ? (
        <small style={{ color: 'var(--color-danger)' }}>{t('settings.team.loadError')}</small>
      ) : (
        <>
          {teams.length === 0 && <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.team.empty')}</small>}
          {teams.map((tm, i) => (
            <div className="team-card" key={tm.id}>
              <div className="team-card-head">
                <input
                  className="team-name-input"
                  value={tm.name}
                  placeholder={t('settings.team.namePlaceholder', { n: i + 1 })}
                  onChange={(e) => patchTeam(tm.id, { name: e.target.value })}
                />
                <button
                  type="button"
                  className="team-remove"
                  aria-label={t('settings.team.removeTeam')}
                  title={t('settings.team.removeTeam')}
                  onClick={() => removeTeam(tm.id)}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <div className="team-field">
                <label>{t('settings.team.managersField')}</label>
                <PeoplePicker
                  users={allUsers}
                  value={tm.managers}
                  onChange={(ids) => setManagers(tm.id, ids)}
                  placeholder={t('settings.team.managersPlaceholder')}
                />
              </div>
              <div className="team-field">
                <label>{t('settings.team.employeesField')}</label>
                <PeoplePicker
                  users={allUsers}
                  value={tm.employees}
                  onChange={(ids) => setEmployees(tm.id, ids)}
                  placeholder={t('settings.team.employeesPlaceholder')}
                />
              </div>
            </div>
          ))}

          <button type="button" className="btn add-team-btn" onClick={addTeam}>
            <Icon name="plus" size={16} strokeWidth={2.5} /> {t('settings.team.addTeam')}
          </button>
        </>
      )}
    </div>
  );
}
