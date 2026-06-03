import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsDialogShell, type SettingsTabDef, type SettingsTabRenderCtx } from '@axis/app-core';
import { useSettings, logger } from '../../core';
import { mondayApi } from '../../services/mondayApi';
import { resolveUsers } from '../../services/usersService';
import type {
  DayOffSettings,
  RequestColumnMap,
  CompanyDayColumnMap,
  EntitlementColumnMap,
} from '../../types';
import type { AbsenceType, RequestStatus, Employee } from '../../domain/types';

/** A board column descriptor as returned by mondayApi.getBoard. */
interface BoardColumn {
  id: string;
  title: string;
  type: string;
}

interface BoardsResponse {
  boards?: { id: string; name: string; columns: BoardColumn[] }[] | null;
}

/** Which board each mapping section reads its columns from. */
type BoardKey = 'requestsBoardId' | 'companyDaysBoardId' | 'entitlementsBoardId';

const REQUEST_COLUMN_KEYS: (keyof RequestColumnMap)[] = [
  'personColumnId',
  'typeColumnId',
  'timelineColumnId',
  'statusColumnId',
  'empNoteColumnId',
  'mgrNoteColumnId',
  'decidedByColumnId',
  'decidedAtColumnId',
  'fileColumnId',
];

const COMPANY_COLUMN_KEYS: (keyof CompanyDayColumnMap)[] = ['timelineColumnId', 'mandatoryColumnId'];

const ENTITLEMENT_COLUMN_KEYS: (keyof EntitlementColumnMap)[] = [
  'personColumnId',
  'typeColumnId',
  'yearColumnId',
  'entitledColumnId',
];

/** column-key -> i18n key under settings.columns (mapping board fields share label keys). */
const COLUMN_LABEL_KEY: Record<string, string> = {
  'requestsBoardId.personColumnId': 'personColumnId',
  'requestsBoardId.typeColumnId': 'typeColumnId',
  'requestsBoardId.timelineColumnId': 'timelineColumnId',
  'requestsBoardId.statusColumnId': 'statusColumnId',
  'requestsBoardId.empNoteColumnId': 'empNoteColumnId',
  'requestsBoardId.mgrNoteColumnId': 'mgrNoteColumnId',
  'requestsBoardId.decidedByColumnId': 'decidedByColumnId',
  'requestsBoardId.decidedAtColumnId': 'decidedAtColumnId',
  'requestsBoardId.fileColumnId': 'fileColumnId',
  'companyDaysBoardId.timelineColumnId': 'companyTimelineColumnId',
  'companyDaysBoardId.mandatoryColumnId': 'mandatoryColumnId',
  'entitlementsBoardId.personColumnId': 'entPersonColumnId',
  'entitlementsBoardId.typeColumnId': 'entTypeColumnId',
  'entitlementsBoardId.yearColumnId': 'entYearColumnId',
  'entitlementsBoardId.entitledColumnId': 'entitledColumnId',
};

const TYPE_KEYS: AbsenceType[] = ['vacation', 'sick', 'reserves'];
const STATUS_KEYS: RequestStatus[] = ['pending', 'approved', 'rejected'];

