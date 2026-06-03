import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsDialogShell, type SettingsTabDef, type SettingsTabRenderCtx } from '@axis/app-core';
import { useSettings, logger } from '../../core';
import { mondayApi } from '../../services/mondayApi';
import { resolveUsers } from '../../services/usersService';
import type { DayOffSettings, VacationColumnMap } from '../../types';
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

  // resolved names for the team tab (display only).
  const [teamUsers, setTeamUsers] = useState<Record<string, Employee>>({});

  const tabs: SettingsTabDef<DayOffSettings>[] = [
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
        <textarea value={idsText} onChange={(e) => setIdsText(e.target.value)} onBlur={(e) => commitIds(e.target.value)} rows={2} />
        <small style={{ color: 'var(--color-text-secondary)', display: 'block', marginTop: 4 }}>{t('settings.team.teamHelp')}</small>
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
                  style={{ width: 'auto', marginTop: 0 }}
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
