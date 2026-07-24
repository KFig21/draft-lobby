import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import type { PickRow, PlayerRow } from '../../../../lib/types';
import './BoldPickCell.scss';

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
}: {
  pick: PickRow;
  player: PlayerRow;
  onClick?: (pick: PickRow) => void;
}) {
  return (
    <td
      className="draft-grid__cell bold-pick-cell"
      style={{ background: POSITION_COLORS[player.position as Position] }}
      onClick={() => onClick?.(pick)}
    >
      <span className="bold-pick-cell__name">{player.name}</span>
    </td>
  );
}
