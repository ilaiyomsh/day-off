/**
 * TeamView — team timeline grid (who's off when across the visible month).
 * Ported from the prototype's TeamView + teamRuns + absenceForCell.
 * Data comes from useDayOffData(); dates/labels via useL10n().
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { useDayOffData } from '../../contexts/DayOffDataProvider';
import { useL10n } from '../../domain/useL10n';
import { ABSENCE_TYPES } from '../../domain/absence';
import { fromKey, isWeekend, pad, toKey, todayKey } from '../../domain/dates';
import type { CompanyDay, DayOffRequest } from '../../domain/types';
import { Avatar, CalToolbar } from '../ui';

interface TeamViewProps {
  onOpenRequest: (request: DayOffRequest) => void;
}

export function TeamView({ onOpenRequest }: TeamViewProps) {
  const { monthDate, nav, requests, teamIds, empById, holidaysOnKey } = useDayOffData();
  const { t, monthName, dayShort } = useL10n();

  const absenceForCell = (empId: string, dateKey: string) => {
    const r = requests.find(
      (x) => x.employeeId === empId && x.status !== 'rejected' && dateKey >= x.start && dateKey <= x.end,
    );
    if (!r) return null;
    return { request: r, type: ABSENCE_TYPES[r.type], isStart: dateKey === r.start, pending: r.status === 'pending' };
  };

  /* Continuous absence segments for one employee within the visible month.
     One entry per request -> renders as a SINGLE bar spanning its days. */
  const teamRuns = (empId: string, yr: number, m: number) => {
    const lastDay = new Date(yr, m + 1, 0).getDate();
    const monthStart = `${yr}-${pad(m + 1)}-01`;
    const monthEnd = `${yr}-${pad(m + 1)}-${pad(lastDay)}`;
    return requests
      .filter((r) => r.employeeId === empId && r.status !== 'rejected' && r.start <= monthEnd && r.end >= monthStart)
      .map((r) => {
        const s = r.start < monthStart ? monthStart : r.start;
        const e = r.end > monthEnd ? monthEnd : r.end;
        return {
          request: r,
          type: ABSENCE_TYPES[r.type],
          pending: r.status === 'pending',
          startDay: fromKey(s).getDate(),
          endDay: fromKey(e).getDate(),
        };
      });
  };

  const year = monthDate.getFullYear();
  const mo = monthDate.getMonth();
  const last = new Date(year, mo + 1, 0).getDate();
  const days: Date[] = [];
  for (let d = 1; d <= last; d++) {
    days.push(new Date(year, mo, d));
  }
  const tKey = todayKey();
  const holidayByKey: Record<string, CompanyDay> = {};
  days.forEach((dt) => {
    const k = toKey(dt);
    const hits = holidaysOnKey(k);
    if (hits.length) holidayByKey[k] = hits[0];
  });

  // who's off today
  const offToday = teamIds.filter((id) => {
    const a = absenceForCell(id, tKey);
    return a && !a.pending;
  });

  const nameW = 150;
  const gridCols = `${nameW}px repeat(${days.length}, minmax(34px, 1fr))`;

  // auto-scroll to center TODAY when the board opens / month changes
  const boardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const todayEl = board.querySelector<HTMLElement>('.team-dayhead.today');
    board.scrollLeft = todayEl
      ? Math.max(0, todayEl.offsetLeft - board.clientWidth / 2 + todayEl.offsetWidth / 2)
      : 0;
  }, [monthDate]);

  return (
    <div className="page" style={{ maxWidth: 1320 }}>
      <div className="page-head">
        <div>
          <h2>{t('views.team.title')}</h2>
          <div className="sub">
            {offToday.length ? t('views.team.offToday', { count: offToday.length }) : t('views.team.allPresent')} ·{' '}
            {monthName(mo)} {year}
          </div>
        </div>
      </div>

      <CalToolbar {...nav} monthDate={monthDate} />

      <div className="card team-board" ref={boardRef}>
        <div className="team-grid">
          {/* header */}
          <div className="team-head-row" style={{ gridTemplateColumns: gridCols }}>
            <div className="team-corner">{t('views.team.teamCount', { count: teamIds.length })}</div>
            {days.map((dt) => {
              const k = toKey(dt);
              const we = isWeekend(dt);
              const today = k === tKey;
              const hol = holidayByKey[k];
              return (
                <div
                  key={k}
                  className={`team-dayhead ${we ? 'weekend' : ''} ${today ? 'today' : ''} ${hol ? 'holiday' : ''}`}
                  title={hol ? t('calendar.holidayTitle', { name: hol.name }) : ''}
                >
                  <div>{dayShort(dt.getDay())}</div>
                  <div className="dnum">{dt.getDate()}</div>
                </div>
              );
            })}
          </div>
          {/* rows */}
          {teamIds.map((id) => {
            const emp = empById(id);
            const runs = teamRuns(id, year, mo);
            return (
              <div key={id} className="team-row" style={{ gridTemplateColumns: gridCols }}>
                <div className="team-name" style={{ gridColumn: 1, gridRow: 1 }}>
                  <Avatar emp={emp} size="sm" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp?.name}</span>
                </div>
                {days.map((dt, i) => {
                  const k = toKey(dt);
                  const we = isWeekend(dt);
                  const hol = holidayByKey[k];
                  return (
                    <div
                      key={k}
                      className={`team-cell ${we ? 'weekend' : ''} ${hol ? 'holiday' : ''}`}
                      style={{ gridColumn: i + 2, gridRow: 1 }}
                    />
                  );
                })}
                {runs.map((run) => (
                  <div
                    key={run.request.id}
                    className={`team-bar ${run.pending ? 'pending' : 'approved'}`}
                    style={
                      {
                        gridColumn: `${run.startDay + 1} / span ${run.endDay - run.startDay + 1}`,
                        gridRow: 1,
                        '--c': run.type.color,
                      } as CSSProperties
                    }
                    title={t('views.team.barTitle', {
                      name: emp?.name ?? '',
                      type: t(run.type.labelKey),
                      status: run.pending ? t('status.pending') : t('status.approved'),
                    })}
                    onClick={() => onOpenRequest(run.request)}
                  >
                    {!run.pending && <span className="tb-dot" style={{ background: run.type.color }} />}
                    <span className="tb-label">{t(run.type.labelKey)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
