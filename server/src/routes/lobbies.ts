import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Router, type Response } from 'express';
import {
  CHAT_LOCK_MS,
  DEFAULT_LOBBY_SETTINGS,
  DRAFT_RESULTS_LOCK_MS,
  copyLobbySchema,
  createLobbySchema,
  joinLobbySchema,
  lobbySettingsSchema,
  overallForDraftPosition,
  renameLobbySchema,
  roundsForSettings,
  type LobbySettings,
} from '@draft-lobby/shared';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { claimSeat, usernameOf } from '../draftEngine.js';
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
  const { settings, password, resultsPublic, chatPublic, publicVotingAllowed, chatLockMs } =
    parsed.data;
  const userId = req.user!.id;

  const { data: lobby, error } = await supabaseAdmin
    .from('lobbies')
    .insert({
      name: settings.name,
      commissioner_id: userId,
      password_hash: hashPassword(password ?? ''),
      settings,
      status: 'SETUP',
      results_public: resultsPublic,
      chat_public: chatPublic,
      public_voting_allowed: publicVotingAllowed,
      chat_lock_ms: chatLockMs,
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
    name: (await usernameOf(userId)) ?? 'Team 1',
    draft_position: 1,
  });
  if (teamError) {
    res.status(500).json({ error: teamError.message });
    return;
  }

  // Surface open lobbies in friends' feeds (mock drafts stay off feeds).
  if (
    (settings as { visibility?: string }).visibility === 'OPEN' &&
    (settings as { draftMode?: string }).draftMode !== 'MOCK'
  ) {
    await supabaseAdmin.from('activity_events').insert({
      actor_id: userId,
      type: 'OPEN_LOBBY_CREATED',
      lobby_id: lobby.id,
      lobby_name: settings.name,
    });
  }

  res.status(201).json({ lobby });
});

/**
 * POST /api/lobbies/:id/copy — duplicate a draft into a fresh lobby (the caller
 * becomes its commissioner). A checklist (`include`) decides which parts carry
 * over; anything left off falls back to DEFAULT_LOBBY_SETTINGS. Regular picks
 * are never copied. Members aren't added here — the client re-invites them via
 * the existing LOBBY_INVITE flow using the `members` returned below.
 */
