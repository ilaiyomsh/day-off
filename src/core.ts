/**
 * App-core wiring for Day-off. Creates the singletons (monday SDK, logger) and
 * the settings module from the shared @axis/app-core package (standard #17).
 * Import `monday`, `logger`, `SettingsProvider`, `useSettings` from here.
 */
import mondaySdk from 'monday-sdk-js';
import { polyfillGlobal, createLogger, createSettings, type MondaySdk } from '@axis/app-core';
import { DEFAULT_SETTINGS, type DayOffSettings } from './types';

polyfillGlobal();

export const monday = mondaySdk() as unknown as MondaySdk;

const dataset = import.meta.env.VITE_AXIOM_DATASET as string | undefined;
const token = import.meta.env.VITE_AXIOM_TOKEN as string | undefined;

export const logger = createLogger({
  app: 'day-off',
  appVersion: (import.meta.env.VITE_APP_VERSION as string) || '0.0.0',
  environment: import.meta.env.VITE_ENVIRONMENT as string | undefined,
  axiom: dataset && token ? { dataset, token } : undefined,
});

export const { SettingsProvider, useSettings } = createSettings<DayOffSettings>({
  storageKeyPrefix: 'customSettings_',
  defaults: DEFAULT_SETTINGS,
  // Legacy flat { team, managers } → a single team. Runs once on load.
  // Name is left blank; the UI shows a translated placeholder for empty names.
  migrate: (raw) => {
    if (Array.isArray(raw.teams)) return {};
    const team = Array.isArray(raw.team) ? (raw.team as string[]) : [];
    const managers = Array.isArray(raw.managers) ? (raw.managers as string[]) : [];
    if (!team.length && !managers.length) return { teams: [] };
    const employees = team.filter((id) => !managers.includes(id));
    return { teams: [{ id: 'team-1', name: '', managers, employees }] };
  },
  validate: (s) => {
    const errors: Record<string, string> = {};
    if (!s.vacationBoardId) errors.vacationBoardId = 'app.notConfigured';
    return { isValid: Boolean(s.vacationBoardId), errors };
  },
});
