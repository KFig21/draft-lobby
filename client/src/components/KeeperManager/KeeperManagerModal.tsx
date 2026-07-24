import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useModalClose } from '../../lib/useModalClose';
import type { PickRow, PlayerRow, TeamRow } from '../../lib/types';
import './KeeperManagerModal.scss';

interface Props {
  lobbyId: string;
  teams: TeamRow[];
  players: PlayerRow[];
  /** Every pick in the lobby — keepers are the is_keeper ones; all of them
   * count as "already taken" for the search. Updates via the parent's realtime
   * subscription, so the list reflects adds/removes without a manual refetch. */
  picks: PickRow[];
  rounds: number;
  onClose: () => void;
}

/**
 * Commissioner tool (draft-room staging): assign each team's keepers from last
 * season. A keeper costs the team its pick in the chosen round and is placed on
 * the board immediately as an is_keeper pick, which the draft engine then skips.
 */
export function KeeperManagerModal({ lobbyId, teams, players, picks, rounds, onClose }: Props) {
  const { closing, requestClose } = useModalClose(onClose);

  const orderedTeams = useMemo(
    () => [...teams].sort((a, b) => a.draft_position - b.draft_position),
    [teams],
  );
  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const draftedIds = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);
  const keeperPicks = useMemo(
    () => picks.filter((p) => p.is_keeper).sort((a, b) => a.round - b.round),
    [picks],
  );

  const [teamId, setTeamId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [playerId, setPlayerId] = useState<string>('');
  const [round, setRound] = useState(1);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPlayer = playerId ? playersById.get(playerId) : undefined;

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter((p) => !draftedIds.has(p.id) && p.name.toLowerCase().includes(q))
      .slice(0, 30);
  }, [players, draftedIds, search]);

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? 'Team';

  async function addKeeper() {
    if (!teamId || !playerId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/lobbies/${lobbyId}/keepers`, {
        method: 'POST',
        body: { teamId, playerId, round },
      });
      // Realtime refreshes `picks`; just clear the player entry for the next add.
      setPlayerId('');
      setSearch('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add keeper');
    } finally {
      setBusy(false);
    }
  }

  async function removeKeeper(pickId: string) {
    setRemovingId(pickId);
    setError(null);
    try {
      await api(`/lobbies/${lobbyId}/keepers/${pickId}`, { method: 'DELETE' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove keeper');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div
      className={`keeper-modal__backdrop modal-anim-backdrop${closing ? ' is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`keeper-modal modal-anim-card${closing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Manage keepers"
      >
        <button className="keeper-modal__close" aria-label="Close" onClick={requestClose}>
          <CloseIcon fontSize="small" />
        </button>

        <h2 className="keeper-modal__title">🔒 Keepers</h2>
        <p className="keeper-modal__intro">
          Assign players kept from last season. Each keeper costs that team its pick in the chosen
          round and appears on the board right away.
        </p>

        <div className="keeper-modal__form">
          <label className="keeper-modal__field">
            <span>Team</span>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Select team…</option>
              {orderedTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.draft_position}. {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className="keeper-modal__field keeper-modal__field--player">
            <span>Player</span>
            {selectedPlayer ? (
              <div className="keeper-modal__chosen">
                <span>
                  <strong>{selectedPlayer.position}</strong> {selectedPlayer.name}
                </span>
                <button type="button" onClick={() => setPlayerId('')}>
                  Change
                </button>
              </div>
            ) : (
              <input
                type="text"
                placeholder="Search players…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
            {!selectedPlayer && matches.length > 0 && (
              <ul className="keeper-modal__results">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPlayerId(p.id);
                        setSearch('');
                      }}
                    >
                      <span className="keeper-modal__result-pos">{p.position}</span>
                      {p.name}
                      <span className="keeper-modal__result-team">{p.nfl_team}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>

          <label className="keeper-modal__field keeper-modal__field--round">
            <span>Round</span>
            <select value={round} onChange={(e) => setRound(Number(e.target.value))}>
              {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <button
            className="button button--primary keeper-modal__add"
            onClick={addKeeper}
            disabled={busy || !teamId || !playerId}
          >
            {busy ? 'Adding…' : 'Add keeper'}
          </button>
        </div>

        {error && <p className="keeper-modal__error">{error}</p>}

        <div className="keeper-modal__list">
          {keeperPicks.length === 0 ? (
            <p className="keeper-modal__empty">No keepers yet.</p>
          ) : (
            keeperPicks.map((k) => {
              const player = playersById.get(k.player_id);
              return (
                <div key={k.id} className="keeper-modal__row">
                  <span className="keeper-modal__row-round">R{k.round}</span>
                  <span className="keeper-modal__row-player">
                    {player ? (
                      <>
                        <strong>{player.position}</strong> {player.name}
                      </>
                    ) : (
                      'Player'
                    )}
                  </span>
                  <span className="keeper-modal__row-team">{teamName(k.team_id)}</span>
                  <button
                    className="keeper-modal__remove"
                    onClick={() => removeKeeper(k.id)}
                    disabled={removingId === k.id}
                    aria-label="Remove keeper"
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
