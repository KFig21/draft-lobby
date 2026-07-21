import { useCallback, useState } from 'react';

/** Keep exit animations in sync with the CSS in global.scss (modal-fade-*-out). */
export const MODAL_EXIT_MS = 180;

/**
 * Drives a modal's exit animation. Call `requestClose()` from every dismiss path
 * (backdrop click, close button, Cancel); it flags `.is-closing` for the exit
 * animation, then calls the parent's `onClose` once it finishes. Because the hook
 * lives inside the modal component, `closing` resets whenever the modal remounts.
 */
export function useModalClose(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, MODAL_EXIT_MS);
  }, [onClose]);
  return { closing, requestClose };
}
