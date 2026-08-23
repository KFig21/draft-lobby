import {
  SCORING_PRESETS,
  matchPreset,
  roundsForSettings,
  type DraftMode,
  type DraftSetupSnapshot,
  type LobbySettings,
  type ScoringRules,
} from '@draft-lobby/shared';
import CheckIcon from '@mui/icons-material/Check';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Loader } from '../../components/Loader/Loader';
import { clockSummary } from '../../lib/format';
import {
  createLobbyFromSharedSetup,
  fetchSharedRuleset,
  importSharedRuleset,
  type SharedRuleset,
} from '../../lib/importRuleset';
import './ImportRulesetPage.scss';

export function ImportRulesetPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState<SharedRuleset | null>(null);
  const [importState, setImportState] = useState<'idle' | 'working' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  // DRAFT_SETUP import creates a real lobby — its own name + mode inputs.
  const [name, setName] = useState('');
  const [draftMode, setDraftMode] = useState<DraftMode>('LIVE');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    void fetchSharedRuleset(token).then((row) => {
      setShared(row);
      if (row?.kind === 'DRAFT_SETUP') {
        setName(row.name.slice(0, 40));
        setDraftMode((row.payload as DraftSetupSnapshot).settings.draftMode ?? 'LIVE');
      }
      setLoading(false);
    });
  }, [token]);

  async function doImport() {
    if (!shared || !userId) return;
    setImportState('working');
    setError(null);
    try {
      await importSharedRuleset(shared, userId);
      setImportState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setImportState('idle');
    }
  }

  async function doCreateLobby() {
    if (!shared || !userId || !name.trim()) return;
    setImportState('working');
    setError(null);
    try {
      const lobby = await createLobbyFromSharedSetup(shared.id, name.trim(), draftMode);
      navigate(`/lobby/${lobby.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the lobby');
      setImportState('idle');
    }
  }

  const isDraftSetup = shared?.kind === 'DRAFT_SETUP';
  const isLeague = shared?.kind === 'LEAGUE';
  const setupSnap = isDraftSetup ? (shared!.payload as DraftSetupSnapshot) : null;
  const settings: LobbySettings | null = isDraftSetup
    ? setupSnap!.settings
    : isLeague
      ? (shared!.payload as LobbySettings)
      : null;
  const rules: ScoringRules | null = shared
    ? isDraftSetup || isLeague
      ? settings!.scoring
      : (shared.payload as ScoringRules)
    : null;
  const preset = rules ? matchPreset(rules) : null;
  const scoringLabel = preset ? SCORING_PRESETS[preset].label : 'Custom';
  const keeperCount = setupSnap?.keeperPicks.length ?? 0;

  return (
    <main className="import-ruleset">
      <header className="import-ruleset__header">
        <h1>Import</h1>
      </header>

      <section className="import-ruleset__body">
        {loading ? (
          <Loader label="Loading…" />
        ) : !shared ? (
          <div className="import-ruleset__card">
            <h2>Link not found</h2>
            <p className="muted">This share link is invalid or has been removed.</p>
            <Link className="button" to="/home">
              Back to home
            </Link>
          </div>
        ) : importState === 'done' ? (
          <div className="import-ruleset__card">
            <div className="import-ruleset__done">
              <CheckIcon /> Imported
            </div>
            <p className="muted">
              “{shared.name}” was added to your{' '}
              {shared.kind === 'LEAGUE' ? 'leagues' : 'scoring formats'}.
            </p>
            <div className="import-ruleset__actions">
              <button className="button button--primary" onClick={() => navigate('/settings')}>
                View in Settings
              </button>
              <Link className="button" to="/lobby/new">
                Start a draft
              </Link>
            </div>
          </div>
        ) : isDraftSetup ? (
          <div className="import-ruleset__card">
            <span className="import-ruleset__kind">Draft setup</span>
            <h2>{shared.name}</h2>
            <dl className="import-ruleset__meta">
              <div>
                <dt>Teams</dt>
                <dd>{settings!.teamCount}</dd>
              </div>
              <div>
                <dt>Rounds</dt>
                <dd>{roundsForSettings(settings!)}</dd>
              </div>
              <div>
                <dt>Scoring</dt>
                <dd>{scoringLabel}</dd>
              </div>
              {settings!.keepersEnabled && (
                <div>
                  <dt>Keepers</dt>
                  <dd>{keeperCount > 0 ? `${keeperCount} pre-set` : 'On'}</dd>
                </div>
              )}
            </dl>
            <label className="field import-ruleset__field">
              <span>Lobby name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="Draft lobby"
              />
            </label>
            <div className="field import-ruleset__field">
              <span>Draft type</span>
              <div className="segmented">
                <button
                  type="button"
                  className={`segmented__opt${draftMode === 'LIVE' ? ' segmented__opt--on' : ''}`}
                  onClick={() => setDraftMode('LIVE')}
                >
                  Live
                </button>
                <button
                  type="button"
                  className={`segmented__opt${draftMode === 'MOCK' ? ' segmented__opt--on' : ''}`}
                  onClick={() => setDraftMode('MOCK')}
                >
                  Mock
                </button>
              </div>
            </div>
            {error && <p className="import-ruleset__error">{error}</p>}
            <button
              className="button button--primary import-ruleset__cta"
              onClick={doCreateLobby}
              disabled={importState === 'working' || !name.trim()}
            >
              {importState === 'working' ? 'Creating…' : 'Create lobby from setup'}
            </button>
          </div>
        ) : (
          <div className="import-ruleset__card">
            <span className="import-ruleset__kind">
              {isLeague ? 'League setup' : 'Scoring format'}
            </span>
            <h2>{shared.name}</h2>
            <dl className="import-ruleset__meta">
              {settings && (
                <>
                  <div>
                    <dt>Teams</dt>
                    <dd>{settings.teamCount}</dd>
                  </div>
                  <div>
                    <dt>Rounds</dt>
                    <dd>{roundsForSettings(settings)}</dd>
                  </div>
                  <div>
                    <dt>Clock</dt>
                    <dd>{clockSummary(settings.pickTiers)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Scoring</dt>
                <dd>{scoringLabel}</dd>
              </div>
            </dl>
            {error && <p className="import-ruleset__error">{error}</p>}
            <button
              className="button button--primary import-ruleset__cta"
              onClick={doImport}
              disabled={importState === 'working'}
            >
              {importState === 'working'
                ? 'Importing…'
                : `Import to my ${isLeague ? 'leagues' : 'scoring formats'}`}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
