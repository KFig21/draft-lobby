import {
  canRestartDraft,
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
  /**
   * Start a full "simulate to end" run. Handled by the parent (draft board) so
   * it can close this modal, show a "simulating…" banner, and let the
   * commissioner cancel — the request is long-lived. When omitted, the Simulate
   * section isn't offered.
   */
  onSimulate?: () => void;
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
  onSimulate,
}: Props) {
  const [draft, setDraft] = useState<LobbySettings>(settings);
  const [nameDraft, setNameDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simulate-to-end: only for a live (DRAFTING) draft, gated by typing SIMULATE.
  // Not while paused — pausing is how the commissioner cancels a running
  // simulation, so it must start from a live draft. The run itself is owned by
  // the parent (onSimulate) so it can close this modal, show a cancelable
  // "simulating…" banner on the board, and hold the long-lived request.
  const canSimulate = status === 'DRAFTING' && !!onSimulate;
  const [simConfirm, setSimConfirm] = useState('');

  function simulate() {
    if (simConfirm !== 'SIMULATE') return;
    onSimulate?.();
  }

  // Restart: wipe the drafted picks and drop back to STAGING. In-progress only,
  // gated by typing RESTART.
  const canRestart = canRestartDraft(status);
  const [restartConfirm, setRestartConfirm] = useState('');
  const [restartBusy, setRestartBusy] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  async function restart() {
    if (restartConfirm !== 'RESTART') return;
    setRestartBusy(true);
    setRestartError(null);
    try {
      await api(`/lobbies/${lobbyId}/restart`, { method: 'POST' });
      // Status → STAGING and the picks clearing both arrive via realtime, which
      // drops every client back to the open draft room; just close the editor.
      onClose();
    } catch (err) {
      setRestartError(err instanceof Error ? err.message : 'Could not restart the draft');
    } finally {
      setRestartBusy(false);
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
              />
              <button
                type="button"
                className="button button--danger"
                onClick={simulate}
                disabled={simConfirm !== 'SIMULATE'}
              >
                Simulate to end
              </button>
            </div>
          </section>
        )}

        {canRestart && (
          <section className="settings-editor__simulate">
            <h3 className="settings-editor__simulate-title">Restart draft</h3>
            <p className="muted settings-editor__simulate-note">
              Clears every pick and returns the draft to the open room (before the first pick), so
              you can change rules or keepers and run it again. Keeper picks are kept. This can’t be
              undone. Type <strong>RESTART</strong> to confirm.
            </p>
            <div className="settings-editor__simulate-row">
              <input
                className="settings-editor__simulate-input"
                value={restartConfirm}
                onChange={(e) => setRestartConfirm(e.target.value)}
                placeholder="RESTART"
                aria-label="Type RESTART to confirm"
                autoComplete="off"
                spellCheck={false}
                disabled={restartBusy}
              />
              <button
                type="button"
                className="button button--danger"
                onClick={restart}
                disabled={restartBusy || restartConfirm !== 'RESTART'}
              >
                {restartBusy ? 'Restarting…' : 'Restart draft'}
              </button>
            </div>
            {restartError && <p className="settings-editor__error">{restartError}</p>}
          </section>
        )}
      </div>
    </Modal>
  );
}
