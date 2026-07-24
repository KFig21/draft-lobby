import { POSITION_COLORS, type DraftType, type Position } from '@draft-lobby/shared';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import { useState } from 'react';
import type { DraftCellStyle } from '../../lib/draftCellStyle';
import { avatarForTeam } from '../../lib/teamAvatar';
import type { ChatMessageRow, MemberRow, PickRow, PlayerRow, TeamRow } from '../../lib/types';
import { Avatar } from '../Avatar/Avatar';
import { BoldPickCell } from './BoldPickCell';
import type { Reactor } from '../ReactorsModal/ReactorsModal';
import './DraftGrid.scss';

export interface ReactionEntry {
  counts: Record<string, number>;
  mine: Set<string>;
  /** Who reacted, keyed by emoji — populated for board picks (for the
   * "see who reacted" modal); comment reactions don't need it here. */
  reactors?: Record<string, Reactor[]>;
}

interface Props {
  teams: TeamRow[];
  members: MemberRow[];
  rounds: number;
  picks: PickRow[];
  playersById: Map<string, PlayerRow>;
  onClockTeamId: string | null;
  /** The signed-in user's own team, if they have one — highlighted in the header. */
  myTeamId?: string | null;
  currentRound: number;
  draftType: DraftType;
  /** Click a team header to view that team's lineup. */
  onTeamClick?: (teamId: string) => void;
  /** Reactions per pick id (for the on-board hover reactions). */
  reactionsByPick?: Map<string, ReactionEntry>;
  onReactPick?: (pickId: string, emoji: string) => void;
  /** Click a pick to open its detail modal. */
  onPickClick?: (pick: PickRow) => void;
  /** Comments per pick id (just for the "has comments" board indicator). */
  commentsByPick?: Map<string, ChatMessageRow[]>;
  /** Fullscreen ("TV mode"): stretch columns to fill the available width. */
  fill?: boolean;
  /** How a drafted pick's cell renders — a user preference (Settings), not
   * per-lobby. 'bold' fills the whole cell with the position color and shows
   * just the player's name, big — meant to be readable from across a room. */
  cellStyle?: DraftCellStyle;
  /** Fullscreen: row height (px) computed to fill the available height. */
  fillRowHeight?: number | null;
  /** The viewer's own on-the-clock cell was clicked — switches to the
   * Players tab (and, in fullscreen, opens the Menu modal onto it). */
  onMyClockCellClick?: () => void;
  /** Same thresholds as the top bar's pick clock — colors whichever cell is
   * on the clock yellow at 25s left, red at 10s, for every viewer. */
  onClockUrgency?: 'warning' | 'danger' | null;
  /** Same "last 5 seconds" pulse as the top bar's pick clock. */
  onClockFlashing?: boolean;
  /** 0-1: how much of the current pick's clock has elapsed — grows the
   * on-the-clock cell's progress fill left to right. */
  onClockElapsedPct?: number | null;
}

/**
 * The draft board: columns are teams (in draft order), rows are rounds.
 * Each cell holds the pick that team made that round. The on-the-clock cell is
 * highlighted (computed by the page via the shared snake helper).
 */
