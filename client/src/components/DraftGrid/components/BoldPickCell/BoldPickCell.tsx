import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import type { PickRow, PlayerRow } from '../../../../lib/types';
// Same reasoning as PickCell.tsx's identical import: this component also
// renders standalone in Settings' cell-style picker, a separate lazy-loaded
// route that would otherwise never load DraftGrid.scss's base .draft-grid__cell.
import '../../DraftGrid.scss';
import './BoldPickCell.scss';

// Longer names otherwise wrap to a 3rd line (line-clamp cuts them off),
// which stands out against the mostly-1/2-line names around them and breaks
// the board's uniform look. Shrinking font-size in proportion to name length
// keeps most names on 1-2 lines instead. Tiers picked against real rosters
// (e.g. "Jaxon Smith-Njigba" = 18 chars, "Christian McCaffrey" = 19).
function nameScale(name: string): number {
  const len = name.length;
  if (len <= 13) return 1;
  if (len <= 16) return 0.88;
  if (len <= 19) return 0.76;
  return 0.66;
}

/**
 * "Big screen" draft cell style (Settings > Draft board): the whole cell
 * fills with the position color, showing just the player's name, large —
 * built to read from across a room, not up close.
 *
 * Deliberately its own component + stylesheet rather than a mode of
 * PickCell — the two used to share a hover rule, and a specificity fight
 * there meant the default style's accent-green hover leaked through here
 * instead of the intended neutral one. Separate files rule that out for
 * good: nothing in here can compete with PickCell's own selectors.
 */
export function BoldPickCell({
  pick,
  player,
  onClick,
  onEnter,
  onLeave,
}: {
  pick: PickRow;
  player: PlayerRow;
  onClick?: (pick: PickRow) => void;
  /** Cross-highlights this pick's team header + round number, same as PickCell. */
  onEnter?: () => void;
  onLeave?: () => void;
}) {
  return (
    <td
      className={`draft-grid__cell bold-pick-cell${
        pick.is_keeper ? ' draft-grid__cell--keeper' : ''
      }`}
      style={{ background: POSITION_COLORS[player.position as Position] }}
      onClick={() => onClick?.(pick)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <span
        className="bold-pick-cell__name"
        style={{ ['--name-scale' as string]: nameScale(player.name) }}
      >
        {player.name}
      </span>
    </td>
  );
}
