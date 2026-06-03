/**
 * KpiCard — a single KPI tile (label + icon + big value + footer). Ported from
 * dashboard.jsx. `accent` is a CSS color string exposed via the `--accent` var.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from './Icon';

export interface KpiCardProps {
  label: string;
  icon: string;
  accent: string;
  value: ReactNode;
  unit?: string;
  foot: ReactNode;
}

export function KpiCard({ label, icon, accent, value, unit, foot }: KpiCardProps) {
  return (
    <div className="kpi-card" style={{ '--accent': accent } as CSSProperties}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-ic">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="kpi-value">
        {value}
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      <div className="kpi-foot">{foot}</div>
    </div>
  );
}
