/**
 * RequestDetailModal — view a request with avatar/status, detail-list, two note
 * cards (employee + manager), and manager/employee footer actions.
 * Ported from the prototype's RequestDetailModal (modals.jsx).
 */
import { Avatar, Icon, Modal, Rng, StatusBadge, TypeChip } from '../ui';
import { ABSENCE_TYPES } from '../../domain/absence';
import { workdaysBetween } from '../../domain/dates';
import { useL10n } from '../../domain/useL10n';
import { useDayOffData } from '../../contexts/DayOffDataProvider';
import type { DayOffRequest } from '../../domain/types';

/** Human-readable file size (technical units, not localized). */
function fmtFileSize(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export interface RequestDetailModalProps {
  request: DayOffRequest;
  viewerIsManager: boolean;
  onClose: () => void;
  onApprove: (request: DayOffRequest) => void;
  onReject: (request: DayOffRequest) => void;
  onCancel: (request: DayOffRequest) => void;
  onEdit?: (request: DayOffRequest) => void;
}

export function RequestDetailModal({
  request,
  viewerIsManager,
  onClose,
  onApprove,
  onReject,
  onCancel,
  onEdit,
}: RequestDetailModalProps) {
  const { t, fmtDate, relDays } = useL10n();
  const { empById } = useDayOffData();

  const emp = empById(request.employeeId);
  const meta = ABSENCE_TYPES[request.type];
  const workdays = workdaysBetween(request.start, request.end);
  const decidedBy = request.decidedBy ? empById(request.decidedBy) : null;
  const canManage = viewerIsManager && request.status === 'pending';
  const canCancel = !viewerIsManager && request.status === 'pending';

  return (
    <Modal
      title={t(meta.labelKey)}
      sub={<Rng start={request.start} end={request.end} />}
      onClose={onClose}
      footer={
        <>
          {canCancel && (
            <button className="btn btn-danger spread" onClick={() => onCancel(request)}>
              <Icon name="trash" size={15} /> {t('detail.cancelRequest')}
            </button>
          )}
          {canManage && (
            <>
              <button className="btn btn-reject" onClick={() => onReject(request)}>
                <Icon name="x" size={16} /> {t('detail.reject')}
              </button>
              <button className="btn btn-approve" onClick={() => onApprove(request)}>
                <Icon name="check" size={16} /> {t('detail.approve')}
              </button>
            </>
          )}
          {!canManage && !canCancel && (
            <button className="btn btn-secondary" onClick={onClose}>
              {t('common.close')}
            </button>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
        <Avatar emp={emp} size="lg" />
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-on-dark)' }}>{emp?.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{emp?.title}</div>
        </div>
        <div style={{ marginInlineStart: 'auto' }}>
          <StatusBadge status={request.status} />
        </div>
      </div>

      <div className="detail-list card" style={{ padding: '4px var(--spacing-lg)' }}>
        <div className="detail-row">
          <span className="dl">{t('detail.rowType')}</span>
          <span className="dv">
            <TypeChip type={request.type} />
          </span>
        </div>
        <div className="detail-row">
          <span className="dl">{t('detail.rowDates')}</span>
          <span className="dv">
            <Rng start={request.start} end={request.end} />
          </span>
        </div>
        <div className="detail-row">
          <span className="dl">{t('detail.rowDuration')}</span>
          <span className="dv">{t('common.workdays', { count: workdays })}</span>
        </div>
        <div className="detail-row">
          <span className="dl">{t('detail.rowSubmitted')}</span>
          <span className="dv">
            {fmtDate(request.submittedAt)} · {relDays(request.submittedAt)}
          </span>
        </div>
        {request.attachment && (
          <div className="detail-row">
            <span className="dl">{t('detail.rowDocument')}</span>
            <span className="dv">
              {request.attachment.url ? (
                <a className="file-link" href={request.attachment.url} target="_blank" rel="noopener">
                  <Icon name="paperclip" size={15} />
                  {request.attachment.name}
                </a>
              ) : (
                <span className="file-link" style={{ cursor: 'default' }}>
                  <Icon name="paperclip" size={15} />
                  {request.attachment.name}
                </span>
              )}
              {request.attachment.size != null && (
                <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400, marginInlineStart: 6 }}>
                  · {fmtFileSize(request.attachment.size)}
                </span>
              )}
            </span>
          </div>
        )}
        {decidedBy && (
          <div className="detail-row">
            <span className="dl">{request.status === 'approved' ? t('detail.decidedByApproved') : t('detail.decidedByRejected')}</span>
            <span className="dv">{decidedBy.name}</span>
          </div>
        )}
      </div>

      {/* Two clearly-separated notes — who wrote each is always explicit. */}
      <div className="notes-block">
        <div className="note-card employee">
          <div className="note-head">
            <Icon name="user" size={13} /> {t('detail.employeeNote')}
          </div>
          <div className="note-body">
            {request.note ? request.note : <span className="note-empty">{t('detail.employeeNoteEmpty')}</span>}
          </div>
        </div>
        <div className={`note-card manager ${request.status === 'rejected' ? 'danger' : ''}`}>
          <div className="note-head">
            <Icon name="check" size={13} /> {t('detail.managerNote')}
          </div>
          <div className="note-body">
            {request.managerNote ? (
              request.managerNote
            ) : (
              <span className="note-empty">
                {request.status === 'pending' ? t('detail.managerNotePending') : t('detail.managerNoteEmpty')}
              </span>
            )}
          </div>
        </div>
      </div>

      {canCancel && onEdit && (
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => onEdit(request)}>
          {t('detail.editRequest')}
        </button>
      )}
    </Modal>
  );
}
