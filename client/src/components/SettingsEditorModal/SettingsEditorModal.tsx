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

  // Simulate-to-end: only for an in-progress draft, gated by typing SIMULATE.
  const canSimulate = status === 'DRAFTING' || status === 'PAUSED';
  const [simConfirm, setSimConfirm] = useState('');
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  async function simulate() {
    if (simConfirm !== 'SIMULATE') return;
    setSimBusy(true);
    setSimError(null);
    try {
      await api(`/lobbies/${lobbyId}/simulate`, { method: 'POST' });
      // Picks land + the draft completes via realtime; just close the editor.
      onClose();
    } catch (err) {
      setSimError(err instanceof Error ? err.message : 'Could not simulate the draft');
    } finally {
      setSimBusy(false);
    }
  }

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

        {canSimulate && (
          <section className="settings-editor__simulate">
            <h3 className="settings-editor__simulate-title">Simulate to end of draft</h3>
            <p className="muted settings-editor__simulate-note">
              Auto-drafts every remaining pick — for every team, including yours — straight to
              the end. This can’t be undone. Type <strong>SIMULATE</strong> to confirm.
            </p>
            <div className="settings-editor__simulate-row">
              <input
                className="settings-editor__simulate-input"
                value={simConfirm}
                onChange={(e) => setSimConfirm(e.target.value)}
                placeholder="SIMULATE"
                aria-label="Type SIMULATE to confirm"
                autoComplete="off"
                spellCheck={false}
                disabled={simBusy}
              />
              <button
                type="button"
                className="button button--danger"
                onClick={simulate}
                disabled={simBusy || simConfirm !== 'SIMULATE'}
              >
                {simBusy ? 'Simulating…' : 'Simulate to end'}
              </button>
            </div>
            {simError && <p className="settings-editor__error">{simError}</p>}
          </section>
        )}
      </div>
    </Modal>
  );
}
