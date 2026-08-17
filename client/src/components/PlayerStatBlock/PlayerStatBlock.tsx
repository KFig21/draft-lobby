import {
  POSITION_COLORS,
  POSITIONS,
  type Position,
  type ScoringRules,
} from '@draft-lobby/shared';
import { useState, type ReactNode } from 'react';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { usePlayerWeekPoints } from '../../hooks/usePlayerWeekPoints';
import { INJURY_ABBR, INJURY_SEVERITY } from '../../lib/injuryStatus';
import { getTeamColors, getTeamColorsEnabled } from '../../lib/nflTeamColors';
import { POS_STAT_COLS, fmtStat } from '../../lib/positionStats';
import type { PlayerRow } from '../../lib/types';
import { PlayerWeekStatsModal } from '../PlayerWeekStatsModal/PlayerWeekStatsModal';
import './PlayerStatBlock.scss';

/** Enables the 🔍 deep week-by-week stats button next to "Last year". */
export interface WeekStatsContext {
  /** The completed season whose weekly actuals to show (the "last year" line). */
  season: number;
  /** The scoring rules weekly points are computed under. */
  scoring: ScoringRules;
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
  /** Per-position count of the viewer's own drafted players sharing this
   * player's bye week — rendered as a compact chip on the meta line. */
  byeClashCounts?: Partial<Record<Position, number>>;
}

/** Compact summary of any bye-week clashes for the header chip. */
function byeClashSummary(
  byeWeek: number | null,
  counts?: Partial<Record<Position, number>>,
): { total: number; text: string; severe: boolean } | null {
  if (byeWeek == null || !counts) return null;
  const entries = POSITIONS.map((p) => [p, counts[p] ?? 0] as const).filter(([, c]) => c > 0);
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, [, c]) => sum + c, 0);
  const text = entries.map(([p, c]) => `${c} ${p === 'DEF' ? 'D/ST' : p}`).join(' · ');
  return { total, text, severe: total >= 3 };
}

/** Position badge + name/team/bye/injury — shared between PickModal and
 * PlayerDetailModal. PickModal renders its pick-specific info (drafted by,
 * round/pick, rollback) between this and <PlayerStatGrid>; PlayerDetailModal
 * renders them back-to-back since there's no pick yet to describe. */
