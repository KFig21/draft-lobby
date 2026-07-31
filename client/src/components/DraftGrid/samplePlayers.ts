import type { PlayerRow } from '../../lib/types';

function sample(
  name: string,
  position: PlayerRow['position'],
  nfl_team: string,
  bye_week: number,
): PlayerRow {
  return {
    id: `sample-${name}`,
    name,
    position,
    nfl_team,
    bye_week,
    injury_status: 'ACTIVE',
    // Illustrative projection/ADP/rank so the player-card-style preview shows
    // its full layout (projection, ADP, the position-rank badge). The cell
    // previews don't render these, so they're unaffected.
    proj_points: 287.4,
    proj_rank: 3,
    proj_stat_line: null,
    proj_stats: null,
    adp: 5.1,
    prev_points: null,
    prev_rank: null,
    prev_stat_line: null,
    prev_stats: null,
  };
}

/** Classic players used only to preview draft cell styles and the team-color
 * setting (Settings > Draft board) — never shown anywhere a real pick is made.
 * One is picked at random each time the picker mounts, just for fun. Teams use
 * the players' modern franchise codes (STL→LAR, SD→LAC) so they always resolve
 * against NFL_TEAM_COLORS when this same player drives the team-color preview. */
export const SAMPLE_PLAYERS: PlayerRow[] = [
  sample('Randy Moss', 'WR', 'MIN', 6),
  sample('Priest Holmes', 'RB', 'KC', 10),
  sample('Peyton Manning', 'QB', 'IND', 8),
  sample('Shaun Alexander', 'RB', 'SEA', 4),
  sample('Kurt Warner', 'QB', 'LAR', 9),
  sample('Antonio Gates', 'TE', 'LAC', 8),
  sample('Calvin Johnson', 'WR', 'DET', 5),
  sample('Jerry Rice', 'WR', 'SF', 7),
  sample('Barry Sanders', 'RB', 'DET', 5),
  sample('Marshall Faulk', 'RB', 'LAR', 9),
  sample('Tony Gonzalez', 'TE', 'KC', 10),
  sample('LaDainian Tomlinson', 'RB', 'LAC', 8),
  sample('Terrell Owens', 'WR', 'SF', 7),
  sample('Adam Vinatieri', 'K', 'NE', 11),
  sample('BAL D/ST', 'DEF', 'BAL', 11),
];

export function randomSamplePlayer(): PlayerRow {
  return SAMPLE_PLAYERS[Math.floor(Math.random() * SAMPLE_PLAYERS.length)];
}
