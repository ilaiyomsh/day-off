/**
 * DashboardView — manager dashboard. Breakdown of absence days by time
 * (month / quarter) and by employee, utilization vs. quota, with click-to-drill.
 * Ported from dashboard.jsx; data comes from useDayOffData() + domain/absence
 * analytics instead of window.DayOffData.
 */
import { useMemo, useState, type ReactElement } from 'react';
import { ABSENCE_TYPES, TYPE_ORDER } from '../../domain/absence';
import { eachDay, fromKey, isWeekend, toKey } from '../../domain/dates';
import { useL10n } from '../../domain/useL10n';
import type { AbsenceType, DayOffRequest } from '../../domain/types';
import { useDayOffData } from '../../contexts/DayOffDataProvider';
import { Avatar, ChartLegend, EmpFilter, EmptyState, KpiCard, Seg, YearSelect } from '../ui';

/** Payload handed to the drill-down modal: the requests behind a clicked number. */
export interface DrillPayload {
  title: string;
  sub: string;
  requests: DayOffRequest[];
}

interface DashboardViewProps {
  year: number;
  onYearChange: (year: number) => void;
  onOpenDrill: (payload: DrillPayload) => void;
}

const ORDER = TYPE_ORDER;

/* ---------- analytics helpers ---------- */
// Workday date-keys of a request that fall inside `year`.
function reqWorkdaysInYear(r: DayOffRequest, year: number): string[] {
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;
  if (r.end < yStart || r.start > yEnd) return [];
  const s = r.start < yStart ? yStart : r.start;
  const e = r.end > yEnd ? yEnd : r.end;
  return eachDay(s, e).filter((k) => !isWeekend(fromKey(k)));
}

interface Cell {
  a: number;
  p: number;
}
type Cells = Record<AbsenceType, Cell>;

function emptyCells(): Cells {
  return { vacation: { a: 0, p: 0 }, sick: { a: 0, p: 0 }, reserves: { a: 0, p: 0 } };
}
function cellsTotal(c: Cells): number {
  return ORDER.reduce((s, t) => s + c[t].a + c[t].p, 0);
}
function cellsApproved(c: Cells): number {
  return ORDER.reduce((s, t) => s + c[t].a, 0);
}
function cellsPending(c: Cells): number {
  return ORDER.reduce((s, t) => s + c[t].p, 0);
}
function mergeCells(list: Cells[]): Cells {
  const out = emptyCells();
  list.forEach((c) => ORDER.forEach((t) => { out[t].a += c[t].a; out[t].p += c[t].p; }));
  return out;
}
function niceCeil(v: number): number {
  if (v <= 0) return 4;
  const step = v <= 8 ? 2 : v <= 20 ? 5 : 10;
  return Math.ceil(v / step) * step;
}

const QUARTER_MONTHS: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [9, 10, 11],
];

type TypeFilter = 'all' | AbsenceType;
type Grouping = 'months' | 'quarters';

/* ============================================================
   Dashboard view
   ============================================================ */
