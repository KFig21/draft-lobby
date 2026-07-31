import type { DraftCellStyle } from '../../lib/draftCellStyle';
import type { PlayerCardStyle } from '../../lib/playerCardStyle';
import { TOAST_CATEGORIES, type ToastCategory, type ToastPrefs } from '../../toast/toastPrefs';
import { DraftCellStylePicker } from '../DraftGrid/DraftCellStylePicker';
import { Modal } from '../Modal/Modal';
import { ToggleSwitch } from '../ToggleSwitch/ToggleSwitch';
import './DraftUserSettingsModal.scss';

interface Props {
  onClose: () => void;
  cellStyle: DraftCellStyle;
  onCellStyleChange: (style: DraftCellStyle) => void;
  cardStyle: PlayerCardStyle;
  onCardStyleChange: (style: PlayerCardStyle) => void;
  showCellReactions: boolean;
  onShowCellReactionsChange: (show: boolean) => void;
  showByeClashes: boolean;
  onShowByeClashesChange: (show: boolean) => void;
  teamColors: boolean;
  onTeamColorsChange: (enabled: boolean) => void;
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
  cardStyle,
  onCardStyleChange,
  showCellReactions,
  onShowCellReactionsChange,
  showByeClashes,
  onShowByeClashesChange,
  teamColors,
  onTeamColorsChange,
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
          <div className="draft-user-settings__row">
            <div className="draft-user-settings__row-main">
              <span className="draft-user-settings__row-name">Player card style</span>
              <span className="muted">Row density in the player pool list</span>
            </div>
            <div className="segmented">
              <button
                type="button"
                className={`segmented__opt${cardStyle === 'comfy' ? ' segmented__opt--on' : ''}`}
                onClick={() => onCardStyleChange('comfy')}
              >
                Comfy
              </button>
              <button
                type="button"
                className={`segmented__opt${cardStyle === 'compact' ? ' segmented__opt--on' : ''}`}
                onClick={() => onCardStyleChange('compact')}
              >
                Compact
              </button>
            </div>
          </div>
          <div className="draft-user-settings__row">
            <div className="draft-user-settings__row-main">
              <span className="draft-user-settings__row-name">Bye week clashes</span>
              <span className="muted">
                Flag players whose bye week already stacks against your roster
              </span>
            </div>
            <ToggleSwitch
              label="Toggle bye week clashes"
              checked={showByeClashes}
              onChange={onShowByeClashesChange}
            />
          </div>
          <div className="draft-user-settings__row">
            <div className="draft-user-settings__row-main">
              <span className="draft-user-settings__row-name">Team colors</span>
              <span className="muted">
                Tint the team abbreviation in player pop-ups with team colors
              </span>
            </div>
            <ToggleSwitch
              label="Toggle team colors"
              checked={teamColors}
              onChange={onTeamColorsChange}
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
