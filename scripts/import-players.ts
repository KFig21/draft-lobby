/**
 * Imports a real NFL player pool:
 *   • Fantasy Football Calculator ADP  → real names, positions, teams, ADP, bye weeks
 *   • Sleeper /players/nfl             → injury status + depth players beyond the ADP list
 *   • Projections are ESTIMATED from ADP rank (placeholder until a real feed is wired in)
 *
 * Usage: npm run db:seed  (reads server/.env for Supabase credentials)
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
type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';

interface PoolPlayer {
  name: string;
  position: Pos;
  nfl_team: string;
  bye_week: number | null;
  injury_status: string;
  proj_points: number | null;
  adp: number | null;
  prev_points: number | null;
  prev_rank: number | null;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// ── Fantasy Football Calculator ADP ─────────────────────────────────
interface FfcPlayer {
  name: string;
  position: string; // QB/RB/WR/TE/DEF/PK
  team: string;
  adp: number;
  bye: number;
}

async function fetchFfc(year: number): Promise<FfcPlayer[]> {
  const res = await fetch(
    `https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=12&year=${year}`,
  );
  if (!res.ok) throw new Error(`FFC responded ${res.status}`);
  const data = (await res.json()) as { status: string; players?: FfcPlayer[] };
  if (data.status !== 'Success' || !data.players?.length) {
    throw new Error(`FFC returned no ADP for ${year}`);
  }
  return data.players;
}

function ffcPosition(p: string): Pos | null {
  if (p === 'PK') return 'K';
  if (['QB', 'RB', 'WR', 'TE', 'DEF'].includes(p)) return p as Pos;
  return null;
}

// ── Sleeper (injuries + depth) ──────────────────────────────────────
interface SleeperPlayer {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  team?: string | null;
  position?: string | null;
  active?: boolean;
  injury_status?: string | null;
}

const INJURY_MAP: Record<string, string> = {
  questionable: 'QUESTIONABLE',
  doubtful: 'DOUBTFUL',
  out: 'OUT',
  ir: 'IR',
  pup: 'IR',
  sus: 'SUSPENDED',
  suspended: 'SUSPENDED',
};
const mapInjury = (s: string | null | undefined) =>
  (s && INJURY_MAP[s.toLowerCase()]) || 'ACTIVE';

async function fetchSleeper(): Promise<SleeperPlayer[] | null> {
  try {
    const res = await fetch('https://api.sleeper.app/v1/players/nfl');
    if (!res.ok) throw new Error(`Sleeper responded ${res.status}`);
    const data = (await res.json()) as Record<string, SleeperPlayer>;
    return Object.values(data);
  } catch (err) {
    console.warn('⚠️  Sleeper unavailable, skipping injury/depth enrichment:', String(err));
    return null;
  }
}

// ── Projection estimate (placeholder until a real feed) ─────────────
const POS_BASE: Record<Pos, number> = {
  QB: 380, RB: 285, WR: 275, TE: 205, K: 155, DEF: 135,
};
function estimateProjections(players: PoolPlayer[]): void {
  const byPos = new Map<Pos, PoolPlayer[]>();
  for (const p of players) {
    (byPos.get(p.position) ?? byPos.set(p.position, []).get(p.position)!).push(p);
  }
  for (const [pos, group] of byPos) {
    // Rank within position: ADP'd players first (by ADP), then the rest.
    group.sort((a, b) => (a.adp ?? 9999) - (b.adp ?? 9999));
    group.forEach((p, i) => {
      p.proj_points = Math.round(POS_BASE[pos] * Math.pow(0.985, i) * 10) / 10;
    });
  }
}

async function main() {
  // 1) ADP-ranked pool from FFC (try current season, fall back a year).
  let ffc: FfcPlayer[] = [];
  for (const year of [SEASON, SEASON - 1]) {
    try {
      ffc = await fetchFfc(year);
      console.log(`Fetched ${ffc.length} ADP players from FFC (${year})`);
      break;
    } catch (err) {
      console.warn(`  FFC ${year}: ${String(err)}`);
    }
  }
  if (!ffc.length) throw new Error('Could not fetch ADP data from FFC');

  const pool: PoolPlayer[] = [];
  const seen = new Set<string>(); // normalizedName|position
  const teamByeMap = new Map<string, number>(); // team -> bye (from FFC)

  for (const p of ffc) {
    const position = ffcPosition(p.position);
    if (!position) continue;
    if (p.team && p.bye) teamByeMap.set(p.team, p.bye);
    const name = position === 'DEF' ? `${p.team} D/ST` : p.name;
    const keyStr = `${normalize(name)}|${position}`;
    if (seen.has(keyStr)) continue;
    seen.add(keyStr);
    pool.push({
      name,
      position,
      nfl_team: p.team,
      bye_week: p.bye ?? null,
      injury_status: 'ACTIVE',
      proj_points: null,
      adp: p.adp,
      prev_points: null,
      prev_rank: null,
    });
  }

  // 2) Sleeper enrichment: injuries for known players + depth beyond ADP.
  const sleeper = await fetchSleeper();
  if (sleeper) {
    const injuryByKey = new Map<string, string>();
    let depthAdded = 0;
    for (const sp of sleeper) {
      const pos = sp.position;
      if (!pos || !['QB', 'RB', 'WR', 'TE', 'K'].includes(pos)) continue;
      const full = sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`.trim();
      if (!full) continue;
      const keyStr = `${normalize(full)}|${pos}`;
      if (sp.active && sp.injury_status) {
        injuryByKey.set(keyStr, mapInjury(sp.injury_status));
      }
      // Append active players not already in the ADP pool (real depth).
      if (sp.active && sp.team && !seen.has(keyStr)) {
        seen.add(keyStr);
        pool.push({
          name: full,
          position: pos as Pos,
          nfl_team: sp.team,
          bye_week: teamByeMap.get(sp.team) ?? null,
          injury_status: mapInjury(sp.injury_status),
          proj_points: null,
          adp: null,
          prev_points: null,
          prev_rank: null,
        });
        depthAdded++;
      }
    }
    // Apply injuries to the FFC-sourced rows.
    for (const p of pool) {
      const inj = injuryByKey.get(`${normalize(p.name)}|${p.position}`);
      if (inj) p.injury_status = inj;
    }
    console.log(`Sleeper: enriched injuries, added ${depthAdded} depth players`);
  }

  // 3) Estimated projections.
  estimateProjections(pool);

  // 4) Replace the table.
  console.log(`Clearing existing players…`);
  const { error: delError } = await supabase
    .from('players')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (delError) throw new Error(delError.message);

  console.log(`Inserting ${pool.length} players…`);
  for (let i = 0; i < pool.length; i += 500) {
    const chunk = pool.slice(i, i + 500);
    const { error } = await supabase.from('players').insert(chunk);
    if (error) throw new Error(error.message);
  }

  console.log(`✅ Imported ${pool.length} real players (projections estimated from ADP)`);
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