export function DashboardView({ year, onYearChange, onOpenDrill }: DashboardViewProps) {
  const { t, monthShort } = useL10n();
  const { requests, teamIds, myTeams, empById, balanceFor, years } = useDayOffData();
  const [grouping, setGrouping] = useState<Grouping>('months');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [empFilter, setEmpFilter] = useState<string>('all');
  const todayKey = toKey(new Date());

  // The member-id universe the dashboard considers: all visible members, a
  // single team (`team:<id>`), or one employee.
  const universe = useMemo<string[]>(() => {
    if (empFilter === 'all') return teamIds;
    if (empFilter.startsWith('team:')) {
      const tm = myTeams.find((x) => x.id === empFilter.slice(5));
      return tm ? [...new Set([...tm.managers, ...tm.employees])] : teamIds;
    }
    return [empFilter];
  }, [empFilter, teamIds, myTeams]);

  // base set: members in scope, approved + pending, year, type filter
  const filteredReqs = requests.filter((r) =>
    universe.includes(r.employeeId) &&
    (r.status === 'approved' || r.status === 'pending') &&
    (typeFilter === 'all' || r.type === typeFilter) &&
    reqWorkdaysInYear(r, year).length > 0
  );

  // aggregate into month + employee cells
  const monthCells = Array.from({ length: 12 }, emptyCells);
  const empCells: Record<string, Cells> = {};
  filteredReqs.forEach((r) => {
    reqWorkdaysInYear(r, year).forEach((k) => {
      const m = fromKey(k).getMonth();
      const st: 'a' | 'p' = r.status === 'pending' ? 'p' : 'a';
      monthCells[m][r.type][st] += 1;
      (empCells[r.employeeId] || (empCells[r.employeeId] = emptyCells()))[r.type][st] += 1;
    });
  });

  const yearTotal = mergeCells(monthCells);
  const totalDays = cellsTotal(yearTotal);
  const approvedDays = cellsApproved(yearTotal);
  const pendingDays = cellsPending(yearTotal);

  // KPI: pending requests count (filtered)
  const pendingReqs = filteredReqs.filter((r) => r.status === 'pending');

  // KPI: who's off today (approved, respects type/emp filter)
  const offTodayIds = universe.filter((id) =>
    requests.some((r) => r.employeeId === id && r.status === 'approved' &&
      todayKey >= r.start && todayKey <= r.end && (typeFilter === 'all' || r.type === typeFilter)));

  // KPI: average vacation-quota utilization
  const utilType: AbsenceType = typeFilter === 'all' ? 'vacation' : typeFilter;
  const utilLabel = t(ABSENCE_TYPES[utilType].labelKey);
  const utilUniverse = universe;
  const utilRows = utilUniverse
    .map((id) => {
      const b = balanceFor(year, id, utilType);
      return { id, ...b, pct: b.entitled > 0 ? b.used / b.entitled : null };
    })
    .filter((r): r is { id: string; entitled: number; used: number; pending: number; pct: number } => r.pct !== null)
    .sort((a, b) => b.pct - a.pct);
  const avgUtil = utilRows.length ? Math.round(utilRows.reduce((s, r) => s + r.pct, 0) / utilRows.length * 100) : 0;

  // chart buckets
  const buckets = grouping === 'months'
    ? monthCells.map((c, m) => ({ label: monthShort(m), cells: c, months: [m] }))
    : QUARTER_MONTHS.map((months, i) => ({
        label: t('views.dashboard.quarter', { count: i + 1 }),
        cells: mergeCells(months.map((m) => monthCells[m])),
        months,
      }));
  const maxBucket = Math.max(1, ...buckets.map((b) => cellsTotal(b.cells)));
  const niceMax = niceCeil(maxBucket);
  const PLOT = 200;
  const scale = PLOT / niceMax;

  // employee rows
  const empUniverse = universe;
  const empRows = empUniverse
    .map((id) => ({ id, cells: empCells[id] || emptyCells(), total: cellsTotal(empCells[id] || emptyCells()) }))
    .sort((a, b) => b.total - a.total);
  const maxEmp = Math.max(1, ...empRows.map((r) => r.total));

  // ---- drill helpers ----
  function drillMonths(months: number[], label: string) {
    const set = new Set(months);
    const reqs = filteredReqs
      .filter((r) => reqWorkdaysInYear(r, year).some((k) => set.has(fromKey(k).getMonth())))
      .slice().sort((a, b) => a.start.localeCompare(b.start));
    onOpenDrill({ title: `${label} · ${year}`, sub: t('drill.requestsCount', { count: reqs.length }), requests: reqs });
  }
  function drillEmp(id: string) {
    const e = empById(id);
    const reqs = filteredReqs.filter((r) => r.employeeId === id).slice().sort((a, b) => a.start.localeCompare(b.start));
    onOpenDrill({ title: `${e?.name} · ${year}`, sub: t('drill.requestsCount', { count: reqs.length }), requests: reqs });
  }

  const typeOptions = [
    { value: 'all' as const, label: t('common.all') },
    ...ORDER.map((type) => ({ value: type, label: t(ABSENCE_TYPES[type].labelKey), color: ABSENCE_TYPES[type].color })),
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>{t('views.dashboard.title')}</h2>
          <div className="sub">{t('views.dashboard.sub', { year, count: teamIds.length })}</div>
        </div>
        <div className="head-actions">
          <YearSelect year={year} years={years} onChange={onYearChange} />
        </div>
      </div>

      {/* filters */}
      <div className="dash-filters">
        <span className="filter-label">{t('views.dashboard.filterType')}</span>
        <Seg value={typeFilter} options={typeOptions} onChange={setTypeFilter} />
        <span className="filter-label" style={{ marginInlineStart: 8 }}>{t('views.dashboard.filterEmployee')}</span>
        <EmpFilter value={empFilter} onChange={setEmpFilter} />
      </div>

      {/* KPI cards */}
      <div className="kpi-grid">
        <KpiCard
          label={t('views.dashboard.kpiTotal')} icon="calendar" accent="var(--color-primary)"
          value={totalDays} unit={t('views.dashboard.kpiTotalUnit')}
          foot={<>
            <span>{t('views.dashboard.kpiApproved', { count: approvedDays })}</span>
            {pendingDays > 0 && <span className="kpi-pending-dot">{t('views.dashboard.kpiPending', { count: pendingDays })}</span>}
          </>}
        />
        <KpiCard
          label={t('views.dashboard.kpiOffToday')} icon="user" accent="var(--color-event-reserves)"
          value={offTodayIds.length}
          foot={offTodayIds.length
            ? <div className="av-stack">{offTodayIds.slice(0, 5).map((id) => <Avatar key={id} emp={empById(id)} size="sm" />)}</div>
            : <span>{t('views.dashboard.kpiAllPresent')}</span>}
        />
        <KpiCard
          label={t('views.dashboard.kpiPendingApproval')} icon="inbox" accent="var(--color-warning)"
          value={pendingReqs.length}
          foot={pendingReqs.length ? <span>{t('views.dashboard.kpiPendingDays', { count: pendingDays })}</span> : <span>{t('views.dashboard.kpiNoOpen')}</span>}
        />
        <KpiCard
          label={t('views.dashboard.kpiUtil', { type: utilLabel })} icon="chart" accent="var(--color-event-vacation)"
          value={avgUtil} unit={t('views.dashboard.kpiUtilUnit')}
          foot={<span>{t('views.dashboard.kpiUtilFoot', { year })}</span>}
        />
      </div>

      {/* by time */}
      <div className="card dash-card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="dash-card-head">
          <div>
            <h3>{t('views.dashboard.byTimeTitle')}</h3>
            <div className="dch-sub">{t('views.dashboard.byTimeSub')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
            <ChartLegend />
            <Seg
              value={grouping}
              options={[
                { value: 'months', label: t('views.dashboard.grouping.months') },
                { value: 'quarters', label: t('views.dashboard.grouping.quarters') },
              ]}
              onChange={setGrouping}
            />
          </div>
        </div>
        {totalDays === 0 ? (
          <EmptyState icon="chart" title={t('views.dashboard.byTimeEmptyTitle')} sub={t('views.dashboard.byTimeEmptySub')} />
        ) : (
          <>
            <div className="bars">
              {buckets.map((b, i) => {
                const tot = cellsTotal(b.cells);
                const segs = ORDER.flatMap((type) => {
                  const c = b.cells[type], col = ABSENCE_TYPES[type].color, out: { k: string; h: number; color: string; pending: boolean }[] = [];
                  if (c.a > 0) out.push({ k: type + 'a', h: c.a * scale, color: col, pending: false });
                  if (c.p > 0) out.push({ k: type + 'p', h: c.p * scale, color: col, pending: true });
                  return out;
                });
                const title = `${t('views.dashboard.barTitleTotal', { label: b.label, count: tot })}\n` + ORDER.map((type) => {
                  const c = b.cells[type];
                  const n = c.a + c.p;
                  if (!n) return null;
                  return c.p
                    ? t('views.dashboard.barTypePending', { type: t(ABSENCE_TYPES[type].labelKey), count: n, pending: c.p })
                    : t('views.dashboard.barTypeLine', { type: t(ABSENCE_TYPES[type].labelKey), count: n });
                }).filter(Boolean).join(' · ');
                return (
                  <button key={i} className="bar-col" title={title} onClick={() => drillMonths(b.months, b.label)}>
                    <span className={`bar-val ${tot === 0 ? 'empty' : ''}`}>{tot || '0'}</span>
                    <div className="bar-track">
                      {segs.map((s) => (
                        <div key={s.k} className={`bar-seg ${s.pending ? 'pending' : ''}`} style={{ height: Math.max(2, s.h), background: s.color }} />
                      ))}
                    </div>
                    <span className="bar-x">{b.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="bars-baseline" />
          </>
        )}
      </div>

      {/* by employee + utilization */}
      <div className="dash-2col">
        <div className="card dash-card">
          <div className="dash-card-head">
            <div>
              <h3>{t('views.dashboard.byEmpTitle')}</h3>
              <div className="dch-sub">{t('views.dashboard.byEmpSub')}</div>
            </div>
          </div>
          {empRows.some((r) => r.total > 0) ? (
            <div className="emp-bars">
              {empRows.map((row) => {
                const e = empById(row.id);
                return (
                  <div key={row.id} className="emp-row" onClick={() => drillEmp(row.id)} title={`${e?.name}: ${t('common.days', { count: row.total })}`}>
                    <div className="emp-name"><Avatar emp={e} size="sm" /><span>{e?.name}</span></div>
                    <div className="emp-bar">
                      {ORDER.flatMap((type) => {
                        const c = row.cells[type], col = ABSENCE_TYPES[type].color, out: ReactElement[] = [];
                        if (c.a > 0) out.push(<div key={type + 'a'} className="emp-seg" style={{ width: (c.a / maxEmp * 100) + '%', background: col }} />);
                        if (c.p > 0) out.push(<div key={type + 'p'} className="emp-seg pending" style={{ width: (c.p / maxEmp * 100) + '%', background: col }} />);
                        return out;
                      })}
                    </div>
                    <div className="emp-total"><b>{row.total}</b> {t('balance.miniDays')}</div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState icon="users" title={t('views.dashboard.byEmpEmptyTitle')} sub={t('views.dashboard.byEmpEmptySub')} />}
        </div>

        <div className="card dash-card">
          <div className="dash-card-head">
            <div>
              <h3>{t('views.dashboard.utilTitle')}</h3>
              <div className="dch-sub">{t('views.dashboard.utilSub', { type: utilLabel })}</div>
            </div>
          </div>
          {utilRows.length ? (
            <div className="util-list">
              {utilRows.map((row) => {
                const e = empById(row.id);
                const pct = Math.round(row.pct * 100);
                const remaining = row.entitled - row.used;
                const color = ABSENCE_TYPES[utilType].color;
                return (
                  <div key={row.id} className="util-row">
                    <div className="util-name"><Avatar emp={e} size="sm" /><span>{e?.name}</span></div>
                    <div className="util-mid">
                      <div className="util-meter"><div className="fill" style={{ width: Math.min(100, pct) + '%', background: color }} /></div>
                      <div className="util-fig">{t('views.dashboard.utilFig', { used: row.used, entitled: row.entitled })}<span className="row-dot" />{t('views.dashboard.utilRemaining', { count: remaining })}</div>
                    </div>
                    {row.pct >= 0.8 && <span className="util-tag warn">{t('views.dashboard.utilNearMax')}</span>}
                    {row.pct < 0.25 && <span className="util-tag low">{t('views.dashboard.utilLow')}</span>}
                  </div>
                );
              })}
            </div>
          ) : <EmptyState icon="calendar" title={t('views.dashboard.utilEmptyTitle')} sub={t('views.dashboard.utilEmptySub', { type: utilLabel })} />}
        </div>
      </div>
    </div>
  );
}
