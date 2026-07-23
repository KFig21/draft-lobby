/**
 * Imports a real NFL player pool:
 *   • Fantasy Football Calculator ADP  → real names, positions, teams, ADP, bye weeks
 *   • Sleeper /players/nfl             → injury status + depth players beyond the ADP list
 *   • Sleeper /stats/.../{lastSeason}  → real prev_points/prev_rank (PPR) + prev_stat_line
 *   • Sleeper /projections/.../{season} → real proj_points + proj_stat_line; proj_rank computed
 *     from final proj_points; ADP-rank estimate fills any proj_points gaps
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
  proj_rank: number | null;
  proj_stat_line: string | null;
  adp: number | null;
  prev_points: number | null;
  prev_rank: number | null;
  prev_stat_line: string | null;
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

// ── Sleeper (injuries + depth + the id map stats/projections key off) ──
interface SleeperPlayer {
  player_id?: string;
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

// Sleeper's own PPR fantasy points + positional PPR rank — no need to hand-roll
// a stats→points calculator, they already compute it the same way we score by
// default. The raw counting stats are only used for the compact stat-line text.
interface SleeperStatLine {
  pts_ppr?: number;
  pos_rank_ppr?: number;
  pass_yd?: number;
  pass_td?: number;
  pass_int?: number;
  rush_yd?: number;
  rush_td?: number;
  rec?: number;
  rec_yd?: number;
  rec_td?: number;
  fgm?: number;
  xpm?: number;
}

async function fetchSleeperStatsOrProjections(
  kind: 'stats' | 'projections',
  season: number,
): Promise<Record<string, SleeperStatLine> | null> {
  try {
    const res = await fetch(`https://api.sleeper.app/v1/${kind}/nfl/regular/${season}`);
    if (!res.ok) throw new Error(`Sleeper ${kind} responded ${res.status}`);
    return (await res.json()) as Record<string, SleeperStatLine>;
  } catch (err) {
    console.warn(`⚠️  Sleeper ${kind} (${season}) unavailable:`, String(err));
    return null;
  }
}

// A compact, position-appropriate summary of a stat line (real or projected).
function formatStatLine(pos: Pos, s: SleeperStatLine): string | null {
  const n = (x: number | undefined) => Math.round(x ?? 0).toLocaleString('en-US');
  switch (pos) {
    case 'QB':
      if (s.pass_yd == null) return null;
      return `${n(s.pass_yd)} YDS · ${n(s.pass_td)} TD · ${n(s.pass_int)} INT`;
    case 'RB':
      if (s.rush_yd == null) return null;
      return `${n(s.rush_yd)} YDS · ${n(s.rush_td)} TD · ${n(s.rec)} REC`;
    case 'WR':
    case 'TE':
      if (s.rec == null) return null;
      return `${n(s.rec)} REC · ${n(s.rec_yd)} YDS · ${n(s.rec_td)} TD`;
    case 'K':
      if (s.fgm == null) return null;
      return `${n(s.fgm)} FG · ${n(s.xpm)} XP`;
    case 'DEF':
      return null; // Sleeper keys DST stats differently — skip for now.
  }
}

// ── Projection estimate — fallback for anyone Sleeper has no real projection for ──
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
      proj_rank: null,
      proj_stat_line: null,
      adp: p.adp,
      prev_points: null,
      prev_rank: null,
      prev_stat_line: null,
    });
  }

  // 2) Sleeper enrichment: injuries for known players, depth beyond ADP, and
  // a normalized-name → sleeper player_id map for the stats/projections join
  // below (those endpoints are keyed by Sleeper's own player_id, not name).
  const sleeper = await fetchSleeper();
  const sleeperIdByKey = new Map<string, string>();
  if (sleeper) {
    const injuryByKey = new Map<string, string>();
    let depthAdded = 0;
    for (const sp of sleeper) {
      const pos = sp.position;
      if (!pos || !['QB', 'RB', 'WR', 'TE', 'K'].includes(pos)) continue;
      const full = sp.full_name ?? `${sp.first_name ?? ''} ${sp.last_name ?? ''}`.trim();
      if (!full) continue;
      const keyStr = `${normalize(full)}|${pos}`;
      if (sp.player_id) sleeperIdByKey.set(keyStr, sp.player_id);
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
          proj_rank: null,
          proj_stat_line: null,
          adp: null,
          prev_points: null,
          prev_rank: null,
          prev_stat_line: null,
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

  // 3) Baseline estimated projections for everyone, then overwrite with real
  // Sleeper data wherever it's available (real always wins over the estimate).
  estimateProjections(pool);

  const prevSeason = SEASON - 1;
  const [prevStats, projections] = await Promise.all([
    fetchSleeperStatsOrProjections('stats', prevSeason),
    fetchSleeperStatsOrProjections('projections', SEASON),
  ]);
  let realPrevCount = 0;
  let realProjCount = 0;
  if (prevStats || projections) {
    for (const p of pool) {
      if (p.position === 'DEF') continue; // Sleeper keys DST stats differently — skip for now.
      const sleeperId = sleeperIdByKey.get(`${normalize(p.name)}|${p.position}`);
      if (!sleeperId) continue;
      const prev = prevStats?.[sleeperId];
      if (prev?.pts_ppr != null) {
        p.prev_points = Math.round(prev.pts_ppr * 10) / 10;
        p.prev_rank = prev.pos_rank_ppr ?? null;
        p.prev_stat_line = formatStatLine(p.position, prev);
        realPrevCount++;
      }
      const proj = projections?.[sleeperId];
      if (proj?.pts_ppr != null) {
        p.proj_points = Math.round(proj.pts_ppr * 10) / 10;
        p.proj_stat_line = formatStatLine(p.position, proj);
        realProjCount++;
      }
    }
  }
  console.log(
    `Sleeper stats/projections: ${realPrevCount} players got real ${prevSeason} results, ` +
      `${realProjCount} got real ${SEASON} projections (rest use the ADP-rank estimate)`,
  );

  // Positional rank by final proj_points (after the estimate/real merge above),
  // same convention as prev_rank — lets the UI show "projected to move up/down".
  const byPos = new Map<Pos, PoolPlayer[]>();
  for (const p of pool) {
    (byPos.get(p.position) ?? byPos.set(p.position, []).get(p.position)!).push(p);
  }
  for (const group of byPos.values()) {
    group
      .filter((p) => p.proj_points != null)
      .sort((a, b) => (b.proj_points ?? 0) - (a.proj_points ?? 0))
      .forEach((p, i) => {
        p.proj_rank = i + 1;
      });
  }

  // 4) Upsert (never delete+reinsert) — picks.player_id has no cascade, so
  // generating a new id for a player who's already been drafted somewhere
  // would silently orphan that pick's history. Matching on (name, position)
  // keeps existing ids stable across re-runs and just refreshes their stats.
  console.log(`Upserting ${pool.length} players…`);
  for (let i = 0; i < pool.length; i += 500) {
    const chunk = pool.slice(i, i + 500);
    const { error } = await supabase
      .from('players')
      .upsert(chunk, { onConflict: 'name,position' });
    if (error) throw new Error(error.message);
  }

  console.log(`✅ Imported ${pool.length} real players`);
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
