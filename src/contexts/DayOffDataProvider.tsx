/**
 * DayOffDataProvider — the single data context for the app (replaces the
 * prototype's app.jsx state + window.DayOffData). Reads config from useSettings(),
 * builds the service ctx objects, loads requests/companyDays/entitlements/team in
 * parallel on mount, and exposes the analytics + mutation surface defined by the
 * `useDayOffData()` contract (CONTRACT.md). All monday I/O is funneled through the
 * service modules; every catch surfaces via handleError + logger.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useMondayContext, useErrorHandler } from '@axis/app-core';
import { logger, useSettings } from '../core';
import type {
  AbsenceType,
  Balance,
  CompanyDay,
  CompanyDayDraft,
  DayOffRequest,
  Employee,
  Entitlement,
  RequestDraft,
} from '../domain/types';
import { computeBalance, pendingDaysFor as pendingDaysForDomain, requestYear } from '../domain/absence';
import { todayKey } from '../domain/dates';
import {
  listRequests,
  createRequest,
  updateRequest,
  setStatus,
  deleteRequest,
  type RequestsCtx,
} from '../services/requestsService';
import {
  listCompanyDays,
  createCompanyDay,
  updateCompanyDay,
  deleteCompanyDay as deleteCompanyDayApi,
  type CompanyCtx,
} from '../services/companyDaysService';
import { listEntitlements, type EntCtx } from '../services/entitlementsService';
import { resolveUsers } from '../services/usersService';

type ToastVariant = '' | 'success' | 'danger';
interface Toast {
  id: number;
  text: string;
  variant: ToastVariant;
}

export interface DayOffData {
  loading: boolean;
  requests: DayOffRequest[];
  companyDays: CompanyDay[];
  entitlements: Entitlement[];
  team: Employee[];
  teamIds: string[];
  empById: (id: string) => Employee | undefined;
  currentUser: Employee;
  isManager: boolean;
  years: number[];
  monthDate: Date;
  year: number;
  nav: { onPrev: () => void; onNext: () => void; onToday: () => void };
  onYearChange: (y: number) => void;
  balanceFor: (year: number, empId: string, type: AbsenceType) => Balance;
  pendingDaysFor: (empId: string, type: AbsenceType, year: number) => number;
  holidaysOnKey: (dateKey: string) => CompanyDay[];
  submitRequest: (draft: RequestDraft, editingId?: string) => Promise<void>;
  approve: (r: DayOffRequest, note?: string) => Promise<void>;
  reject: (r: DayOffRequest, reason?: string) => Promise<void>;
  approveAll: () => Promise<void>;
  cancelRequest: (r: DayOffRequest) => Promise<void>;
  saveCompanyDay: (draft: CompanyDayDraft) => Promise<void>;
  deleteCompanyDay: (h: CompanyDay) => Promise<void>;
  toasts: Toast[];
  toast: (text: string, variant?: ToastVariant) => void;
}

const Ctx = createContext<DayOffData | null>(null);

const TOAST_TTL_MS = 2800;

/** Minimal Employee fallback when the monday users API can't resolve the signed-in user. */
function fallbackEmployee(id: string, name: string): Employee {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || '?';
  return { id, name, initials, color: '#0073ea' };
}

