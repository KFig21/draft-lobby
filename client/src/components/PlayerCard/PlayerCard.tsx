import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { INJURY_ABBR, INJURY_SEVERITY } from '../../lib/injuryStatus';
import type { PlayerRow } from '../../lib/types';
import { HoldButton } from '../HoldButton/HoldButton';
import './PlayerCard.scss';

export interface PlayerCardProps {
  player: PlayerRow;
  /** Tap the Draft button — opens the lock-in confirm modal. */
  onPick?: () => void;
  /** Press-and-hold the Draft button (2s) to draft immediately, bypassing the
   * lock-in modal. Omit to make holding fall back to onPick. */
  onHoldPick?: () => void;
  disabled?: boolean;
  /** When set, the Draft button is disabled and its tooltip shows this reason
   * instead of the hold hint (e.g. a per-position roster limit was reached). */
  blockedReason?: string;
  onQueue?: () => void;
  queued?: boolean;
  /** Cross-draft favorite star (favorite_players) — separate from the
   * per-draft queue bookmark. Omit to hide the star. */
  onFavorite?: () => void;
  favorited?: boolean;
  /** Opens the full player-detail modal. Clicking the star/queue/draft buttons
   * themselves doesn't trigger it (they stopPropagation). */
  onOpenDetail?: () => void;
  /** This pick was a kept player, not a normal draft selection. */
  isKeeper?: boolean;
  /** Within-position rank shown on the position badge (e.g. RB · 5). Omit to
   * show just the position. */
  posRank?: number | null;
  /** Already drafted — shown dimmed with a "Drafted" tag instead of the Draft
   * button (the pool can optionally reveal drafted players). */
  drafted?: boolean;
  /** "round.pick" slot this player went at (e.g. "5.06"), appended to the
   * "Drafted" tag. Omit to show just "Drafted". */
  draftedLabel?: string;
  /** How many of the viewer's own drafted players at THIS player's position
   * already share their bye week. Colors the bye number — 1 turns yellow,
   * 2+ turns red. Omit/0 to leave it uncolored. */
  byeClashCount?: number;
  /** Which stat the big number reflects: 'proj' (this season's projection,
   * default) or 'prev' (last season's actual points). */
  statMode?: 'proj' | 'prev';
  /** Hide the league-value line under the projection. Used in the roster
   * lineup, where a draft-value rank is pointless for already-drafted players
   * (and the row needs the vertical space) — the projection stays. */
  hideValue?: boolean;
}

/** The roomy ("comfy") player-pool row: color-coded position, name, a second
 * line of team/bye, projection + ADP, and the queue/favorite marks in their
 * own column. The tighter "compact" alternative is a separate component
 * (CompactPlayerCard) chosen at the render site, per the app's convention of
 * isolating style variants rather than branching one component on a prop. */
export function PlayerCard({
  player,
  onPick,
  onHoldPick,
  disabled,
  blockedReason,
  onQueue,
  queued,
  onFavorite,
  favorited,
  onOpenDetail,
  isKeeper,
  posRank,
  drafted,
  draftedLabel,
  byeClashCount,
  statMode = 'proj',
  hideValue,
}: PlayerCardProps) {
  const color = POSITION_COLORS[player.position as Position];
  const injury = INJURY_ABBR[player.injury_status];
  const points = statMode === 'prev' ? player.prev_points : player.proj_points;

  return (
    <div
      className={`player-card${onOpenDetail ? ' player-card--clickable' : ''}${
        drafted ? ' player-card--drafted' : ''
      }`}
      onClick={onOpenDetail}
      onKeyDown={
        onOpenDetail
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenDetail();
              }
            }
          : undefined
      }
      role={onOpenDetail ? 'button' : undefined}
      tabIndex={onOpenDetail ? 0 : undefined}
    >
      <span className="player-card__pos" style={{ background: color }}>
        <span className="player-card__pos-abbr">{player.position}</span>
        {posRank != null && <span className="player-card__pos-rank">{posRank}</span>}
      </span>
      <div className="player-card__main">
        <div className="player-card__name">
          <span className="player-card__name-text">{player.name}</span>
          {isKeeper && (
            <span className="player-card__keeper-badge">
              <LockOutlinedIcon sx={{ fontSize: 11 }} />
              <span className="player-card__keeper-word">Keeper</span>
            </span>
          )}
          {injury && (
            <span
              className={`injury-badge injury-badge--${INJURY_SEVERITY[player.injury_status] ?? 'danger'}`}
              title={player.injury_status}
            >
              {injury}
            </span>
          )}
        </div>
        <div className="player-card__sub">
          {player.nfl_team}
          {player.bye_week != null && (
            <span
              className={`player-card__bye${
                byeClashCount
                  ? ` player-card__bye--${byeClashCount >= 2 ? 'danger' : 'warning'}`
                  : ''
              }`}
            >
              {' '}
              · Bye {player.bye_week}
            </span>
          )}
        </div>
      </div>
      {drafted && (
        <span className="player-card__drafted-tag">
          <span className="player-card__drafted-word">Drafted</span>
          {draftedLabel ? <span className="player-card__drafted-pick">{draftedLabel}</span> : null}
        </span>
      )}
      <div className="player-card__stats">
        <span className="player-card__proj">{points != null ? points.toFixed(1) : '—'}</span>
        {!hideValue && player.value_rank != null && (
          <span
            className="player-card__adp"
            title={
              player.value != null
                ? `${player.value > 0 ? '+' : ''}${player.value.toFixed(1)} pts over replacement`
                : undefined
            }
          >
            ADP {player.value_rank.toFixed(1)}
          </span>
        )}
      </div>
      {(onFavorite || onQueue) && (
        <div className="player-card__marks">
          {onFavorite && (
            <button
              className={`player-card__fav${favorited ? ' player-card__fav--on' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onFavorite();
              }}
              aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
              title={favorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              {favorited ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
            </button>
          )}
          {onQueue && (
            <button
              className={`player-card__queue${queued ? ' player-card__queue--on' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onQueue();
              }}
              aria-label={queued ? 'Remove from queue' : 'Add to queue'}
              title={queued ? 'Remove from queue' : 'Add to queue'}
            >
              {queued ? (
                <BookmarkIcon fontSize="small" />
              ) : (
                <BookmarkBorderIcon fontSize="small" />
              )}
            </button>
          )}
        </div>
      )}
      {!drafted && onPick && (
        <HoldButton
          className="button button--primary player-card__draft"
          onTap={onPick}
          onHold={onHoldPick ?? onPick}
          disabled={disabled || !!blockedReason}
          title={blockedReason ?? 'Hold to draft instantly · tap to confirm'}
          ariaLabel={`Draft ${player.name}`}
        >
          Draft
        </HoldButton>
      )}
    </div>
  );
}
