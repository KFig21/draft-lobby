import {
  computeFantasyPoints,
  computePlayerValues,
  type Position,
  type RosterComposition,
  type ScoringRules,
} from '@draft-lobby/shared';
import type { PlayerRow } from './types';

/** Roster + team count needed to value players (VOR). Omit to skip valuation
 * (leaves `value`/`value_rank` untouched — e.g. a preview with no league). */
export interface ValueContext {
  rosterComposition: RosterComposition;
  teamCount: number;
}

/**
 * Recomputes every player's proj/prev points — and their within-position
 * rank — from their raw stat line under `rules`, instead of trusting the
 * flat PPR total baked in at import time. Used everywhere a player pool
 * needs to reflect a specific lobby's (or ruleset picker's) actual scoring
 * format: bot draft picks, lineup sort order, player cards, and the
 * rankings page all run the same players through this.
 *
 * When a `valueContext` (roster + team count) is given, it also attaches each
 * player's league-aware value (points over positional replacement) and overall
 * `value_rank` via the shared VOR model — the format-correct draft ordering
 * that replaces generic ADP on the surfaces you draft from.
 *
 * Falls back to the stored proj_points/prev_points and proj_rank/prev_rank
 * for anyone with no raw stat line (e.g. D/ST — Sleeper keys those stats
 * differently than offensive skill positions, so none is captured today).
 */
export function scorePlayers(
  players: PlayerRow[],
  rules: ScoringRules,
  valueContext?: ValueContext,
): PlayerRow[] {
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

  // League-aware value over replacement, using the just-computed (scoring-aware)
  // projections. Players with no projection sit at value 0 / unranked.
  if (valueContext) {
    const values = computePlayerValues(
      scored.map((p) => ({
        id: p.id,
        position: p.position as Position,
        points: p.proj_points ?? 0,
      })),
      valueContext.rosterComposition,
      valueContext.teamCount,
    );
    for (const p of scored) {
      const v = values.get(p.id);
      p.value = v?.vor ?? null;
      p.value_rank = v?.valueRank ?? null;
    }
  }

  return scored;
}
