import { Router, type Response } from 'express';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

const ACTIVITY_PAGE = 25;

interface PlayerLite {
  name: string;
  position: string;
  nflTeam: string;
}

/** One row in a profile's activity timeline — a discriminated union the
 * client turns into readable text. All carry a lobby link when they have one. */
interface ActivityItem {
  id: string;
  kind:
    | 'DRAFT_COMPLETED'
    | 'OPEN_LOBBY_CREATED'
    | 'PICK_REACTION'
    | 'MESSAGE_REACTION'
    | 'PICK_COMMENT';
  createdAt: string;
  lobbyId: string | null;
  lobbyName: string | null;
  emoji?: string;
  player?: PlayerLite;
  commentBody?: string;
}

interface LobbyVisibility {
  status: string;
  visibility: string;
  resultsPublic: boolean;
  chatPublic: boolean;
  isMember: boolean;
}

/**
 * Per-lobby visibility for the current viewer — mirrors the RLS gates from
 * migration 0020. Private drafts must never leak onto a profile: a lobby's
 * content only surfaces to a viewer who's a member, or once the draft is
 * COMPLETE and the relevant public flag is on. `results` gates picks/teams,
 * `chat` gates messages/reactions, `meta` gates the mere fact-of + name of
 * the draft (either public flag, or an OPEN lobby, exposes that much).
 */
function makeVisibility(v: LobbyVisibility | undefined) {
  if (!v) return { meta: false, results: false, chat: false };
  const complete = v.status === 'COMPLETE';
  return {
    meta:
      v.isMember ||
      v.visibility === 'OPEN' ||
      (complete && (v.resultsPublic || v.chatPublic)),
    results: v.isMember || (complete && v.resultsPublic),
    chat: v.isMember || (complete && v.chatPublic),
  };
}

/** Fetch visibility rows for `lobbyIds`, tagged with the viewer's membership. */
async function loadVisibility(
  lobbyIds: string[],
  viewerId: string,
): Promise<Map<string, LobbyVisibility>> {
  const map = new Map<string, LobbyVisibility>();
  if (lobbyIds.length === 0) return map;

  const { data: lobbies } = await supabaseAdmin
    .from('lobbies')
    .select('id, status, settings, results_public, chat_public')
    .in('id', lobbyIds);
  const { data: myMem } = await supabaseAdmin
    .from('lobby_members')
    .select('lobby_id')
    .eq('user_id', viewerId)
    .in('lobby_id', lobbyIds);
  const memberSet = new Set((myMem ?? []).map((m) => m.lobby_id as string));

  for (const l of lobbies ?? []) {
    map.set(l.id as string, {
      status: l.status as string,
      visibility: ((l.settings as { visibility?: string })?.visibility ?? 'PRIVATE') as string,
      resultsPublic: !!l.results_public,
      chatPublic: !!l.chat_public,
      isMember: memberSet.has(l.id as string),
    });
  }
  return map;
}

/**
 * Builds a user's activity timeline by merging three sources — lifecycle
 * events (drafts completed / lobbies opened), their reactions, and their
 * pick comments — into one time-ordered list, dropping anything from a
 * lobby the viewer isn't allowed to see. Over-fetches each source and
 * merges, same pattern as the home feed, so a single `before` cursor
 * paginates the combined stream without dropping rows at page seams.
 */
