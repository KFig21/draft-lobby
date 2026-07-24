import {
  POSITION_OVERRIDE_SEP,
  matchPreset,
  type LobbySettings,
  type ScoringRules,
} from '@draft-lobby/shared';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ProfileEditor } from '../../components/ProfileEditor/ProfileEditor';
import { ThemeToggle } from '../../components/ThemeToggle/ThemeToggle';
import { ToggleSwitch } from '../../components/ToggleSwitch/ToggleSwitch';
import { DraftCellStylePicker } from '../../components/DraftGrid/DraftCellStylePicker';
import {
  getDraftCellStyle,
  setDraftCellStyle,
  type DraftCellStyle,
} from '../../lib/draftCellStyle';
import { useTheme } from '../../theme/ThemeContext';
import { supabase } from '../../supabase';
import {
  TOAST_CATEGORIES,
  getToastPrefs,
  setToastCategoryEnabled,
  setToastsEnabled,
  type ToastCategory,
} from '../../toast/toastPrefs';
import './SettingsPage.scss';

interface ScoringFormatRow {
  id: string;
  name: string;
  rules: ScoringRules;
}
interface LeagueRow {
  id: string;
  name: string;
  settings: LobbySettings;
}

function categoryCount(rules: ScoringRules): number {
  return new Set(Object.keys(rules).map((k) => k.split(POSITION_OVERRIDE_SEP)[0])).size;
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { theme } = useTheme();
  const [formats, setFormats] = useState<ScoringFormatRow[]>([]);
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [toastPrefs, setToastPrefsState] = useState(() => getToastPrefs());
  const [cellStyle, setCellStyleState] = useState<DraftCellStyle>(() => getDraftCellStyle());

  function updateCellStyle(style: DraftCellStyle) {
    setDraftCellStyle(style);
    setCellStyleState(style);
  }

  function updateToastsEnabled(enabled: boolean) {
    setToastsEnabled(enabled);
    setToastPrefsState((p) => ({ ...p, enabled }));
  }
  function updateToastCategory(category: ToastCategory, enabled: boolean) {
    setToastCategoryEnabled(category, enabled);
    setToastPrefsState((p) => ({ ...p, categories: { ...p.categories, [category]: enabled } }));
  }

  async function refresh() {
    const [f, l] = await Promise.all([
      supabase.from('scoring_formats').select('id, name, rules').order('created_at'),
      supabase.from('league_templates').select('id, name, settings').order('created_at'),
    ]);
    if (f.data) setFormats(f.data as ScoringFormatRow[]);
    if (l.data) setLeagues(l.data as LeagueRow[]);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function deleteLeague(id: string) {
    if (!confirm('Delete this league?')) return;
    await supabase.from('league_templates').delete().eq('id', id);
    void refresh();
  }
  async function deleteFormat(id: string) {
    if (!confirm('Delete this scoring format?')) return;
    await supabase.from('scoring_formats').delete().eq('id', id);
    void refresh();
  }

  return (
    <main className="settings">
      <header className="settings__header">
        <h1>Settings</h1>
      </header>

      {/* Appearance */}
      <section className="settings__section">
        <h2>Appearance</h2>
        <div className="settings__row">
          <div className="settings__row-main">
            <span className="settings__row-name">Theme</span>
            <span className="muted">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </div>
          <ThemeToggle className="settings__icon" />
        </div>
      </section>

      {/* Draft board */}
      <section className="settings__section">
        <h2>Draft board</h2>
        <div className="settings__row">
          <div className="settings__row-main">
            <span className="settings__row-name">Cell style</span>
            <span className="muted">How a drafted pick looks on the board</span>
          </div>
        </div>
        <DraftCellStylePicker value={cellStyle} onChange={updateCellStyle} />
      </section>

      {/* Notifications */}
      <section className="settings__section">
        <h2>Notifications</h2>
        <div className="settings__row">
          <div className="settings__row-main">
            <span className="settings__row-name">Toast pop-ups</span>
            <span className="muted">Live alerts while you're active in a lobby</span>
          </div>
          <ToggleSwitch
            label="Toggle toast pop-ups"
            checked={toastPrefs.enabled}
            onChange={updateToastsEnabled}
          />
        </div>
        <div className={`settings__toast-categories${toastPrefs.enabled ? '' : ' is-disabled'}`}>
          {TOAST_CATEGORIES.map((c) => (
            <div className="settings__toast-row" key={c.key}>
              <span>{c.label}</span>
              <ToggleSwitch
                label={c.label}
                checked={toastPrefs.categories[c.key]}
                onChange={(v) => updateToastCategory(c.key, v)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Profile */}
      <section className="settings__section">
        <h2>Profile</h2>
        <ProfileEditor />
      </section>

      {/* Leagues */}
      <section className="settings__section">
        <h2>Leagues</h2>
        {leagues.map((l) => (
          <div className="settings__row" key={l.id}>
            <div className="settings__row-main">
              <span className="settings__row-name">{l.name}</span>
              <span className="muted">{l.settings.teamCount}-team</span>
            </div>
            <div className="settings__row-actions">
              <button
                className="settings__icon"
                aria-label={`Edit ${l.name}`}
                onClick={() => navigate(`/settings/leagues/${l.id}/edit`)}
              >
                <EditOutlinedIcon fontSize="small" />
              </button>
              <button
                className="settings__icon"
                aria-label={`Delete ${l.name}`}
                onClick={() => deleteLeague(l.id)}
              >
                <DeleteOutlineIcon fontSize="small" />
              </button>
            </div>
          </div>
        ))}
        <Link className="settings__setup" to="/settings/leagues/new">
          Set up a league →
        </Link>
      </section>

      {/* Scoring formats */}
      <section className="settings__section">
        <h2>Scoring formats</h2>
        {formats.map((f) => (
          <div className="settings__row" key={f.id}>
            <div className="settings__row-main">
              <span className="settings__row-name">{f.name}</span>
              <span className="muted">
                {categoryCount(f.rules)} categories
                {matchPreset(f.rules) ? ` · ${matchPreset(f.rules)}` : ''}
              </span>
            </div>
            <div className="settings__row-actions">
              <button
                className="settings__icon"
                aria-label={`Edit ${f.name}`}
                onClick={() => navigate(`/settings/scoring/${f.id}/edit`)}
              >
                <EditOutlinedIcon fontSize="small" />
              </button>
              <button
                className="settings__icon"
                aria-label={`Delete ${f.name}`}
                onClick={() => deleteFormat(f.id)}
              >
                <DeleteOutlineIcon fontSize="small" />
              </button>
            </div>
          </div>
        ))}
        <Link className="settings__setup" to="/settings/scoring/new">
          Create a custom scoring format →
        </Link>
      </section>

      {/* Account */}
      <section className="settings__section">
        <h2>Account</h2>
        <button className="button settings__signout" onClick={signOut}>
          Sign out
        </button>
      </section>
    </main>
  );
}
