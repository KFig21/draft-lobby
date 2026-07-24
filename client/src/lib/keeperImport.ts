import type { PlayerRow, TeamRow } from './types';

/**
 * One parsed row of a keeper import, resolved (or not) against the lobby's
 * teams and the player pool. `error` is null once both the team and player
 * resolved; otherwise it explains what to fix.
 */
export interface ParsedKeeperRow {
  team: string;
  player: string;
  position: string;
  round: number;
  teamId: string | null;
  playerId: string | null;
  error: string | null;
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

/** Pull the four fields out of one JSON object, tolerating a few key aliases. */
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

/** Split one CSV line on commas, trimming quotes/whitespace. Player names in
 * this pool never contain commas, so a full CSV parser isn't needed. */
function splitCsvLine(line: string): string[] {
  return line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
}

function looksLikeHeader(cols: string[]): boolean {
  const joined = cols.join(' ').toLowerCase();
  return joined.includes('player') || joined.includes('team') || joined.includes('name');
}

function parseRaw(text: string): { raws: RawRow[]; parseError: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { raws: [], parseError: null };

  // JSON array of row objects.
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

  // CSV: team, player, position, round.
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  const raws: RawRow[] = [];
  lines.forEach((line, i) => {
    const cols = splitCsvLine(line);
    if (i === 0 && looksLikeHeader(cols)) return; // skip a header row
    if (cols.every((c) => !c)) return;
    raws.push({
      team: cols[0] ?? '',
      player: cols[1] ?? '',
      position: cols[2] ?? '',
      round: cols[3] ?? '',
    });
  });
  return { raws, parseError: null };
}

/**
 * Parse pasted keeper data (CSV or JSON) and resolve each row against the
 * lobby. Columns/keys: team, player, position, round. Round is optional and
 * falls back to `defaultRound`. Team matches by name (case-insensitive) or by
 * draft-position number; player matches by name (+ position when given).
 */
export function parseKeeperImport(
  text: string,
  teams: TeamRow[],
  players: PlayerRow[],
  defaultRound = 1,
): KeeperImportResult {
  const { raws, parseError } = parseRaw(text);
  if (parseError) return { rows: [], parseError };

  const teamByName = new Map(teams.map((t) => [t.name.trim().toLowerCase(), t.id]));
  const teamByPos = new Map(teams.map((t) => [String(t.draft_position), t.id]));

  const playerByNamePos = new Map<string, string>();
  const nameCounts = new Map<string, number>();
  for (const p of players) {
    const name = p.name.trim().toLowerCase();
    playerByNamePos.set(`${name}|${p.position.toUpperCase()}`, p.id);
    playerByNamePos.set(name, p.id); // name-only fallback (last wins)
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  const rows = raws.map((r): ParsedKeeperRow => {
    const teamKey = r.team.trim().toLowerCase();
    const teamId = teamByName.get(teamKey) ?? teamByPos.get(r.team.trim()) ?? null;

    const name = r.player.trim().toLowerCase();
    const pos = r.position.trim().toUpperCase();
    let playerId: string | null = null;
    if (name) {
      if (pos) playerId = playerByNamePos.get(`${name}|${pos}`) ?? null;
      if (!playerId && (nameCounts.get(name) ?? 0) <= 1) playerId = playerByNamePos.get(name) ?? null;
    }

    const roundNum = r.round.trim() ? Number(r.round) : defaultRound;
    const round = Number.isInteger(roundNum) && roundNum >= 1 ? roundNum : defaultRound;

    let error: string | null = null;
    if (!r.player.trim()) error = 'Missing player name';
    else if (!playerId) error = `Player "${r.player}" not found`;
    else if (!r.team.trim()) error = 'Missing team';
    else if (!teamId) error = `Team "${r.team}" not found`;

    return { team: r.team, player: r.player, position: r.position, round, teamId, playerId, error };
  });

  return { rows, parseError: null };
}

/** A small ready-to-edit CSV the commissioner can download as a starting point. */
export const KEEPER_IMPORT_EXAMPLE = `team,player,position,round
1,Justin Jefferson,WR,3
1,Bijan Robinson,RB,1
2,Ja'Marr Chase,WR,2
3,Amon-Ra St. Brown,WR,8`;
