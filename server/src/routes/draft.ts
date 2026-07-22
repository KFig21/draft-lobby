import { Router, type Response } from 'express';
import {
  CHAT_LOCK_MS,
  DRAFT_RESULTS_LOCK_MS,
  REACTION_LOCK_MS,
  ROLLBACK_LOCK_MS,
  chatReactSchema,
  containsSlur,
  crownVoteSchema,
  extractMentionedUsernames,
  gradeTeamSchema,
  inviteToLobbySchema,
  makePickSchema,
  pickCommentSchema,
  postChatSchema,
  renameTeamSchema,
  rollbackToSchema,
  setAutoDraftSchema,
  setDraftOrderSchema,
  type LobbySettings,
} from '@draft-lobby/shared';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import {
  applyPick,
  choosePlayer,
  claimSeat,
  computeDeadline,
  fillOpenSeatsWithBots,
  onClockTeam,
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
  });
}

/** Notify whoever owns a reacted-to pick or message (skips bot-owned picks). */
async function notifyReactionTarget(
  lobbyId: string,
  targetType: 'MESSAGE' | 'PICK',
  targetId: string,
  actorId: string,
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

/** Chat locks CHAT_LOCK_MS after the draft ends. */
async function isChatLocked(lobbyId: string): Promise<boolean> {
  const endedAt = await draftEndedAt(lobbyId);
  return !!endedAt && Date.now() > new Date(endedAt).getTime() + CHAT_LOCK_MS;
}

/** Emoji reactions lock REACTION_LOCK_MS (much later) after the draft ends. */
async function isReactionsLocked(lobbyId: string): Promise<boolean> {
  const endedAt = await draftEndedAt(lobbyId);
  return !!endedAt && Date.now() > new Date(endedAt).getTime() + REACTION_LOCK_MS;
}

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

  // Fill any empty seats with bots so every draft slot has a drafter.
  await fillOpenSeatsWithBots(lobbyId, settings);

  // Deadline honours whoever lands on the clock first (a bot gets a short one).
  const deadline = await computeDeadline(lobbyId, settings, 1);

  const { error: updateError } = await supabaseAdmin
    .from('lobbies')
    .update({ status: 'DRAFTING', current_overall: 1, pick_deadline: deadline })
    .eq('id', lobbyId);
  if (updateError) {
    res.status(500).json({ error: updateError.message });
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
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED') {
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

/** POST /api/lobbies/:id/pick — make the pick for whoever is on the clock. */
draftRouter.post('/:id/pick', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const parsed = makePickSchema.safeParse({ ...req.body, lobbyId });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { playerId } = parsed.data;

  const { data: lobby, error } = await supabaseAdmin
    .from('lobbies')
    .select('id, status, settings, current_overall')
    .eq('id', lobbyId)
    .single();
  if (error || !lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status !== 'DRAFTING') {
    res.status(409).json({ error: 'Draft is not active' });
    return;
  }

  const settings = lobby.settings as LobbySettings;
  const overall = lobby.current_overall as number;
  const round = Math.floor((overall - 1) / settings.teamCount) + 1;

  const team = await onClockTeam(lobbyId, settings, overall);
  if (!team) {
    res.status(409).json({ error: 'No team is on the clock' });
    return;
  }

  // Authorize: you own the team on the clock, or you're a commissioner.
  const role = await getRole(lobbyId, userId);
  const ownsTeam = team.owner_id === userId;
  if (!ownsTeam && !isCommish(role)) {
    res.status(403).json({ error: "It's not your turn" });
    return;
  }

  const result = await applyPick(lobbyId, settings, overall, team, playerId, false);
  if (!result.ok) {
    if (result.error === 'taken') {
      res.status(409).json({ error: 'That player is already drafted' });
    } else {
      res.status(500).json({ error: result.message ?? 'Pick failed' });
    }
    return;
  }

  res.json({ ok: true, overall, round, complete: result.complete });
});

/** POST /api/lobbies/:id/fast-forward — commissioner burns through consecutive bot picks. */
draftRouter.post('/:id/fast-forward', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can fast-forward' });
    return;
  }

  // The commissioner can toggle "skip bots" off mid-stream on the client,
  // which aborts this request — without this, the loop below has no way to
  // notice and just keeps burning through every remaining bot regardless.
  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  let made = 0;
  // Cap the loop so a bug can never spin forever.
  for (let i = 0; i < 1000; i++) {
    if (aborted) break;
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
    if (!result.ok) break;
    made++;
    if (result.complete) break;
  }
  if (aborted) return; // connection's gone — nothing to respond to
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
    .select('status, pick_deadline')
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

  // Save whatever time was left on the clock so resume can restore it,
  // instead of the on-the-clock team getting a fresh full turn for free.
  const remainingMs = lobby.pick_deadline
    ? Math.max(0, new Date(lobby.pick_deadline as string).getTime() - Date.now())
    : null;

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
    .select('status, settings')
    .eq('id', lobbyId)
    .single();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }

  const { data: targetPick } = await supabaseAdmin
    .from('picks')
    .select('id, player_id')
    .eq('lobby_id', lobbyId)
    .eq('overall', targetOverall)
    .maybeSingle();
  if (!targetPick) {
    res.status(409).json({ error: 'That pick no longer exists' });
    return;
  }

  const { data: rolledPlayer } = await supabaseAdmin
    .from('players')
    .select('name')
    .eq('id', targetPick.player_id)
    .maybeSingle();

  const { data: removed, error: delError } = await supabaseAdmin
    .from('picks')
    .delete()
    .eq('lobby_id', lobbyId)
    .gte('overall', targetOverall)
    .select('id');
  if (delError) {
    res.status(500).json({ error: delError.message });
    return;
  }

  // The rolled-back slot is now on the clock again; reopen the draft if it had ended.
  const settings = lobby.settings as LobbySettings;
  const wasPaused = lobby.status === 'PAUSED';
  const deadline = wasPaused ? null : await computeDeadline(lobbyId, settings, targetOverall);

  const { error: updateError } = await supabaseAdmin
    .from('lobbies')
    .update({
      current_overall: targetOverall,
      status: wasPaused ? 'PAUSED' : 'DRAFTING',
      pick_deadline: deadline,
    })
    .eq('id', lobbyId);
  if (updateError) {
    res.status(500).json({ error: updateError.message });
    return;
  }
  const who = await usernameOf(req.user!.id);
  const count = removed?.length ?? 1;
  const what = rolledPlayer?.name ? ` (${rolledPlayer.name})` : '';
  await postSystemMessage(
    lobbyId,
    req.user!.id,
    count === 1
      ? `↩️ ${who} rolled back pick ${targetOverall}${what}`
      : `↩️ ${who} rolled back ${count} picks to pick ${targetOverall}${what}`,
  );
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
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED') {
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
draftRouter.post('/:id/chat', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!role) {
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
draftRouter.post('/:id/pick-comment', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!role) {
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
draftRouter.post('/:id/chat-react', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!role) {
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
  await notifyReactionTarget(lobbyId, targetType, targetId, userId);
  res.json({ ok: true, reacted: true });
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
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED') {
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
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED') {
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

/** POST /api/lobbies/:id/team-name — rename your own team (or any team, if commissioner). */
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
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED') {
    res.status(409).json({ error: 'Bots can only be added before the draft starts' });
    return;
  }

  const added = await fillOpenSeatsWithBots(lobbyId, lobby.settings as LobbySettings);
  res.json({ ok: true, added });
});