export function DayOffDataProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { currentUser: mondayUser } = useMondayContext();
  const { handleError } = useErrorHandler(logger);

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<DayOffRequest[]>([]);
  const [companyDays, setCompanyDays] = useState<CompanyDay[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [team, setTeam] = useState<Employee[]>([]);
  const [currentUser, setCurrentUser] = useState<Employee>(() =>
    fallbackEmployee(String(mondayUser.id ?? 'me'), mondayUser.name ?? ''),
  );

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const today = useMemo(() => new Date(), []);
  const [monthDate, setMonthDate] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const year = monthDate.getFullYear();

  // ---- service contexts (rebuilt when settings change) ----
  const requestsCtx = useMemo<RequestsCtx | null>(() => {
    if (!settings.requestsBoardId) return null;
    return {
      boardId: settings.requestsBoardId,
      cols: settings.requestColumns,
      typeValues: settings.typeValues,
      statusValues: settings.statusValues,
    };
  }, [settings.requestsBoardId, settings.requestColumns, settings.typeValues, settings.statusValues]);

  const companyCtx = useMemo<CompanyCtx | null>(() => {
    if (!settings.companyDaysBoardId) return null;
    return { boardId: settings.companyDaysBoardId, cols: settings.companyDayColumns };
  }, [settings.companyDaysBoardId, settings.companyDayColumns]);

  const entCtx = useMemo<EntCtx | null>(() => {
    if (!settings.entitlementsBoardId) return null;
    return {
      boardId: settings.entitlementsBoardId,
      cols: settings.entitlementColumns,
      typeValues: settings.typeValues,
    };
  }, [settings.entitlementsBoardId, settings.entitlementColumns, settings.typeValues]);

  const teamIds = settings.team;

  // ---- toasts ----
  const toast = useCallback((text: string, variant: ToastVariant = '') => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((ts) => [...ts, { id, text, variant }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), TOAST_TTL_MS);
  }, []);

  // ---- individual loaders (each guarded) ----
  const loadRequests = useCallback(async (): Promise<DayOffRequest[]> => {
    if (!requestsCtx) {
      setRequests([]);
      return [];
    }
    const data = await listRequests(requestsCtx);
    setRequests(data);
    return data;
  }, [requestsCtx]);

  const loadCompanyDays = useCallback(async () => {
    if (!companyCtx) {
      setCompanyDays([]);
      return;
    }
    setCompanyDays(await listCompanyDays(companyCtx));
  }, [companyCtx]);

  const loadEntitlements = useCallback(async (): Promise<Entitlement[]> => {
    if (!entCtx) {
      setEntitlements([]);
      return [];
    }
    const data = await listEntitlements(entCtx);
    setEntitlements(data);
    return data;
  }, [entCtx]);

  const loadTeam = useCallback(async () => {
    if (!teamIds.length) {
      setTeam([]);
      return;
    }
    setTeam(await resolveUsers(teamIds));
  }, [teamIds]);

  const resolveCurrentUser = useCallback(async () => {
    const id = String(mondayUser.id ?? 'me');
    const name = mondayUser.name ?? '';
    const [resolved] = await resolveUsers([id]);
    setCurrentUser(resolved ?? fallbackEmployee(id, name));
  }, [mondayUser.id, mondayUser.name]);

  // ---- initial parallel load ----
  useEffect(() => {
    let cancelled = false;
    // Kick off (re)load whenever the board config changes — standard async-load pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const guard = (op: string, p: Promise<unknown>) =>
      p.catch((err) => handleError(err, { operation: `DayOffData.${op}` }));

    void Promise.allSettled([
      guard('loadRequests', loadRequests()),
      guard('loadCompanyDays', loadCompanyDays()),
      guard('loadEntitlements', loadEntitlements()),
      guard('loadTeam', loadTeam()),
      guard('resolveCurrentUser', resolveCurrentUser()),
    ]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [loadRequests, loadCompanyDays, loadEntitlements, loadTeam, resolveCurrentUser, handleError]);

  // ---- derived: lookups + selectable years ----
  const empById = useCallback(
    (id: string): Employee | undefined => {
      if (currentUser.id === id) return currentUser;
      return team.find((e) => e.id === id);
    },
    [team, currentUser],
  );

  const isManager = settings.managers.includes(currentUser.id);

  const years = useMemo(() => {
    const set = new Set<number>();
    set.add(today.getFullYear());
    for (const r of requests) set.add(requestYear(r));
    for (const e of entitlements) set.add(e.year);
    return [...set].sort((a, b) => a - b);
  }, [requests, entitlements, today]);

  // ---- month nav ----
  const nav = useMemo(
    () => ({
      onPrev: () => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)),
      onNext: () => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)),
      onToday: () => setMonthDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    }),
    [today],
  );

  const onYearChange = useCallback((y: number) => {
    setMonthDate((d) => new Date(y, d.getMonth(), 1));
  }, []);

  // ---- analytics (wrap domain/absence over current data) ----
  const balanceFor = useCallback(
    (y: number, empId: string, type: AbsenceType): Balance => computeBalance(requests, entitlements, empId, type, y),
    [requests, entitlements],
  );

  const pendingDaysFor = useCallback(
    (empId: string, type: AbsenceType, y: number): number => pendingDaysForDomain(requests, empId, type, y),
    [requests],
  );

  const holidaysOnKey = useCallback(
    (dateKey: string): CompanyDay[] => companyDays.filter((h) => dateKey >= h.start && dateKey <= h.end),
    [companyDays],
  );

  // ---- mutations: API write -> re-fetch affected list -> toast ----
  const submitRequest = useCallback(
    async (draft: RequestDraft, editingId?: string) => {
      if (!requestsCtx) return;
      try {
        if (editingId) {
          await updateRequest(requestsCtx, editingId, draft);
        } else {
          await createRequest(requestsCtx, currentUser.id, draft);
        }
        await loadRequests();
        toast(editingId ? t('toasts.requestUpdated') : t('toasts.requestSent'), 'success');
      } catch (err) {
        handleError(err, { operation: 'DayOffData.submitRequest' });
      }
    },
    [requestsCtx, currentUser.id, loadRequests, toast, t, handleError],
  );

  const approve = useCallback(
    async (r: DayOffRequest, note?: string) => {
      if (!requestsCtx) return;
      const mn = note && note.trim() ? note.trim() : undefined;
      try {
        await setStatus(requestsCtx, r.id, 'approved', currentUser.id, todayKey(), mn);
        await loadRequests();
        toast(t('toasts.requestApproved'), 'success');
      } catch (err) {
        handleError(err, { operation: 'DayOffData.approve' });
      }
    },
    [requestsCtx, currentUser.id, loadRequests, toast, t, handleError],
  );

  const reject = useCallback(
    async (r: DayOffRequest, reason?: string) => {
      if (!requestsCtx) return;
      const mn = reason && reason.trim() ? reason.trim() : undefined;
      try {
        await setStatus(requestsCtx, r.id, 'rejected', currentUser.id, todayKey(), mn);
        await loadRequests();
        toast(t('toasts.requestRejected'), 'danger');
      } catch (err) {
        handleError(err, { operation: 'DayOffData.reject' });
      }
    },
    [requestsCtx, currentUser.id, loadRequests, toast, t, handleError],
  );

  const approveAll = useCallback(async () => {
    if (!requestsCtx) return;
    const pend = requests.filter((r) => r.status === 'pending' && r.employeeId !== currentUser.id);
    if (!pend.length) return;
    try {
      for (const r of pend) {
        await setStatus(requestsCtx, r.id, 'approved', currentUser.id, todayKey());
      }
      await loadRequests();
      toast(t('toasts.requestsApproved', { count: pend.length }), 'success');
    } catch (err) {
      handleError(err, { operation: 'DayOffData.approveAll' });
    }
  }, [requestsCtx, requests, currentUser.id, loadRequests, toast, t, handleError]);

  const cancelRequest = useCallback(
    async (r: DayOffRequest) => {
      try {
        await deleteRequest(r.id);
        await loadRequests();
        toast(t('toasts.requestCancelled'));
      } catch (err) {
        handleError(err, { operation: 'DayOffData.cancelRequest' });
      }
    },
    [loadRequests, toast, t, handleError],
  );

  const saveCompanyDay = useCallback(
    async (draft: CompanyDayDraft) => {
      if (!companyCtx) return;
      try {
        if (draft.id) {
          await updateCompanyDay(companyCtx, draft.id, draft);
        } else {
          await createCompanyDay(companyCtx, draft);
        }
        await loadCompanyDays();
        toast(draft.id ? t('toasts.companyDayUpdated') : t('toasts.companyDayAdded'), 'success');
      } catch (err) {
        handleError(err, { operation: 'DayOffData.saveCompanyDay' });
      }
    },
    [companyCtx, loadCompanyDays, toast, t, handleError],
  );

  const deleteCompanyDay = useCallback(
    async (h: CompanyDay) => {
      try {
        await deleteCompanyDayApi(h.id);
        await loadCompanyDays();
        toast(t('toasts.companyDayDeleted'));
      } catch (err) {
        handleError(err, { operation: 'DayOffData.deleteCompanyDay' });
      }
    },
    [loadCompanyDays, toast, t, handleError],
  );

  const value = useMemo<DayOffData>(
    () => ({
      loading,
      requests,
      companyDays,
      entitlements,
      team,
      teamIds,
      empById,
      currentUser,
      isManager,
      years,
      monthDate,
      year,
      nav,
      onYearChange,
      balanceFor,
      pendingDaysFor,
      holidaysOnKey,
      submitRequest,
      approve,
      reject,
      approveAll,
      cancelRequest,
      saveCompanyDay,
      deleteCompanyDay,
      toasts,
      toast,
    }),
    [
      loading,
      requests,
      companyDays,
      entitlements,
      team,
      teamIds,
      empById,
      currentUser,
      isManager,
      years,
      monthDate,
      year,
      nav,
      onYearChange,
      balanceFor,
      pendingDaysFor,
      holidaysOnKey,
      submitRequest,
      approve,
      reject,
      approveAll,
      cancelRequest,
      saveCompanyDay,
      deleteCompanyDay,
      toasts,
      toast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDayOffData(): DayOffData {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDayOffData must be used within DayOffDataProvider');
  return ctx;
}
