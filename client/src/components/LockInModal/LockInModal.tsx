import CloseIcon from '@mui/icons-material/Close';
import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import { useModalClose } from '../../lib/useModalClose';
import type { PlayerRow } from '../../lib/types';
import './LockInModal.scss';

/** An open slot the picker can assign this player to. */
export interface LockInSlot {
  overall: number;
  round: number;
}

interface Props {
  player: PlayerRow;
  /** `overall` names the chosen slot; omitted → the server fills the earliest. */
  onConfirm: (overall?: number) => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
  /** Set when a commissioner is picking on behalf of another team. */
  onBehalfOfTeam?: string | null;
  /**
   * The open slots the picker owns. 2+ (a skipped team that's up again, e.g. on
   * the snake turn) renders one "lock it in" button per slot so they choose
   * which round/pick this player fills; 0–1 renders a single button.
   */
  slots?: LockInSlot[];
}

/** Confirmation modal shown before a pick is locked in. */
export function LockInModal({
  player,
  onConfirm,
  onCancel,
  busy,
  error,
  onBehalfOfTeam,
  slots,
}: Props) {
  const { closing, requestClose } = useModalClose(onCancel);
  // Only offer a choice when the picker genuinely owns more than one open slot.
  const choose = (slots?.length ?? 0) >= 2;
  return (
    <div
      className={`modal-overlay modal-anim-backdrop${closing ? ' is-closing' : ''}`}
      onClick={() => !busy && requestClose()}
    >
      <div
        className={`modal modal-anim-card${closing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2 className="modal__title">
            {choose ? 'Which pick is this?' : onBehalfOfTeam ? 'Make this pick?' : 'Lock in your pick?'}
          </h2>
          <button
            type="button"
            className="modal__close"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close"
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>
        <div className="modal__card">
          {onBehalfOfTeam && (
            <p className="modal__on-behalf">
              Picking for <strong>{onBehalfOfTeam}</strong> as commissioner
            </p>
          )}
          {choose && (
            <p className="lockin__choose-hint">
              You’ve got more than one open pick — choose which slot this player fills.
            </p>
          )}
          <div className="modal__player">
            <span
              className="modal__pos"
              style={{ background: POSITION_COLORS[player.position as Position] }}
            >
              {player.position}
            </span>
            <div>
              <div className="modal__player-name">{player.name}</div>
              <div className="muted">
                {player.nfl_team}
                {player.bye_week ? ` · Bye ${player.bye_week}` : ''}
              </div>
            </div>
          </div>
          {error && <p className="modal__error">{error}</p>}
        </div>
        {choose ? (
          <div className="lockin__slots">
            {slots!.map((s) => (
              <button
                key={s.overall}
                className="button button--primary lockin__slot-btn"
                onClick={() => onConfirm(s.overall)}
                disabled={busy}
              >
                <span className="lockin__slot-round">Round {s.round}</span>
                <span className="lockin__slot-pick">Pick {s.overall}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="modal__actions">
            <button
              className="button button--primary modal__confirm"
              onClick={() => onConfirm(slots?.[0]?.overall)}
              disabled={busy}
            >
              {busy ? 'Drafting…' : onBehalfOfTeam ? 'Make pick' : 'Lock it in'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
