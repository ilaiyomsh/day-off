import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../types';

describe('DEFAULT_SETTINGS', () => {
  it('starts unconfigured (custom object — boards picked in settings)', () => {
    expect(DEFAULT_SETTINGS.requestsBoardId).toBeNull();
    expect(DEFAULT_SETTINGS.companyDaysBoardId).toBeNull();
    expect(DEFAULT_SETTINGS.entitlementsBoardId).toBeNull();
  });

  it('has empty column maps for each board', () => {
    expect(DEFAULT_SETTINGS.requestColumns).toEqual({});
    expect(DEFAULT_SETTINGS.companyDayColumns).toEqual({});
    expect(DEFAULT_SETTINGS.entitlementColumns).toEqual({});
  });

  it('seeds blank type/status value maps with every enum key', () => {
    expect(DEFAULT_SETTINGS.typeValues).toEqual({ vacation: '', sick: '', reserves: '' });
    expect(DEFAULT_SETTINGS.statusValues).toEqual({ pending: '', approved: '', rejected: '' });
  });

  it('starts with empty team and managers', () => {
    expect(DEFAULT_SETTINGS.team).toEqual([]);
    expect(DEFAULT_SETTINGS.managers).toEqual([]);
  });

  it('has null language override and lastModifiedAt', () => {
    expect(DEFAULT_SETTINGS.languageOverride).toBeNull();
    expect(DEFAULT_SETTINGS.lastModifiedAt).toBeNull();
  });
});
