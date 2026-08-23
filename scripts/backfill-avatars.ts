/**
 * Backfills a random on-theme avatar (emoji + colored shape) onto every profile
 * whose `avatar` is NULL — early accounts that signed up before avatars were
 * auto-assigned, which otherwise render blank anywhere the UI shows only the
 * stored avatar (e.g. the "Send to a friend" picker).
 *
 * Uses the same palette convention as shared/src/avatar.ts (AVATAR_BG_COLORS +
 * AVATAR_EMOJI_CHOICES + AvatarShape) so backfilled avatars look native.
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in server/.env (service role,
 * so it can write past RLS).
 *
 * Usage:
 *   node --experimental-strip-types scripts/backfill-avatars.ts            # apply
 *   node --experimental-strip-types scripts/backfill-avatars.ts --dry-run  # preview only
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
config({ path: join(root, 'server', '.env') });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in server/.env');
  process.exit(1);
}
const supabase = createClient(url, key);

const dryRun = process.argv.includes('--dry-run');

// Mirrors shared/src/avatar.ts (kept in sync by hand — this is a one-off tool).
const AVATAR_BG_COLORS = [
  '#6c5ce7', '#3fd6a5', '#4aa8ff', '#f6a642', '#f8577d',
  '#b98bff', '#00b894', '#fdcb6e', '#ff6b6b', '#00d2d3',
] as const;
const AVATAR_EMOJI_CHOICES = [
  '🏈', '🏆', '🔥', '💪', '🐐', '⚡', '🎯', '👑',
  '🤖', '🦅', '🐻', '🦁', '🐬', '😎', '🤠', '👽',
] as const;
const AVATAR_SHAPES = ['circle', 'rounded', 'square'] as const;

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randomAvatar = () => ({
  emoji: pick(AVATAR_EMOJI_CHOICES),
  bgColor: pick(AVATAR_BG_COLORS),
  shape: pick(AVATAR_SHAPES),
});

async function main() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .is('avatar', null);
  if (error) {
    console.error('Failed to read profiles:', error.message);
    process.exit(1);
  }
  const rows = (data ?? []) as { id: string; username: string | null }[];
  if (rows.length === 0) {
    console.log('No profiles are missing an avatar. Nothing to do.');
    return;
  }

  console.log(`${rows.length} profile(s) missing an avatar${dryRun ? ' (dry run)' : ''}:`);
  let updated = 0;
  for (const row of rows) {
    const avatar = randomAvatar();
    const who = row.username ?? row.id;
    if (dryRun) {
      console.log(`  would set ${who} → ${avatar.emoji} ${avatar.bgColor} ${avatar.shape}`);
      continue;
    }
    const { error: upErr } = await supabase
      .from('profiles')
      .update({ avatar })
      .eq('id', row.id);
    if (upErr) {
      console.error(`  ✗ ${who}: ${upErr.message}`);
      continue;
    }
    console.log(`  ✓ ${who} → ${avatar.emoji} ${avatar.bgColor} ${avatar.shape}`);
    updated++;
  }
  console.log(dryRun ? 'Dry run complete.' : `Done. Updated ${updated}/${rows.length}.`);
}

main().catch((err) => {
  console.error('Backfill failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
