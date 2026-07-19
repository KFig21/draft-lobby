import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import type { PickRow, PlayerRow, TeamRow } from '../../lib/types';
import './DraftGrid.scss';

interface Props {
  teams: TeamRow[];
  rounds: number;
  picks: PickRow[];
  playersById: Map<string, PlayerRow>;
  onClockTeamId: string | null;
  currentRound: number;
}

/**
 * The draft board: columns are teams (in draft order), rows are rounds.
 * Each cell holds the pick that team made that round. The on-the-clock cell is
 * highlighted (computed by the page via the shared snake helper).
 */
export function DraftGrid({
  teams,
  rounds,
  picks,
  playersById,
  onClockTeamId,
  currentRound,
}: Props) {
  // Index picks by "round:teamId" for O(1) cell lookup.
  const byCell = new Map<string, PickRow>();
  for (const p of picks) byCell.set(`${p.round}:${p.team_id}`, p);

  return (
    <div className="grid-scroll">
      <table className="draft-grid">
        <thead>
          <tr>
            <th className="draft-grid__corner" />
            {teams.map((team) => (
              <th key={team.id} className="draft-grid__team">
                <span
                  className="draft-grid__team-swatch"
                  style={{ background: team.color }}
                />
                {team.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rounds }, (_, r) => {
            const round = r + 1;
            return (
              <tr key={round}>
                <td className="draft-grid__round">{round}</td>
                {teams.map((team) => {
                  const pick = byCell.get(`${round}:${team.id}`);
                  const player = pick ? playersById.get(pick.player_id) : undefined;
                  const isOnClock =
                    !pick &&
                    round === currentRound &&
                    team.id === onClockTeamId;
                  return (
                    <td
                      key={team.id}
                      className={`draft-grid__cell ${isOnClock ? 'draft-grid__cell--onclock' : ''}`}
                    >
                      {player ? (
                        <div className="draft-grid__pick">
                          <span
                            className="draft-grid__pos"
                            style={{
                              color: POSITION_COLORS[player.position as Position],
                            }}
                          >
                            {player.position}
                          </span>
                          <span className="draft-grid__player">{player.name}</span>
                          <span className="draft-grid__meta">
                            {player.nfl_team}
                            {player.bye_week ? ` · ${player.bye_week}` : ''}
                          </span>
                        </div>
                      ) : isOnClock ? (
                        <span className="draft-grid__onclock-label">On the clock</span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
