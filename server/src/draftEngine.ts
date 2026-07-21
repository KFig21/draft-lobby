import {
  AUTO_PICK_SECONDS,
  draftPositionForOverall,
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
}

const SKILL: Position[] = ['RB', 'WR', 'TE'];
const SUPERFLEX_POS: Position[] = ['QB', 'RB', 'WR', 'TE'];

/** Look up the team on the clock for a given overall pick. */
export async function onClockTeam(
  lobbyId: string,
  settings: LobbySettings,
  overall: number,
): Promise<OnClockTeam | null> {
  const pos = draftPositionForOverall(overall, settings.teamCount, settings.draftType);
  const { data } = await supabaseAdmin
    .from('teams')
    .select('id, owner_id, is_bot, auto_draft')
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
        name: teamName ?? `Team ${botSeat.draft_position}`,
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
      name: teamName ?? `Team ${pos}`,
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

  const nextOverall = overall + 1;
  const isComplete = nextOverall > totalPicks;
  const deadline = isComplete ? null : await computeDeadline(lobbyId, settings, nextOverall);

  const { error: advanceError } = await supabaseAdmin
    .from('lobbies')
    .update({
      current_overall: nextOverall,
      status: isComplete ? 'COMPLETE' : 'DRAFTING',
      completed_at: isComplete ? new Date().toISOString() : null,
      pick_deadline: deadline,
    })
    .eq('id', lobbyId);
  if (advanceError) return { ok: false, error: 'db', message: advanceError.message };

  // Post a completion event per human participant (mock drafts stay off feeds).
  if (isComplete && settings.draftMode !== 'MOCK') {
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

  return { ok: true, complete: isComplete };
}

// ── Background engine: auto-pick whenever a pick clock expires ──
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const { data: lobbies } = await supabaseAdmin
      .from('lobbies')
      .select('id, settings, current_overall, pick_deadline')
      .eq('status', 'DRAFTING');
    const now = Date.now();
    for (const lobby of lobbies ?? []) {
      const deadline = lobby.pick_deadline as string | null;
      if (!deadline || now <= new Date(deadline).getTime()) continue;
      await autoPickOne(
        lobby.id as string,
        lobby.settings as LobbySettings,
        lobby.current_overall as number,
      );
    }
  } catch (err) {
    console.error('[draft-engine] tick failed', err);
  } finally {
    running = false;
  }
}

async function autoPickOne(
  lobbyId: string,
  settings: LobbySettings,
  overall: number,
): Promise<void> {
  const team = await onClockTeam(lobbyId, settings, overall);
  if (!team) return;
  const playerId = await choosePlayer(lobbyId, settings, team.id);
  if (!playerId) return;
  await applyPick(lobbyId, settings, overall, team, playerId, true);
}

let started = false;
/** Start the auto-draft loop. Safe to call once at server boot. */
export function startDraftEngine(): void {
  if (started) return;
  started = true;
  setInterval(() => void tick(), 1500);
  console.log('🤖 draft engine running (auto-picks on clock expiry)');
}
