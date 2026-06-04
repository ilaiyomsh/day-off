/**
 * RequestModal — new / edit absence request. Ported from the prototype's
 * modals.jsx. Type picker, date range, live summary, over-balance + overlap-
 * holidays warnings, manager note, and an attachment chip / file-drop.
 *
 * Data that the prototype read off window.DayOffData (balanceFor, COMPANY_DAYS)
 * now comes from useDayOffData(); date formatting via useL10n(); strings via t().
 */
import { useRef, useState } from 'react';
import type { AbsenceType, Attachment, RequestDraft, Employee } from '../../domain/types';
import { ABSENCE_TYPES, TYPE_ICON, TYPE_ORDER } from '../../domain/absence';
import { todayKey, workdaysBetween, calDaysBetween } from '../../domain/dates';
import { useL10n } from '../../domain/useL10n';
import { useDayOffData } from '../../contexts/DayOffDataProvider';
import { Modal, Icon } from '../ui';

/** Human-readable file size — kept local, matches the prototype helper. */
export function fmtFileSize(bytes?: number): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

interface RequestModalProps {
  currentUser: Employee;
  initial?: (Partial<RequestDraft> & { id?: string }) | null;
  onClose: () => void;
  onSubmit: (draft: RequestDraft) => void;
}

export function RequestModal({ currentUser, initial, onClose, onSubmit }: RequestModalProps) {
  const { t } = useL10n();
  const { fmtRange } = useL10n();
  const { balanceFor, companyDays } = useDayOffData();

  const [type, setType] = useState<AbsenceType>(initial?.type || 'vacation');
  const [start, setStart] = useState(initial?.start || todayKey());
  const [end, setEnd] = useState(initial?.end || initial?.start || todayKey());
  const [note, setNote] = useState(initial?.note || '');
  const [attachment, setAttachment] = useState<Attachment | null>(initial?.attachment || null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    if (f) setAttachment({ name: f.name, size: f.size, url: URL.createObjectURL(f) });
    e.target.value = '';
  }

  // keep end >= start: clamp end up whenever start moves past it
  function changeStart(v: string) {
    setStart(v);
    if (end < v) setEnd(v);
  }

  const valid = !!(start && end && end >= start);
  const workdays = valid ? workdaysBetween(start, end) : 0;
  const calDays = valid ? calDaysBetween(start, end) : 0;

  // overlapping company days within range
  const overlapHolidays = valid ? companyDays.filter((h) => h.start <= end && h.end >= start) : [];

  const bal = valid ? balanceFor(Number(start.slice(0, 4)), currentUser.id, type) : null;
  // Quotas were removed (entitled is always 0) → no remaining/over-balance hints.
  const remaining = bal && bal.entitled > 0 ? bal.entitled - bal.used : null;
  const overBalance =
    type !== 'sick' && type !== 'reserves' && remaining != null && workdays > remaining;

  const tt = ABSENCE_TYPES[type];

  return (
    <Modal
      title={initial?.id ? t('request.editTitle') : t('request.newTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid}
            onClick={() =>
              onSubmit({ type, start, end, note: note.trim(), attachment: attachment || undefined })
            }
          >
            <Icon name="check" size={16} /> {t('request.submit')}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">
          {t('request.typeLabel')} <span className="req">{t('request.required')}</span>
        </label>
        <div className="type-picker">
          {TYPE_ORDER.map((id) => {
            const meta = ABSENCE_TYPES[id];
            return (
              <button
                key={id}
                className={`type-opt ${type === id ? 'selected' : ''}`}
                style={{ '--sel': meta.color } as React.CSSProperties}
                onClick={() => setType(id)}
              >
                <span className="to-dot" style={{ background: meta.color }}>
                  <Icon name={TYPE_ICON[id]} size={13} strokeWidth={2} />
                </span>
                <span className="to-name">{t(meta.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="two-col">
        <div className="field">
          <label className="field-label">
            {t('request.fromLabel')} <span className="req">{t('request.required')}</span>
          </label>
          <input
            className="input"
            type="date"
            value={start}
            onChange={(e) => changeStart(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label">
            {t('request.toLabel')} <span className="req">{t('request.required')}</span>
          </label>
          <input
            className="input"
            type="date"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>

      {valid && (
        <div className="summary">
          <span className="summary-num" style={{ color: tt.color }}>
            {workdays}
          </span>
          <span>
            <b>{t('request.summaryWorkdays')}</b> {t('request.summaryCalDays', { count: calDays })} ·{' '}
            {fmtRange(start, end)}
            {type !== 'sick' && type !== 'reserves' && remaining != null && (
              <>
                {' '}
                · {t('request.summaryRemaining')} <b>{remaining - workdays}</b>{' '}
                {t('request.summaryRemainingDays')}
              </>
            )}
          </span>
        </div>
      )}

      {overBalance && (
        <div className="warn-box">
          <Icon name="alert" size={16} />
          <span>{t('request.overBalance', { type: t(tt.labelKey), count: remaining })}</span>
        </div>
      )}
      {overlapHolidays.length > 0 && (
        <div
          className="warn-box"
          style={{
            background: 'var(--color-info-bg)',
            borderColor: 'var(--color-info-border)',
            color: 'var(--color-text-dark)',
          }}
        >
          <Icon name="info" size={16} />
          <span>
            {t('request.overlapHolidays', { names: overlapHolidays.map((h) => h.name).join(', ') })}
          </span>
        </div>
      )}

      <div className="field">
        <label className="field-label">{t('request.noteLabel')}</label>
        <textarea
          className="textarea"
          placeholder={t('request.notePlaceholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label">
          {t('request.fileLabel')}{' '}
          <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
            {t('request.fileOptional')}
          </span>
        </label>
        {attachment ? (
          <div className="file-chip">
            <span className="fc-icon">
              <Icon name="file" size={17} />
            </span>
            <div className="fc-meta">
              <span className="fc-name">{attachment.name}</span>
              {attachment.size != null && <span className="fc-size">{fmtFileSize(attachment.size)}</span>}
            </div>
            <button
              className="fc-remove"
              onClick={() => setAttachment(null)}
              title={t('common.remove')}
            >
              <Icon name="x" size={17} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="file-drop"
            onClick={() => fileRef.current && fileRef.current.click()}
          >
            <Icon name="paperclip" size={17} />
            <span>{t('request.filePick')}</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          style={{ display: 'none' }}
          onChange={onPickFile}
        />
      </div>
    </Modal>
  );
}
