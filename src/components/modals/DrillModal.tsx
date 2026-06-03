/* ============================================================
   Day Off — Drill-down modal: the requests behind a number.
   Ported from the prototype's DrillModal. A wide modal listing the
   requests for a clicked dashboard cell, via RequestRow (showEmp).
   `title`/`sub` are localized by the caller (DashboardView builds the
   drill payload with useL10n); empty-state strings come from useL10n.
   ============================================================ */
import { type ReactNode } from 'react';
import { useL10n } from '../../domain/useL10n';
import type { DayOffRequest } from '../../domain/types';
import { Modal, EmptyState } from '../ui';
import { RequestRow } from '../views/EmployeeView';

export interface DrillModalProps {
  title: ReactNode;
  sub?: ReactNode;
  requests: DayOffRequest[];
  onOpenRequest: (request: DayOffRequest) => void;
  onClose: () => void;
}

export function DrillModal({ title, sub, requests, onOpenRequest, onClose }: DrillModalProps) {
  const { t } = useL10n();
  return (
    <Modal title={title} sub={sub} wide onClose={onClose}>
      {requests.length ? (
        <div className="card list" style={{ boxShadow: 'none' }}>
          {requests.map((r) => (
            <RequestRow key={r.id} request={r} onClick={onOpenRequest} showEmp />
          ))}
        </div>
      ) : (
        <EmptyState title={t('drill.emptyTitle')} sub={t('drill.emptySub')} />
      )}
    </Modal>
  );
}
