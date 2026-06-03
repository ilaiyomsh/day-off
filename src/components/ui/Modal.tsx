import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

interface ModalProps {
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ title, sub, onClose, children, footer, wide }: ModalProps) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {sub && <div className="modal-sub">{sub}</div>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
