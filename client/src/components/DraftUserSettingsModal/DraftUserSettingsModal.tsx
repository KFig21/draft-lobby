import type { DraftCellStyle } from '../../lib/draftCellStyle';
import { TOAST_CATEGORIES, type ToastCategory, type ToastPrefs } from '../../toast/toastPrefs';
import { DraftCellStylePicker } from '../DraftGrid/DraftCellStylePicker';
import { Modal } from '../Modal/Modal';
import { ToggleSwitch } from '../ToggleSwitch/ToggleSwitch';
import './DraftUserSettingsModal.scss';

interface Props {
  onClose: () => void;
  cellStyle: DraftCellStyle;
  onCellStyleChange: (style: DraftCellStyle) => void;
  showCellReactions: boolean;
  onShowCellReactionsChange: (show: boolean) => void;
  toastPrefs: ToastPrefs;
  onToastsEnabledChange: (enabled: boolean) => void;
  onToastCategoryChange: (category: ToastCategory, enabled: boolean) => void;
}

/**
 * Personal draft-board + notification preferences, reachable from the gear
 * icon in the draft room's top bar (desktop/fullscreen — see DraftBoardPage)
 * so a drafter doesn't have to leave the room to reach Settings. Same
 * controls/behavior as the Settings page's "Draft board" and "Notifications"
 * sections, just surfaced here too — not commissioner-only, not lobby-wide;
 * every field here is a per-device preference like the Settings page's own.
 */
export function DraftUserSettingsModal({
  onClose,
  cellStyle,
  onCellStyleChange,
  showCellReactions,
  onShowCellReactionsChange,
  toastPrefs,
  onToastsEnabledChange,
  onToastCategoryChange,
}: Props) {
  return (
    <Modal title="Your settings" onClose={onClose} wide>
      <div className="draft-user-settings">
        <section className="draft-user-settings__section">
          <h3>Draft board</h3>
          <div className="draft-user-settings__row">
            <div className="draft-user-settings__row-main">
              <span className="draft-user-settings__row-name">Cell style</span>
              <span className="muted">How a drafted pick looks on the board</span>
            </div>
          </div>
          <DraftCellStylePicker
            value={cellStyle}
            onChange={onCellStyleChange}
            showReactions={showCellReactions}
          />
          <div className="draft-user-settings__row">
            <div className="draft-user-settings__row-main">
              <span className="draft-user-settings__row-name">Reactions on cells</span>
              <span className="muted">Show comment/reaction indicators on drafted cells</span>
            </div>
            <ToggleSwitch
              label="Toggle reactions on cells"
              checked={showCellReactions}
              onChange={onShowCellReactionsChange}
            />
          </div>
        </section>

        <section className="draft-user-settings__section">
          <h3>Notifications</h3>
          <div className="draft-user-settings__row">
            <div className="draft-user-settings__row-main">
              <span className="draft-user-settings__row-name">Toast pop-ups</span>
              <span className="muted">Live alerts while you're active in this lobby</span>
            </div>
            <ToggleSwitch
              label="Toggle toast pop-ups"
              checked={toastPrefs.enabled}
              onChange={onToastsEnabledChange}
            />
          </div>
          <div
            className={`draft-user-settings__toast-categories${
              toastPrefs.enabled ? '' : ' is-disabled'
            }`}
          >
            {TOAST_CATEGORIES.map((c) => (
              <div className="draft-user-settings__toast-row" key={c.key}>
                <span>{c.label}</span>
                <ToggleSwitch
                  label={c.label}
                  checked={toastPrefs.categories[c.key]}
                  onChange={(v) => onToastCategoryChange(c.key, v)}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
