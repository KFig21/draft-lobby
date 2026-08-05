import type { PlayerRow, TeamRow } from './types';

/**
 * One parsed row of a keeper import, resolved (or not) against the lobby's
 * teams and the player pool. `error` is null once both the team and player
 * resolved; otherwise it explains what to fix. `suggestion` carries the closest
 * near-miss player when the name almost matched (for a "did you mean" fix).
 */
export interface ParsedKeeperRow {
  team: string;
  player: string;
  position: string;
  round: number;
  teamId: string | null;
  playerId: string | null;
  error: string | null;
  suggestion: { playerId: string; name: string } | null;
  /** Closest team when the team name didn't resolve — powers the "did you mean"
   * + the assign-team dropdown in the import preview. */
  teamSuggestion: { teamId: string; name: string } | null;
}

export interface KeeperImportResult {
  rows: ParsedKeeperRow[];
  /** Set only when the whole input couldn't be parsed (bad JSON, no columns). */
  parseError: string | null;
}

interface RawRow {
  team: string;
  player: string;
  position: string;
  round: string;
}

// ── Name normalization ──────────────────────────────────────────────
// Match despite punctuation/suffix noise: "C.J. Stroud" ⇄ "CJ Stroud",
// "Amon-Ra St. Brown" ⇄ "Amon Ra St Brown", "Chris Godwin Jr." ⇄ "Chris Godwin".
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.'’,]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !SUFFIXES.has(w))
    .join(' ')
    .trim();
}

// ── Defense aliases ─────────────────────────────────────────────────
// D/ST entries are stored as "{ABBR} D/ST" (nfl_team = ABBR). Let people type a
// nickname or city ("Chiefs", "Kansas City", "KC D/ST") and still land on it.
const NFL_TEAMS: [string, string, string][] = [
  ['ARI', 'arizona', 'cardinals'], ['ATL', 'atlanta', 'falcons'],
  ['BAL', 'baltimore', 'ravens'], ['BUF', 'buffalo', 'bills'],
  ['CAR', 'carolina', 'panthers'], ['CHI', 'chicago', 'bears'],
  ['CIN', 'cincinnati', 'bengals'], ['CLE', 'cleveland', 'browns'],
  ['DAL', 'dallas', 'cowboys'], ['DEN', 'denver', 'broncos'],
  ['DET', 'detroit', 'lions'], ['GB', 'green bay', 'packers'],
  ['HOU', 'houston', 'texans'], ['IND', 'indianapolis', 'colts'],
  ['JAX', 'jacksonville', 'jaguars'], ['KC', 'kansas city', 'chiefs'],
  ['LV', 'las vegas', 'raiders'], ['LAC', 'los angeles chargers', 'chargers'],
  ['LAR', 'los angeles rams', 'rams'], ['MIA', 'miami', 'dolphins'],
  ['MIN', 'minnesota', 'vikings'], ['NE', 'new england', 'patriots'],
  ['NO', 'new orleans', 'saints'], ['NYG', 'new york giants', 'giants'],
  ['NYJ', 'new york jets', 'jets'], ['PHI', 'philadelphia', 'eagles'],
  ['PIT', 'pittsburgh', 'steelers'], ['SF', 'san francisco', '49ers'],
  ['SEA', 'seattle', 'seahawks'], ['TB', 'tampa bay', 'buccaneers'],
  ['TEN', 'tennessee', 'titans'], ['WAS', 'washington', 'commanders'],
];
const DEF_ALIAS = new Map<string, string>();
for (const [abbr, city, nick] of NFL_TEAMS) {
  for (const a of [abbr, city, nick, `${city} ${nick}`]) {
    DEF_ALIAS.set(normalizeName(a), abbr.toLowerCase());
  }
}
/** Strip the "D/ST"/"defense" noise before looking a team name up. */
function defenseAbbr(raw: string): string | null {
  const stripped = normalizeName(raw.replace(/d\s*\/?\s*st|defense|\bdef\b|\bdst\b/gi, ' '));
  return DEF_ALIAS.get(stripped) ?? DEF_ALIAS.get(normalizeName(raw)) ?? null;
}

// ── Levenshtein (for "did you mean") ────────────────────────────────
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[n];
}

interface Indices {
  byNamePos: Map<string, string>;
  byName: Map<string, string>;
  nameCounts: Map<string, number>;
  defByAbbr: Map<string, string>;
  norms: { norm: string; id: string; name: string }[];
}

