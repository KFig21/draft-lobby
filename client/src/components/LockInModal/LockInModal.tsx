import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import type { PlayerRow } from '../../lib/types';
import './LockInModal.scss';

interface Props {
  player: PlayerRow;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
}

/** Confirmation modal shown before a pick is locked in. */
export function LockInModal({ player, onConfirm, onCancel, busy, error }: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Lock in your pick?</h2>
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
        <div className="modal__actions">
          <button className="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="button button--primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Drafting…' : 'Lock it in'}
          </button>
        </div>
      </div>
    </div>
  );
}
