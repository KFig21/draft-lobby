import type { PickRow, PlayerRow, TeamRow } from './types';

/**
 * Data prep for the "Enter in ESPN" flow. ESPN's *Input Offline Draft Results*
 * page has no bulk import — it's a grid of teams (columns) × rounds (rows), each
 * cell a controlled autocomplete: you type a name, ESPN shows matches with their
 * team + position, and you must CLICK the matching row for it to register. So the
 * only thing we can do is hand the user, per team, an ordered list of exactly
 * what to type and which row to pick. This module builds that list.
 */

/**
 * NFL team nickname keyed by the `players.nfl_team` abbreviation — ESPN labels a
 * defense by nickname ("Bills D/ST"), so typing the nickname is the surest match
 * for a D/ST cell. Our defense players are stored as "{ABBR} D/ST" (see
 * scripts/import-players.ts), which wouldn't match ESPN's search at all.
 */
export const NFL_TEAM_NICKNAMES: Record<string, string> = {
  ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills', CAR: 'Panthers',
  CHI: 'Bears', CIN: 'Bengals', CLE: 'Browns', DAL: 'Cowboys', DEN: 'Broncos',
  DET: 'Lions', GB: 'Packers', HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars',
  KC: 'Chiefs', LAC: 'Chargers', LAR: 'Rams', LV: 'Raiders', MIA: 'Dolphins',
  MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants', NYJ: 'Jets',
  PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks', SF: '49ers', TB: 'Buccaneers',
  TEN: 'Titans', WAS: 'Commanders',
};

/** The exact string to type into ESPN's autocomplete for a player. Skill players
 * match on their plain name; a defense matches on its team nickname. */
export function toEspnSearchName(player: Pick<PlayerRow, 'name' | 'position' | 'nfl_team'>): string {
  if (player.position === 'DEF') {
    return NFL_TEAM_NICKNAMES[player.nfl_team] ?? player.name.replace(/\s*D\/ST$/i, '').trim();
  }
  return player.name;
}

/**
 * Our team abbreviations (Sleeper's) → ESPN's, where they differ. ESPN's
 * autocomplete rows show the ESPN abbrev and the autofill matches a pick to its
 * dropdown row on name + team, so a mismatch makes those players fail to
 * auto-select. Washington is the known outlier (WAS → WSH); add others here if
 * ESPN turns out to differ on more. NOT used for the D/ST search name, which is
 * keyed on the raw abbrev via NFL_TEAM_NICKNAMES.
 */
const ESPN_TEAM_ABBR: Record<string, string> = {
  WAS: 'WSH',
};
export function toEspnTeamAbbr(abbr: string): string {
  return ESPN_TEAM_ABBR[abbr] ?? abbr;
}

/** One drafted player, resolved for the ESPN entry checklist. */
export interface EspnPick {
  round: number;
  overall: number;
  /** What to paste into the ESPN cell. */
  espnName: string;
  /** Abbrev + position, shown so the user clicks the right autocomplete row. */
  nflTeam: string;
  position: string;
}

/** A team's column of picks, in round order, ready to enter into ESPN. */
export interface EspnTeam {
  id: string;
  name: string;
  draftPosition: number;
  picks: EspnPick[];
}

/**
 * Regroup the flat pick list into one column per team, ordered by draft slot
 * (ESPN's columns run in the same order), each team's picks in round order.
 */
export function groupDraftForEspn(
  teams: TeamRow[],
  picks: PickRow[],
  playersById: Map<string, PlayerRow>,
): EspnTeam[] {
  const ordered = [...teams].sort((a, b) => a.draft_position - b.draft_position);
  const byTeam = new Map<string, EspnPick[]>();
  for (const t of ordered) byTeam.set(t.id, []);
  for (const p of [...picks].sort((a, b) => a.overall - b.overall)) {
    const bucket = byTeam.get(p.team_id);
    if (!bucket) continue;
    const player = playersById.get(p.player_id);
    bucket.push({
      round: p.round,
      overall: p.overall,
      espnName: player ? toEspnSearchName(player) : '',
      nflTeam: player ? toEspnTeamAbbr(player.nfl_team) : '',
      position: player?.position ?? '',
    });
  }
  return ordered.map((t) => ({
    id: t.id,
    name: t.name,
    draftPosition: t.draft_position,
    picks: byTeam.get(t.id) ?? [],
  }));
}

/** The compact draft payload embedded into the auto-fill page script. Short keys
 * keep the generated bookmarklet/console blob small. */
export interface EspnAutofillData {
  teams: { name: string; picks: { r: number; name: string; team: string; pos: string }[] }[];
}

/** Build the auto-fill payload: every team (draft-slot order) and its picks in
 * round order, names already ESPN-normalized (see toEspnSearchName). */
export function buildEspnAutofillData(
  teams: TeamRow[],
  picks: PickRow[],
  playersById: Map<string, PlayerRow>,
): EspnAutofillData {
  return {
    teams: groupDraftForEspn(teams, picks, playersById).map((t) => ({
      name: t.name,
      picks: t.picks.map((p) => ({
        r: p.round,
        name: p.espnName,
        team: p.nflTeam,
        pos: p.position === 'DEF' ? 'D/ST' : p.position,
      })),
    })),
  };
}

// Re-exported so existing importers (EspnExportModal) keep their path; the
// implementation now lives in the generic ./clipboard util.
export { copyText } from './clipboard';