async function loadActivity(
  userId: string,
  viewerId: string,
  before: string | null,
): Promise<{ items: ActivityItem[]; nextCursor: string | null; hasMore: boolean }> {
  const cap = ACTIVITY_PAGE * 3;

  let eventsQ = supabaseAdmin
    .from('activity_events')
    .select('id, type, lobby_id, lobby_name, created_at')
    .eq('actor_id', userId)
    .in('type', ['DRAFT_COMPLETED', 'OPEN_LOBBY_CREATED'])
    .order('created_at', { ascending: false })
    .limit(cap);
  let reactionsQ = supabaseAdmin
    .from('chat_reactions')
    .select('id, lobby_id, target_type, target_id, emoji, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(cap);
  let commentsQ = supabaseAdmin
    .from('chat_messages')
    .select('id, lobby_id, body, reply_to_pick_id, created_at')
    .eq('user_id', userId)
    .not('reply_to_pick_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(cap);
  if (before) {
    eventsQ = eventsQ.lt('created_at', before);
    reactionsQ = reactionsQ.lt('created_at', before);
    commentsQ = commentsQ.lt('created_at', before);
  }

  const [eventsRes, reactionsRes, commentsRes] = await Promise.all([
    eventsQ,
    reactionsQ,
    commentsQ,
  ]);
  const events = eventsRes.data ?? [];
  const reactions = reactionsRes.data ?? [];
  const comments = commentsRes.data ?? [];

  // Visibility for every referenced lobby, from the viewer's perspective.
  const allLobbyIds = [
    ...new Set(
      [
        ...events.map((e) => e.lobby_id as string | null),
        ...reactions.map((r) => r.lobby_id as string | null),
        ...comments.map((c) => c.lobby_id as string | null),
      ].filter((x): x is string => !!x),
    ),
  ];
  const visMap = await loadVisibility(allLobbyIds, viewerId);
  const vis = (lobbyId: string | null) => makeVisibility(lobbyId ? visMap.get(lobbyId) : undefined);

  const keptEvents = events.filter((e) => vis(e.lobby_id as string | null).meta);
  const keptReactions = reactions.filter((r) => vis(r.lobby_id as string | null).chat);
  const keptComments = comments.filter((c) => vis(c.lobby_id as string | null).chat);

  // Resolve every surviving pick reference → player (PICK reactions + comments).
  const pickIds = new Set<string>();
  for (const r of keptReactions) if (r.target_type === 'PICK') pickIds.add(r.target_id as string);
  for (const c of keptComments) if (c.reply_to_pick_id) pickIds.add(c.reply_to_pick_id as string);

  const pickToPlayer = new Map<string, PlayerLite>();
  if (pickIds.size > 0) {
    const { data: picks } = await supabaseAdmin
      .from('picks')
      .select('id, player_id')
      .in('id', [...pickIds]);
    const playerIds = [...new Set((picks ?? []).map((p) => p.player_id as string))];
    const playerMap = new Map<string, PlayerLite>();
    if (playerIds.length > 0) {
      const { data: players } = await supabaseAdmin
        .from('players')
        .select('id, name, position, nfl_team')
        .in('id', playerIds);
      for (const p of players ?? []) {
        playerMap.set(p.id as string, {
          name: p.name as string,
          position: p.position as string,
          nflTeam: p.nfl_team as string,
        });
      }
    }
    for (const p of picks ?? []) {
      const player = playerMap.get(p.player_id as string);
      if (player) pickToPlayer.set(p.id as string, player);
    }
  }

  // Lobby names for reaction/comment rows (events already carry lobby_name).
  const nameLobbyIds = [
    ...new Set(
      [
        ...keptReactions.map((r) => r.lobby_id as string | null),
        ...keptComments.map((c) => c.lobby_id as string | null),
      ].filter((x): x is string => !!x),
    ),
  ];
  const lobbyNames = new Map<string, string>();
  if (nameLobbyIds.length > 0) {
    const { data: lobbies } = await supabaseAdmin
      .from('lobbies')
      .select('id, name')
      .in('id', nameLobbyIds);
    for (const l of lobbies ?? []) lobbyNames.set(l.id as string, l.name as string);
  }

  const items: ActivityItem[] = [];
  for (const e of keptEvents) {
    items.push({
      id: `evt:${e.id}`,
      kind: e.type as 'DRAFT_COMPLETED' | 'OPEN_LOBBY_CREATED',
      createdAt: e.created_at as string,
      lobbyId: (e.lobby_id as string) ?? null,
      lobbyName: (e.lobby_name as string) ?? null,
    });
  }
  for (const r of keptReactions) {
    const isPick = r.target_type === 'PICK';
    items.push({
      id: `rxn:${r.id}`,
      kind: isPick ? 'PICK_REACTION' : 'MESSAGE_REACTION',
      createdAt: r.created_at as string,
      lobbyId: (r.lobby_id as string) ?? null,
      lobbyName: r.lobby_id ? lobbyNames.get(r.lobby_id as string) ?? null : null,
      emoji: r.emoji as string,
      player: isPick ? pickToPlayer.get(r.target_id as string) : undefined,
    });
  }
  for (const c of keptComments) {
    items.push({
      id: `cmt:${c.id}`,
      kind: 'PICK_COMMENT',
      createdAt: c.created_at as string,
      lobbyId: (c.lobby_id as string) ?? null,
      lobbyName: c.lobby_id ? lobbyNames.get(c.lobby_id as string) ?? null : null,
      player: c.reply_to_pick_id ? pickToPlayer.get(c.reply_to_pick_id as string) : undefined,
      commentBody: (c.body as string) ?? undefined,
    });
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const page = items.slice(0, ACTIVITY_PAGE);
  // hasMore if ANY raw source came back full — there may be more behind the
  // cursor. Uses raw (pre-filter) counts so a page full of hidden rows still
  // keeps paging instead of stopping short.
  const hasMore =
    events.length === cap || reactions.length === cap || comments.length === cap;
  // Cursor is the oldest shown item — but if this whole batch was filtered out
  // for visibility (page empty) yet more raw rows exist, advance past the
  // oldest raw row so the next request doesn't just re-fetch the same hidden
  // ones and stall.
  let nextCursor: string | null = null;
  if (page.length > 0) {
    nextCursor = page[page.length - 1].createdAt;
  } else if (hasMore) {
    const rawTimes = [
      ...events.map((e) => e.created_at as string),
      ...reactions.map((r) => r.created_at as string),
      ...comments.map((c) => c.created_at as string),
    ].sort();
    nextCursor = rawTimes[0] ?? null;
  }
  return { items: page, nextCursor, hasMore };
}

/** Draft counts + most-picked players for the profile header, gated to the
 * lobbies the viewer is allowed to see (private drafts never counted). */
async function loadStats(userId: string, viewerId: string) {
  const { data: memberships } = await supabaseAdmin
    .from('lobby_members')
    .select('lobby_id, lobbies!inner ( status, settings, results_public, chat_public )')
    .eq('user_id', userId);

  const rows = (memberships ?? [])
    .map((m) => {
      const lobby = (Array.isArray(m.lobbies) ? m.lobbies[0] : m.lobbies) as
        | {
            status: string;
            settings: { draftMode?: string; visibility?: string };
            results_public: boolean;
            chat_public: boolean;
          }
        | undefined;
      return lobby ? { lobbyId: m.lobby_id as string, lobby } : null;
    })
    .filter((r): r is { lobbyId: string; lobby: NonNullable<typeof r>['lobby'] } => r !== null);

  const vis = await loadVisibility(
    rows.map((r) => r.lobbyId),
    viewerId,
  );

  let liveDrafts = 0;
  let mockDrafts = 0;
  let completedDrafts = 0;
  const resultsVisibleLobbyIds: string[] = [];
  for (const { lobbyId, lobby } of rows) {
    if (!makeVisibility(vis.get(lobbyId)).meta) continue;
    if (lobby.settings?.draftMode === 'MOCK') mockDrafts += 1;
    else liveDrafts += 1;
    if (lobby.status === 'COMPLETE') completedDrafts += 1;
    if (makeVisibility(vis.get(lobbyId)).results) resultsVisibleLobbyIds.push(lobbyId);
  }
  const totalDrafts = liveDrafts + mockDrafts;

  // Most-picked (+ total picks made): picks on teams this user owns,
  // restricted to lobbies whose results are visible to the viewer.
  let totalPicks = 0;
  const mostPicked: {
    playerId: string;
    name: string;
    position: string;
    nflTeam: string;
    count: number;
  }[] = [];
  if (resultsVisibleLobbyIds.length > 0) {
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('owner_id', userId)
      .in('lobby_id', resultsVisibleLobbyIds);
    const teamIds = (teams ?? []).map((t) => t.id as string);
    if (teamIds.length > 0) {
      const { data: picks } = await supabaseAdmin
        .from('picks')
        .select('player_id')
        .in('team_id', teamIds);
      totalPicks = (picks ?? []).length;
      const counts = new Map<string, number>();
      for (const p of picks ?? []) {
        counts.set(p.player_id as string, (counts.get(p.player_id as string) ?? 0) + 1);
      }
      const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (topIds.length > 0) {
        const { data: players } = await supabaseAdmin
          .from('players')
          .select('id, name, position, nfl_team')
          .in(
            'id',
            topIds.map(([id]) => id),
          );
        const playerMap = new Map((players ?? []).map((p) => [p.id as string, p]));
        for (const [id, count] of topIds) {
          const p = playerMap.get(id);
          if (!p) continue;
          mostPicked.push({
            playerId: id,
            name: p.name as string,
            position: p.position as string,
            nflTeam: p.nfl_team as string,
            count,
          });
        }
      }
    }
  }

  return { totalDrafts, liveDrafts, mockDrafts, completedDrafts, totalPicks, mostPicked };
}

interface PublicDraft {
  id: string;
  name: string;
  status: string;
  settings: {
    draftMode?: string;
    visibility?: string;
    teamCount?: number;
    draftType?: string;
    scoring?: unknown;
  };
  createdAt: string;
}

/** A lobby counts as "available to the public" independent of who's asking —
 * an OPEN lobby, or a COMPLETE one whose commissioner made results/chat
 * public. Unlike `makeVisibility`, this ignores viewer membership entirely:
 * the profile's Drafts tab is what a stranger would see, even when you're
 * looking at your own profile (the full picture, including private drafts,
 * is what the separate "My Drafts" page is for). */
function isPubliclyVisible(
  status: string,
  visibility: string,
  resultsPublic: boolean,
  chatPublic: boolean,
): boolean {
  return visibility === 'OPEN' || (status === 'COMPLETE' && (resultsPublic || chatPublic));
}

/** Draft list for the profile's Drafts tab — every lobby this user belongs
 * to that's publicly visible, newest first. */
async function loadPublicDrafts(userId: string): Promise<PublicDraft[]> {
  const { data: memberships } = await supabaseAdmin
    .from('lobby_members')
    .select(
      'lobbies!inner ( id, name, status, settings, created_at, results_public, chat_public )',
    )
    .eq('user_id', userId);

  type LobbyRow = {
    id: string;
    name: string;
    status: string;
    settings: PublicDraft['settings'];
    created_at: string;
    results_public: boolean;
    chat_public: boolean;
  };

  const lobbies = (memberships ?? [])
    .map((m) => (Array.isArray(m.lobbies) ? m.lobbies[0] : m.lobbies) as LobbyRow | undefined)
    .filter((l): l is LobbyRow => !!l)
    .filter((l) =>
      isPubliclyVisible(l.status, l.settings?.visibility ?? 'PRIVATE', !!l.results_public, !!l.chat_public),
    );

  return lobbies
    .map((l) => ({
      id: l.id,
      name: l.name,
      status: l.status,
      settings: l.settings,
      createdAt: l.created_at,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** GET /api/users/:userId/profile — identity, stats, and first activity page. */
usersRouter.get('/:userId/profile', async (req: AuthedRequest, res: Response) => {
  const userId = req.params.userId;
  const viewerId = req.user!.id;
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, username, avatar, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const [stats, activity] = await Promise.all([
    loadStats(userId, viewerId),
    loadActivity(userId, viewerId, null),
  ]);

  res.json({
    profile: {
      id: profile.id,
      username: profile.username,
      avatar: profile.avatar,
      createdAt: profile.created_at,
    },
    stats,
    items: activity.items,
    nextCursor: activity.nextCursor,
    hasMore: activity.hasMore,
  });
});

/** GET /api/users/:userId/activity?before= — paginated activity timeline. */
usersRouter.get('/:userId/activity', async (req: AuthedRequest, res: Response) => {
  const userId = req.params.userId;
  const viewerId = req.user!.id;
  const before = typeof req.query.before === 'string' ? req.query.before : null;
  const activity = await loadActivity(userId, viewerId, before);
  res.json(activity);
});

/** GET /api/users/:userId/drafts — publicly-visible drafts for the profile's
 * Drafts tab (not gated by the requesting viewer's own membership). */
usersRouter.get('/:userId/drafts', async (req: AuthedRequest, res: Response) => {
  const drafts = await loadPublicDrafts(req.params.userId);
  res.json({ drafts });
});

/** GET /api/users/:userId/friends — this user's accepted friends, for the
 * profile's read-only Friends tab (who they're friends with is not treated
 * as private — same as any other social app's public friends list). */
usersRouter.get('/:userId/friends', async (req: AuthedRequest, res: Response) => {
  const userId = req.params.userId;
  const { data: rows } = await supabaseAdmin
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'ACCEPTED')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  const friendIds = [
    ...new Set(
      (rows ?? []).map((r) =>
        r.requester_id === userId ? (r.addressee_id as string) : (r.requester_id as string),
      ),
    ),
  ];
  if (friendIds.length === 0) {
    res.json({ friends: [] });
    return;
  }
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, username, avatar')
    .in('id', friendIds);
  const friends = (profiles ?? [])
    .map((p) => ({ id: p.id as string, username: p.username as string, avatar: p.avatar }))
    .sort((a, b) => a.username.localeCompare(b.username));
  res.json({ friends });
});
