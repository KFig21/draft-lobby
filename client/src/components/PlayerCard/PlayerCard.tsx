import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { INJURY_ABBR, INJURY_SEVERITY } from '../../lib/injuryStatus';
import type { PlayerRow } from '../../lib/types';
import './PlayerCard.scss';

interface Props {
  player: PlayerRow;
  onPick?: () => void;
  disabled?: boolean;
  onQueue?: () => void;
  queued?: boolean;
  /** Opens the full player-detail modal. Clicking the queue/draft buttons
   * themselves doesn't trigger it (they stopPropagation). */
  onOpenDetail?: () => void;
  /** This pick was a kept player, not a normal draft selection. */
  isKeeper?: boolean;
}

/** A row in the player pool: color-coded position, bye, injury, projection. */
export function PlayerCard({
  player,
  onPick,
  disabled,
  onQueue,
  queued,
  onOpenDetail,
  isKeeper,
}: Props) {
  const color = POSITION_COLORS[player.position as Position];
  const injury = INJURY_ABBR[player.injury_status];

  return (
    <div
      className={`player-card${onOpenDetail ? ' player-card--clickable' : ''}`}
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
        {player.position}
      </span>
      <div className="player-card__main">
        <div className="player-card__name">
          {player.name}
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
          {player.bye_week ? ` · Bye ${player.bye_week}` : ''}
        </div>
      </div>
      <div className="player-card__stats">
        {player.proj_points != null && (
          <span className="player-card__proj">{player.proj_points.toFixed(1)}</span>
        )}
        {player.adp != null && (
          <span className="player-card__adp">ADP {player.adp.toFixed(1)}</span>
        )}
      </div>
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
      {onPick && (
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
