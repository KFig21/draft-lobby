import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useModalClose } from '../../lib/useModalClose';
import type { KeeperOptionRow, PlayerRow, TeamRow } from '../../lib/types';
import { Loader } from '../Loader/Loader';
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
  const { open, closing, requestClose } = useModalClose(onClose);
  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const sorted = useMemo(() => [...options].sort((a, b) => a.round - b.round), [options]);

  // Options with an in-flight select POST — their row shows a saving spinner.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  // Optimistic selected overrides (option id → selected) so a click flips the
  // row instantly rather than waiting on the POST + realtime round-trip; each
  // is dropped once the incoming options prop catches up (effect below).
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const isSelected = (o: KeeperOptionRow) => pending.get(o.id) ?? o.selected;
  const chosen = options.filter((o) => isSelected(o)).length;
  const atLimit = chosen >= team.keeper_count;

  async function toggle(option: KeeperOptionRow) {
    if (busyIds.has(option.id)) return;
    const next = !isSelected(option);
    setPending((m) => new Map(m).set(option.id, next));
    setBusyIds((s) => new Set(s).add(option.id));
    setError(null);
    try {
      await api(`/lobbies/${lobbyId}/keeper-options/${option.id}/select`, {
        method: 'POST',
        body: { selected: next },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update keeper');
      setPending((m) => {
        const n = new Map(m);
        n.delete(option.id);
        return n;
      });
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(option.id);
        return n;
      });
    }
  }

  // Drop each optimistic override once the real data reflects it (or diverges).
  useEffect(() => {
    setPending((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const o of options) {
        if (next.has(o.id) && next.get(o.id) === o.selected) {
          next.delete(o.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [options]);

  return (
    <div
      className={`owner-keepers__backdrop modal-anim-backdrop${open ? ' is-open' : ''}${closing ? ' is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`owner-keepers modal-anim-card${open ? ' is-open' : ''}${closing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Choose your keepers"
      >
        <header className="owner-keepers__header">
          <h2 className="owner-keepers__title">
            <LockOutlinedIcon fontSize="small" /> Choose your keepers
          </h2>
          <button className="owner-keepers__close" aria-label="Close" onClick={requestClose}>
            <CloseIcon fontSize="small" />
          </button>
        </header>

        <div className="owner-keepers__body">
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
              const selected = isSelected(o);
              const busy = busyIds.has(o.id);
              const disabled = locked || busy || (!selected && atLimit);
              return (
                <button
                  key={o.id}
                  type="button"
                  className={`owner-keepers__opt${selected ? ' is-selected' : ''}${
                    busy ? ' is-busy' : ''
                  }`}
                  onClick={() => toggle(o)}
                  disabled={disabled}
                >
                  {busy && (
                    <span className="owner-keepers__opt-loading" aria-hidden>
                      <Loader />
                    </span>
                  )}
                  <span className="owner-keepers__check">
                    {selected ? (
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
        </div>

        <footer className="owner-keepers__footer">
          <button className="button button--primary owner-keepers__done" onClick={requestClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
