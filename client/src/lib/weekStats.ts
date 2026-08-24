import { computeFantasyPoints, type ScoringRules } from '@draft-lobby/shared';
import type { PlayerWeekStatRow } from './types';

/** No rank available (didn't play, or a pool of one) — a neutral gray. */
export const RANK_NEUTRAL = '#8a94a6';

/** Rank → colour on a green (best) → amber → red (worst) scale. Shared by the
 * weekly-stats modal's chart and the inline sparkline so they read identically. */
export function rankColor(rank: number | null, count: number): string {
  if (rank == null || count < 2) return RANK_NEUTRAL;
  const t = (rank - 1) / (count - 1);
  return t <= 0.5
    ? `color-mix(in srgb, #f6a642 ${(t * 200).toFixed(0)}%, #3fd6a5)`
    : `color-mix(in srgb, #f8577d ${((t - 0.5) * 200).toFixed(0)}%, #f6a642)`;
}

/** Points for a week: the raw line scored under `rules`, else Sleeper's PPR
 * total (K rows and any player missing a mapped raw line). */
export function pointsForRow(
  row: PlayerWeekStatRow,
  rules: ScoringRules,
  position: string,
): number {
  if (row.stats && Object.keys(row.stats).length > 0) {
    return computeFantasyPoints(row.stats, rules, position);
  }
  return row.pts_ppr ?? 0;
}
