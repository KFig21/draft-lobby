import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { INJURY_ABBR, INJURY_SEVERITY } from '../../lib/injuryStatus';
import type { PlayerRow } from '../../lib/types';
import './PlayerCard.scss';

export interface PlayerCardProps {
  player: PlayerRow;
  onPick?: () => void;
  disabled?: boolean;
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
}

/** The roomy ("comfy") player-pool row: color-coded position, name, a second
 * line of team/bye, projection + ADP, and the queue/favorite marks in their
 * own column. The tighter "compact" alternative is a separate component
 * (CompactPlayerCard) chosen at the render site, per the app's convention of
 * isolating style variants rather than branching one component on a prop. */
export function PlayerCard({
  player,
  onPick,
  disabled,
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
}: PlayerCardProps) {
  const color = POSITION_COLORS[player.position as Position];
  const injury = INJURY_ABBR[player.injury_status];

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
              <LockOutlinedIcon sx={{ fontSize: 11 }} /> Keeper
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
          Drafted{draftedLabel ? <span className="player-card__drafted-pick">{draftedLabel}</span> : null}
        </span>
      )}
      <div className="player-card__stats">
        {player.proj_points != null && (
          <span className="player-card__proj">{player.proj_points.toFixed(1)}</span>
        )}
        {player.adp != null && (
          <span className="player-card__adp">ADP {player.adp.toFixed(1)}</span>
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
        <button
          className="button button--primary player-card__draft"
          onClick={(e) => {
            e.stopPropagation();
            onPick();
          }}
          disabled={disabled}
        >
          Draft
        </button>
      )}
    </div>
  );
}
