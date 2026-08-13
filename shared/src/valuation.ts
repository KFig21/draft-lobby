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
   * K/DEF get tiny weights because they're streamed week-to-week — their
   * season-projection spread over replacement is NOT draftable value (a top
   * defense is a waiver pickup, not a mid-round pick), so their VOR should read
   * near-nothing. Their board RANK is not set by this weight, though — plain VOR
   * can't sink them far enough (their best is still positive) — it's forced to
   * the last-rounds band by the K/DEF rank floor in computePlayerValues.
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
  const scored = players.map((p) => ({
    id: p.id,
    position: p.position,
    // Points over replacement, then the position's value weight (lifts QBs,
    // tempers the elite-TE premium — see VALUATION_TUNING).
    vor: ((Number.isFinite(p.points) ? p.points : 0) - replacement[p.position]) * (weight[p.position] ?? 1),
    replacement: replacement[p.position],
  }));

  // K/DEF/TE all share a problem plain VOR can't fix: their best players still
  // have a small POSITIVE value, so cutting their weight only lands them where
  // skill VOR crosses zero (~top of the bench), and their long FLAT tail (30
  // similar TEs, 45 kickers) then clusters right there — dozens of them jam into
  // the top 100. A cheat sheet doesn't do that: only a handful of each are
  // draftable; the rest are streamable filler. So keep just the top few of each
  // and sink the rest below the useful deep-skill fliers. Two shapes:
  //   • TE — the elite few are genuine early picks, so they keep their NATURAL
  //     VOR rank; only TE beyond the top `teDraftable` becomes junk (ESPN: ~8
  //     TEs in the top 100, a 30th TE near pick 300).
  //   • K/DEF — streamed and low even at the top, so the top `kdefDraftable`
  //     FLOAT as a block into the last-rounds band (after the league's non-K/DEF
  //     picks), and the rest become junk.
  // Junk (deep TEs + deep K/DEF) sinks to the very bottom, below every startable
  // skill flier. True VOR is still returned (tooltip); only ordering changes,
  // and bots ignore valueRank (they read vor + slot need), so drafting is
  // unaffected.
  const isKDef = (pos: Position) => pos === 'K' || pos === 'DEF';
  const byVor = <T extends { vor: number }>(a: T, b: T) => b.vor - a.vor;
  const junk: typeof scored = [];

  const teDraftable = teamCount; // ~one startable TE per team; deeper TEs are filler
  const teSorted = scored.filter((p) => p.position === 'TE').sort(byVor);
  const keptTE = new Set(teSorted.slice(0, teDraftable).map((p) => p.id));
  junk.push(...teSorted.slice(teDraftable));

  const kdefDraftable = teamCount + 2; // one per team + a couple of streamers
  const topKDef: typeof scored = [];
  for (const pos of ['DEF', 'K'] as const) {
    const ranked = scored.filter((p) => p.position === pos).sort(byVor);
    topKDef.push(...ranked.slice(0, kdefDraftable));
    junk.push(...ranked.slice(kdefDraftable));
  }
  topKDef.sort(byVor);
  junk.sort(byVor);

  // Skill = QB/RB/WR + only the elite (kept) TEs; K/DEF and junk TEs are placed
  // separately above.
  const skill = scored
    .filter(
      (p) => !isKDef(p.position) && (p.position !== 'TE' || keptTE.has(p.id)),
    )
    .sort(byVor);
  const rosterSize = rosterComposition.reduce((n, r) => n + r.count, 0);
  const kdefSlots = rosterComposition
    .filter((r) => isKDef(r.slot as Position))
    .reduce((n, r) => n + r.count, 0);
  const floor = Math.min(skill.length, Math.max(0, (rosterSize - kdefSlots) * teamCount));
  const order = [...skill.slice(0, floor), ...topKDef, ...skill.slice(floor), ...junk];

  const out = new Map<string, PlayerValue>();
  order.forEach((p, i) => {
    out.set(p.id, { vor: round1(p.vor), valueRank: i + 1, replacement: round1(p.replacement) });
  });
  return out;
}
