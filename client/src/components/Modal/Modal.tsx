import { useEffect, type ReactNode } from 'react';
import { useModalClose } from '../../lib/useModalClose';
import './Modal.scss';

interface Props {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}

/** A centered, scrollable dialog. Closes on overlay click or Escape. */
export function Modal({ title, onClose, wide, children }: Props) {
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
          closing ? ' is-closing' : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog__header">
          <h2>{title}</h2>
          <button className="dialog__close" onClick={requestClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="dialog__body">{children}</div>
      </div>
    </div>
  );
}
