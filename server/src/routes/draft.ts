import { Router, type Response } from 'express';
import {
  CHAT_LOCK_MS,
  DRAFT_RESULTS_LOCK_MS,
  RANDOM_BOT_TEAM_NAMES,
  ROLLBACK_LOCK_MS,
  assignKeeperSchema,
  bulkAssignKeepersSchema,
  chatReactSchema,
  containsSlur,
  crownVoteSchema,
  draftPositionForOverall,
  extractMentionedUsernames,
  gradeReactionSchema,
  gradeTeamSchema,
  hasAnyPositionLimit,
  inviteToLobbySchema,
  makePickSchema,
  offerKeeperOptionsSchema,
  openSlots,
  overallForDraftPosition,
  pickAllowedForLimits,
  pickCommentSchema,
  postChatSchema,
  renameTeamSchema,
  rollbackToSchema,
  roundsForSettings,
  selectKeeperOptionSchema,
  setAutoDraftSchema,
  setDraftOrderSchema,
  setQueueAutopickSchema,
  setQueueSchema,
  setKeeperCountSchema,
  spectateSettingsSchema,
  updateKeeperOptionSchema,
  type LobbySettings,
  type Position,
} from '@draft-lobby/shared';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  applyPick,
  choosePlayer,
  claimSeat,
  computeDeadline,
  computeFullClockMs,
  fillOpenSeatsWithBots,
  fillOpenSeatsWithStandins,
  loadPlayerPool,
  nextOpenOverall,
  onClockTeam,
  resyncKeepers,
} from '../draftEngine.js';
import { supabaseAdmin } from '../supabase.js';

export const draftRouter = Router();
draftRouter.use(requireAuth);

type Role = 'COMMISSIONER' | 'SUB_COMMISSIONER' | 'MEMBER';

async function getRole(lobbyId: string, userId: string): Promise<Role | null> {
  const { data } = await supabaseAdmin
    .from('lobby_members')
    .select('role')
    .eq('lobby_id', lobbyId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.role as Role) ?? null;
}

function isCommish(role: Role | null): boolean {
  return role === 'COMMISSIONER' || role === 'SUB_COMMISSIONER';
}

/** Whether a non-member spectator is allowed to write via a given toggle
 * (`spectate_react` for reactions/comments, `spectate_grade` for grading).
 * Both implicitly require `spectate_public` per the DB check constraints. */
async function spectatorCan(
  lobbyId: string,
  flag: 'spectate_react' | 'spectate_grade',
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('lobbies')
    .select(flag)
    .eq('id', lobbyId)
    .maybeSingle();
  return !!(data as Record<string, boolean> | null)?.[flag];
}

async function usernameOf(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle();
  return data?.username ?? 'Someone';
}

/** "2m 14s" / "1h 5m 3s" — for the "paused for …" note on the resume message. */
function formatPauseDuration(ms: number): string {
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

/** Post a system message (pause/resume/rollback/etc.) into the lobby chat. */
async function postSystemMessage(lobbyId: string, userId: string, body: string): Promise<void> {
  await supabaseAdmin
    .from('chat_messages')
    .insert({ lobby_id: lobbyId, user_id: userId, kind: 'SYSTEM', body });
}

/** Resolve a LOBBY_INVITE notification so it stops showing Join/Decline once handled. */
async function resolveInviteNotification(
  lobbyId: string,
  userId: string,
  resolvedStatus: 'ACCEPTED' | 'DECLINED',
): Promise<void> {
  await supabaseAdmin
    .from('notifications')
    .update({ status: resolvedStatus })
    .eq('user_id', userId)
    .eq('lobby_id', lobbyId)
    .eq('type', 'LOBBY_INVITE')
    .is('status', null);
}

type GroupableNotification =
  | 'PICK_REACTION'
  | 'MESSAGE_REACTION'
  | 'PICK_REPLY'
  | 'MENTION'
  | 'DRAFT_GRADE';

/**
 * Create a notification, or — if the recipient already has an unread one for
 * this exact type+target — bump its count instead. Keeps a pick/comment that
 * gets a burst of reactions from flooding the feed with one row each.
 */
async function notifyGrouped(params: {
  userId: string;
  actorId: string;
  type: GroupableNotification;
  lobbyId: string;
  lobbyName: string;
  targetType: 'PICK' | 'MESSAGE' | 'TEAM';
  targetId: string;
  snippet: string;
  /** Which emoji triggered this — PICK_REACTION/MESSAGE_REACTION only. */
  emoji?: string;
  /** The letter grade — DRAFT_GRADE only. */
  grade?: string;
}): Promise<void> {
  if (params.userId === params.actorId) return; // never notify yourself
  const { data: existing } = await supabaseAdmin
    .from('notifications')
    .select('id, count')
    .eq('user_id', params.userId)
    .eq('type', params.type)
    .eq('target_id', params.targetId)
    .eq('read', false)
    .maybeSingle();
  if (existing) {
    await supabaseAdmin
      .from('notifications')
      .update({
        actor_id: params.actorId,
        count: (existing.count as number) + 1,
        snippet: params.snippet,
        emoji: params.emoji,
        grade: params.grade,
        created_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    return;
  }
  await supabaseAdmin.from('notifications').insert({
    user_id: params.userId,
    actor_id: params.actorId,
    type: params.type,
    lobby_id: params.lobbyId,
    lobby_name: params.lobbyName,
    target_type: params.targetType,
    target_id: params.targetId,
    snippet: params.snippet,
    emoji: params.emoji,
    grade: params.grade,
  });
}

/** Notify whoever owns a reacted-to pick or message (skips bot-owned picks). */
async function notifyReactionTarget(
  lobbyId: string,
  targetType: 'MESSAGE' | 'PICK',
  targetId: string,
  actorId: string,
  emoji: string,
): Promise<void> {
  const { data: lobbyRow } = await supabaseAdmin
    .from('lobbies')
    .select('name')
    .eq('id', lobbyId)
    .maybeSingle();
  const lobbyName = (lobbyRow?.name as string | undefined) ?? 'a draft';

  if (targetType === 'PICK') {
    const { data: pick } = await supabaseAdmin
      .from('picks')
      .select('team_id, player_id')
      .eq('id', targetId)
      .maybeSingle();
    if (!pick) return;
    const [{ data: team }, { data: player }] = await Promise.all([
      supabaseAdmin.from('teams').select('owner_id').eq('id', pick.team_id).maybeSingle(),
      supabaseAdmin.from('players').select('name').eq('id', pick.player_id).maybeSingle(),
    ]);
    if (!team?.owner_id) return;
    await notifyGrouped({
      userId: team.owner_id as string,
      actorId,
      type: 'PICK_REACTION',
      lobbyId,
      lobbyName,
      targetType: 'PICK',
      targetId,
      snippet: (player?.name as string | undefined) ?? 'a player',
      emoji,
    });
    return;
  }

  const { data: message } = await supabaseAdmin
    .from('chat_messages')
    .select('user_id, kind, body')
    .eq('id', targetId)
    .maybeSingle();
  if (!message || message.kind !== 'USER') return;
  const body = message.body as string;
  await notifyGrouped({
    userId: message.user_id as string,
    actorId,
    type: 'MESSAGE_REACTION',
    lobbyId,
    lobbyName,
    targetType: 'MESSAGE',
    targetId,
    snippet: body.length > 80 ? `${body.slice(0, 80)}…` : body,
    emoji,
  });
}

/** Notify every lobby member @mentioned in a chat message or pick comment. */
async function notifyMentions(
  lobbyId: string,
  actorId: string,
  messageId: string,
  body: string,
): Promise<void> {
  const { data: memberRows } = await supabaseAdmin
    .from('lobby_members')
    .select('user_id, profiles ( username )')
    .eq('lobby_id', lobbyId);
  const memberList = (memberRows ?? []) as unknown as {
    user_id: string;
    profiles: { username: string } | null;
  }[];
  const usernames = memberList
    .map((m) => m.profiles?.username)
    .filter((u): u is string => !!u);
  const mentioned = new Set(
    extractMentionedUsernames(body, usernames).map((u) => u.toLowerCase()),
  );
  if (mentioned.size === 0) return;

  const { data: lobbyRow } = await supabaseAdmin
    .from('lobbies')
    .select('name')
    .eq('id', lobbyId)
    .maybeSingle();
  const lobbyName = (lobbyRow?.name as string | undefined) ?? 'a draft';
  const snippet = body.length > 140 ? `${body.slice(0, 140)}…` : body;

  for (const m of memberList) {
    const uname = m.profiles?.username;
    if (!uname || !mentioned.has(uname.toLowerCase()) || m.user_id === actorId) continue;
    await notifyGrouped({
      userId: m.user_id,
      actorId,
      type: 'MENTION',
      lobbyId,
      lobbyName,
      targetType: 'MESSAGE',
      targetId: messageId,
      snippet,
    });
  }
}

/** When the draft ended (completed_at, falling back to the last pick), or null if not complete. */
async function draftEndedAt(lobbyId: string): Promise<string | null> {
  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, completed_at')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby || lobby.status !== 'COMPLETE') return null;
  if (lobby.completed_at) return lobby.completed_at as string;
  const { data: lastPick } = await supabaseAdmin
    .from('picks')
    .select('picked_at')
    .eq('lobby_id', lobbyId)
    .order('picked_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (lastPick?.picked_at as string | undefined) ?? null;
}

/** Commissioner-configured chat/reactions lock delay for this lobby (ms
 * after the draft ends) — falls back to CHAT_LOCK_MS for older lobbies. */
async function chatLockMsFor(lobbyId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('lobbies')
    .select('chat_lock_ms')
    .eq('id', lobbyId)
    .maybeSingle();
  return (data?.chat_lock_ms as number | null) ?? CHAT_LOCK_MS;
}

/** Chat locks chatLockMsFor() after the draft ends. */
async function isChatLocked(lobbyId: string): Promise<boolean> {
  const endedAt = await draftEndedAt(lobbyId);
  if (!endedAt) return false;
  const lockMs = await chatLockMsFor(lobbyId);
  return Date.now() > new Date(endedAt).getTime() + lockMs;
}

/** Reactions share the same commissioner-configured lock delay as chat. */
const isReactionsLocked = isChatLocked;

/** The rollback feature disappears ROLLBACK_LOCK_MS after the draft ends. */
async function isRollbackLocked(lobbyId: string): Promise<boolean> {
  const endedAt = await draftEndedAt(lobbyId);
  return !!endedAt && Date.now() > new Date(endedAt).getTime() + ROLLBACK_LOCK_MS;
}

/** The crown vote / peer grading close DRAFT_RESULTS_LOCK_MS after the draft ends. */
async function isResultsLocked(lobbyId: string): Promise<boolean> {
  const endedAt = await draftEndedAt(lobbyId);
  return !!endedAt && Date.now() > new Date(endedAt).getTime() + DRAFT_RESULTS_LOCK_MS;
}

/** POST /api/lobbies/:id/start — commissioner kicks off the draft. */
draftRouter.post('/:id/start', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can start the draft' });
    return;
  }

  const { data: lobby, error } = await supabaseAdmin
    .from('lobbies')
    .select('id, status, settings')
    .eq('id', lobbyId)
    .single();
  if (error || !lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status === 'DRAFTING') {
    res.json({ ok: true, alreadyStarted: true });
    return;
  }
  if (lobby.status === 'COMPLETE') {
    res.status(409).json({ error: 'Draft is already complete' });
    return;
  }

  const settings = lobby.settings as LobbySettings;

  // A reserved seat whose user never joined is a no-show: fall it back to a bot
  // (keeps the seat + its draft position, but now it auto-drafts). Must run
  // before fillOpenSeatsWithBots so the count is right — though these seats
  // already hold a position, so the fill only touches genuinely empty slots.
  await supabaseAdmin
    .from('teams')
    .update({ is_bot: true, auto_draft: true, reserved_for_user_id: null })
    .eq('lobby_id', lobbyId)
    .is('owner_id', null)
    .not('reserved_for_user_id', 'is', null);

  // Fill any empty seats with bots so every draft slot has a drafter.
  await fillOpenSeatsWithBots(lobbyId, settings);

  // Start on the first slot that isn't already a keeper — keepers were placed
  // as picks during staging, so the clock opens on the first genuinely open pick.
  const total = settings.teamCount * roundsForSettings(settings);
  const firstOverall = await nextOpenOverall(lobbyId, 1, total);
  if (firstOverall === null) {
    // Degenerate: every slot is a keeper. There's nothing to draft.
    await supabaseAdmin
      .from('lobbies')
      .update({
        status: 'COMPLETE',
        completed_at: new Date().toISOString(),
        current_overall: total + 1,
        pick_deadline: null,
      })
      .eq('id', lobbyId);
    res.json({ ok: true, complete: true });
    return;
  }

  // Deadline honours whoever lands on the clock first (a bot gets a short one).
  const deadline = await computeDeadline(lobbyId, settings, firstOverall);

  const { error: updateError } = await supabaseAdmin
    .from('lobbies')
    .update({
      status: 'DRAFTING',
      current_overall: firstOverall,
      pick_deadline: deadline,
      started_at: new Date().toISOString(),
    })
    .eq('id', lobbyId);
  if (updateError) {
    res.status(500).json({ error: updateError.message });
    return;
  }
  await postSystemMessage(lobbyId, userId, '🏁 The draft has started');
  res.json({ ok: true });
});

/**
 * POST /api/lobbies/:id/open — commissioner opens the draft room without
 * starting the draft. Moves SETUP/SCHEDULED → STAGING: everyone can enter the
 * board, take their seats, and (once keepers ship) lock their keepers, but no
 * pick clock runs until the commissioner hits Start (→ /start).
 */
draftRouter.post('/:id/open', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can open the draft room' });
    return;
  }

  const { data: lobby, error } = await supabaseAdmin
    .from('lobbies')
    .select('id, status')
    .eq('id', lobbyId)
    .single();
  if (error || !lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  // Idempotent once the room is already open (or the draft is live/paused).
  if (lobby.status === 'STAGING' || lobby.status === 'DRAFTING' || lobby.status === 'PAUSED') {
    res.json({ ok: true, alreadyOpen: true });
    return;
  }
  if (lobby.status === 'COMPLETE') {
    res.status(409).json({ error: 'Draft is already complete' });
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from('lobbies')
    .update({ status: 'STAGING' })
    .eq('id', lobbyId);
  if (updateError) {
    res.status(500).json({ error: updateError.message });
    return;
  }
  res.json({ ok: true });
});

/**
 * POST /api/lobbies/:id/keepers — commissioner assigns a keeper. The player is
 * placed as an is_keeper pick at the team's slot in `round`, so it shows on the
 * board pre-draft and the engine skips that slot once the draft starts. Only
 * before the draft goes live.
 */
draftRouter.post('/:id/keepers', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can set keepers' });
    return;
  }
  const parsed = assignKeeperSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { teamId, playerId, round } = parsed.data;

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('id, status, settings')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status === 'DRAFTING' || lobby.status === 'PAUSED' || lobby.status === 'COMPLETE') {
    res.status(409).json({ error: 'Keepers can only be set before the draft starts' });
    return;
  }

  const settings = lobby.settings as LobbySettings;
  const rounds = roundsForSettings(settings);
  if (round > rounds) {
    res.status(400).json({ error: `This draft only has ${rounds} rounds` });
    return;
  }

  const [{ data: team }, { data: player }] = await Promise.all([
    supabaseAdmin
      .from('teams')
      .select('id, name, draft_position')
      .eq('id', teamId)
      .eq('lobby_id', lobbyId)
      .maybeSingle(),
    supabaseAdmin.from('players').select('id, name').eq('id', playerId).maybeSingle(),
  ]);
  if (!team) {
    res.status(404).json({ error: 'Team not found in this lobby' });
    return;
  }
  if (!player) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }

  const overall = overallForDraftPosition(
    round,
    team.draft_position as number,
    settings.teamCount,
    settings.draftType,
  );

  // Guard both unique constraints up front for friendly errors (the insert
  // would otherwise 23505): the round slot must be free, and the player unkept.
  const [{ data: slotTaken }, { data: playerTaken }] = await Promise.all([
    supabaseAdmin
      .from('picks')
      .select('id')
      .eq('lobby_id', lobbyId)
      .eq('overall', overall)
      .maybeSingle(),
    supabaseAdmin
      .from('picks')
      .select('id')
      .eq('lobby_id', lobbyId)
      .eq('player_id', playerId)
      .maybeSingle(),
  ]);
  if (slotTaken) {
    res.status(409).json({ error: `${team.name} already has a keeper in round ${round}` });
    return;
  }
  if (playerTaken) {
    res.status(409).json({ error: `${player.name} is already kept by another team` });
    return;
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('picks')
    .insert({
      lobby_id: lobbyId,
      overall,
      round,
      team_id: teamId,
      player_id: playerId,
      is_keeper: true,
    })
    .select('id')
    .single();
  if (insertError || !inserted) {
    res.status(500).json({ error: insertError?.message ?? 'Could not save keeper' });
    return;
  }

  await postSystemMessage(
    lobbyId,
    userId,
    `🔒 ${team.name} keeps ${player.name} (Round ${round})`,
  );
  res.json({ ok: true, pickId: inserted.id, overall });
});

