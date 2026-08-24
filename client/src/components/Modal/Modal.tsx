import CloseIcon from '@mui/icons-material/Close';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModalClose } from '../../lib/useModalClose';
import './Modal.scss';

interface Props {
  title: string;
  onClose: () => void;
  /** When set, a "Back" button appears at the footer's start (e.g. to return to
   * a parent menu). Distinct from onClose, which dismisses the modal entirely. */
  onBack?: () => void;
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
export function Modal({ title, onClose, onBack, wide, className, icon, footer, children }: Props) {
  const { open, closing, requestClose } = useModalClose(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && requestClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // Portal to <body> so a modal opened from inside another modal isn't trapped
  // by the parent card's transform (the open animation leaves a lingering
  // transform, which would make this fixed overlay position relative to the
  // parent card instead of the viewport).
  return createPortal(
    <div
      className={`dialog-overlay modal-anim-backdrop${open ? ' is-open' : ''}${closing ? ' is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`dialog modal-anim-card ${wide ? 'dialog--wide' : ''}${
          className ? ` ${className}` : ''
        }${open ? ' is-open' : ''}${closing ? ' is-closing' : ''}`}
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
            <CloseIcon fontSize="small" />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        {(footer || onBack) && (
          <footer className={`dialog__footer${onBack ? ' dialog__footer--back' : ''}`}>
            {onBack && (
              <button type="button" className="button dialog__back-btn" onClick={onBack}>
                Back
              </button>
            )}
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