/** Hook that lazily loads + caches the columns for each configured board id. */
function useBoardColumns(boardIds: Record<BoardKey, string | null>) {
  const [columns, setColumns] = useState<Record<string, BoardColumn[]>>({});

  const load = useCallback(async (boardId: string) => {
    try {
      const data = (await mondayApi.getBoard(boardId)) as BoardsResponse;
      const cols = data.boards?.[0]?.columns ?? [];
      setColumns((prev) => ({ ...prev, [boardId]: cols }));
    } catch (err) {
      logger.error('SettingsDialog', 'failed to load board columns', { boardId, err });
      setColumns((prev) => ({ ...prev, [boardId]: [] }));
    }
  }, []);

  useEffect(() => {
    Object.values(boardIds).forEach((id) => {
      if (id) void load(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardIds.requestsBoardId, boardIds.companyDaysBoardId, boardIds.entitlementsBoardId]);

  return columns;
}

/**
 * Day-off settings UI — built on app-core's SettingsDialogShell (#17). The shell
 * owns the frame/tabs/draft/save; this file declares the tabs + fields.
 * Tabs: Boards (3 board ids), Mapping (per-board column dropdowns + type/status
 * label maps), Team & roles (member ids + manager flags).
 */
export function SettingsDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();

  // resolved names for the team tab (display only).
  const [teamUsers, setTeamUsers] = useState<Record<string, Employee>>({});

  const columnLabel = (boardKey: BoardKey, columnKey: string): string =>
    t(`settings.columns.${COLUMN_LABEL_KEY[`${boardKey}.${columnKey}`] ?? columnKey}`);

  const tabs: SettingsTabDef<DayOffSettings>[] = [
    {
      id: 'boards',
      label: t('settings.tabs.boards'),
      fields: ['requestsBoardId'],
      render: ({ draft, setField, errors }: SettingsTabRenderCtx<DayOffSettings>) => (
        <div style={{ display: 'grid', gap: 16 }}>
          {(['requestsBoardId', 'companyDaysBoardId', 'entitlementsBoardId'] as const).map((key) => (
            <label key={key} style={{ display: 'block' }}>
              <span style={{ fontWeight: 600 }}>{t(`settings.boards.${key}`)}</span>
              <input
                type="text"
                inputMode="numeric"
                value={draft[key] ?? ''}
                onChange={(e) => setField(key, (e.target.value.trim() || null) as DayOffSettings[typeof key])}
                style={{ display: 'block', width: '100%', marginTop: 4 }}
              />
              <small style={{ color: 'var(--color-text-secondary)' }}>{t(`settings.boards.${key}Help`)}</small>
              {key === 'requestsBoardId' && errors.requestsBoardId && (
                <span style={{ color: 'var(--color-danger)', fontSize: 13, display: 'block' }}>{t(errors.requestsBoardId)}</span>
              )}
            </label>
          ))}
        </div>
      ),
    },
    {
      id: 'mapping',
      label: t('settings.tabs.mapping'),
      render: (ctx: SettingsTabRenderCtx<DayOffSettings>) => <MappingTab ctx={ctx} columnLabel={columnLabel} />,
    },
    {
      id: 'team',
      label: t('settings.tabs.team'),
      render: ({ draft, setDraft }: SettingsTabRenderCtx<DayOffSettings>) => (
        <TeamTab draft={draft} setDraft={setDraft} teamUsers={teamUsers} setTeamUsers={setTeamUsers} />
      ),
    },
  ];

  return (
    <SettingsDialogShell<DayOffSettings>
      isOpen={isOpen}
      onClose={onClose}
      title={t('settings.title')}
      settings={settings}
      onSave={(next) => updateSettings(next)}
      tabs={tabs}
      validate={(draft): Record<string, string> =>
        draft.requestsBoardId ? {} : { requestsBoardId: 'app.notConfigured' }
      }
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

/** Mapping tab — column dropdowns per board + type/status label maps. */
function MappingTab({
  ctx,
  columnLabel,
}: {
  ctx: SettingsTabRenderCtx<DayOffSettings>;
  columnLabel: (boardKey: BoardKey, columnKey: string) => string;
}) {
  const { t } = useTranslation();
  const { draft, setDraft } = ctx;
  const columns = useBoardColumns({
    requestsBoardId: draft.requestsBoardId,
    companyDaysBoardId: draft.companyDaysBoardId,
    entitlementsBoardId: draft.entitlementsBoardId,
  });

  const renderColumnSelect = (boardKey: BoardKey, boardId: string | null, columnKey: string, value?: string) => {
    const cols = boardId ? columns[boardId] ?? [] : [];
    return (
      <label key={columnKey} style={{ display: 'block' }}>
        {columnLabel(boardKey, columnKey)}
        <select
          value={value ?? ''}
          disabled={!boardId}
          onChange={(e) => {
            const next = e.target.value || undefined;
            if (boardKey === 'requestsBoardId') {
              setDraft((d) => ({ ...d, requestColumns: { ...d.requestColumns, [columnKey]: next } }));
            } else if (boardKey === 'companyDaysBoardId') {
              setDraft((d) => ({ ...d, companyDayColumns: { ...d.companyDayColumns, [columnKey]: next } }));
            } else {
              setDraft((d) => ({ ...d, entitlementColumns: { ...d.entitlementColumns, [columnKey]: next } }));
            }
          }}
          style={{ display: 'block', width: '100%', marginTop: 4 }}
        >
          <option value="">{t('settings.selectColumn')}</option>
          {cols.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.type})
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t('settings.sections.requestColumns')}</h3>
        {!draft.requestsBoardId && <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.pickBoardFirst')}</small>}
        {REQUEST_COLUMN_KEYS.map((key) =>
          renderColumnSelect('requestsBoardId', draft.requestsBoardId, key, draft.requestColumns[key]),
        )}
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t('settings.sections.companyDayColumns')}</h3>
        {!draft.companyDaysBoardId && <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.pickBoardFirst')}</small>}
        {COMPANY_COLUMN_KEYS.map((key) =>
          renderColumnSelect('companyDaysBoardId', draft.companyDaysBoardId, key, draft.companyDayColumns[key]),
        )}
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t('settings.sections.entitlementColumns')}</h3>
        {!draft.entitlementsBoardId && <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.pickBoardFirst')}</small>}
        {ENTITLEMENT_COLUMN_KEYS.map((key) =>
          renderColumnSelect('entitlementsBoardId', draft.entitlementsBoardId, key, draft.entitlementColumns[key]),
        )}
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t('settings.typeValues.title')}</h3>
        <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.typeValues.help')}</small>
        {TYPE_KEYS.map((type) => (
          <label key={type} style={{ display: 'block' }}>
            {t(`settings.typeValues.${type}`)}
            <input
              type="text"
              value={draft.typeValues[type] ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, typeValues: { ...d.typeValues, [type]: e.target.value } }))
              }
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
        ))}
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t('settings.statusValues.title')}</h3>
        <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.statusValues.help')}</small>
        {STATUS_KEYS.map((status) => (
          <label key={status} style={{ display: 'block' }}>
            {t(`settings.statusValues.${status}`)}
            <input
              type="text"
              value={draft.statusValues[status] ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, statusValues: { ...d.statusValues, [status]: e.target.value } }))
              }
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
        ))}
      </section>
    </div>
  );
}