/**
 * POST /api/lobbies/:id/keepers/bulk — commissioner imports many keepers at
 * once (from a pasted/uploaded roster the client already resolved to team +
 * player ids). Skips rows that collide (slot already kept, player already kept,
 * unknown team, round beyond the draft) and reports how many landed vs skipped.
 */
draftRouter.post('/:id/keepers/bulk', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can set keepers' });
    return;
  }
  const parsed = bulkAssignKeepersSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, settings')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status === 'DRAFTING' || lobby.status === 'PAUSED' || lobby.status === 'COMPLETE') {
    res.status(409).json({ error: 'Keepers can only be set before the draft starts' });
    return;
  }

  const settings = lobby.settings as LobbySettings;
  const rounds = roundsForSettings(settings);

  const [{ data: teams }, { data: existingPicks }] = await Promise.all([
    supabaseAdmin.from('teams').select('id, draft_position').eq('lobby_id', lobbyId),
    supabaseAdmin.from('picks').select('overall, player_id').eq('lobby_id', lobbyId),
  ]);
  const positionByTeam = new Map(
    (teams ?? []).map((t) => [t.id as string, t.draft_position as number]),
  );
  const takenOveralls = new Set((existingPicks ?? []).map((p) => p.overall as number));
  const takenPlayers = new Set((existingPicks ?? []).map((p) => p.player_id as string));

  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const k of parsed.data.keepers) {
    const pos = positionByTeam.get(k.teamId);
    if (pos == null || k.round > rounds) {
      skipped++;
      continue;
    }
    const overall = overallForDraftPosition(k.round, pos, settings.teamCount, settings.draftType);
    // Reject collisions against both existing keepers and earlier rows in this
    // same batch (dedupe as we go).
    if (takenOveralls.has(overall) || takenPlayers.has(k.playerId)) {
      skipped++;
      continue;
    }
    takenOveralls.add(overall);
    takenPlayers.add(k.playerId);
    rows.push({
      lobby_id: lobbyId,
      overall,
      round: k.round,
      team_id: k.teamId,
      player_id: k.playerId,
      is_keeper: true,
    });
  }

  if (rows.length) {
    const { error } = await supabaseAdmin.from('picks').insert(rows);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    await postSystemMessage(
      lobbyId,
      userId,
      `🔒 ${rows.length} keeper${rows.length === 1 ? '' : 's'} imported`,
    );
  }

  res.json({ ok: true, added: rows.length, skipped });
});

/**
 * POST /api/lobbies/:id/keeper-options/bulk — commissioner offers each team a
 * pool of candidate keepers (owner-choice flow). Upserts on (lobby, team,
 * player) so re-importing the same roster doesn't duplicate rows.
 */
draftRouter.post('/:id/keeper-options/bulk', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can offer keepers' });
    return;
  }
  const parsed = offerKeeperOptionsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, settings')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status === 'DRAFTING' || lobby.status === 'PAUSED' || lobby.status === 'COMPLETE') {
    res.status(409).json({ error: 'Keepers can only be set before the draft starts' });
    return;
  }

  const rounds = roundsForSettings(lobby.settings as LobbySettings);
  const [{ data: teams }, { data: existingOptions }, { data: existingPicks }] = await Promise.all([
    supabaseAdmin.from('teams').select('id').eq('lobby_id', lobbyId),
    supabaseAdmin.from('keeper_options').select('team_id, player_id').eq('lobby_id', lobbyId),
    supabaseAdmin.from('picks').select('player_id').eq('lobby_id', lobbyId),
  ]);
  const teamIds = new Set((teams ?? []).map((t) => t.id as string));
  // A player can only be a candidate for ONE team at a time — offering them to
  // a second team would let both teams "keep" the same player. Also block
  // anyone already a real pick (drafted, or a commissioner-assigned keeper).
  const takenByOtherTeam = new Map((existingOptions ?? []).map((o) => [o.player_id as string, o.team_id as string]));
  const alreadyPicked = new Set((existingPicks ?? []).map((p) => p.player_id as string));

  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  const seenInBatch = new Set<string>();
  for (const o of parsed.data.options) {
    const heldBy = takenByOtherTeam.get(o.playerId);
    const dup = (heldBy && heldBy !== o.teamId) || seenInBatch.has(o.playerId);
    if (!teamIds.has(o.teamId) || o.round > rounds || alreadyPicked.has(o.playerId) || dup) {
      skipped++;
      continue;
    }
    seenInBatch.add(o.playerId);
    rows.push({ lobby_id: lobbyId, team_id: o.teamId, player_id: o.playerId, round: o.round });
  }

  if (rows.length) {
    const { error } = await supabaseAdmin
      .from('keeper_options')
      .upsert(rows, { onConflict: 'lobby_id,team_id,player_id' });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
  }
  res.json({ ok: true, added: rows.length, skipped });
});

/** DELETE /api/lobbies/:id/keeper-options/:optionId — commissioner drops a candidate. */
draftRouter.delete('/:id/keeper-options/:optionId', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can remove keeper options' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status === 'DRAFTING' || lobby.status === 'PAUSED' || lobby.status === 'COMPLETE') {
    res.status(409).json({ error: 'Keepers can only be changed before the draft starts' });
    return;
  }

  const { data: option } = await supabaseAdmin
    .from('keeper_options')
    .select('id, player_id, selected')
    .eq('id', req.params.optionId)
    .eq('lobby_id', lobbyId)
    .maybeSingle();
  if (!option) {
    res.status(404).json({ error: 'Keeper option not found' });
    return;
  }

  // A selected candidate has a materialized pick — clear it too.
  if (option.selected) {
    await supabaseAdmin
      .from('picks')
      .delete()
      .eq('lobby_id', lobbyId)
      .eq('player_id', option.player_id)
      .eq('is_keeper', true);
  }
  await supabaseAdmin.from('keeper_options').delete().eq('id', option.id);
  res.json({ ok: true });
});

/**
 * POST /api/lobbies/:id/keeper-options/clear — commissioner clears every keeper
 * option, optionally scoped to one team via { teamId }. Selected candidates have
 * a materialized keeper pick, so those picks are dropped first.
 */
draftRouter.post('/:id/keeper-options/clear', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can clear keeper options' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status === 'DRAFTING' || lobby.status === 'PAUSED' || lobby.status === 'COMPLETE') {
    res.status(409).json({ error: 'Keepers can only be changed before the draft starts' });
    return;
  }

  const teamId = typeof req.body?.teamId === 'string' ? req.body.teamId : null;

  // Selected candidates → drop their materialized keeper picks first.
  let selQuery = supabaseAdmin
    .from('keeper_options')
    .select('player_id')
    .eq('lobby_id', lobbyId)
    .eq('selected', true);
  if (teamId) selQuery = selQuery.eq('team_id', teamId);
  const { data: selected } = await selQuery;
  const playerIds = (selected ?? []).map((o) => o.player_id);
  if (playerIds.length > 0) {
    let pickDel = supabaseAdmin
      .from('picks')
      .delete()
      .eq('lobby_id', lobbyId)
      .eq('is_keeper', true)
      .in('player_id', playerIds);
    if (teamId) pickDel = pickDel.eq('team_id', teamId);
    await pickDel;
  }

  let del = supabaseAdmin.from('keeper_options').delete().eq('lobby_id', lobbyId);
  if (teamId) del = del.eq('team_id', teamId);
  const { error } = await del;
  if (error) {
    res.status(500).json({ error: 'Could not clear keeper options' });
    return;
  }
  res.json({ ok: true });
});

/**
 * POST /api/lobbies/:id/keeper-options/:optionId/select — the team's owner (or
 * the commissioner) keeps/unkeeps a candidate. Keeping materializes an
 * is_keeper pick at the team's slot for that round; unkeeping removes it.
 */