export function PlayerHeader({ player, isKeeper, action, byeClashCounts }: HeaderProps) {
  const pos = player.position as Position;
  const injury = INJURY_ABBR[player.injury_status];
  const clash = byeClashSummary(player.bye_week, byeClashCounts);
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
          {/* Keeper sits on the meta line (with the bye) rather than beside the
              name — a small gold chip, only for kept players. */}
          {isKeeper && (
            <span className="player-stat-block__keeper-badge">
              <LockOutlinedIcon sx={{ fontSize: 12 }} /> Keeper
            </span>
          )}
          {clash && (
            <span
              className={`player-stat-block__clash${
                clash.severe ? ' player-stat-block__clash--danger' : ''
              }`}
              title={`Your roster already has ${clash.total} player${
                clash.total === 1 ? '' : 's'
              } on bye week ${player.bye_week}`}
            >
              <WarningAmberOutlinedIcon sx={{ fontSize: 12 }} /> Bye clash · {clash.text}
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

/** A points total, Futura-italic with a smaller decimal — the app's projected-
 * points treatment (see .prb-proj / grade cards). */
function ProjNum({ value }: { value: number }) {
  const [int, dec] = value.toFixed(1).split('.');
  return (
    <span className="player-stat-block__proj">
      {int}
      <span className="player-stat-block__proj-dec">.{dec}</span>
    </span>
  );
}

// These stats are better when they go DOWN (fewer is better); everything else
// is better when it goes up. Drives the green/red on the trend arrow.
const LOWER_IS_BETTER = new Set(['interception', 'fumble', 'fumbles', 'fumblesLost']);

/** Group a per-position stat key into its section header. POS_STAT_COLS is
 * already ordered by group, so tracking the label as we iterate is enough. */
function statGroup(key: string): string {
  if (key.startsWith('passing') || key === 'interception') return 'Passing';
  if (key.startsWith('rushing')) return 'Rushing';
  if (key.startsWith('receiving') || key === 'reception') return 'Receiving';
  return 'Other';
}

/** Drop the leading Pass/Rush/Rec word (the group header carries it) and spell
 * out the terse "Yd". */
function shortStatLabel(label: string): string {
  const s = label.replace(/^(Pass|Rush|Rec)\s+/, '');
  return s === 'Yd' ? 'Yards' : s;
}

/** ▲/▼ colored by whether the change is an improvement. `null` when either
 * side is missing or the value is unchanged. */
function StatTrend({ statKey, proj, prev }: { statKey: string; proj?: number; prev?: number }) {
  if (proj == null || prev == null || Math.round(proj) === Math.round(prev)) return null;
  const up = proj > prev;
  const better = LOWER_IS_BETTER.has(statKey) ? !up : up;
  return (
    <span
      className={`player-stat-block__tr player-stat-block__tr--${better ? 'good' : 'bad'}`}
      aria-hidden
    >
      {up ? '▲' : '▼'}
    </span>
  );
}

// A card's change vs last year: a signed delta, the string 'even' when the
// value is unchanged (prior data exists — so both cards still show a pill and
// stay the same height), or null when there's no prior season to compare.
type KeyDelta = { value: number; text: string } | 'even' | null;

/** One headline comparison card (fantasy points or position rank). */
function KeyCard({
  label,
  now,
  prevLabel,
  delta,
}: {
  label: string;
  now: ReactNode;
  prevLabel: ReactNode;
  delta: KeyDelta;
}) {
  return (
    <div className="player-stat-block__keycard">
      <span className="player-stat-block__keycard-label">{label}</span>
      <div className="player-stat-block__keycard-big">
        {now}
        <span className="player-stat-block__keycard-now">proj</span>
      </div>
      <div className="player-stat-block__keycard-prev">
        <span className="player-stat-block__keycard-yr">{prevLabel}</span>
        {delta === 'even' ? (
          <span className="player-stat-block__delta player-stat-block__delta--even">–</span>
        ) : delta ? (
          <span
            className={`player-stat-block__delta player-stat-block__delta--${
              delta.value >= 0 ? 'good' : 'bad'
            }`}
          >
            {delta.value >= 0 ? '▲' : '▼'} {delta.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// A little skeleton silhouette while the weekly points load — keeps the card's
// height stable so nothing jumps when the real bars arrive.
const SPARK_SKELETON = [40, 55, 34, 70, 46, 62, 30, 66, 50, 42, 58, 38, 64, 48, 54, 44];

/** The stats-section entry point: a mini fantasy-points-by-week sparkline that
 * doubles as the "open the weekly breakdown" button (replacing the old plain
 * section header + text button). Falls back to a plain "Stats" header when the
 * player has no weekly data (rookies, most K/DEF). */
function WeeklySparkCard({
  player,
  season,
  scoring,
  onOpen,
}: {
  player: PlayerRow;
  season: number;
  scoring: ScoringRules;
  onOpen: () => void;
}) {
  const { points, loading } = usePlayerWeekPoints(player.id, player.position, season, scoring, true);
  const games = points.length;
  const max = games ? Math.max(...points.map((p) => p.pts), 1) : 1;

  if (!loading && games === 0) {
    return (
      <div className="player-stat-block__stats-head">
        <span className="player-stat-block__section-label">Stats</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`player-stat-block__spark${loading ? ' is-loading' : ''}`}
      onClick={onOpen}
      disabled={loading}
      aria-label={`${player.name} fantasy points by week — open the weekly breakdown`}
    >
      <span className="player-stat-block__spark-bars" aria-hidden>
        {loading
          ? SPARK_SKELETON.map((h, i) => (
              <span
                key={i}
                className="player-stat-block__spark-bar"
                style={{ height: `${h}%` }}
              />
            ))
          : points.map((p) => (
              <span
                key={p.week}
                className="player-stat-block__spark-bar"
                style={{ height: `${Math.max(8, (p.pts / max) * 100)}%` }}
              />
            ))}
      </span>
      <span className="player-stat-block__spark-meta">
        <span className="player-stat-block__spark-title">
          Fantasy pts / week
          <NorthEastIcon className="player-stat-block__spark-arrow" sx={{ fontSize: 15 }} />
        </span>
        <span className="player-stat-block__spark-sub">
          {loading ? 'Loading weekly…' : `${season} season`}
        </span>
      </span>
    </button>
  );
}

/** The two headline comparison cards (fantasy points + position rank) above a
 * grouped last-yr vs projected stats table — shared between PickModal and
 * PlayerDetailModal. */
export function PlayerStatGrid({ player, weekStats }: Props) {
  const [showWeek, setShowWeek] = useState(false);
  const pos = player.position as Position;
  const cols = POS_STAT_COLS[pos];
  const hasTable = !!cols && (!!player.proj_stats || !!player.prev_stats);
  const hasPrev = player.prev_points != null || player.prev_rank != null;

  // The completed season is the "last year" line; label it with the actual
  // year when we know it (weekStats carries the season), else stay generic.
  const prevLabel = weekStats ? String(weekStats.season) : 'Last yr';

  const fpDelta =
    player.proj_points != null && player.prev_points != null
      ? player.proj_points - player.prev_points
      : null;
  // Positive = projected to rank this many spots better than last year.
  const rankDelta =
    player.proj_rank != null && player.prev_rank != null
      ? player.prev_rank - player.proj_rank
      : null;

  return (
    <>
      {/* ── Headline numbers, up top ── */}
      <div className="player-stat-block__keys">
        <KeyCard
          label="Fantasy points"
          now={player.proj_points != null ? <ProjNum value={player.proj_points} /> : '—'}
          prevLabel={
            <>
              {prevLabel} ·{' '}
              <b>{player.prev_points != null ? player.prev_points.toFixed(1) : '—'}</b>
            </>
          }
          delta={
            player.proj_points != null && player.prev_points != null
              ? fpDelta && Math.abs(fpDelta) >= 0.05
                ? { value: fpDelta, text: `${fpDelta >= 0 ? '+' : ''}${fpDelta.toFixed(1)}` }
                : 'even'
              : null
          }
        />
        <KeyCard
          label="Position rank"
          now={
            <span className="player-stat-block__keycard-rank">
              {player.proj_rank != null ? `${pos} ${player.proj_rank}` : '—'}
            </span>
          }
          prevLabel={
            <>
              {prevLabel} · <b>{player.prev_rank != null ? `${pos} ${player.prev_rank}` : '—'}</b>
            </>
          }
          delta={
            player.proj_rank != null && player.prev_rank != null
              ? rankDelta && rankDelta !== 0
                ? { value: rankDelta, text: `${Math.abs(rankDelta)}` }
                : 'even'
              : null
          }
        />
      </div>

      {/* ── Stats: a fantasy-pts-by-week sparkline that opens the weekly
          breakdown (or a plain header when there's no weekly data). The
          2025/Proj column labels ride on each section-header row below. ── */}
      {weekStats ? (
        <WeeklySparkCard
          player={player}
          season={weekStats.season}
          scoring={weekStats.scoring}
          onOpen={() => setShowWeek(true)}
        />
      ) : (
        <div className="player-stat-block__stats-head">
          <span className="player-stat-block__section-label">Stats</span>
        </div>
      )}

      {hasTable ? (
        <table className="player-stat-block__cmp">
          <tbody>
            {(() => {
              let group = '';
              const rows: ReactNode[] = [];
              for (const c of cols!) {
                const g = statGroup(c.key);
                if (g !== group) {
                  group = g;
                  rows.push(
                    <tr key={`g-${g}`} className="player-stat-block__cmp-group">
                      <td>{g}</td>
                      <td className="player-stat-block__cmp-group-lbl player-stat-block__cmp-group-lbl--proj">
                        Proj
                      </td>
                      <td className="player-stat-block__cmp-group-lbl">{prevLabel}</td>
                    </tr>,
                  );
                }
                const pv = player.prev_stats?.[c.key];
                const jv = player.proj_stats?.[c.key];
                rows.push(
                  <tr key={c.key}>
                    <td>{shortStatLabel(c.label)}</td>
                    <td className="player-stat-block__cmp-proj">
                      {fmtStat(jv)}
                      <StatTrend statKey={c.key} proj={jv} prev={pv} />
                    </td>
                    <td>{fmtStat(pv)}</td>
                  </tr>,
                );
              }
              return rows;
            })()}
          </tbody>
        </table>
      ) : (
        // K/DEF or before structured stats load — the pre-formatted lines.
        <div className="player-stat-block__lines">
          {player.proj_stat_line && (
            <div className="player-stat-block__line-row">
              <span className="player-stat-block__stat-label">Proj</span>
              <span>{player.proj_stat_line}</span>
            </div>
          )}
          {player.prev_stat_line && (
            <div className="player-stat-block__line-row">
              <span className="player-stat-block__stat-label">{prevLabel}</span>
              <span>{player.prev_stat_line}</span>
            </div>
          )}
        </div>
      )}

      {!hasPrev && (
        <p className="player-stat-block__note muted">Full prior-season stats aren’t loaded yet.</p>
      )}

      {showWeek && weekStats && (
        <PlayerWeekStatsModal
          player={player}
          season={weekStats.season}
          scoring={weekStats.scoring}
          onClose={() => setShowWeek(false)}
        />
      )}
    </>
  );
}
