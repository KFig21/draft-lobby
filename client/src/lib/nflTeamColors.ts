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
  ARI: { bg: '#97233F', text: '#FFFFFF' }, // cardinal red / white
  ATL: { bg: '#000000', text: '#c93850' }, // black / red
  BAL: { bg: '#2b1a9c', text: '#f6d383' }, // purple / gold (not black — unreadable)
  BUF: { bg: '#00338D', text: '#FFFFFF' }, // royal blue / white
  CAR: { bg: '#0085CA', text: '#101820' }, // panther blue / black
  CHI: { bg: '#0f2347', text: '#eb4b11' }, // navy / orange
  CIN: { bg: '#ff6431', text: '#000000' }, // orange / black
  CLE: { bg: '#362306', text: '#FF3C00' }, // brown / orange
  DAL: { bg: '#afb3b8', text: '#003594' }, // silver / navy
  DEN: { bg: '#FB4F14', text: '#002244' }, // orange / navy
  DET: { bg: '#0076B6', text: '#c3c6ca' }, // honolulu blue / silver
  GB: { bg: '#22493e', text: '#fedb3c' }, // green / gold
  HOU: { bg: '#03202F', text: '#c93850' }, // deep steel blue / red
  IND: { bg: '#FFFFFF', text: '#053faa' }, // white / blue
  JAX: { bg: '#006778', text: '#D7A22A' }, // teal / gold
  KC: { bg: '#E31837', text: '#fedb3c' }, // red / yellow
  LAC: { bg: '#0080C6', text: '#ffef5f' }, // powder blue / yellow
  LAR: { bg: '#003594', text: '#FFD100' }, // royal blue / gold
  LV: { bg: '#A5ACAF', text: '#000000' }, // silver / black
  MIA: { bg: '#017d86', text: '#ffb469' }, // aqua / orange
  MIN: { bg: '#4f21b2', text: '#fedb3c' }, // purple / gold
  NE: { bg: '#002244', text: '#dfdfdf' }, // navy / silver
  NO: { bg: '#D3BC8D', text: '#000000' }, // gold / black
  NYG: { bg: '#052995', text: '#FFFFFF' }, // blue / white
  NYJ: { bg: '#176b4f', text: '#FFFFFF' }, // green / white
  PHI: { bg: '#0b5860', text: '#FFFFFF' }, // midnight green / white
  PIT: { bg: '#101820', text: '#fedb3c' }, // black / gold
  SEA: { bg: '#06325e', text: '#95f14e' }, // navy / action green
  SF: { bg: '#AA0000', text: '#f6d383' }, // red / gold
  TB: { bg: '#ffa74f', text: '#D50A0A' }, // orange / red
  TEN: { bg: '#0b2d56', text: '#79bcff' }, // navy / titans blue
  WAS: { bg: '#821919', text: '#fedb3c' }, // burgundy / gold
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
