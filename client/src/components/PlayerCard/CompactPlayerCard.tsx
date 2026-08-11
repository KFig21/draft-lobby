import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { INJURY_ABBR, INJURY_SEVERITY } from '../../lib/injuryStatus';
import { HoldButton } from '../HoldButton/HoldButton';
import type { PlayerCardProps } from './PlayerCard';
import './CompactPlayerCard.scss';

/** The dense ("compact") player-pool row — a single line: position, name with
 * the queue/favorite marks tucked right after it, then projection and the
 * Draft button. Drops the comfy card's second line (team/bye) and ADP so many
 * more players fit on screen. Its own component + stylesheet (not a prop on
 * PlayerCard) so the two layouts' styles can't compete for the same selectors. */
export function CompactPlayerCard({
  player,
  onPick,
  onHoldPick,
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
  statMode = 'proj',
}: PlayerCardProps) {
  const color = POSITION_COLORS[player.position as Position];
  const injury = INJURY_ABBR[player.injury_status];
  const points = statMode === 'prev' ? player.prev_points : player.proj_points;

  return (
    <div
      className={`compact-card${onOpenDetail ? ' compact-card--clickable' : ''}${
        drafted ? ' compact-card--drafted' : ''
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
      <span className="compact-card__pos" style={{ background: color }}>
        <span className="compact-card__pos-abbr">{player.position}</span>
        {posRank != null && <span className="compact-card__pos-rank">{posRank}</span>}
      </span>
      <span className="compact-card__name">{player.name}</span>
      {isKeeper && (
        <span className="compact-card__keeper-badge" title="Keeper">
          <LockOutlinedIcon sx={{ fontSize: 11 }} />
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

      {/* Team abbreviation sits between the name and the marks. */}
      <span className="compact-card__team">{player.nfl_team}</span>

      {/* Marks sit immediately right of the team (not in a far-right column). */}
      {(onFavorite || onQueue) && (
        <span className="compact-card__marks">
          {onFavorite && (
            <button
              className={`compact-card__mark${favorited ? ' is-on compact-card__mark--fav' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onFavorite();
              }}
              aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
              title={favorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              {favorited ? <StarIcon fontSize="inherit" /> : <StarBorderIcon fontSize="inherit" />}
            </button>
          )}
          {onQueue && (
            <button
              className={`compact-card__mark${queued ? ' is-on' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onQueue();
              }}
              aria-label={queued ? 'Remove from queue' : 'Add to queue'}
              title={queued ? 'Remove from queue' : 'Add to queue'}
            >
              {queued ? (
                <BookmarkIcon fontSize="inherit" />
              ) : (
                <BookmarkBorderIcon fontSize="inherit" />
              )}
            </button>
          )}
        </span>
      )}

      <span className="compact-card__spacer" />

      {/* When drafted, the pill sits to the left of the projection, which stays
          in the far-right slot; otherwise the projection stays beside the
          Draft button. */}
      {/* Just the pick slot (e.g. 1.09) — the struck-through name already says
          "drafted", so dropping the word keeps this narrow and off the name.
          Hidden entirely on mobile (see SCSS). */}
      {drafted && (
        <span className="compact-card__drafted-tag" title="Drafted">
          {draftedLabel ?? 'Drafted'}
        </span>
      )}

      <span className="compact-card__proj">{points != null ? points.toFixed(1) : '—'}</span>

      {!drafted && onPick && (
        <HoldButton
          className="button button--primary compact-card__draft"
          onTap={onPick}
          onHold={onHoldPick ?? onPick}
          disabled={disabled}
          title="Hold to draft instantly · tap to confirm"
          ariaLabel={`Draft ${player.name}`}
        >
          Draft
        </HoldButton>
      )}
    </div>
  );
}