function buildIndices(players: PlayerRow[]): Indices {
  const byNamePos = new Map<string, string>();
  const byName = new Map<string, string>();
  const nameCounts = new Map<string, number>();
  const defByAbbr = new Map<string, string>();
  const norms: { norm: string; id: string; name: string }[] = [];
  for (const p of players) {
    const norm = normalizeName(p.name);
    byNamePos.set(`${norm}|${p.position.toUpperCase()}`, p.id);
    byName.set(norm, p.id);
    nameCounts.set(norm, (nameCounts.get(norm) ?? 0) + 1);
    norms.push({ norm, id: p.id, name: p.name });
    if (p.position === 'DEF') defByAbbr.set(p.nfl_team.toLowerCase(), p.id);
  }
  return { byNamePos, byName, nameCounts, defByAbbr, norms };
}

/** Closest player by edit distance on the normalized name, within a tight
 * threshold — enough to catch a typo ("Orondre" → "Oronde"), not to guess. */
function suggest(norm: string, idx: Indices): { playerId: string; name: string } | null {
  if (norm.length < 4) return null;
  const limit = Math.min(3, Math.floor(norm.length * 0.34));
  let best: { d: number; id: string; name: string } | null = null;
  for (const c of idx.norms) {
    if (Math.abs(c.norm.length - norm.length) > limit) continue;
    const d = editDistance(norm, c.norm);
    if (d <= limit && (!best || d < best.d)) best = { d, id: c.id, name: c.name };
    if (best?.d === 1) break;
  }
  return best ? { playerId: best.id, name: best.name } : null;
}

/** Closest team to a name that didn't resolve — a containment match either way
 * ("Fig" ⊂ "KFig21", or a header typed longer than the team name) ranks above a
 * plain typo, which is bounded by edit distance so we suggest rather than guess. */
function suggestTeam(
  raw: string,
  teams: TeamRow[],
): { teamId: string; name: string } | null {
  const norm = normalizeName(raw);
  if (norm.length < 2) return null;
  let best: { score: number; id: string; name: string } | null = null;
  for (const t of teams) {
    const tn = normalizeName(t.name);
    if (!tn) continue;
    let score: number;
    if (tn === norm) score = 0;
    else if (tn.includes(norm) || norm.includes(tn)) score = 1;
    else {
      const d = editDistance(norm, tn);
      const limit = Math.max(2, Math.floor(Math.max(norm.length, tn.length) * 0.4));
      if (d > limit) continue;
      score = 1 + d;
    }
    if (!best || score < best.score) best = { score, id: t.id, name: t.name };
  }
  return best ? { teamId: best.id, name: best.name } : null;
}

// ── Parsing ─────────────────────────────────────────────────────────
function rawFromJson(o: Record<string, unknown>): RawRow {
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = o[k];
      if (v != null && v !== '') return String(v);
    }
    return '';
  };
  return {
    team: pick('team', 'group', 'id', 'teamId'),
    player: pick('player', 'name', 'playerName'),
    position: pick('position', 'pos'),
    round: pick('round', 'compensation'),
  };
}

/**
 * Split one row into cells. Copying a range out of a spreadsheet (Google
 * Sheets, Excel, Numbers) puts it on the clipboard TAB-separated, not comma-
 * separated — so a straight paste from a keeper-tracking sheet isn't CSV at
 * all. Detect the delimiter per line (a tab means it's a spreadsheet paste,
 * otherwise treat it as CSV) so both a pasted sheet and a pasted/edited CSV
 * work without the commissioner having to convert anything first.
 */
function splitRow(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : ',';
  return line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
}

function looksLikeHeader(cols: string[]): boolean {
  const joined = cols.join(' ').toLowerCase();
  return joined.includes('player') || joined.includes('team') || joined.includes('name');
}

const POSITION_TOKENS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DST']);
function looksLikePosition(raw: string): boolean {
  return POSITION_TOKENS.has(raw.trim().toUpperCase().replace(/[^A-Z]/g, ''));
}

/**
 * The columns after `team` can come in any order and the position column is
 * optional — "player, position, round", "position, player, round", and
 * "player, round" (no position) all resolve here by shape (a bare integer is
 * the round, a known position code is the position, whatever's left is the
 * player), so the commissioner doesn't have to match one exact column order.
 */
