/**
 * Imports a real NFL player pool:
 *   • Fantasy Football Calculator ADP  → real names, positions, teams, ADP, bye weeks
 *   • Sleeper /players/nfl             → injury status + depth players beyond the ADP list
 *   • Sleeper /stats/.../{lastSeason}  → real prev_points/prev_rank (PPR) + prev_stat_line +
 *     prev_stats (raw per-category line, QB/RB/WR/TE — see toStatLine)
 *   • Sleeper /projections/.../{season} → real proj_points + proj_stat_line + proj_stats.
 *     Sleeper's projection feed is the source of truth for who produces: a skill
 *     player (QB/RB/WR/TE) it doesn't project is a backup/deep body, so they get a
 *     small floor (never a fabricated starter total) — and if they're ALSO off every
 *     Sleeper depth chart they're dropped as retired. K/DEF keep the positional
 *     estimate (Sleeper doesn't cover DST). proj_rank computed from final points.
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
import { randomUUID } from 'node:crypto';
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

// Manual override on top of the AUTOMATIC retired gate in main() (a skill player
// off every Sleeper depth chart AND unprojected is dropped on its own). Use this
// only for judgment calls the data can't make — e.g. someone Sleeper still lists
// on a depth chart but who won't realistically play. Matched on name+position. We
// only remove their CURRENT-season player_seasons row (the app defines the pool by
// that row), never the players row itself — so any historical pick/keeper that
// references them stays intact. (The inverse escape hatch — force-keeping someone
// the auto gate would drop — is NOTABLE_INCLUDE above.)
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
//
// The same feed also yields each team's schedule, which we distill into two
// extras: every team's real bye week (the one week 1–18 it didn't play) and the
// team(s) each player appeared for. Together these let the importer synthesize
// an explicit bye row per player (below), so the deep-stats modal can tell a
// true bye from an in-season DNP instead of guessing.
interface WeeklySchedule {
  /** `${normName}|${pos}|${week}` → opponent (with "@" for away). */
  opponents: Map<string, string>;
  /** team abbreviation → its bye week (only when exactly one week is missing). */
  teamBye: Map<string, number>;
  /** `${normName}|${pos}` → the set of teams it played for (>1 = traded). */
  playerTeams: Map<string, Set<string>>;
}

// nflverse abbreviates the Rams "LA"; the rest of the app uses "LAR".
const fixTeam = (t: string): string => (t === 'LA' ? 'LAR' : t);