/** Team & roles tab — comma-separated member ids + per-member manager toggle. */
function TeamTab({
  draft,
  setDraft,
  teamUsers,
  setTeamUsers,
}: {
  draft: DayOffSettings;
  setDraft: (updater: (d: DayOffSettings) => DayOffSettings) => void;
  teamUsers: Record<string, Employee>;
  setTeamUsers: (updater: (prev: Record<string, Employee>) => Record<string, Employee>) => void;
}) {
  const { t } = useTranslation();
  const [idsText, setIdsText] = useState(draft.team.join(', '));

  // keep the textarea in sync when team is replaced (e.g. via import) — mirror of external state.
  const teamKey = draft.team.join(',');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdsText(draft.team.join(', '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamKey]);

  // resolve names for display whenever the team list changes.
  useEffect(() => {
    const missing = draft.team.filter((id) => !teamUsers[id]);
    if (!missing.length) return;
    void (async () => {
      try {
        const users = await resolveUsers(missing);
        setTeamUsers((prev) => {
          const next = { ...prev };
          users.forEach((u) => {
            next[u.id] = u;
          });
          return next;
        });
      } catch (err) {
        logger.error('SettingsDialog', 'failed to resolve team users', { err });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.team.join(',')]);

  const commitIds = (raw: string) => {
    const ids = Array.from(
      new Set(
        raw
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );
    setDraft((d) => ({
      ...d,
      team: ids,
      managers: d.managers.filter((m) => ids.includes(m)),
    }));
  };

  const toggleManager = (id: string, isManager: boolean) => {
    setDraft((d) => ({
      ...d,
      managers: isManager ? Array.from(new Set([...d.managers, id])) : d.managers.filter((m) => m !== id),
    }));
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <label style={{ display: 'block' }}>
        <span style={{ fontWeight: 600 }}>{t('settings.team.teamLabel')}</span>
        <textarea
          value={idsText}
          onChange={(e) => setIdsText(e.target.value)}
          onBlur={(e) => commitIds(e.target.value)}
          rows={2}
          style={{ display: 'block', width: '100%', marginTop: 4 }}
        />
        <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.team.teamHelp')}</small>
      </label>

      <section style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t('settings.team.managersLabel')}</h3>
        <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.team.managersHelp')}</small>
        {draft.team.length === 0 ? (
          <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.team.empty')}</small>
        ) : (
          draft.team.map((id) => {
            const user = teamUsers[id];
            return (
              <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={draft.managers.includes(id)}
                  onChange={(e) => toggleManager(id, e.target.checked)}
                />
                <span>{user ? `${user.name} (${id})` : id}</span>
              </label>
            );
          })
        )}
      </section>
    </div>
  );
}
