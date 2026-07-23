import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { INJURY_ABBR, INJURY_SEVERITY } from '../../lib/injuryStatus';
import type { PlayerRow } from '../../lib/types';
import './PlayerStatBlock.scss';

interface Props {
  player: PlayerRow;
}

/** Position badge + name/team/bye/injury — shared between PickModal and
 * PlayerDetailModal. PickModal renders its pick-specific info (drafted by,
 * round/pick, rollback) between this and <PlayerStatGrid>; PlayerDetailModal
 * renders them back-to-back since there's no pick yet to describe. */
export function PlayerHeader({ player }: Props) {
  const pos = player.position as Position;
  const injury = INJURY_ABBR[player.injury_status];
  return (
    <header className="player-stat-block__head">
      <span className="player-stat-block__pos" style={{ background: POSITION_COLORS[pos] }}>
        {player.position}
      </span>
      <div className="player-stat-block__title">
        <h3>{player.name}</h3>
        <div className="player-stat-block__subtitle">
          <span className="muted">
            {player.nfl_team}
            {player.bye_week ? ` · Bye ${player.bye_week}` : ''}
          </span>
          {injury && (
            <span
              className={`injury-badge injury-badge--${INJURY_SEVERITY[player.injury_status] ?? 'danger'}`}
              title={player.injury_status}
            >
              {injury}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

/** Up = projected to rank better than last year (lower number), down = worse,
 * flat = unchanged. Needs both ranks — most rookies/new-to-the-league
 * players only have one or the other. */
function RankTrend({ proj, prev }: { proj: number | null; prev: number | null }) {
  if (proj == null || prev == null) return null;
  if (proj < prev) {
    return <TrendingUpIcon className="player-stat-block__trend player-stat-block__trend--up" />;
  }
  if (proj > prev) {
    return (
      <TrendingDownIcon className="player-stat-block__trend player-stat-block__trend--down" />
    );
  }
  return <TrendingFlatIcon className="player-stat-block__trend player-stat-block__trend--flat" />;
}

/** The ADP/proj-rank/last-year-rank row + projected/last-year totals (each
 * with a compact stat line) — shared between PickModal and PlayerDetailModal. */
export function PlayerStatGrid({ player }: Props) {
  const hasPrev = player.prev_points != null || player.prev_rank != null;

  return (
    <>
      <div className="player-stat-block__row">
        <div className="player-stat-block__stat">
          <span className="player-stat-block__stat-label">ADP</span>
          <span className="player-stat-block__stat-value">
            {player.adp != null ? player.adp.toFixed(1) : '—'}
          </span>
        </div>
        <div className="player-stat-block__stat">
          <span className="player-stat-block__stat-label">Proj rank</span>
          <span className="player-stat-block__stat-value">
            {player.proj_rank != null ? `#${player.proj_rank}` : '—'}
            <RankTrend proj={player.proj_rank} prev={player.prev_rank} />
          </span>
        </div>
        <div className="player-stat-block__stat">
          <span className="player-stat-block__stat-label">Last yr rank</span>
          <span className="player-stat-block__stat-value">
            {player.prev_rank != null ? `#${player.prev_rank}` : '—'}
          </span>
        </div>
      </div>

      <div className="player-stat-block__totals">
        <div className="player-stat-block__total player-stat-block__total--projected">
          <div className="player-stat-block__total-head">
            <span className="player-stat-block__stat-label">Projected</span>
            <span className="player-stat-block__stat-value">
              {player.proj_points != null ? player.proj_points.toFixed(1) : '—'}
            </span>
          </div>
          {player.proj_stat_line && (
            <span className="player-stat-block__stat-line">{player.proj_stat_line}</span>
          )}
        </div>
        <div className="player-stat-block__total player-stat-block__total--prev">
          <div className="player-stat-block__total-head">
            <span className="player-stat-block__stat-label">Last year</span>
            <span className="player-stat-block__stat-value">
              {player.prev_points != null ? player.prev_points.toFixed(1) : '—'}
            </span>
          </div>
          {player.prev_stat_line && (
            <span className="player-stat-block__stat-line">{player.prev_stat_line}</span>
          )}
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