draftRouter.post(
  '/:id/keeper-options/:optionId/select',
  async (req: AuthedRequest, res: Response) => {
    const lobbyId = req.params.id;
    const userId = req.user!.id;

    const parsed = selectKeeperOptionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { selected } = parsed.data;

    const { data: lobby } = await supabaseAdmin
      .from('lobbies')
      .select('status, settings, keepers_locked')
      .eq('id', lobbyId)
      .maybeSingle();
    if (!lobby) {
      res.status(404).json({ error: 'Lobby not found' });
      return;
    }
    if (lobby.status === 'DRAFTING' || lobby.status === 'PAUSED' || lobby.status === 'COMPLETE') {
      res.status(409).json({ error: 'Keepers are locked once the draft starts' });
      return;
    }

    const { data: option } = await supabaseAdmin
      .from('keeper_options')
      .select('id, team_id, player_id, round, selected')
      .eq('id', req.params.optionId)
      .eq('lobby_id', lobbyId)
      .maybeSingle();
    if (!option) {
      res.status(404).json({ error: 'Keeper option not found' });
      return;
    }

    const { data: team } = await supabaseAdmin
      .from('teams')
      .select('id, owner_id, draft_position, keeper_count, name')
      .eq('id', option.team_id)
      .maybeSingle();
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    const role = await getRole(lobbyId, userId);
    if (team.owner_id !== userId && !isCommish(role)) {
      res.status(403).json({ error: 'You can only choose keepers for your own team' });
      return;
    }
    // The commissioner can still adjust picks on anyone's behalf even while
    // locked — same "everyone but the commissioner" model as team_names_locked.
    if (lobby.keepers_locked && !isCommish(role)) {
      res.status(409).json({
        error: 'The commissioner has locked keeper selections — ask them to make changes',
      });
      return;
    }

    const settings = lobby.settings as LobbySettings;

    if (selected) {
      if (option.selected) {
        res.json({ ok: true }); // already selected — idempotent
        return;
      }
      // Enforce the team's keeper allowance.
      const { data: chosen } = await supabaseAdmin
        .from('keeper_options')
        .select('id')
        .eq('lobby_id', lobbyId)
        .eq('team_id', team.id)
        .eq('selected', true);
      if ((chosen?.length ?? 0) >= (team.keeper_count as number)) {
        res.status(409).json({
          error: `${team.name} can only keep ${team.keeper_count} player${
            team.keeper_count === 1 ? '' : 's'
          }`,
        });
        return;
      }

      const overall = overallForDraftPosition(
        option.round as number,
        team.draft_position as number,
        settings.teamCount,
        settings.draftType,
      );
      const [{ data: slotTaken }, { data: playerTaken }] = await Promise.all([
        supabaseAdmin
          .from('picks')
          .select('id')
          .eq('lobby_id', lobbyId)
          .eq('overall', overall)
          .maybeSingle(),
        supabaseAdmin
          .from('picks')
          .select('id')
          .eq('lobby_id', lobbyId)
          .eq('player_id', option.player_id)
          .maybeSingle(),
      ]);
      if (slotTaken) {
        res.status(409).json({ error: `${team.name} already has a keeper in round ${option.round}` });
        return;
      }
      // A different team beat this one to the same player (shouldn't happen
      // given the offer-time cross-team guard, but stay consistent rather than
      // silently flagging this option "selected" with no matching board pick).
      if (playerTaken) {
        res.status(409).json({ error: 'That player is already kept by another team' });
        return;
      }
      const { error } = await supabaseAdmin.from('picks').insert({
        lobby_id: lobbyId,
        overall,
        round: option.round,
        team_id: team.id,
        player_id: option.player_id,
        is_keeper: true,
      });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      await supabaseAdmin.from('keeper_options').update({ selected: true }).eq('id', option.id);
      res.json({ ok: true });
      return;
    }

    // Deselecting: drop the materialized pick and clear the flag.
    await supabaseAdmin
      .from('picks')
      .delete()
      .eq('lobby_id', lobbyId)
      .eq('player_id', option.player_id)
      .eq('is_keeper', true);
    await supabaseAdmin.from('keeper_options').update({ selected: false }).eq('id', option.id);
    res.json({ ok: true });
  },
);

/**
 * PATCH /api/lobbies/:id/keeper-options/:optionId — commissioner edits a
 * candidate's round and/or swaps which player it refers to (fixing an import
 * mismatch without deleting and re-adding). If it's already kept, its board
 * pick moves accordingly (rejecting the change if the new slot/player collide).
 */
draftRouter.patch(
  '/:id/keeper-options/:optionId',
  async (req: AuthedRequest, res: Response) => {
    const lobbyId = req.params.id;
    const role = await getRole(lobbyId, req.user!.id);
    if (!isCommish(role)) {
      res.status(403).json({ error: 'Only the commissioner can edit keeper options' });
      return;
    }
    const parsed = updateKeeperOptionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (parsed.data.round === undefined && parsed.data.playerId === undefined) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }

    const { data: lobby } = await supabaseAdmin
      .from('lobbies')
      .select('status, settings')
      .eq('id', lobbyId)
      .maybeSingle();
    if (!lobby) {
      res.status(404).json({ error: 'Lobby not found' });
      return;
    }
    if (lobby.status === 'DRAFTING' || lobby.status === 'PAUSED' || lobby.status === 'COMPLETE') {
      res.status(409).json({ error: 'Keepers can only be changed before the draft starts' });
      return;
    }
    const settings = lobby.settings as LobbySettings;

    const { data: option } = await supabaseAdmin
      .from('keeper_options')
      .select('id, team_id, player_id, round, selected')
      .eq('id', req.params.optionId)
      .eq('lobby_id', lobbyId)
      .maybeSingle();
    if (!option) {
      res.status(404).json({ error: 'Keeper option not found' });
      return;
    }

    const round = parsed.data.round ?? (option.round as number);
    const playerId = parsed.data.playerId ?? (option.player_id as string);
    if (round > roundsForSettings(settings)) {
      res.status(400).json({ error: `This draft only has ${roundsForSettings(settings)} rounds` });
      return;
    }

    if (playerId !== option.player_id) {
      const [{ data: elsewhere }, { data: dupInTeam }, { data: picked }] = await Promise.all([
        supabaseAdmin
          .from('keeper_options')
          .select('id')
          .eq('lobby_id', lobbyId)
          .eq('player_id', playerId)
          .neq('team_id', option.team_id)
          .maybeSingle(),
        supabaseAdmin
          .from('keeper_options')
          .select('id')
          .eq('lobby_id', lobbyId)
          .eq('team_id', option.team_id)
          .eq('player_id', playerId)
          .neq('id', option.id)
          .maybeSingle(),
        supabaseAdmin
          .from('picks')
          .select('id')
          .eq('lobby_id', lobbyId)
          .eq('player_id', playerId)
          .maybeSingle(),
      ]);
      if (elsewhere || picked) {
        res.status(409).json({ error: 'That player is already a candidate elsewhere' });
        return;
      }
      if (dupInTeam) {
        res.status(409).json({ error: 'This team already has that player as a candidate' });
        return;
      }
    }

    // A kept candidate has a board pick — move it to the new round/player.
    if (option.selected) {
      const { data: team } = await supabaseAdmin
        .from('teams')
        .select('draft_position, name')
        .eq('id', option.team_id)
        .maybeSingle();
      if (team) {
        const overall = overallForDraftPosition(
          round,
          team.draft_position as number,
          settings.teamCount,
          settings.draftType,
        );
        const { data: clash } = await supabaseAdmin
          .from('picks')
          .select('id, player_id')
          .eq('lobby_id', lobbyId)
          .eq('overall', overall)
          .maybeSingle();
        if (clash && clash.player_id !== option.player_id) {
          res.status(409).json({ error: `${team.name} already has a keeper in round ${round}` });
          return;
        }
        await supabaseAdmin
          .from('picks')
          .delete()
          .eq('lobby_id', lobbyId)
          .eq('player_id', option.player_id)
          .eq('is_keeper', true);
        await supabaseAdmin.from('picks').insert({
          lobby_id: lobbyId,
          overall,
          round,
          team_id: option.team_id,
          player_id: playerId,
          is_keeper: true,
        });
      }
    }

    await supabaseAdmin
      .from('keeper_options')
      .update({ round, player_id: playerId })
      .eq('id', option.id);
    res.json({ ok: true });
  },
);

/** PATCH /api/lobbies/:id/keeper-count — commissioner sets a team's keeper allowance. */
draftRouter.patch('/:id/keeper-count', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can set keeper counts' });
    return;
  }
  const parsed = setKeeperCountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { teamId, count } = parsed.data;

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status === 'DRAFTING' || lobby.status === 'PAUSED' || lobby.status === 'COMPLETE') {
    res.status(409).json({ error: 'Keeper counts are locked once the draft starts' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('teams')
    .update({ keeper_count: count })
    .eq('id', teamId)
    .eq('lobby_id', lobbyId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});

/**
 * DELETE /api/lobbies/:id/keepers/:pickId — commissioner removes a keeper.
 * Only before the draft goes live, and only rows that are actually keepers.
 */
draftRouter.delete('/:id/keepers/:pickId', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const pickId = req.params.pickId;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can remove keepers' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status === 'DRAFTING' || lobby.status === 'PAUSED' || lobby.status === 'COMPLETE') {
    res.status(409).json({ error: 'Keepers can only be changed before the draft starts' });
    return;
  }

  const { data: pick } = await supabaseAdmin
    .from('picks')
    .select('id, is_keeper')
    .eq('id', pickId)
    .eq('lobby_id', lobbyId)
    .maybeSingle();
  if (!pick || !pick.is_keeper) {
    res.status(404).json({ error: 'Keeper not found' });
    return;
  }

  const { error } = await supabaseAdmin.from('picks').delete().eq('id', pickId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});

/** DELETE /api/lobbies/:id — commissioner cancels/deletes a lobby before the draft starts. */
draftRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('commissioner_id, status')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.commissioner_id !== userId) {
    res.status(403).json({ error: 'Only the commissioner can delete this lobby' });
    return;
  }
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED' && lobby.status !== 'STAGING') {
    res.status(409).json({ error: 'You can only delete a lobby before the draft starts' });
    return;
  }

  // Child rows (teams, members, picks, chat, invites, activity, notifications) cascade.
  const { error } = await supabaseAdmin.from('lobbies').delete().eq('id', lobbyId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});

/**
 * POST /api/lobbies/:id/pick — make a pick. With skips on, more than one team
 * can be pickable at once (the team on the clock + any skipped teams still
 * owing a pick), so we resolve which team is picking and which slot they fill
 * rather than assuming the single frontier:
 *   - `onBehalfOfTeamId` set  → commissioner picks for that specific team.
 *   - otherwise               → the caller's own team if it has an open slot;
 *                               failing that, a commissioner falls back to the
 *                               team on the clock (the classic "commish makes
 *                               the pick" behavior).
 * The team fills its EARLIEST open slot by default (oldest obligation first);
 * a picker owing more than one slot (the snake turn) may name a specific
 * `overall` instead. If that slot is the frontier, applyPick advances the
 * clock; if it's an earlier skipped slot, the clock is left untouched.
 */
