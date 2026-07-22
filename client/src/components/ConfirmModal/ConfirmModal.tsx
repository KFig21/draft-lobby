import type { ReactNode } from 'react';
import { useModalClose } from '../../lib/useModalClose';
import './ConfirmModal.scss';

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
  danger?: boolean;
  /** Extra gate on the confirm button beyond `busy` — e.g. a "type X to confirm" input. */
  confirmDisabled?: boolean;
}

/** A small centered confirm dialog with enter/exit animations. */
export function ConfirmModal({
  title,
  children,
  confirmLabel,
  busyLabel,
  onConfirm,
  onClose,
  busy = false,
  danger = false,
  confirmDisabled = false,
}: Props) {
  const { closing, requestClose } = useModalClose(onClose);
  return (
    <div
      className={`confirm-modal__backdrop modal-anim-backdrop${closing ? ' is-closing' : ''}`}
      onClick={() => !busy && requestClose()}
    >
      <div
        className={`confirm-modal modal-anim-card${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="confirm-modal__title">{title}</h3>
        <div className="confirm-modal__body">{children}</div>
        <div className="confirm-modal__actions">
          <button className="button" onClick={requestClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={`button ${danger ? 'confirm-modal__danger' : 'button--primary'}`}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? busyLabel ?? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
