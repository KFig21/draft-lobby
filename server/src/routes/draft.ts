import { Router, type Response } from 'express';
import {
  draftPositionForOverall,
  makePickSchema,
  renameTeamSchema,
  roundsForSettings,
  secondsForRound,
  type LobbySettings,
} from '@draft-lobby/shared';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
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
  const firstRoundSeconds = secondsForRound(1, settings.pickTiers);
  const deadline = new Date(Date.now() + firstRoundSeconds * 1000).toISOString();

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
  const totalPicks = settings.teamCount * roundsForSettings(settings);
  const round = Math.floor((overall - 1) / settings.teamCount) + 1;
  const onClockPosition = draftPositionForOverall(
    overall,
    settings.teamCount,
    settings.draftType,
  );

  const { data: onClockTeam } = await supabaseAdmin
    .from('teams')
    .select('id, owner_id')
    .eq('lobby_id', lobbyId)
    .eq('draft_position', onClockPosition)
    .maybeSingle();
  if (!onClockTeam) {
    res.status(409).json({ error: 'No team is on the clock' });
    return;
  }

  // Authorize: you own the team on the clock, or you're a commissioner.
  const role = await getRole(lobbyId, userId);
  const ownsTeam = onClockTeam.owner_id === userId;
  if (!ownsTeam && !isCommish(role)) {
    res.status(403).json({ error: "It's not your turn" });
    return;
  }

  const { error: insertError } = await supabaseAdmin.from('picks').insert({
    lobby_id: lobbyId,
    overall,
    round,
    team_id: onClockTeam.id,
    player_id: playerId,
    is_auto_pick: false,
  });
  if (insertError) {
    // Unique violations = player already taken or pick slot filled (race).
    const alreadyTaken = insertError.code === '23505';
    res
      .status(alreadyTaken ? 409 : 500)
      .json({ error: alreadyTaken ? 'That player is already drafted' : insertError.message });
    return;
  }

  // Advance the clock (or finish the draft).
  const nextOverall = overall + 1;
  const isComplete = nextOverall > totalPicks;
  const nextRound = Math.floor((nextOverall - 1) / settings.teamCount) + 1;
  const { error: advanceError } = await supabaseAdmin
    .from('lobbies')
    .update({
      current_overall: nextOverall,
      status: isComplete ? 'COMPLETE' : 'DRAFTING',
      pick_deadline: isComplete
        ? null
        : new Date(
            Date.now() + secondsForRound(nextRound, settings.pickTiers) * 1000,
          ).toISOString(),
    })
    .eq('id', lobbyId);
  if (advanceError) {
    res.status(500).json({ error: advanceError.message });
    return;
  }

  res.json({ ok: true, overall, round, complete: isComplete });
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
    .select('status')
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

  const { error } = await supabaseAdmin
    .from('lobbies')
    .update({ status: 'PAUSED', pick_deadline: null })
    .eq('id', lobbyId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, status: 'PAUSED' });
});

/** POST /api/lobbies/:id/resume — commissioner restarts a paused draft with a fresh clock. */
draftRouter.post('/:id/resume', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can resume the draft' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, settings, current_overall')
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
  const round = Math.floor(((lobby.current_overall as number) - 1) / settings.teamCount) + 1;
  const deadline = new Date(
    Date.now() + secondsForRound(round, settings.pickTiers) * 1000,
  ).toISOString();

  const { error } = await supabaseAdmin
    .from('lobbies')
    .update({ status: 'DRAFTING', pick_deadline: deadline })
    .eq('id', lobbyId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, status: 'DRAFTING' });
});

/** POST /api/lobbies/:id/rollback — commissioner undoes the most recent pick. */
draftRouter.post('/:id/rollback', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const role = await getRole(lobbyId, req.user!.id);
  if (!isCommish(role)) {
    res.status(403).json({ error: 'Only the commissioner can roll back picks' });
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

  const { data: lastPick } = await supabaseAdmin
    .from('picks')
    .select('id, overall, round')
    .eq('lobby_id', lobbyId)
    .order('overall', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastPick) {
    res.status(409).json({ error: 'There are no picks to roll back' });
    return;
  }

  const { error: delError } = await supabaseAdmin
    .from('picks')
    .delete()
    .eq('id', lastPick.id);
  if (delError) {
    res.status(500).json({ error: delError.message });
    return;
  }

  // The rolled-back slot is now on the clock again; reopen the draft if it had ended.
  const settings = lobby.settings as LobbySettings;
  const round = lastPick.round as number;
  const wasPaused = lobby.status === 'PAUSED';
  const deadline = wasPaused
    ? null
    : new Date(Date.now() + secondsForRound(round, settings.pickTiers) * 1000).toISOString();

  const { error: updateError } = await supabaseAdmin
    .from('lobbies')
    .update({
      current_overall: lastPick.overall,
      status: wasPaused ? 'PAUSED' : 'DRAFTING',
      pick_deadline: deadline,
    })
    .eq('id', lobbyId);
  if (updateError) {
    res.status(500).json({ error: updateError.message });
    return;
  }
  res.json({ ok: true, rolledBackOverall: lastPick.overall });
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
