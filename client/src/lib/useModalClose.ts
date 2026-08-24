import { useCallback, useEffect, useState } from 'react';

/** Keep exit transitions in sync with the CSS in global.scss (.modal-anim-*). */
export const MODAL_EXIT_MS = 240;

/**
 * Drives a modal's enter + exit transitions.
 *
 * Enter: `open` starts false so the card mounts in its hidden state, then flips
 * true on the next frame — the browser paints "hidden" first, then transitions
 * to "open". This is deliberately a class-toggled CSS *transition*, not an
 * on-mount keyframe animation: iOS Safari frequently skips a keyframe animation
 * on a freshly portal-mounted element (making modals appear instantly there),
 * whereas a post-paint class change animates reliably everywhere.
 *
 * Exit: call `requestClose()` from every dismiss path (backdrop click, close
 * button, Cancel); it clears `open` + flags `.is-closing` for the exit
 * transition, then calls the parent's `onClose` once it finishes. Because the
 * hook lives inside the modal component, both flags reset whenever it remounts.
 */
export function useModalClose(onClose: () => void) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // Double rAF so the hidden initial state is painted before we flip to open —
    // a single frame can land in the same paint as the mount on some browsers.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setOpen(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  const requestClose = useCallback(() => {
    setOpen(false);
    setClosing(true);
    setTimeout(onClose, MODAL_EXIT_MS);
  }, [onClose]);

  return { open, closing, requestClose };
}
