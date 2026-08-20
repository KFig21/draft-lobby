import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import TouchAppIcon from '@mui/icons-material/TouchApp';
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
// `fromSkip` is set when the pick landed on a slot that had been skipped: the
// cell was reading its "Skipped" resting label, so the front face opens on that
// exact label (not "On the clock", which would be a brief lie) and zooms out of
// it into "THE PICK IS IN". `fromSkipMine` picks the label the cell actually
// showed — the two-line "Skipped / make your pick" for the viewer's own slot, or
// the plain muted "Skipped" for another team's.
export function CellFlip({
  variant,
  backBg,
  fromSkip = false,
  fromSkipMine = false,
  children,
}: {
  variant: 'bold' | 'default' | 'clean';
  backBg: string;
  fromSkip?: boolean;
  fromSkipMine?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="draft-grid__flip" aria-hidden>
      <div className="draft-grid__flip-face draft-grid__flip-front">
        {/* The front's opening label — a replica of exactly what the cell was
            showing, so the flip continues from it seamlessly. Another team's
            skipped slot rests on the "SKIPPED" word, so that's its own impact
            element; otherwise it's the on-clock label (which the "make your
            pick" variant reuses for its size/icon-trim/fullscreen scaling). Both
            carry .draft-grid__flip-onclock so they zoom out into "THE PICK IS
            IN". */}
        {fromSkip && !fromSkipMine ? (
          <span className="draft-grid__skip-rest draft-grid__flip-onclock">Skipped</span>
        ) : (
          <span className="draft-grid__onclock-label draft-grid__flip-onclock">
            {fromSkipMine ? (
              <>
                <span className="draft-grid__onclock-title">
                  <TouchAppIcon fontSize="inherit" /> Skipped
                </span>
                <span className="draft-grid__onclock-sub">make your pick</span>
              </>
            ) : (
              <>
                <TimerOutlinedIcon className="draft-grid__onclock-icon" />
                On the clock
              </>
            )}
          </span>
        )}
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
