import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import type { PlayerRow } from '../../lib/types';
import './PlayerStatBlock.scss';

interface Props {
  player: PlayerRow;
}

/** Position badge + name/team/bye/injury + the projected/ADP/last-year stat
 * grid — shared between PickModal (a pick that's already happened) and
 * PlayerDetailModal (previewing someone not yet drafted), so both read as
 * the same "player summary" regardless of which one you're looking at. */
export function PlayerStatBlock({ player }: Props) {
  const pos = player.position as Position;
  const hasPrev = player.prev_points != null || player.prev_rank != null;

  return (
    <>
      <header className="player-stat-block__head">
        <span className="player-stat-block__pos" style={{ background: POSITION_COLORS[pos] }}>
          {player.position}
        </span>
        <div className="player-stat-block__title">
          <h3>{player.name}</h3>
          <span className="muted">
            {player.nfl_team}
            {player.bye_week ? ` · Bye ${player.bye_week}` : ''}
            {player.injury_status && player.injury_status !== 'ACTIVE'
              ? ` · ${player.injury_status}`
              : ''}
          </span>
        </div>
      </header>

      <div className="player-stat-block__stats">
        <div className="player-stat-block__stat">
          <span className="player-stat-block__stat-label">Projected</span>
          <span className="player-stat-block__stat-value">
            {player.proj_points != null ? player.proj_points.toFixed(1) : '—'}
          </span>
        </div>
        <div className="player-stat-block__stat">
          <span className="player-stat-block__stat-label">ADP</span>
          <span className="player-stat-block__stat-value">
            {player.adp != null ? player.adp.toFixed(1) : '—'}
          </span>
        </div>
        <div className="player-stat-block__stat">
          <span className="player-stat-block__stat-label">Last yr pts</span>
          <span className="player-stat-block__stat-value">
            {player.prev_points != null ? player.prev_points.toFixed(1) : '—'}
          </span>
        </div>
        <div className="player-stat-block__stat">
          <span className="player-stat-block__stat-label">Last yr rank</span>
          <span className="player-stat-block__stat-value">
            {player.prev_rank != null ? `#${player.prev_rank}` : '—'}
          </span>
        </div>
      </div>
      {!hasPrev && (
        <p className="player-stat-block__note muted">
          Full prior-season stats aren’t loaded yet.
        </p>
      )}
    </>
  );
}
