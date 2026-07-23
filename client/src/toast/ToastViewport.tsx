import CloseIcon from '@mui/icons-material/Close';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { Avatar } from '../components/Avatar/Avatar';
import { GradeBadge } from '../components/GradeBadge/GradeBadge';
import { useToastInternal, type ToastItem } from './ToastContext';
import './ToastViewport.scss';

export function ToastViewport() {
  const { toasts, dismissToast, togglePause } = useToastInternal();
  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport">
      {toasts.map((t) => (
        <ToastCard
          key={t.id}
          toast={t}
          onClose={() => dismissToast(t.id)}
          onTogglePause={() => togglePause(t.id)}
        />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onClose,
  onTogglePause,
}: {
  toast: ToastItem;
  onClose: () => void;
  onTogglePause: () => void;
}) {
  const { title, body, tone, action, avatar, grade, onClick, durationMs, paused, closing } =
    toast;

  function activate() {
    if (!onClick) return;
    onClick();
    onClose();
  }

  return (
    <div
      className={`toast toast--${tone}${closing ? ' is-closing' : ''}${onClick ? ' is-clickable' : ''}`}
      role="status"
      aria-live="polite"
      onClick={onClick ? activate : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                activate();
              }
            }
          : undefined
      }
      tabIndex={onClick ? 0 : undefined}
    >
      {avatar && (
        <span className="toast__avatar">
          <Avatar avatar={avatar} size={30} />
        </span>
      )}
      <div className="toast__content">
        <p className="toast__title">
          {title}
          {grade && <GradeBadge grade={grade} size={18} />}
        </p>
        {body && <p className="toast__body">{body}</p>}
      </div>
      <div className="toast__controls">
        {action && (
          <button
            type="button"
            className="toast__action"
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
              onClose();
            }}
          >
            {action.label}
          </button>
        )}
        <button
          type="button"
          className="toast__icon-btn"
          aria-label={paused ? 'Resume auto-dismiss' : 'Pause auto-dismiss'}
          title={paused ? 'Resume' : 'Pause'}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePause();
          }}
        >
          {paused ? <PlayArrowIcon fontSize="small" /> : <PauseIcon fontSize="small" />}
        </button>
        <button
          type="button"
          className="toast__icon-btn"
          aria-label="Dismiss"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <CloseIcon fontSize="small" />
        </button>
      </div>
      <div
        className={`toast__bar${paused ? ' is-paused' : ''}`}
        style={{ animationDuration: `${durationMs}ms` }}
      />
    </div>
  );
}
