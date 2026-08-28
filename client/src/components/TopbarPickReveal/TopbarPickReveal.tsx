import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import type { PlayerRow } from '../../lib/types';
import './TopbarPickReveal.scss';

// Trailing non-breaking space appended to the announcements so the box's
// overflow clip clears the italic tail of the last letter — its slant overhangs
// the advance width the box is sized to, which otherwise shaves the final glyph.
// Uses the \u00A0 escape ( ): a plain trailing space collapses to zero width
// and the clip returns. Applied to "THE PICK IS IN" and "SKIPPED" alike.
const NBSP = '\u00A0';

/** One announcement's content — the drafted player (pos badge + name) or the
 * "SKIPPED" word. Shared by the intro's player row and the continuation rows. */
function Announcement({ skipped, player }: { skipped?: boolean; player?: PlayerRow | null }) {
  if (skipped) return <>Skipped{NBSP}</>;
  if (!player) return null;
  return (
    <>
      <span className="tpr__pos" style={{ background: POSITION_COLORS[player.position as Position] }}>
        {player.position}
      </span>
      <span className="tpr__name">{player.name}</span>
    </>
  );
}

// The top-bar pick reveal (opt-in — see getTopbarPickReveal). Plays where the
// pick clock normally sits, rows stacked over the same spot and sliding downward
// in turn (timing + keyframes in TopbarPickReveal.scss):
//   1. the pick clock's last value slides down and out,
//   2. "THE PICK IS IN" slides down into its place, holds, then slides out,
//   3. the drafted player (position badge + name) slides down into place and
//      holds until the reveal ends.
// A skip (`skipped`) is the same, minus the player: the clock slides down to
// "SKIPPED", which holds until the reveal ends. The surrounding top bar keeps
// the team/pick readout frozen for the duration, so the board never jumps to
// the next team mid-animation.
//
// `continuation`: a mid-burst follow-up (see the reveal cycle in DraftBoardPage)
// — no clock/PII intro; the previous announcement slides out as this one slides
// in, so a run of quick picks reads as one continuous TEAM·PLAYER slot machine.
export function TopbarPickReveal({
  clockLabel,
  skipped,
  player,
  continuation,
  prevPlayer,
  prevSkipped,
}: {
  clockLabel: string;
  skipped?: boolean;
  player?: PlayerRow | null;
  continuation?: boolean;
  prevPlayer?: PlayerRow | null;
  prevSkipped?: boolean;
}) {
  if (continuation) {
    return (
      <div className="tpr tpr--cont" aria-hidden>
        <span className="tpr__row tpr__cont-out">
          <Announcement skipped={prevSkipped} player={prevPlayer} />
        </span>
        <span className="tpr__row tpr__cont-in">
          <Announcement skipped={skipped} player={player} />
        </span>
      </div>
    );
  }
  return (
    <div className="tpr" aria-hidden>
      <span className="tpr__row tpr__clock">{clockLabel}</span>
      {skipped ? (
        <span className="tpr__row tpr__skipword">Skipped{NBSP}</span>
      ) : (
        <>
          <span className="tpr__row tpr__pii">The pick is in{NBSP}</span>
          {player && (
            <span className="tpr__row tpr__player">
              <Announcement player={player} />
            </span>
          )}
        </>
      )}
    </div>
  );
}
