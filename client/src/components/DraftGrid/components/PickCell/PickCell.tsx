import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import LockIcon from '@mui/icons-material/Lock';
import type { CSSProperties } from 'react';
import { abbreviatePlayerName, formatRoundPick } from '../../../../lib/format';
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

/** The "clean" draft cell style: the same data orientation as the default
 * cell — abbreviated name, team & bye, then the round.pick line — but on a
 * faded position-tinted surface (see PickCell.scss) rather than a solid
 * position fill. Plus reaction/comment indicators and the hover reactions
 * popover. */
export function PickCell({
  pick,
  player,
  teamCount,
  entry,
  hasComment,
  onReact,
  onClick,
  onEnter,
  onLeave,
}: {
  pick: PickRow;
  player: PlayerRow;
  /** Team count — derives the "round.pick" line (e.g. "5.02"). */
  teamCount: number;
  entry: ReactionEntry | undefined;
  hasComment: boolean;
  onReact?: (pickId: string, emoji: string) => void;
  onClick?: (pick: PickRow) => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const active = entry ? Object.keys(entry.counts) : [];
  const pickInRound = pick.overall - (pick.round - 1) * teamCount;
  const posColor = POSITION_COLORS[player.position as Position];

  return (
    <td
      className={`draft-grid__cell draft-grid__cell--pick${
        pick.is_keeper ? ' draft-grid__cell--keeper' : ''
      }`}
      style={{ ['--pos']: posColor } as CSSProperties}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={() => onClick?.(pick)}
    >
      <div className="draft-grid__pick">
        <span className="draft-grid__player">
          {abbreviatePlayerName(player.name, player.position)}
        </span>
        <span className="draft-grid__meta">
          {/* Colour comes from CSS via the cell's --pos custom property (set on
              the <td> below), so light mode can darken it for contrast against
              the stronger light-mode wash — see PickCell.scss. */}
          <span className="draft-grid__pos">{player.position}</span>
          {` · ${player.nfl_team}`}
          {player.bye_week != null ? ` · Bye ${player.bye_week}` : ''}
        </span>
        <span className="draft-grid__pickround">
          {formatRoundPick(pick.round, pickInRound, teamCount)}
        </span>
      </div>

      {/* Keeper lock — its own always-visible corner element (never gives way to
          the hover reactions popover). */}
      {pick.is_keeper && <LockIcon className="draft-grid__keeper-flag" sx={{ fontSize: 11 }} />}

      {/* Subtle, uncluttered reaction/comment indicators (grayed; hidden on
          hover, when the reactions popover takes over). */}
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
