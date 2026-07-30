import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import './HScrollRow.scss';

/**
 * Single-row, no-wrap card list. Native drag/trackpad/touch scroll always
 * works; the prev/next buttons are a secondary affordance for desktop/TV,
 * where there's no touch scroll at all — so they only appear once the row
 * actually overflows (cards sit flush left otherwise), and never sit on top
 * of a card: they're a compact control cluster above the track, not an
 * overlay on it. `title`, when given, shares that same header line (title
 * left, controls right) instead of a separate heading above the row.
 */
export function HScrollRow({ title, children }: { title?: ReactNode; children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    // +/-1px slop for sub-pixel layout rounding.
    setOverflowing(el.scrollWidth > el.clientWidth + 1);
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  // Mount-only: wire up listeners once (scroll position, viewport resize, and
  // the track's own box-size changes — e.g. the sidebar collapsing).
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    updateScrollState();
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  // Re-check whenever the card list itself changes (e.g. "See more" reveals
  // more cards) — a content-width change the ResizeObserver on the track's
  // own box won't necessarily catch.
  useEffect(() => {
    updateScrollState();
  }, [children, updateScrollState]);

  function scrollByPage(dir: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8), behavior: 'smooth' });
  }

  return (
    <div className="hscroll">
      {(title || overflowing) && (
        <div className="hscroll__header">
          {title && <h2 className="hscroll__title">{title}</h2>}
          {overflowing && (
            <div className="hscroll__controls">
              <button
                type="button"
                className="hscroll__btn"
                aria-label="Scroll left"
                disabled={!canScrollLeft}
                onClick={() => scrollByPage(-1)}
              >
                <ChevronLeftIcon fontSize="small" />
              </button>
              <button
                type="button"
                className="hscroll__btn"
                aria-label="Scroll right"
                disabled={!canScrollRight}
                onClick={() => scrollByPage(1)}
              >
                <ChevronRightIcon fontSize="small" />
              </button>
            </div>
          )}
        </div>
      )}
      <div className="hscroll__track" ref={trackRef}>
        {children}
      </div>
    </div>
  );
}