/** POST /api/lobbies/:id/remove-bot — commissioner removes a bot seat (pre-draft). */
draftRouter.post('/:id/remove-bot', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can remove bots' });
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
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED') {
    res.status(409).json({ error: 'Bots can only be removed before the draft starts' });
    return;
  }

  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id, is_bot')
    .eq('lobby_id', lobbyId)
    .eq('id', teamId)
    .maybeSingle();
  if (!team || !team.is_bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }
  await supabaseAdmin.from('teams').delete().eq('id', team.id);
  res.json({ ok: true });
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
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED') {
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
  if (lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED') {
    res.status(409).json({ error: 'Members can only be removed before the draft starts' });
    return;
  }

  await supabaseAdmin.from('teams').delete().eq('lobby_id', lobbyId).eq('owner_id', targetId);
  await supabaseAdmin.from('lobby_members').delete().eq('lobby_id', lobbyId).eq('user_id', targetId);
  res.json({ ok: true });
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
draftRouter.post('/:id/crown-vote', async (req: AuthedRequest, res: Response) => {
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
draftRouter.post('/:id/grade-team', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const role = await getRole(lobbyId, userId);
  if (!role) {
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
      snippet: `${parsed.data.grade} — ${parsed.data.comment}`,
    });
  }
  res.json({ ok: true });
});
