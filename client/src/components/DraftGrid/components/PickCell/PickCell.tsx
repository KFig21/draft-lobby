import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import type { PickRow, PlayerRow } from '../../../../lib/types';
import type { Reactor } from '../../../ReactorsModal/ReactorsModal';
// The base .draft-grid__cell box (size/border/padding) lives in DraftGrid.scss
// — import it directly rather than counting on DraftGrid.tsx already being
// loaded: this component also renders on its own (Settings' cell-style
// picker), a separate lazy-loaded route that otherwise never pulls it in.
import '../../DraftGrid.scss';
import './PickCell.scss';

export interface ReactionEntry {
  counts: Record<string, number>;
  mine: Set<string>;
  /** Who reacted, keyed by emoji — populated for board picks (for the
   * "see who reacted" modal); comment reactions don't need it here. */
  reactors?: Record<string, Reactor[]>;
}

/** The default draft cell style: position, player name, team & bye week,
 * plus reaction/comment indicators and the hover reactions popover. */
export function PickCell({
  pick,
  player,
  entry,
  hasComment,
  onReact,
  onClick,
  onEnter,
  onLeave,
}: {
  pick: PickRow;
  player: PlayerRow;
  entry: ReactionEntry | undefined;
  hasComment: boolean;
  onReact?: (pickId: string, emoji: string) => void;
  onClick?: (pick: PickRow) => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const active = entry ? Object.keys(entry.counts) : [];

  return (
    <td
      className="draft-grid__cell draft-grid__cell--pick"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={() => onClick?.(pick)}
    >
      <div className="draft-grid__pick">
        <span
          className="draft-grid__pos"
          style={{ color: POSITION_COLORS[player.position as Position] }}
        >
          {player.position}
        </span>
        <span className="draft-grid__player">{player.name}</span>
        <span className="draft-grid__meta">
          {player.nfl_team}
          {player.bye_week ? ` · ${player.bye_week}` : ''}
        </span>
      </div>

      {/* Subtle, uncluttered indicators for reactions / comments on this pick. */}
      {(active.length > 0 || hasComment) && (
        <span className="draft-grid__flags" aria-hidden>
          {hasComment && (
            <ChatBubbleOutlineIcon className="draft-grid__comment-flag" sx={{ fontSize: 11 }} />
          )}
          {active.length > 0 && <span className="draft-grid__react-flag">!!</span>}
        </span>
      )}

      {/* On hover (desktop) the reactions unfold just below the pick. Adding a
          reaction happens in the pick modal, so no add button here. */}
      {active.length > 0 && (
        <div className="draft-grid__react-pop" onClick={(e) => e.stopPropagation()}>
          {active.map((e) => (
            <button
              key={e}
              type="button"
              className={`draft-grid__rchip${entry?.mine.has(e) ? ' is-mine' : ''}`}
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
