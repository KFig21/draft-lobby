import { POSITIONS, type Position } from '@draft-lobby/shared';
import type { PickRow, PlayerRow } from './types';

/**
 * One team's drafted-player count for every (position, bye week) pair it
 * actually owns, keyed `${position}:${byeWeek}`. Computed once per render
 * and looked up O(1) per player elsewhere — cheaper than re-scanning `picks`
 * for every row in a ~200-card player pool.
 */
export function byeClashLookup(
  picks: PickRow[],
  playersById: Map<string, PlayerRow>,
  teamId: string | null,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!teamId) return map;
  for (const p of picks) {
    if (p.team_id !== teamId) continue;
    const player = playersById.get(p.player_id);
    if (!player || player.bye_week == null) continue;
    const key = `${player.position}:${player.bye_week}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/** Every position where the team already has 1+ player sharing `byeWeek` —
 * the per-position breakdown shown in the "bye week clashes" section. */
export function byeClashCountsForWeek(
  byeWeek: number | null,
  lookup: Map<string, number>,
): Partial<Record<Position, number>> {
  const counts: Partial<Record<Position, number>> = {};
  if (byeWeek == null) return counts;
  for (const pos of POSITIONS) {
    const count = lookup.get(`${pos}:${byeWeek}`);
    if (count) counts[pos] = count;
  }
  return counts;
}
