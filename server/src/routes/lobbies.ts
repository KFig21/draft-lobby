import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Router, type Response } from 'express';
import {
  CHAT_LOCK_MS,
  DEFAULT_LOBBY_SETTINGS,
  DRAFT_RESULTS_LOCK_MS,
  canDeleteLobby,
  copyLobbySchema,
  createLobbyFromSharedSetupSchema,
  createLobbySchema,
  draftSetupSnapshotSchema,
  joinLobbySchema,
  lobbySettingsSchema,
  shareDraftSetupSchema,
  mergeEditableSettings,
  normalizeTiers,
  overallForDraftPosition,
  renameLobbySchema,
  roundsForSettings,
  updateLobbySettingsSchema,
  type LobbySettings,
  type LobbyStatus,
} from '@draft-lobby/shared';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { claimSeat, resyncKeepers, usernameOf } from '../draftEngine.js';
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

/** Are `a` and `b` accepted friends (either direction)? Mirrors rulesets.ts. */
async function areFriends(a: string, b: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('friendships')
    .select('id')
    .eq('status', 'ACCEPTED')
    .in('requester_id', [a, b])
    .in('addressee_id', [a, b])
    .limit(1);
  return !!data?.length;
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
      // The fantasy season this draft is for — same convention as the player
      // importer's SEASON. Tags the draft (My Drafts year badge/filter) and
      // will select its player_seasons data in Phase 2.
      season: new Date().getUTCFullYear(),
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
 * POST /api/lobbies/:id/share-setup — snapshot this draft's SETUP (settings +
 * team names/order + keeper lists + assigned keepers) into a token-readable
 * shared_rulesets row (kind DRAFT_SETUP) and, when `toUserId` is an accepted
 * friend, drop a RULESET_SHARE notification. The recipient materializes it into
 * a fresh lobby (see /from-shared-setup) — keepers and all. Members can share.
 */
