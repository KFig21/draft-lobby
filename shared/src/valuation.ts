import { POSITIONS, SLOT_ELIGIBILITY, type Position } from './positions.js';
import type { RosterComposition } from './lobby.js';

/**
 * Value-Based Drafting (VOR / "value over replacement") for a league's own
 * roster + scoring format.
 *
 * Raw projected points overrate high-volume positions and can't see scarcity —
 * the reason a generic 1-QB ADP buries QBs in a SUPERFLEX league even though a
 * startable QB is gold there. VOR fixes that: a player's value is their
 * projected points MINUS the points of a *replacement-level* player at their
 * position, where "replacement level" comes from how many of that position the
 * whole league actually starts (dedicated slots + FLEX + how the OP/superflex
 * slot pulls QBs into "startable"). Change the roster or the scoring and every
 * value shifts automatically — no format-specific data needed.
 *
 * The same function runs on the client (to order the draft pool) and the server
 * (bot decisions), so the two never disagree about what a player is worth.
 */

/** One player reduced to what valuation needs: a league-scored projection. */
export interface PlayerValueInput {
  id: string;
  position: Position;
  /** Projected points under THIS league's scoring (caller computes via
   * computeFantasyPoints); non-finite/NaN entries are ignored. */
  points: number;
}

export interface PlayerValue {
  /** Projected points over replacement level. Can be negative (deep bench). */
  vor: number;
  /** 1-based overall rank by vor (1 = best value in this league). */
  valueRank: number;
  /** The replacement-level points for this player's position (for display). */
  replacement: number;
}

/**
 * Tuning knobs for the valuation model — the one place to reshape how scarcity
 * is priced. Plain constants (no UI/DB wiring); edit and rebuild to retune.
 */
export const VALUATION_TUNING = {
  /**
   * How deep "replacement level" sits, as a multiplier on league starter
   * demand. 1.0 = pure starters (the classic VBD baseline). Raising it (e.g.
   * 1.5) measures replacement further down the bench — flattens value spreads
   * and pulls scarce positions back toward the pack; lowering it sharpens them.
   */
  replacementDepth: 1.0,
  /**
   * Per-position multiplier on VOR — the "positional adjustment" every real
   * ranking system applies to reconcile mechanical VOR with how a position is
   * actually drafted. Mechanical VOR structurally *under*-values QBs in
   * superflex (their replacement, ~QB24, is still a high scorer, so elite-QB
   * value gets compressed) and *over*-values elite TEs (the steep TE cliff
   * inflates their VOR past what anyone pays). >1 lifts a position, <1 lowers
   * it. Tune against a trusted cheat sheet for the league's format.
   *
   * K/DEF weights are near-zero only so their tooltip VOR reads as ~nothing
   * (they're streamed — season spread over replacement isn't draftable value).
   * Their board RANK is not set by this weight at all: computePlayerValues puts
   * every K/DEF in the late-round pool and ranks it by projection points.
   */
  positionValueWeight: { QB: 1.2, RB: 1, WR: 1, TE: 0.45, K: 0.05, DEF: 0.1 } as Record<Position, number>,
} as const;

const FLEX_ELIGIBLE = SLOT_ELIGIBILITY.FLEX; // RB/WR/TE
const SUPERFLEX_ELIGIBLE = SLOT_ELIGIBILITY.SUPERFLEX; // QB/RB/WR/TE

