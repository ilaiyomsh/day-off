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
  validate: (s) => {
    const errors: Record<string, string> = {};
    if (!s.vacationBoardId) errors.vacationBoardId = 'app.notConfigured';
    return { isValid: Boolean(s.vacationBoardId), errors };
  },
});
