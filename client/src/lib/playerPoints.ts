import { computeFantasyPoints, type ScoringRules } from '@draft-lobby/shared';
import type { PlayerRow } from './types';

/**
 * Recomputes every player's proj/prev points — and their within-position
 * rank — from their raw stat line under `rules`, instead of trusting the
 * flat PPR total baked in at import time. Used everywhere a player pool
 * needs to reflect a specific lobby's (or ruleset picker's) actual scoring
 * format: bot draft picks, lineup sort order, player cards, and the
 * rankings page all run the same players through this.
 *
 * Falls back to the stored proj_points/prev_points and proj_rank/prev_rank
 * for anyone with no raw stat line (e.g. D/ST — Sleeper keys those stats
 * differently than offensive skill positions, so none is captured today).
 */
export function scorePlayers(players: PlayerRow[], rules: ScoringRules): PlayerRow[] {
  const scored = players.map((p) => ({
    ...p,
    proj_points: p.proj_stats
      ? computeFantasyPoints(p.proj_stats, rules, p.position)
      : p.proj_points,
    prev_points: p.prev_stats
      ? computeFantasyPoints(p.prev_stats, rules, p.position)
      : p.prev_points,
  }));

  const byPos = new Map<string, PlayerRow[]>();
  for (const p of scored) {
    (byPos.get(p.position) ?? byPos.set(p.position, []).get(p.position)!).push(p);
  }
  for (const group of byPos.values()) {
    group
      .filter((p) => p.proj_points != null)
      .sort((a, b) => (b.proj_points ?? 0) - (a.proj_points ?? 0))
      .forEach((p, i) => {
        p.proj_rank = i + 1;
      });
    group
      .filter((p) => p.prev_points != null)
      .sort((a, b) => (b.prev_points ?? 0) - (a.prev_points ?? 0))
      .forEach((p, i) => {
        p.prev_rank = i + 1;
      });
  }
  return scored;
}
