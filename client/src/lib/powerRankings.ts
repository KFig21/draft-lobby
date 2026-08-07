import {
  DRAFT_GRADES,
  ROSTER_SLOTS,
  type DraftGrade,
  type LobbySettings,
  type Position,
  type RosterSlot,
} from '@draft-lobby/shared';
import type { PickRow, PlayerRow, TeamRow } from './types';

const FLEX_ELIGIBLE: Position[] = ['RB', 'WR', 'TE'];
const SUPERFLEX_ELIGIBLE: Position[] = ['QB', 'RB', 'WR', 'TE'];

/** Which roster slots a position can start in. Shared by the roster panel and
 * the power-ranking grade so the two never disagree about "optimal lineup." */
export function slotEligible(slot: RosterSlot, pos: Position): boolean {
  if (slot === 'BENCH') return true;
  if (slot === 'FLEX') return FLEX_ELIGIBLE.includes(pos);
  if (slot === 'SUPERFLEX') return SUPERFLEX_ELIGIBLE.includes(pos);
  if (slot === 'IDP') return false; // no IDP positions in the current player pool
  return slot === pos;
}

export interface LineupRow {
  slot: RosterSlot;
  player?: PlayerRow;
  pick?: PickRow;
  /** True when `player` is a best-available placeholder filling a slot the team
   * never drafted for (power-rankings only) — a projected replacement, not a
   * real pick. Placeholders carry no `pick`. */
  placeholder?: boolean;
}

interface PoolEntry {
  pick: PickRow;
  player: PlayerRow;
}

export interface TeamLineup {
  /** Starter slots in fixed ROSTER_SLOTS order — empty slots have no player. */
  starters: LineupRow[];
  bench: LineupRow[];
  /** Sum of projected points across the *filled* starter slots — the metric
   * the power-ranking grade is built on. */
  starterPoints: number;
}

/**
 * Fill a team's starter slots greedily (best projection first), overflow to the
 * bench — the same "optimal lineup" the Roster panel shows. Extracted here so
 * both the Roster panel and the power rankings compute it identically.
 */
export function buildLineup(
  teamId: string,
  picks: PickRow[],
  playersById: Map<string, PlayerRow>,
  settings: LobbySettings,
  options?: {
    /** Fill any empty starter slot with the best available (undrafted) player
     * eligible for it, flagged `placeholder`. Power-rankings use this so a team
     * that skipped a position is projected at replacement level, not zero. */
    fillPlaceholders?: boolean;
  },
): TeamLineup {
  const pool: PoolEntry[] = picks
    .filter((p) => p.team_id === teamId)
    .map((p) => {
      const player = playersById.get(p.player_id);
      return player ? { pick: p, player } : null;
    })
    .filter((e): e is PoolEntry => !!e)
    .sort((a, b) => (b.player.proj_points ?? 0) - (a.player.proj_points ?? 0));

  // Slot -> configured count, so display order follows the fixed ROSTER_SLOTS
  // sequence rather than however this league's rosterComposition is ordered.
  const countBySlot = new Map(settings.rosterComposition.map((rc) => [rc.slot, rc.count]));

  const assigned = new Set<string>();
  const starters: LineupRow[] = [];
  let starterPoints = 0;
  for (const slot of ROSTER_SLOTS) {
    if (slot === 'BENCH') continue;
    const count = countBySlot.get(slot) ?? 0;
    for (let i = 0; i < count; i++) {
      const entry = pool.find(
        (e) => !assigned.has(e.player.id) && slotEligible(slot, e.player.position as Position),
      );
      if (entry) {
        assigned.add(entry.player.id);
        starterPoints += entry.player.proj_points ?? 0;
      }
      starters.push({ slot, player: entry?.player, pick: entry?.pick });
    }
  }

  const benchCount = countBySlot.get('BENCH') ?? 0;
  const leftover = pool.filter((e) => !assigned.has(e.player.id));
  const bench: LineupRow[] = [];
  for (let i = 0; i < Math.max(benchCount, leftover.length); i++) {
    const entry = leftover[i] as PoolEntry | undefined;
    bench.push({ slot: 'BENCH', player: entry?.player, pick: entry?.pick });
  }

  // Best-available placeholders for any starter slot the team never filled. The
  // undrafted pool is global (keyed off every team's picks), so two teams both
  // missing the same position get the SAME placeholder; within one team we take
  // distinct players so two empty slots can't clone one guy.
  if (options?.fillPlaceholders && starters.some((s) => !s.player)) {
    const draftedIds = new Set(picks.map((p) => p.player_id));
    const available = [...playersById.values()]
      .filter((p) => !draftedIds.has(p.id))
      .sort((a, b) => (b.proj_points ?? 0) - (a.proj_points ?? 0));
    const used = new Set<string>();
    for (const row of starters) {
      if (row.player) continue;
      const best = available.find(
        (p) => !used.has(p.id) && slotEligible(row.slot, p.position as Position),
      );
      if (!best) continue;
      used.add(best.id);
      row.player = best;
      row.placeholder = true;
      starterPoints += best.proj_points ?? 0;
    }
  }

  return { starters, bench, starterPoints };
}

/** Map a 0-1 strength (1 = best in league) onto the letter-grade scale.
 * Top total → A+ (index 0), bottom → F (last index), linear between. */
export function gradeFromStrength(t: number): DraftGrade {
  const clamped = Math.min(1, Math.max(0, t));
  const idx = Math.round((1 - clamped) * (DRAFT_GRADES.length - 1));
  return DRAFT_GRADES[idx];
}

export interface PowerRankingRow {
  team: TeamRow;
  starterPoints: number;
  /** 0-1: where this team's starter total sits between the league min and max. */
  strength: number;
  grade: DraftGrade;
  /** 1-based, sorted by starter points (ties broken by input order). */
  rank: number;
}

/**
 * Rank every team by projected starting-lineup points and assign each a letter
 * grade on a league-relative sliding scale: the strongest roster earns A+, the
 * weakest F, everyone else interpolated by point distance between them.
 */
export function computePowerRankings(
  teams: TeamRow[],
  picks: PickRow[],
  playersById: Map<string, PlayerRow>,
  settings: LobbySettings,
): PowerRankingRow[] {
  if (teams.length === 0) return [];
  const withPts = teams.map((team) => ({
    team,
    starterPoints: buildLineup(team.id, picks, playersById, settings, { fillPlaceholders: true })
      .starterPoints,
  }));
  const totals = withPts.map((w) => w.starterPoints);
  const max = Math.max(...totals);
  const min = Math.min(...totals);
  const span = max - min;

  return [...withPts]
    .sort((a, b) => b.starterPoints - a.starterPoints)
    .map((w, i) => {
      const strength = span === 0 ? 1 : (w.starterPoints - min) / span;
      return {
        team: w.team,
        starterPoints: w.starterPoints,
        strength,
        grade: gradeFromStrength(strength),
        rank: i + 1,
      };
    });
}
