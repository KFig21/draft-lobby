import {
  DEFAULT_LOBBY_SETTINGS,
  SCORING_PRESETS,
  createLobbySchema,
  matchPreset,
  roundsForSettings,
  type LobbySettings,
  type ScoringRules,
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
  builtIn?: boolean;
}
interface ScoringFormatRow {
  id: string;
  name: string;
  rules: ScoringRules;
}

// Common configs so a lobby can be spun up without saving a league first.
function baseLeague(name: string, teamCount: number, preset: keyof typeof SCORING_PRESETS): LeagueRow {
  return {
    id: `builtin:${teamCount}-${preset}`,
    name,
    builtIn: true,
    settings: {
      ...DEFAULT_LOBBY_SETTINGS,
      name,
      teamCount,
      scoring: SCORING_PRESETS[preset].rules,
    },
  };
}
const BUILT_IN_LEAGUES: LeagueRow[] = [
  baseLeague('10-team PPR', 10, 'PPR'),
  baseLeague('12-team PPR', 12, 'PPR'),
  baseLeague('12-team Half-PPR', 12, 'HALF_PPR'),
  baseLeague('12-team Standard', 12, 'STANDARD'),
];

// 'league' = inherit the chosen league's scoring; otherwise override it.
const USE_LEAGUE_SCORING = 'league';

export function LobbyWizardPage() {
  const navigate = useNavigate();
  const [savedLeagues, setSavedLeagues] = useState<LeagueRow[]>([]);
  const [scoringFormats, setScoringFormats] = useState<ScoringFormatRow[]>([]);
  const [leagueId, setLeagueId] = useState<string>(BUILT_IN_LEAGUES[0].id);
  const [scoringChoice, setScoringChoice] = useState<string>(USE_LEAGUE_SCORING);
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
      .then(({ data }) => data && setSavedLeagues(data as LeagueRow[]));
    void supabase
      .from('scoring_formats')
      .select('id, name, rules')
      .order('created_at')
      .then(({ data }) => data && setScoringFormats(data as ScoringFormatRow[]));
  }, []);

  const league =
    [...savedLeagues, ...BUILT_IN_LEAGUES].find((l) => l.id === leagueId) ??
    BUILT_IN_LEAGUES[0];

  // Effective scoring: the league's own rules, unless overridden here.
  const effectiveScoring = useMemo<ScoringRules>(() => {
    if (scoringChoice === USE_LEAGUE_SCORING) return league.settings.scoring;
    const [kind, key] = scoringChoice.split(':');
    if (kind === 'preset' && key in SCORING_PRESETS) {
      return SCORING_PRESETS[key as keyof typeof SCORING_PRESETS].rules;
    }
    if (kind === 'format') {
      return scoringFormats.find((f) => f.id === key)?.rules ?? league.settings.scoring;
    }
    return league.settings.scoring;
  }, [scoringChoice, league, scoringFormats]);

  const s = league.settings;
  const scoringLabel = (() => {
    const preset = matchPreset(effectiveScoring);
    if (preset) return SCORING_PRESETS[preset].label;
    const json = JSON.stringify(effectiveScoring);
    return scoringFormats.find((f) => JSON.stringify(f.rules) === json)?.name ?? 'Custom';
  })();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const settings: LobbySettings = {
      ...league.settings,
      scoring: effectiveScoring,
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
            <span>Start from</span>
            <select value={leagueId} onChange={(e) => setLeagueId(e.target.value)}>
              {savedLeagues.length > 0 && (
                <optgroup label="Your leagues">
                  {savedLeagues.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Defaults">
                {BUILT_IN_LEAGUES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <label className="field">
            <span>
              Scoring <em className="muted">(override the league default)</em>
            </span>
            <select
              value={scoringChoice}
              onChange={(e) => setScoringChoice(e.target.value)}
            >
              <option value={USE_LEAGUE_SCORING}>Use league scoring</option>
              <optgroup label="Presets">
                {(Object.keys(SCORING_PRESETS) as (keyof typeof SCORING_PRESETS)[]).map(
                  (p) => (
                    <option key={p} value={`preset:${p}`}>
                      {SCORING_PRESETS[p].label}
                    </option>
                  ),
                )}
              </optgroup>
              {scoringFormats.length > 0 && (
                <optgroup label="Your saved formats">
                  {scoringFormats.map((f) => (
                    <option key={f.id} value={`format:${f.id}`}>
                      {f.name} (custom)
                    </option>
                  ))}
                </optgroup>
              )}
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