lobbiesRouter.post('/:id/share-setup', async (req: AuthedRequest, res: Response) => {
  const sourceId = req.params.id;
  const me = req.user!.id;

  const parsed = shareDraftSetupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { toUserId } = parsed.data;

  const { data: membership } = await supabaseAdmin
    .from('lobby_members')
    .select('role')
    .eq('lobby_id', sourceId)
    .eq('user_id', me)
    .maybeSingle();
  if (!membership) {
    res.status(403).json({ error: 'Only members can share this draft' });
    return;
  }
  if (toUserId) {
    if (toUserId === me) {
      res.status(400).json({ error: "You can't share with yourself" });
      return;
    }
    if (!(await areFriends(me, toUserId))) {
      res.status(403).json({ error: 'You can only share with friends' });
      return;
    }
  }

  const { data: source } = await supabaseAdmin
    .from('lobbies')
    .select('name, settings')
    .eq('id', sourceId)
    .maybeSingle();
  if (!source) {
    res.status(404).json({ error: 'Draft not found' });
    return;
  }

  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id, name, draft_position, color, is_prev_champion, is_bot, auto_draft')
    .eq('lobby_id', sourceId)
    .order('draft_position');
  const posByTeam = new Map<string, number>(
    (teams ?? []).map((t) => [t.id as string, t.draft_position as number]),
  );

  const { data: opts } = await supabaseAdmin
    .from('keeper_options')
    .select('team_id, player_id, round, selected, is_default')
    .eq('lobby_id', sourceId);
  const { data: keepers } = await supabaseAdmin
    .from('picks')
    .select('team_id, player_id, round')
    .eq('lobby_id', sourceId)
    .eq('is_keeper', true);

  const snapshot = {
    settings: source.settings,
    teams: (teams ?? []).map((t) => ({
      name: t.name as string,
      draftPosition: t.draft_position as number,
      color: (t.color as string | null) ?? null,
      isPrevChampion: (t.is_prev_champion as boolean) ?? false,
      isBot: (t.is_bot as boolean) ?? false,
      autoDraft: (t.auto_draft as boolean) ?? false,
    })),
    keeperOptions: (opts ?? [])
      .map((o) => {
        const teamPos = posByTeam.get(o.team_id as string);
        if (teamPos == null) return null;
        return {
          teamPos,
          playerId: o.player_id as string,
          round: o.round as number,
          selected: (o.selected as boolean) ?? false,
          isDefault: (o.is_default as boolean) ?? false,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null),
    keeperPicks: (keepers ?? [])
      .map((k) => {
        const teamPos = posByTeam.get(k.team_id as string);
        if (teamPos == null) return null;
        return { teamPos, playerId: k.player_id as string, round: k.round as number };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null),
  };

  const validSnap = draftSetupSnapshotSchema.safeParse(snapshot);
  if (!validSnap.success) {
    res.status(400).json({ error: 'Could not snapshot this draft' });
    return;
  }

  const { data: shared, error } = await supabaseAdmin
    .from('shared_rulesets')
    .insert({ owner_id: me, kind: 'DRAFT_SETUP', name: source.name as string, payload: validSnap.data })
    .select('id')
    .single();
  if (error || !shared) {
    res.status(500).json({ error: error?.message ?? 'Failed to create share' });
    return;
  }

  if (toUserId) {
    await supabaseAdmin.from('notifications').insert({
      user_id: toUserId,
      actor_id: me,
      type: 'RULESET_SHARE',
      shared_ruleset_id: shared.id,
      snippet: source.name as string,
    });
  }

  res.json({ id: shared.id });
});

/**
 * POST /api/lobbies/from-shared-setup — materialize a shared DRAFT_SETUP snapshot
 * (see /share-setup) into a fresh SETUP lobby the caller commissions: settings,
 * seats (owners cleared, caller takes the first), and keepers pre-locked on the
 * board. Keeper player refs that no longer exist in the pool (e.g. a re-seeded
 * season) are skipped so a stale snapshot can't fail the whole import.
 */
lobbiesRouter.post('/from-shared-setup', async (req: AuthedRequest, res: Response) => {
  const me = req.user!.id;

  const parsed = createLobbyFromSharedSetupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { sharedId, name, draftMode } = parsed.data;

  const { data: shared } = await supabaseAdmin
    .from('shared_rulesets')
    .select('kind, payload')
    .eq('id', sharedId)
    .maybeSingle();
  if (!shared || shared.kind !== 'DRAFT_SETUP') {
    res.status(404).json({ error: 'Shared setup not found' });
    return;
  }
  const snap = draftSetupSnapshotSchema.safeParse(shared.payload);
  if (!snap.success) {
    res.status(400).json({ error: 'This shared setup is invalid' });
    return;
  }
  const bundle = snap.data;

  const merged: LobbySettings = {
    ...bundle.settings,
    name,
    draftMode,
    visibility: 'PRIVATE',
    scheduledStart: null,
  };
  const validated = lobbySettingsSchema.safeParse(merged);
  if (!validated.success) {
    res.status(400).json({ error: validated.error.flatten() });
    return;
  }
  const newSettings = validated.data;

  const { data: lobby, error } = await supabaseAdmin
    .from('lobbies')
    .insert({
      name,
      commissioner_id: me,
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
  if (error || !lobby) {
    res.status(500).json({ error: error?.message ?? 'Failed to create lobby' });
    return;
  }
  const { error: memberError } = await supabaseAdmin
    .from('lobby_members')
    .insert({ lobby_id: lobby.id, user_id: me, role: 'COMMISSIONER' });
  if (memberError) {
    res.status(500).json({ error: memberError.message });
    return;
  }

  const posToNewTeam = new Map<number, string>();
  if (bundle.teams.length > 0) {
    const sorted = [...bundle.teams].sort((a, b) => a.draftPosition - b.draftPosition);
    const rows = sorted.map((t, i) => ({
      lobby_id: lobby.id,
      // Caller takes the first seat (human); everyone else's is unowned (a human
      // seat to invite, or a bot that keeps drafting itself).
      owner_id: i === 0 ? me : null,
      name: t.name,
      draft_position: t.draftPosition,
      color: t.color ?? null,
      is_prev_champion: t.isPrevChampion ?? false,
      is_bot: i === 0 ? false : (t.isBot ?? false),
      auto_draft: i === 0 ? false : (t.autoDraft ?? false),
    }));
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
    const { data: myTeam, error: teamErr } = await supabaseAdmin
      .from('teams')
      .insert({
        lobby_id: lobby.id,
        owner_id: me,
        name: (await usernameOf(me)) ?? 'Team 1',
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

  // Which keeper player refs still exist in the pool — skip the rest.
  const keeperPlayerIds = [
    ...new Set([
      ...bundle.keeperOptions.map((o) => o.playerId),
      ...bundle.keeperPicks.map((k) => k.playerId),
    ]),
  ];
  let existingPlayers = new Set<string>();
  if (keeperPlayerIds.length > 0) {
    const { data: pl } = await supabaseAdmin
      .from('players')
      .select('id')
      .in('id', keeperPlayerIds);
    existingPlayers = new Set((pl ?? []).map((p) => p.id as string));
  }

  // Keeper candidate lists (offered pools), remapped to the new seats.
  if (bundle.keeperOptions.length > 0) {
    const optionRows = bundle.keeperOptions
      .map((o) => {
        const newTeam = posToNewTeam.get(o.teamPos);
        if (!newTeam || !existingPlayers.has(o.playerId)) return null;
        return {
          lobby_id: lobby.id,
          team_id: newTeam,
          player_id: o.playerId,
          round: o.round,
          selected: o.selected ?? false,
          is_default: o.isDefault ?? false,
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
  if (bundle.keeperPicks.length > 0) {
    const maxRound = roundsForSettings(newSettings);
    const pickRows = bundle.keeperPicks
      .map((k) => {
        const newTeam = posToNewTeam.get(k.teamPos);
        if (!newTeam || k.round > maxRound || !existingPlayers.has(k.playerId)) return null;
        return {
          lobby_id: lobby.id,
          overall: overallForDraftPosition(
            k.round,
            k.teamPos,
            newSettings.teamCount,
            newSettings.draftType,
          ),
          round: k.round,
          team_id: newTeam,
          player_id: k.playerId,
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

  res.status(201).json({ lobby });
});

/**
 * PATCH /api/lobbies/:id/settings — commissioner edits the lobby's settings.
 * Which fields actually take effect depends on how far the draft has progressed
 * (see mergeEditableSettings): everything pre-draft, scoring + clocks at STAGING,
 * clocks/skips only once DRAFTING/PAUSED, nothing once COMPLETE. Structural
 * changes (team count, draft type, roster) are additionally guarded so they
 * can't orphan seated teams or strand keepers.
 */
lobbiesRouter.patch('/:id/settings', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  const parsed = updateLobbySettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const incoming = parsed.data.settings;

  const { data: member } = await supabaseAdmin
    .from('lobby_members')
    .select('role')
    .eq('lobby_id', lobbyId)
    .eq('user_id', userId)
    .maybeSingle();
  const role = member?.role as string | undefined;
  if (role !== 'COMMISSIONER' && role !== 'SUB_COMMISSIONER') {
    res.status(403).json({ error: 'Only the commissioner can change settings' });
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
  const status = lobby.status as LobbyStatus;
  if (status === 'COMPLETE') {
    res.status(409).json({ error: 'Settings are locked once the draft is complete' });
    return;
  }
  const current = lobby.settings as LobbySettings;

  // Keep only the fields editable at this phase; the name is owned by /rename.
  const merged = mergeEditableSettings(current, incoming, status);
  merged.name = current.name;
  merged.pickTiers = normalizeTiers(merged.pickTiers, roundsForSettings(merged));

  // Structural changes are only reachable pre-draft, but guard regardless so a
  // change can't orphan a seated team or strand a keeper past the last round.
  const structuralChanged =
    merged.teamCount !== current.teamCount ||
    merged.draftType !== current.draftType ||
    JSON.stringify(merged.rosterComposition) !== JSON.stringify(current.rosterComposition);
  if (structuralChanged) {
    const { count: teamCount } = await supabaseAdmin
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('lobby_id', lobbyId);
    if ((teamCount ?? 0) > merged.teamCount) {
      res.status(400).json({
        error: `Can't drop to ${merged.teamCount} teams — ${teamCount} are already seated. Remove teams first.`,
      });
      return;
    }
    const newRounds = roundsForSettings(merged);
    const { data: deepestKeeper } = await supabaseAdmin
      .from('picks')
      .select('round')
      .eq('lobby_id', lobbyId)
      .eq('is_keeper', true)
      .order('round', { ascending: false })
      .limit(1)
      .maybeSingle();
    const maxKeeperRound = (deepestKeeper?.round as number | undefined) ?? 0;
    if (maxKeeperRound > newRounds) {
      res.status(400).json({
        error: `This roster is only ${newRounds} rounds but a keeper is set in round ${maxKeeperRound} — remove it first.`,
      });
      return;
    }
  }

  const { error } = await supabaseAdmin
    .from('lobbies')
    .update({ settings: merged })
    .eq('id', lobbyId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // A changed board shape moves where keepers sit — recompute their overalls.
  if (structuralChanged) await resyncKeepers(lobbyId, merged);

  res.json({ settings: merged });
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

/**
 * DELETE /api/lobbies/:id — commissioner permanently deletes a not-yet-drafting
 * lobby (SETUP/SCHEDULED/STAGING). Cascades to every child row (teams, picks,
 * keeper options, chat, reactions, votes, grades, memberships, invites,
 * notifications, activity — all `on delete cascade` from lobbies). Once the
 * draft is under way (DRAFTING/PAUSED/COMPLETE) the board is preserved and this
 * 409s — members hide it from their own lists (POST /:id/archive) instead.
 */
lobbiesRouter.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const lobbyId = req.params.id;
  const userId = req.user!.id;

  // Same commish gate as rename — commissioner or sub-commissioner (the client
  // shows the action to both, and this only ever touches a pre-draft lobby).
  const { data: member } = await supabaseAdmin
    .from('lobby_members')
    .select('role')
    .eq('lobby_id', lobbyId)
    .eq('user_id', userId)
    .maybeSingle();
  const role = member?.role as string | undefined;
  if (role !== 'COMMISSIONER' && role !== 'SUB_COMMISSIONER') {
    res.status(403).json({ error: 'Only the commissioner can delete this draft' });
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
  if (!canDeleteLobby(lobby.status as LobbyStatus)) {
    res.status(409).json({
      error: "This draft is under way — it can't be deleted. Hide it from your list instead.",
    });
    return;
  }

  const { error } = await supabaseAdmin.from('lobbies').delete().eq('id', lobbyId);
  if (error) {
    res.status(500).json({ error: 'Failed to delete the draft' });
    return;
  }
  res.json({ ok: true });
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
