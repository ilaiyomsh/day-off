/**
 * CompanyDaysView — manager table of company days / holidays for the selected
 * year. Ported from the prototype's CompanyDaysView. Data comes from
 * useDayOffData() (companyDays + years); dates via useL10n(); all strings via t().
 */
import { useL10n } from '../../domain/useL10n';
import { todayKey, calDaysBetween } from '../../domain/dates';
import { useDayOffData } from '../../contexts/DayOffDataProvider';
import type { CompanyDay } from '../../domain/types';
import { Icon, Rng, YearSelect, EmptyState } from '../ui';

export interface CompanyDaysViewProps {
  year: number;
  onYearChange: (year: number) => void;
  onAdd: () => void;
  onEdit: (day: CompanyDay) => void;
}

export function CompanyDaysView({ year, onYearChange, onAdd, onEdit }: CompanyDaysViewProps) {
  const { t, relDays } = useL10n();
  const { companyDays, years } = useDayOffData();

  const tKey = todayKey();
  const all = companyDays
    .filter((d) => Number(d.start.slice(0, 4)) === year)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  const mandatoryCount = all.filter((d) => d.mandatory).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>{t('views.company.title')}</h2>
          <div className="sub">{t('views.company.sub', { count: all.length, year, mandatory: mandatoryCount })}</div>
        </div>
        <div className="head-actions">
          <YearSelect year={year} years={years} onChange={onYearChange} />
          <button className="btn btn-primary" onClick={onAdd}>
            <Icon name="plus" size={17} strokeWidth={2} /> {t('views.company.addDay')}
          </button>
        </div>
      </div>

      {all.length ? (
        <div className="card cd-card">
          <table className="cd-table">
            <thead>
              <tr>
                <th>{t('views.company.colName')}</th>
                <th>{t('views.company.colDates')}</th>
                <th className="cd-num-col">{t('views.company.colDays')}</th>
                <th>{t('views.company.colKind')}</th>
                <th aria-label={t('views.company.colEdit')} />
              </tr>
            </thead>
            <tbody>
              {all.map((h) => {
                const past = h.end < tKey;
                const dcount = calDaysBetween(h.start, h.end);
                return (
                  <tr key={h.id} className={`cd-row ${past ? 'past' : ''}`} onClick={() => onEdit(h)}>
                    <td className="cd-name">
                      <span className={`cd-mark ${h.mandatory ? '' : 'optional'}`}>
                        <Icon name="star" size={10} fill={h.mandatory ? 'currentColor' : 'none'} />
                      </span>
                      <span className="cd-name-txt">{h.name}</span>
                      {!past && relDays(h.start) && <span className="cd-rel">{relDays(h.start)}</span>}
                    </td>
                    <td><Rng start={h.start} end={h.end} /></td>
                    <td className="cd-num-col">{dcount}</td>
                    <td>
                      <span className={`req-pill ${h.mandatory ? 'mandatory' : 'optional'}`}>
                        {h.mandatory ? t('companyDay.mandatory') : t('companyDay.optional')}
                      </span>
                    </td>
                    <td className="cd-edit">
                      <Icon name="chevron-right" size={17} className="rtl-flip" style={{ color: 'var(--color-text-disabled)' }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card list">
          <EmptyState icon="calendar" title={t('views.company.emptyTitle', { year })} sub={t('views.company.emptySub')} />
        </div>
      )}
    </div>
  );
}