async function fetchWeeklyOpponents(season: number): Promise<WeeklySchedule | null> {
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
    const opponents = new Map<string, string>();
    const teamWeeks = new Map<string, Set<number>>(); // team → weeks it played
    const playerTeams = new Map<string, Set<string>>();
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const c = parseCsvLine(lines[i]);
      if (iType >= 0 && c[iType] !== 'REG') continue;
      const name = c[iNm];
      const pos = c[iPos];
      const wk = Number(c[iWk]);
      if (!name || !pos || !Number.isFinite(wk)) continue;
      const team = c[iTeam] ? fixTeam(c[iTeam].trim()) : '';

      // Schedule bookkeeping (independent of whether opp parses) — a valid
      // team+week means that team played that week, and this player was on it.
      if (team) {
        (teamWeeks.get(team) ?? teamWeeks.set(team, new Set()).get(team)!).add(wk);
        const pkey = `${normalize(name)}|${pos}`;
        (playerTeams.get(pkey) ?? playerTeams.set(pkey, new Set()).get(pkey)!).add(team);
      }

      let opp = c[iOpp]?.trim();
      if (!opp) continue;
      // Away game? game_id is `{season}_{week}_{AWAY}_{HOME}`; prefix "@" (ESPN
      // style) when the player's team is the away side.
      const parts = (c[iGame] ?? '').split('_');
      const away = parts.length >= 4 && c[iTeam] && parts[2] === c[iTeam];
      opp = fixTeam(opp);
      opponents.set(`${normalize(name)}|${pos}|${wk}`, `${away ? '@' : ''}${opp}`);
    }

    // Each team's bye = the single week in 1–18 it didn't play. Skip any team
    // where that isn't cleanly one week (bad/partial data) — better a DNP than a
    // wrong bye.
    const teamBye = new Map<string, number>();
    for (const [team, weeks] of teamWeeks) {
      const missing: number[] = [];
      for (let w = 1; w <= 18; w++) if (!weeks.has(w)) missing.push(w);
      if (missing.length === 1) teamBye.set(team, missing[0]);
    }

    return { opponents, teamBye, playerTeams };
  } catch (err) {
    console.warn(`⚠️  nflverse weekly schedule (${season}) unavailable:`, String(err));
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

// ── Projection fallback — fills proj_points ONLY where Sleeper has no real one ──
// K/DEF get a full positional estimate: Sleeper's projection feed doesn't cover
// DST and is spotty for kickers, so the estimate is their only ranking signal.
const POS_BASE: Record<Pos, number> = {
  QB: 380, RB: 285, WR: 275, TE: 205, K: 155, DEF: 135,
};
// Skill positions (QB/RB/WR/TE) are different: a REAL Sleeper projection means
// "expected to contribute". A skill player Sleeper DOESN'T project is a backup /
// deep-roster body — so instead of a fabricated starter total they fall to this
// small floor, decayed by ADP rank so backups still order among themselves but
// land far below any real starter (which is why a #3 QB no longer reads ~200 pts).
const SKILL_FLOOR_BASE: Record<Pos, number> = {
  QB: 55, RB: 45, WR: 45, TE: 32, K: 0, DEF: 0,
};
const SKILL_POS = new Set<Pos>(['QB', 'RB', 'WR', 'TE']);

// Fill proj_points for anyone Sleeper left blank. Real Sleeper projections
// (applied before this) are never overwritten — only the gaps get filled: skill
// backups to their small floor, K/DEF to the positional estimate.
function fillMissingProjections(players: PoolPlayer[]): void {
  const byPos = new Map<Pos, PoolPlayer[]>();
  for (const p of players) {
    (byPos.get(p.position) ?? byPos.set(p.position, []).get(p.position)!).push(p);
  }
  for (const [pos, group] of byPos) {
    const base = SKILL_POS.has(pos) ? SKILL_FLOOR_BASE[pos] : POS_BASE[pos];
    // Rank within position: ADP'd players first (by ADP), then the rest — so the
    // decay index tracks draftability (a rostered backup edges out a camp body).
    group.sort((a, b) => (a.adp ?? 9999) - (b.adp ?? 9999));
    group.forEach((p, i) => {
      if (p.proj_points != null) return; // never clobber a real Sleeper projection
      p.proj_points = Math.round(base * Math.pow(0.985, i) * 10) / 10;
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

  let pool: PoolPlayer[] = [];
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
  // Keys (normalizedName|pos) Sleeper lists on an actual depth chart — a non-null
  // depth_chart_order with a team. This is the "on an NFL roster" signal: Sleeper's
  // `active` flag is useless (it stays true for players who retired years ago),
  // while a null depth slot is what actually flags stale/retired data. Drives the
  // retired gate below.
  const depthChartKeys = new Set<string>();
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
      if (sp.team != null && sp.depth_chart_order != null) depthChartKeys.add(keyStr);
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

  // 3) Apply the REAL Sleeper stats/projections. Anything Sleeper leaves blank is
  // filled afterward (fillMissingProjections, below the retired gate) so real data
  // always wins and we never fabricate a projection over a real one.
  const prevSeason = SEASON - 1;
  const [prevStats, projections] = await Promise.all([
    fetchSleeperStatsOrProjections('stats', prevSeason),
    fetchSleeperStatsOrProjections('projections', SEASON),
  ]);
  let realPrevCount = 0;
  let realProjCount = 0;
  // Keys (normalizedName|pos) that got a REAL Sleeper projection — the "expected to
  // contribute in {SEASON}" signal. Used to leave their points untouched in
  // fillMissingProjections AND to keep them out of the retired gate below.
  const realProjKeys = new Set<string>();
  if (prevStats || projections) {
    for (const p of pool) {
      if (p.position === 'DEF') continue; // Sleeper keys DST stats differently — skip for now.
      const key = `${normalize(p.name)}|${p.position}`;
      const sleeperId = sleeperIdByKey.get(key);
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
        realProjKeys.add(key);
        realProjCount++;
      }
    }
  }
  console.log(
    `Sleeper stats/projections: ${realPrevCount} players got real ${prevSeason} results, ` +
      `${realProjCount} got real ${SEASON} projections`,
  );

  // 3b) Retired gate. A skill player Sleeper neither PROJECTS nor lists on any
  // depth chart isn't a 2026 fantasy asset — drop them from the pool (Blake
  // Bortles, Le'Veon Bell, … whenever they're still in the feed). An active backup
  // survives on its depth slot (Cooper Rush = ATL #3) and then falls to the skill
  // floor. Never gates K/DEF, and is skipped if Sleeper was unavailable (no depth
  // data → don't drop anyone). NOTABLE_INCLUDE force-keeps a listed veteran; the
  // manual RETIRED_EXCLUDE force-drops. Step 5's reconcile then syncs the DB to the
  // final pool — that's what evicts retired players who've left the feed entirely.
  const excludedKeys = new Set(RETIRED_EXCLUDE.map((r) => `${normalize(r.name)}|${r.position}`));
  if (sleeper) {
    for (const p of pool) {
      if (!SKILL_POS.has(p.position)) continue;
      const key = `${normalize(p.name)}|${p.position}`;
      const keep =
        realProjKeys.has(key) || depthChartKeys.has(key) || NOTABLE_INCLUDE.has(normalize(p.name));
      if (!keep) excludedKeys.add(key);
    }
  }
  const beforeGate = pool.length;
  pool = pool.filter((p) => !excludedKeys.has(`${normalize(p.name)}|${p.position}`));
  console.log(
    `Retired gate: dropped ${beforeGate - pool.length} unrostered, unprojected skill player(s) from the pool`,
  );

  // 3c) Fill the gaps Sleeper left (skill backups → small floor, K/DEF → estimate).
  // Runs AFTER the real-projection merge and the gate, so real data always wins and
  // dropped players never get a floor.
  fillMissingProjections(pool);

  // Positional rank by final proj_points (after the real/floor merge above), same
  // convention as prev_rank — lets the UI show "projected to move up/down".
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
  // would silently orphan that pick's history.
  //
  // We match existing rows by NORMALIZED name (suffix/punctuation-insensitive),
  // NOT the raw (name, position) unique key. When a feed renames a player across
  // runs — "Kenneth Walker" → "Kenneth Walker III", "Theo Wease" → "Theo Wease
  // Jr." — a raw-name upsert inserts a SECOND row that the reconcile can't evict
  // (both normalize to the same kept key), which is the "two Kenneth Walkers"
  // duplicate bug. Reusing the existing id and letting the name UPDATE in place
  // keeps exactly one stable row per real player.
  //
  // The flat columns are still written (they back the read path until Phase 2's
  // read-path deploy switches over and a later cleanup migration drops them),
  // and .select() hands back each player's stable id so we can also write the
  // season-scoped rows below. See docs/phase2-player-seasons.md.
  console.log('Loading existing players to match by normalized name…');
  const existingByKey = new Map<string, string>(); // normKey -> id
  const nameById = new Map<string, string>(); // id -> current raw name
  const exactOwner = new Map<string, string>(); // `${name}|${pos}` -> id
  {
    // Prefer an existing row that's actually in the current pool (has a season
    // row) when stale duplicates still linger in the table, so we update the
    // canonical row rather than resurrect a leftover.
    const poolIds = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('player_seasons')
        .select('player_id')
        .eq('season', SEASON)
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      const batch = (data ?? []) as { player_id: string }[];
      for (const r of batch) poolIds.add(r.player_id);
      if (batch.length < 1000) break;
    }
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('players')
        .select('id, name, position')
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      const batch = (data ?? []) as { id: string; name: string; position: string }[];
      for (const r of batch) {
        nameById.set(r.id, r.name);
        exactOwner.set(`${r.name}|${r.position}`, r.id);
        const k = `${normalize(r.name)}|${r.position}`;
        const cur = existingByKey.get(k);
        if (!cur || (!poolIds.has(cur) && poolIds.has(r.id))) existingByKey.set(k, r.id);
      }
      if (batch.length < 1000) break;
    }
  }

  console.log(`Upserting ${pool.length} players…`);
  const idByKey = new Map<string, string>();
  // Assign every row an id up front, then upsert on id. Reuse the matched
  // existing row's id (so a rename updates in place) or mint a fresh one. But
  // only actually rename the matched row when the feed's name isn't already
  // held by a DIFFERENT row: an unmergeable suffix-variant duplicate can still
  // linger (e.g. an old "Kenneth Walker" row kept alive by picks while the
  // canonical row is "Kenneth Walker III"), and renaming into it would trip the
  // (name, position) unique constraint. In that case keep the matched row's
  // existing name — fresh stats are written to it either way.
  const playerRows = pool.map((p) => {
    const key = `${normalize(p.name)}|${p.position}`;
    const matchedId = existingByKey.get(key);
    if (!matchedId) return { ...p, id: randomUUID() };
    const occupant = exactOwner.get(`${p.name}|${p.position}`);
    const wouldCollide = occupant != null && occupant !== matchedId;
    const name = wouldCollide ? (nameById.get(matchedId) ?? p.name) : p.name;
    return { ...p, id: matchedId, name };
  });
  for (let i = 0; i < playerRows.length; i += 500) {
    const chunk = playerRows.slice(i, i + 500);
    const { data, error } = await supabase
      .from('players')
      .upsert(chunk, { onConflict: 'id' })
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
  const schedule = await fetchWeeklyOpponents(prevSeason);
  const weekRows: Record<string, unknown>[] = [];
  // Track which weeks each player actually played, so the bye synthesis below
  // never collides with a real game row (e.g. a mid-season trade).
  const playedWeeks = new Map<string, Set<number>>(); // playerId → weeks
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
      (playedWeeks.get(playerId) ?? playedWeeks.set(playerId, new Set()).get(playerId)!).add(week);
      weekRows.push({
        player_id: playerId,
        position: p.position,
        season: prevSeason,
        week,
        opp: schedule?.opponents.get(`${key}|${week}`) ?? null,
        stats: toStatLine(p.position, s),
        pts_ppr: Math.round((s.pts_ppr ?? 0) * 10) / 10,
        pos_rank_ppr: s.pos_rank_ppr ?? null,
        is_bye: false,
      });
    }
  }

  // Synthesize an explicit bye row per skill player from their team's schedule,
  // so the modal can distinguish a true bye from a DNP. Only for players who
  // actually logged a game (they're the ones the modal surfaces) and weren't
  // traded that season (a single team → an unambiguous bye). is_bye is set on
  // every row (played too) to keep the upsert batch's columns homogeneous.
  let byeRows = 0;
  if (schedule) {
    for (const p of pool) {
      if (!SKILL_POS.has(p.position)) continue;
      const key = `${normalize(p.name)}|${p.position}`;
      const playerId = idByKey.get(key);
      if (!playerId) continue;
      const played = playedWeeks.get(playerId);
      if (!played || played.size === 0) continue; // only players with weekly data
      const teams = schedule.playerTeams.get(key);
      if (!teams || teams.size !== 1) continue; // unknown or traded → leave as DNP
      const bye = schedule.teamBye.get([...teams][0]);
      if (bye == null || played.has(bye)) continue;
      weekRows.push({
        player_id: playerId,
        position: p.position,
        season: prevSeason,
        week: bye,
        opp: null,
        stats: null,
        pts_ppr: null,
        pos_rank_ppr: null,
        is_bye: true,
      });
      byeRows++;
    }
  }
  if (schedule) {
    const withOpp = weekRows.filter((r) => r.opp).length;
    console.log(
      `  matched opponents for ${withOpp} weekly rows; synthesized ${byeRows} bye rows`,
    );
  }
  console.log(`Upserting ${weekRows.length} weekly stat rows (${prevSeason})…`);
  for (let i = 0; i < weekRows.length; i += 500) {
    const chunk = weekRows.slice(i, i + 500);
    const { error } = await supabase
      .from('player_week_stats')
      .upsert(chunk, { onConflict: 'player_id,season,week' });
    if (error) throw new Error(error.message);
  }

  // 5) Reconcile the {SEASON} pool: the kept `pool` is now the definitive draftable
  // set, so delete any CURRENT-season player_seasons row whose player isn't in it.
  // This is what finally evicts stale retired players a PRIOR import left behind
  // that have since dropped off the feed ENTIRELY (Blake Bortles, Le'Veon Bell, …)
  // — the gate above only sees players still in FFC/Sleeper, so it can't reach them.
  // Only the current-season row is removed; the players row + any pick/keeper/
  // favorite pointing at it stay intact (the pool is defined by current rows —
  // client/src/hooks/usePlayers). Requires Sleeper (its depth data is the basis for
  // the whole pool) and a healthy pool size, so a truncated fetch can't wipe every
  // draft's player list. Collect-then-delete so paging isn't disturbed by deletes.
  if (!sleeper || pool.length < 300) {
    console.warn(
      `⚠️  Skipping pool reconcile (sleeper=${!!sleeper}, kept=${pool.length}) to avoid a bad-fetch wipe`,
    );
  } else {
    const keptKeys = new Set(pool.map((p) => `${normalize(p.name)}|${p.position}`));
    const stale: string[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase
        .from('player_seasons')
        .select('player_id, players!inner ( name, position )')
        .eq('season', SEASON)
        .order('player_id', { ascending: true })
        .range(from, from + 499);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as {
        player_id: string;
        players: { name: string; position: string } | { name: string; position: string }[] | null;
      }[];
      for (const r of rows) {
        const ident = Array.isArray(r.players) ? r.players[0] : r.players;
        if (!ident) continue;
        if (!keptKeys.has(`${normalize(ident.name)}|${ident.position}`)) stale.push(r.player_id);
      }
      if (rows.length < 500) break;
    }
    for (let i = 0; i < stale.length; i += 500) {
      const { error } = await supabase
        .from('player_seasons')
        .delete()
        .eq('season', SEASON)
        .in('player_id', stale.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }
    if (stale.length) console.log(`Reconcile: removed ${stale.length} stale player(s) from the ${SEASON} pool`);
  }

  console.log(`✅ Imported ${pool.length} real players`);
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
