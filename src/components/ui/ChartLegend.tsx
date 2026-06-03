/**
 * ChartLegend — color legend for the dashboard breakdown chart: one swatch per
 * absence type plus a hatched swatch for pending. Ported from dashboard.jsx.
 */
import { ABSENCE_TYPES, TYPE_ORDER } from '../../domain/absence';
import { useL10n } from '../../domain/useL10n';

export function ChartLegend() {
  const { t } = useL10n();
  return (
    <div className="dash-legend">
      {TYPE_ORDER.map((type) => (
        <span key={type} className="legend-item">
          <span className="legend-swatch" style={{ background: ABSENCE_TYPES[type].color }} />
          {t(ABSENCE_TYPES[type].labelKey)}
        </span>
      ))}
      <span className="legend-item">
        <span className="legend-swatch hatched" style={{ background: 'var(--color-bg-neutral-strong)' }} />
        {t('views.dashboard.legendPending')}
      </span>
    </div>
  );
}
