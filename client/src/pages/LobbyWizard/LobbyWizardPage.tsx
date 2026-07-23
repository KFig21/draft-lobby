import {
  DEFAULT_LOBBY_SETTINGS,
  SCORING_PRESETS,
  createLobbySchema,
  rosterSize,
  type LobbySettings,
} from '@draft-lobby/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LeagueSettingsFields,
  normalizeTiers,
} from '../../components/LeagueSettingsFields/LeagueSettingsFields';
import { Modal } from '../../components/Modal/Modal';
import { api } from '../../lib/api';
import { supabase } from '../../supabase';
import { LeagueWizardPage, type SavedLeague } from '../LeagueWizard/LeagueWizardPage';
import './LobbyWizardPage.scss';

// Common configs so a lobby can be spun up without saving a league first.
function baseLeague(
  name: string,
  teamCount: number,
  preset: keyof typeof SCORING_PRESETS,
): SavedLeague {
  return {
    id: `builtin:${teamCount}-${preset}`,
    name,
    settings: {
      ...DEFAULT_LOBBY_SETTINGS,
      name,
      teamCount,
      scoring: SCORING_PRESETS[preset].rules,
    },
  };
}
const BUILT_IN_LEAGUES: SavedLeague[] = [
  baseLeague('10-team PPR', 10, 'PPR'),
  baseLeague('12-team PPR', 12, 'PPR'),
  baseLeague('12-team Half-PPR', 12, 'HALF_PPR'),
  baseLeague('12-team Standard', 12, 'STANDARD'),
];

// How long after the draft ends chat + reactions lock. "Immediate" needs no
// value; the other units each cap out well short of the next unit up.
type LockUnit = 'immediate' | 'minutes' | 'hours' | 'days';
const LOCK_UNITS: { key: LockUnit; label: string }[] = [
  { key: 'immediate', label: 'Immediately' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'hours', label: 'Hours' },
  { key: 'days', label: 'Days' },
];
const LOCK_UNIT_MAX: Record<Exclude<LockUnit, 'immediate'>, number> = {
  minutes: 60,
  hours: 24,
  days: 7,
};
const LOCK_UNIT_MS: Record<Exclude<LockUnit, 'immediate'>, number> = {
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};
function lockUnitDefault(unit: LockUnit): number {
  return unit === 'hours' ? 24 : unit === 'days' ? 1 : 30;
}

