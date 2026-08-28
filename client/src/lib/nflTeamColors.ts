// NFL team color pairs for tinting the team abbreviation in the play/pick
// modals. Each entry is { bg, text } chosen for legibility first, iconic-ness
// second: the background is the team's signature color and the text is the
// highest-contrast member of their palette. Where the natural pairing fails a
// contrast check (e.g. Ravens purple-on-black, Dolphins aqua-on-orange) the
// text falls back to white/black rather than the "authentic" but unreadable
// second color. Keyed by the `players.nfl_team` abbreviation (JAX/LV/WAS —
// the current franchise tokens, not OAK/JAC/WSH).

export interface TeamColors {
  bg: string;
  text: string;
}

export const NFL_TEAM_COLORS: Record<string, TeamColors> = {
  ARI: { bg: '#cd3249', text: '#ffffff' }, // Cardinals
  ATL: { bg: '#000000', text: '#f43e5c' }, // Falcons
  BAL: { bg: '#2b1a9c', text: '#f6d383' }, // Ravens
  BUF: { bg: '#00338D', text: '#FFFFFF' }, // Bills
  CAR: { bg: '#00a3f5', text: '#101820' }, // Panthers
  CHI: { bg: '#0e2a5d', text: '#ff5a1f' }, // Bears
  CIN: { bg: '#ff6431', text: '#000000' }, // Bengals
  CLE: { bg: '#50350c', text: '#FF3C00' }, // Browns
  DAL: { bg: '#afb3b8', text: '#003594' }, // Cowboys
  DEN: { bg: '#ff6e3d', text: '#003e8f' }, // Broncos
  DET: { bg: '#0076B6', text: '#dadde1' }, // Lions
  GB: { bg: '#22493e', text: '#fedb3c' }, // Packers
  HOU: { bg: '#062247', text: '#e5435e' }, // Texans
  IND: { bg: '#FFFFFF', text: '#053faa' }, // Colts
  JAX: { bg: '#006778', text: '#D7A22A' }, // Jaguars
  KC: { bg: '#E31837', text: '#fedb3c' }, // Chiefs
  LAC: { bg: '#2483ff', text: '#ffed47' }, // Chargers
  LAR: { bg: '#0a3acd', text: '#FFD100' }, // Rams
  LV: { bg: '#A5ACAF', text: '#000000' }, // Raiders
  MIA: { bg: '#017d86', text: '#ffb469' }, // Dolphins
  MIN: { bg: '#4f21b2', text: '#fedb3c' }, // Vikings
  NE: { bg: '#001142', text: '#ffffff' }, // Patriots
  NO: { bg: '#D3BC8D', text: '#000000' }, // Saints
  NYG: { bg: '#052995', text: '#FFFFFF' }, // Giants
  NYJ: { bg: '#176b4f', text: '#FFFFFF' }, // Jets
  PHI: { bg: '#0b5860', text: '#FFFFFF' }, // Eagles
  PIT: { bg: '#101820', text: '#fedb3c' }, // Steelers
  SEA: { bg: '#06325e', text: '#95f14e' }, // Seahawks
  SF: { bg: '#AA0000', text: '#f6d383' }, // 49ers
  TB: { bg: '#ffa74f', text: '#D50A0A' }, // Buccaneers
  TEN: { bg: '#0b2d56', text: '#79bcff' }, // Titans
  WAS: { bg: '#821919', text: '#fedb3c' }, // Commanders
};

/** The color pair for a team abbreviation, or null when it's unknown (free
 * agents, defenses without a token, or a future franchise not yet in the map)
 * so the caller can fall back to plain text. */
export function getTeamColors(abbr: string | null | undefined): TeamColors | null {
  if (!abbr) return null;
  return NFL_TEAM_COLORS[abbr] ?? null;
}

// --- User preference: color the team abbreviation or leave it plain text. ---
// Per-device, like the other draft-board display prefs (playerCardStyle,
// draftCellStyle). Default on so the feature is visible once shipped.

const TEAM_COLORS_KEY = 'teamColorsEnabled';

export function getTeamColorsEnabled(): boolean {
  try {
    return localStorage.getItem(TEAM_COLORS_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setTeamColorsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(TEAM_COLORS_KEY, enabled ? 'on' : 'off');
  } catch {
    // ignore (private mode / storage disabled)
  }
}
