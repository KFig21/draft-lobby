import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import type { PlayerRow } from '../../lib/types';
import './TopbarPickReveal.scss';

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
export function TopbarPickReveal({
  clockLabel,
  skipped,
  player,
}: {
  clockLabel: string;
  skipped?: boolean;
  player?: PlayerRow | null;
}) {
  return (
    <div className="tpr" aria-hidden>
      <span className="tpr__row tpr__clock">{clockLabel}</span>
      {skipped ? (
        <span className="tpr__row tpr__skipword">Skipped</span>
      ) : (
        <>
          <span className="tpr__row tpr__pii">The pick is in</span>
          {player && (
            <span className="tpr__row tpr__player">
              <span
                className="tpr__pos"
                style={{ background: POSITION_COLORS[player.position as Position] }}
              >
                {player.position}
              </span>
              <span className="tpr__name">{player.name}</span>
            </span>
          )}
        </>
      )}
    </div>
  );
}
