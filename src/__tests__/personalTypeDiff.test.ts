import { describe, it, expect } from 'vitest';
import { hasPendingLabelEdits, samePersonalTypeOptions } from '../components/Settings/personalTypeDiff';
import he from '../i18n/locales/he/translation.json';
import en from '../i18n/locales/en/translation.json';
import type { PersonalTypeOption } from '../types';

// W1.5 (Day-off integration): Settings can rewrite the vacations-board
// personal-type labels via update_status_column. The dialog must warn that
// external consumers (Planner, tracker) cache label IDs whenever the draft
// labels diverge from the live board labels.

const label = (over: Partial<PersonalTypeOption> = {}): PersonalTypeOption => ({
  id: '1',
  title: 'Vacation',
  color: '#00c875',
  colorValue: 1,
  index: 0,
  isDone: false,
  isDeactivated: false,
  ...over,
});

const live: PersonalTypeOption[] = [
  label({ id: '1', title: 'Vacation', color: '#00c875', index: 0 }),
  label({ id: '5', title: 'Sick', color: '#e2445c', colorValue: 2, index: 1 }),
];

describe('hasPendingLabelEdits (W1.5 consumer warning gate)', () => {
  it('is false without a live baseline (snapshot not loaded / load failed)', () => {
    expect(hasPendingLabelEdits(live, null)).toBe(false);
    expect(hasPendingLabelEdits([], null)).toBe(false);
  });

  it('is false when the draft matches the live labels exactly', () => {
    expect(hasPendingLabelEdits(live.map((l) => ({ ...l })), live)).toBe(false);
    expect(hasPendingLabelEdits([], [])).toBe(false);
  });

  it('detects a rename', () => {
    const draft = [{ ...live[0], title: 'Holiday' }, { ...live[1] }];
    expect(hasPendingLabelEdits(draft, live)).toBe(true);
  });

  it('detects a recolor', () => {
    const draft = [{ ...live[0], color: '#9d50dd' }, { ...live[1] }];
    expect(hasPendingLabelEdits(draft, live)).toBe(true);
  });

  it('detects an added label', () => {
    const draft = [...live, label({ id: 'new-x', title: 'Reserves', index: 2 })];
    expect(hasPendingLabelEdits(draft, live)).toBe(true);
  });

  it('detects a removed label', () => {
    // removePersonalType also re-indexes the survivors
    const draft = [{ ...live[1], index: 0 }];
    expect(hasPendingLabelEdits(draft, live)).toBe(true);
  });

  it('detects a reorder (index change)', () => {
    const draft = [
      { ...live[1], index: 0 },
      { ...live[0], index: 1 },
    ];
    expect(hasPendingLabelEdits(draft, live)).toBe(true);
  });
});

describe('samePersonalTypeOptions', () => {
  it('compares element-wise by id/title/color/index', () => {
    expect(samePersonalTypeOptions(live, live.map((l) => ({ ...l })))).toBe(true);
    expect(samePersonalTypeOptions(live, [live[0]])).toBe(false);
    expect(samePersonalTypeOptions(live, [live[0], { ...live[1], id: '9' }])).toBe(false);
  });
});

describe('consumer-warning i18n (he+en)', () => {
  it.each([
    ['he', he],
    ['en', en],
  ] as const)('%s carries a non-empty settings.typeValues.consumerWarning', (_lng, bundle) => {
    const text = bundle.settings.typeValues.consumerWarning;
    expect(typeof text).toBe('string');
    expect(text.trim().length).toBeGreaterThan(0);
    // The warning must name both external consumers explicitly.
    expect(text).toContain('Planner');
    expect(text.toLowerCase()).toContain('tracker');
  });
});
