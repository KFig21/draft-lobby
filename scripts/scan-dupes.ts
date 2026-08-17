/**
 * READ-ONLY diagnostic: scan the players table for duplicate rows whose names
 * collide under the importer's normalize() (suffix/punctuation-insensitive) but
 * are distinct raw (name, position) rows in the DB. These are the "two Kenneth
 * Walkers" bugs — a source feed renamed a player across runs, so a second row
 * was inserted and the reconcile step couldn't evict it (both normalize to the
 * same kept key). Also reports which duplicates currently sit in the SEASON pool.
 *
 * Usage: npx tsx scripts/scan-dupes.ts   (reads server/.env, no writes)
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
config({ path: join(root, 'server', '.env') });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in server/.env');
  process.exit(1);
}
const supabase = createClient(url, key);
const SEASON = new Date().getUTCFullYear();

// Same normalize() the importer dedupes with (scripts/import-players.ts).
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

interface Row {
  id: string;
  name: string;
  position: string;
}

async function fetchAll(): Promise<Row[]> {
  const acc: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('players')
      .select('id, name, position')
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Row[];
    acc.push(...batch);
    if (batch.length < 1000) break;
  }
  return acc;
}

async function fetchSeasonPlayerIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('player_seasons')
      .select('player_id')
      .eq('season', SEASON)
      .order('player_id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as { player_id: string }[];
    for (const r of batch) ids.add(r.player_id);
    if (batch.length < 1000) break;
  }
  return ids;
}

async function main() {
  const [rows, seasonIds] = await Promise.all([fetchAll(), fetchSeasonPlayerIds()]);
  console.log(`Scanned ${rows.length} player rows; ${seasonIds.size} in the ${SEASON} pool.\n`);

  // Group by normalized name + position.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${normalize(r.name)}|${r.position}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }

  const dupes = [...groups.entries()].filter(([, g]) => g.length > 1);
  // Sort so the ones that actually collide in the live pool surface first.
  const inPool = (g: Row[]) => g.filter((r) => seasonIds.has(r.id)).length;
  dupes.sort((a, b) => inPool(b[1]) - inPool(a[1]) || b[1].length - a[1].length);

  if (dupes.length === 0) {
    console.log('✅ No normalized-name duplicates found.');
    return;
  }

  let poolCollisions = 0;
  console.log(`Found ${dupes.length} normalized-name group(s) with >1 row:\n`);
  for (const [k, g] of dupes) {
    const poolCount = inPool(g);
    if (poolCount > 1) poolCollisions++;
    const flag = poolCount > 1 ? '  ⚠️  BOTH IN POOL' : poolCount === 1 ? '' : '  (neither in pool)';
    console.log(`• [${k}]${flag}`);
    for (const r of g) {
      console.log(`    - "${r.name}" (${r.position})  id=${r.id}  ${seasonIds.has(r.id) ? 'in-pool' : 'not-in-pool'}`);
    }
  }
  console.log(
    `\n${poolCollisions} group(s) have 2+ rows BOTH live in the ${SEASON} pool (the visible dupes).`,
  );
}

main().catch((err) => {
  console.error('Scan failed:', err.message);
  process.exit(1);
});
