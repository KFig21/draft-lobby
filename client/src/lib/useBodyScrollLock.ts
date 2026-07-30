import { useEffect } from 'react';

/** Locks page scroll while `active` — used by full-screen overlays (nav
 * drawer, modals) so a touch-drag on the overlay itself can't scroll the
 * page behind it. A `position: fixed` overlay doesn't block this on its
 * own: with no scrollable overflow of its own, a touch-scroll gesture that
 * starts on it still chains up to the nearest scrollable ancestor — the
 * document body — regardless of what's visually on top. */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [active]);
}
