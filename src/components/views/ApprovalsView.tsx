/**
 * ApprovalsView — manager approvals table grouped by status (pending / approved /
 * rejected) with collapsible accordion sections.
 */
import { Fragment, useState } from 'react';
import { Avatar, Icon, MiniLoader, Rng, StatusBadge, TypeChip } from '../ui';
import { ABSENCE_TYPES } from '../../domain/absence';
import { workdaysBetween } from '../../domain/dates';
import { useL10n } from '../../domain/useL10n';
import { useDayOffData } from '../../contexts/DayOffDataProvider';
import type { DayOffRequest } from '../../domain/types';

export interface ApprovalsViewProps {
  onOpenRequest: (request: DayOffRequest) => void;
  onApprove: (request: DayOffRequest) => void;
  onReject: (request: DayOffRequest) => void;
  onApproveAll: () => void;
  approvingId?: string | null;
}

type ApprovalGroupId = 'pending' | 'approved' | 'rejected';

interface ApprovalGroup {
  id: ApprovalGroupId;
  items: DayOffRequest[];
}

interface ApprovalRowProps {
  request: DayOffRequest;
  team: string;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
}

function ApprovalRow({ request, team, onOpen, onApprove, onReject, approving }: ApprovalRowProps) {
  const { t, relDays } = useL10n();
  const meta = ABSENCE_TYPES[request.type] ?? { id: request.type, labelKey: request.type, color: 'var(--color-primary)', index: 0 };
  const days = workdaysBetween(request.start, request.end);
  const { empById } = useDayOffData();
  const emp = empById(request.employeeId);
  const openKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onOpen();
  };

  const whenLabel =
    request.status === 'pending'
      ? t('views.approvals.submitted', { rel: relDays(request.submittedAt) })
      : request.decidedAt
        ? t('views.approvals.decided', { rel: relDays(request.decidedAt) })
        : t('views.approvals.submitted', { rel: relDays(request.submittedAt) });

  return (
    <div className="approvals-row">
      <span
        className="row-bar"
        style={request.status === 'rejected' ? undefined : { background: meta.color }}
        data-status={request.status}
      />
      <div
        className="approvals-cell approvals-cell-name approvals-col-employee"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={openKey}
      >
        <Avatar emp={emp} size="sm" />
        <span className="approvals-cell-text">{emp?.name}</span>
      </div>
      <div
        className="approvals-cell approvals-cell-muted approvals-col-team"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={openKey}
      >
        {team || <span className="approvals-cell-empty">—</span>}
      </div>
      <div className="approvals-cell approvals-col-type" role="button" tabIndex={0} onClick={onOpen} onKeyDown={openKey}>
        <TypeChip type={request.type} />
      </div>
      <div
        className="approvals-cell approvals-cell-dates approvals-col-dates"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={openKey}
      >
        <Rng start={request.start} end={request.end} />
        <span className="approvals-cell-workdays"> ({t('common.workdays', { count: days })})</span>
      </div>
      <div
        className="approvals-cell approvals-cell-doc approvals-col-document"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={openKey}
      >
        {request.attachment ? (
          <span className="approvals-doc-link">
            <Icon name="paperclip" size={12} /> {t('common.document')}
          </span>
        ) : (
          <span className="approvals-cell-empty">—</span>
        )}
      </div>
      <div
        className="approvals-cell approvals-cell-muted approvals-col-submitted"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={openKey}
      >
        {whenLabel}
      </div>
      <div className="approvals-cell-actions approvals-col-actions">
        {request.status === 'pending' ? (
          <>
            <button className="btn btn-reject btn-sm" disabled={approving} onClick={onReject}>
              <Icon name="x" size={15} /> {t('approve.rejectAction')}
            </button>
            <button className="btn btn-approve btn-sm" disabled={approving} onClick={onApprove}>
              {approving ? <MiniLoader size={14} /> : <Icon name="check" size={15} />}
              {t('approve.approveAction')}
            </button>
          </>
        ) : (
          <StatusBadge status={request.status} />
        )}
      </div>
    </div>
  );
}

export function ApprovalsView({
  onOpenRequest,
  onApprove,
  onReject,
  onApproveAll,
  approvingId,
}: ApprovalsViewProps) {
  const { t } = useL10n();
  const { requests, teams, teamsOf, statusColor } = useDayOffData();

  const [openGroups, setOpenGroups] = useState<Record<ApprovalGroupId, boolean>>({
    pending: true,
    approved: false,
    rejected: false,
  });

  const teamLabel = (empId: string) =>
    teamsOf(empId)
      .map((tm) => tm.name || t('settings.team.namePlaceholder', { n: teams.indexOf(tm) + 1 }))
      .join(' · ');

  const pending = requests
    .filter((r) => r.status === 'pending')
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  const approved = requests
    .filter((r) => r.status === 'approved')
    .slice()
    .sort((a, b) => (b.decidedAt || b.submittedAt).localeCompare(a.decidedAt || a.submittedAt));
  const rejected = requests
    .filter((r) => r.status === 'rejected')
    .slice()
    .sort((a, b) => (b.decidedAt || b.submittedAt).localeCompare(a.decidedAt || a.submittedAt));

  const groups: ApprovalGroup[] = [
    { id: 'pending', items: pending },
    { id: 'approved', items: approved },
    { id: 'rejected', items: rejected },
  ];

  const hasAny = groups.some((g) => g.items.length > 0);
  const toggleGroup = (id: ApprovalGroupId) => setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

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
        {hasAny ? (
          <div className="approvals-grid">
            <div className="approvals-head" aria-hidden="true">
              <span className="approvals-head-bar" />
              <div className="approvals-head-label approvals-col-employee">{t('views.approvals.colEmployee')}</div>
              <div className="approvals-head-label approvals-col-team">{t('views.approvals.colTeam')}</div>
              <div className="approvals-head-label approvals-col-type">{t('views.approvals.colType')}</div>
              <div className="approvals-head-label approvals-col-dates">{t('views.approvals.colDates')}</div>
              <div className="approvals-head-label approvals-col-document">{t('views.approvals.colDocument')}</div>
              <div className="approvals-head-label approvals-col-submitted">{t('views.approvals.colSubmitted')}</div>
              <div className="approvals-head-label approvals-col-actions" />
            </div>

            {groups.map((group) => {
              const isOpen = openGroups[group.id];
              return (
                <Fragment key={group.id}>
                  <button
                    type="button"
                    className="approvals-acc-head"
                    aria-expanded={isOpen}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <span
                      className="group-tick"
                      style={{ background: statusColor(group.id) }}
                      aria-hidden="true"
                    />
                    <span className="approvals-acc-title">{t(`status.${group.id}`)}</span>
                    <Icon
                      name="chevron-down"
                      size={18}
                      className={`approvals-acc-chevron rtl-flip${isOpen ? ' open' : ''}`}
                    />
                  </button>
                  {isOpen &&
                    (group.items.length ? (
                      group.items.map((r) => (
                        <ApprovalRow
                          key={r.id}
                          request={r}
                          team={teamLabel(r.employeeId)}
                          onOpen={() => onOpenRequest(r)}
                          onApprove={() => onApprove(r)}
                          onReject={() => onReject(r)}
                          approving={approvingId === r.id}
                        />
                      ))
                    ) : (
                      <div className="approvals-acc-empty">{t('views.approvals.emptyGroup')}</div>
                    ))}
                </Fragment>
              );
            })}
          </div>
        ) : (
          <div className="list-empty">{t('views.approvals.emptySub')}</div>
        )}
      </div>
    </div>
  );
}
