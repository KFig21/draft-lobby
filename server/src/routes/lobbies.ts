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

  // Surface open lobbies in friends' feeds.
  if ((settings as { visibility?: string }).visibility === 'OPEN') {
    await supabaseAdmin.from('activity_events').insert({
      actor_id: userId,
      type: 'OPEN_LOBBY_CREATED',
      lobby_id: lobby.id,
      lobby_name: settings.name,
    });
  }

  res.status(201).json({ lobby });
});

/** GET /api/lobbies/open — browsable lobbies anyone can join (pre-draft, not full). */
lobbiesRouter.get('/open', async (req: AuthedRequest, res: Response) => {
  const { data: lobbies } = await supabaseAdmin
    .from('lobbies')
    .select('id, name, settings, status, created_at, commissioner_id')
    .in('status', ['SETUP', 'SCHEDULED'])
    .order('created_at', { ascending: false })
    .limit(50);

  const open = (lobbies ?? []).filter(
    (l) => (l.settings as { visibility?: string }).visibility === 'OPEN',
  );
  if (open.length === 0) {
    res.json({ lobbies: [] });
    return;
  }

  // Team counts (filled slots) per lobby.
  const ids = open.map((l) => l.id);
  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('lobby_id')
    .in('lobby_id', ids);
  const counts = new Map<string, number>();
  for (const t of teams ?? []) {
    counts.set(t.lobby_id, (counts.get(t.lobby_id) ?? 0) + 1);
  }

  const me = req.user!.id;
  const { data: myMemberships } = await supabaseAdmin
    .from('lobby_members')
    .select('lobby_id')
    .eq('user_id', me)
    .in('lobby_id', ids);
  const mine = new Set((myMemberships ?? []).map((m) => m.lobby_id));

  const result = open.map((l) => {
    const filled = counts.get(l.id) ?? 0;
    const teamCount = (l.settings as { teamCount: number }).teamCount;
    return {
      id: l.id,
      name: l.name,
      settings: l.settings,
      filled,
      teamCount,
      isMember: mine.has(l.id),
      isFull: filled >= teamCount,
    };
  });
  res.json({ lobbies: result });
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
  // OPEN lobbies are joinable without a password; PRIVATE ones require it.
  const isOpen = (lobby.settings as { visibility?: string }).visibility === 'OPEN';
  if (!isOpen && !verifyPassword(password ?? '', lobby.password_hash)) {
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
