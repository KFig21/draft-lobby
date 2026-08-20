import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import type { ReactNode } from 'react';

// The skip announcement, played when a team's clock runs out and their cell
// turns from on-the-clock into a skipped-open slot. Centred layers stacked over
// the same spot, driven by staggered CSS animations (timing + keyframes in
// DraftGrid.scss). The "On the clock" replica always slides off to the right
// first; what follows depends on whose slot it is:
//   • `mine` (the viewer's own slot) — the full announcement: "SKIPPED" slides
//     in, holds, then slides off, and `children` (the "make your pick" resting
//     label) slides in to replace it.
//   • otherwise — "SKIPPED" is the cell's resting state, so `children` (the
//     "SKIPPED" word) simply slides in and stays; no hold-and-exit, no swap.
// Either way `children` lands exactly where the plain cell renders it, so the
// hand-off is seamless when DraftGrid drops this wrapper.
export function SkipReveal({ mine, children }: { mine?: boolean; children: ReactNode }) {
  return (
    <span className="draft-grid__skip" aria-hidden>
      <span className="draft-grid__onclock-label draft-grid__skip-onclock">
        <TimerOutlinedIcon className="draft-grid__onclock-icon" />
        On the clock
      </span>
      {mine ? (
        <>
          <span className="draft-grid__skip-word">Skipped</span>
          <span className="draft-grid__skip-final">{children}</span>
        </>
      ) : (
        <span className="draft-grid__skip-enter">{children}</span>
      )}
    </span>
  );
}