function zeroByPosition(): Record<Position, number> {
  return { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The replacement-level points for each position: the projection of the best
 * player at that position who does NOT make a league-wide starting lineup.
 *
 * Slots are filled greedily in global points-desc order, each player absorbed
 * into a still-open slot they're eligible for, in priority dedicated → FLEX →
 * SUPERFLEX (a QB only lands in OP once every dedicated QB slot is spoken for —
 * which is exactly what deepens QB replacement, and lifts elite-QB value, in a
 * superflex league). The first player of a position that can't be absorbed is
 * that position's replacement level.
 */
export function replacementByPosition(
  players: PlayerValueInput[],
  rosterComposition: RosterComposition,
  teamCount: number,
): Record<Position, number> {
  const depth = VALUATION_TUNING.replacementDepth;
  const dedicated = zeroByPosition();
  let flexDemand = 0;
  let superflexDemand = 0;
  for (const { slot, count } of rosterComposition) {
    if (slot === 'BENCH' || slot === 'IDP') continue;
    const n = Math.round(count * teamCount * depth);
    if (slot === 'FLEX') flexDemand += n;
    else if (slot === 'SUPERFLEX') superflexDemand += n;
    else if ((POSITIONS as readonly string[]).includes(slot)) dedicated[slot as Position] += n;
  }

  const sorted = players
    .filter((p) => Number.isFinite(p.points))
    .sort((a, b) => b.points - a.points);

  const remDedicated = { ...dedicated };
  let remFlex = flexDemand;
  let remSuperflex = superflexDemand;
  const replacement: Partial<Record<Position, number>> = {};
  // Track each position's lowest seen projection as a fallback replacement for
  // positions whose pool never runs past league demand (e.g. a tight K/DEF pool).
  const lowestSeen: Partial<Record<Position, number>> = {};

  for (const p of sorted) {
    lowestSeen[p.position] = p.points;
    if (replacement[p.position] !== undefined) continue; // already below replacement

    let absorbed = false;
    if (remDedicated[p.position] > 0) {
      remDedicated[p.position] -= 1;
      absorbed = true;
    } else if (remFlex > 0 && FLEX_ELIGIBLE.includes(p.position)) {
      remFlex -= 1;
      absorbed = true;
    } else if (remSuperflex > 0 && SUPERFLEX_ELIGIBLE.includes(p.position)) {
      remSuperflex -= 1;
      absorbed = true;
    }
    // First non-startable of this position → its replacement level.
    if (!absorbed) replacement[p.position] = p.points;
  }

  const out = zeroByPosition();
  for (const pos of POSITIONS) {
    out[pos] = replacement[pos] ?? lowestSeen[pos] ?? 0;
  }
  return out;
}

/**
 * VOR + overall value rank for every player, given the league's roster and team
 * count. Returned as a Map keyed by player id.
 */
export function computePlayerValues(
  players: PlayerValueInput[],
  rosterComposition: RosterComposition,
  teamCount: number,
): Map<string, PlayerValue> {
  const replacement = replacementByPosition(players, rosterComposition, teamCount);
  const weight = VALUATION_TUNING.positionValueWeight;
  const scored = players.map((p) => {
    const points = Number.isFinite(p.points) ? p.points : 0;
    return {
      id: p.id,
      position: p.position,
      points,
      // Points over replacement, then the position's value weight (lifts QBs,
      // tempers the elite-TE premium — see VALUATION_TUNING).
      vor: (points - replacement[p.position]) * (weight[p.position] ?? 1),
      replacement: replacement[p.position],
    };
  });

  // Rank skill (RB/WR/TE/K/DEF) by league-scored PROJECTION POINTS — that's what
  // a cheat sheet reads, and points interleave positions so the flat tail (30
  // near-identical TEs, 45 kickers) SPREADS through the bench at its own point
  // level instead of clustering. (Per-position VOR was the wrong ranking tool:
  // it normalizes each position separately, so those flat tails collapse to ~0
  // and pile up, and any startable/bench cutoff drops a cliff between a marginal
  // TE10 and an ~identical TE11.)
  //
  // QBs are the exception: off the skill scoring scale (~1.5–2× a flex body),
  // and their VALUE is exactly where the roster format lives — superflex floods
  // the OP slot with QBs, so QB replacement runs deep and elite-QB VOR explodes,
  // while 1-QB keeps it shallow. Points can't express that (a deflated elite-QB
  // point total still can't clear an elite RB's), but VOR can. So place each QB
  // at its VOR RANK among the whole pool — a superflex QB1 lands atop the board,
  // a 1-QB QB1 sinks toward the mid rounds — and fill every non-QB slot in
  // points order. One list: format-correct QBs threaded through smooth skill.
  // VOR is still returned for the tooltip; bots read vor + slot need (not
  // valueRank), so drafting is unaffected.
  const byVorRank = [...scored].sort((a, b) => b.vor - a.vor);
  const skillByPoints = scored
    .filter((p) => p.position !== 'QB')
    .sort((a, b) => b.points - a.points || b.vor - a.vor);
  const order: typeof scored = [];
  let si = 0;
  for (const slot of byVorRank) {
    order.push(slot.position === 'QB' ? slot : skillByPoints[si++]);
  }

  const out = new Map<string, PlayerValue>();
  order.forEach((p, i) => {
    out.set(p.id, { vor: round1(p.vor), valueRank: i + 1, replacement: round1(p.replacement) });
  });
  return out;
}
