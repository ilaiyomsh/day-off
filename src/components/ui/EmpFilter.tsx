/**
 * EmpFilter — dropdown to filter the dashboard by a single team member (or all).
 * Ported from dashboard.jsx; reads the team from useDayOffData() instead of
 * window.DayOffData.
 */
import { useEffect, useState } from 'react';
import { useDayOffData } from '../../contexts/DayOffDataProvider';
import { useL10n } from '../../domain/useL10n';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export interface EmpFilterProps {
  /** 'all' or an employee id. */
  value: string;
  onChange: (value: string) => void;
}

export function EmpFilter({ value, onChange }: EmpFilterProps) {
  const { t } = useL10n();
  const { teamIds, empById } = useDayOffData();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest('.emp-select')) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const cur = value === 'all' ? null : empById(value);

  return (
    <div className="yr-select emp-select">
      <button className="yr-btn" onClick={() => setOpen((o) => !o)}>
        <Icon name="users" size={16} />
        <span>{cur ? cur.name : t('common.allTeam')}</span>
        <Icon name="chevron-down" size={15} style={{ color: 'var(--color-text-secondary)' }} />
      </button>
      {open && (
        <div className="yr-menu">
          <button
            className={`yr-opt ${value === 'all' ? 'active' : ''}`}
            onClick={() => {
              onChange('all');
              setOpen(false);
            }}
          >
            <span>{t('common.allTeam')}</span>
            {value === 'all' && (
              <Icon name="check" size={15} style={{ marginInlineStart: 'auto', color: 'var(--color-primary)' }} />
            )}
          </button>
          {teamIds.map((id) => {
            const e = empById(id);
            return (
              <button
                key={id}
                className={`yr-opt ${value === id ? 'active' : ''}`}
                onClick={() => {
                  onChange(id);
                  setOpen(false);
                }}
              >
                <Avatar emp={e} size="sm" />
                <span>{e?.name}</span>
                {value === id && (
                  <Icon name="check" size={15} style={{ marginInlineStart: 'auto', color: 'var(--color-primary)' }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
