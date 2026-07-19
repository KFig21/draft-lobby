import {
  DEFAULT_LOBBY_SETTINGS,
  lobbySettingsSchema,
  rosterSize,
  type LobbySettings,
} from '@draft-lobby/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  LeagueSettingsFields,
  normalizeTiers,
} from '../../components/LeagueSettingsFields/LeagueSettingsFields';
import { supabase } from '../../supabase';
import '../LobbyWizard/LobbyWizardPage.scss';

export interface SavedLeague {
  id: string;
  name: string;
  settings: LobbySettings;
}

interface Props {
  /** When embedded (e.g. in a modal), renders form-only and calls onSaved. */
  embedded?: boolean;
  onSaved?: (league: SavedLeague) => void;
  onCancel?: () => void;
}

export function LeagueWizardPage({ embedded = false, onSaved, onCancel }: Props = {}) {
  const params = useParams<{ id?: string }>();
  const editId = embedded ? undefined : params.id;
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [settings, setSettings] = useState<LobbySettings>({
    ...DEFAULT_LOBBY_SETTINGS,
    name: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit mode: hydrate from the existing league.
  useEffect(() => {
    if (!editId) return;
    void supabase
      .from('league_templates')
      .select('settings')
      .eq('id', editId)
      .single()
      .then(({ data }) => {
        if (data?.settings) setSettings(data.settings as LobbySettings);
      });
  }, [editId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const rounds = rosterSize(settings.rosterComposition);
    const cleaned: LobbySettings = {
      ...settings,
      scheduledStart: null, // per-lobby, not part of a reusable league
      rosterComposition: settings.rosterComposition.filter((r) => r.count > 0),
      pickTiers: normalizeTiers(settings.pickTiers, rounds),
    };
    const parsed = lobbySettingsSchema.safeParse(cleaned);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your settings');
      return;
    }
    setSaving(true);
    const row = { user_id: userId, name: parsed.data.name, settings: parsed.data };
    const query = editId
      ? supabase.from('league_templates').update(row).eq('id', editId).select('id').single()
      : supabase.from('league_templates').insert(row).select('id').single();
    const { data, error } = await query;
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (onSaved) {
      onSaved({ id: (data as { id: string }).id, name: parsed.data.name, settings: parsed.data });
    } else {
      navigate('/settings');
    }
  }

  const form = (
    <form className="wizard__form" onSubmit={handleSubmit}>
      <LeagueSettingsFields
        settings={settings}
        onChange={setSettings}
        nameField={
          <label className="field">
            <span>League name</span>
            <input
              value={settings.name}
              onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))}
              placeholder='e.g. "PEFFL"'
              maxLength={60}
              required
            />
          </label>
        }
      />

      {error && <p className="wizard__error">{error}</p>}

      <div className="wizard__submit-row">
        {embedded && onCancel && (
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="button button--primary" disabled={saving}>
          {saving ? 'Saving…' : editId ? 'Save changes' : 'Save league'}
        </button>
      </div>
    </form>
  );

  if (embedded) return form;

  return (
    <main className="wizard">
      <header className="wizard__header">
        <button className="back-link" onClick={() => navigate('/settings')}>
          ← Settings
        </button>
        <h1>{editId ? 'Edit league' : 'New league'}</h1>
      </header>
      {form}
    </main>
  );
}
