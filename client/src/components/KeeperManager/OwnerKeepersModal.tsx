import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useModalClose } from '../../lib/useModalClose';
import type { KeeperOptionRow, PlayerRow, TeamRow } from '../../lib/types';
import './OwnerKeepersModal.scss';

interface Props {
  lobbyId: string;
  team: TeamRow;
  /** This team's offered candidates. */
  options: KeeperOptionRow[];
  players: PlayerRow[];
  /** The commissioner has frozen everyone's keeper selections — the toggle
   * buttons below go read-only rather than let the owner hit a confusing
   * 409 from the server (which enforces this too). */
  locked?: boolean;
  onClose: () => void;
}

/**
 * A team owner picks which of their offered players to keep (owner-choice
 * flow), up to their keeper count. Keeping/unkeeping updates in real time —
 * a kept player lands on the board immediately. Keeping none is fine: just
 * leave them all unpicked.
 */
export function OwnerKeepersModal({ lobbyId, team, options, players, locked, onClose }: Props) {
  const { closing, requestClose } = useModalClose(onClose);
  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const sorted = useMemo(() => [...options].sort((a, b) => a.round - b.round), [options]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chosen = options.filter((o) => o.selected).length;
  const atLimit = chosen >= team.keeper_count;

  async function toggle(option: KeeperOptionRow) {
    setBusyId(option.id);
    setError(null);
    try {
      await api(`/lobbies/${lobbyId}/keeper-options/${option.id}/select`, {
        method: 'POST',
        body: { selected: !option.selected },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update keeper');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className={`owner-keepers__backdrop modal-anim-backdrop${closing ? ' is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`owner-keepers modal-anim-card${closing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Choose your keepers"
      >
        <button className="owner-keepers__close" aria-label="Close" onClick={requestClose}>
          <CloseIcon fontSize="small" />
        </button>

        <h2 className="owner-keepers__title">🔒 Choose your keepers</h2>
        <p className="owner-keepers__intro">
          Keep up to <strong>{team.keeper_count}</strong> from last year. Each costs your pick in
          the round shown — or keep no one and draft every round.
        </p>

        <div className="owner-keepers__status">
          <span>
            {chosen} of {team.keeper_count} kept
          </span>
        </div>

        {locked && (
          <p className="owner-keepers__locked">
            <LockOutlinedIcon fontSize="inherit" /> The commissioner has locked keeper selections
            — ask them if something needs to change.
          </p>
        )}

        {error && <p className="owner-keepers__error">{error}</p>}

        <div className="owner-keepers__list">
          {sorted.length === 0 ? (
            <p className="owner-keepers__empty">You have no keeper options.</p>
          ) : (
            sorted.map((o) => {
              const player = playersById.get(o.player_id);
              const disabled = locked || busyId === o.id || (!o.selected && atLimit);
              return (
                <button
                  key={o.id}
                  type="button"
                  className={`owner-keepers__opt${o.selected ? ' is-selected' : ''}`}
                  onClick={() => toggle(o)}
                  disabled={disabled}
                >
                  <span className="owner-keepers__check">
                    {o.selected ? (
                      <CheckCircleIcon fontSize="small" />
                    ) : (
                      <RadioButtonUncheckedIcon fontSize="small" />
                    )}
                  </span>
                  <span className="owner-keepers__player">
                    {player ? (
                      <>
                        <span
                          className="owner-keepers__pos"
                          style={{ background: POSITION_COLORS[player.position as Position] }}
                        >
                          {player.position}
                        </span>{' '}
                        {player.name}
                        <span className="owner-keepers__team">{player.nfl_team}</span>
                      </>
                    ) : (
                      'Player'
                    )}
                  </span>
                  <span className="owner-keepers__round">Round {o.round}</span>
                </button>
              );
            })
          )}
        </div>

        <button className="button button--primary owner-keepers__done" onClick={requestClose}>
          Done
        </button>
      </div>
    </div>
  );
}
