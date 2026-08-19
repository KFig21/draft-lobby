import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import type { ReactNode } from 'react';

// The skip announcement, played when a team's clock runs out and their cell
// turns from on-the-clock into a skipped-open slot. Three centred layers,
// stacked over the same spot and driven by staggered CSS animations (timing +
// keyframes in DraftGrid.scss):
//   1. "On the clock" — a replica of the live label — shrinks to nothing.
//   2. "SKIPPED" grows from nothing, holds, then slides off to the right.
//   3. `children` (the cell's resting skipped label) slides in from the left to
//      replace it, landing exactly where the plain cell renders it so the hand-
//      off is seamless when DraftGrid drops this wrapper.
export function SkipReveal({ children }: { children: ReactNode }) {
  return (
    <span className="draft-grid__skip" aria-hidden>
      <span className="draft-grid__onclock-label draft-grid__skip-onclock">
        <TimerOutlinedIcon className="draft-grid__onclock-icon" />
        On the clock
      </span>
      <span className="draft-grid__skip-word">Skipped</span>
      <span className="draft-grid__skip-final">{children}</span>
    </span>
  );
}
