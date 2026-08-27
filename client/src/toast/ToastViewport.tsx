import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import type { ReactNode } from 'react';
import { Avatar } from '../components/Avatar/Avatar';
import { GradeBadge } from '../components/GradeBadge/GradeBadge';
import { useToastInternal, type ToastItem } from './ToastContext';
import type { ToastTone } from './ToastContext';
import './ToastViewport.scss';

/** Leading icon for the Brief layout — one per tone. */
const TONE_ICON: Record<ToastTone, ReactNode> = {
  info: <InfoOutlinedIcon fontSize="inherit" />,
  success: <CheckCircleOutlineRoundedIcon fontSize="inherit" />,
  warning: <WarningAmberRoundedIcon fontSize="inherit" />,
  danger: <ErrorOutlineRoundedIcon fontSize="inherit" />,
};

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
  const {
    title,
    titleIcon,
    body,
    tone,
    action,
    avatar,
    grade,
    pick,
    onClick,
    style,
    durationMs,
    paused,
    closing,
  } = toast;
  const brief = style === 'brief';

  function activate() {
    if (!onClick) return;
    onClick();
    onClose();
  }

  return (
    <div
      className={`toast toast--${tone}${brief ? ' toast--brief' : ''}${closing ? ' is-closing' : ''}${onClick ? ' is-clickable' : ''}`}
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
      {brief ? (
        // Brief: a tone icon + the message only — no avatar, chips, or subtext.
        <>
          <span className="toast__lead" aria-hidden>
            {TONE_ICON[tone]}
          </span>
          <p className="toast__title toast__title--brief">{title}</p>
        </>
      ) : (
        <>
          {avatar && (
            <span className="toast__avatar">
              <Avatar avatar={avatar} size={30} />
            </span>
          )}
          <div className="toast__content">
            <p className="toast__title">
              {title}
              {titleIcon}
              {grade && <GradeBadge grade={grade} size={18} />}
            </p>
            {pick && (
              <p className="toast__pick">
                <span
                  className="toast__pick-pos"
                  style={{ background: POSITION_COLORS[pick.position as Position] }}
                >
                  {pick.position}
                </span>
                {pick.name}
                <span className="toast__pick-meta">
                  Round {pick.round} · Pick {pick.overall}
                </span>
              </p>
            )}
            {body && <p className="toast__body">{body}</p>}
          </div>
        </>
      )}
      <div className="toast__controls">
        {!brief && action && (
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
