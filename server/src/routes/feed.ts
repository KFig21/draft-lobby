import { Router, type Response } from 'express';
import { reactSchema } from '@draft-lobby/shared';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';

export const feedRouter = Router();
feedRouter.use(requireAuth);

interface EventRow {
  id: string;
  actor_id: string;
  type: 'DRAFT_COMPLETED' | 'FRIEND_ACCEPTED' | 'OPEN_LOBBY_CREATED';
  lobby_id: string | null;
  lobby_name: string | null;
  subject_id: string | null;
  subject_name: string | null;
  created_at: string;
}

async function friendIds(me: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'ACCEPTED')
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
  const ids = new Set<string>();
  for (const f of data ?? []) {
    ids.add(f.requester_id === me ? f.addressee_id : f.requester_id);
  }
  return [...ids];
}

/** GET /api/feed — pinned active lobbies + a friends-and-me activity timeline. */
feedRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const me = req.user!.id;
  const friends = await friendIds(me);
  const actors = [me, ...friends];

  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 50);
  const before = typeof req.query.before === 'string' ? req.query.before : null;

  // ── Pinned: my own in-progress lobbies (not archived) — first page only. ──
  let activeLobbies: unknown[] = [];
  if (!before) {
    const { data: myMemberships } = await supabaseAdmin
      .from('lobby_members')
      .select('lobby_id')
      .eq('user_id', me)
      .eq('archived', false);
    const myLobbyIds = (myMemberships ?? []).map((m) => m.lobby_id);
    if (myLobbyIds.length > 0) {
      const { data } = await supabaseAdmin
        .from('lobbies')
        .select('id, name, status, settings')
        .in('id', myLobbyIds)
        .in('status', ['SETUP', 'SCHEDULED', 'DRAFTING', 'PAUSED'])
        .order('created_at', { ascending: false });
      activeLobbies = data ?? [];
    }
  }

  // ── Timeline events from me + friends ──
  // Fetch extra raw events per page since grouping (see below) can collapse
  // several rows into one feed item.
  const rawLimit = Math.min(limit * 3, 200);
  let eventsQuery = supabaseAdmin
    .from('activity_events')
    .select('*')
    .in('actor_id', actors)
    .order('created_at', { ascending: false })
    .limit(rawLimit);
  if (before) eventsQuery = eventsQuery.lt('created_at', before);
  const { data: rawEvents } = await eventsQuery;
  const events = (rawEvents ?? []) as EventRow[];

  // Group completed drafts by lobby ("bob & 3 others completed a draft").
  const groups = new Map<string, EventRow[]>();
  for (const e of events) {
    const key =
      e.type === 'DRAFT_COMPLETED' && e.lobby_id ? `draft:${e.lobby_id}` : `single:${e.id}`;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }

  // Canonical id per group = earliest event; reactions attach there so every
  // viewer targets the same row.
  interface FeedGroup {
    id: string;
    type: EventRow['type'];
    createdAt: string;
    lobbyId: string | null;
    lobbyName: string | null;
    actorIds: string[];
    subjectId: string | null;
    subjectName: string | null;
  }
  const feedGroups: FeedGroup[] = [];
  for (const arr of groups.values()) {
    const byOldest = [...arr].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const canonical = byOldest[0];
    const newest = arr.reduce((n, e) => (e.created_at > n ? e.created_at : n), arr[0].created_at);
    feedGroups.push({
      id: canonical.id,
      type: canonical.type,
      createdAt: newest,
      lobbyId: canonical.lobby_id,
      lobbyName: canonical.lobby_name,
      actorIds: [...new Set(arr.map((e) => e.actor_id))],
      subjectId: canonical.subject_id,
      subjectName: canonical.subject_name,
    });
  }
  feedGroups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const page = feedGroups.slice(0, limit);

  // Lobby status + my membership for lobby-related items (drives "join up" vs
  // "view draft" links in the timeline).
  const lobbyIds = [...new Set(page.map((g) => g.lobbyId).filter((x): x is string => !!x))];
  const lobbyStatusMap = new Map<string, string>();
  const myLobbySet = new Set<string>();
  if (lobbyIds.length > 0) {
    const { data: lobbyRows } = await supabaseAdmin
      .from('lobbies')
      .select('id, status')
      .in('id', lobbyIds);
    for (const l of lobbyRows ?? []) lobbyStatusMap.set(l.id, l.status as string);
    const { data: mem } = await supabaseAdmin
      .from('lobby_members')
      .select('lobby_id')
      .eq('user_id', me)
      .in('lobby_id', lobbyIds);
    for (const m of mem ?? []) myLobbySet.add(m.lobby_id);
  }

  // Actor profiles.
  const allActorIds = [...new Set(page.flatMap((g) => g.actorIds))];
  const profileMap = new Map<string, { id: string; username: string; avatar: unknown }>();
  if (allActorIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, username, avatar')
      .in('id', allActorIds);
    for (const p of profiles ?? []) profileMap.set(p.id, p);
  }

  // Reactions on the canonical ids.
  const feedIds = page.map((g) => g.id);
  const reactionCounts = new Map<string, Record<string, number>>();
  const myReactions = new Map<string, string[]>();
  if (feedIds.length > 0) {
    const { data: reactions } = await supabaseAdmin
      .from('activity_reactions')
      .select('activity_id, user_id, emoji')
      .in('activity_id', feedIds);
    for (const r of reactions ?? []) {
      const counts = reactionCounts.get(r.activity_id) ?? {};
      counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
      reactionCounts.set(r.activity_id, counts);
      if (r.user_id === me) {
        myReactions.set(r.activity_id, [...(myReactions.get(r.activity_id) ?? []), r.emoji]);
      }
    }
  }

  const items = page.map((g) => ({
    id: g.id,
    type: g.type,
    createdAt: g.createdAt,
    lobbyId: g.lobbyId,
    lobbyName: g.lobbyName,
    lobbyStatus: g.lobbyId ? lobbyStatusMap.get(g.lobbyId) ?? null : null,
    isMember: g.lobbyId ? myLobbySet.has(g.lobbyId) : false,
    actors: g.actorIds.map((id) => profileMap.get(id)).filter(Boolean),
    subject: g.subjectName ? { id: g.subjectId, username: g.subjectName } : null,
    reactions: reactionCounts.get(g.id) ?? {},
    myReactions: myReactions.get(g.id) ?? [],
  }));

  // Cursor for the next page is the oldest raw event we fetched this time —
  // not the oldest item — so a group split across the page boundary can't
  // silently drop events.
  const nextCursor = events.length > 0 ? events[events.length - 1].created_at : null;
  const hasMore = events.length === rawLimit;

  res.json({ activeLobbies, items, nextCursor, hasMore });
});

/** POST /api/feed/:activityId/react — toggle an emoji reaction. */
feedRouter.post('/:activityId/react', async (req: AuthedRequest, res: Response) => {
  const me = req.user!.id;
  const activityId = req.params.activityId;
  const parsed = reactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { emoji } = parsed.data;

  const { data: existing } = await supabaseAdmin
    .from('activity_reactions')
    .select('id')
    .eq('activity_id', activityId)
    .eq('user_id', me)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin.from('activity_reactions').delete().eq('id', existing.id);
    res.json({ ok: true, reacted: false });
    return;
  }
  const { error } = await supabaseAdmin
    .from('activity_reactions')
    .insert({ activity_id: activityId, user_id: me, emoji });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ ok: true, reacted: true });
});
