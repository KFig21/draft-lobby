import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import './HoldButton.scss';

interface Props {
  /** Fired once the button is held for the full duration. */
  onHold: () => void;
  /** Fired when the press is released before the hold completes (i.e. a plain
   * tap/click). Omit to make an early release a no-op. */
  onTap?: () => void;
  /** Hold duration in ms (default 1750). */
  durationMs?: number;
  disabled?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * A press-and-hold button: holding for `durationMs` fires `onHold` while a
 * progress fill sweeps across the background (styled like the draft top bar's
 * clock fill); releasing early fires `onTap`.
 *
 * Once a hold starts it runs to completion on its own timer and the element
 * stays enabled even if `disabled` flips true mid-hold — so a draft-clock
 * timeout (which flips the on-clock state) can't abort an in-progress hold, and
 * the pick still lands when the hold finishes (into the now-skipped-but-open
 * slot). The pointer is captured so the release still registers even if the
 * finger/cursor drifts off the button.
 */
export function HoldButton({
  onHold,
  onTap,
  durationMs = 1750,
  disabled,
  className,
  title,
  ariaLabel,
  children,
}: Props) {
  const [holding, setHolding] = useState(false);
  const active = useRef(false); // a hold is in progress
  const completed = useRef(false); // the current hold reached full duration
  const timer = useRef<number | null>(null);
  // Latest callbacks, so the completion timer (created at press time) always
  // calls the current handler rather than a stale closure.
  const onHoldRef = useRef(onHold);
  const onTapRef = useRef(onTap);
  onHoldRef.current = onHold;
  onTapRef.current = onTap;

  function clearTimer() {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }
  // Cancel any pending hold if the button unmounts mid-press (e.g. it stops
  // being the viewer's turn with skips off) so no stray pick fires later.
  useEffect(() => () => clearTimer(), []);

  function begin(e: PointerEvent<HTMLButtonElement>) {
    if (disabled || active.current || e.button > 0) return;
    active.current = true;
    completed.current = false;
    setHolding(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    timer.current = window.setTimeout(() => {
      completed.current = true;
      active.current = false;
      setHolding(false);
      onHoldRef.current();
    }, durationMs);
  }

  function finish(e: PointerEvent<HTMLButtonElement>) {
    if (!active.current) return;
    clearTimer();
    active.current = false;
    setHolding(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    // Released before the hold completed → treat as a plain tap.
    if (!completed.current) onTapRef.current?.();
  }

  function abort() {
    if (!active.current) return;
    clearTimer();
    active.current = false;
    setHolding(false);
  }

  return (
    <button
      type="button"
      className={`hold-btn${holding ? ' is-holding' : ''}${className ? ` ${className}` : ''}`}
      style={{ ['--hold-ms']: `${durationMs}ms` } as CSSProperties}
      // Stay clickable while a hold is running even if the parent disables us.
      disabled={disabled && !holding}
      onPointerDown={begin}
      onPointerUp={finish}
      onPointerCancel={abort}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e: MouseEvent) => e.stopPropagation()}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onTapRef.current?.();
        }
      }}
      title={title}
      aria-label={ariaLabel}
    >
      <span className="hold-btn__fill" aria-hidden />
      <span className="hold-btn__label">{children}</span>
    </button>
  );
}
