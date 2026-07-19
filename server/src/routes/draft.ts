import { Router, type Response } from 'express';
import {
  draftPositionForOverall,
  makePickSchema,
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
