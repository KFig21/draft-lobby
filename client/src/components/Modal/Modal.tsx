import { useEffect, type ReactNode } from 'react';
import { useModalClose } from '../../lib/useModalClose';
import './Modal.scss';

interface Props {
  title: string;
  onClose: () => void;
  wide?: boolean;
  /** Extra class on the dialog card — e.g. a caller-specific width override. */
  className?: string;
  /** Optional leading icon shown before the title in the header. */
  icon?: ReactNode;
  /** Optional fixed bar below the scroll area (e.g. Save/Cancel actions) — a
   * sibling of the body, so the body's scrollbar never runs across it. */
  footer?: ReactNode;
  children: ReactNode;
}

/** A centered, scrollable dialog. Closes on overlay click or Escape. */
export function Modal({ title, onClose, wide, className, icon, footer, children }: Props) {
  const { closing, requestClose } = useModalClose(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  return (
    <div
      className={`dialog-overlay modal-anim-backdrop${closing ? ' is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`dialog modal-anim-card ${wide ? 'dialog--wide' : ''}${
          className ? ` ${className}` : ''
        }${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog__header">
          <div className="dialog__title">
            {icon && <span className="dialog__title-icon">{icon}</span>}
            <h2>{title}</h2>
          </div>
          <button className="dialog__close" onClick={requestClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__footer">{footer}</footer>}
      </div>
    </div>
  );
}
