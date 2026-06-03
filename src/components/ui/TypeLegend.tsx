/**
 * TypeLegend — swatch + label per absence type, in TYPE_ORDER. Ported from the
 * prototype; labels resolved via ABSENCE_TYPES[type].labelKey + t().
 */
import { useTranslation } from 'react-i18next';
import { ABSENCE_TYPES, TYPE_ORDER } from '../../domain/absence';

export function TypeLegend() {
  const { t } = useTranslation();
  return (
    <div className="legend">
      {TYPE_ORDER.map((type) => (
        <span key={type} className="legend-item">
          <span className="legend-swatch" style={{ background: ABSENCE_TYPES[type].color }} />
          {t(ABSENCE_TYPES[type].labelKey)}
        </span>
      ))}
    </div>
  );
}
