import { Router, type Response } from 'express';
import {
  friendRequestSchema,
  friendRespondSchema,
  removeFriendSchema,
} from '@draft-lobby/shared';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';

export const socialRouter = Router();

// Public friend-invite routes (no auth) — a not-yet-registered recipient must
// be able to resolve who invited them before they have an account. Mounted at
// the same /api/friends base but BEFORE the authed router (see index.ts).
export const publicSocialRouter = Router();

socialRouter.use(requireAuth);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface InviteRow {
  inviter_id: string;
  revoked: boolean;
  expires_at: string | null;
}

/** Resolve a friend-invite token to a live invite row, or null (missing /
 * malformed / revoked / expired). */
async function liveInvite(token: string): Promise<InviteRow | null> {
  if (!UUID_RE.test(token)) return null;
  const { data } = await supabaseAdmin
    .from('friend_invites')
    .select('inviter_id, revoked, expires_at')
    .eq('token', token)
    .maybeSingle();
  const invite = data as InviteRow | null;
  if (!invite || invite.revoked) return null;
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return null;
  return invite;
}

/** Get the caller's current (non-revoked) invite token, minting one if none. */
async function currentInviteToken(userId: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('friend_invites')
    .select('token')
    .eq('inviter_id', userId)
    .eq('revoked', false)
    .maybeSingle();
  if (existing?.token) return existing.token as string;
  const { data: created, error } = await supabaseAdmin
    .from('friend_invites')
    .insert({ inviter_id: userId })
    .select('token')
    .single();
  if (error || !created) throw new Error(error?.message ?? 'Could not create invite');
  return created.token as string;
}

interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'PENDING' | 'ACCEPTED';
}

/** The friendship row between two users, if any (either direction). */
async function findFriendship(a: string, b: string): Promise<Friendship | null> {
  const { data } = await supabaseAdmin
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .in('requester_id', [a, b])
    .in('addressee_id', [a, b])
    .limit(1);
  return (data?.[0] as Friendship) ?? null;
}

async function profileExists(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  return !!data;
}

async function usernameOf(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle();
  return data?.username ?? null;
}

/** Record a "became friends" event (actor = accepter, subject = requester). */
async function recordFriendAccepted(accepter: string, requester: string): Promise<void> {
  await supabaseAdmin.from('activity_events').insert({
    actor_id: accepter,
    type: 'FRIEND_ACCEPTED',
    subject_id: requester,
    subject_name: await usernameOf(requester),
  });
}

