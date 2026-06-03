/**
 * Rng — LTR-isolated date range (earlier -> later, left -> right).
 * Ported from the prototype; uses useL10n().fmtRange for locale formatting.
 */
import { useL10n } from '../../domain/useL10n';
import type { DayKey } from '../../domain/types';

export interface RngProps {
  start: DayKey;
  end: DayKey;
}

export function Rng({ start, end }: RngProps) {
  const { fmtRange } = useL10n();
  return (
    <span className="ltr-range" dir="ltr">
      {fmtRange(start, end)}
    </span>
  );
}