function classifyRestCols(cols: string[]): { player: string; position: string; round: string } {
  const remaining: string[] = [];
  let round = '';
  for (const c of cols) {
    if (c.trim() === '') continue;
    if (!round && /^\d+$/.test(c.trim())) {
      round = c;
    } else {
      remaining.push(c);
    }
  }
  let position = '';
  const posIdx = remaining.findIndex((c) => looksLikePosition(c));
  if (posIdx !== -1) {
    position = remaining[posIdx];
    remaining.splice(posIdx, 1);
  }
  return { player: remaining[0] ?? '', position, round };
}

/**
 * `resolveTeamAny` matches a team by name or draft-slot number — used by the
 * import-all path to attach a team to each row two universal ways (auto-
 * detected, no mode toggle):
 *   1. Team column — a cell (name or slot #) on the row itself.
 *   2. Section header — a lone line that isn't a bare number (so a stray "5"
 *      can't be mistaken for a section); rows below it inherit that team until
 *      the next header, whether or not the name resolves (an unresolved one is
 *      flagged for assignment). Explicit team columns override the section.
 * The team-scoped ("Import by team") path passes no team column and skips this.
 */
function parseRaw(
  text: string,
  hasTeamColumn: boolean,
  resolveTeamAny: (s: string) => string | null,
): { raws: RawRow[]; parseError: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { raws: [], parseError: null };

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      const arr = Array.isArray(data) ? data : [data];
      return {
        raws: arr
          .filter((o) => o && typeof o === 'object')
          .map((o) => rawFromJson(o as Record<string, unknown>)),
        parseError: null,
      };
    } catch {
      return { raws: [], parseError: "That doesn't look like valid JSON." };
    }
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  const raws: RawRow[] = [];
  // The team named by the most recent section header — inherited by following
  // rows that don't carry their own team column (import-all only).
  let sectionTeam = '';
  lines.forEach((line, i) => {
    const cols = splitRow(line);
    const nonEmpty = cols.filter((c) => c.trim() !== '');
    if (nonEmpty.length === 0) return;
    // Skip a "team, player, position, round" header row — but not a section
    // header that happens to contain a header keyword (e.g. a team literally
    // named "Team Rocket"), which resolves to a real team.
    if (i === 0 && looksLikeHeader(cols) && !nonEmpty.some((c) => resolveTeamAny(c))) return;

    if (!hasTeamColumn) {
      // Team-scoped import: a team is already picked above the textarea, so
      // every column here is player/position/round.
      const { player, position, round } = classifyRestCols(cols);
      raws.push({ team: '', player, position, round });
      return;
    }

    // Section header: a lone line (not a bare number) starts a section — even
    // when the name doesn't match a team. A mistyped/unknown header ("Fig" vs
    // "KFig21") is then captured as this section's team and flagged for
    // assignment, rather than silently swallowed as a player of the *previous*
    // section (which would misattribute every keeper listed under it).
    if (nonEmpty.length === 1 && !/^\d+$/.test(nonEmpty[0].trim())) {
      sectionTeam = nonEmpty[0];
      return;
    }
    // Explicit team column (name or slot #) — wins over any section context.
    if (resolveTeamAny(cols[0]) != null) {
      const { player, position, round } = classifyRestCols(cols.slice(1));
      raws.push({ team: cols[0], player, position, round });
      return;
    }
    // Otherwise inherit the current section's team (empty → "Missing team").
    const { player, position, round } = classifyRestCols(cols);
    raws.push({ team: sectionTeam, player, position, round });
  });
  return { raws, parseError: null };
}

/**
 * Parse pasted keeper data (a spreadsheet copy/TSV, CSV, or JSON) and resolve
 * each row against the lobby. Columns/keys: team, player, position, round. The
 * team/player/position/round columns can be in any order (classified by shape).
 * Round is optional and
 * falls back to `defaultRound`. Team matches by name or draft position; player
 * matches by normalized name (+ position), with D/ST and near-miss handling.
 *
 * Import-all attaches a team to each row two ways, auto-detected: a team column
 * (name or draft-slot number), or a team-name section header that rows below it
 * inherit. `fixedTeamId`, when set, scopes the whole paste to one team instead:
 * the team column is dropped entirely (every row uses `fixedTeamId`) so the
 * pasted text only needs player/position/round.
 */
