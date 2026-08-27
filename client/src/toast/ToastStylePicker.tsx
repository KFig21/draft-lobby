import { POSITION_COLORS, type Avatar as AvatarData, type Position } from '@draft-lobby/shared';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import CloseIcon from '@mui/icons-material/Close';
import PauseIcon from '@mui/icons-material/Pause';
import { Avatar } from '../components/Avatar/Avatar';
import type { ToastStyle } from './toastPrefs';
import './ToastStylePicker.scss';

const SAMPLE_AVATAR: AvatarData = { bgColor: '#4aa8ff', shape: 'circle', emoji: '😎' };

const OPTIONS: { value: ToastStyle; label: string }[] = [
  { value: 'detailed', label: 'Detailed' },
  { value: 'brief', label: 'Brief' },
];

/** Radio list with a real, live-rendered example toast under each label — the
 * same "show, don't just tell" pattern as the player-card style picker. */
export function ToastStylePicker({
  value,
  onChange,
}: {
  value: ToastStyle;
  onChange: (style: ToastStyle) => void;
}) {
  return (
    <div className="toast-style-picker">
      {OPTIONS.map((opt) => (
        <label key={opt.value} className="toast-style-picker__option">
          <div className="toast-style-picker__radio-row">
            <input
              type="radio"
              name="toastStyle"
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            <span
              className={`toast-style-picker__name${value === opt.value ? ' is-selected' : ''}`}
            >
              {opt.label}
            </span>
          </div>
          <div className="toast-style-picker__preview" aria-hidden>
            {opt.value === 'brief' ? <BriefPreview /> : <DetailedPreview />}
          </div>
        </label>
      ))}
    </div>
  );
}

/** Static (non-interactive) copies of the pause/close controls. */
function PreviewControls() {
  return (
    <div className="toast__controls">
      <span className="toast__icon-btn">
        <PauseIcon fontSize="small" />
      </span>
      <span className="toast__icon-btn">
        <CloseIcon fontSize="small" />
      </span>
    </div>
  );
}

function DetailedPreview() {
  return (
    <div className="toast toast--info toast-style-picker__toast">
      <span className="toast__avatar">
        <Avatar avatar={SAMPLE_AVATAR} size={30} />
      </span>
      <div className="toast__content">
        <p className="toast__title">Nordy reacted 🔥</p>
        <p className="toast__pick">
          <span
            className="toast__pick-pos"
            style={{ background: POSITION_COLORS['RB' as Position] }}
          >
            RB
          </span>
          Bijan Robinson
          <span className="toast__pick-meta">Round 1 · Pick 3</span>
        </p>
      </div>
      <PreviewControls />
    </div>
  );
}

function BriefPreview() {
  return (
    <div className="toast toast--info toast--brief toast-style-picker__toast">
      <span className="toast__lead">
        <CheckCircleOutlineRoundedIcon fontSize="inherit" />
      </span>
      <p className="toast__title toast__title--brief">Bijan Robinson drafted</p>
      <PreviewControls />
    </div>
  );
}
