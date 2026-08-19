import CloseIcon from '@mui/icons-material/Close';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
  // Portal to <body> so the fixed backdrop always covers the full viewport —
  // rendered inline it becomes a child of whatever page invoked it, and a page
  // that clamps its direct children (e.g. .my-drafts > * { max-width }) would
  // shrink the backdrop to that column instead of the whole screen.
  return createPortal(
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
        <div className="confirm-modal__header">
          <h3 className="confirm-modal__title">{title}</h3>
          <button
            type="button"
            className="confirm-modal__close"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close"
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>
        <div className="confirm-modal__body">{children}</div>
        <div className="confirm-modal__actions">
          <button
            className={`button confirm-modal__confirm ${
              danger ? 'confirm-modal__danger' : 'button--primary'
            }`}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? busyLabel ?? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
