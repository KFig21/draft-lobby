import { joinLobbySchema } from '@draft-lobby/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import './JoinLobbyPage.scss';

export function JoinLobbyPage() {
  const [params] = useSearchParams();
  const [lobbyId, setLobbyId] = useState(params.get('lobby') ?? '');
  const [password, setPassword] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

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

  return (
    <main className="join">
      <form className="join__card" onSubmit={handleSubmit}>
        <Link to="/home" className="back-link">
          ← Back
        </Link>
        <h1>Join a lobby</h1>

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
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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
