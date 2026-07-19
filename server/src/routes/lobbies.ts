import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Router, type Response } from 'express';
import { createLobbySchema, joinLobbySchema } from '@draft-lobby/shared';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';

export const lobbiesRouter = Router();
lobbiesRouter.use(requireAuth);

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

/** POST /api/lobbies — create a lobby; caller becomes commissioner + first team. */
lobbiesRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const parsed = createLobbySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { settings, password } = parsed.data;
  const userId = req.user!.id;

  const { data: lobby, error } = await supabaseAdmin
    .from('lobbies')
    .insert({
      name: settings.name,
      commissioner_id: userId,
      password_hash: hashPassword(password),
      settings,
      status: 'SETUP',
    })
    .select()
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Commissioner membership + their team in draft slot 1.
  const { error: memberError } = await supabaseAdmin.from('lobby_members').insert({
    lobby_id: lobby.id,
    user_id: userId,
    role: 'COMMISSIONER',
  });
  if (memberError) {
    res.status(500).json({ error: memberError.message });
    return;
  }
  const { error: teamError } = await supabaseAdmin.from('teams').insert({
    lobby_id: lobby.id,
    owner_id: userId,
    name: `Team 1`,
    draft_position: 1,
  });
  if (teamError) {
    res.status(500).json({ error: teamError.message });
    return;
  }

  res.status(201).json({ lobby });
});

/** POST /api/lobbies/join — join an existing lobby with its password. */
lobbiesRouter.post('/join', async (req: AuthedRequest, res: Response) => {
  const parsed = joinLobbySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { lobbyId, password, teamName } = parsed.data;
  const userId = req.user!.id;

  const { data: lobby, error } = await supabaseAdmin
    .from('lobbies')
    .select('id, password_hash, settings, status')
    .eq('id', lobbyId)
    .single();
  if (error || !lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (!verifyPassword(password, lobby.password_hash)) {
    res.status(403).json({ error: 'Incorrect password' });
    return;
  }

  // Already a member? Treat join as idempotent.
  const { data: existing } = await supabaseAdmin
    .from('lobby_members')
    .select('user_id')
    .eq('lobby_id', lobbyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) {
    res.json({ joined: true, alreadyMember: true });
    return;
  }

  const { count } = await supabaseAdmin
    .from('teams')
    .select('*', { count: 'exact', head: true })
    .eq('lobby_id', lobbyId);
  const teamCount = (lobby.settings as { teamCount: number }).teamCount;
  if ((count ?? 0) >= teamCount) {
    res.status(409).json({ error: 'Lobby is full' });
    return;
  }

  const { error: memberError } = await supabaseAdmin.from('lobby_members').insert({
    lobby_id: lobbyId,
    user_id: userId,
    role: 'MEMBER',
  });
  if (memberError) {
    res.status(500).json({ error: memberError.message });
    return;
  }
  const draftPosition = (count ?? 0) + 1;
  const { error: teamError } = await supabaseAdmin.from('teams').insert({
    lobby_id: lobbyId,
    owner_id: userId,
    name: teamName ?? `Team ${draftPosition}`,
    draft_position: draftPosition,
  });
  if (teamError) {
    res.status(500).json({ error: teamError.message });
    return;
  }

  res.json({ joined: true });
});