export function LobbyWizardPage() {
  const navigate = useNavigate();
  const [savedLeagues, setSavedLeagues] = useState<SavedLeague[]>([]);
  const [leagueId, setLeagueId] = useState<string>(BUILT_IN_LEAGUES[0].id);
  const [settings, setSettings] = useState<LobbySettings>(BUILT_IN_LEAGUES[0].settings);
  const [lobbyName, setLobbyName] = useState('');
  const [password, setPassword] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [resultsPublic, setResultsPublic] = useState(false);
  const [chatPublic, setChatPublic] = useState(false);
  const [publicVotingAllowed, setPublicVotingAllowed] = useState(false);
  // Defaults match the old fixed 24h lock.
  const [lockUnit, setLockUnit] = useState<LockUnit>('hours');
  const [lockValue, setLockValue] = useState(24);
  const [showLeagueModal, setShowLeagueModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase
      .from('league_templates')
      .select('id, name, settings')
      .order('created_at')
      .then(({ data }) => data && setSavedLeagues(data as SavedLeague[]));
  }, []);

  // Seed the editable form from the chosen starting point.
  function selectLeague(id: string) {
    setLeagueId(id);
    const league =
      [...savedLeagues, ...BUILT_IN_LEAGUES].find((l) => l.id === id) ?? BUILT_IN_LEAGUES[0];
    setSettings(league.settings);
  }

  function onLeagueCreated(league: SavedLeague) {
    setSavedLeagues((prev) => [...prev.filter((l) => l.id !== league.id), league]);
    setLeagueId(league.id);
    setSettings(league.settings);
    setShowLeagueModal(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const rounds = rosterSize(settings.rosterComposition);
    const finalSettings: LobbySettings = {
      ...settings,
      name: lobbyName.trim() || settings.name || 'Draft lobby',
      scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : null,
      rosterComposition: settings.rosterComposition.filter((r) => r.count > 0),
      pickTiers: normalizeTiers(settings.pickTiers, rounds),
    };
    const chatLockMs = lockUnit === 'immediate' ? 0 : lockValue * LOCK_UNIT_MS[lockUnit];
    const parsed = createLobbySchema.safeParse({
      settings: finalSettings,
      password,
      resultsPublic,
      chatPublic,
      publicVotingAllowed: resultsPublic && publicVotingAllowed,
      chatLockMs,
    });
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
        <h1>Create a lobby</h1>
      </header>

      <form className="wizard__form" onSubmit={handleSubmit}>
        <section className="wizard__section">
          <div className="wizard__section-head">
            <h2>Start from</h2>
            <button
              type="button"
              className="wizard__link"
              onClick={() => setShowLeagueModal(true)}
            >
              + Set up a league
            </button>
          </div>
          <label className="field">
            <span>
              Preset <em className="muted">(a starting point — tweak anything below)</em>
            </span>
            <select value={leagueId} onChange={(e) => selectLeague(e.target.value)}>
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
        </section>

        {/* Fully editable league parameters, seeded from the preset above. */}
        <LeagueSettingsFields settings={settings} onChange={setSettings} />

        <section className="wizard__section">
          <h2>This draft</h2>
          <label className="field">
            <span>Lobby name</span>
            <input
              value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
              placeholder={settings.name || 'Draft lobby'}
              maxLength={60}
            />
          </label>
          <div className="field">
            <span>Visibility</span>
            <div className="segmented">
              <button
                type="button"
                className={`segmented__opt${
                  settings.visibility === 'PRIVATE' ? ' segmented__opt--on' : ''
                }`}
                onClick={() => setSettings((s) => ({ ...s, visibility: 'PRIVATE' }))}
              >
                🔒 Private
              </button>
              <button
                type="button"
                className={`segmented__opt${
                  settings.visibility === 'OPEN' ? ' segmented__opt--on' : ''
                }`}
                onClick={() => setSettings((s) => ({ ...s, visibility: 'OPEN' }))}
              >
                🌐 Open
              </button>
            </div>
            <em className="muted">
              {settings.visibility === 'OPEN'
                ? 'Anyone can find this lobby on the Join page and join without the password.'
                : 'Only people with the lobby link + password can join.'}
            </em>
          </div>
          <div className="field">
            <span>Draft type</span>
            <div className="segmented">
              <button
                type="button"
                className={`segmented__opt${
                  settings.draftMode === 'LIVE' ? ' segmented__opt--on' : ''
                }`}
                onClick={() => setSettings((s) => ({ ...s, draftMode: 'LIVE' }))}
              >
                🏈 Live
              </button>
              <button
                type="button"
                className={`segmented__opt${
                  settings.draftMode === 'MOCK' ? ' segmented__opt--on' : ''
                }`}
                onClick={() => setSettings((s) => ({ ...s, draftMode: 'MOCK' }))}
              >
                🤖 Mock
              </button>
            </div>
            <em className="muted">
              {settings.draftMode === 'MOCK'
                ? 'Practice run — empty seats fill with bots and results stay off friends’ timelines.'
                : 'A real league draft. Empty seats fill with bots at start so no pick is missed.'}
            </em>
          </div>
          <div className="field">
            <span>
              Public after the draft <em className="muted">(optional)</em>
            </span>
            <label className="toggle">
              <input
                type="checkbox"
                checked={resultsPublic}
                onChange={(e) => {
                  setResultsPublic(e.target.checked);
                  if (!e.target.checked) setPublicVotingAllowed(false);
                }}
              />
              <span>Make draft results public once complete</span>
            </label>
            <em className="muted">
              Anyone signed in with the lobby link can view final rosters and crown-vote
              results — chat/reactions stay private unless enabled below.
            </em>
            {resultsPublic && (
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={publicVotingAllowed}
                  onChange={(e) => setPublicVotingAllowed(e.target.checked)}
                />
                <span>Let non-members vote on who won the draft</span>
              </label>
            )}
            <label className="toggle">
              <input
                type="checkbox"
                checked={chatPublic}
                onChange={(e) => setChatPublic(e.target.checked)}
              />
              <span>Make chat + reactions public once complete</span>
            </label>
            <em className="muted">Non-members can view chat and reactions, but not post.</em>
          </div>
          <div className="field">
            <span>Chat & reactions lock</span>
            <div className="segmented">
              {LOCK_UNITS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`segmented__opt${lockUnit === key ? ' segmented__opt--on' : ''}`}
                  onClick={() => {
                    setLockUnit(key);
                    if (key !== 'immediate') setLockValue(lockUnitDefault(key));
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {lockUnit !== 'immediate' && (
              <label className="lobby-lock-value">
                <input
                  type="number"
                  min={1}
                  max={LOCK_UNIT_MAX[lockUnit]}
                  value={lockValue}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value));
                    setLockValue(
                      Number.isFinite(n) ? Math.min(LOCK_UNIT_MAX[lockUnit], Math.max(1, n)) : 1,
                    );
                  }}
                />
                <span>
                  {lockUnit} (max {LOCK_UNIT_MAX[lockUnit]})
                </span>
              </label>
            )}
            <em className="muted">
              How long after the draft ends before chat and reactions close for good.
            </em>
          </div>
          {settings.visibility === 'PRIVATE' && (
            <label className="field">
              <span>Lobby password</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Members enter this to join"
                required
              />
            </label>
          )}
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

      {showLeagueModal && (
        <Modal
          title="Set up a league"
          wide
          onClose={() => setShowLeagueModal(false)}
        >
          <LeagueWizardPage
            embedded
            onSaved={onLeagueCreated}
            onCancel={() => setShowLeagueModal(false)}
          />
        </Modal>
      )}
    </main>
  );
}
