import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsDialogShell, type SettingsTabDef, type SettingsTabRenderCtx } from '@axis/app-core';
import { useSettings, logger } from '../../core';
import { mondayApi } from '../../services/mondayApi';
import { listAllUsers } from '../../services/usersService';
import { Icon, PeoplePicker } from '../ui';
import { CompanyDaysTab } from './CompanyDaysTab';
import type { DayOffSettings, Team, VacationColumnMap } from '../../types';
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

/** Mapping fields, in display order, each with its i18n label key under settings.fields. */
const COLUMN_FIELDS: { key: keyof VacationColumnMap; labelKey: string }[] = [
  { key: 'kindColumnId', labelKey: 'kind' },
  { key: 'personColumnId', labelKey: 'person' },
  { key: 'startDateColumnId', labelKey: 'startDate' },
  { key: 'endDateColumnId', labelKey: 'endDate' },
  { key: 'workdaysColumnId', labelKey: 'workdays' },
  { key: 'personalTypeColumnId', labelKey: 'personalType' },
  { key: 'generalTypeColumnId', labelKey: 'generalType' },
  { key: 'approvalStatusColumnId', labelKey: 'approvalStatus' },
  { key: 'mandatoryColumnId', labelKey: 'mandatory' },
  { key: 'empNoteColumnId', labelKey: 'empNote' },
  { key: 'mgrNoteColumnId', labelKey: 'mgrNote' },
  { key: 'decidedByColumnId', labelKey: 'decidedBy' },
  { key: 'decidedAtColumnId', labelKey: 'decidedAt' },
  { key: 'fileColumnId', labelKey: 'file' },
];

const TYPE_KEYS: AbsenceType[] = ['vacation', 'sick', 'reserves'];
const STATUS_KEYS: RequestStatus[] = ['pending', 'approved', 'rejected'];

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
      render: ({ draft, setField, errors }: SettingsTabRenderCtx<DayOffSettings>) => (
        <label style={{ display: 'block' }}>
          <span style={{ fontWeight: 600 }}>{t('settings.board.label')}</span>
          <input
            type="text"
            inputMode="numeric"
            value={draft.vacationBoardId ?? ''}
            onChange={(e) => setField('vacationBoardId', (e.target.value.trim() || null) as DayOffSettings['vacationBoardId'])}
          />
          <small style={{ color: 'var(--color-text-secondary)', display: 'block', marginTop: 4 }}>
            {t('settings.board.help')}
          </small>
          {errors.vacationBoardId && (
            <span style={{ color: 'var(--color-danger)', fontSize: 13, display: 'block' }}>{t(errors.vacationBoardId)}</span>
          )}
        </label>
      ),
    },
    {
      id: 'mapping',
      label: t('settings.tabs.mapping'),
      render: (ctx: SettingsTabRenderCtx<DayOffSettings>) => <MappingTab ctx={ctx} />,
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
      onSave={(next) => updateSettings(next)}
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
function MappingTab({ ctx }: { ctx: SettingsTabRenderCtx<DayOffSettings> }) {
  const { t } = useTranslation();
  const { draft, setDraft, setField } = ctx;
  const cols = useBoardColumns(draft.vacationBoardId);
  const disabled = !draft.vacationBoardId;

  const setColumn = (key: keyof VacationColumnMap, value: string | undefined) =>
    setField('columns', { ...draft.columns, [key]: value } as DayOffSettings['columns']);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t('settings.sections.columns')}</h3>
        {disabled && <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.pickBoardFirst')}</small>}
        {COLUMN_FIELDS.map(({ key, labelKey }) => (
          <label key={key} style={{ display: 'block' }}>
            {t(`settings.fields.${labelKey}`)}
            <select value={draft.columns[key] ?? ''} disabled={disabled} onChange={(e) => setColumn(key, e.target.value || undefined)}>
              <option value="">{t('settings.selectColumn')}</option>
              {cols.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.type})
                </option>
              ))}
            </select>
          </label>
        ))}
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t('settings.kindValues.title')}</h3>
        <small style={{ color: 'var(--color-text-secondary)' }}>{t('settings.kindValues.help')}</small>
        {(['general', 'personal'] as const).map((k) => (
          <label key={k} style={{ display: 'block' }}>
            {t(`settings.kindValues.${k}`)}
            <input
              type="text"
              value={draft.kindValues[k] ?? ''}
              onChange={(e) => setField('kindValues', { ...draft.kindValues, [k]: e.target.value })}
            />
          </label>
        ))}
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
              onChange={(e) => setDraft((d) => ({ ...d, typeValues: { ...d.typeValues, [type]: e.target.value } }))}
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
              onChange={(e) => setDraft((d) => ({ ...d, statusValues: { ...d.statusValues, [status]: e.target.value } }))}
            />
          </label>
        ))}
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