draftRouter.post('/:id/pick', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const parsed = makePickSchema.safeParse({ ...req.body, lobbyId });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { playerId, onBehalfOfTeamId, overall: requestedOverall } = parsed.data;

  const { data: lobby, error } = await supabaseAdmin
    .from('lobbies')
    .select('id, status, settings, current_overall')
    .eq('id', lobbyId)
    .single();
  if (error || !lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  const role = await getRole(lobbyId, userId);
  const commish = isCommish(role);
  // DRAFTING is the normal picking state. The commissioner may ALSO pick while
  // PAUSED — filling the current pick (or a skipped slot) by hand without
  // unfreezing the clock. Every other status, and every non-commish caller while
  // paused, is blocked.
  if (lobby.status !== 'DRAFTING' && !(lobby.status === 'PAUSED' && commish)) {
    res.status(409).json({ error: 'Draft is not active' });
    return;
  }
  const paused = lobby.status === 'PAUSED';

  const settings = lobby.settings as LobbySettings;
  const frontier = lobby.current_overall as number;
  const totalPicks = settings.teamCount * roundsForSettings(settings);
  // In end-game the frontier parks past the last slot (totalPicks + 1); clamp
  // so openSlots never walks past the board.
  const frontierClamped = Math.min(frontier, totalPicks);

  const { data: teamRows } = await supabaseAdmin
    .from('teams')
    .select('id, owner_id, is_bot, auto_draft, draft_position, timeouts')
    .eq('lobby_id', lobbyId);
  const teams = teamRows ?? [];
  const { data: pickRows } = await supabaseAdmin
    .from('picks')
    .select('overall')
    .eq('lobby_id', lobbyId);
  const taken = new Set((pickRows ?? []).map((p) => p.overall as number));

  // Every open, pickable slot right now (ascending). First match for a given
  // draft position is that team's earliest obligation.
  const allOpen = openSlots(taken, frontierClamped, settings.teamCount, settings.draftType);
  const earliestOpenFor = (draftPosition: number): number | null =>
    allOpen.find((s) => s.position === draftPosition)?.overall ?? null;

  // Resolve which team is picking.
  let target: (typeof teams)[number] | undefined;
  if (onBehalfOfTeamId) {
    if (!commish) {
      res.status(403).json({ error: 'Only the commissioner can pick for another team' });
      return;
    }
    target = teams.find((t) => t.id === onBehalfOfTeamId);
    if (!target) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
  } else {
    const own = teams.find((t) => t.owner_id === userId);
    if (own && earliestOpenFor(own.draft_position) !== null) {
      target = own; // picking for yourself
    } else if (commish && frontier <= totalPicks) {
      // Fall back to the team on the clock (frontier).
      const pos = draftPositionForOverall(frontier, settings.teamCount, settings.draftType);
      target = teams.find((t) => t.draft_position === pos);
    }
  }
  if (!target) {
    res.status(403).json({ error: "It's not your turn" });
    return;
  }

  let targetOverall = earliestOpenFor(target.draft_position);
  if (targetOverall === null) {
    res.status(409).json({ error: 'That team has no open pick' });
    return;
  }
  // The picker chose a specific slot (only meaningful when they owe more than
  // one): honour it if it's genuinely one of this team's open slots, otherwise
  // fall through to the earliest. Guards against a stale client requesting a
  // slot that's since been filled or that belongs to a different team.
  if (requestedOverall != null && requestedOverall !== targetOverall) {
    const ownsIt = allOpen.some(
      (s) => s.overall === requestedOverall && s.position === target.draft_position,
    );
    if (!ownsIt) {
      res.status(409).json({ error: 'That pick slot is no longer open' });
      return;
    }
    targetOverall = requestedOverall;
  }
  const round = Math.floor((targetOverall - 1) / settings.teamCount) + 1;

  // Per-position roster limits (hard max + reserved min). Only queried when the
  // league actually sets any limit, so unlimited leagues pay nothing here. The
  // bot/auto path enforces the same rule inside choosePlayer.
  if (hasAnyPositionLimit(settings.positionLimits)) {
    const { data: teamPickRows } = await supabaseAdmin
      .from('picks')
      .select('player_id')
      .eq('lobby_id', lobbyId)
      .eq('team_id', target.id);
    const teamPlayerIds = (teamPickRows ?? []).map((r) => r.player_id as string);
    const { data: posRows } = await supabaseAdmin
      .from('players')
      .select('id, position')
      .in('id', [...teamPlayerIds, playerId]);
    const posById = new Map((posRows ?? []).map((p) => [p.id as string, p.position as Position]));

    const have: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
    for (const pid of teamPlayerIds) {
      const pos = posById.get(pid);
      if (pos) have[pos] += 1;
    }
    const remainingSpots = roundsForSettings(settings) - teamPlayerIds.length;
    const pickedPos = posById.get(playerId);
    if (pickedPos) {
      const verdict = pickAllowedForLimits(settings.positionLimits, have, remainingSpots, pickedPos);
      if (!verdict.ok) {
        const label = (p: Position) => (p === 'DEF' ? 'D/ST' : p);
        let message: string;
        if (verdict.reason === 'max') {
          message = `Roster limit reached for ${label(pickedPos)}`;
        } else {
          const needed = (['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as Position[])
            .filter((p) => have[p] < (settings.positionLimits?.[p]?.min ?? 0))
            .map(label);
          message =
            needed.length > 0
              ? `Draft ${needed.join('/')} to meet your position minimums first`
              : 'Save your remaining spots for your position minimums';
        }
        res.status(409).json({ error: message });
        return;
      }
    }
  }

  const result = await applyPick(
    lobbyId,
    settings,
    targetOverall,
    {
      id: target.id,
      owner_id: target.owner_id,
      is_bot: target.is_bot,
      auto_draft: target.auto_draft,
      timeouts: target.timeouts,
    },
    playerId,
    false,
  );
  if (!result.ok) {
    if (result.error === 'taken') {
      res.status(409).json({ error: 'That player is already drafted' });
    } else {
      res.status(500).json({ error: result.message ?? 'Pick failed' });
    }
    return;
  }

  // A commissioner filling the CURRENT (frontier) pick while paused advanced the
  // clock inside applyPick, which set a fresh live pick_deadline — but the draft
  // is still frozen. Re-freeze: clear the live deadline and store a FRESH FULL
  // clock for the team now on the clock as the frozen remainder, so the paused
  // board shows their new pick clock (not "-") and resume gives them a whole
  // turn — rather than clearing the remainder to null, which showed "-" and let
  // resume fall back to the previous team's leftover time. A behind-frontier
  // (skipped) pick never moves the clock, so there's nothing to fix; a pick that
  // completed the draft already went COMPLETE. Guarded on status so a concurrent
  // resume isn't clobbered.
  if (paused && !result.complete && targetOverall === frontier) {
    const { data: after } = await supabaseAdmin
      .from('lobbies')
      .select('current_overall')
      .eq('id', lobbyId)
      .single();
    const fullMs = after
      ? await computeFullClockMs(lobbyId, settings, after.current_overall as number)
      : 0;
    await supabaseAdmin
      .from('lobbies')
      .update({ pick_deadline: null, pick_deadline_remaining_ms: fullMs > 0 ? fullMs : null })
      .eq('id', lobbyId)
      .eq('status', 'PAUSED');
  }

  res.json({ ok: true, overall: targetOverall, round, complete: result.complete });
});

// Lobbies whose in-flight fast-forward loop has been asked to stop. The client
// aborts its fetch when "Skip bots" is toggled off, but that connection close is
// unreliable (a proxy can swallow it), so the loop couldn't tell and kept
// burning bots until the draft was paused. The toggle-off now also hits the
// cancel endpoint below, which drops the lobby id here; the loop checks this set
// each iteration and stops promptly. Single-process, in-memory — same as the
// rate limiter.
const fastForwardCancels = new Set<string>();

/** POST /api/lobbies/:id/fast-forward — commissioner burns through consecutive bot picks. */
draftRouter.post('/:id/fast-forward', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can fast-forward' });
    return;
  }

  // A stale cancel from a previous run must not kill this fresh one.
  fastForwardCancels.delete(lobbyId);

  // Best-effort secondary stop signal (see fastForwardCancels for the reliable
  // one): the client aborts this request when "skip bots" is toggled off.
  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  let made = 0;
  // Cap the loop so a bug can never spin forever.
  for (let i = 0; i < 1000; i++) {
    if (aborted || fastForwardCancels.has(lobbyId)) break;
    const { data: lobby } = await supabaseAdmin
      .from('lobbies')
      .select('status, settings, current_overall')
      .eq('id', lobbyId)
      .maybeSingle();
    if (!lobby || lobby.status !== 'DRAFTING') break;

    const settings = lobby.settings as LobbySettings;
    const overall = lobby.current_overall as number;
    const team = await onClockTeam(lobbyId, settings, overall);
    if (!team || !team.is_bot) break; // stop as soon as a human is on the clock

    const playerId = await choosePlayer(lobbyId, settings, team.id);
    if (!playerId) break;
    const result = await applyPick(lobbyId, settings, overall, team, playerId, true);
    if (!result.ok) {
      // The background auto-draft engine (draftEngine.ts's tick(), every
      // 1.5s) can independently pick this same bot out from under us if its
      // 5s clock had already expired when fast-forward started — a benign
      // race, not a real failure. Re-loop instead of bailing out so
      // fast-forward doesn't stop dead after one collision.
      if (result.error === 'taken') continue;
      break;
    }
    made++;
    if (result.complete) break;

    // A small pace between picks: it gives the background tick() a much
    // smaller window to land on the same overall (the race above), and
    // keeps this loop from firing off dozens of rapid-fire realtime updates
    // that were swamping clients watching the board.
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  fastForwardCancels.delete(lobbyId); // consumed (or never set) — don't leak it
  if (aborted) return; // connection's gone — nothing to respond to
  res.json({ ok: true, picks: made });
});

/**
 * POST /api/lobbies/:id/fast-forward/cancel — reliably stop an in-flight
 * fast-forward. The client calls this when "skip bots" is toggled off, since
 * aborting the fetch alone doesn't always reach the server.
 */
draftRouter.post('/:id/fast-forward/cancel', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can fast-forward' });
    return;
  }
  fastForwardCancels.add(lobbyId);
  res.json({ ok: true });
});

/**
 * POST /api/lobbies/:id/simulate — commissioner auto-drafts every remaining pick
 * (humans AND bots) to the end of the draft. Fills the earliest open slot each
 * iteration — including any skipped slots behind the frontier — using the same
 * bot chooser, then applyPick advances/completes as normal (so the "draft
 * complete" chat + notifications still fire). The player pool is loaded once and
 * reused across picks. Guarded by a "SIMULATE" confirmation on the client.
 */
draftRouter.post('/:id/simulate', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can simulate the draft' });
    return;
  }

  const { data: lobby0 } = await supabaseAdmin
    .from('lobbies')
    .select('status, season')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby0) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  // DRAFTING only — pausing is the cancel signal for a running simulation (see
  // the loop below), so a simulation must start from a live draft. A paused
  // commissioner resumes first.
  if (lobby0.status !== 'DRAFTING') {
    res.status(409).json({ error: 'Resume the draft before simulating' });
    return;
  }
  // The pool is constant for the season — load it once and reuse it for every pick.
  const pool = await loadPlayerPool(
    (lobby0.season as number | null) ?? new Date().getUTCFullYear(),
  );

  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  let made = 0;
  // Cap well above any real draft size so a bug can never spin forever.
  for (let i = 0; i < 5000; i++) {
    if (aborted) break;
    const { data: lobby } = await supabaseAdmin
      .from('lobbies')
      .select('status, settings, current_overall')
      .eq('id', lobbyId)
      .maybeSingle();
    if (!lobby) break;
    // Stop the moment the draft leaves DRAFTING — COMPLETE, reset to STAGING, or
    // PAUSED. Pausing is how the commissioner cancels a simulation (the client
    // aborting the request is best-effort; a proxy can swallow the connection
    // close, so we poll status here as the reliable stop signal instead).
    if (lobby.status !== 'DRAFTING') break;

    const settings = lobby.settings as LobbySettings;
    const totalPicks = settings.teamCount * roundsForSettings(settings);
    const { data: pickRows } = await supabaseAdmin
      .from('picks')
      .select('overall, player_id, team_id')
      .eq('lobby_id', lobbyId);
    const rows = (pickRows ?? []) as { overall: number; player_id: string; team_id: string }[];
    const taken = new Set(rows.map((p) => p.overall));
    if (taken.size >= totalPicks) break; // board full

    // Fill the earliest open slot (a skipped slot behind the frontier, else the
    // frontier itself). onClockTeam maps the slot's overall → its team.
    const frontierClamped = Math.min(lobby.current_overall as number, totalPicks);
    const open = openSlots(taken, frontierClamped, settings.teamCount, settings.draftType);
    if (open.length === 0) break;
    const slot = open[0];
    const team = await onClockTeam(lobbyId, settings, slot.overall);
    if (!team) break;

    // Reuse the picks we just loaded + the slot's draft position so choosePlayer
    // skips its own per-pick queries (pool is already cached above).
    const playerId = await choosePlayer(lobbyId, settings, team.id, {
      pool,
      allPicks: rows.map((r) => ({ player_id: r.player_id, team_id: r.team_id })),
      draftPosition: draftPositionForOverall(slot.overall, settings.teamCount, settings.draftType),
    });
    if (!playerId) break;
    const result = await applyPick(lobbyId, settings, slot.overall, team, playerId, true);
    if (!result.ok) {
      // The background auto-draft tick() can pick a bot out from under us mid-run
      // (a benign race); just re-loop rather than bailing.
      if (result.error === 'taken') continue;
      break;
    }
    made++;
    if (result.complete) break;
  }
  if (aborted) return;
  res.json({ ok: true, picks: made });
});

/**
 * POST /api/lobbies/:id/restart — commissioner wipes the drafted picks and
 * returns the lobby to STAGING (open room, pre-first-pick) so rules/keepers can
 * be changed and the draft re-run from scratch. Keeper picks (is_keeper) are
 * kept — they belong to the staging phase, not the draft — and keepers are
 * re-opened for editing. In-progress only (DRAFTING/PAUSED); a COMPLETE draft
 * keeps its board. Everything transitions live via the lobby/picks realtime the
 * board already subscribes to. Guarded by a "RESTART" confirmation on the client.
 */
