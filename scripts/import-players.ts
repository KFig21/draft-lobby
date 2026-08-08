/**
 * Imports a real NFL player pool:
 *   • Fantasy Football Calculator ADP  → real names, positions, teams, ADP, bye weeks
 *   • Sleeper /players/nfl             → injury status + depth players beyond the ADP list
 *   • Sleeper /stats/.../{lastSeason}  → real prev_points/prev_rank (PPR) + prev_stat_line +
 *     prev_stats (raw per-category line, QB/RB/WR/TE — see toStatLine)
 *   • Sleeper /projections/.../{season} → real proj_points + proj_stat_line + proj_stats;
 *     proj_rank computed from final proj_points; ADP-rank estimate fills any proj_points gaps
 *
 * proj_stats/prev_stats let the app compute fantasy points under ANY scoring
 * format (shared/src/scoring.ts computeFantasyPoints) instead of only ever
 * showing Sleeper's own flat PPR total — used by bot draft picks, lineup
 * sort, player cards, and the rankings page alike.
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
  proj_stats: Record<string, number> | null;
  adp: number | null;
  prev_points: number | null;
  prev_rank: number | null;
  prev_stat_line: string | null;
  prev_stats: Record<string, number> | null;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Notable veterans who are routinely drafted but may be between teams / off a
// depth chart at import time — the Sleeper depth filter (depth_chart_order) would
// otherwise drop them. Force them in from Sleeper regardless; their team/injury
// still come from Sleeper (so a fresh signing like Stefon Diggs → WAS shows up
// automatically), falling back to "FA" when Sleeper has no team. Add names here.
const NOTABLE_INCLUDE = new Set(
  ['Keenan Allen', 'Nick Chubb', 'Darren Waller', 'Stefon Diggs', 'Taysom Hill', 'Deebo Samuel'].map(
    normalize,
  ),
);

// Clearly-retired players to drop from the *draftable* pool. Matched on
// name+position. We only remove their CURRENT-season player_seasons row (the app
// defines the pool by that row), never the players row itself — so any historical
// pick/keeper that references them stays intact. Extend this list as needed.
const RETIRED_EXCLUDE: { name: string; position: Pos }[] = [
  { name: 'Ben Roethlisberger', position: 'QB' },
];

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
  // Sleeper never purges long-retired players (they keep active:true / a stale
  // team indefinitely) — a null depth chart slot is what actually distinguishes
  // a real roster player from stale data like Ben Roethlisberger.
  depth_chart_order?: number | null;
}

// 32 standard team abbreviations, same convention FFC's ADP feed uses (already
// matches the ~23 D/ST entries that make it into the pool via ADP alone).
const ALL_NFL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB',
  'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
];

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

// Sleeper's own PPR fantasy points + positional PPR rank fill proj_points/
// prev_points as a fallback (used as-is for K/DEF, and for anyone missing a
// raw stat line below). The raw counting stats are the real payload now:
// persisted into proj_stats/prev_stats (via toStatLine below) so the app's
// own scoring engine (shared/src/scoring.ts computeFantasyPoints) can score
// every skill-position player under any lobby's actual rules, not just PPR.
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
  fum_lost?: number;
  fgm?: number;
  xpm?: number;
}

// Maps Sleeper's raw counting stats onto FOOTBALL_CATALOG keys (shared/src/
// scoring.ts) for QB/RB/WR/TE. K and DEF are left out on purpose: Sleeper's
// kicking line is a flat make/miss count while our catalog scores field
// goals in distance buckets Sleeper doesn't break out here, and Sleeper keys
// DST stats differently entirely — both keep using the flat pts_ppr fallback
// (proj_points/prev_points) instead of a guessed, likely-wrong mapping.
function toStatLine(pos: Pos, s: SleeperStatLine): Record<string, number> | null {
  switch (pos) {
    case 'QB':
    case 'RB':
    case 'WR':
    case 'TE':
      return {
        passingYards: s.pass_yd ?? 0,
        passingTd: s.pass_td ?? 0,
        interception: s.pass_int ?? 0,
        rushingYards: s.rush_yd ?? 0,
        rushingTd: s.rush_td ?? 0,
        reception: s.rec ?? 0,
        receivingYards: s.rec_yd ?? 0,
        receivingTd: s.rec_td ?? 0,
        fumbleLost: s.fum_lost ?? 0,
      };
    case 'K':
    case 'DEF':
      return null;
  }
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

// Per-WEEK stats for a completed season — the same endpoint as the season
// totals above, just with a week suffix. Powers player_week_stats.
async function fetchWeeklyStats(
  season: number,
  week: number,
): Promise<Record<string, SleeperStatLine> | null> {
  try {
    const res = await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`);
    if (!res.ok) throw new Error(`Sleeper weekly stats responded ${res.status}`);
    return (await res.json()) as Record<string, SleeperStatLine>;
  } catch (err) {
    console.warn(`⚠️  Sleeper weekly stats (${season} wk${week}) unavailable:`, String(err));
    return null;
  }
}

// Minimal CSV line parser — handles double-quoted fields containing commas
// (nflverse rows carry headshot URLs like ".../f_auto,q_auto/..."). No embedded
// newlines occur in this dataset, so line-by-line splitting upstream is safe.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

// Per-week opponent, keyed by `${normalize(name)}|${position}|${week}` — the same
// name+position join the rest of this importer uses. Sourced from nflverse's
// weekly player stats, whose `opponent_team` is derived from the actual game a
// player appeared in, so it's correct even when a player was traded mid-season
// (Sleeper's stats feed carries no team/opponent at all). Regular season only.
// (We join by name rather than GSIS id because Sleeper's gsis_id is null for
// most current skill players.)
async function fetchWeeklyOpponents(season: number): Promise<Map<string, string> | null> {
  try {
    const url = `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`nflverse weekly responded ${res.status}`);
    const lines = (await res.text()).split('\n');
    const header = parseCsvLine(lines[0]);
    const iNm = header.indexOf('player_display_name');
    const iPos = header.indexOf('position');
    const iWk = header.indexOf('week');
    const iType = header.indexOf('season_type');
    const iOpp = header.indexOf('opponent_team');
    const iTeam = header.indexOf('team');
    const iGame = header.indexOf('game_id');
    if (iNm < 0 || iPos < 0 || iWk < 0 || iOpp < 0)
      throw new Error('nflverse weekly: missing expected columns');
    const map = new Map<string, string>();
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const c = parseCsvLine(lines[i]);
      if (iType >= 0 && c[iType] !== 'REG') continue;
      const name = c[iNm];
      const pos = c[iPos];
      const wk = Number(c[iWk]);
      let opp = c[iOpp]?.trim();
      if (!name || !pos || !opp || !Number.isFinite(wk)) continue;
      // Away game? game_id is `{season}_{week}_{AWAY}_{HOME}`; prefix "@" (ESPN
      // style) when the player's team is the away side.
      const team = c[iTeam];
      const parts = (c[iGame] ?? '').split('_');
      const away = parts.length >= 4 && team && parts[2] === team;
      // nflverse abbreviates the Rams "LA"; the rest of the app uses "LAR".
      if (opp === 'LA') opp = 'LAR';
      map.set(`${normalize(name)}|${pos}|${wk}`, `${away ? '@' : ''}${opp}`);
    }
    return map;
  } catch (err) {
    console.warn(`⚠️  nflverse weekly opponents (${season}) unavailable:`, String(err));
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
      proj_stats: null,
      adp: p.adp,
      prev_points: null,
      prev_rank: null,
      prev_stat_line: null,
      prev_stats: null,
    });
  }

  // FFC's ADP feed only ranks defenses that actually get drafted in its mock
  // sample — usually ~23 of 32 in a 12-team PPR pool. Force-add every team's
  // D/ST so all 32 are always keeper/draft-eligible, not just the popular ones.
  let defsAdded = 0;
  for (const team of ALL_NFL_TEAMS) {
    const name = `${team} D/ST`;
    const keyStr = `${normalize(name)}|DEF`;
    if (seen.has(keyStr)) continue;
    seen.add(keyStr);
    pool.push({
      name,
      position: 'DEF',
      nfl_team: team,
      bye_week: teamByeMap.get(team) ?? null,
      injury_status: 'ACTIVE',
      proj_points: null,
      proj_rank: null,
      proj_stat_line: null,
      proj_stats: null,
      adp: null,
      prev_points: null,
      prev_rank: null,
      prev_stat_line: null,
      prev_stats: null,
    });
    defsAdded++;
  }
  if (defsAdded) console.log(`Added ${defsAdded} D/ST team(s) missing from ADP`);

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
      // Append active players not already in the ADP pool (real depth) — but
      // only ones actually slotted on a depth chart. Sleeper's `active` flag
      // alone isn't enough: it stays true indefinitely for players who
      // retired years ago (e.g. Ben Roethlisberger), while a real bench
      // player always carries a depth_chart_order. Notable veterans on the
      // curated list are force-included even without a depth slot (they may be
      // free agents), using their Sleeper team where known, else "FA".
      const notable = NOTABLE_INCLUDE.has(normalize(full));
      const rosterDepth = sp.team != null && sp.depth_chart_order != null;
      if (sp.active && (rosterDepth || notable) && !seen.has(keyStr)) {
        seen.add(keyStr);
        pool.push({
          name: full,
          position: pos as Pos,
          nfl_team: sp.team ?? 'FA',
          bye_week: sp.team ? (teamByeMap.get(sp.team) ?? null) : null,
          injury_status: mapInjury(sp.injury_status),
          proj_points: null,
          proj_rank: null,
          proj_stat_line: null,
          proj_stats: null,
          adp: null,
          prev_points: null,
          prev_rank: null,
          prev_stat_line: null,
          prev_stats: null,
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
        p.prev_stats = toStatLine(p.position, prev);
        realPrevCount++;
      }
      const proj = projections?.[sleeperId];
      if (proj?.pts_ppr != null) {
        p.proj_points = Math.round(proj.pts_ppr * 10) / 10;
        p.proj_stat_line = formatStatLine(p.position, proj);
        p.proj_stats = toStatLine(p.position, proj);
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
  //
  // The flat columns are still written (they back the read path until Phase 2's
  // read-path deploy switches over and a later cleanup migration drops them),
  // and .select() hands back each player's stable id so we can also write the
  // season-scoped rows below. See docs/phase2-player-seasons.md.
  console.log(`Upserting ${pool.length} players…`);
  const idByKey = new Map<string, string>();
  for (let i = 0; i < pool.length; i += 500) {
    const chunk = pool.slice(i, i + 500);
    const { data, error } = await supabase
      .from('players')
      .upsert(chunk, { onConflict: 'name,position' })
      .select('id, name, position');
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      idByKey.set(`${normalize(row.name)}|${row.position}`, row.id);
    }
  }

  // 4b) Season-scoped rows (player_seasons): the projection made FOR this SEASON
  // and last season's ACTUALS, each in the season it belongs to. Idempotent on
  // (player_id, season), so re-runs update the same rows and never touch other
  // years. Skips any player whose id we couldn't resolve above (shouldn't
  // happen — every pool row was just upserted).
  const curRows: Record<string, unknown>[] = [];
  const prevRows: Record<string, unknown>[] = [];
  for (const p of pool) {
    const playerId = idByKey.get(`${normalize(p.name)}|${p.position}`);
    if (!playerId) continue;

    // Current season: projection + draft-prep bio.
    curRows.push({
      player_id: playerId,
      season: SEASON,
      nfl_team: p.nfl_team,
      bye_week: p.bye_week,
      injury_status: p.injury_status,
      adp: p.adp,
      proj_points: p.proj_points,
      proj_rank: p.proj_rank,
      proj_stat_line: p.proj_stat_line,
      proj_stats: p.proj_stats,
    });

    // Prior season: actuals only (bio isn't re-derivable for a past year).
    const hasPrev =
      p.prev_points != null ||
      p.prev_rank != null ||
      p.prev_stat_line != null ||
      p.prev_stats != null;
    if (hasPrev) {
      prevRows.push({
        player_id: playerId,
        season: SEASON - 1,
        act_points: p.prev_points,
        act_rank: p.prev_rank,
        act_stat_line: p.prev_stat_line,
        act_stats: p.prev_stats,
      });
    }
  }

  // Upsert the two shapes in SEPARATE batches. supabase-js unions the keys
  // across a batch and sends NULL for any column a given row omits — so mixing
  // current rows (which set injury_status) with prior rows (which don't) made
  // the prior rows send injury_status = NULL and trip its NOT NULL. Homogeneous
  // batches let the prior rows omit it entirely and fall back to the column
  // default ('ACTIVE'); the bio columns they omit are nullable.
  console.log(
    `Upserting ${curRows.length} current-season + ${prevRows.length} prior-season rows…`,
  );
  for (const rows of [curRows, prevRows]) {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase
        .from('player_seasons')
        .upsert(chunk, { onConflict: 'player_id,season' });
      if (error) throw new Error(error.message);
    }
  }

  // 4c) Weekly actuals for the prior season → player_week_stats. Same raw stat
  // line as the season totals, one row per week a player actually played
  // (absent week = bye / DNP). Read lazily by the deep-stats modal, which scores
  // each week under the league's rules and ranks within position. Idempotent on
  // (player_id, season, week). D/ST is skipped (Sleeper keys DST differently);
  // K carries only pts_ppr/pos_rank_ppr (no mapped raw line).
  // Trade-correct per-week opponents (nflverse), joined by GSIS id below.
  const opponents = await fetchWeeklyOpponents(prevSeason);
  const weekRows: Record<string, unknown>[] = [];
  for (let week = 1; week <= 18; week++) {
    const wk = await fetchWeeklyStats(prevSeason, week);
    if (!wk) continue;
    for (const p of pool) {
      if (p.position === 'DEF') continue;
      const key = `${normalize(p.name)}|${p.position}`;
      const playerId = idByKey.get(key);
      const sleeperId = sleeperIdByKey.get(key);
      if (!playerId || !sleeperId) continue;
      const s = wk[sleeperId];
      if (!s || s.pts_ppr == null) continue; // absent = bye / DNP that week
      weekRows.push({
        player_id: playerId,
        position: p.position,
        season: prevSeason,
        week,
        opp: opponents?.get(`${key}|${week}`) ?? null,
        stats: toStatLine(p.position, s),
        pts_ppr: Math.round((s.pts_ppr ?? 0) * 10) / 10,
        pos_rank_ppr: s.pos_rank_ppr ?? null,
      });
    }
  }
  if (opponents) {
    const withOpp = weekRows.filter((r) => r.opp).length;
    console.log(`  matched opponents for ${withOpp}/${weekRows.length} weekly rows`);
  }
  console.log(`Upserting ${weekRows.length} weekly stat rows (${prevSeason})…`);
  for (let i = 0; i < weekRows.length; i += 500) {
    const chunk = weekRows.slice(i, i + 500);
    const { error } = await supabase
      .from('player_week_stats')
      .upsert(chunk, { onConflict: 'player_id,season,week' });
    if (error) throw new Error(error.message);
  }

  // 5) Drop clearly-retired players from the draftable pool by removing their
  // CURRENT-season row. The players row (and any pick/keeper/favorite pointing at
  // it) is left untouched — the app just stops listing them because the pool is
  // defined by current-season player_seasons rows (client/src/hooks/usePlayers).
  let retiredRemoved = 0;
  for (const r of RETIRED_EXCLUDE) {
    const { data: rows, error } = await supabase
      .from('players')
      .select('id')
      .eq('name', r.name)
      .eq('position', r.position);
    if (error) throw new Error(error.message);
    for (const row of rows ?? []) {
      const { error: delErr } = await supabase
        .from('player_seasons')
        .delete()
        .eq('player_id', row.id)
        .eq('season', SEASON);
      if (delErr) throw new Error(delErr.message);
      retiredRemoved++;
    }
  }
  if (retiredRemoved) console.log(`Removed ${retiredRemoved} retired player(s) from the ${SEASON} pool`);

  console.log(`✅ Imported ${pool.length} real players`);
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
