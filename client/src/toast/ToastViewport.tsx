import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PriorityHighRoundedIcon from '@mui/icons-material/PriorityHighRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { useEffect, useState, type ReactNode } from 'react';
import { Avatar } from '../components/Avatar/Avatar';
import { GradeBadge } from '../components/GradeBadge/GradeBadge';
import { useToastInternal, type ToastItem } from './ToastContext';
import type { ToastTone } from './ToastContext';
import type { ToastCategory } from './toastPrefs';
import './ToastViewport.scss';

/** Fallback Brief-layout icon per tone, when nothing more specific applies. */
const TONE_ICON: Record<ToastTone, ReactNode> = {
  info: <InfoOutlinedIcon fontSize="inherit" />,
  success: <CheckCircleOutlineRoundedIcon fontSize="inherit" />,
  warning: <WarningAmberRoundedIcon fontSize="inherit" />,
  danger: <ErrorOutlineRoundedIcon fontSize="inherit" />,
};

/** Brief-layout lead icon by event category, for toasts that carry no explicit
 * `titleIcon`. Reactions get an emphasis mark; comments/mentions already ship a
 * comment-bubble / @ titleIcon, which takes priority over this. */
const CATEGORY_ICON: Partial<Record<ToastCategory, ReactNode>> = {
  reaction: <PriorityHighRoundedIcon fontSize="inherit" />,
};

/** How many toasts show in the collapsed stack; the rest wait behind. */
const MAX_STACK = 3;

export function ToastViewport() {
  const { toasts, dismissToast, togglePause } = useToastInternal();
  if (toasts.length === 0) return null;

  // Collapse into an iOS-style deck: the oldest not-yet-closing toast is the
  // front (depth 0), the next few peek behind it, and anything past MAX_STACK
  // waits off-screen. A closing toast stays pinned at the front while it fades.
  let liveDepth = 0;
  const rendered = toasts
    .map((t) => ({ t, depth: t.closing ? 0 : liveDepth++ }))
    .filter(({ t, depth }) => t.closing || depth < MAX_STACK);

  return (
    <div className="toast-viewport">
      {rendered.map(({ t, depth }) => (
        <ToastCard
          key={t.id}
          toast={t}
          depth={depth}
          isFront={depth === 0 && !t.closing}
          onClose={() => dismissToast(t.id)}
          onTogglePause={() => togglePause(t.id)}
        />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  depth,
  isFront,
  onClose,
  onTogglePause,
}: {
  toast: ToastItem;
  depth: number;
  isFront: boolean;
  onClose: () => void;
  onTogglePause: () => void;
}) {
  // Fade in on mount (transform stays at the depth position — see the .scss).
  // Double rAF so the opacity:0 start paints before the transition begins.
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setEntering(false));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, []);
  const {
    title,
    titleIcon,
    body,
    tone,
    action,
    avatar,
    grade,
    pick,
    category,
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
      className={`toast toast--${tone}${brief ? ' toast--brief' : ''}${isFront ? ' is-front' : ''}${entering ? ' is-entering' : ''}${closing ? ' is-closing' : ''}${onClick && isFront ? ' is-clickable' : ''}`}
      data-depth={depth}
      style={{ zIndex: closing ? 40 : 30 - depth }}
      role="status"
      aria-live="polite"
      onClick={onClick && isFront ? activate : undefined}
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
      tabIndex={onClick && isFront ? 0 : undefined}
    >
      {brief ? (
        // Brief: an icon for what actually happened (comment bubble, reaction
        // mark, …, falling back to the tone icon) in a darker concentric chip on
        // the left, then the message with the person's avatar beside their name.
        <>
          <span className="toast__lead" aria-hidden>
            {titleIcon ?? (category && CATEGORY_ICON[category]) ?? TONE_ICON[tone]}
          </span>
          <p className="toast__title toast__title--brief">
            {avatar && (
              <span className="toast__inline-avatar">
                <Avatar avatar={avatar} size={20} />
              </span>
            )}
            {title}
          </p>
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
      {/* The countdown bar only runs on the front toast — behind toasts haven't
          started their timers yet. */}
      {isFront && (
        <div
          className={`toast__bar is-running${paused ? ' is-paused' : ''}`}
          style={{ animationDuration: `${durationMs}ms` }}
        />
      )}
    </div>
  );
}
