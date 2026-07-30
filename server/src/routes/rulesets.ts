import { Router, type Response } from 'express';
import { shareRulesetSchema } from '@draft-lobby/shared';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';

export const rulesetsRouter = Router();
rulesetsRouter.use(requireAuth);

/** Are `a` and `b` accepted friends (either direction)? */
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

/**
 * POST /api/rulesets/share
 * Creates a shareable snapshot of a scoring format or league setup and returns
 * its token id (for a /import/ruleset/<id> link). When `toUserId` is an
 * accepted friend, also drops a RULESET_SHARE notification in their feed.
 */
rulesetsRouter.post('/share', async (req: AuthedRequest, res: Response) => {
  const me = req.user!.id;
  const parsed = shareRulesetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { kind, name, payload, toUserId } = parsed.data;

  if (toUserId && toUserId === me) {
    res.status(400).json({ error: "You can't share with yourself" });
    return;
  }
  if (toUserId && !(await areFriends(me, toUserId))) {
    res.status(403).json({ error: 'You can only share with friends' });
    return;
  }

  const { data: shared, error } = await supabaseAdmin
    .from('shared_rulesets')
    .insert({ owner_id: me, kind, name, payload })
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
      snippet: name,
    });
  }

  res.json({ id: shared.id });
});
