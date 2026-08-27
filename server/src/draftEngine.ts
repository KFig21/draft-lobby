import {
  AUTO_PICK_SECONDS,
  computeFantasyPoints,
  computePlayerValues,
  UNLIMITED_PICK_SECONDS,
  draftPositionForOverall,
  hasAnyPositionLimit,
  DEFAULT_PICK_BUFFER_SECONDS,
  isMatchRoundBot,
  isUnlimitedPick,
  openSlots,
  overallForDraftPosition,
  pickAllowedForLimits,
  positionLimitFor,
  roundsForSettings,
  secondsForRound,
  type LobbySettings,
  type Position,
  type StatLine,
} from '@draft-lobby/shared';
import { supabaseAdmin } from './supabase.js';

/** "2m 14s" / "1h 5m 3s" — total draft duration for the completion message. */
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (h > 0 || m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

/** The team currently on the clock, with the flags the engine cares about. */
export interface OnClockTeam {
  id: string;
  owner_id: string | null;
  is_bot: boolean;
  auto_draft: boolean;
  /** Times this team has been skipped — for enforcing `timeoutAllowance`. */
  timeouts: number;
}

const SKILL: Position[] = ['RB', 'WR', 'TE'];
const SUPERFLEX_POS: Position[] = ['QB', 'RB', 'WR', 'TE'];

/**
 * Bot draft-strategy tuning — the one place to reshape how bots draft. Plain
 * constants (no UI/DB wiring); edit and rebuild to retune. Bots value players by
 * league-aware VOR (points over positional replacement, shared/valuation.ts) and
 * then layer roster construction + snake-slot urgency on top; these weights
 * balance those layers. Units are fantasy points (same scale as VOR), except the
 * two dimensionless factors noted below.
 */
export const BOT_STRATEGY = {
  /** Bonus (fantasy pts) for filling a still-EMPTY dedicated starter slot
   * (QB/RB/WR/TE/K/DEF). This is what forces a team to actually complete its
   * starting lineup — draft a QB for its empty QB slot — instead of piling depth
   * at an inflated-value position. Big enough to beat bench depth, small enough
   * that a truly elite BPA (huge VOR) can still be taken over a mediocre
   * slot-filler. Raise it to fill mandatory slots more eagerly. */
  starterSlotBonus: 60,
  /** Bonus for filling an empty FLEX/OP slot — lower than a dedicated slot, since
   * flex/OP can be filled later from an abundant RB/WR/TE pool, whereas a
   * position-locked slot (esp. QB in superflex) can't. */
  flexSlotBonus: 22,
  /** Weight on bench depth — a player who fills no starter slot (e.g. a 3rd QB
   * when the team already starts two) is worth this fraction of their VOR:
   * bye/injury insurance and upside, not starter value. Small, so slot-fillers
   * outrank pure depth; mainly decides late-round bench picks and ties. */
  benchWeight: 0.2,
  /** Bench-depth allowance for "onesie" positions (QB, TE) — how many BACKUPS
   * beyond the team's startable slots at that position still carry bench value.
   * You only ever start one QB/TE (a QB also fills OP in superflex), so a single
   * backup is realistic and a 3rd is nearly unheard of. Once a team is at
   * `startable + this`, further QBs/TEs get NO bench premium, so they lose to
   * RB/WR depth — this is what stops bots stockpiling 3 TEs. Raise to let bots
   * carry more; 0 forbids backups entirely. */
  onesieBenchBackups: 1,
  /** Bench-depth buffer for RB/WR beyond their startable slots (dedicated +
   * FLEX/OP) — these churn through byes/injuries and rotate through FLEX, so a
   * bot keeps real depth here. Generous on purpose; mostly a ceiling that a
   * 15-round draft rarely reaches. */
  skillBenchDepth: 4,
  /** Weight on snake-gap urgency — the value cliff at a startable position that
   * would fall before the team's next pick (dimensionless multiplier). Higher =
   * bots reach harder to beat a positional run; 0 = ignore the draft slot. */
  urgencyWeight: 1,
  /** How many picks before the end a bot will consider a KICKER — it's held out
   * of the pool until `spotsLeft ≤ (empty K slots) + this`. Small = drafted in
   * the very last rounds (matches how managers stream kickers). */
  kickerDeferPicks: 1,
  /** Same, for DEFENSE — a little larger than the kicker so D/ST goes a round or
   * two earlier than K, but still late. */
  defenseDeferPicks: 3,
} as const;

/** A user's profile username, for defaulting a team's name to it. */
export async function usernameOf(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle();
  return (data?.username as string | undefined) ?? null;
}

/**
 * The next overall slot at or after `from` that isn't already filled — skipping
 * keeper slots (and any pick already made). Returns null when every slot through
 * `total` is filled, which means the draft is done. Keepers are pre-placed picks
 * (is_keeper), so "filled" and "keeper" are the same thing to the engine: it
 * just walks past them, and the on-clock team is still derived from the slot.
 */
export async function nextOpenOverall(
  lobbyId: string,
  from: number,
  total: number,
): Promise<number | null> {
  const { data: picks } = await supabaseAdmin
    .from('picks')
    .select('overall')
    .eq('lobby_id', lobbyId);
  const taken = new Set((picks ?? []).map((p) => p.overall as number));
  for (let o = from; o <= total; o++) {
    if (!taken.has(o)) return o;
  }
  return null;
}

/**
 * Recompute every keeper's slot from its team's *current* draft position and
 * round. Keeper picks store an `overall` derived from where the team sat when
 * the keeper was assigned, so reordering the draft afterwards would strand them
 * at the wrong slot — call this after any draft-order change (pre-draft only).
 * Delete-then-reinsert avoids transient unique(lobby_id, overall) collisions
 * while slots shuffle. No-op when there are no keepers.
 */
export async function resyncKeepers(lobbyId: string, settings: LobbySettings): Promise<void> {
  const { data: keepers } = await supabaseAdmin
    .from('picks')
    .select('team_id, player_id, round')
    .eq('lobby_id', lobbyId)
    .eq('is_keeper', true);
  if (!keepers || keepers.length === 0) return;

  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id, draft_position')
    .eq('lobby_id', lobbyId);
  const positionByTeam = new Map(
    (teams ?? []).map((t) => [t.id as string, t.draft_position as number]),
  );

  await supabaseAdmin.from('picks').delete().eq('lobby_id', lobbyId).eq('is_keeper', true);

  const rows = keepers
    .map((k) => {
      const pos = positionByTeam.get(k.team_id as string);
      if (pos == null) return null; // team gone — drop the keeper
      const round = k.round as number;
      return {
        lobby_id: lobbyId,
        overall: overallForDraftPosition(round, pos, settings.teamCount, settings.draftType),
        round,
        team_id: k.team_id as string,
        player_id: k.player_id as string,
        is_keeper: true,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length) await supabaseAdmin.from('picks').insert(rows);
}

/** Look up the team on the clock for a given overall pick. */
export async function onClockTeam(
  lobbyId: string,
  settings: LobbySettings,
  overall: number,
): Promise<OnClockTeam | null> {
  const pos = draftPositionForOverall(overall, settings.teamCount, settings.draftType);
  const { data } = await supabaseAdmin
    .from('teams')
    .select('id, owner_id, is_bot, auto_draft, timeouts')
    .eq('lobby_id', lobbyId)
    .eq('draft_position', pos)
    .maybeSingle();
  return (data as OnClockTeam) ?? null;
}

/**
 * Seconds on the clock for whoever's up. Bots/auto-draft teams get the lobby's
 * bot pick clock, capped at the round's own clock (a bot never gets longer than
 * a human would) — but an unlimited round places no cap, so bots still pick
 * promptly. Humans get the round clock, which may be UNLIMITED (0) = no clock.
 */
export function clockSeconds(team: OnClockTeam | null, settings: LobbySettings, overall: number): number {
  const round = Math.floor((overall - 1) / settings.teamCount) + 1;
  const roundSeconds = secondsForRound(round, settings.pickTiers);
  if (team && (team.is_bot || team.auto_draft)) {
    const bot = settings.botPickSeconds ?? AUTO_PICK_SECONDS;
    // An explicitly unlimited bot clock means bots never auto-pick either (a
    // solo mock where one person drafts for everyone) — it beats the round cap.
    if (isUnlimitedPick(bot)) return UNLIMITED_PICK_SECONDS;
    // "Match round clock": the seat gets exactly what a human would this round
    // (may itself be unlimited) — for stand-in seats a commissioner drafts for.
    if (isMatchRoundBot(bot)) return roundSeconds;
    return isUnlimitedPick(roundSeconds) ? bot : Math.min(bot, roundSeconds);
  }
  return roundSeconds; // may be UNLIMITED (0) — see computeDeadline
}

/** Deadline ISO string for whoever is on the clock at `overall`, or null when
 * the clock is unlimited (an untimed round — the draft waits for the pick).
 * `extraMs` (the between-picks buffer) is added on top of the clock when
 * advancing to a new pick, so the next clock effectively holds full for that
 * long before it starts ticking (the client freezes the display to match). An
 * unlimited round has no deadline, so no buffer either. */
export async function computeDeadline(
  lobbyId: string,
  settings: LobbySettings,
  overall: number,
  extraMs = 0,
): Promise<string | null> {
  const team = await onClockTeam(lobbyId, settings, overall);
  const secs = clockSeconds(team, settings, overall);
  if (secs <= 0) return null;
  return new Date(Date.now() + secs * 1000 + Math.max(0, extraMs)).toISOString();
}

/** A fresh, full clock duration (ms) for whoever is on the clock at `overall`
 * — the paused-state equivalent of computeDeadline, for callers that need to
 * reset the frozen `pick_deadline_remaining_ms` snapshot rather than a live
 * deadline (e.g. a rollback that lands while the draft is paused). */
export async function computeFullClockMs(
  lobbyId: string,
  settings: LobbySettings,
  overall: number,
): Promise<number> {
  const team = await onClockTeam(lobbyId, settings, overall);
  return clockSeconds(team, settings, overall) * 1000;
}

/** Create seats for any draft slot 1..teamCount that has no team yet, of the
 * given kind. Returns how many were added. A 'bot' auto-drafts on the bot
 * clock; a 'standin' is an ownerless seat the commissioner drafts for (see
 * migration 0037) — human-like on the clock. */
async function fillOpenSeats(
  lobbyId: string,
  settings: LobbySettings,
  kind: 'bot' | 'standin',
): Promise<number> {
  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('draft_position')
    .eq('lobby_id', lobbyId);
  const taken = new Set((teams ?? []).map((t) => t.draft_position as number));
  const rows: Record<string, unknown>[] = [];
  for (let pos = 1; pos <= settings.teamCount; pos++) {
    if (taken.has(pos)) continue;
    rows.push(
      kind === 'bot'
        ? {
            lobby_id: lobbyId,
            owner_id: null,
            name: `Bot ${pos}`,
            draft_position: pos,
            is_bot: true,
            auto_draft: true,
          }
        : {
            lobby_id: lobbyId,
            owner_id: null,
            name: `Seat ${pos}`,
            draft_position: pos,
            is_bot: false,
            auto_draft: false,
            is_standin: true,
          },
    );
  }
  if (rows.length) await supabaseAdmin.from('teams').insert(rows);
  return rows.length;
}

/** Fill every empty draft slot with a bot (used at draft start + the commissioner's manual fill). */
export function fillOpenSeatsWithBots(lobbyId: string, settings: LobbySettings): Promise<number> {
  return fillOpenSeats(lobbyId, settings, 'bot');
}

/** Fill every empty draft slot with a stand-in seat (commissioner drafts for them). */
export function fillOpenSeatsWithStandins(lobbyId: string, settings: LobbySettings): Promise<number> {
  return fillOpenSeats(lobbyId, settings, 'standin');
}

/**
 * Assign a joining user a draft seat, in priority order: a seat reserved for
 * them → an open bot seat → a stand-in seat → the lowest free draft position.
 * Returns the seat or a full error.
 */
export async function claimSeat(
  lobbyId: string,
  userId: string,
  teamCount: number,
  teamName?: string,
): Promise<{ ok: true; teamId: string; draftPosition: number } | { ok: false; error: string }> {
  // Default an unnamed team to the joining user's username (falling back to
  // "Team N" only if they somehow have none).
  const defaultName = teamName ?? (await usernameOf(userId)) ?? undefined;

  // First, a seat the commissioner reserved for THIS user — hand it to them as
  // is (it already carries their name + the draft position it was placed in),
  // just clearing the reservation. Beats every other placeholder.
  const { data: reservedSeat } = await supabaseAdmin
    .from('teams')
    .select('id, draft_position')
    .eq('lobby_id', lobbyId)
    .eq('reserved_for_user_id', userId)
    .is('owner_id', null)
    .limit(1)
    .maybeSingle();
  if (reservedSeat) {
    await supabaseAdmin
      .from('teams')
      .update({ owner_id: userId, reserved_for_user_id: null })
      .eq('id', reservedSeat.id);
    return {
      ok: true,
      teamId: reservedSeat.id as string,
      draftPosition: reservedSeat.draft_position as number,
    };
  }

  // Prefer taking over a bot's seat (a human replaces a bot).
  const { data: botSeat } = await supabaseAdmin
    .from('teams')
    .select('id, draft_position')
    .eq('lobby_id', lobbyId)
    .eq('is_bot', true)
    .order('draft_position')
    .limit(1)
    .maybeSingle();
  if (botSeat) {
    await supabaseAdmin
      .from('teams')
      .update({
        owner_id: userId,
        is_bot: false,
        auto_draft: false,
        name: defaultName ?? `Team ${botSeat.draft_position}`,
      })
      .eq('id', botSeat.id);
    return { ok: true, teamId: botSeat.id as string, draftPosition: botSeat.draft_position as number };
  }

  // Next, take over a stand-in seat (a real person filling a placeholder the
  // commissioner set up) — after bots, so generic bot filler is consumed first
  // and the reserved-looking stand-in seats are the last placeholder claimed.
  // Taking it over clears is_standin: it's now a normal owned team.
  const { data: standinSeat } = await supabaseAdmin
    .from('teams')
    .select('id, draft_position')
    .eq('lobby_id', lobbyId)
    .eq('is_standin', true)
    .order('draft_position')
    .limit(1)
    .maybeSingle();
  if (standinSeat) {
    await supabaseAdmin
      .from('teams')
      .update({
        owner_id: userId,
        is_standin: false,
        name: defaultName ?? `Team ${standinSeat.draft_position}`,
      })
      .eq('id', standinSeat.id);
    return {
      ok: true,
      teamId: standinSeat.id as string,
      draftPosition: standinSeat.draft_position as number,
    };
  }

  // Otherwise claim the lowest open draft position.
  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('draft_position')
    .eq('lobby_id', lobbyId);
  const taken = new Set((teams ?? []).map((t) => t.draft_position as number));
  let pos = 1;
  while (taken.has(pos)) pos++;
  if (pos > teamCount) return { ok: false, error: 'Lobby is full' };

  const { data: inserted, error } = await supabaseAdmin
    .from('teams')
    .insert({
      lobby_id: lobbyId,
      owner_id: userId,
      name: defaultName ?? `Team ${pos}`,
      draft_position: pos,
    })
    .select('id')
    .single();
  if (error || !inserted) return { ok: false, error: error?.message ?? 'Could not claim a seat' };
  return { ok: true, teamId: inserted.id as string, draftPosition: pos };
}

interface Needs {
  base: Record<Position, number>;
  flex: number;
  superflex: number;
}

function computeNeeds(settings: LobbySettings): Needs {
  const base: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  let flex = 0;
  let superflex = 0;
  for (const rc of settings.rosterComposition) {
    if (rc.slot === 'BENCH' || rc.slot === 'IDP') continue;
    if (rc.slot === 'FLEX') flex += rc.count;
    else if (rc.slot === 'SUPERFLEX') superflex += rc.count;
    else base[rc.slot as Position] += rc.count;
  }
  return { base, flex, superflex };
}

export interface PoolPlayer {
  id: string;
  position: Position;
  proj_points: number | null;
  proj_stats: StatLine | null;
  adp: number | null;
}

/**
 * The bot's player pool for a given season: projection + ADP from that season's
 * player_seasons rows. Falls back to the flat players.* columns if the query
 * errors (e.g. before migration 0041 lands) so bot autodraft never breaks on
 * deploy/migration ordering. See docs/phase2-player-seasons.md.
 */
export async function loadPlayerPool(season: number): Promise<PoolPlayer[]> {
  const { data, error } = await supabaseAdmin
    .from('player_seasons')
    .select('player_id, proj_points, proj_stats, adp, players!inner ( position )')
    .eq('season', season);
  if (!error && data) {
    return (data as Record<string, unknown>[])
      .map((r) => {
        const ident = (Array.isArray(r.players) ? r.players[0] : r.players) as
          | { position: Position }
          | undefined;
        return {
          id: r.player_id as string,
          position: ident?.position as Position,
          proj_points: r.proj_points as number | null,
          proj_stats: r.proj_stats as StatLine | null,
          adp: r.adp as number | null,
        };
      })
      .filter((p) => !!p.position);
  }
  const { data: flat } = await supabaseAdmin
    .from('players')
    .select('id, position, proj_points, proj_stats, adp');
  return (flat ?? []) as PoolPlayer[];
}

/**
 * Choose a player for an auto-drafting team, the way a savvy manager would:
 * value everyone by league-aware **VOR** (points over positional replacement —
 * shared/valuation.ts, the same number the human's pool shows), then layer
 * roster construction and snake-slot awareness on top:
 *   • a starter-slot (or position-minimum) need adds value over a bench body;
 *   • a "luxury" pick at a position the team doesn't need is discounted;
 *   • **snake-gap urgency** — if a needed position's value would fall off a
 *     cliff before this team picks again (its slot on the board), grab it now.
 * All weights live in BOT_STRATEGY. Never over-drafts kickers/defenses, never
 * violates position limits, and always returns a pick so the draft can't stall.
 */
/** A team's personal queue + its opt-in toggle (migration 0048). */
export interface QueueRow {
  autopick: boolean;
  player_ids: string[];
}

/** Load a team's draft_queues row, or null if it has none. */
export async function loadQueueRow(teamId: string): Promise<QueueRow | null> {
  const { data } = await supabaseAdmin
    .from('draft_queues')
    .select('autopick, player_ids')
    .eq('team_id', teamId)
    .maybeSingle();
  if (!data) return null;
  return {
    autopick: data.autopick as boolean,
    player_ids: (data.player_ids as string[] | null) ?? [],
  };
}

export async function choosePlayer(
  lobbyId: string,
  settings: LobbySettings,
  teamId: string,
  /** Optional preloaded inputs so a caller making many picks in a row (the
   * /simulate loop) can skip the per-pick queries: `pool` (constant for the
   * season), the current `allPicks`, and the team's `draftPosition`. Any omitted
   * field is queried as usual, so a normal single pick just calls this with no
   * opts. */
  opts?: {
    pool?: PoolPlayer[];
    allPicks?: { player_id: string; team_id: string }[];
    draftPosition?: number;
    /** Pre-fetched draft_queues row for this team, so a caller that already read
     * it (resolveExpiry) doesn't make choosePlayer re-query. Omit to have
     * choosePlayer load it itself; pass `null` to explicitly skip the queue. */
    queue?: QueueRow | null;
  },
): Promise<string | null> {
  let allPicks = opts?.allPicks ?? null;
  if (!allPicks) {
    const { data } = await supabaseAdmin
      .from('picks')
      .select('player_id, team_id')
      .eq('lobby_id', lobbyId);
    allPicks = (data as { player_id: string; team_id: string }[] | null) ?? [];
  }
  let draftPosition = opts?.draftPosition;
  if (draftPosition === undefined) {
    const { data: teamRow } = await supabaseAdmin
      .from('teams')
      .select('draft_position')
      .eq('id', teamId)
      .single();
    draftPosition = (teamRow?.draft_position as number | undefined) ?? 1;
  }
  let players = opts?.pool;
  if (!players) {
    const { data: lobbyRow } = await supabaseAdmin
      .from('lobbies')
      .select('season')
      .eq('id', lobbyId)
      .single();
    const season = (lobbyRow?.season as number | undefined) ?? new Date().getUTCFullYear();
    players = await loadPlayerPool(season);
  }

  const drafted = new Set(allPicks.map((p) => p.player_id));
  const byId = new Map(players.map((p) => [p.id, p]));

  // This team's current roster — counts by position, and the actual players (for
  // modelling its starting lineup).
  const have: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  const myPlayers: PoolPlayer[] = [];
  for (const pk of allPicks ?? []) {
    if (pk.team_id !== teamId) continue;
    const pl = byId.get(pk.player_id as string);
    if (!pl) continue;
    have[pl.position] += 1;
    myPlayers.push(pl);
  }

  // Ranked by points under THIS lobby's own scoring rules — not Sleeper's
  // flat PPR total — so a non-PPR/custom league's bots value players the
  // way that league actually scores them. Falls back to the stored
  // proj_points for anyone with no raw stat line (e.g. D/ST).
  const pointsFor = (p: PoolPlayer) =>
    p.proj_stats ? computeFantasyPoints(p.proj_stats, settings.scoring, p.position) : p.proj_points ?? 0;

  const available = players
    .filter((p) => !drafted.has(p.id))
    .sort((a, b) => {
      const pd = pointsFor(b) - pointsFor(a);
      if (pd !== 0) return pd;
      return (a.adp ?? 9999) - (b.adp ?? 9999);
    });
  if (available.length === 0) return null;

  // League-aware value (VOR) over the FULL pool, so replacement level matches
  // the static baseline the human's board is sorted by (shared/valuation.ts).
  const values = computePlayerValues(
    players.map((p) => ({ id: p.id, position: p.position, points: pointsFor(p) })),
    settings.rosterComposition,
    settings.teamCount,
  );
  const vorOf = (p: PoolPlayer) => values.get(p.id)?.vor ?? 0;

  // Per-position roster limits: a bot only considers players it would be allowed
  // to draft (hard max + reserved minimum — the same rule the /pick route
  // enforces for humans), falling back to the full list only if that somehow
  // leaves nothing (e.g. keepers over-committed the roster).
  const limits = settings.positionLimits;
  const needs = computeNeeds(settings);
  const remainingSpots =
    roundsForSettings(settings) - Object.values(have).reduce((a, b) => a + b, 0);

  // "Auto-draft from queue" takes priority over the bot valuation below: if this
  // team opted in and has queued players that are still available AND roster-
  // legal, draft the top one. This is what lets a personal queue drive timeout
  // and auto-draft picks server-side — so it works even if the drafter is
  // offline. Empty/exhausted queue falls straight through to the bot logic.
  const queueRow =
    opts?.queue !== undefined ? opts.queue : await loadQueueRow(teamId);
  if (queueRow?.autopick && queueRow.player_ids.length > 0) {
    const hasLimits = hasAnyPositionLimit(limits);
    for (const id of queueRow.player_ids) {
      if (drafted.has(id)) continue;
      const p = byId.get(id);
      if (!p) continue; // not in the draftable pool (retired/filtered) — skip
      if (hasLimits && !pickAllowedForLimits(limits, have, remainingSpots, p.position).ok)
        continue;
      return id;
    }
  }

  const allowed = hasAnyPositionLimit(limits)
    ? available.filter((p) => pickAllowedForLimits(limits, have, remainingSpots, p.position).ok)
    : available;
  let pool = allowed.length > 0 ? allowed : available;
  // Realistic roster depth per position: a bot won't stockpile a position past
  // what it would actually carry. K/DEF get no backup (streamed); QB/TE are
  // "onesie" positions — one starter (a QB also fills OP) plus a lone backup, so
  // a 3rd is filtered out (this is what stops teams hoarding 3 TEs); RB/WR stay
  // deep for byes/injuries/FLEX. Falls back to the full pool if this would leave
  // nothing (degenerate late-draft states). Allowance also caps the bench
  // premium in scoreOf.
  let flexSlotCount = 0;
  let superflexSlotCount = 0;
  const dedSlotCount: Partial<Record<Position, number>> = {};
  for (const { slot, count } of settings.rosterComposition) {
    if (slot === 'BENCH' || slot === 'IDP') continue;
    if (slot === 'FLEX') flexSlotCount += count;
    else if (slot === 'SUPERFLEX') superflexSlotCount += count;
    else dedSlotCount[slot as Position] = (dedSlotCount[slot as Position] ?? 0) + count;
  }
  const benchAllowanceFor = (pos: Position): number => {
    const ded = dedSlotCount[pos] ?? 0;
    if (pos === 'QB') return ded + superflexSlotCount + BOT_STRATEGY.onesieBenchBackups;
    if (pos === 'TE') return ded + BOT_STRATEGY.onesieBenchBackups;
    if (pos === 'RB' || pos === 'WR')
      return ded + flexSlotCount + superflexSlotCount + BOT_STRATEGY.skillBenchDepth;
    return ded; // K/DEF — no backups (streamed; also deferred to late rounds below)
  };
  const withinDepth = pool.filter((p) => have[p.position] < benchAllowanceFor(p.position));
  if (withinDepth.length > 0) pool = withinDepth;

  // Stream K/DEF late: most managers don't spend a mid-round pick on a
  // low-variance kicker/defense, they grab one in the final rounds. So a K/DEF
  // is only a candidate once the team is within a few picks of having to fill
  // its slot — the kicker held latest, the defense a little earlier. (When the
  // window opens the empty-slot bonus below makes them get taken promptly.)
  const teamPicks = Object.values(have).reduce((a, b) => a + b, 0);
  const spotsLeft = roundsForSettings(settings) - teamPicks; // picks left, incl. this one
  const kOk = spotsLeft <= Math.max(0, needs.base.K - have.K) + BOT_STRATEGY.kickerDeferPicks;
  const defOk = spotsLeft <= Math.max(0, needs.base.DEF - have.DEF) + BOT_STRATEGY.defenseDeferPicks;
  const timed = pool.filter((p) => {
    if (p.position === 'K') return kOk;
    if (p.position === 'DEF') return defOk;
    return true;
  });
  if (timed.length > 0) pool = timed;

  // ── Value to THIS roster: marginal starting-lineup VOR ──
  // A player is worth how much they'd improve this team's optimal starting
  // lineup — their VOR if they'd start, ~0 if they're surplus behind better
  // players at every slot they're eligible for. This is what stops a team that
  // already starts two QBs from spending an early pick on a third: a 3rd QB
  // improves the lineup by nothing, so it loses to anyone still filling a slot.
  // (A 2nd QB, by contrast, fills the OP/superflex slot — a big marginal gain —
  // so teams still grab two QBs promptly.)
  const minDeficit = (pos: Position) =>
    Math.max(0, positionLimitFor(limits, pos).min - have[pos]);

  // Starter slots (bench excluded), each as the set of positions it accepts.
  const starterSlots: Position[][] = [];
  for (const { slot, count } of settings.rosterComposition) {
    if (slot === 'BENCH' || slot === 'IDP') continue;
    const elig: Position[] =
      slot === 'FLEX' ? SKILL : slot === 'SUPERFLEX' ? SUPERFLEX_POS : [slot as Position];
    for (let i = 0; i < count; i++) starterSlots.push(elig);
  }
  // Total VOR of the best starting lineup a set of players can field: place each
  // (best projection first) into the most-constrained slot it's eligible for,
  // then sum the VOR of those who end up starting.
  const lineupVOR = (roster: PoolPlayer[]): number => {
    const sorted = [...roster].sort((a, b) => pointsFor(b) - pointsFor(a));
    const filled = new Array<boolean>(starterSlots.length).fill(false);
    let total = 0;
    for (const p of sorted) {
      let bestIdx = -1;
      let bestBreadth = Infinity;
      for (let i = 0; i < starterSlots.length; i++) {
        if (filled[i] || !starterSlots[i].includes(p.position)) continue;
        if (starterSlots[i].length < bestBreadth) {
          bestBreadth = starterSlots[i].length;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        filled[bestIdx] = true;
        total += vorOf(p);
      }
    }
    return total;
  };
  const baseLineupVOR = lineupVOR(myPlayers);
  const marginalStartVOR = (p: PoolPlayer) => lineupVOR([...myPlayers, p]) - baseLineupVOR;

  // Which starter slots the current roster leaves EMPTY (same greedy fill as
  // lineupVOR). A pick that fills one gets a completion bonus — dedicated
  // (position-locked) slots first, then FLEX/OP — so a team drafts a QB for its
  // open QB slot before stacking a 3rd TE it can't start.
  const emptyStarterSlots = (() => {
    const sorted = [...myPlayers].sort((a, b) => pointsFor(b) - pointsFor(a));
    const filled = new Array<boolean>(starterSlots.length).fill(false);
    for (const p of sorted) {
      let bestIdx = -1;
      let bestBreadth = Infinity;
      for (let i = 0; i < starterSlots.length; i++) {
        if (filled[i] || !starterSlots[i].includes(p.position)) continue;
        if (starterSlots[i].length < bestBreadth) {
          bestBreadth = starterSlots[i].length;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) filled[bestIdx] = true;
    }
    return starterSlots.filter((_, i) => !filled[i]);
  })();
  const slotBonusFor = (pos: Position): number => {
    let bonus = 0;
    for (const slot of emptyStarterSlots) {
      if (!slot.includes(pos)) continue;
      bonus = Math.max(bonus, slot.length === 1 ? BOT_STRATEGY.starterSlotBonus : BOT_STRATEGY.flexSlotBonus);
    }
    return bonus;
  };

  // ── Snake-slot urgency: the value cliff before this team's next pick ──
  // Picks until this team is up again, from its slot on the snake board. At the
  // turn (gap≈1) there's no reason to reach; mid-round (gap large) a value cliff
  // at a startable position is worth grabbing now.
  const teamPicksSoFar = Object.values(have).reduce((a, b) => a + b, 0);
  const curRound = teamPicksSoFar + 1;
  const gap = Math.max(
    1,
    overallForDraftPosition(curRound + 1, draftPosition, settings.teamCount, settings.draftType) -
      overallForDraftPosition(curRound, draftPosition, settings.teamCount, settings.draftType),
  );
  const byVor = [...pool].sort((a, b) => vorOf(b) - vorOf(a));
  // Assume the `gap` best-value players are gone before we pick again (everyone
  // drafts on value); for each position, the best one NOT in that set is what
  // would survive. urgency[pos] = how much value falls off at pos by waiting.
  const goneSoon = new Set(byVor.slice(0, gap).map((p) => p.id));
  const bestSurvivingVor: Partial<Record<Position, number>> = {};
  const bestNowVor: Partial<Record<Position, number>> = {};
  for (const p of byVor) {
    if (bestNowVor[p.position] === undefined) bestNowVor[p.position] = vorOf(p);
    if (!goneSoon.has(p.id) && bestSurvivingVor[p.position] === undefined) {
      bestSurvivingVor[p.position] = vorOf(p);
    }
  }
  const urgencyForPos = (pos: Position): number =>
    Math.max(0, (bestNowVor[pos] ?? 0) - (bestSurvivingVor[pos] ?? 0));

  // ── Score every candidate and take the best ──
  const scoreOf = (p: PoolPlayer): number => {
    const vor = vorOf(p);
    // How much p improves our starting lineup (a surplus 3rd QB ≈ 0). A position
    // still under its league minimum counts like a starter need so bots chase it.
    let starterValue = marginalStartVOR(p);
    if (minDeficit(p.position) > 0) starterValue = Math.max(starterValue, Math.max(0, vor));
    // Completing an empty starter slot (esp. a scarce, position-locked one) beats
    // adding depth — this is what stops a team ending with 0 QB or a 3rd TE.
    const slotBonus = slotBonusFor(p.position);
    // Bench premium only up to a realistic depth at the position — past a lone
    // QB/TE backup a surplus one is dead weight, so it earns nothing here and
    // loses to RB/WR depth (the fix for bots hoarding 3 TEs).
    const bench =
      have[p.position] < benchAllowanceFor(p.position)
        ? BOT_STRATEGY.benchWeight * Math.max(0, vor)
        : 0;
    // Only reach for a positional run at a slot this player would actually start.
    const urgency = starterValue > 0 || slotBonus > 0 ? BOT_STRATEGY.urgencyWeight * urgencyForPos(p.position) : 0;
    return starterValue + slotBonus + bench + urgency;
  };
  let best = pool[0];
  let bestScore = -Infinity;
  for (const p of pool) {
    const s = scoreOf(p);
    if (
      s > bestScore ||
      (s === bestScore &&
        (vorOf(p) > vorOf(best) || (vorOf(p) === vorOf(best) && pointsFor(p) > pointsFor(best))))
    ) {
      best = p;
      bestScore = s;
    }
  }
  return best.id;
}

/**
 * Insert a pick and advance the draft (or finish it). Shared by the human
 * /pick route and the auto-draft engine. Returns whether the draft completed,
 * or an error tag on a losing race for the pick.
 *
 * `overall` may be the clock frontier (the live/timed slot) OR an earlier open
 * slot a skipped team is catching up on. The clock only advances when the pick
 * lands on the current frontier — enforced by a conditional update keyed on
 * `current_overall = overall`, which also makes the pick-vs-skip and
 * pick-vs-pick-at-frontier races correct with no locking: whoever holds the
 * frontier at commit time wins the advance; a behind-frontier pick just fills
 * its slot and leaves the clock alone ("skipped picks don't touch the clock").
 */
export async function applyPick(
  lobbyId: string,
  settings: LobbySettings,
  overall: number,
  team: OnClockTeam,
  playerId: string,
  isAuto: boolean,
): Promise<{ ok: true; complete: boolean } | { ok: false; error: 'taken' | 'db'; message?: string }> {
  const totalPicks = settings.teamCount * roundsForSettings(settings);
  const round = Math.floor((overall - 1) / settings.teamCount) + 1;

  const { error: insertError } = await supabaseAdmin.from('picks').insert({
    lobby_id: lobbyId,
    overall,
    round,
    team_id: team.id,
    player_id: playerId,
    is_auto_pick: isAuto,
  });
  if (insertError) {
    if (insertError.code === '23505') return { ok: false, error: 'taken' };
    return { ok: false, error: 'db', message: insertError.message };
  }

  // Complete iff every slot is now filled — a plain count, since keepers count
  // from the start (total slots = teamCount * rounds). Can't just look "after
  // this pick" anymore: skipped-but-open slots can sit BEHIND the frontier.
  const { count } = await supabaseAdmin
    .from('picks')
    .select('*', { count: 'exact', head: true })
    .eq('lobby_id', lobbyId);
  const isComplete = (count ?? 0) >= totalPicks;

  if (isComplete) {
    // Terminal transition, guarded so two picks completing the last two open
    // slots at once don't both fire completion events. Only the writer that
    // flips the status posts them.
    const { data: finalized, error: finalizeError } = await supabaseAdmin
      .from('lobbies')
      .update({
        current_overall: totalPicks + 1,
        status: 'COMPLETE',
        completed_at: new Date().toISOString(),
        pick_deadline: null,
      })
      .eq('id', lobbyId)
      .neq('status', 'COMPLETE')
      .select('id');
    if (finalizeError) return { ok: false, error: 'db', message: finalizeError.message };

    if (finalized && finalized.length > 0) {
      // "Draft complete" chat message with total elapsed time. Posted by the
      // single writer that flipped the status (the .neq guard above), so it
      // fires exactly once. Chat exists for mock drafts too, so this isn't
      // gated on draftMode the way the notifications below are.
      const { data: lobbyMeta } = await supabaseAdmin
        .from('lobbies')
        .select('started_at, commissioner_id')
        .eq('id', lobbyId)
        .maybeSingle();
      if (lobbyMeta?.commissioner_id) {
        const elapsed =
          lobbyMeta.started_at != null
            ? ` · ${formatDuration(Date.now() - new Date(lobbyMeta.started_at as string).getTime())} elapsed`
            : '';
        await supabaseAdmin.from('chat_messages').insert({
          lobby_id: lobbyId,
          user_id: lobbyMeta.commissioner_id,
          kind: 'SYSTEM',
          body: `🏆 The draft is complete${elapsed}`,
        });
      }

      if (settings.draftMode !== 'MOCK') {
        const { data: members } = await supabaseAdmin
          .from('lobby_members')
          .select('user_id')
          .eq('lobby_id', lobbyId);
        const rows = (members ?? []).map((m) => ({
          actor_id: m.user_id,
          type: 'DRAFT_COMPLETED',
          lobby_id: lobbyId,
          lobby_name: settings.name,
        }));
        if (rows.length) await supabaseAdmin.from('activity_events').insert(rows);
      }
    }
    return { ok: true, complete: true };
  }

  // Not complete — advance the clock ONLY if this pick was at the frontier.
  // The next frontier is the next open slot after `overall`, skipping keepers.
  // It can be null when `overall` was near the end but earlier skipped slots
  // remain: the clock then has nowhere to go (end-game), so it goes quiet
  // (pick_deadline = null) while the stragglers pick untimed.
  const nextFrontier = await nextOpenOverall(lobbyId, overall + 1, totalPicks);
  // Between-picks buffer: hold the next clock full for a beat before it ticks.
  const deadline =
    nextFrontier === null
      ? null
      : await computeDeadline(lobbyId, settings, nextFrontier, (settings.pickBufferSeconds ?? DEFAULT_PICK_BUFFER_SECONDS) * 1000);

  const { error: advanceError } = await supabaseAdmin
    .from('lobbies')
    .update({
      current_overall: nextFrontier ?? totalPicks + 1,
      pick_deadline: deadline,
    })
    .eq('id', lobbyId)
    .eq('current_overall', overall);
  if (advanceError) return { ok: false, error: 'db', message: advanceError.message };
  // 0 rows updated => this pick was behind the frontier (a skipped team
  // catching up) => clock intentionally left untouched. Not an error.

  return { ok: true, complete: false };
}

// ── Background engine: resolve expired clocks (auto-pick or skip) ──
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const { data: lobbies } = await supabaseAdmin
      .from('lobbies')
      .select('id, settings, current_overall, pick_deadline')
      .eq('status', 'DRAFTING');
    for (const lobby of lobbies ?? []) {
      const settings = lobby.settings as LobbySettings;
      const lobbyId = lobby.id as string;
      // Auto-fill any backlog owned by bot/auto_draft teams (skipped slots they
      // now own) — independent of the clock. Drains an auto-drafting team and
      // resolves an abandoned skipped team the commissioner flipped to
      // auto_draft. Cheap no-op unless skips are on (only skips create backlog).
      await drainAutoBacklog(lobbyId, settings, lobby.current_overall as number);
      // Then the live clock: if the frontier's deadline has passed, resolve it
      // (re-reads fresh state, so a pick that landed since is respected).
      await resolveExpiry(lobbyId);
    }
  } catch (err) {
    console.error('[draft-engine] tick failed', err);
  } finally {
    running = false;
  }
}

/** Auto-pick every open slot BEHIND the frontier that belongs to a bot or an
 * auto-draft team. The frontier slot itself is left to the clock (resolveExpiry). */
async function drainAutoBacklog(
  lobbyId: string,
  settings: LobbySettings,
  frontier: number,
): Promise<void> {
  // Backlog only ever forms from a skip, and skips only happen when enabled —
  // so with skips off there is nothing to drain (and we skip the query).
  if (!settings.allowSkips) return;
  const totalPicks = settings.teamCount * roundsForSettings(settings);
  const cap = Math.min(frontier - 1, totalPicks); // strictly behind the frontier
  if (cap < 1) return;

  const { data: picks } = await supabaseAdmin
    .from('picks')
    .select('overall')
    .eq('lobby_id', lobbyId);
  const taken = new Set((picks ?? []).map((p) => p.overall as number));
  const open = openSlots(taken, cap, settings.teamCount, settings.draftType);
  if (open.length === 0) return;

  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id, owner_id, is_bot, auto_draft, draft_position, timeouts')
    .eq('lobby_id', lobbyId);
  const teamByPos = new Map(
    (teams ?? []).map((t) => [t.draft_position as number, t]),
  );

  for (const slot of open) {
    const t = teamByPos.get(slot.position);
    if (!t || !(t.is_bot || t.auto_draft)) continue;
    const playerId = await choosePlayer(lobbyId, settings, t.id as string);
    if (!playerId) continue;
    // overall < frontier, so applyPick fills the slot without touching the clock.
    await applyPick(
      lobbyId,
      settings,
      slot.overall,
      {
        id: t.id as string,
        owner_id: t.owner_id as string | null,
        is_bot: t.is_bot as boolean,
        auto_draft: t.auto_draft as boolean,
        timeouts: t.timeouts as number,
      },
      playerId,
      true,
    );
  }
}

/** The frontier clock has (or may have) expired: auto-pick or skip the team on
 * the clock. Re-reads the lobby so a pick that landed since the tick's snapshot
 * is respected, and so stale frontiers become no-ops. */
async function resolveExpiry(lobbyId: string): Promise<void> {
  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, settings, current_overall, pick_deadline')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby || lobby.status !== 'DRAFTING') return;
  const deadline = lobby.pick_deadline as string | null;
  if (!deadline || Date.now() <= new Date(deadline).getTime()) return; // not expired

  const settings = lobby.settings as LobbySettings;
  const frontier = lobby.current_overall as number;
  const team = await onClockTeam(lobbyId, settings, frontier);
  if (!team) return;

  // A team that opted into "auto-draft from queue" and has a live queue drafts
  // from it on timeout rather than being skipped — the whole point of the
  // feature. (If the queue turns out exhausted, choosePlayer falls back to a bot
  // pick; either way they get a pick, not a skip.)
  const queue = await loadQueueRow(team.id);
  const queueActive = !!queue?.autopick && queue.player_ids.length > 0;

  // Bots / auto-draft teams are never skipped — they always auto-pick. Humans
  // are skipped when skips are on and they still have skips left under the
  // allowance (null = unlimited); once exhausted, they auto-pick too.
  const botLike = team.is_bot || team.auto_draft;
  const allowance = settings.timeoutAllowance; // number | null
  const hasSkipsLeft = allowance === null || team.timeouts < allowance;
  const doSkip = settings.allowSkips && !botLike && !queueActive && hasSkipsLeft;

  if (doSkip) {
    await skipFrontier(lobbyId, settings, frontier, team);
  } else {
    const playerId = await choosePlayer(lobbyId, settings, team.id, { queue });
    if (!playerId) return;
    await applyPick(lobbyId, settings, frontier, team, playerId, true);
  }
}

/** Skip the team on the clock: leave their slot open (they can still pick it),
 * advance the frontier to the next open slot, and count the timeout. */
async function skipFrontier(
  lobbyId: string,
  settings: LobbySettings,
  frontier: number,
  team: OnClockTeam,
): Promise<void> {
  const totalPicks = settings.teamCount * roundsForSettings(settings);
  const nextFrontier = await nextOpenOverall(lobbyId, frontier + 1, totalPicks);
  // Same between-picks buffer as a normal pick. Picking isn't blocked during it
  // (clock only frozen), so the skipped team and the new on-clock team can both
  // pick right away.
  const deadline =
    nextFrontier === null
      ? null
      : await computeDeadline(lobbyId, settings, nextFrontier, (settings.pickBufferSeconds ?? DEFAULT_PICK_BUFFER_SECONDS) * 1000);

  // Conditional on the frontier still sitting here AND still being expired —
  // if a pick landed at the frontier in the meantime it moved current_overall,
  // and this skip becomes a no-op.
  const { data: advanced } = await supabaseAdmin
    .from('lobbies')
    .update({ current_overall: nextFrontier ?? totalPicks + 1, pick_deadline: deadline })
    .eq('id', lobbyId)
    .eq('current_overall', frontier)
    .lte('pick_deadline', new Date().toISOString())
    .select('id');
  if (!advanced || advanced.length === 0) return; // someone else moved the clock

  // Count the timeout (ticks are serialized and picks never touch `timeouts`,
  // so reading team.timeouts and writing +1 here is race-free). When the count
  // reaches the allowance, flip the team to auto-draft: from here on they
  // auto-pick at the frontier AND drainAutoBacklog fills the holes their skips
  // left — the "timeout cap auto-picks" rule. Null allowance = never flips.
  const newTimeouts = team.timeouts + 1;
  const allowance = settings.timeoutAllowance;
  const exhausted = allowance !== null && newTimeouts >= allowance;
  await supabaseAdmin
    .from('teams')
    .update(exhausted ? { timeouts: newTimeouts, auto_draft: true } : { timeouts: newTimeouts })
    .eq('id', team.id);

  // Post a system chat message so everyone sees the skip (and the skipped
  // owner knows they can still pick). Attributed to the skipped owner as the
  // FK, but rendered as a plain system line, not their chat. Bots never skip,
  // so a skipped team always has an owner.
  if (team.owner_id) {
    const { data: teamRow } = await supabaseAdmin
      .from('teams')
      .select('name')
      .eq('id', team.id)
      .maybeSingle();
    const name = (teamRow?.name as string | undefined) ?? 'A team';
    const note = exhausted ? ' — now auto-drafting' : ' — still on the board';
    await supabaseAdmin.from('chat_messages').insert({
      lobby_id: lobbyId,
      user_id: team.owner_id,
      kind: 'SYSTEM',
      body: `⏭️ ${name} was skipped${note}`,
    });
  }
}

// ── Scheduled opens: when a lobby's scheduledStart passes, auto-open the room
// (SETUP → STAGING) so people can take their seats and lock keepers ahead of
// time. The commissioner still hits Start manually. Runs on a slower cadence
// than the pick tick — a scheduled start only needs coarse granularity.
async function openScheduled(): Promise<void> {
  try {
    const { data: lobbies } = await supabaseAdmin
      .from('lobbies')
      .select('id, settings')
      .eq('status', 'SETUP');
    const now = Date.now();
    for (const lobby of lobbies ?? []) {
      const at = (lobby.settings as LobbySettings).scheduledStart;
      if (!at || now < new Date(at).getTime()) continue;
      // The extra status filter guards against a race with a manual /open.
      await supabaseAdmin
        .from('lobbies')
        .update({ status: 'STAGING' })
        .eq('id', lobby.id as string)
        .eq('status', 'SETUP');
    }
  } catch (err) {
    console.error('[draft-engine] openScheduled failed', err);
  }
}

let started = false;
/** Start the auto-draft loop. Safe to call once at server boot. */
export function startDraftEngine(): void {
  if (started) return;
  started = true;
  setInterval(() => void tick(), 1500);
  setInterval(() => void openScheduled(), 10_000);
  console.log('🤖 draft engine running (auto-picks + scheduled room opens)');
}
