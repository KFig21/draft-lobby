import {
  SCORING_PRESETS,
  matchPreset,
  roundsForSettings,
  type LobbySettings,
  type ScoringRules,
} from '@draft-lobby/shared';
import CheckIcon from '@mui/icons-material/Check';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Loader } from '../../components/Loader/Loader';
import { clockSummary } from '../../lib/format';
import { fetchSharedRuleset, importSharedRuleset, type SharedRuleset } from '../../lib/importRuleset';
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

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    void fetchSharedRuleset(token).then((row) => {
      setShared(row);
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

  const isLeague = shared?.kind === 'LEAGUE';
  const settings = isLeague ? (shared!.payload as LobbySettings) : null;
  const rules = shared ? (isLeague ? settings!.scoring : (shared.payload as ScoringRules)) : null;
  const preset = rules ? matchPreset(rules) : null;
  const scoringLabel = preset ? SCORING_PRESETS[preset].label : 'Custom';

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
        ) : (
          <div className="import-ruleset__card">
            <span className="import-ruleset__kind">
              {shared.kind === 'LEAGUE' ? 'League setup' : 'Scoring format'}
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
                : `Import to my ${shared.kind === 'LEAGUE' ? 'leagues' : 'scoring formats'}`}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
