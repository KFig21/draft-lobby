import { useEffect, type RefObject } from 'react';

/** Calls `onOutside` on any pointerdown outside `ref`'s element, and on Escape.
 * Only listens while `active` is true, so closed popovers/drawers don't leave
 * a stray document listener registered. */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    function onPointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onOutside();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOutside();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [active, ref, onOutside]);
}
