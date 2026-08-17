import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import LockIcon from '@mui/icons-material/Lock';
import { abbreviatePlayerName, formatRoundPick } from '../../../../lib/format';
import type { PickRow, PlayerRow } from '../../../../lib/types';
import type { ReactionEntry } from '../PickCell/PickCell';
import { CellFlip } from '../PickReveal';
// Same reasoning as PickCell.tsx's identical import: this component also
// renders standalone in Settings' cell-style picker, a separate lazy-loaded
// route that would otherwise never load DraftGrid.scss's base .draft-grid__cell.
import '../../DraftGrid.scss';
import './DefaultPickCell.scss';

/**
 * "Default" draft cell style (Settings > Draft board): Big screen's
 * position-colored fill and corner flags/hover, but laid out for reading up
 * close rather than across a room — an abbreviated name pinned to the top
 * corner, team/bye underneath, and the round.pick (e.g. "5.02") on a third
 * line, instead of just a large name. Position is already the cell's own
 * fill color, so it's dropped from the text.
 *
 * Its own component + stylesheet, not a mode of BoldPickCell — same reason
 * BoldPickCell split from PickCell (see its own comment): keeping each
 * style's selectors independent rules out any hover/specificity fights
 * between them for good.
 */
export function DefaultPickCell({
  pick,
  player,
  teamCount,
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
  /** Number of teams in the draft — derives the "round.pick" line (e.g.
   * "5.02" for the 2nd pick of round 5 in a 10+ team draft). */
  teamCount: number;
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
  const pickInRound = pick.overall - (pick.round - 1) * teamCount;

  const info = (
    <div className="default-pick-cell__info">
      <span className="default-pick-cell__name">
        {abbreviatePlayerName(player.name, player.position)}
      </span>
      <span className="default-pick-cell__meta">
        {player.position}
        <span className="default-pick-cell__dot" aria-hidden>
          ·
        </span>
        {player.nfl_team}
        {player.bye_week != null && (
          <>
            <span className="default-pick-cell__dot" aria-hidden>
              ·
            </span>
            Bye {player.bye_week}
          </>
        )}
      </span>
      <span className="default-pick-cell__round">
        {formatRoundPick(pick.round, pickInRound, teamCount)}
      </span>
    </div>
  );

  return (
    <td
      className={`draft-grid__cell default-pick-cell${
        pick.is_keeper ? ' draft-grid__cell--keeper' : ''
      }${flipping ? ' draft-grid__cell--flip' : ''}`}
      style={{ background: flipping ? 'transparent' : posColor }}
      onClick={() => onClick?.(pick)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {flipping ? (
        <CellFlip variant="default" backBg={posColor}>
          {info}
        </CellFlip>
      ) : (
        info
      )}

      {/* Same corner-badge treatment as Big screen (see BoldPickCell.tsx). */}
      {(pick.is_keeper || active.length > 0 || hasComment) && (
        <span className="default-pick-cell__flags" aria-hidden>
          {pick.is_keeper && (
            <span className="default-pick-cell__flag-chip default-pick-cell__keeper-flag">
              <LockIcon sx={{ fontSize: 9 }} />
            </span>
          )}
          {hasComment && (
            <span
              className="default-pick-cell__flag-chip"
              style={{ ['--flag-color' as string]: posColor }}
            >
              <ChatBubbleOutlineIcon sx={{ fontSize: 9 }} />
            </span>
          )}
          {active.length > 0 && (
            <span
              className="default-pick-cell__flag-chip default-pick-cell__react-flag"
              style={{ ['--flag-color' as string]: posColor }}
            >
              !!
            </span>
          )}
        </span>
      )}

      {active.length > 0 && (
        <div className="default-pick-cell__react-pop" onClick={(e) => e.stopPropagation()}>
          {active.map((e) => (
            <button
              key={e}
              type="button"
              className={`default-pick-cell__rchip${entry?.mine.has(e) ? ' is-mine' : ''}`}
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
