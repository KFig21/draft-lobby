import { Router, type Response } from 'express';
import {
  friendRequestSchema,
  friendRespondSchema,
  removeFriendSchema,
} from '@draft-lobby/shared';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';

export const socialRouter = Router();
socialRouter.use(requireAuth);

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
    res.json({ ok: true, status: 'ACCEPTED' });
    return;
  }

  await supabaseAdmin.from('friendships').delete().eq('id', friendship.id);
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
