import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import type { PlayerRow } from '../../lib/types';
import { Modal } from '../Modal/Modal';
import './PlayerDetailModal.scss';

interface Props {
  player: PlayerRow;
  onClose: () => void;
  /** Omit to hide the Draft button entirely (e.g. viewing after the draft ended). */
  onPick?: () => void;
  disabled?: boolean;
  onQueue?: () => void;
  queued?: boolean;
}

/** A closer look at a player before deciding to draft them — opened from the
 * Players tab pool, before any pick has been made (contrast with PickModal,
 * which is the same stat block but for a pick that's already happened). */
export function PlayerDetailModal({
  player,
  onClose,
  onPick,
  disabled,
  onQueue,
  queued,
}: Props) {
  const pos = player.position as Position;
  const hasPrev = player.prev_points != null || player.prev_rank != null;

  return (
    <Modal title={player.name} onClose={onClose}>
      <div className="player-detail">
        <header className="player-detail__head">
          <span className="player-detail__pos" style={{ background: POSITION_COLORS[pos] }}>
            {player.position}
          </span>
          <span className="muted">
            {player.nfl_team}
            {player.bye_week ? ` · Bye ${player.bye_week}` : ''}
            {player.injury_status && player.injury_status !== 'ACTIVE'
              ? ` · ${player.injury_status}`
              : ''}
          </span>
        </header>

        <div className="player-detail__stats">
          <div className="player-detail__stat">
            <span className="player-detail__stat-label">Projected</span>
            <span className="player-detail__stat-value">
              {player.proj_points != null ? player.proj_points.toFixed(1) : '—'}
            </span>
          </div>
          <div className="player-detail__stat">
            <span className="player-detail__stat-label">ADP</span>
            <span className="player-detail__stat-value">
              {player.adp != null ? player.adp.toFixed(1) : '—'}
            </span>
          </div>
          <div className="player-detail__stat">
            <span className="player-detail__stat-label">Last yr pts</span>
            <span className="player-detail__stat-value">
              {player.prev_points != null ? player.prev_points.toFixed(1) : '—'}
            </span>
          </div>
          <div className="player-detail__stat">
            <span className="player-detail__stat-label">Last yr rank</span>
            <span className="player-detail__stat-value">
              {player.prev_rank != null ? `#${player.prev_rank}` : '—'}
            </span>
          </div>
        </div>
        {!hasPrev && (
          <p className="player-detail__note muted">Full prior-season stats aren’t loaded yet.</p>
        )}

        {(onQueue || onPick) && (
          <div className="player-detail__actions">
            {onQueue && (
              <button
                type="button"
                className={`button player-detail__queue${queued ? ' is-on' : ''}`}
                onClick={onQueue}
              >
                {queued ? (
                  <BookmarkIcon fontSize="small" />
                ) : (
                  <BookmarkBorderIcon fontSize="small" />
                )}
                {queued ? 'Queued' : 'Add to queue'}
              </button>
            )}
            {onPick && (
              <button
                type="button"
                className="button button--primary player-detail__draft"
                onClick={onPick}
                disabled={disabled}
              >
                Draft {player.name}
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
