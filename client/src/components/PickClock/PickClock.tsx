import { useEffect, useState } from 'react';
import './PickClock.scss';

/** Counts down to `deadline`, ticking every second. Shows mm:ss (or hh:mm:ss).
 * While paused there's no deadline — `frozenMs` (the time that was left when
 * paused) keeps the clock showing that value instead of going blank. */
export function PickClock({
  deadline,
  frozenMs,
  unlimited,
  maxSeconds,
}: {
  deadline: string | null;
  frozenMs?: number | null;
  /** The round has no clock — show "∞" instead of a countdown. Only matters
   * when `deadline` is null (a bot's finite clock still counts down normally). */
  unlimited?: boolean;
  /** Cap the displayed value at this (the round's own clock). The deadline may
   * include the between-picks buffer, so during that buffer the remaining time
   * exceeds the clock — capping shows the clock frozen at full until the buffer
   * elapses, then it ticks down normally. */
  maxSeconds?: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const cap = (secs: number) =>
    maxSeconds != null && maxSeconds > 0 ? Math.min(secs, maxSeconds) : secs;

  if (!deadline) {
    if (unlimited) {
      return (
        <span className="clock clock--idle" title="No pick clock this round">
          ∞
        </span>
      );
    }
    if (frozenMs != null) {
      return (
        <span className="clock clock--paused">
          {formatDuration(cap(Math.max(0, Math.floor(frozenMs / 1000))))}
        </span>
      );
    }
    return <span className="clock clock--idle">—</span>;
  }

  const remainingMs = new Date(deadline).getTime() - now;
  const remaining = cap(Math.max(0, Math.floor(remainingMs / 1000)));
  // Match the on-clock cell / on-turn top bar urgency thresholds (see
  // onClockCellUrgency in DraftBoardPage): amber from 25s, red from 10s — so the
  // clock a bystander watches turns the same colours, at the same times.
  const danger = remaining <= 10;
  const warning = !danger && remaining <= 25;

  return (
    <span
      className={`clock ${warning ? 'clock--warning' : ''} ${danger ? 'clock--danger' : ''}`}
    >
      {formatDuration(remaining)}
    </span>
  );
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
