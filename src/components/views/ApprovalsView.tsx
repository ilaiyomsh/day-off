/**
 * ApprovalsView — manager approvals: pending list (with inline approve/reject),
 * recently-handled list, and the scope note. Ported from the prototype's
 * ApprovalsView in views.jsx. Reuses RequestRow from EmployeeView, the useDayOffData()
 * data hook, and useL10n() for date formatting.
 */
import { Avatar, Icon, Rng } from '../ui';
import { ABSENCE_TYPES } from '../../domain/absence';
import { workdaysBetween } from '../../domain/dates';
import { useL10n } from '../../domain/useL10n';
import { useDayOffData } from '../../contexts/DayOffDataProvider';
import type { DayOffRequest } from '../../domain/types';
import { RequestRow } from './EmployeeView';

export interface ApprovalsViewProps {
  currentUserId: string;
  onOpenRequest: (request: DayOffRequest) => void;
  onApprove: (request: DayOffRequest) => void;
  onReject: (request: DayOffRequest) => void;
  onApproveAll: () => void;
}

export function ApprovalsView({
  currentUserId,
  onOpenRequest,
  onApprove,
  onReject,
  onApproveAll,
}: ApprovalsViewProps) {
  const { t, relDays } = useL10n();
  const { requests, empById, balanceFor, teams, teamsOf } = useDayOffData();

  // Comma-joined team names for a given employee (label shown next to the name).
  const teamLabel = (empId: string) =>
    teamsOf(empId)
      .map((tm) => tm.name || t('settings.team.namePlaceholder', { n: teams.indexOf(tm) + 1 }))
      .join(' · ');

  const pending = requests
    .filter((r) => r.status === 'pending' && r.employeeId !== currentUserId)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  const recent = requests
    .filter((r) => r.status !== 'pending' && r.decidedAt && r.employeeId !== currentUserId)
    .slice()
    .sort((a, b) => (b.decidedAt || '').localeCompare(a.decidedAt || ''))
    .slice(0, 6);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>{t('views.approvals.title')}</h2>
          {pending.length > 0 && (
            <div className="sub">{t('views.approvals.pendingCount', { count: pending.length })}</div>
          )}
        </div>
        {pending.length > 0 && (
          <button className="btn btn-approve" onClick={onApproveAll}>
            <Icon name="check" size={16} /> {t('views.approvals.approveAll')}
          </button>
        )}
      </div>

      <div className="card list">
        {pending.length ? (
          pending.map((r) => {
            const emp = empById(r.employeeId);
            const meta = ABSENCE_TYPES[r.type];
            const days = workdaysBetween(r.start, r.end);
            const bal = balanceFor(Number(r.start.slice(0, 4)), r.employeeId, r.type);
            return (
              <div key={r.id} className="list-row">
                <span className="row-bar" style={{ background: meta.color }} />
                <Avatar emp={emp} />
                <div className="row-main" style={{ cursor: 'pointer' }} onClick={() => onOpenRequest(r)}>
                  <div className="row-title">
                    {emp?.name}
                    {teamLabel(r.employeeId) && <span className="row-team">{teamLabel(r.employeeId)}</span>}
                    <span className="type-chip" style={{ fontSize: 12 }}>
                      <span className="dot" style={{ background: meta.color }} />
                      {t(meta.labelKey)}
                    </span>
                  </div>
                  <div className="row-meta">
                    <Rng start={r.start} end={r.end} />
                    <span className="row-dot" />
                    <span>{t('common.days', { count: days })}</span>
                    <span className="row-dot" />
                    <span>{t('views.approvals.submitted', { rel: relDays(r.submittedAt) })}</span>
                    {bal.entitled > 0 && (
                      <>
                        <span className="row-dot" />
                        <span>{t('views.approvals.balance', { count: bal.entitled - bal.used })}</span>
                      </>
                    )}
                    {r.attachment && (
                      <>
                        <span className="row-dot" />
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--color-primary)' }}>
                          <Icon name="paperclip" size={12} /> {t('common.document')}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="row-actions">
                  <button className="btn btn-reject btn-sm" onClick={() => onReject(r)}>
                    <Icon name="x" size={15} /> {t('approve.rejectAction')}
                  </button>
                  <button className="btn btn-approve btn-sm" onClick={() => onApprove(r)}>
                    <Icon name="check" size={15} /> {t('approve.approveAction')}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="list-empty">{t('views.approvals.emptySub')}</div>
        )}
      </div>

      {recent.length > 0 && (
        <>
          <div className="section-title">{t('views.approvals.recentTitle')}</div>
          <div className="card list">
            {recent.map((r) => (
              <RequestRow key={r.id} request={r} onClick={onOpenRequest} showEmp />
            ))}
          </div>
        </>
      )}

    </div>
  );
}
