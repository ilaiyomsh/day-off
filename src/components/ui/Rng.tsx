/**
 * Rng — a date range that follows the ambient direction (so in Hebrew it reads
 * right-to-left: earlier date on the right, then month, then year). Each number is
 * LTR-isolated on its own (so "18" never flips to "81"), while the dash and text
 * flow in the ambient direction — which puts the earlier day first (rightmost) in RTL.
 * Uses useL10n().fmtRange for locale formatting.
 */
import { useL10n } from '../../domain/useL10n';
import type { DayKey } from '../../domain/types';

export interface RngProps {
  start: DayKey;
  end: DayKey;
}

export function Rng({ start, end }: RngProps) {
  const { fmtRange } = useL10n();
  // Split on individual number runs. Each number gets its own LTR isolate; the
  // separator/month/year text flows in the ambient direction, so in RTL the
  // earlier date sits on the right.
  const parts = fmtRange(start, end).split(/(\d+)/g);
  return (
    <span className="date-range">
      {parts.map((p, i) =>
        /\d/.test(p) ? (
          <bdi key={i} dir="ltr">
            {p}
          </bdi>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}
