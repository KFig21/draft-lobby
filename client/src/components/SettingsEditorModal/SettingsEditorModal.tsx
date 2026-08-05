import {
  lobbySettingsSchema,
  normalizeTiers,
  rosterSize,
  settingsEditableGroups,
  type LobbySettings,
  type LobbyStatus,
} from '@draft-lobby/shared';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { updateLobbySettings } from '../../lib/lobbySettings';
import { LeagueSettingsFields } from '../LeagueSettingsFields/LeagueSettingsFields';
import { Modal } from '../Modal/Modal';
import './SettingsEditorModal.scss';

interface Props {
  lobbyId: string;
  status: LobbyStatus;
  settings: LobbySettings;
  /** Current lobby name — shown as an editable field when `canEditName`. */
  name: string;
  /** Whether the draft name can be renamed here (own endpoint + lock rules). */
  canEditName?: boolean;
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
export function SettingsEditorModal({
  lobbyId,
  status,
  settings,
  name,
  canEditName,
  onClose,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<LobbySettings>(settings);
  const [nameDraft, setNameDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => settingsEditableGroups(status), [status]);
  // When only clocks/skips are editable (mid-draft), frame it as "Draft settings".
  const behavioralOnly = groups.size > 0 && !groups.has('structural') && !groups.has('scoring');
  const title = behavioralOnly ? 'Draft settings' : 'Edit settings';

  // A "Draft name" field at the top of Basics — sits outside the phase-locked
  // fieldset (it has its own /rename endpoint + lock), so it stays editable.
  const nameField = canEditName ? (
    <label className="field">
      <span>Draft name</span>
      <input
        value={nameDraft}
        maxLength={60}
        onChange={(e) => setNameDraft(e.target.value)}
        placeholder="Draft name"
      />
    </label>
  ) : undefined;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // Rename first (its own endpoint) so a name-only change still persists
      // even when no settings group is editable (e.g. a completed draft).
      const trimmedName = nameDraft.trim();
      if (canEditName && trimmedName && trimmedName !== name) {
        await api(`/lobbies/${lobbyId}/rename`, { method: 'POST', body: { name: trimmedName } });
      }

      // Only touch the settings endpoint when something's actually editable —
      // it 409s once the draft is COMPLETE.
      if (groups.size > 0) {
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
      } else {
        onSaved(settings);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      wide
      footer={
        <div className="settings-editor__actions">
          <button type="button" className="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="button button--primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      }
    >
      <div className="settings-editor">
        <LeagueSettingsFields
          settings={draft}
          onChange={setDraft}
          editableGroups={groups}
          nameField={nameField}
        />
        {error && <p className="settings-editor__error">{error}</p>}
      </div>
    </Modal>
  );
}
