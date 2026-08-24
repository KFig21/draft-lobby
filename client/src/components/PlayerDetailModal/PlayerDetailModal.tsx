import type { Position } from '@draft-lobby/shared';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import CloseIcon from '@mui/icons-material/Close';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { useModalClose } from '../../lib/useModalClose';
import type { PlayerRow } from '../../lib/types';
import { HoldButton } from '../HoldButton/HoldButton';
import {
  PlayerHeader,
  PlayerStatGrid,
  type WeekStatsContext,
} from '../PlayerStatBlock/PlayerStatBlock';
import './PlayerDetailModal.scss';

interface Props {
  player: PlayerRow;
  onClose: () => void;
  /** Tap/click on the Draft button — the "confirm first" path. Omit to hide the
   * Draft button entirely (e.g. viewing after the draft ended). */
  onPick?: () => void;
  /** Press-and-hold on the Draft button — drafts instantly, skipping the confirm
   * step (same gesture as the pool's draft buttons). When provided, the Draft
   * button becomes a hold-to-draft control; tapping still runs `onPick`. */
  onHoldPick?: () => void;
  disabled?: boolean;
  /** When set, the Draft button is disabled and this reason is shown beneath it
   * (e.g. a per-position roster limit was reached). */
  blockedReason?: string;
  onQueue?: () => void;
  queued?: boolean;
  /** Cross-draft "favorite" star (favorite_players). Separate from the queue
   * (which is per-draft): a favorite follows the user across every lobby and
   * the Rankings page. Omit to hide the star. */
  onFavorite?: () => void;
  favorited?: boolean;
  /** How many of the viewer's own drafted players at each position already
   * share this player's bye week — drives the "bye week clashes" list below
   * the stats. Omit (or leave empty) to hide that section entirely. */
  byeClashCounts?: Partial<Record<Position, number>>;
  /** Enables the 🔍 week-by-week stats button next to Last year. */
  weekStats?: WeekStatsContext;
}

/** A closer look at a player before deciding to draft them — opened from the
 * Players tab pool, before any pick has been made. Same shell + stat block as
 * PickModal (which is this same information, but for a pick that's already
 * happened), so the two read as one consistent "player" surface. */
export function PlayerDetailModal({
  player,
  onClose,
  onPick,
  onHoldPick,
  disabled,
  blockedReason,
  onQueue,
  queued,
  onFavorite,
  favorited,
  byeClashCounts,
  weekStats,
}: Props) {
  const { open, closing, requestClose } = useModalClose(onClose);

  const headerAction =
    onFavorite || onQueue ? (
      <span className="player-detail__toggles">
        {onFavorite && (
          <button
            type="button"
            className={`player-detail__fav-toggle${favorited ? ' is-on' : ''}`}
            onClick={onFavorite}
            aria-pressed={favorited}
            aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
            title={favorited ? 'Remove from favorites' : 'Add to favorites'}
          >
            {favorited ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
          </button>
        )}
        {onQueue && (
          <button
            type="button"
            className={`player-detail__queue-toggle${queued ? ' is-on' : ''}`}
            onClick={onQueue}
            aria-pressed={queued}
            aria-label={queued ? 'Remove from queue' : 'Add to queue'}
            title={queued ? 'Remove from queue' : 'Add to queue'}
          >
            {queued ? <BookmarkIcon fontSize="small" /> : <BookmarkBorderIcon fontSize="small" />}
          </button>
        )}
      </span>
    ) : undefined;

  return (
    <div
      className={`player-detail__backdrop modal-anim-backdrop${open ? ' is-open' : ''}${closing ? ' is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`player-detail modal-anim-card${open ? ' is-open' : ''}${closing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${player.name} details`}
      >
        {/* Player metadata — framed as one rounded card (concentric with the
            window), like PickModal's pinned header. */}
        <div className="player-detail__top">
          <button className="player-detail__close" aria-label="Close" onClick={requestClose}>
            <CloseIcon fontSize="small" />
          </button>
          <PlayerHeader player={player} action={headerAction} byeClashCounts={byeClashCounts} />
        </div>

        {/* Stats lay flat on the window and are the only part that scrolls. */}
        <div className="player-detail__scroll">
          <PlayerStatGrid player={player} weekStats={weekStats} />
        </div>

        {onPick && (
          <div className="player-detail__footer">
            <div className="player-detail__actions">
              {onHoldPick ? (
                <HoldButton
                  className="button button--primary player-detail__draft"
                  onTap={onPick}
                  onHold={onHoldPick}
                  disabled={disabled || !!blockedReason}
                  title={blockedReason ?? 'Hold to draft instantly · tap to confirm'}
                  ariaLabel={`Draft ${player.name}`}
                >
                  Draft {player.name}
                </HoldButton>
              ) : (
                <button
                  type="button"
                  className="button button--primary player-detail__draft"
                  onClick={onPick}
                  disabled={disabled || !!blockedReason}
                  title={blockedReason}
                >
                  Draft {player.name}
                </button>
              )}
            </div>
            {blockedReason && <p className="player-detail__block-note">{blockedReason}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