draftRouter.post('/:id/restart', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can restart the draft' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status !== 'DRAFTING' && lobby.status !== 'PAUSED') {
    res.status(409).json({ error: 'Only an in-progress draft can be restarted' });
    return;
  }

  // Wipe the drafted picks; keep keeper picks (placed during staging).
  const { error: delErr } = await supabaseAdmin
    .from('picks')
    .delete()
    .eq('lobby_id', lobbyId)
    .eq('is_keeper', false);
  if (delErr) {
    res.status(500).json({ error: delErr.message });
    return;
  }

  // Hand every team its timeout allowance back, and clear the auto-draft flag
  // that human/stand-in teams get flipped to when they exhaust that allowance
  // (see skipFrontier). Without this, a team that ran out of skips in the prior
  // run would keep auto-picking after the restart instead of honoring
  // skip-on-timeout again. Bots keep their auto-draft (they draft via is_bot).
  await supabaseAdmin.from('teams').update({ timeouts: 0 }).eq('lobby_id', lobbyId);
  await supabaseAdmin
    .from('teams')
    .update({ auto_draft: false })
    .eq('lobby_id', lobbyId)
    .eq('is_bot', false);

  // Back to the open draft room, before the first pick, keepers re-opened.
  const { error: updErr } = await supabaseAdmin
    .from('lobbies')
    .update({
      status: 'STAGING',
      current_overall: 1,
      pick_deadline: null,
      pick_deadline_remaining_ms: null,
      started_at: null,
      completed_at: null,
      keepers_locked: false,
    })
    .eq('id', lobbyId);
  if (updErr) {
    res.status(500).json({ error: updErr.message });
    return;
  }

  await postSystemMessage(lobbyId, userId, '🔄 The commissioner restarted the draft');
  res.json({ ok: true });
});

/**
 * POST /api/lobbies/:id/autopick-skipped — commissioner auto-picks every
 * skipped team's outstanding slot (the open slots behind the frontier). The
 * manual backstop for an abandoned team when the timeout allowance is
 * unlimited; also drains the end-game once the clock has run off the board.
 * Leaves the live on-the-clock slot to its owner/clock.
 */
draftRouter.post('/:id/autopick-skipped', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can auto-pick skipped teams' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, settings, current_overall')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby || lobby.status !== 'DRAFTING') {
    res.status(409).json({ error: 'Draft is not active' });
    return;
  }

  const settings = lobby.settings as LobbySettings;
  const totalPicks = settings.teamCount * roundsForSettings(settings);
  const frontier = lobby.current_overall as number;
  const frontierClamped = Math.min(frontier, totalPicks);

  const { data: pickRows } = await supabaseAdmin
    .from('picks')
    .select('overall')
    .eq('lobby_id', lobbyId);
  const taken = new Set((pickRows ?? []).map((p) => p.overall as number));
  // Every open slot behind the frontier (skipped) — exclude the frontier slot,
  // which belongs to the team on the clock.
  const behind = openSlots(taken, frontierClamped, settings.teamCount, settings.draftType).filter(
    (s) => s.overall !== frontier,
  );

  const { data: teamRows } = await supabaseAdmin
    .from('teams')
    .select('id, owner_id, is_bot, auto_draft, draft_position, timeouts')
    .eq('lobby_id', lobbyId);
  const teamByPos = new Map((teamRows ?? []).map((t) => [t.draft_position as number, t]));

  let made = 0;
  for (const slot of behind) {
    const t = teamByPos.get(slot.position);
    if (!t) continue;
    const playerId = await choosePlayer(lobbyId, settings, t.id as string);
    if (!playerId) continue;
    const result = await applyPick(
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
    if (result.ok) made++;
    // Pace so a big backlog doesn't fire a burst of realtime updates at once
    // (same reason fast-forward paces its bot picks).
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  res.json({ ok: true, picks: made });
});

/** POST /api/lobbies/:id/pause — commissioner freezes the clock. */
draftRouter.post('/:id/pause', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can pause the draft' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, pick_deadline, settings, current_overall')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status !== 'DRAFTING') {
    res.status(409).json({ error: 'Draft is not active' });
    return;
  }

  // Normally save whatever time was left on the clock so resume can restore it,
  // instead of the on-the-clock team getting a fresh full turn for free. When
  // `resetClock` is set (a cancelled simulation), reset it to a fresh full clock
  // instead — the sim left the deadline in an arbitrary place, so the team that
  // ends up on the clock should get its whole turn.
  const resetClock = (req.body as { resetClock?: boolean } | undefined)?.resetClock === true;
  let remainingMs: number | null;
  if (resetClock) {
    const full = await computeFullClockMs(
      lobbyId,
      lobby.settings as LobbySettings,
      lobby.current_overall as number,
    );
    remainingMs = full > 0 ? full : null; // null = an unlimited (untimed) round
  } else {
    remainingMs = lobby.pick_deadline
      ? Math.max(0, new Date(lobby.pick_deadline as string).getTime() - Date.now())
      : null;
  }

  const { error } = await supabaseAdmin
    .from('lobbies')
    .update({
      status: 'PAUSED',
      pick_deadline: null,
      pick_deadline_remaining_ms: remainingMs,
      paused_at: new Date().toISOString(),
    })
    .eq('id', lobbyId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  await postSystemMessage(lobbyId, req.user!.id, `⏸️ ${await usernameOf(req.user!.id)} paused the draft`);
  res.json({ ok: true, status: 'PAUSED' });
});

/** POST /api/lobbies/:id/resume — commissioner resumes a paused draft, restoring whatever time was left on the clock. */
draftRouter.post('/:id/resume', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can resume the draft' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, settings, current_overall, pick_deadline_remaining_ms, paused_at')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status !== 'PAUSED') {
    res.status(409).json({ error: 'Draft is not paused' });
    return;
  }

  const settings = lobby.settings as LobbySettings;
  const remainingMs = lobby.pick_deadline_remaining_ms as number | null;
  const pausedAt = lobby.paused_at as string | null;
  const pausedForText = pausedAt
    ? ` (paused for ${formatPauseDuration(Date.now() - new Date(pausedAt).getTime())})`
    : '';
  const deadline =
    remainingMs != null
      ? new Date(Date.now() + remainingMs).toISOString()
      : await computeDeadline(lobbyId, settings, lobby.current_overall as number);

  const { error } = await supabaseAdmin
    .from('lobbies')
    .update({
      status: 'DRAFTING',
      pick_deadline: deadline,
      pick_deadline_remaining_ms: null,
      paused_at: null,
    })
    .eq('id', lobbyId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  await postSystemMessage(
    lobbyId,
    req.user!.id,
    `▶️ ${await usernameOf(req.user!.id)} resumed the draft${pausedForText}`,
  );
  res.json({ ok: true, status: 'DRAFTING' });
});

/**
 * POST /api/lobbies/:id/add-time — commissioner extends the current pick clock
 * by `seconds`. Adds to the live deadline while DRAFTING, or to the frozen
 * remaining while PAUSED. Uses a conditional update keyed on the value we read,
 * retrying on a mismatch, so rapid clicks (the client's +5s spam) can't lose an
 * increment to a concurrent write. Server-side rate limit backstops the client
 * token bucket.
 */
draftRouter.post(
  '/:id/add-time',
  rateLimit('add-time', { max: 25, windowMs: 10_000 }),
  async (req: AuthedRequest, res: Response) => {
    const lobbyId = req.params.id;
    const role = await getRole(lobbyId, req.user!.id);
    if (!isCommish(role)) {
      res.status(403).json({ error: 'Only the commissioner can add time' });
      return;
    }
    const seconds = Number(req.body?.seconds);
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 120) {
      res.status(400).json({ error: 'Invalid amount' });
      return;
    }
    const addMs = Math.round(seconds * 1000);

    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: lobby } = await supabaseAdmin
        .from('lobbies')
        .select('status, pick_deadline, pick_deadline_remaining_ms')
        .eq('id', lobbyId)
        .maybeSingle();
      if (!lobby) {
        res.status(404).json({ error: 'Lobby not found' });
        return;
      }
      if (lobby.status === 'DRAFTING' && lobby.pick_deadline) {
        const oldDeadline = lobby.pick_deadline as string;
        const newDeadline = new Date(new Date(oldDeadline).getTime() + addMs).toISOString();
        const { data: updated } = await supabaseAdmin
          .from('lobbies')
          .update({ pick_deadline: newDeadline })
          .eq('id', lobbyId)
          .eq('pick_deadline', oldDeadline)
          .select('id');
        if (updated && updated.length) {
          res.json({ ok: true });
          return;
        }
      } else if (lobby.status === 'PAUSED' && lobby.pick_deadline_remaining_ms != null) {
        const oldMs = lobby.pick_deadline_remaining_ms as number;
        const { data: updated } = await supabaseAdmin
          .from('lobbies')
          .update({ pick_deadline_remaining_ms: oldMs + addMs })
          .eq('id', lobbyId)
          .eq('pick_deadline_remaining_ms', oldMs)
          .select('id');
        if (updated && updated.length) {
          res.json({ ok: true });
          return;
        }
      } else {
        res.status(409).json({ error: 'There’s no running clock to extend' });
        return;
      }
      // Value changed under us (a tick, another add, or the clock advanced) — retry.
    }
    res.status(409).json({ error: 'Could not add time — try again' });
  },
);

/** POST /api/lobbies/:id/rollback-to — commissioner rolls the draft back to
 * (and including) a specific pick, deleting it and every pick after it. */
draftRouter.post('/:id/rollback-to', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can roll back picks' });
    return;
  }
  if (await isRollbackLocked(lobbyId)) {
    res.status(403).json({ error: 'The rollback window has closed for this draft' });
    return;
  }

  const parsed = rollbackToSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const targetOverall = parsed.data.overall;

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, settings, current_overall')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }

  const settings = lobby.settings as LobbySettings;
  const total = settings.teamCount * roundsForSettings(settings);

  const { data: targetPick } = await supabaseAdmin
    .from('picks')
    .select('id, player_id, is_keeper')
    .eq('lobby_id', lobbyId)
    .eq('overall', targetOverall)
    .maybeSingle();

  // The target can be a real pick OR a skipped slot — an open slot the clock
  // already advanced past (skip-on-timeout). A skipped slot has no pick row, so
  // it's only a valid target when it's genuinely behind the live frontier and
  // within the draft; otherwise "no pick here" means a stale/bogus request.
  const isSkippedTarget = !targetPick;
  if (isSkippedTarget) {
    const frontier = (lobby.current_overall as number) ?? total + 1;
    if (targetOverall < 1 || targetOverall > total || targetOverall >= frontier) {
      res.status(409).json({ error: 'That pick no longer exists' });
      return;
    }
  } else if (targetPick.is_keeper) {
    // Keepers are pre-placed picks that belong to the team regardless of draft
    // order — there's nothing to "re-pick" at a keeper slot, and rolling one
    // back would strand the kept player back in the pool. Reject it outright
    // (the UI also hides the option on keepers; this is the server-side
    // backstop).
    res.status(409).json({ error: "Keepers can't be rolled back" });
    return;
  }

  const { data: rolledPlayer } = targetPick
    ? await supabaseAdmin
        .from('players')
        .select('name')
        .eq('id', targetPick.player_id)
        .maybeSingle()
    : { data: null };

  // Delete only real (non-keeper) picks at/after the target. Keepers sitting in
  // later rounds must survive: deleting them would free their kept player back
  // into the pool AND turn their slot into an open pick the clock would stop on,
  // letting that team unwittingly re-draft over their own keeper.
  const { data: removed, error: delError } = await supabaseAdmin
    .from('picks')
    .delete()
    .eq('lobby_id', lobbyId)
    .eq('is_keeper', false)
    .gte('overall', targetOverall)
    .select('id');
  if (delError) {
    res.status(500).json({ error: delError.message });
    return;
  }

  // Resume on the first genuinely open slot at/after the target — not blindly on
  // targetOverall, which could be (or sit just before) a surviving keeper slot
  // the engine would otherwise stall the clock on. Same rule /start uses. (For a
  // skipped target the slot is already open, so this just returns it.)
  const resumeOverall = (await nextOpenOverall(lobbyId, targetOverall, total)) ?? targetOverall;
  const wasPaused = lobby.status === 'PAUSED';
  // Either way, the team now on the clock gets a fresh full turn — never the
  // leftover countdown from whatever pick got rolled back. Live drafts get a
  // real deadline; paused ones get the frozen-remaining-time snapshot reset
  // to a full turn instead, so a later /resume doesn't restore stale seconds
  // that belonged to a different pick.
  const deadline = wasPaused ? null : await computeDeadline(lobbyId, settings, resumeOverall);
  const remainingMs = wasPaused ? await computeFullClockMs(lobbyId, settings, resumeOverall) : null;

  const { error: updateError } = await supabaseAdmin
    .from('lobbies')
    .update({
      current_overall: resumeOverall,
      status: wasPaused ? 'PAUSED' : 'DRAFTING',
      pick_deadline: deadline,
      pick_deadline_remaining_ms: remainingMs,
    })
    .eq('id', lobbyId);
  if (updateError) {
    res.status(500).json({ error: updateError.message });
    return;
  }
  // Skip counters are cumulative and can't be attributed to specific rolled-back
  // slots, so a rollback gives every team a clean skip allowance from here. (An
  // auto_draft flag a team earned by exhausting its allowance is left as-is —
  // it's indistinguishable from an intentional one; the commissioner can toggle
  // it back off.)
  await supabaseAdmin.from('teams').update({ timeouts: 0 }).eq('lobby_id', lobbyId);
  const who = await usernameOf(req.user!.id);
  const count = removed?.length ?? 0;
  const what = rolledPlayer?.name ? ` (${rolledPlayer.name})` : '';
  // A skipped target reopens the slot and rewinds the picks after it, so the
  // wording leads with the skip rather than an "undo pick N" the slot never had.
  const message = isSkippedTarget
    ? `↩️ ${who} rolled back to skipped pick ${targetOverall}${count ? ` (${count} pick${count === 1 ? '' : 's'} undone)` : ''}`
    : count <= 1
      ? `↩️ ${who} rolled back pick ${targetOverall}${what}`
      : `↩️ ${who} rolled back ${count} picks to pick ${targetOverall}${what}`;
  await postSystemMessage(lobbyId, req.user!.id, message);
  res.json({ ok: true, rolledBackOverall: targetOverall, count });
});

