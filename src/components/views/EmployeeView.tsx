/* ============================================================
   Day Off — Employee view ("My absences"). Layout: month calendar on the
   right (top-aligned); left column holds per-type absence-day stats on top
   (StatCard — days this month + this year, no quota) and the date-sorted
   request list below (pending first). Data via useDayOffData(); dates via useL10n().
   ============================================================ */
import { useState, type CSSProperties } from 'react';
import { useDayOffData } from '../../contexts/DayOffDataProvider';
import { useL10n } from '../../domain/useL10n';
import { ABSENCE_TYPES, TYPE_ORDER, reqWorkdayKeysInYear } from '../../domain/absence';
import { workdaysBetween } from '../../domain/dates';
import type { AbsenceType, CompanyDay, DayOffRequest } from '../../domain/types';
import {
  Avatar,
  CalToolbar,
  EmptyState,
  Icon,
  MonthCalendar,
  Rng,
  StatusBadge,
  YearSelect,
  type CalChip,
} from '../ui';

/* requests of an employee that cover a given day, for calendar chips */
function myChipsFor(
  requests: DayOffRequest[],
  holidaysOnKey: (dateKey: string) => CompanyDay[],
  typeLabel: (type: AbsenceType) => string,
  empId: string,
  dateKey: string,
  { includeHolidays = true }: { includeHolidays?: boolean } = {},
): CalChip[] {
  const chips: CalChip[] = [];
  if (includeHolidays) {
    holidaysOnKey(dateKey).forEach((h) => {
      chips.push({ key: 'h' + h.id, kind: 'holiday', label: h.name, color: '', start: h.start, end: h.end, mandatory: h.mandatory, data: h });
    });
  }
  requests
    .filter((r) => r.employeeId === empId && r.status !== 'rejected' && dateKey >= r.start && dateKey <= r.end)
    .forEach((r) => {
      const meta = ABSENCE_TYPES[r.type];
      chips.push({
        key: r.id,
        kind: 'absence',
        label: typeLabel(r.type),
        color: meta.color,
        start: r.start,
        end: r.end,
        pending: r.status === 'pending',
        data: r,
      });
    });
  return chips;
}

type StatScope = 'month' | 'year';

interface StatCardProps {
  empId: string;
  type: AbsenceType;
  year: number;
  monthDate: Date;
  scope: StatScope;
}

