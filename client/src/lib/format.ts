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

/** "Round.pick" label — e.g. round 5, 2nd pick of the round. Zero-padded to
 * 2 digits once a draft has 10+ teams (round 5's 2nd pick reads as "5.02",
 * not "5.2", once picks-in-round can reach double digits); below that,
 * plain "5.2" is unambiguous on its own. */
export function formatRoundPick(round: number, pickInRound: number, teamCount: number): string {
  const pad = teamCount >= 10 ? 2 : 1;
  return `${round}.${String(pickInRound).padStart(pad, '0')}`;
}
