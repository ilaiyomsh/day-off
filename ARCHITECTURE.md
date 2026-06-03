# Day-off — Architecture

A React 19 / Vite 7 **Custom Object** monday.com app (TypeScript) for managing employee days off. This document describes the current skeleton; expand it as features land (standard #14).

> **Infrastructure** (startup, MondayContext, settings module, logger, error pipeline) comes from the shared **`@axis/app-core`** package (#17), instantiated in `src/core.ts`. Only app-specific glue lives in this repo.

## 1. Overview
- **Stack:** React 19, Vite 7, `monday-sdk-js`, `@axis/app-core`, `i18next`/`react-i18next`. UI to adopt `@vibe/core`.
- **State:** React Context only — `MondayProvider` (SDK context) → `SettingsProvider` (settings), both from `@axis/app-core`.
- **Persistence:** global `monday.storage` keyed by `customSettings_${instanceId}` (Axis convention — not instance storage), via app-core's `createSettings`.
- **API:** single funnel `mondayApi.query()` (`src/services/mondayApi.ts`), implementing the `Monday-api-service` contract, using app-core's shared `monday` + `logger`.
- **Errors/logging:** app-core `ErrorBoundary` + `setupGlobalErrorHandlers` + `useErrorHandler` converge on app-core `logger`; logger ships to Axiom when configured.

## 2. Startup & bootstrap flow
```
src/main.tsx
  ├─ import './i18n'                 (i18next: he/en, lng='he')
  ├─ import { logger } from './core' (core.ts: polyfillGlobal → mondaySdk → createLogger → createSettings)
  └─ bootstrapApp({ logger, children:<App/> })   (app-core: polyfill + global error handlers + render)
```

## 3. Provider tree (all providers from @axis/app-core)
```
App.tsx
  └─ ErrorBoundary           logger prop — catches startup throws, outside providers
     └─ MondayProvider       monday.get('context') + listen, watchdog, permissions
        └─ SettingsProvider  load customSettings_${instanceId} (retry/backoff/migrations)
           └─ AppContent      applies language/dir + data-theme to <html>; renders provider + error surface
              └─ DayOffDataProvider  loads requests/companyDays/entitlements/team; mutations + analytics + toasts
                 └─ DayOffView        app shell: header, role tabs, active view, modal switchboard, toasts
                    ├─ views/*  (EmployeeView, TeamView, ApprovalsView, DashboardView, CompanyDaysView)
                    ├─ modals/* (Request, RequestDetail, Approve, Reject, CompanyDay, Drill)
                    ├─ ui/*     (Icon, Avatar, Modal, MonthCalendar, YearSelect, KpiCard, …)
                    └─ Settings/SettingsDialog (boards + column mapping + team/roles)
```

## 4. Modules
| Area | File | Role |
|---|---|---|
| App-core wiring | `src/core.ts` | instantiates `monday`, `logger`, `SettingsProvider`/`useSettings` from `@axis/app-core` |
| Entry | `src/main.tsx` | `bootstrapApp()` from app-core |
| Root | `src/App.tsx` | app-core providers + ErrorBoundary + language/dir + error modal |
| API layer | `src/services/mondayApi.ts` | `Monday-api-service` contract, retry, `MondayApiError` (uses core's monday+logger) |
| Settings UI | `src/components/Settings/SettingsDialog.tsx` | boards + column mapping + team/roles, over `useSettings` |
| Error UI | `src/components/ErrorDetailsModal.tsx` | surfaces `useErrorHandler` error |
| App shell | `src/components/DayOffView.tsx` | header, role tabs, active view, modal switchboard, toasts |
| Views | `src/components/views/*` | the 5 screens (My absences, Team board, Approvals, Dashboard, Company days) |
| Modals | `src/components/modals/*` | request / detail / approve / reject / company-day / drill |
| UI kit | `src/components/ui/*` | Icon, Avatar, Modal, MonthCalendar, YearSelect, Seg, EmpFilter, KpiCard, … (barrel: `ui/index.ts`) |
| Data context | `src/contexts/DayOffDataProvider.tsx` | `useDayOffData()` — loads data, mutations, analytics, toasts |
| Domain | `src/domain/*` | `types.ts`, pure `dates.ts` (+ `useL10n.ts` i18n binding), `absence.ts` (types + balance analytics) |
| Services | `src/services/*` | `columnMap` (monday value (de)serialization) + `requests`/`companyDays`/`entitlements`/`users` services |
| i18n | `src/i18n/` | i18next + he/en bundles (all UI strings, date-name arrays) |
| Types | `src/types/index.ts` | `DayOffSettings` (boards + column maps + type/status value maps + team/managers) |

## 5. Data model (monday boards, configured in Settings)
- **Requests board** (`requestsBoardId`) — one item per absence request. Columns mapped by id: Person
  (people), Type (status), Timeline (start..end), Status (status), employee note + manager note
  (long-text), Decided-by (people), Decided-at (date), File. `submittedAt` = item `created_at`.
  `typeValues`/`statusValues` map the app enums ↔ the board's status-column labels.
- **Company-days board** (`companyDaysBoardId`) — item name = holiday name; Timeline + a Checkbox for
  mandatory.
- **Entitlements board** (`entitlementsBoardId`) — row per (Person × Type × Year × entitled-number).
  `used`/`pending` are **computed live** from approved/pending requests (`domain/absence`), not stored.
- **Team & roles** — `team` (member user ids) + `managers` (who approves / sees manager tabs);
  resolved to `Employee` via the monday `users` API. `isManager = managers.includes(currentUser.id)`.

> **Known limitation (v1):** creating a request does **not** upload a new file attachment — monday
> file upload needs the multipart endpoint (`TODO(attachment-upload)` in `requestsService`). Existing
> file-column assets are shown on read.

## 6. Data flow
```
SettingsProvider (config)                              [app-core → monday.storage]
  → DayOffDataProvider  builds service ctx from settings; on mount loads
        requests/companyDays/entitlements/team in parallel (via the services → mondayApi)
     → views/modals read slices via useDayOffData()
     → a mutation (submit/approve/reject/cancel/saveCompanyDay) → service write → re-fetch → toast
  → SettingsDialog → useSettings.updateSettings → app-core persists to monday.storage
```

## 7. Conventions
- All API via `mondayApi`; no direct SDK calls in components.
- All user-facing strings via `t(...)` (ESLint-enforced).
- Every `catch` logs / throws / `handleError` (ESLint-enforced).
- Settings in global storage, key-namespaced by `instanceId`.
