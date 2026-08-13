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
      nflTeam: player?.nfl_team ?? '',
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

/**
 * Copy text to the clipboard, with a legacy fallback for any browser/context
 * where the async Clipboard API is unavailable. Returns whether it succeeded.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
