/* ============================================================
   Day Off — Employee view ("My absences"). Ported from the prototype's
   EmployeeView (+ BalanceCard, MiniBalance, RequestRow, GroupedRequests).
   Data comes from useDayOffData(); dates via useL10n(). The layout toggle
   was removed — the calendar is always shown above the grouped list.
   ============================================================ */
import { type CSSProperties } from 'react';
import { useDayOffData } from '../../contexts/DayOffDataProvider';
import { useL10n } from '../../domain/useL10n';
import { ABSENCE_TYPES } from '../../domain/absence';
import { workdaysBetween } from '../../domain/dates';
import type { AbsenceType, CompanyDay, DayOffRequest, RequestStatus } from '../../domain/types';
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

interface BalanceCardProps {
  empId: string;
  type: AbsenceType;
  year: number;
}

function BalanceCard({ empId, type, year }: BalanceCardProps) {
  const { t } = useL10n();
  const { balanceFor, pendingDaysFor } = useDayOffData();
  const meta = ABSENCE_TYPES[type];
  const bal = balanceFor(year, empId, type);
  const pending = pendingDaysFor(empId, type, year);
  const hasQuota = bal.entitled > 0;
  const remaining = bal.entitled - bal.used;
  const pct = hasQuota ? Math.min(100, (bal.used / bal.entitled) * 100) : 0;
  return (
    <div className="balance-card" style={{ '--accent': meta.color } as CSSProperties}>
      <div className="balance-top">
        <span className="balance-dot" style={{ background: meta.color }} />
        <span className="balance-title">{t(meta.labelKey)}</span>
      </div>
      {hasQuota ? (
        <>
          <div className="balance-figures">
            <span className="balance-remaining">{remaining}</span>
            <span className="balance-of">{t('balance.of', { count: bal.entitled })}</span>
          </div>
          <div className="balance-meter">
            <div className="fill used" style={{ width: pct + '%' }} />
            {pending > 0 && (
              <div
                className="fill pending"
                style={{ width: Math.min(100 - pct, (pending / bal.entitled) * 100) + '%', background: meta.color }}
              />
            )}
          </div>
          <div className="balance-legend">
            <span>
              {t('balance.used')} <b>{bal.used}</b>
            </span>
            {pending > 0 ? (
              <span className="bl-pending" style={{ color: meta.color }}>
                {t('balance.pending')} <b>{pending}</b>
              </span>
            ) : (
              <span>
                {t('balance.remaining')} <b>{remaining}</b>
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="balance-figures">
            <span className="balance-remaining">{bal.used}</span>
            <span className="balance-of">{t('balance.daysThisYear')}</span>
          </div>
          <div className="balance-meter">
            <div className="fill used" style={{ width: bal.used ? '100%' : '0%' }} />
          </div>
          <div className="balance-legend">
            <span>{t('balance.noQuota')}</span>
            {pending > 0 && (
              <span className="bl-pending" style={{ color: meta.color }}>
                {t('balance.pending')} <b>{pending}</b>
              </span>
            )}
          </div>
        </>
      )}
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
  const isPending = request.status === 'pending';
  return (
    <div className="list-row" style={{ cursor: 'pointer' }} onClick={() => onClick(request)}>
      <span className="row-bar" style={isPending ? { background: meta.color } : undefined} data-status={request.status} />
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
      <Icon name="chevron-right" size={18} style={{ color: 'var(--color-text-disabled)' }} />
    </div>
  );
}

/* Requests grouped by STATUS — pending always first, then approved, then rejected.
   Each request appears exactly once, in its own status group. */
const STATUS_GROUPS: { status: RequestStatus; labelKey: string }[] = [
  { status: 'pending', labelKey: 'groups.pending' },
  { status: 'approved', labelKey: 'groups.approved' },
  { status: 'rejected', labelKey: 'groups.rejected' },
];

interface GroupedRequestsProps {
  requests: DayOffRequest[];
  onOpenRequest: (request: DayOffRequest) => void;
  emptyTitle?: string;
  emptySub?: string;
}

function GroupedRequests({ requests, onOpenRequest, emptyTitle, emptySub }: GroupedRequestsProps) {
  if (!requests.length) {
    return (
      <div className="card list">
        <EmptyState icon="calendar" title={emptyTitle} sub={emptySub} />
      </div>
    );
  }
  // pending sorted soonest-first; settled groups newest-first
  const byStatus: Record<RequestStatus, DayOffRequest[]> = {
    pending: requests.filter((r) => r.status === 'pending').slice().sort((a, b) => a.start.localeCompare(b.start)),
    approved: requests.filter((r) => r.status === 'approved').slice().sort((a, b) => b.start.localeCompare(a.start)),
    rejected: requests.filter((r) => r.status === 'rejected').slice().sort((a, b) => b.start.localeCompare(a.start)),
  };
  return (
    <>
      {STATUS_GROUPS.map((g) => {
        const list = byStatus[g.status];
        if (!list.length) return null;
        return (
          <div key={g.status} className="req-group">
            <div className="section-title">
              <span className={`group-tick ${g.status}`} />
              <GroupLabel labelKey={g.labelKey} /> <span className="count">· {list.length}</span>
            </div>
            <div className="card list">
              {list.map((r) => (
                <RequestRow key={r.id} request={r} onClick={onOpenRequest} />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function GroupLabel({ labelKey }: { labelKey: string }) {
  const { t } = useL10n();
  return <>{t(labelKey)}</>;
}

/* Compact balance line for types without a real annual quota (sick / reserves). */
interface MiniBalanceProps {
  empId: string;
  type: AbsenceType;
  year: number;
}

function MiniBalance({ empId, type, year }: MiniBalanceProps) {
  const { t } = useL10n();
  const { balanceFor, pendingDaysFor } = useDayOffData();
  const meta = ABSENCE_TYPES[type];
  const bal = balanceFor(year, empId, type);
  const pending = pendingDaysFor(empId, type, year);
  return (
    <div className="mini-bal">
      <span className="mini-dot" style={{ background: meta.color }} />
      <span className="mini-label">{t(meta.labelKey)}</span>
      <span className="mini-val">
        <b>{bal.used}</b> {t('balance.miniDays')}
        {pending > 0 && (
          <span className="mini-pending" style={{ color: meta.color }}>
            {' '}
            · {t('balance.miniPending', { count: pending })}
          </span>
        )}
      </span>
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

  const mine = requests.filter((r) => r.employeeId === currentUser.id);
  const inYear = mine.filter(
    (r) => Number(r.start.slice(0, 4)) === year || Number(r.end.slice(0, 4)) === year,
  );

  const rail = (
    <aside className="emp-rail">
      <div className="rail-title">{t('views.mine.balancesTitle', { year })}</div>
      <BalanceCard empId={currentUser.id} type="vacation" year={year} />
      <div className="card mini-balances">
        <MiniBalance empId={currentUser.id} type="sick" year={year} />
        <MiniBalance empId={currentUser.id} type="reserves" year={year} />
      </div>
    </aside>
  );

  return (
    <div className="page emp-page">
      <div className="page-head">
        <div>
          <h2>{t('views.mine.title')}</h2>
          <div className="sub">{t('views.mine.sub', { year })}</div>
        </div>
        <div className="head-actions">
          <YearSelect year={year} years={years} onChange={onYearChange} />
          <button className="btn btn-primary" onClick={() => onNewRequest()}>
            <Icon name="plus" size={17} strokeWidth={2} /> {t('views.mine.newRequest')}
          </button>
        </div>
      </div>

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
          <div className="section-head-row">
            <h3 className="block-title">
              {t('views.mine.requestsTitle', { year })} <span className="count">· {inYear.length}</span>
            </h3>
          </div>
          <GroupedRequests
            requests={inYear}
            onOpenRequest={onOpenRequest}
            emptyTitle={t('views.mine.emptyTitle', { year })}
            emptySub={t('views.mine.emptySub')}
          />
        </div>
        {rail}
      </div>
    </div>
  );
}