export function DraftGrid({
  teams,
  members,
  rounds,
  picks,
  playersById,
  onClockTeamId,
  myTeamId,
  currentRound,
  draftType,
  onTeamClick,
  reactionsByPick,
  onReactPick,
  onPickClick,
  commentsByPick,
  fill = false,
  cellStyle = 'default',
  fillRowHeight,
  onMyClockCellClick,
  onClockUrgency,
  onClockFlashing,
  onClockElapsedPct,
}: Props) {
  // Index picks by "round:teamId" for O(1) cell lookup.
  const byCell = new Map<string, PickRow>();
  for (const p of picks) byCell.set(`${p.round}:${p.team_id}`, p);

  // Cross-highlight the hovered pick's round cell + team header (desktop).
  const [hover, setHover] = useState<{ round: number; teamId: string } | null>(null);

  return (
    <div className="grid-scroll">
      <table
        className={`draft-grid${fill ? ' draft-grid--fill' : ''}`}
        style={fillRowHeight ? { ['--fs-row-h' as string]: `${fillRowHeight}px` } : undefined}
      >
        <thead>
          <tr>
            <th className="draft-grid__corner" />
            {teams.map((team) => (
              <th
                key={team.id}
                className={`draft-grid__team${
                  team.id === myTeamId ? ' draft-grid__team--mine' : ''
                }${team.id === onClockTeamId ? ' draft-grid__team--onclock' : ''}${
                  hover?.teamId === team.id ? ' draft-grid__team--hi' : ''
                }`}
              >
                <button
                  type="button"
                  className="draft-grid__team-btn"
                  onClick={() => onTeamClick?.(team.id)}
                  title={`View ${team.name}'s lineup`}
                >
                  <span className="draft-grid__team-avatar">
                    <Avatar avatar={avatarForTeam(team, members)} size={16} />
                  </span>
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
                  }${round === currentRound ? ' draft-grid__round--current' : ''}`}
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
                  // The viewer's own on-the-clock cell doubles as a shortcut
                  // into the Players tab, in every layout (board, sidebar,
                  // mobile tabs, fullscreen).
                  const isMyClock = isOnClock && team.id === myTeamId;
                  if (pick && player) {
                    if (cellStyle === 'bold') {
                      return <BoldPickCell key={team.id} pick={pick} player={player} onClick={onPickClick} />;
                    }
                    return (
                      <PickCell
                        key={team.id}
                        pick={pick}
                        player={player}
                        entry={reactionsByPick?.get(pick.id)}
                        hasComment={(commentsByPick?.get(pick.id)?.length ?? 0) > 0}
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
                      }${isMyClock ? ' draft-grid__cell--onclock-mine' : ''}${
                        isOnClock && onClockUrgency ? ` draft-grid__cell--${onClockUrgency}` : ''
                      }${isOnClock && onClockFlashing ? ' draft-grid__cell--flash' : ''}`}
                      onClick={isMyClock ? onMyClockCellClick : undefined}
                      role={isMyClock ? 'button' : undefined}
                      tabIndex={isMyClock ? 0 : undefined}
                      onKeyDown={
                        isMyClock
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onMyClockCellClick?.();
                              }
                            }
                          : undefined
                      }
                    >
                      {isOnClock && onClockElapsedPct != null && (
                        <span
                          className="draft-grid__onclock-fill"
                          style={{ width: `${Math.min(1, Math.max(0, onClockElapsedPct)) * 100}%` }}
                          aria-hidden
                        />
                      )}
                      {isOnClock &&
                        (isMyClock ? (
                          <span className="draft-grid__onclock-label">
                            <span className="draft-grid__onclock-title">
                              <TouchAppIcon fontSize="inherit" /> On the clock!
                            </span>
                            <span className="draft-grid__onclock-sub">
                              Click here to view players
                            </span>
                          </span>
                        ) : (
                          <span className="draft-grid__onclock-label">
                            <TimerOutlinedIcon className="draft-grid__onclock-icon" />
                            On the clock
                          </span>
                        ))}
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
  hasComment,
  onReact,
  onClick,
  onEnter,
  onLeave,
}: {
  pick: PickRow;
  player: PlayerRow;
  entry: ReactionEntry | undefined;
  hasComment: boolean;
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

      {/* Subtle, uncluttered indicators for reactions / comments on this pick. */}
      {(active.length > 0 || hasComment) && (
        <span className="draft-grid__flags" aria-hidden>
          {hasComment && (
            <ChatBubbleOutlineIcon className="draft-grid__comment-flag" sx={{ fontSize: 11 }} />
          )}
          {active.length > 0 && <span className="draft-grid__react-flag">!!</span>}
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