/** POST /api/lobbies/:id/invite — invite a user to this lobby (members only). */
draftRouter.post('/:id/invite', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const me = req.user!.id;

  const parsed = inviteToLobbySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const invitee = parsed.data.userId;

  const role = await getRole(lobbyId, me);
  if (!role) {
    res.status(403).json({ error: 'Only members can invite to this lobby' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('id, name, status')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }

  const alreadyMember = await getRole(lobbyId, invitee);
  if (alreadyMember) {
    res.status(409).json({ error: 'That user is already in the lobby' });
    return;
  }

  // Upsert the invite (re-inviting refreshes a stale/declined one to PENDING).
  const { error: inviteError } = await supabaseAdmin
    .from('lobby_invites')
    .upsert(
      { lobby_id: lobbyId, inviter_id: me, invitee_id: invitee, status: 'PENDING' },
      { onConflict: 'lobby_id,invitee_id' },
    );
  if (inviteError) {
    res.status(500).json({ error: inviteError.message });
    return;
  }
  await supabaseAdmin.from('notifications').insert({
    user_id: invitee,
    actor_id: me,
    type: 'LOBBY_INVITE',
    lobby_id: lobbyId,
    lobby_name: lobby.name,
  });
  res.json({ ok: true });
});

/** POST /api/lobbies/:id/accept-invite — join a lobby you were invited to (no password). */
draftRouter.post('/:id/accept-invite', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const me = req.user!.id;

  const { data: invite } = await supabaseAdmin
    .from('lobby_invites')
    .select('id, status')
    .eq('lobby_id', lobbyId)
    .eq('invitee_id', me)
    .maybeSingle();
  if (!invite) {
    res.status(404).json({ error: 'No invite found for this lobby' });
    return;
  }

  // Idempotent if they already joined.
  const existingRole = await getRole(lobbyId, me);
  if (existingRole) {
    await supabaseAdmin
      .from('lobby_invites')
      .update({ status: 'ACCEPTED' })
      .eq('id', invite.id);
    await resolveInviteNotification(lobbyId, me, 'ACCEPTED');
    res.json({ ok: true, joined: true, alreadyMember: true });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('settings, status')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED' && lobby.status !== 'STAGING') {
    res.status(409).json({ error: 'This draft has already started' });
    return;
  }

  const teamCount = (lobby.settings as { teamCount: number }).teamCount;
  const seat = await claimSeat(lobbyId, me, teamCount);
  if (!seat.ok) {
    res.status(409).json({ error: seat.error });
    return;
  }

  const { error: memberError } = await supabaseAdmin.from('lobby_members').insert({
    lobby_id: lobbyId,
    user_id: me,
    role: 'MEMBER',
  });
  if (memberError) {
    res.status(500).json({ error: memberError.message });
    return;
  }
  await supabaseAdmin
    .from('lobby_invites')
    .update({ status: 'ACCEPTED' })
    .eq('id', invite.id);
  await resolveInviteNotification(lobbyId, me, 'ACCEPTED');
  res.json({ ok: true, joined: true });
});

/** POST /api/lobbies/:id/decline-invite — decline a lobby invite. */
draftRouter.post('/:id/decline-invite', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const me = req.user!.id;
  await supabaseAdmin
    .from('lobby_invites')
    .update({ status: 'DECLINED' })
    .eq('lobby_id', lobbyId)
    .eq('invitee_id', me);
  await resolveInviteNotification(lobbyId, me, 'DECLINED');
  res.json({ ok: true });
});

/** POST /api/lobbies/:id/archive — hide/unhide this draft from the caller's own lists. */
draftRouter.post('/:id/archive', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;
  const archived = req.body?.archived !== false; // default to archiving

  const { data, error } = await supabaseAdmin
    .from('lobby_members')
    .update({ archived })
    .eq('lobby_id', lobbyId)
    .eq('user_id', userId)
    .select('lobby_id')
    .maybeSingle();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: 'You are not a member of this lobby' });
    return;
  }
  res.json({ ok: true, archived });
});

/** POST /api/lobbies/:id/chat — post a chat message (members only, before the lock). */
draftRouter.post('/:id/chat', rateLimit('chat', { max: 8, windowMs: 10_000 }), async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!role && !(await spectatorCan(lobbyId, 'spectate_react'))) {
    res.status(403).json({ error: 'Only members can chat in this lobby' });
    return;
  }
  const parsed = postChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (containsSlur(parsed.data.body)) {
    res.status(400).json({ error: 'That message contains language that isn’t allowed here' });
    return;
  }
  if (await isChatLocked(lobbyId)) {
    res.status(409).json({ error: 'Chat is locked for this draft' });
    return;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('chat_messages')
    .insert({ lobby_id: lobbyId, user_id: userId, kind: 'USER', body: parsed.data.body })
    .select('id')
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  await notifyMentions(lobbyId, userId, inserted.id as string, parsed.data.body);
  res.json({ ok: true });
});

/** POST /api/lobbies/:id/pick-comment — comment on a pick; posts to chat as a reply. */
draftRouter.post('/:id/pick-comment', rateLimit('pick-comment', { max: 8, windowMs: 10_000 }), async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!role && !(await spectatorCan(lobbyId, 'spectate_react'))) {
    res.status(403).json({ error: 'Only members can comment in this lobby' });
    return;
  }
  const parsed = pickCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (containsSlur(parsed.data.body)) {
    res.status(400).json({ error: 'That message contains language that isn’t allowed here' });
    return;
  }
  if (await isChatLocked(lobbyId)) {
    res.status(409).json({ error: 'Chat is locked for this draft' });
    return;
  }

  // The pick must belong to this lobby.
  const { data: pick } = await supabaseAdmin
    .from('picks')
    .select('id, team_id')
    .eq('id', parsed.data.pickId)
    .eq('lobby_id', lobbyId)
    .maybeSingle();
  if (!pick) {
    res.status(404).json({ error: 'Pick not found' });
    return;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('chat_messages')
    .insert({
      lobby_id: lobbyId,
      user_id: userId,
      kind: 'USER',
      body: parsed.data.body,
      reply_to_pick_id: parsed.data.pickId,
    })
    .select('id')
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Notify the pick's owner that someone replied (grouped if several do).
  const [{ data: team }, { data: lobbyRow }] = await Promise.all([
    supabaseAdmin.from('teams').select('owner_id').eq('id', pick.team_id).maybeSingle(),
    supabaseAdmin.from('lobbies').select('name').eq('id', lobbyId).maybeSingle(),
  ]);
  const body = parsed.data.body;
  if (team?.owner_id) {
    await notifyGrouped({
      userId: team.owner_id as string,
      actorId: userId,
      type: 'PICK_REPLY',
      lobbyId,
      lobbyName: (lobbyRow?.name as string | undefined) ?? 'a draft',
      targetType: 'PICK',
      targetId: parsed.data.pickId,
      snippet: body.length > 140 ? `${body.slice(0, 140)}…` : body,
    });
  }
  await notifyMentions(lobbyId, userId, inserted.id as string, body);
  res.json({ ok: true });
});

/** POST /api/lobbies/:id/chat-react — toggle an emoji reaction on a message or pick. */
draftRouter.post('/:id/chat-react', rateLimit('chat-react', { max: 20, windowMs: 10_000 }), async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!role && !(await spectatorCan(lobbyId, 'spectate_react'))) {
    res.status(403).json({ error: 'Only members can react in this lobby' });
    return;
  }
  const parsed = chatReactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (await isReactionsLocked(lobbyId)) {
    res.status(409).json({ error: 'Reactions are locked for this draft' });
    return;
  }
  const { targetType, targetId, emoji } = parsed.data;

  const { data: existing } = await supabaseAdmin
    .from('chat_reactions')
    .select('id')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin.from('chat_reactions').delete().eq('id', existing.id);
    res.json({ ok: true, reacted: false });
    return;
  }
  const { error } = await supabaseAdmin.from('chat_reactions').insert({
    lobby_id: lobbyId,
    target_type: targetType,
    target_id: targetId,
    user_id: userId,
    emoji,
  });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  await notifyReactionTarget(lobbyId, targetType, targetId, userId, emoji);
  res.json({ ok: true, reacted: true });
});

/** POST /api/lobbies/:id/spectate-settings — commissioner opens/closes live
 * spectating and its react/grade sub-permissions. The two sub-toggles imply the
 * master (a DB check constraint enforces it too). */
draftRouter.post('/:id/spectate-settings', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can change spectating' });
    return;
  }
  const parsed = spectateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const spectatePublic = parsed.data.spectatePublic;
  // Sub-toggles can't be on without the master.
  const spectateReact = spectatePublic && parsed.data.spectateReact;
  const spectateGrade = spectatePublic && parsed.data.spectateGrade;

  const { error } = await supabaseAdmin
    .from('lobbies')
    .update({
      spectate_public: spectatePublic,
      spectate_react: spectateReact,
      spectate_grade: spectateGrade,
    })
    .eq('id', lobbyId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ spectatePublic, spectateReact, spectateGrade });
});

/** POST /api/lobbies/:id/request-pause — any member flags the commissioner for a pause. */
draftRouter.post('/:id/request-pause', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!role) {
    res.status(403).json({ error: 'Only members can request a pause' });
    return;
  }
  await postSystemMessage(
    lobbyId,
    userId,
    `🙋 ${await usernameOf(userId)} requested a pause`,
  );
  res.json({ ok: true });
});

/** POST /api/lobbies/:id/draft-order — commissioner sets the draft order (pre-draft). */
draftRouter.post('/:id/draft-order', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can set the draft order' });
    return;
  }

  const parsed = setDraftOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { slots } = parsed.data;

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, settings')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED' && lobby.status !== 'STAGING') {
    res.status(409).json({ error: 'The draft order is locked once the draft starts' });
    return;
  }

  const teamCount = (lobby.settings as LobbySettings).teamCount;
  if (slots.length > teamCount) {
    res.status(400).json({ error: `Draft order can have at most ${teamCount} slots` });
    return;
  }

  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('lobby_id', lobbyId);
  const existing = new Set((teams ?? []).map((t) => t.id as string));
  const assigned = slots.filter((s): s is string => s !== null);

  // Every real team must be placed exactly once; open slots are just left null.
  if (new Set(assigned).size !== assigned.length) {
    res.status(400).json({ error: 'A team cannot appear in two slots' });
    return;
  }
  if (assigned.length !== existing.size || assigned.some((id) => !existing.has(id))) {
    res.status(400).json({ error: 'Draft order must place every team exactly once' });
    return;
  }

  // Two-pass to dodge the unique(lobby_id, draft_position) constraint: park
  // everyone at negative slots, then assign the final position (index + 1).
  for (let i = 0; i < slots.length; i++) {
    const teamId = slots[i];
    if (teamId) await supabaseAdmin.from('teams').update({ draft_position: -(i + 1) }).eq('id', teamId);
  }
  for (let i = 0; i < slots.length; i++) {
    const teamId = slots[i];
    if (teamId) await supabaseAdmin.from('teams').update({ draft_position: i + 1 }).eq('id', teamId);
  }

  // Keepers are pinned to a slot derived from their team's position — reorder
  // that position and the slot has to move with it.
  await resyncKeepers(lobbyId, lobby.settings as LobbySettings);
  res.json({ ok: true });
});

/** POST /api/lobbies/:id/add-bot — commissioner adds a single bot to the lowest open seat. */
draftRouter.post('/:id/add-bot', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can add bots' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, settings')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED' && lobby.status !== 'STAGING') {
    res.status(409).json({ error: 'Bots can only be added before the draft starts' });
    return;
  }

  const teamCount = (lobby.settings as LobbySettings).teamCount;
  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('draft_position')
    .eq('lobby_id', lobbyId);
  const taken = new Set((teams ?? []).map((t) => t.draft_position as number));
  let pos = 1;
  while (taken.has(pos)) pos++;
  if (pos > teamCount) {
    res.status(409).json({ error: 'Lobby is already full' });
    return;
  }

  const { error } = await supabaseAdmin.from('teams').insert({
    lobby_id: lobbyId,
    owner_id: null,
    name: `Bot ${pos}`,
    draft_position: pos,
    is_bot: true,
    auto_draft: true,
  });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, draftPosition: pos });
});