/** Compact per-type absence-day counter — one number for the selected scope (no quota). */
function StatCard({ empId, type, year, monthDate, scope }: StatCardProps) {
  const { t } = useL10n();
  const { requests, pendingDaysFor } = useDayOffData();
  const meta = ABSENCE_TYPES[type];
  const monthPrefix = `${year}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;

  // Count non-rejected workdays of this type within the selected year (clipped),
  // narrowing to the displayed month when the scope is 'month'.
  let days = 0;
  for (const r of requests) {
    if (r.employeeId !== empId || r.type !== type || r.status === 'rejected') continue;
    const keys = reqWorkdayKeysInYear(r, year);
    days += scope === 'month' ? keys.filter((k) => k.startsWith(monthPrefix)).length : keys.length;
  }
  const pending = pendingDaysFor(empId, type, year);

  return (
    <div className="stat-card" style={{ '--accent': meta.color } as CSSProperties}>
      {pending > 0 && <span className="stat-pending-dot" title={t('stats.pending', { count: pending })} />}
      <span className="stat-num">{days}</span>
      <span className="stat-top">
        <span className="balance-dot" style={{ background: meta.color }} />
        <span className="stat-title">{t(meta.labelKey)}</span>
      </span>
    </div>
  );
}

export interface RequestRowProps {
  request: DayOffRequest;
  onClick: (request: DayOffRequest) => void;
  showEmp?: boolean;
}

export function RequestRow({ request, onClick, showEmp }: RequestRowProps) {
  const { t } = useL10n();
  const { empById } = useDayOffData();
  const emp = empById(request.employeeId);
  const meta = ABSENCE_TYPES[request.type];
  const days = workdaysBetween(request.start, request.end);
  return (
    <div className="list-row" style={{ cursor: 'pointer' }} onClick={() => onClick(request)}>
      {/* approved = full type colour, pending = same colour faded (CSS), rejected = neutral grey (CSS) */}
      <span
        className="row-bar"
        style={request.status === 'rejected' ? undefined : { background: meta.color }}
        data-status={request.status}
      />
      {showEmp && <Avatar emp={emp} size="sm" />}
      <div className="row-main">
        <div className="row-title">
          {showEmp ? emp?.name : t(meta.labelKey)}
          {showEmp && (
            <span className="type-chip" style={{ fontSize: 12 }}>
              <span className="dot" style={{ background: meta.color }} />
              {t(meta.labelKey)}
            </span>
          )}
        </div>
        <div className="row-meta">
          <Rng start={request.start} end={request.end} />
          <span className="row-dot" />
          <span>{t('common.workdays', { count: days })}</span>
          {request.note && (
            <>
              <span className="row-dot" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                {request.note}
              </span>
            </>
          )}
          {request.attachment && (
            <span
              style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--color-primary)' }}
              title={t('common.attachedDocument')}
            >
              <Icon name="paperclip" size={13} />
            </span>
          )}
        </div>
      </div>
      <StatusBadge status={request.status} />
      <Icon name="chevron-right" size={18} className="rtl-flip" style={{ color: 'var(--color-text-disabled)' }} />
    </div>
  );
}

interface EmployeeViewProps {
  onNewRequest: () => void;
  onOpenRequest: (request: DayOffRequest) => void;
  onAddOnDay: (dateKey: string) => void;
}

export function EmployeeView({ onNewRequest, onOpenRequest, onAddOnDay }: EmployeeViewProps) {
  const { t } = useL10n();
  const { currentUser, monthDate, nav, year, years, onYearChange, requests, holidaysOnKey } = useDayOffData();
  const [scope, setScope] = useState<StatScope>('month');

  const mine = requests.filter((r) => r.employeeId === currentUser.id);
  const inYear = mine.filter(
    (r) => Number(r.start.slice(0, 4)) === year || Number(r.end.slice(0, 4)) === year,
  );

  // Open (pending) requests first — soonest start first — then the rest, newest first.
  const pending = inYear.filter((r) => r.status === 'pending').slice().sort((a, b) => a.start.localeCompare(b.start));
  const settled = inYear.filter((r) => r.status !== 'pending').slice().sort((a, b) => b.start.localeCompare(a.start));
  const ordered = [...pending, ...settled];

  return (
    <div className="page emp-page">
      <div className="page-head">
        <div>
          <h2>{t('views.mine.title')}</h2>
        </div>
        <div className="head-actions">
          <YearSelect year={year} years={years} onChange={onYearChange} />
          <button className="btn btn-primary" onClick={() => onNewRequest()}>
            {t('views.mine.newRequest')}
          </button>
        </div>
      </div>

      {/* calendar (right, top-aligned) + left column: stats on top, requests below */}
      <div className="emp-layout">
        <div className="emp-main">
          <CalToolbar {...nav} monthDate={monthDate} />
          <MonthCalendar
            monthDate={monthDate}
            chipsFor={(k) => myChipsFor(requests, holidaysOnKey, (type) => t(ABSENCE_TYPES[type].labelKey), currentUser.id, k)}
            onAddDay={(k) => onAddOnDay(k)}
            onChipClick={(c) => {
              if (c.kind === 'absence') onOpenRequest(c.data as DayOffRequest);
            }}
          />
        </div>
        <aside className="emp-side">
          {/* top-left: per-type absence-day stats — one compact card per type,
              scope toggled between the displayed month and the whole year (no quota) */}
          <div className="stats-block">
            <div className="stats-scope" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={scope === 'month'}
                className={scope === 'month' ? 'active' : ''}
                onClick={() => setScope('month')}
              >
                {t('stats.thisMonth')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scope === 'year'}
                className={scope === 'year' ? 'active' : ''}
                onClick={() => setScope('year')}
              >
                {t('stats.thisYear')}
              </button>
            </div>
            <div className="stats-row">
              {TYPE_ORDER.map((type) => (
                <StatCard key={type} empId={currentUser.id} type={type} year={year} monthDate={monthDate} scope={scope} />
              ))}
            </div>
          </div>

          {/* bottom-left: requests sorted by date, pending first */}
          <div className="section-head-row">
            <h3 className="block-title">{t('views.mine.requests')}</h3>
          </div>
          {ordered.length ? (
            <div className="card list">
              {ordered.map((r) => (
                <RequestRow key={r.id} request={r} onClick={onOpenRequest} />
              ))}
            </div>
          ) : (
            <div className="card list">
              <EmptyState icon="calendar" title={t('views.mine.emptyTitle', { year })} sub={t('views.mine.emptySub')} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
