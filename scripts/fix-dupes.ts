/**
 * ONE-OFF cleanup for the 5 normalized-name duplicate players found by
 * scan-dupes.ts. See that script + the PR discussion for the root cause.
 *
 * Per pair we keep the canonical (real-NFL-name) row and remove the stray:
 *   • Strays with no references         → delete the players row (cascades
 *     player_seasons / player_week_stats / favorite_players).
 *   • John Metchie stray                → repoint its 4 keeper_options to the
 *     canonical row first (no-cascade FK), then delete the players row.
 *   • Kenneth Walker stray              → its 2 picks sit in lobbies that also
 *     drafted the canonical row, so it can't be repointed (unique lobby_id,
 *     player_id) or pick-deleted (would hole the draft order). Just drop it
 *     from the pool by deleting its current-season player_seasons row; the
 *     players row + its 2 historical picks stay intact.
 *
 * Usage: npx tsx scripts/fix-dupes.ts        (reads server/.env, WRITES)
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
config({ path: join(root, 'server', '.env') });
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SEASON = new Date().getUTCFullYear();

const KW_KEEP = 'b8b4a7d2-fcfc-4687-991f-be1fbf199c41'; // Kenneth Walker III
const KW_STRAY = 'be8130ab-478d-4733-8666-e2df662f4ade'; // Kenneth Walker

const JM_KEEP = 'ea10a8ad-50aa-4cf7-8f8a-c2791d26b742'; // John Metchie III
const JM_STRAY = '93e7eafb-128a-4285-aa2e-b78fd55c0ca1'; // John Metchie

// Strays with zero references — delete outright.
const SIMPLE_DELETE: [string, string][] = [
  ['Brian Robinson', '53864eaa-03a3-43b1-b3be-00824ff34d43'],
  ['Mike Washington', 'e97d8d69-56f8-4e7a-a874-3837b02b93b3'],
  ['Theo Wease', '90745113-0e25-46cf-8c14-3a685cc3f3a3'],
];

async function deletePlayer(id: string) {
  const { error } = await sb.from('players').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

async function main() {
  // 1) Simple deletes (cascade handles their season/week/favorite rows).
  for (const [label, id] of SIMPLE_DELETE) {
    await deletePlayer(id);
    console.log(`✓ deleted stray "${label}" (${id.slice(0, 8)})`);
  }

  // 2) John Metchie — repoint keeper_options, then delete.
  const { error: koErr, count: koCount } = await sb
    .from('keeper_options')
    .update({ player_id: JM_KEEP }, { count: 'exact' })
    .eq('player_id', JM_STRAY);
  if (koErr) throw new Error(koErr.message);
  console.log(`✓ repointed ${koCount ?? 0} John Metchie keeper_options → canonical`);
  await deletePlayer(JM_STRAY);
  console.log(`✓ deleted stray "John Metchie" (${JM_STRAY.slice(0, 8)})`);

  // 3) Kenneth Walker — drop from the pool only (keep row + 2 picks).
  const { error: psErr, count: psCount } = await sb
    .from('player_seasons')
    .delete({ count: 'exact' })
    .eq('player_id', KW_STRAY)
    .eq('season', SEASON);
  if (psErr) throw new Error(psErr.message);
  console.log(
    `✓ removed stray "Kenneth Walker" from the ${SEASON} pool (deleted ${psCount ?? 0} player_seasons row; players row + picks kept). keep=${KW_KEEP.slice(0, 8)}`,
  );

  console.log('\n✅ cleanup complete');
}
main().catch((e) => {
  console.error('fix-dupes failed:', e.message);
  process.exit(1);
});
