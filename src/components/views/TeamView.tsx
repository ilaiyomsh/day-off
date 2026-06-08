/**
 * TeamView — team timeline grid (who's off when across the visible month).
 * Ported from the prototype's TeamView + teamRuns + absenceForCell.
 * Data comes from useDayOffData(); dates/labels via useL10n().
 */
import { Fragment, useEffect, useRef, type CSSProperties } from 'react';
import { useDayOffData } from '../../contexts/DayOffDataProvider';
import { useL10n } from '../../domain/useL10n';
import { ABSENCE_TYPES, TYPE_ORDER } from '../../domain/absence';
import { fromKey, isWeekend, pad, toKey, todayKey } from '../../domain/dates';
import type { CompanyDay, DayOffRequest } from '../../domain/types';
import { Tooltip } from '@vibe/core';
import { Avatar, CalToolbar } from '../ui';

interface TeamViewProps {
  onOpenRequest: (request: DayOffRequest) => void;
}

export function TeamView({ onOpenRequest }: TeamViewProps) {
  const { monthDate, nav, requests, teamIds, myTeams, empById, holidaysOnKey } = useDayOffData();
  const { t, dayShort } = useL10n();
  // Group the Gantt by team only when the user belongs to more than one team.
  const grouped = myTeams.length > 1;

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

  const nameW = 210;
  const gridCols = `${nameW}px repeat(${days.length}, minmax(34px, 1fr))`;

  // One employee row. `groupId` disambiguates keys when a member appears in
  // more than one team group.
  const renderRow = (id: string, groupId?: string) => {
    const emp = empById(id);
    const runs = teamRuns(id, year, mo);
    return (
      <div key={groupId ? `${groupId}:${id}` : id} className="team-row" style={{ gridTemplateColumns: gridCols }}>
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
          <Tooltip
            key={run.request.id}
            showDelay={0}
            content={t('views.team.barTitle', {
              name: emp?.name ?? '',
              type: t(run.type.labelKey),
              status: run.pending ? t('status.pending') : t('status.approved'),
            })}
          >
            <div
              className={`team-bar ${run.pending ? 'pending' : 'approved'}`}
              style={
                {
                  gridColumn: `${run.startDay + 1} / span ${run.endDay - run.startDay + 1}`,
                  gridRow: 1,
                  '--c': run.type.color,
                } as CSSProperties
              }
              onClick={() => onOpenRequest(run.request)}
            >
              {run.pending && <span className="tb-dot" style={{ background: run.type.color }} />}
              <span className="tb-label">{t(run.type.labelKey)}</span>
            </div>
          </Tooltip>
        ))}
      </div>
    );
  };

  // auto-scroll to center TODAY when the board opens / month changes.
  // scrollIntoView is direction-agnostic, so it centers correctly under RTL too
  // (where scrollLeft/offsetLeft arithmetic differs across browsers).
  const boardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const todayEl = board.querySelector<HTMLElement>('.team-dayhead.today');
    if (todayEl) {
      todayEl.scrollIntoView({ inline: 'center', block: 'nearest' });
    } else {
      board.scrollLeft = 0;
    }
  }, [monthDate]);

  return (
    <div className="page team-page">
      <div className="page-head">
        <div>
          <h2>{t('views.team.title')}</h2>
        </div>
      </div>

      <CalToolbar {...nav} monthDate={monthDate} />

      <div className="team-legend">
        {TYPE_ORDER.map((tid) => (
          <span className="legend-item" key={tid}>
            <span className="legend-swatch" style={{ background: ABSENCE_TYPES[tid].color }} />
            {t(ABSENCE_TYPES[tid].labelKey)}
          </span>
        ))}
        <span className="legend-item">
          <span className="legend-swatch legend-swatch--pending" />
          {t('status.pending')}
        </span>
      </div>

      <div className="card team-board" ref={boardRef}>
        <div className="team-grid">
          {/* header */}
          <div className="team-head-row" style={{ gridTemplateColumns: gridCols }}>
            <div className="team-corner" />
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
          {grouped
            ? myTeams.map((tm, i) => (
                <Fragment key={tm.id}>
                  <div className="team-group-head">
                    <span className="tgh-label">
                      {tm.name || t('settings.team.namePlaceholder', { n: i + 1 })}
                    </span>
                  </div>
                  {[...new Set([...tm.managers, ...tm.employees])].map((id) => renderRow(id, tm.id))}
                </Fragment>
              ))
            : teamIds.map((id) => renderRow(id))}
        </div>
      </div>
    </div>
  );
}
