import type { PickTier } from '@draft-lobby/shared';

/** Seconds → "m:ss", e.g. 120 → "2:00", 30 → "0:30". */
export function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Summarize pick-clock tiers, e.g. "2:00 → 0:30" (or "1:30" if flat). */
export function clockSummary(tiers: PickTier[]): string {
  const first = tiers[0]?.seconds ?? 0;
  const last = tiers[tiers.length - 1]?.seconds ?? 0;
  if (tiers.length === 1) return formatSeconds(first);
  return `${formatSeconds(first)} → ${formatSeconds(last)}`;
}
