import { useEffect, useState } from 'react';
import './PickClock.scss';

/** Counts down to `deadline`, ticking every second. Shows mm:ss (or hh:mm:ss). */
export function PickClock({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!deadline) return <span className="clock clock--idle">—</span>;

  const remainingMs = new Date(deadline).getTime() - now;
  const remaining = Math.max(0, Math.floor(remainingMs / 1000));
  const expired = remaining === 0;
  const urgent = remaining <= 10 && !expired;

  return (
    <span
      className={`clock ${urgent ? 'clock--urgent' : ''} ${expired ? 'clock--expired' : ''}`}
    >
      {expired ? '0:00' : formatDuration(remaining)}
    </span>
  );
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
