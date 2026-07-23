import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import CloseIcon from '@mui/icons-material/Close';
import { useModalClose } from '../../lib/useModalClose';
import type { PlayerRow } from '../../lib/types';
import { PlayerHeader, PlayerStatGrid } from '../PlayerStatBlock/PlayerStatBlock';
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
 * Players tab pool, before any pick has been made. Same shell + stat block as
 * PickModal (which is this same information, but for a pick that's already
 * happened), so the two read as one consistent "player" surface. */
export function PlayerDetailModal({
  player,
  onClose,
  onPick,
  disabled,
  onQueue,
  queued,
}: Props) {
  const { closing, requestClose } = useModalClose(onClose);

  return (
    <div
      className={`player-detail__backdrop modal-anim-backdrop${closing ? ' is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`player-detail modal-anim-card${closing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${player.name} details`}
      >
        <button className="player-detail__close" aria-label="Close" onClick={requestClose}>
          <CloseIcon fontSize="small" />
        </button>

        <PlayerHeader player={player} />
        <PlayerStatGrid player={player} />

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
    </div>
  );
}