/** POST /api/lobbies/:id/add-standin — commissioner adds a stand-in seat (an
 * in-person drafter with no account) to the lowest open seat. Ownerless like a
 * bot, but is_bot=false so it's human-like on the clock: the commissioner picks
 * for it, and it's skipped/auto-picked exactly as a human seat would be. */
draftRouter.post('/:id/add-standin', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can add stand-in seats' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, settings')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED' && lobby.status !== 'STAGING') {
    res.status(409).json({ error: 'Stand-in seats can only be added before the draft starts' });
    return;
  }

  const teamCount = (lobby.settings as LobbySettings).teamCount;
  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('draft_position')
    .eq('lobby_id', lobbyId);
  const taken = new Set((teams ?? []).map((t) => t.draft_position as number));
  let pos = 1;
  while (taken.has(pos)) pos++;
  if (pos > teamCount) {
    res.status(409).json({ error: 'Lobby is already full' });
    return;
  }

  const { error } = await supabaseAdmin.from('teams').insert({
    lobby_id: lobbyId,
    owner_id: null,
    name: `Seat ${pos}`,
    draft_position: pos,
    is_bot: false,
    auto_draft: false,
    is_standin: true,
  });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, draftPosition: pos });
});

/** POST /api/lobbies/:id/reserve-seat — commissioner holds a seat for a friend
 * (body { userId }) and auto-invites them. The friend claims this exact seat on
 * join; an unclaimed reserved seat falls back to a bot at draft start. */
draftRouter.post('/:id/reserve-seat', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const me = req.user!.id;
  const role = await getRole(lobbyId, me);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can reserve seats' });
    return;
  }
  const invitee = typeof req.body?.userId === 'string' ? req.body.userId : null;
  if (!invitee) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('id, name, status, settings')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED' && lobby.status !== 'STAGING') {
    res.status(409).json({ error: 'Seats can only be reserved before the draft starts' });
    return;
  }

  // Friends only. Fetch my accepted friendships (interpolating only my own
  // trusted id into the filter) and check the invitee is among them.
  const { data: fr } = await supabaseAdmin
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'ACCEPTED')
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
  const isFriend = (fr ?? []).some(
    (f) =>
      (f.requester_id === me && f.addressee_id === invitee) ||
      (f.addressee_id === me && f.requester_id === invitee),
  );
  if (!isFriend) {
    res.status(403).json({ error: 'You can only reserve a seat for a friend' });
    return;
  }

  if (await getRole(lobbyId, invitee)) {
    res.status(409).json({ error: 'That user is already in the lobby' });
    return;
  }

  const { data: teamRows } = await supabaseAdmin
    .from('teams')
    .select('draft_position, reserved_for_user_id')
    .eq('lobby_id', lobbyId);
  const teams = teamRows ?? [];
  if (teams.some((t) => t.reserved_for_user_id === invitee)) {
    res.status(409).json({ error: 'That user already has a reserved seat' });
    return;
  }
  const teamCount = (lobby.settings as LobbySettings).teamCount;
  const taken = new Set(teams.map((t) => t.draft_position as number));
  let pos = 1;
  while (taken.has(pos)) pos++;
  if (pos > teamCount) {
    res.status(409).json({ error: 'Lobby is already full' });
    return;
  }

  const { data: prof } = await supabaseAdmin
    .from('profiles')
    .select('username')
    .eq('id', invitee)
    .maybeSingle();

  const { error: insertErr } = await supabaseAdmin.from('teams').insert({
    lobby_id: lobbyId,
    owner_id: null,
    reserved_for_user_id: invitee,
    name: prof?.username ?? `Seat ${pos}`,
    draft_position: pos,
    is_bot: false,
    auto_draft: false,
  });
  if (insertErr) {
    res.status(500).json({ error: insertErr.message });
    return;
  }

  // Auto-invite (same as /invite): upsert the lobby invite + notify.
  await supabaseAdmin
    .from('lobby_invites')
    .upsert(
      { lobby_id: lobbyId, inviter_id: me, invitee_id: invitee, status: 'PENDING' },
      { onConflict: 'lobby_id,invitee_id' },
    );
  await supabaseAdmin.from('notifications').insert({
    user_id: invitee,
    actor_id: me,
    type: 'LOBBY_INVITE',
    lobby_id: lobbyId,
    lobby_name: lobby.name,
  });
  res.json({ ok: true, draftPosition: pos });
});

/** POST /api/lobbies/:id/team-name — rename your own team (or any team, if
 * commissioner). Locked for everyone but the commissioner once the draft
 * is COMPLETE. */
draftRouter.post('/:id/team-name', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const parsed = renameTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { teamId, name } = parsed.data;
  const role = await getRole(lobbyId, userId);
  if (!role) {
    res.status(403).json({ error: 'You are not a member of this lobby' });
    return;
  }

  // Resolve the target team: an explicit teamId (commissioner only for others),
  // otherwise the caller's own team.
  const query = supabaseAdmin
    .from('teams')
    .select('id, owner_id')
    .eq('lobby_id', lobbyId);
  const { data: team } = await (teamId
    ? query.eq('id', teamId)
    : query.eq('owner_id', userId)
  ).maybeSingle();
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }
  if (team.owner_id !== userId && !isCommish(role)) {
    res.status(403).json({ error: 'You can only rename your own team' });
    return;
  }
  // Once the draft is complete — or whenever the commissioner has switched
  // on team_names_locked — team names lock for everyone but the
  // commissioner.
  if (!isCommish(role)) {
    const { data: lobby } = await supabaseAdmin
      .from('lobbies')
      .select('status, team_names_locked')
      .eq('id', lobbyId)
      .maybeSingle();
    if (lobby?.status === 'COMPLETE') {
      res.status(409).json({
        error: 'Team names are locked once the draft is complete — ask the commissioner',
      });
      return;
    }
    if (lobby?.team_names_locked) {
      res.status(409).json({
        error: 'The commissioner has locked team names — ask them to rename your team',
      });
      return;
    }
  }

  const { error } = await supabaseAdmin
    .from('teams')
    .update({ name })
    .eq('id', team.id);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, name });
});

/** POST /api/lobbies/:id/team-names-locked — commissioner locks/unlocks
 * everyone else's ability to rename their own team. */
draftRouter.post('/:id/team-names-locked', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can lock team names' });
    return;
  }
  const locked = req.body?.locked;
  if (typeof locked !== 'boolean') {
    res.status(400).json({ error: 'locked must be a boolean' });
    return;
  }
  const { error } = await supabaseAdmin
    .from('lobbies')
    .update({ team_names_locked: locked })
    .eq('id', lobbyId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, locked });
});

/** POST /api/lobbies/:id/keepers-locked — commissioner locks/unlocks owners'
 * ability to keep/unkeep their offered candidates. Same shape as
 * team-names-locked; enforced in the owner-facing select endpoint above. */
draftRouter.post('/:id/keepers-locked', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can lock keeper selections' });
    return;
  }
  const locked = req.body?.locked;
  if (typeof locked !== 'boolean') {
    res.status(400).json({ error: 'locked must be a boolean' });
    return;
  }
  const { error } = await supabaseAdmin
    .from('lobbies')
    .update({ keepers_locked: locked })
    .eq('id', lobbyId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, locked });
});

/** POST /api/lobbies/:id/auto-draft — toggle auto-draft (own team, or any team if commissioner). */
draftRouter.post('/:id/auto-draft', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const parsed = setAutoDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { teamId, on } = parsed.data;

  const role = await getRole(lobbyId, userId);
  if (!role) {
    res.status(403).json({ error: 'You are not a member of this lobby' });
    return;
  }
  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id, owner_id')
    .eq('lobby_id', lobbyId)
    .eq('id', teamId)
    .maybeSingle();
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }
  if (team.owner_id !== userId && !isCommish(role)) {
    res.status(403).json({ error: 'You can only auto-draft your own team' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('teams')
    .update({ auto_draft: on })
    .eq('id', team.id);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Turning auto-draft ON while this team is on the clock snaps to the short
  // auto clock, so the engine picks for them promptly. Turning it OFF
  // deliberately leaves the deadline untouched — restoring a fresh full
  // clock there would let someone repeatedly toggle auto-draft to keep
  // resetting their timer for free.
  if (on) {
    const { data: lobby } = await supabaseAdmin
      .from('lobbies')
      .select('status, settings, current_overall')
      .eq('id', lobbyId)
      .maybeSingle();
    if (lobby && lobby.status === 'DRAFTING') {
      const settings = lobby.settings as LobbySettings;
      const overall = lobby.current_overall as number;
      const current = await onClockTeam(lobbyId, settings, overall);
      if (current?.id === team.id) {
        const deadline = await computeDeadline(lobbyId, settings, overall);
        await supabaseAdmin.from('lobbies').update({ pick_deadline: deadline }).eq('id', lobbyId);
      }
    }
  }
  res.json({ ok: true, autoDraft: on });
});

/** GET /api/lobbies/:id/queue — the caller's own personal draft queue + toggle.
 * Queues are private (RLS locks the table to the service role), so this is the
 * only read path — a member only ever gets their own team's queue back. */
draftRouter.get('/:id/queue', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!role) {
    res.status(403).json({ error: 'You are not a member of this lobby' });
    return;
  }
  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('owner_id', userId)
    .maybeSingle();
  if (!team) {
    res.json({ teamId: null, playerIds: [], autopick: false });
    return;
  }
  const { data: q } = await supabaseAdmin
    .from('draft_queues')
    .select('player_ids, autopick')
    .eq('team_id', team.id)
    .maybeSingle();
  res.json({
    teamId: team.id,
    playerIds: (q?.player_ids as string[] | undefined) ?? [],
    autopick: (q?.autopick as boolean | undefined) ?? false,
  });
});

/** PUT /api/lobbies/:id/queue — replace the caller's ordered queue (own team). */
draftRouter.put('/:id/queue', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const parsed = setQueueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { teamId, playerIds } = parsed.data;

  const owned = await ownTeamOrReject(lobbyId, teamId, userId, res);
  if (!owned) return;

  // De-dupe while preserving order (defensive against a client double-add).
  const seen = new Set<string>();
  const ids = playerIds.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));

  const { error } = await supabaseAdmin.from('draft_queues').upsert(
    { team_id: teamId, lobby_id: lobbyId, player_ids: ids, updated_at: new Date().toISOString() },
    { onConflict: 'team_id' },
  );
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});

/** POST /api/lobbies/:id/queue-autopick — toggle "auto-draft from queue" (own team). */
draftRouter.post('/:id/queue-autopick', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const parsed = setQueueAutopickSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { teamId, on } = parsed.data;

  const owned = await ownTeamOrReject(lobbyId, teamId, userId, res);
  if (!owned) return;

  const { error } = await supabaseAdmin.from('draft_queues').upsert(
    { team_id: teamId, lobby_id: lobbyId, autopick: on, updated_at: new Date().toISOString() },
    { onConflict: 'team_id' },
  );
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, autopick: on });
});

/** Confirm the caller owns `teamId` in this lobby; writes the error response and
 * returns false otherwise. A queue is personal — commissioners can't edit it. */
async function ownTeamOrReject(
  lobbyId: string,
  teamId: string,
  userId: string,
  res: Response,
): Promise<boolean> {
  const role = await getRole(lobbyId, userId);
  if (!role) {
    res.status(403).json({ error: 'You are not a member of this lobby' });
    return false;
  }
  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('owner_id')
    .eq('lobby_id', lobbyId)
    .eq('id', teamId)
    .maybeSingle();
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return false;
  }
  if (team.owner_id !== userId) {
    res.status(403).json({ error: 'You can only edit your own queue' });
    return false;
  }
  return true;
}

/** POST /api/lobbies/:id/fill-bots — commissioner fills every open seat with a bot (pre-draft). */
draftRouter.post('/:id/fill-bots', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can add bots' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, settings')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED' && lobby.status !== 'STAGING') {
    res.status(409).json({ error: 'Bots can only be added before the draft starts' });
    return;
  }

  const added = await fillOpenSeatsWithBots(lobbyId, lobby.settings as LobbySettings);
  res.json({ ok: true, added });
});

/** POST /api/lobbies/:id/fill-standins — commissioner fills every open seat
 * with a stand-in seat they'll draft for (pre-draft). */
draftRouter.post('/:id/fill-standins', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can add stand-in seats' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, settings')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED' && lobby.status !== 'STAGING') {
    res.status(409).json({ error: 'Stand-in seats can only be added before the draft starts' });
    return;
  }

  const added = await fillOpenSeatsWithStandins(lobbyId, lobby.settings as LobbySettings);
  res.json({ ok: true, added });
});