lobbiesRouter.post('/:id/copy', async (req: AuthedRequest, res: Response) => {
  const sourceId = req.params.id;
  const userId = req.user!.id;

  const parsed = copyLobbySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { name, draftMode, include } = parsed.data;

  // Keeper copy maps to copied seats and its round-cost `overall` needs the same
  // format — so both flags require team names + league setup (also gated in UI).
  if ((include.keeperLists || include.keeperPicks) && !(include.teamNames && include.leagueSetup)) {
    res.status(400).json({ error: 'Copying keepers requires team names and league setup' });
    return;
  }

  // Members only — you can copy any draft you're part of.
  const { data: membership } = await supabaseAdmin
    .from('lobby_members')
    .select('role')
    .eq('lobby_id', sourceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!membership) {
    res.status(403).json({ error: 'Only members can copy this draft' });
    return;
  }

  const { data: source } = await supabaseAdmin
    .from('lobbies')
    .select('settings')
    .eq('id', sourceId)
    .maybeSingle();
  if (!source) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }
  const src = source.settings as LobbySettings;

  // Merge the chosen sections over the defaults. Copies always start private,
  // in SETUP, unscheduled; keepers are on iff we're carrying any over.
  const merged: LobbySettings = {
    ...DEFAULT_LOBBY_SETTINGS,
    name,
    draftMode,
    visibility: 'PRIVATE',
    scheduledStart: null,
    keepersEnabled: include.keeperLists || include.keeperPicks,
  };
  if (include.leagueSetup) {
    merged.teamCount = src.teamCount;
    merged.draftType = src.draftType;
    merged.rosterComposition = src.rosterComposition;
  }
  if (include.scoring) merged.scoring = src.scoring;
  if (include.timers) {
    merged.pickTiers = src.pickTiers;
    merged.botPickSeconds = src.botPickSeconds;
    merged.allowSkips = src.allowSkips;
    merged.timeoutAllowance = src.timeoutAllowance;
  }
  const validated = lobbySettingsSchema.safeParse(merged);
  if (!validated.success) {
    res.status(400).json({ error: validated.error.flatten() });
    return;
  }
  const newSettings = validated.data;

  // Create the lobby + commissioner membership.
  const { data: lobby, error } = await supabaseAdmin
    .from('lobbies')
    .insert({
      name,
      commissioner_id: userId,
      password_hash: hashPassword(''),
      settings: newSettings,
      status: 'SETUP',
      results_public: false,
      chat_public: false,
      public_voting_allowed: false,
      chat_lock_ms: CHAT_LOCK_MS,
    })
    .select()
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const { error: memberError } = await supabaseAdmin.from('lobby_members').insert({
    lobby_id: lobby.id,
    user_id: userId,
    role: 'COMMISSIONER',
  });
  if (memberError) {
    res.status(500).json({ error: memberError.message });
    return;
  }

  // Source teams, needed both to recreate seats and to map keepers by slot.
  const { data: srcTeams } = await supabaseAdmin
    .from('teams')
    .select('id, owner_id, name, draft_position, color, is_prev_champion, is_bot, auto_draft')
    .eq('lobby_id', sourceId)
    .order('draft_position');
  const srcTeamPos = new Map<string, number>(
    (srcTeams ?? []).map((t) => [t.id as string, t.draft_position as number]),
  );
  const posToNewTeam = new Map<number, string>();

  if (include.teamNames && (srcTeams?.length ?? 0) > 0) {
    const rows = srcTeams!.map((t) => ({
      lobby_id: lobby.id,
      // Keep the copier owning their own seat; everyone else's is unowned
      // (a human seat to re-invite, or a bot that keeps drafting itself).
      owner_id: t.owner_id === userId ? userId : null,
      name: t.name,
      draft_position: t.draft_position,
      color: t.color,
      is_prev_champion: t.is_prev_champion,
      // Preserve bot seats so a copied mock still drafts itself. A human seat
      // (is_bot false) with its owner cleared becomes an empty seat to invite.
      is_bot: t.is_bot,
      auto_draft: t.auto_draft,
    }));
    // The copier is this lobby's commissioner — make sure they own a seat even
    // if they didn't in the source (e.g. a mock they never sat in). Claiming a
    // seat makes it human, not a bot.
    if (!rows.some((r) => r.owner_id === userId)) {
      rows[0].owner_id = userId;
      rows[0].is_bot = false;
      rows[0].auto_draft = false;
    }
    const { data: inserted, error: teamErr } = await supabaseAdmin
      .from('teams')
      .insert(rows)
      .select('id, draft_position');
    if (teamErr) {
      res.status(500).json({ error: teamErr.message });
      return;
    }
    for (const t of inserted ?? []) posToNewTeam.set(t.draft_position as number, t.id as string);
  } else {
    // No seats copied — just the commissioner's team in slot 1 (as normal create).
    const { data: myTeam, error: teamErr } = await supabaseAdmin
      .from('teams')
      .insert({
        lobby_id: lobby.id,
        owner_id: userId,
        name: (await usernameOf(userId)) ?? 'Team 1',
        draft_position: 1,
      })
      .select('id, draft_position')
      .single();
    if (teamErr) {
      res.status(500).json({ error: teamErr.message });
      return;
    }
    posToNewTeam.set(1, myTeam.id as string);
  }

  // Keeper candidate lists (offered pools), remapped to the new seats.
  if (include.keeperLists) {
    const { data: srcOptions } = await supabaseAdmin
      .from('keeper_options')
      .select('team_id, player_id, round, selected, is_default')
      .eq('lobby_id', sourceId);
    const optionRows = (srcOptions ?? [])
      .map((o) => {
        const pos = srcTeamPos.get(o.team_id as string);
        const newTeam = pos != null ? posToNewTeam.get(pos) : undefined;
        if (!newTeam) return null;
        return {
          lobby_id: lobby.id,
          team_id: newTeam,
          player_id: o.player_id,
          round: o.round,
          // Only mark kept if we're also carrying the assigned picks over.
          selected: include.keeperPicks && (o.selected as boolean),
          is_default: o.is_default,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (optionRows.length > 0) {
      const { error: optErr } = await supabaseAdmin.from('keeper_options').insert(optionRows);
      if (optErr) {
        res.status(500).json({ error: optErr.message });
        return;
      }
    }
  }

  // Assigned keepers — re-materialize is_keeper picks against the new settings.
  if (include.keeperPicks) {
    const maxRound = roundsForSettings(newSettings);
    const { data: srcKeepers } = await supabaseAdmin
      .from('picks')
      .select('team_id, player_id, round')
      .eq('lobby_id', sourceId)
      .eq('is_keeper', true);
    const pickRows = (srcKeepers ?? [])
      .map((k) => {
        const pos = srcTeamPos.get(k.team_id as string);
        const newTeam = pos != null ? posToNewTeam.get(pos) : undefined;
        if (!newTeam || pos == null || (k.round as number) > maxRound) return null;
        return {
          lobby_id: lobby.id,
          overall: overallForDraftPosition(
            k.round as number,
            pos,
            newSettings.teamCount,
            newSettings.draftType,
          ),
          round: k.round,
          team_id: newTeam,
          player_id: k.player_id,
          is_keeper: true,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (pickRows.length > 0) {
      const { error: pickErr } = await supabaseAdmin.from('picks').insert(pickRows);
      if (pickErr) {
        res.status(500).json({ error: pickErr.message });
        return;
      }
    }
  }

  // Original members (minus the copier) for the client's re-invite step.
  const { data: memberRows } = await supabaseAdmin
    .from('lobby_members')
    .select('user_id')
    .eq('lobby_id', sourceId);
  const otherIds = (memberRows ?? [])
    .map((m) => m.user_id as string)
    .filter((id) => id !== userId);
  let members: { userId: string; username: string | null; avatar: unknown }[] = [];
  if (otherIds.length > 0) {
    const { data: profs } = await supabaseAdmin
      .from('profiles')
      .select('id, username, avatar')
      .in('id', otherIds);
    members = (profs ?? []).map((p) => ({
      userId: p.id as string,
      username: (p.username as string | null) ?? null,
      avatar: p.avatar,
    }));
  }

  res.status(201).json({ lobby, members });
});

/**
 * POST /api/lobbies/:id/rename — commissioner renames the draft/lobby itself
 * (distinct from a team's name, see draft.ts's /team-name). Allowed any time
 * up until DRAFT_RESULTS_LOCK_MS (24h) after the draft completes — the same
 * window as the crown vote/grading lock, after which the lobby's identity is
 * considered final.
 */
lobbiesRouter.post('/:id/rename', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const parsed = renameLobbySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { name } = parsed.data;

  const { data: member } = await supabaseAdmin
    .from('lobby_members')
    .select('role')
    .eq('lobby_id', lobbyId)
    .eq('user_id', userId)
    .maybeSingle();
  const role = member?.role as string | undefined;
  if (role !== 'COMMISSIONER' && role !== 'SUB_COMMISSIONER') {
    res.status(403).json({ error: 'Only the commissioner can rename the draft' });
    return;
  }

  const { data: lobby } = await supabaseAdmin
    .from('lobbies')
    .select('status, completed_at, settings')
    .eq('id', lobbyId)
    .maybeSingle();
  if (!lobby) {
    res.status(404).json({ error: 'Lobby not found' });
    return;
  }
  if (lobby.status === 'COMPLETE' && lobby.completed_at) {
    const locked =
      Date.now() > new Date(lobby.completed_at as string).getTime() + DRAFT_RESULTS_LOCK_MS;
    if (locked) {
      res.status(409).json({
        error: 'The draft can no longer be renamed — it’s been over 24h since it ended',
      });
      return;
    }
  }

  // Keep the top-level column and the settings blob's own `name` in sync —
  // other code (e.g. the completion activity event) reads settings.name.
  const settings = { ...(lobby.settings as LobbySettings), name };
  const { error } = await supabaseAdmin
    .from('lobbies')
    .update({ name, settings })
    .eq('id', lobbyId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, name });
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

  const teamCount = (lobby.settings as { teamCount: number }).teamCount;
  const seat = await claimSeat(lobbyId, userId, teamCount, teamName);
  if (!seat.ok) {
    res.status(409).json({ error: seat.error });
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
  // Joining directly (e.g. via a shared link) also resolves any pending invite
  // notification, so it stops showing stale Join/Decline actions.
  await supabaseAdmin
    .from('lobby_invites')
    .update({ status: 'ACCEPTED' })
    .eq('lobby_id', lobbyId)
    .eq('invitee_id', userId);
  await supabaseAdmin
    .from('notifications')
    .update({ status: 'ACCEPTED' })
    .eq('user_id', userId)
    .eq('lobby_id', lobbyId)
    .eq('type', 'LOBBY_INVITE')
    .is('status', null);
  res.json({ joined: true });
});