export function parseKeeperImport(
  text: string,
  teams: TeamRow[],
  players: PlayerRow[],
  defaultRound = 1,
  fixedTeamId: string | null = null,
  /** Commissioner-assigned team names → teamId (keyed by normalizeName), for
   * headers/columns that didn't match on their own. See the assign-team UI. */
  teamOverrides: Record<string, string> = {},
): KeeperImportResult {
  const teamByName = new Map(teams.map((t) => [t.name.trim().toLowerCase(), t.id]));
  const teamByPos = new Map(teams.map((t) => [String(t.draft_position), t.id]));
  const teamIds = new Set(teams.map((t) => t.id));
  const overrideFor = (s: string) => {
    const id = teamOverrides[normalizeName(s)];
    return id && teamIds.has(id) ? id : null;
  };
  const resolveTeamName = (s: string) =>
    overrideFor(s) ?? teamByName.get(s.trim().toLowerCase()) ?? null;
  const resolveTeamAny = (s: string) => resolveTeamName(s) ?? teamByPos.get(s.trim()) ?? null;

  const { raws, parseError } = parseRaw(text, fixedTeamId == null, resolveTeamAny);
  if (parseError) return { rows: [], parseError };

  const fixedTeamName = fixedTeamId ? (teams.find((t) => t.id === fixedTeamId)?.name ?? '') : '';
  const idx = buildIndices(players);

  const rows = raws.map((r): ParsedKeeperRow => {
    const teamId = fixedTeamId ?? resolveTeamAny(r.team);

    const rawName = r.player.trim();
    const norm = normalizeName(rawName);
    const pos = r.position.trim().toUpperCase();
    let playerId: string | null = null;
    let suggestion: { playerId: string; name: string } | null = null;

    if (rawName) {
      // Defenses first when the row is clearly a D/ST (by position or name).
      if (pos === 'DEF' || pos === 'DST' || pos === 'D/ST' || defenseAbbr(rawName)) {
        const abbr = defenseAbbr(rawName);
        if (abbr) playerId = idx.defByAbbr.get(abbr) ?? null;
      }
      if (!playerId && pos) playerId = idx.byNamePos.get(`${norm}|${pos}`) ?? null;
      if (!playerId && (idx.nameCounts.get(norm) ?? 0) <= 1) {
        playerId = idx.byName.get(norm) ?? null;
      }
      if (!playerId) suggestion = suggest(norm, idx);
    }

    const roundNum = r.round.trim() ? Number(r.round) : defaultRound;
    const round = Number.isInteger(roundNum) && roundNum >= 1 ? roundNum : defaultRound;

    // Closest team, for an unresolved (non-scoped) team name — drives the
    // assign-team dropdown's default and the "did you mean" hint.
    const teamSuggestion =
      !fixedTeamId && !teamId && r.team.trim() ? suggestTeam(r.team, teams) : null;

    let error: string | null = null;
    if (!rawName) error = 'Missing player name';
    else if (!playerId) {
      error = `Player "${r.player}" not found`;
      if (suggestion) error += ` — did you mean ${suggestion.name}?`;
    } else if (!fixedTeamId && !r.team.trim()) error = 'Missing team';
    else if (!fixedTeamId && !teamId) {
      error = `Team "${r.team}" not found`;
      if (teamSuggestion) error += ` — assign it below (did you mean ${teamSuggestion.name}?)`;
    }

    return {
      team: fixedTeamId ? fixedTeamName : r.team,
      player: r.player,
      position: r.position,
      round,
      teamId,
      playerId,
      error,
      suggestion,
      teamSuggestion,
    };
  });

  return { rows, parseError: null };
}

/** A small ready-to-edit CSV the commissioner can download as a starting point.
 * Team names here (rather than bare draft-slot numbers) so the "team" column
 * reads clearly on its own — a slot number works too, but isn't obvious as an
 * example. Shares team names with KEEPER_IMPORT_EXAMPLE_SECTIONED below so
 * both examples visibly describe the same two ways to tag a team. */
export const KEEPER_IMPORT_EXAMPLE = `team,player,position,round
Team One,Justin Jefferson,WR,3
Team One,Bijan Robinson,RB,1
Team Two,Ja'Marr Chase,WR,2
Team Three,Amon-Ra St. Brown,WR,8`;

/** The other universal import-all shape: a team name on its own line as a
 * section header, its players listed below (round/position order-independent).
 * Shown alongside the team-column example so both are discoverable. */
export const KEEPER_IMPORT_EXAMPLE_SECTIONED = `Team One
Justin Jefferson,WR,3
Bijan Robinson,RB,1

Team Two
Ja'Marr Chase,WR,2`;

/** Same idea, for a team-scoped import — no team column since one team is
 * already picked above the textarea. */
export const KEEPER_IMPORT_EXAMPLE_BY_TEAM = `player,position,round
Justin Jefferson,WR,3
Bijan Robinson,RB,1
Ja'Marr Chase,WR,2`;
