import {
  joinLobbySchema,
  roundsForSettings,
  type LobbySettings,
} from '@draft-lobby/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import './JoinLobbyPage.scss';

interface OpenLobby {
  id: string;
  name: string;
  settings: LobbySettings;
  filled: number;
  teamCount: number;
  isMember: boolean;
  isFull: boolean;
}

export function JoinLobbyPage() {
  const [params] = useSearchParams();
  const [lobbyId, setLobbyId] = useState(params.get('lobby') ?? '');
  const [password, setPassword] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<OpenLobby[]>([]);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void api<{ lobbies: OpenLobby[] }>('/lobbies/open')
      .then(({ lobbies }) => setOpen(lobbies))
      .catch(() => setOpen([]));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = joinLobbySchema.safeParse({
      lobbyId,
      password,
      teamName: teamName || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your entries');
      return;
    }
    setBusy(true);
    try {
      await api('/lobbies/join', { method: 'POST', body: parsed.data });
      navigate(`/lobby/${lobbyId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setBusy(false);
    }
  }

  async function joinOpen(lobby: OpenLobby) {
    setJoiningId(lobby.id);
    setError(null);
    try {
      await api('/lobbies/join', { method: 'POST', body: { lobbyId: lobby.id } });
      navigate(`/lobby/${lobby.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <main className="join">
      <header className="join__header">
        <h1>Join a lobby</h1>
      </header>

      {open.length > 0 && (
        <section className="join__open">
          <h2>Open lobbies</h2>
          <ul className="join__open-list">
            {open.map((l) => (
              <li key={l.id} className="join__open-row">
                <div className="join__open-main">
                  <span className="join__open-name">{l.name}</span>
                  <span className="muted">
                    {l.filled}/{l.teamCount} teams · {roundsForSettings(l.settings)} rounds
                  </span>
                </div>
                {l.isMember ? (
                  <Link className="button" to={`/lobby/${l.id}`}>
                    Open
                  </Link>
                ) : (
                  <button
                    className="button button--primary"
                    disabled={l.isFull || joiningId === l.id}
                    onClick={() => joinOpen(l)}
                  >
                    {l.isFull ? 'Full' : joiningId === l.id ? 'Joining…' : 'Join'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <form className="join__card" onSubmit={handleSubmit}>
        <h2>Join by ID</h2>
        <label className="field">
          <span>Lobby ID</span>
          <input
            value={lobbyId}
            onChange={(e) => setLobbyId(e.target.value)}
            placeholder="Paste the lobby ID from your invite"
            required
          />
        </label>
        <label className="field">
          <span>
            Password <em className="muted">(not needed for open lobbies)</em>
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="field">
          <span>
            Team name <em className="muted">(optional)</em>
          </span>
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Auto-assigned if blank"
            maxLength={40}
          />
        </label>

        {error && <p className="join__error">{error}</p>}

        <button className="button button--primary" disabled={busy}>
          {busy ? 'Joining…' : 'Join lobby'}
        </button>
      </form>
    </main>
  );
}
