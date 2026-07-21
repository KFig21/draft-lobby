import { POSITION_COLORS, type DraftType, type Position } from '@draft-lobby/shared';
import { useState } from 'react';
import type { PickRow, PlayerRow, TeamRow } from '../../lib/types';
import './DraftGrid.scss';

export interface ReactionEntry {
  counts: Record<string, number>;
  mine: Set<string>;
}

interface Props {
  teams: TeamRow[];
  rounds: number;
  picks: PickRow[];
  playersById: Map<string, PlayerRow>;
  onClockTeamId: string | null;
  currentRound: number;
  draftType: DraftType;
  /** Click a team header to view that team's lineup. */
  onTeamClick?: (teamId: string) => void;
  /** Reactions per pick id (for the on-board hover reactions). */
  reactionsByPick?: Map<string, ReactionEntry>;
  onReactPick?: (pickId: string, emoji: string) => void;
  /** Click a pick to open its detail modal. */
  onPickClick?: (pick: PickRow) => void;
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
  draftType,
  onTeamClick,
  reactionsByPick,
  onReactPick,
  onPickClick,
}: Props) {
  // Index picks by "round:teamId" for O(1) cell lookup.
  const byCell = new Map<string, PickRow>();
  for (const p of picks) byCell.set(`${p.round}:${p.team_id}`, p);

  // Cross-highlight the hovered pick's round cell + team header (desktop).
  const [hover, setHover] = useState<{ round: number; teamId: string } | null>(null);

  return (
    <div className="grid-scroll">
      <table className="draft-grid">
        <thead>
          <tr>
            <th className="draft-grid__corner" />
            {teams.map((team) => (
              <th
                key={team.id}
                className={`draft-grid__team${
                  team.id === onClockTeamId ? ' draft-grid__team--onclock' : ''
                }${hover?.teamId === team.id ? ' draft-grid__team--hi' : ''}`}
              >
                <button
                  type="button"
                  className="draft-grid__team-btn"
                  onClick={() => onTeamClick?.(team.id)}
                  title={`View ${team.name}'s lineup`}
                >
                  <span
                    className="draft-grid__team-swatch"
                    style={{ background: team.color }}
                  />
                  {team.name}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rounds }, (_, r) => {
            const round = r + 1;
            return (
              <tr key={round}>
                <td
                  className={`draft-grid__round${
                    hover?.round === round ? ' draft-grid__round--hi' : ''
                  }`}
                >
                  <span className="draft-grid__round-num">{round}</span>
                  {draftType === 'SNAKE' && (
                    <span
                      className={`draft-grid__round-dir${
                        round === currentRound ? ' is-live' : ''
                      }`}
                      aria-hidden
                    >
                      {round % 2 === 1 ? '→' : '←'}
                    </span>
                  )}
                </td>
                {teams.map((team) => {
                  const pick = byCell.get(`${round}:${team.id}`);
                  const player = pick ? playersById.get(pick.player_id) : undefined;
                  const isOnClock =
                    !pick && round === currentRound && team.id === onClockTeamId;
                  if (pick && player) {
                    return (
                      <PickCell
                        key={team.id}
                        pick={pick}
                        player={player}
                        entry={reactionsByPick?.get(pick.id)}
                        onReact={onReactPick}
                        onClick={onPickClick}
                        onEnter={() => setHover({ round, teamId: team.id })}
                        onLeave={() =>
                          setHover((h) =>
                            h && h.round === round && h.teamId === team.id ? null : h,
                          )
                        }
                      />
                    );
                  }
                  return (
                    <td
                      key={team.id}
                      className={`draft-grid__cell ${
                        isOnClock ? 'draft-grid__cell--onclock' : ''
                      }`}
                    >
                      {isOnClock && (
                        <span className="draft-grid__onclock-label">On the clock</span>
                      )}
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

function PickCell({
  pick,
  player,
  entry,
  onReact,
  onClick,
  onEnter,
  onLeave,
}: {
  pick: PickRow;
  player: PlayerRow;
  entry: ReactionEntry | undefined;
  onReact?: (pickId: string, emoji: string) => void;
  onClick?: (pick: PickRow) => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const active = entry ? Object.keys(entry.counts) : [];

  return (
    <td
      className="draft-grid__cell draft-grid__cell--pick"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={() => onClick?.(pick)}
    >
      <div className="draft-grid__pick">
        <span
          className="draft-grid__pos"
          style={{ color: POSITION_COLORS[player.position as Position] }}
        >
          {player.position}
        </span>
        <span className="draft-grid__player">{player.name}</span>
        <span className="draft-grid__meta">
          {player.nfl_team}
          {player.bye_week ? ` · ${player.bye_week}` : ''}
        </span>
      </div>

      {/* Subtle, uncluttered indicator that this pick has reactions. */}
      {active.length > 0 && (
        <span className="draft-grid__react-flag" aria-hidden>
          !!
        </span>
      )}

      {/* On hover (desktop) the reactions unfold just below the pick. Adding a
          reaction happens in the pick modal, so no add button here. */}
      {active.length > 0 && (
        <div className="draft-grid__react-pop" onClick={(e) => e.stopPropagation()}>
          {active.map((e) => (
            <button
              key={e}
              type="button"
              className={`draft-grid__rchip${entry?.mine.has(e) ? ' is-mine' : ''}`}
              onClick={() => onReact?.(pick.id, e)}
            >
              {e}
              {(entry?.counts[e] ?? 0) > 1 ? entry?.counts[e] : ''}
            </button>
          ))}
        </div>
      )}
    </td>
  );
}
