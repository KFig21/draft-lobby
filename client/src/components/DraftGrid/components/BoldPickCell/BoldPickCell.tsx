import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import LockIcon from '@mui/icons-material/Lock';
import { abbreviatePlayerName } from '../../../../lib/format';
import type { PickRow, PlayerRow } from '../../../../lib/types';
import type { ReactionEntry } from '../PickCell/PickCell';
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
  tvMode,
  flipping,
  entry,
  hasComment,
  onReact,
  onClick,
  onEnter,
  onLeave,
}: {
  pick: PickRow;
  player: PlayerRow;
  /** TV mode: shorten to "F. Lastname" so the name reads big from across the
   * room (full names are meant for up close). */
  tvMode?: boolean;
  /** Just drafted — play the one-shot card-flip entrance (see DraftGrid.scss). */
  flipping?: boolean;
  entry?: ReactionEntry;
  hasComment?: boolean;
  onReact?: (pickId: string, emoji: string) => void;
  onClick?: (pick: PickRow) => void;
  /** Cross-highlights this pick's team header + round number, same as PickCell. */
  onEnter?: () => void;
  onLeave?: () => void;
}) {
  const active = entry ? Object.keys(entry.counts) : [];
  const posColor = POSITION_COLORS[player.position as Position];
  // Abbreviated names ("C. McCaffrey") are short and uniform, so they rarely
  // need the length-based shrink the full names do.
  const displayName = tvMode
    ? abbreviatePlayerName(player.name, player.position)
    : player.name;

  return (
    <td
      className={`draft-grid__cell bold-pick-cell${
        pick.is_keeper ? ' draft-grid__cell--keeper' : ''
      }${flipping ? ' draft-grid__cell--flip' : ''}`}
      style={{ background: posColor }}
      onClick={() => onClick?.(pick)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <span
        className="bold-pick-cell__name"
        style={{ ['--name-scale' as string]: nameScale(displayName) }}
      >
        {displayName}
      </span>

      {/* Same indicators as the default style, but badged into the bottom-right
          corner (like a notification dot) rather than inline — there's no
          spare row of space in this fill-the-cell layout to put them next to.
          Each chip borders in the cell's own position color and fills with a
          faded tint of it (CSS color-mix, off the --flag-color custom prop
          set here), so it reads as "cut into" the cell instead of a
          mismatched overlay. */}
      {(pick.is_keeper || active.length > 0 || hasComment) && (
        <span className="bold-pick-cell__flags" aria-hidden>
          {/* First in DOM = rightmost corner (row-reverse) — keeper status
              always anchors there, comment/reaction chips stack to its left,
              instead of shuffling position depending on which are present. */}
          {pick.is_keeper && (
            <span className="bold-pick-cell__flag-chip bold-pick-cell__keeper-flag">
              <LockIcon sx={{ fontSize: 9 }} />
            </span>
          )}
          {hasComment && (
            <span
              className="bold-pick-cell__flag-chip"
              style={{ ['--flag-color' as string]: posColor }}
            >
              <ChatBubbleOutlineIcon sx={{ fontSize: 9 }} />
            </span>
          )}
          {active.length > 0 && (
            <span
              className="bold-pick-cell__flag-chip bold-pick-cell__react-flag"
              style={{ ['--flag-color' as string]: posColor }}
            >
              !!
            </span>
          )}
        </span>
      )}

      {/* On hover, reactions unfold from that same bottom-right corner —
          anchoring to an edge already inside the cell's hover-scale growth,
          instead of a detached popover below it like the default style uses. */}
      {active.length > 0 && (
        <div className="bold-pick-cell__react-pop" onClick={(e) => e.stopPropagation()}>
          {active.map((e) => (
            <button
              key={e}
              type="button"
              className={`bold-pick-cell__rchip${entry?.mine.has(e) ? ' is-mine' : ''}`}
              onClick={() => onReact?.(pick.id, e)}
            >
              {e}
              {(entry?.counts[e] ?? 0) > 1 ? entry?.counts[e] : ''}
            </button>
          ))}
        </div>
      )}
    </td>
  );
}
