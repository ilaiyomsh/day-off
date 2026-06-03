# Changelog - Day-off

*Auto-generated. Source: `~/.change-tracker/changes.db`*

## 2026-06

### ✨ New Features

- **2026-06-03** — Implement Day-off UI from Claude Design handoff (5 views, 6 modals, calendar, team timeline, dashboard, toasts) in React 19+TS+Vite, wired to real monday boards; all strings via i18next
  - _Why:_ Build the production app from the approved Claude Design handoff bundle
  - _Requested:_ Read the day-off handoff bundle and implement index.html — full app, wired to monday boards, i18n now, no persona/tweaks/theme dev controls
  - _Done:_ Planned: recreate the Claude Design Day-off prototype pixel-perfectly in the React 19 + TS + Vite app, wired to real monday boards, with all strings extracted to i18next and the dev-only persona/tweaks/theme controls dropped. Built the deterministic foundation inline (verbatim CSS port, pure domain/date layer + i18n binding, expanded DayOffSettings with board/column/team maps) then fanned the rest out via a 23-agent workflow: monday services (columnMap + requests/companyDays/entitlements/users), the DayOffDataProvider data hook, the Settings dialog, 13 UI components, 5 views, 6 modals, the app shell, and tests. Verified green end-to-end: typecheck, lint (0 errors), 58 tests across 3 timezones, production build, and a full i18n audit (he/en mirror, 276 keys, all literal+dynamic keys resolve). Deviations: new-attachment file upload deferred to v1 (needs monday's multipart endpoint); the company-day 'mandatory' field maps to a Checkbox column; long-text note columns are written as {text}; two date-glyph i18n keys were added to keep dates.ts literal-free. Live in-monday smoke test is pending an app ID + three configured boards.