/** POST /api/lobbies/:id/clear-seats — commissioner removes every ownerless
 * seat of a kind (body { kind: 'bot' | 'standin' }) pre-draft. */
draftRouter.post('/:id/clear-seats', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can remove seats' });
    return;
  }
  const kind = req.body?.kind === 'standin' ? 'standin' : req.body?.kind === 'bot' ? 'bot' : null;
  if (!kind) {
    res.status(400).json({ error: "kind must be 'bot' or 'standin'" });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED' && lobby.status !== 'STAGING') {
    res.status(409).json({ error: 'Seats can only be removed before the draft starts' });
    return;
  }

  const column = kind === 'bot' ? 'is_bot' : 'is_standin';
  const { data: removed, error } = await supabaseAdmin
    .from('teams')
    .delete()
    .eq('lobby_id', lobbyId)
    .eq(column, true)
    .select('id');
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, removed: removed?.length ?? 0 });
});

/** POST /api/lobbies/:id/remove-bot — commissioner removes an ownerless seat
 * (a bot or a stand-in) pre-draft. */
draftRouter.post('/:id/remove-bot', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can remove seats' });
    return;
  }
  const teamId = typeof req.body?.teamId === 'string' ? req.body.teamId : null;
  if (!teamId) {
    res.status(400).json({ error: 'teamId is required' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED' && lobby.status !== 'STAGING') {
    res.status(409).json({ error: 'Bots can only be removed before the draft starts' });
    return;
  }

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id, is_bot, is_standin, reserved_for_user_id')
    .eq('lobby_id', lobbyId)
    .eq('id', teamId)
    .maybeSingle();
  // Only ownerless placeholder seats (bots, stand-ins, reserved) are removable
  // this way — a real member's seat is removed via the kick flow instead.
  if (!team || !(team.is_bot || team.is_standin || team.reserved_for_user_id)) {
    res.status(404).json({ error: 'Seat not found' });
    return;
  }
  await supabaseAdmin.from('teams').delete().eq('id', team.id);
  res.json({ ok: true });
});

/** POST /api/lobbies/:id/randomize-bot-names — commissioner gives every bot
 * a fresh random name, e.g. swapping out the plain "Bot 3" placeholders
 * (pre-draft only, same window as add/fill/remove-bot). */
draftRouter.post('/:id/randomize-bot-names', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can rename bots' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED' && lobby.status !== 'STAGING') {
    res.status(409).json({ error: 'Bots can only be renamed before the draft starts' });
    return;
  }

  const { data: bots } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('is_bot', true);
  if (!bots || bots.length === 0) {
    res.json({ ok: true, renamed: 0 });
    return;
  }

  // Shuffled, so repeat runs don't hand out names in the same order — falls
  // back to "Name 2", "Name 3"… past the pool if there are more bots than
  // names (rare — the pool has 30).
  const pool = [...RANDOM_BOT_TEAM_NAMES].sort(() => Math.random() - 0.5);
  await Promise.all(
    bots.map((bot, i) => {
      const base = pool[i % pool.length];
      const name = i >= pool.length ? `${base} ${Math.floor(i / pool.length) + 1}` : base;
      return supabaseAdmin.from('teams').update({ name }).eq('id', bot.id);
    }),
  );
  res.json({ ok: true, renamed: bots.length });
});

/** POST /api/lobbies/:id/leave — a member leaves the lobby (pre-draft only). */
draftRouter.post('/:id/leave', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, commissioner_id')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.commissioner_id === userId) {
    res.status(409).json({ error: 'The commissioner can’t leave — delete the lobby instead' });
    return;
  }
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED' && lobby.status !== 'STAGING') {
    res.status(409).json({ error: 'You can only leave before the draft starts' });
    return;
  }
  const role = await getRole(lobbyId, userId);
  if (!role) {
    res.status(403).json({ error: 'You are not a member of this lobby' });
    return;
  }

  await supabaseAdmin.from('teams').delete().eq('lobby_id', lobbyId).eq('owner_id', userId);
  await supabaseAdmin.from('lobby_members').delete().eq('lobby_id', lobbyId).eq('user_id', userId);
  res.json({ ok: true });
});

/** POST /api/lobbies/:id/kick — commissioner removes a member (pre-draft only). */
draftRouter.post('/:id/kick', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can remove members' });
    return;
  }
  const targetId = typeof req.body?.userId === 'string' ? req.body.userId : null;
  if (!targetId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, commissioner_id')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (targetId === lobby.commissioner_id) {
    res.status(409).json({ error: 'The commissioner can’t be removed' });
    return;
  }
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED' && lobby.status !== 'STAGING') {
    res.status(409).json({ error: 'Members can only be removed before the draft starts' });
    return;
  }

  await supabaseAdmin.from('teams').delete().eq('lobby_id', lobbyId).eq('owner_id', targetId);
  await supabaseAdmin.from('lobby_members').delete().eq('lobby_id', lobbyId).eq('user_id', targetId);
  res.json({ ok: true });
});

/** POST /api/lobbies/:id/promote — head commissioner grants a member
 * co-commissioner (SUB_COMMISSIONER) privileges. Only the head commissioner
 * (lobbies.commissioner_id) can do this — a co-commissioner can't chain-grant
 * more of themselves. */
draftRouter.post('/:id/promote', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;
  const targetId = typeof req.body?.userId === 'string' ? req.body.userId : null;
  if (!targetId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('commissioner_id')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.commissioner_id !== userId) {
    res.status(403).json({ error: 'Only the commissioner can grant co-commissioner privileges' });
    return;
  }
  if (targetId === userId) {
    res.status(409).json({ error: 'You are already the commissioner' });
    return;
  }

  const { data: member } = await supabaseAdmin
    .from('lobby_members')
    .select('role')
    .eq('lobby_id', lobbyId)
    .eq('user_id', targetId)
    .maybeSingle();
  if (!member) {
    res.status(404).json({ error: 'That user is not a member of this lobby' });
    return;
  }

  await supabaseAdmin
    .from('lobby_members')
    .update({ role: 'SUB_COMMISSIONER' })
    .eq('lobby_id', lobbyId)
    .eq('user_id', targetId);
  res.json({ ok: true });
});

/** POST /api/lobbies/:id/demote — head commissioner revokes a co-commissioner's
 * privileges, dropping them back to a regular member. */
draftRouter.post('/:id/demote', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;
  const targetId = typeof req.body?.userId === 'string' ? req.body.userId : null;
  if (!targetId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('commissioner_id')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.commissioner_id !== userId) {
    res.status(403).json({ error: 'Only the commissioner can revoke co-commissioner privileges' });
    return;
  }

  await supabaseAdmin
    .from('lobby_members')
    .update({ role: 'MEMBER' })
    .eq('lobby_id', lobbyId)
    .eq('user_id', targetId)
    .eq('role', 'SUB_COMMISSIONER');
  res.json({ ok: true });
});

/** POST /api/lobbies/:id/champion — commissioner (or co-commissioner) marks
 * (or unmarks) a team as last season's defending champion, shown as a badge
 * in the roster. */
draftRouter.post('/:id/champion', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;
  const teamId = typeof req.body?.teamId === 'string' ? req.body.teamId : null;
  const isPrevChampion = req.body?.isPrevChampion === true;
  if (!teamId) {
    res.status(400).json({ error: 'teamId is required' });
    return;
  }

  const role = await getRole(lobbyId, userId);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can set the defending champion' });
    return;
  }

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('lobby_id', lobbyId)
    .maybeSingle();
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  await supabaseAdmin.from('teams').update({ is_prev_champion: isPrevChampion }).eq('id', teamId);
  res.json({ ok: true, isPrevChampion });
});

/** The signed-in user's own team in a lobby, if they have one. */
async function myTeamId(lobbyId: string, userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('lobby_id', lobbyId)
    .eq('owner_id', userId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** POST /api/lobbies/:id/crown-vote — cast/change your vote for the best OTHER roster. */
draftRouter.post('/:id/crown-vote', rateLimit('crown-vote', { max: 10, windowMs: 30_000 }), async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  const parsed = crownVoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, public_voting_allowed')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby || lobby.status !== 'COMPLETE') {
    res.status(409).json({ error: 'Voting opens once the draft is complete' });
    return;
  }
  // Members can always vote; non-members only if the commissioner opted in.
  if (!role && !lobby.public_voting_allowed) {
    res.status(403).json({ error: 'Only members can vote in this lobby' });
    return;
  }
  if (await isResultsLocked(lobbyId)) {
    res.status(409).json({ error: 'Voting closed 24h after the draft ended' });
    return;
  }

  if ((await myTeamId(lobbyId, userId)) === parsed.data.teamId) {
    res.status(400).json({ error: 'You can’t vote for your own roster' });
    return;
  }
  const { data: targetTeam } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('id', parsed.data.teamId)
    .eq('lobby_id', lobbyId)
    .maybeSingle();
  if (!targetTeam) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('draft_crown_votes')
    .upsert(
      { lobby_id: lobbyId, voter_id: userId, team_id: parsed.data.teamId },
      { onConflict: 'lobby_id,voter_id' },
    );
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});

/** POST /api/lobbies/:id/grade-team — leave/update a grade + 140-char comment on an OTHER team's roster. */
draftRouter.post('/:id/grade-team', rateLimit('grade-team', { max: 30, windowMs: 60_000 }), async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!role && !(await spectatorCan(lobbyId, 'spectate_grade'))) {
    res.status(403).json({ error: 'Only members can grade rosters in this lobby' });
    return;
  }
  const parsed = gradeTeamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (containsSlur(parsed.data.comment)) {
    res.status(400).json({ error: 'That comment contains language that isn’t allowed here' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, name')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby || lobby.status !== 'COMPLETE') {
    res.status(409).json({ error: 'Grading opens once the draft is complete' });
    return;
  }
  if (await isResultsLocked(lobbyId)) {
    res.status(409).json({ error: 'Grading closed 24h after the draft ended' });
    return;
  }

  if ((await myTeamId(lobbyId, userId)) === parsed.data.teamId) {
    res.status(400).json({ error: 'You can’t grade your own roster' });
    return;
  }
  const { data: targetTeam } = await supabaseAdmin
    .from('teams')
    .select('id, owner_id')
    .eq('id', parsed.data.teamId)
    .eq('lobby_id', lobbyId)
    .maybeSingle();
  if (!targetTeam) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const { error } = await supabaseAdmin.from('draft_grades').upsert(
    {
      lobby_id: lobbyId,
      rater_id: userId,
      team_id: parsed.data.teamId,
      grade: parsed.data.grade,
      comment: parsed.data.comment,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'lobby_id,rater_id,team_id' },
  );
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (targetTeam.owner_id) {
    await notifyGrouped({
      userId: targetTeam.owner_id as string,
      actorId: userId,
      type: 'DRAFT_GRADE',
      lobbyId,
      lobbyName: (lobby.name as string | undefined) ?? 'a draft',
      targetType: 'TEAM',
      targetId: parsed.data.teamId,
      snippet: parsed.data.comment,
      grade: parsed.data.grade,
    });
  }
  res.json({ ok: true });
});

/** POST /api/lobbies/:id/grade-reaction — like (+1) / dislike (-1) a peer's
 * grade on a roster, or clear it (0). Members only, within the post-draft
 * window; you can't react to your own grade (the composite FK also guarantees
 * the grade actually exists). */
draftRouter.post('/:id/grade-reaction', rateLimit('grade-reaction', { max: 60, windowMs: 60_000 }), async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!role && !(await spectatorCan(lobbyId, 'spectate_grade'))) {
    res.status(403).json({ error: 'Only members can react to grades in this lobby' });
    return;
  }
  const parsed = gradeReactionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (parsed.data.raterId === userId) {
    res.status(400).json({ error: 'You can’t react to your own grade' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby || lobby.status !== 'COMPLETE') {
    res.status(409).json({ error: 'Grading opens once the draft is complete' });
    return;
  }
  if (await isResultsLocked(lobbyId)) {
    res.status(409).json({ error: 'Grading closed 24h after the draft ended' });
    return;
  }

  if (parsed.data.value === 0) {
    const { error } = await supabaseAdmin
      .from('draft_grade_reactions')
      .delete()
      .eq('lobby_id', lobbyId)
      .eq('team_id', parsed.data.teamId)
      .eq('grade_rater_id', parsed.data.raterId)
      .eq('reactor_id', userId);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ ok: true });
    return;
  }

  const { error } = await supabaseAdmin.from('draft_grade_reactions').upsert(
    {
      lobby_id: lobbyId,
      team_id: parsed.data.teamId,
      grade_rater_id: parsed.data.raterId,
      reactor_id: userId,
      value: parsed.data.value,
    },
    { onConflict: 'lobby_id,team_id,grade_rater_id,reactor_id' },
  );
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true });
});
