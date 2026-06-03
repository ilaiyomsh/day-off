import { type CSSProperties, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useL10n } from '../../domain/useL10n';
import { buildMonthMatrix, toKey, isWeekend, todayKey } from '../../domain/dates';
import type { Employee } from '../../domain/types';
import { Icon } from './Icon';

export type CalChipKind = 'absence' | 'holiday';

export interface CalChip {
  key: string;
  kind: CalChipKind;
  label: string;
  color: string;
  emp?: Employee;
  pending?: boolean;
  mandatory?: boolean;
  data?: unknown;
}

interface MonthCalendarProps {
  monthDate: Date;
  chipsFor: (dateKey: string) => CalChip[] | undefined;
  onAddDay?: (dateKey: string) => void;
  onChipClick?: (chip: CalChip) => void;
  maxChips?: number;
}

export function MonthCalendar({ monthDate, chipsFor, onAddDay, onChipClick, maxChips = 3 }: MonthCalendarProps) {
  const { t } = useTranslation();
  const { daysShort } = useL10n().names;
  const weeks = buildMonthMatrix(monthDate);
  const today = todayKey();
  const mo = monthDate.getMonth();

  return (
    <div className="calendar">
      <div className="cal-weekdays">
        {daysShort.map((d, i) => (
          <div key={d} className={`cal-weekday ${i >= 5 ? 'weekend' : ''}`}>
            {d}
          </div>
        ))}
      </div>
      <div className="cal-grid">
        {weeks.flat().map((date) => {
          const key = toKey(date);
          const chips = chipsFor(key) ?? [];
          const muted = date.getMonth() !== mo;
          const weekend = isWeekend(date);
          const isToday = key === today;
          const holiday = chips.find((c) => c.kind === 'holiday');
          const shown = chips.slice(0, maxChips);
          const extra = chips.length - shown.length;
          return (
            <div
              key={key}
              className={`cal-cell ${muted ? 'muted' : ''} ${weekend ? 'weekend' : ''} ${isToday ? 'today' : ''} ${holiday ? 'is-holiday' : ''}`}
              onClick={() => onAddDay && onAddDay(key)}
            >
              <div className="cell-head">
                <span className="cell-num">{date.getDate()}</span>
                {onAddDay && (
                  <button
                    className="cell-add"
                    title={t('calendar.addTitle')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddDay(key);
                    }}
                  >
                    <Icon name="plus" size={13} strokeWidth={2.2} />
                  </button>
                )}
              </div>
              {shown.map((c) => (
                <Chip
                  key={c.key}
                  chip={c}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChipClick?.(c);
                  }}
                />
              ))}
              {extra > 0 && (
                <span
                  className="evt-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChipClick?.(shown[0]);
                  }}
                >
                  {t('common.more', { count: extra })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ChipProps {
  chip: CalChip;
  onClick: (e: MouseEvent) => void;
}

export function Chip({ chip, onClick }: ChipProps) {
  const { t } = useTranslation();

  if (chip.kind === 'holiday') {
    return (
      <div
        className={`evt holiday-chip ${chip.mandatory ? '' : 'optional'}`}
        onClick={onClick}
        title={t('calendar.holidayTitle', { name: chip.label })}
      >
        <Icon name="star" size={11} fill={chip.mandatory ? 'currentColor' : 'none'} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{chip.label}</span>
      </div>
    );
  }

  // Color is a SIGNAL: a request is saturated only while it is pending.
  if (chip.pending) {
    return (
      <div
        className="evt evt-pending"
        onClick={onClick}
        title={`${chip.label} · ${t('status.pending')}`}
        style={{ background: chip.color }}
      >
        {chip.emp && (
          <span className="evt-av" style={{ color: '#fff' }}>
            {chip.emp.initials}
          </span>
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{chip.label}</span>
      </div>
    );
  }

  // Approved → settled → neutral, with a small type accent for identity only.
  return (
    <div
      className="evt evt-approved"
      onClick={onClick}
      title={`${chip.label} · ${t('status.approved')}`}
      style={{ '--c': chip.color } as CSSProperties}
    >
      {chip.emp ? (
        <span className="evt-av">{chip.emp.initials}</span>
      ) : (
        <span className="evt-dot" style={{ background: chip.color }} />
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{chip.label}</span>
    </div>
  );
}
