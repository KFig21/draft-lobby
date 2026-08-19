import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import type { ReactNode } from 'react';

// The two-faced flip that turns a just-made pick's cell over. The front is the
// announcement — a replica of the on-the-clock label (timer icon + "On the
// clock") that slides off to the right as "THE PICK IS IN" slides in from the
// left — and after
// a beat the whole card flips a full 180deg around the horizontal axis to land
// on the back: the pick itself. Front and back are backface-hidden faces of one
// preserve-3d card. While it plays, the host <td> hides its own border/fill (see
// .draft-grid__cell--flip) so the card is the whole cell edge-to-edge, not an
// overlay sitting inside it. Timing and faces live in DraftGrid.scss.
//
// `variant` sets the back face's padding/alignment to match the cell style it's
// standing in for; `backBg` paints it with that cell's own fill so the settled
// back face is indistinguishable from the real cell once DraftGrid drops it.
export function CellFlip({
  variant,
  backBg,
  children,
}: {
  variant: 'bold' | 'default' | 'clean';
  backBg: string;
  children: ReactNode;
}) {
  return (
    <div className="draft-grid__flip" aria-hidden>
      <div className="draft-grid__flip-face draft-grid__flip-front">
        {/* Carries the live on-clock label class too, so it inherits that
            label's exact size in every context (base, fullscreen --fs-scale,
            icon trim) and never jumps size when the cell flips. */}
        <span className="draft-grid__onclock-label draft-grid__flip-onclock">
          <TimerOutlinedIcon className="draft-grid__onclock-icon" />
          On the clock
        </span>
        {/* Each half is kept non-breaking, so the line either fits as one
            ("THE PICK IS IN") or breaks only between them ("THE PICK" / "IS
            IN") — never mid-phrase. */}
        <span className="draft-grid__flip-pickin">
          <span className="draft-grid__flip-word">The pick</span>{' '}
          <span className="draft-grid__flip-word">is in</span>
        </span>
      </div>
      <div
        className={`draft-grid__flip-face draft-grid__flip-back draft-grid__flip-back--${variant}`}
        style={{ background: backBg }}
      >
        {children}
      </div>
    </div>
  );
}
