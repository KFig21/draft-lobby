import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useRef, type ReactNode } from 'react';
import './HScrollRow.scss';

/**
 * Single-row, no-wrap card list. Native drag/trackpad scroll still works, but
 * the prev/next buttons are the primary affordance (nicer on desktop/TV where
 * there's no touch scroll at all).
 */
export function HScrollRow({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);

  function scrollByPage(dir: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8), behavior: 'smooth' });
  }

  return (
    <div className="hscroll">
      <button
        type="button"
        className="hscroll__btn hscroll__btn--prev"
        aria-label="Scroll left"
        onClick={() => scrollByPage(-1)}
      >
        <ChevronLeftIcon fontSize="small" />
      </button>
      <div className="hscroll__track" ref={trackRef}>
        {children}
      </div>
      <button
        type="button"
        className="hscroll__btn hscroll__btn--next"
        aria-label="Scroll right"
        onClick={() => scrollByPage(1)}
      >
        <ChevronRightIcon fontSize="small" />
      </button>
    </div>
  );
}
