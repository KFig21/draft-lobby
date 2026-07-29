import {
  AUTO_PICK_SECONDS,
  draftPositionForOverall,
  openSlots,
  overallForDraftPosition,
  roundsForSettings,
  secondsForRound,
  type LobbySettings,
  type Position,
} from '@draft-lobby/shared';
import { supabaseAdmin } from './supabase.js';

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

/** Bots and auto-draft teams get a short clock; everyone else gets the round timer. */
function clockSeconds(team: OnClockTeam | null, settings: LobbySettings, overall: number): number {
  if (team && (team.is_bot || team.auto_draft)) return AUTO_PICK_SECONDS;
  const round = Math.floor((overall - 1) / settings.teamCount) + 1;
  return secondsForRound(round, settings.pickTiers);
}

/** Deadline ISO string for whoever is on the clock at `overall`. */
export async function computeDeadline(
  lobbyId: string,
  settings: LobbySettings,
  overall: number,
): Promise<string> {
  const team = await onClockTeam(lobbyId, settings, overall);
  return new Date(Date.now() + clockSeconds(team, settings, overall) * 1000).toISOString();
}

/** Create bot teams for any draft slot 1..teamCount that has no team yet. Returns how many were added. */
export async function fillOpenSeatsWithBots(
  lobbyId: string,
  settings: LobbySettings,
): Promise<number> {
  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('draft_position')
    .eq('lobby_id', lobbyId);
  const taken = new Set((teams ?? []).map((t) => t.draft_position as number));
  const rows: Record<string, unknown>[] = [];
  for (let pos = 1; pos <= settings.teamCount; pos++) {
    if (taken.has(pos)) continue;
    rows.push({
      lobby_id: lobbyId,
      owner_id: null,
      name: `Bot ${pos}`,
      draft_position: pos,
      is_bot: true,
      auto_draft: true,
    });
  }
  if (rows.length) await supabaseAdmin.from('teams').insert(rows);
  return rows.length;
}

/**
 * Assign a joining user a draft seat: take over an open bot seat if one exists,
 * otherwise claim the lowest free draft position. Returns the seat or a full error.
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

interface PoolPlayer {
  id: string;
  position: Position;
  proj_points: number | null;
  adp: number | null;
}

/**
 * Pick the best available player that fits the team's roster needs:
 * unmet starter needs first (skill/QB before K/DEF), then flex, then best
 * bench value — while never over-drafting kickers or defenses.
 */
export async function choosePlayer(
  lobbyId: string,
  settings: LobbySettings,
  teamId: string,
): Promise<string | null> {
  const [{ data: allPicks }, { data: allPlayers }] = await Promise.all([
    supabaseAdmin.from('picks').select('player_id, team_id').eq('lobby_id', lobbyId),
    supabaseAdmin.from('players').select('id, position, proj_points, adp'),
  ]);

  const drafted = new Set((allPicks ?? []).map((p) => p.player_id as string));
  const players = (allPlayers ?? []) as PoolPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));

  // This team's current roster, counted by position.
  const have: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const pk of allPicks ?? []) {
    if (pk.team_id !== teamId) continue;
    const pos = byId.get(pk.player_id as string)?.position;
    if (pos) have[pos] += 1;
  }

  const available = players
    .filter((p) => !drafted.has(p.id))
    .sort((a, b) => {
      const pd = (b.proj_points ?? 0) - (a.proj_points ?? 0);
      if (pd !== 0) return pd;
      return (a.adp ?? 9999) - (b.adp ?? 9999);
    });
  if (available.length === 0) return null;

  const needs = computeNeeds(settings);
  const dedicatedNeed = (pos: Position) => Math.max(0, needs.base[pos] - have[pos]);
  const skillOverflow = Math.max(
    0,
    have.RB + have.WR + have.TE - (needs.base.RB + needs.base.WR + needs.base.TE),
  );
  const flexRemaining = Math.max(0, needs.flex - skillOverflow);
  const superflexOverflow = Math.max(
    0,
    have.QB + have.RB + have.WR + have.TE -
      (needs.base.QB + needs.base.RB + needs.base.WR + needs.base.TE) -
      Math.min(needs.flex, skillOverflow),
  );
  const superflexRemaining = Math.max(0, needs.superflex - superflexOverflow);

  // 1) Unmet dedicated starter needs — skill/QB before kicker/defense.
  const skillFirst = available.find(
    (p) => p.position !== 'K' && p.position !== 'DEF' && dedicatedNeed(p.position) > 0,
  );
  if (skillFirst) return skillFirst.id;

  // 2) Flex, then superflex.
  if (flexRemaining > 0) {
    const flexPick = available.find((p) => SKILL.includes(p.position));
    if (flexPick) return flexPick.id;
  }
  if (superflexRemaining > 0) {
    const sfPick = available.find((p) => SUPERFLEX_POS.includes(p.position));
    if (sfPick) return sfPick.id;
  }

  // 3) Remaining dedicated needs (kicker/defense).
  const kdNeed = available.find((p) => dedicatedNeed(p.position) > 0);
  if (kdNeed) return kdNeed.id;

  // 4) Bench: best value, but don't stockpile kickers/defenses past the requirement.
  const bench = available.find((p) => {
    if ((p.position === 'K' || p.position === 'DEF') && have[p.position] >= needs.base[p.position]) {
      return false;
    }
    return true;
  });
  return (bench ?? available[0]).id;
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

    if (finalized && finalized.length > 0 && settings.draftMode !== 'MOCK') {
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
    return { ok: true, complete: true };
  }

  // Not complete — advance the clock ONLY if this pick was at the frontier.
  // The next frontier is the next open slot after `overall`, skipping keepers.
  // It can be null when `overall` was near the end but earlier skipped slots
  // remain: the clock then has nowhere to go (end-game), so it goes quiet
  // (pick_deadline = null) while the stragglers pick untimed.
  const nextFrontier = await nextOpenOverall(lobbyId, overall + 1, totalPicks);
  const deadline =
    nextFrontier === null ? null : await computeDeadline(lobbyId, settings, nextFrontier);

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

  // Bots / auto-draft teams are never skipped — they always auto-pick. Humans
  // are skipped when skips are on and they still have skips left under the
  // allowance (null = unlimited); once exhausted, they auto-pick too.
  const botLike = team.is_bot || team.auto_draft;
  const allowance = settings.timeoutAllowance; // number | null
  const hasSkipsLeft = allowance === null || team.timeouts < allowance;
  const doSkip = settings.allowSkips && !botLike && hasSkipsLeft;

  if (doSkip) {
    await skipFrontier(lobbyId, settings, frontier, team);
  } else {
    const playerId = await choosePlayer(lobbyId, settings, team.id);
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
  const deadline =
    nextFrontier === null ? null : await computeDeadline(lobbyId, settings, nextFrontier);

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