/** POST /api/friends/request — send a friend request. */
socialRouter.post('/request', async (req: AuthedRequest, res: Response) => {
  const me = req.user!.id;
  const parsed = friendRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const target = parsed.data.userId;
  if (target === me) {
    res.status(400).json({ error: "You can't friend yourself" });
    return;
  }
  if (!(await profileExists(target))) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const existing = await findFriendship(me, target);
  if (existing) {
    if (existing.status === 'ACCEPTED') {
      res.status(409).json({ error: 'You are already friends' });
      return;
    }
    // They already requested you → accept it instead of creating a duplicate.
    if (existing.requester_id === target) {
      await supabaseAdmin
        .from('friendships')
        .update({ status: 'ACCEPTED', updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      await supabaseAdmin.from('notifications').insert({
        user_id: target,
        actor_id: me,
        type: 'FRIEND_ACCEPTED',
      });
      // Resolve the request notification target originally received (theirs, from me).
      await supabaseAdmin
        .from('notifications')
        .update({ status: 'ACCEPTED' })
        .eq('user_id', me)
        .eq('actor_id', target)
        .eq('type', 'FRIEND_REQUEST')
        .is('status', null);
      await recordFriendAccepted(me, target);
      res.json({ ok: true, status: 'ACCEPTED' });
      return;
    }
    res.status(409).json({ error: 'A request is already pending' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('friendships')
    .insert({ requester_id: me, addressee_id: target, status: 'PENDING' });
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  await supabaseAdmin.from('notifications').insert({
    user_id: target,
    actor_id: me,
    type: 'FRIEND_REQUEST',
  });
  res.json({ ok: true, status: 'PENDING' });
});

/** POST /api/friends/respond — accept or decline an incoming request. */
socialRouter.post('/respond', async (req: AuthedRequest, res: Response) => {
  const me = req.user!.id;
  const parsed = friendRespondSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { requesterId, accept } = parsed.data;

  const { data: friendship } = await supabaseAdmin
    .from('friendships')
    .select('id, status')
    .eq('requester_id', requesterId)
    .eq('addressee_id', me)
    .eq('status', 'PENDING')
    .maybeSingle();
  if (!friendship) {
    res.status(404).json({ error: 'No pending request from that user' });
    return;
  }

  // Resolve the original FRIEND_REQUEST notification regardless of accept/decline,
  // so it's not shown as still-actionable if it was answered elsewhere (e.g. Friends page).
  async function resolveRequestNotification(resolvedStatus: 'ACCEPTED' | 'DECLINED') {
    await supabaseAdmin
      .from('notifications')
      .update({ status: resolvedStatus })
      .eq('user_id', me)
      .eq('actor_id', requesterId)
      .eq('type', 'FRIEND_REQUEST')
      .is('status', null);
  }

  if (accept) {
    const { error } = await supabaseAdmin
      .from('friendships')
      .update({ status: 'ACCEPTED', updated_at: new Date().toISOString() })
      .eq('id', friendship.id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    await supabaseAdmin.from('notifications').insert({
      user_id: requesterId,
      actor_id: me,
      type: 'FRIEND_ACCEPTED',
    });
    await resolveRequestNotification('ACCEPTED');
    await recordFriendAccepted(me, requesterId);
    res.json({ ok: true, status: 'ACCEPTED' });
    return;
  }

  await supabaseAdmin.from('friendships').delete().eq('id', friendship.id);
  await resolveRequestNotification('DECLINED');
  res.json({ ok: true, status: 'DECLINED' });
});

/** POST /api/friends/remove — remove an existing friend. */
socialRouter.post('/remove', async (req: AuthedRequest, res: Response) => {
  const me = req.user!.id;
  const parsed = removeFriendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const other = parsed.data.userId;
  const existing = await findFriendship(me, other);
  if (existing) {
    await supabaseAdmin.from('friendships').delete().eq('id', existing.id);
  }
  res.json({ ok: true });
});

// ── Friend-invite links ─────────────────────────────────────────────

/**
 * GET /api/friends/invite/:token (PUBLIC) — who does this invite link belong
 * to? Returns the inviter's public profile so a recipient (possibly signed
 * out, possibly with no account yet) can see who invited them. 404 for a
 * missing/revoked/expired link.
 */
publicSocialRouter.get('/invite/:token', async (req, res: Response) => {
  const invite = await liveInvite(req.params.token);
  if (!invite) {
    res.status(404).json({ error: 'This invite link is invalid or has expired.' });
    return;
  }
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, username, avatar')
    .eq('id', invite.inviter_id)
    .maybeSingle();
  if (!profile) {
    res.status(404).json({ error: 'This invite link is invalid or has expired.' });
    return;
  }
  res.json({ inviter: profile });
});

/** POST /api/friends/invite — get (or mint) the caller's shareable link. */
socialRouter.post('/invite', async (req: AuthedRequest, res: Response) => {
  try {
    const token = await currentInviteToken(req.user!.id);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

/** POST /api/friends/invite/reset — revoke the current link and mint a new one. */
socialRouter.post('/invite/reset', async (req: AuthedRequest, res: Response) => {
  const me = req.user!.id;
  await supabaseAdmin
    .from('friend_invites')
    .update({ revoked: true })
    .eq('inviter_id', me)
    .eq('revoked', false);
  try {
    const token = await currentInviteToken(me);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

/**
 * POST /api/friends/invite/:token/redeem — the caller opened someone's invite
 * link. Because both sides opted in (the inviter minted the link, the caller
 * clicked it), this creates an *accepted* friendship straight away rather than
 * a pending request. Idempotent; opening your own link is a no-op.
 */
socialRouter.post('/invite/:token/redeem', async (req: AuthedRequest, res: Response) => {
  const me = req.user!.id;
  const invite = await liveInvite(req.params.token);
  if (!invite) {
    res.status(404).json({ error: 'This invite link is invalid or has expired.' });
    return;
  }
  const inviter = invite.inviter_id;

  const { data: inviterProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, username, avatar')
    .eq('id', inviter)
    .maybeSingle();
  if (!inviterProfile) {
    res.status(404).json({ error: 'This invite link is invalid or has expired.' });
    return;
  }

  // Opening your own link — nothing to do.
  if (inviter === me) {
    res.json({ ok: true, self: true, inviter: inviterProfile });
    return;
  }

  const existing = await findFriendship(me, inviter);
  if (existing?.status === 'ACCEPTED') {
    res.json({ ok: true, alreadyFriends: true, inviter: inviterProfile });
    return;
  }

  if (existing) {
    // A pending request in either direction — upgrade it to accepted.
    await supabaseAdmin
      .from('friendships')
      .update({ status: 'ACCEPTED', updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    // Clear any FRIEND_REQUEST notification I was sitting on from them.
    await supabaseAdmin
      .from('notifications')
      .update({ status: 'ACCEPTED' })
      .eq('user_id', me)
      .eq('actor_id', inviter)
      .eq('type', 'FRIEND_REQUEST')
      .is('status', null);
  } else {
    // Fresh friendship. The inviter is the "requester" (they made the link),
    // the redeemer accepted it — mirroring recordFriendAccepted's semantics.
    const { error } = await supabaseAdmin
      .from('friendships')
      .insert({ requester_id: inviter, addressee_id: me, status: 'ACCEPTED' });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
  }

  await supabaseAdmin.from('notifications').insert({
    user_id: inviter,
    actor_id: me,
    type: 'FRIEND_ACCEPTED',
  });
  await recordFriendAccepted(me, inviter);
  res.json({ ok: true, inviter: inviterProfile });
});
