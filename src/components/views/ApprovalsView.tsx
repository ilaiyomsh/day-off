/**
 * ApprovalsView — manager approvals: pending list (with inline approve/reject),
 * recently-handled list, and the scope note. Ported from the prototype's
 * ApprovalsView in views.jsx. Reuses RequestRow from EmployeeView, the useDayOffData()
 * data hook, and useL10n() for date formatting.
 */
import { Avatar, Icon, MiniLoader, Rng, TypeChip } from '../ui';
import { ABSENCE_TYPES } from '../../domain/absence';
import { workdaysBetween } from '../../domain/dates';
import { useL10n } from '../../domain/useL10n';
import { useDayOffData } from '../../contexts/DayOffDataProvider';
import type { DayOffRequest } from '../../domain/types';
import { RequestRow } from './EmployeeView';

export interface ApprovalsViewProps {
  onOpenRequest: (request: DayOffRequest) => void;
  onApprove: (request: DayOffRequest) => void;
  onReject: (request: DayOffRequest) => void;
  onApproveAll: () => void;
  approvingId?: string | null;
}

export function ApprovalsView({
  onOpenRequest,
  onApprove,
  onReject,
  onApproveAll,
  approvingId,
}: ApprovalsViewProps) {
  const { t, relDays } = useL10n();
  const { requests, empById, teams, teamsOf } = useDayOffData();

  // Comma-joined team names for a given employee (label shown next to the name).
  const teamLabel = (empId: string) =>
    teamsOf(empId)
      .map((tm) => tm.name || t('settings.team.namePlaceholder', { n: teams.indexOf(tm) + 1 }))
      .join(' · ');

  const pending = requests
    .filter((r) => r.status === 'pending')
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  const recent = requests
    .filter((r) => r.status !== 'pending' && r.decidedAt)
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

      <div className="card approvals-table">
        {pending.length ? (
          <>
            <div className="approvals-head" aria-hidden="true">
              <span className="approvals-head-bar" />
              <span>{t('views.approvals.colEmployee')}</span>
              <span>{t('views.approvals.colTeam')}</span>
              <span>{t('views.approvals.colType')}</span>
              <span>{t('views.approvals.colDates')}</span>
              <span>{t('views.approvals.colDocument')}</span>
              <span>{t('views.approvals.colSubmitted')}</span>
              <span className="approvals-head-actions" />
            </div>
            {pending.map((r) => {
              const emp = empById(r.employeeId);
              const meta = ABSENCE_TYPES[r.type] ?? { id: r.type, labelKey: r.type, color: 'var(--color-primary)', index: 0 };
              const days = workdaysBetween(r.start, r.end);
              const team = teamLabel(r.employeeId);
              const open = () => onOpenRequest(r);
              return (
                <div key={r.id} className="approvals-row">
                  <span className="row-bar" style={{ background: meta.color }} />
                  <div className="approvals-cell approvals-cell-name" role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
                    <Avatar emp={emp} size="sm" />
                    <span className="approvals-cell-text">{emp?.name}</span>
                  </div>
                  <div className="approvals-cell approvals-cell-muted" role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
                    {team || <span className="approvals-cell-empty">—</span>}
                  </div>
                  <div className="approvals-cell" role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
                    <TypeChip type={r.type} />
                  </div>
                  <div className="approvals-cell approvals-cell-dates" role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
                    <Rng start={r.start} end={r.end} />
                    <span className="approvals-cell-workdays"> ({t('common.workdays', { count: days })})</span>
                  </div>
                  <div className="approvals-cell approvals-cell-doc" role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
                    {r.attachment ? (
                      <span className="approvals-doc-link">
                        <Icon name="paperclip" size={12} /> {t('common.document')}
                      </span>
                    ) : (
                      <span className="approvals-cell-empty">—</span>
                    )}
                  </div>
                  <div className="approvals-cell approvals-cell-muted" role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === 'Enter' && open()}>
                    {t('views.approvals.submitted', { rel: relDays(r.submittedAt) })}
                  </div>
                  <div className="approvals-cell-actions">
                    <button className="btn btn-reject btn-sm" disabled={approvingId === r.id} onClick={() => onReject(r)}>
                      <Icon name="x" size={15} /> {t('approve.rejectAction')}
                    </button>
                    <button className="btn btn-approve btn-sm" disabled={approvingId === r.id} onClick={() => onApprove(r)}>
                      {approvingId === r.id ? <MiniLoader size={14} /> : <Icon name="check" size={15} />}
                      {t('approve.approveAction')}
                    </button>
                  </div>
                </div>
              );
            })}
          </>
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
