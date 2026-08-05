import {
  lobbySettingsSchema,
  normalizeTiers,
  rosterSize,
  settingsEditableGroups,
  type LobbySettings,
  type LobbyStatus,
} from '@draft-lobby/shared';
import { useMemo, useState } from 'react';
import { updateLobbySettings } from '../../lib/lobbySettings';
import { LeagueSettingsFields } from '../LeagueSettingsFields/LeagueSettingsFields';
import { Modal } from '../Modal/Modal';
import './SettingsEditorModal.scss';

interface Props {
  lobbyId: string;
  status: LobbyStatus;
  settings: LobbySettings;
  onClose: () => void;
  /** The saved (server-effective) settings — the parent should adopt these. */
  onSaved: (settings: LobbySettings) => void;
}

/**
 * Commissioner settings editor. Reuses the wizard's LeagueSettingsFields but
 * gates each group to what's editable at the lobby's current phase (see
 * settingsEditableGroups). Used both pre-draft (lobby room, most things
 * editable) and mid-draft (draft board, clocks + skips only).
 */
export function SettingsEditorModal({ lobbyId, status, settings, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<LobbySettings>(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => settingsEditableGroups(status), [status]);
  // When only clocks/skips are editable (mid-draft), frame it as "Draft settings".
  const behavioralOnly = groups.size > 0 && !groups.has('structural') && !groups.has('scoring');
  const title = behavioralOnly ? 'Draft settings' : 'Edit settings';

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const rounds = rosterSize(draft.rosterComposition);
      const finalSettings: LobbySettings = {
        ...draft,
        rosterComposition: draft.rosterComposition.filter((r) => r.count > 0),
        pickTiers: normalizeTiers(draft.pickTiers, rounds),
      };
      const parsed = lobbySettingsSchema.safeParse(finalSettings);
      if (!parsed.success) {
        setError('Some settings are invalid — check the roster and pick clock.');
        return;
      }
      const saved = await updateLobbySettings(lobbyId, parsed.data);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="settings-editor">
        <LeagueSettingsFields settings={draft} onChange={setDraft} editableGroups={groups} />
        {error && <p className="settings-editor__error">{error}</p>}
        <div className="settings-editor__actions">
          <button type="button" className="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="button button--primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
