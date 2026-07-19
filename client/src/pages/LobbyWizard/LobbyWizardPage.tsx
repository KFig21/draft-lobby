import {
  DEFAULT_LOBBY_SETTINGS,
  SCORING_PRESETS,
  createLobbySchema,
  matchPreset,
  roundsForSettings,
  type LobbySettings,
} from '@draft-lobby/shared';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { clockSummary } from '../../lib/format';
import { supabase } from '../../supabase';
import './LobbyWizardPage.scss';

interface LeagueRow {
  id: string;
  name: string;
  settings: LobbySettings;
}

// Built-in fallback so a lobby can be created without saving a league first.
const DEFAULT_LEAGUE: LeagueRow = {
  id: 'default',
  name: 'Default (10-team PPR)',
  settings: { ...DEFAULT_LOBBY_SETTINGS, name: 'Default league' },
};

export function LobbyWizardPage() {
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [leagueId, setLeagueId] = useState<string>('default');
  const [lobbyName, setLobbyName] = useState('');
  const [password, setPassword] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase
      .from('league_templates')
      .select('id, name, settings')
      .order('created_at')
      .then(({ data }) => {
        if (data && data.length) {
          setLeagues(data as LeagueRow[]);
          setLeagueId(data[0].id); // default to the first saved league
        }
      });
  }, []);

  const options = useMemo(() => [...leagues, DEFAULT_LEAGUE], [leagues]);
  const league = options.find((l) => l.id === leagueId) ?? DEFAULT_LEAGUE;
  const s = league.settings;
  const scoringLabel = matchPreset(s.scoring)
    ? SCORING_PRESETS[matchPreset(s.scoring)!].label
    : 'Custom';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const settings: LobbySettings = {
      ...league.settings,
      name: lobbyName.trim() || league.settings.name,
      scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : null,
    };
    const parsed = createLobbySchema.safeParse({ settings, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your settings');
      return;
    }
    setBusy(true);
    try {
      const { lobby } = await api<{ lobby: { id: string } }>('/lobbies', {
        method: 'POST',
        body: parsed.data,
      });
      navigate(`/lobby/${lobby.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lobby');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wizard">
      <header className="wizard__header">
        <Link to="/home" className="back-link">
          ← Back
        </Link>
        <h1>Create a lobby</h1>
      </header>

      <form className="wizard__form" onSubmit={handleSubmit}>
        <section className="wizard__section">
          <div className="wizard__section-head">
            <h2>League</h2>
            <Link className="wizard__link" to="/settings/leagues/new">
              + Set up a league
            </Link>
          </div>
          <label className="field">
            <span>Use league settings from</span>
            <select value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value="default">{DEFAULT_LEAGUE.name}</option>
            </select>
          </label>

          <ul className="league-summary">
            <li>
              <span className="muted">Teams</span>
              {s.teamCount}
            </li>
            <li>
              <span className="muted">Draft</span>
              {s.draftType === 'SNAKE' ? 'Snake' : 'Straight'}
            </li>
            <li>
              <span className="muted">Rounds</span>
              {roundsForSettings(s)}
            </li>
            <li>
              <span className="muted">Clock</span>
              {clockSummary(s.pickTiers)}
            </li>
            <li>
              <span className="muted">Scoring</span>
              {scoringLabel}
            </li>
            {s.keepersEnabled && (
              <li>
                <span className="muted">Keepers</span>on
              </li>
            )}
          </ul>
        </section>

        <section className="wizard__section">
          <h2>This draft</h2>
          <label className="field">
            <span>Lobby name</span>
            <input
              value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
              placeholder={league.settings.name}
              maxLength={60}
            />
          </label>
          <label className="field">
            <span>Lobby password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Members enter this to join"
              required
            />
          </label>
          <label className="field">
            <span>
              Scheduled start <em className="muted">(optional)</em>
            </span>
            <input
              type="datetime-local"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
            />
          </label>
        </section>

        {error && <p className="wizard__error">{error}</p>}

        <div className="wizard__submit-row">
          <button className="button button--primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create lobby'}
          </button>
        </div>
      </form>
    </main>
  );
}
