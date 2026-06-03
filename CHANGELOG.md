# Changelog - Day-off

*Auto-generated. Source: `~/.change-tracker/changes.db`*

## 2026-06

### ✨ New Features

- **2026-06-03** — Implement Day-off UI from Claude Design handoff (5 views, 6 modals, calendar, team timeline, dashboard, toasts) in React 19+TS+Vite, wired to real monday boards; all strings via i18next
  - _Why:_ Build the production app from the approved Claude Design handoff bundle
  - _Requested:_ Read the day-off handoff bundle and implement index.html — full app, wired to monday boards, i18n now, no persona/tweaks/theme dev controls
  - _Done:_ Planned: recreate the Claude Design Day-off prototype pixel-perfectly in the React 19 + TS + Vite app, wired to real monday boards, with all strings extracted to i18next and the dev-only persona/tweaks/theme controls dropped. Built the deterministic foundation inline (verbatim CSS port, pure domain/date layer + i18n binding, expanded DayOffSettings with board/column/team maps) then fanned the rest out via a 23-agent workflow: monday services (columnMap + requests/companyDays/entitlements/users), the DayOffDataProvider data hook, the Settings dialog, 13 UI components, 5 views, 6 modals, the app shell, and tests. Verified green end-to-end: typecheck, lint (0 errors), 58 tests across 3 timezones, production build, and a full i18n audit (he/en mirror, 276 keys, all literal+dynamic keys resolve). Deviations: new-attachment file upload deferred to v1 (needs monday's multipart endpoint); the company-day 'mandatory' field maps to a Checkbox column; long-text note columns are written as {text}; two date-glyph i18n keys were added to keep dates.ts literal-free. Live in-monday smoke test is pending an app ID + three configured boards.

### ⚙️  Config

- **2026-06-03** — Switch deployment from monday code to external hosting on GitHub Pages; publish build to gh-pages branch and wire monday Custom Object feature to custom_url `935efce`
  - _Why:_ Hit the monday code private-app limit (5 connected private apps) — needed an alternative host
  - _Requested:_ Switch Day-off deployment from monday code to external hosting on GitHub Pages (hit the 5 private-app monday code limit). Created public GitHub repo ilaiyomsh/day-off (source on main, built dist on gh-pages branch), enabled GitHub Pages, replaced monday-code deploy scripts with gh-pages publish (added gh-pages devDep + public/.nojekyll), created new monday Custom Object app (App ID 11459177, feature 22016827) and wired its build to custom_url https://ilaiyomsh.github.io/day-off/. Documented the external-hosting deploy flow in CLAUDE.md section 5.
  - _Done:_ Migrated the Day-off app off monday code hosting (the account hit the 5-connected-private-app limit) to external hosting on GitHub Pages. Created a public repo (ilaiyomsh/day-off) with source on main and built output on a gh-pages branch, enabled GitHub Pages, and replaced the monday-code deploy scripts with a gh-pages publish flow (added the gh-pages devDependency and public/.nojekyll); a new monday Custom Object app (ID 11459177, feature 22016827) was created via the apps GraphQL API and its build wired to custom_url -> https://ilaiyomsh.github.io/day-off/, so every pnpm deploy republishes Pages and goes live in monday automatically. CI was deliberately avoided because @axis/app-core is a local link: dependency that GitHub Actions can't resolve — the build must run locally — and this constraint plus the full external-hosting flow was documented in CLAUDE.md section 5. No deviations.
