/**
 * StatusBadge — request status pill. Ported from the prototype's StatusBadge;
 * labels resolved via STATUS_LABEL_KEY + t().
 */
import { useTranslation } from 'react-i18next';
import { STATUS_LABEL_KEY } from '../../domain/absence';
import type { RequestStatus } from '../../domain/types';

export interface StatusBadgeProps {
  status: RequestStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();
  return <span className={`status ${status}`}>{t(STATUS_LABEL_KEY[status])}</span>;
}
