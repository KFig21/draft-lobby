import { POSITION_COLORS, type Position, type ScoringRules } from '@draft-lobby/shared';
import { useState, type ReactNode } from 'react';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SearchIcon from '@mui/icons-material/Search';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { INJURY_ABBR, INJURY_SEVERITY } from '../../lib/injuryStatus';
import { getTeamColors, getTeamColorsEnabled } from '../../lib/nflTeamColors';
import type { PlayerRow } from '../../lib/types';
import { PlayerWeekStatsModal } from '../PlayerWeekStatsModal/PlayerWeekStatsModal';
import './PlayerStatBlock.scss';

/** Enables the 🔍 deep week-by-week stats button next to "Last year". */
export interface WeekStatsContext {
  /** The completed season whose weekly actuals to show (the "last year" line). */
  season: number;
  /** The lobby's scoring rules — the default lens for weekly points. */
  scoring: ScoringRules;
  /** Show the PPR/Half/Std scoring toggle. In a draft the only meaningful lens
   * is the league's own scoring, so it's omitted; on the Rankings page (where
   * there's no single league) the viewer can compare formats. */
  allowScoringToggle?: boolean;
}

interface Props {
  player: PlayerRow;
  /** This pick was a kept player, not a normal draft selection. */
  isKeeper?: boolean;
  /** When set, shows the 🔍 "deep stats" button next to Last year. */
  weekStats?: WeekStatsContext;
}

interface HeaderProps extends Props {
  /** Optional control rendered inline right after the name (e.g. a queue
   * bookmark toggle in PlayerDetailModal). */
  action?: ReactNode;
}

/** Position badge + name/team/bye/injury — shared between PickModal and
 * PlayerDetailModal. PickModal renders its pick-specific info (drafted by,
 * round/pick, rollback) between this and <PlayerStatGrid>; PlayerDetailModal
 * renders them back-to-back since there's no pick yet to describe. */
export function PlayerHeader({ player, isKeeper, action }: HeaderProps) {
  const pos = player.position as Position;
  const injury = INJURY_ABBR[player.injury_status];
  // Team-colored abbreviation pill — only when the user has the setting on and
  // the team is one we have a color pair for (else fall back to plain text).
  const teamColors = getTeamColorsEnabled() ? getTeamColors(player.nfl_team) : null;
  return (
    <header className="player-stat-block__head">
      <span className="player-stat-block__pos" style={{ background: POSITION_COLORS[pos] }}>
        {player.position}
      </span>
      <div className="player-stat-block__title">
        <h3>
          {player.name}
          {isKeeper && (
            <span className="player-stat-block__keeper-badge">
              <LockOutlinedIcon sx={{ fontSize: 13 }} /> Keeper
            </span>
          )}
          {action}
        </h3>
        <div className="player-stat-block__subtitle">
          {teamColors ? (
            <>
              <span
                className="player-stat-block__team"
                style={{ background: teamColors.bg, color: teamColors.text }}
              >
                {player.nfl_team}
              </span>
              {player.bye_week ? <span className="muted">Bye {player.bye_week}</span> : null}
            </>
          ) : (
            <span className="muted">
              {player.nfl_team}
              {player.bye_week ? ` · Bye ${player.bye_week}` : ''}
            </span>
          )}
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
  const variant = proj < prev ? 'up' : proj > prev ? 'down' : 'flat';
  const Icon = variant === 'up' ? TrendingUpIcon : variant === 'down' ? TrendingDownIcon : TrendingFlatIcon;
  // Fixed-size wrapper with the svg forced to fill it — sidesteps relying on
  // overriding MUI's own font-size-driven icon sizing (which wasn't taking
  // reliably and let the default ~24px icon loom over the small stat value).
  return (
    <span className={`player-stat-block__trend player-stat-block__trend--${variant}`}>
      <Icon />
    </span>
  );
}

/** The ADP/proj-rank/last-year-rank row + projected/last-year totals (each
 * with a compact stat line) — shared between PickModal and PlayerDetailModal. */
export function PlayerStatGrid({ player, weekStats }: Props) {
  const hasPrev = player.prev_points != null || player.prev_rank != null;
  const [showWeek, setShowWeek] = useState(false);

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
            <span className="player-stat-block__stat-label">
              Last year
              {weekStats && (
                <button
                  type="button"
                  className="player-stat-block__deep"
                  onClick={() => setShowWeek(true)}
                  aria-label="Week-by-week stats"
                  title="Week-by-week stats"
                >
                  <SearchIcon sx={{ fontSize: 14 }} />
                </button>
              )}
            </span>
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

      {showWeek && weekStats && (
        <PlayerWeekStatsModal
          player={player}
          season={weekStats.season}
          scoring={weekStats.scoring}
          allowScoringToggle={weekStats.allowScoringToggle}
          onClose={() => setShowWeek(false)}
        />
      )}
    </>
  );
}
