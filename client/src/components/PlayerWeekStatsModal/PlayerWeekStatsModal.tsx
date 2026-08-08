import {
  POSITION_COLORS,
  SCORING_PRESETS,
  computeFantasyPoints,
  matchPreset,
  type Position,
  type ScoringRules,
} from '@draft-lobby/shared';
import CloseIcon from '@mui/icons-material/Close';
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePlayerWeekStats } from '../../hooks/usePlayerWeekStats';
import { useModalClose } from '../../lib/useModalClose';
import type { PlayerRow, PlayerWeekStatRow } from '../../lib/types';
import './PlayerWeekStatsModal.scss';

const WEEKS = 18;

type ScoreKey = 'league' | 'PPR' | 'HALF_PPR' | 'STANDARD';

/** Rank → colour on a green (best) → amber → red (worst) scale. */
function rankColor(rank: number | null, count: number): string {
  if (rank == null || count < 2) return '#8a94a6';
  const t = (rank - 1) / (count - 1);
  return t <= 0.5
    ? `color-mix(in srgb, #f6a642 ${(t * 200).toFixed(0)}%, #3fd6a5)`
    : `color-mix(in srgb, #f8577d ${((t - 0.5) * 200).toFixed(0)}%, #f6a642)`;
}

/** Points for a week: the raw line scored under `rules`, else Sleeper's PPR
 * total (K rows and any player missing a mapped raw line). */
function pointsForRow(row: PlayerWeekStatRow, rules: ScoringRules, position: string): number {
  if (row.stats && Object.keys(row.stats).length > 0) {
    return computeFantasyPoints(row.stats, rules, position);
  }
  return row.pts_ppr ?? 0;
}

const n = (v: number | undefined) => (v == null ? 0 : Math.round(v));
type StatCol = { h: string; get: (s: Record<string, number>) => string | number };
const STAT_COLS: Record<string, StatCol[]> = {
  QB: [
    { h: 'Pass', get: (s) => n(s.passingYards) },
    { h: 'TD', get: (s) => n(s.passingTd) || '—' },
    { h: 'INT', get: (s) => n(s.interception) || '—' },
    { h: 'Rush', get: (s) => n(s.rushingYards) },
  ],
  RB: [
    { h: 'Rush', get: (s) => n(s.rushingYards) },
    { h: 'Rec', get: (s) => n(s.reception) },
    { h: 'Yds', get: (s) => n(s.receivingYards) },
    { h: 'TD', get: (s) => n(s.rushingTd) + n(s.receivingTd) || '—' },
  ],
  WR: [
    { h: 'Rec', get: (s) => n(s.reception) },
    { h: 'Yds', get: (s) => n(s.receivingYards) },
    { h: 'TD', get: (s) => n(s.receivingTd) || '—' },
    { h: 'Rush', get: (s) => n(s.rushingYards) || '—' },
  ],
  TE: [
    { h: 'Rec', get: (s) => n(s.reception) },
    { h: 'Yds', get: (s) => n(s.receivingYards) },
    { h: 'TD', get: (s) => n(s.receivingTd) || '—' },
  ],
  K: [],
  DEF: [],
};

interface Props {
  player: PlayerRow;
  /** The completed season whose weekly actuals to show (i.e. "last year"). */
  season: number;
  /** The lobby's scoring rules — the default "League" lens. */
  scoring: ScoringRules;
  onClose: () => void;
}

/**
 * Deep week-by-week stats for a player — opened from the 🔍 next to LAST YEAR.
 * Every week's box score + fantasy points scored under the chosen rules, the
 * player's positional rank that week (colour-coded on the bar chart), and a
 * draggable week-range that reports their rank + PPG over that stretch.
 */
export function PlayerWeekStatsModal({ player, season, scoring, onClose }: Props) {
  const { closing, requestClose } = useModalClose(onClose);
  const { rows, loading, error } = usePlayerWeekStats(player.position, season, true);
  const pos = player.position as Position;
  const posColor = POSITION_COLORS[pos];

  const leaguePreset = matchPreset(scoring);
  const [scoreKey, setScoreKey] = useState<ScoreKey>('league');
  const rules = scoreKey === 'league' ? scoring : SCORING_PRESETS[scoreKey].rules;

  const [range, setRange] = useState<[number, number]>([1, WEEKS]);

  // Points per player per week under the current rules, plus the per-week field
  // (for ranking) and the subject's raw rows (for the box-score table).
  const model = useMemo(() => {
    const byPlayer = new Map<string, Map<number, number>>();
    const byWeek = new Map<number, number[]>();
    const subjectRows = new Map<number, PlayerWeekStatRow>();
    for (const r of rows) {
      const pts = pointsForRow(r, rules, player.position);
      let pm = byPlayer.get(r.player_id);
      if (!pm) {
        pm = new Map();
        byPlayer.set(r.player_id, pm);
      }
      pm.set(r.week, pts);
      const wl = byWeek.get(r.week) ?? [];
      wl.push(pts);
      byWeek.set(r.week, wl);
      if (r.player_id === player.id) subjectRows.set(r.week, r);
    }
    return { byPlayer, byWeek, subjectRows };
  }, [rows, rules, player.id, player.position]);

  const subjectPts = model.byPlayer.get(player.id);
  const hasData = !!subjectPts && subjectPts.size > 0;
  const maxPts = hasData ? Math.max(...subjectPts.values(), 1) : 1;

  const weekRank = (week: number): { rank: number; of: number } | null => {
    const mine = subjectPts?.get(week);
    const list = model.byWeek.get(week);
    if (mine == null || !list) return null;
    return { rank: 1 + list.filter((p) => p > mine).length, of: list.length };
  };

  // Aggregate over the selected range: the subject's total/PPG/games, and their
  // rank by PPG among everyone who played ≥1 game in the range.
  const rangeStats = useMemo(() => {
    const [from, to] = range;
    let tot = 0;
    let gp = 0;
    for (let w = from; w <= to; w++) {
      const p = subjectPts?.get(w);
      if (p != null) {
        tot += p;
        gp++;
      }
    }
    const ppg = gp ? tot / gp : 0;
    let better = 0;
    let ranked = 0;
    for (const wm of model.byPlayer.values()) {
      let t = 0;
      let g = 0;
      for (let w = from; w <= to; w++) {
        const p = wm.get(w);
        if (p != null) {
          t += p;
          g++;
        }
      }
      if (g === 0) continue;
      ranked++;
      if (t / g > ppg) better++;
    }
    return { tot, gp, ppg, rank: gp ? better + 1 : null, of: ranked };
  }, [model, subjectPts, range]);

  // ── Drag-to-select the week range across the bar chart ──────────────
  const chartRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const anchor = useRef(1);
  const weekFromX = (clientX: number): number | null => {
    const el = chartRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const rel = (clientX - rect.left) / rect.width;
    return Math.min(WEEKS, Math.max(1, Math.floor(rel * WEEKS) + 1));
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const w = weekFromX(e.clientX);
    if (w == null) return;
    dragging.current = true;
    anchor.current = w;
    setRange([w, w]);
    try {
      chartRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const w = weekFromX(e.clientX);
    if (w == null) return;
    setRange([Math.min(anchor.current, w), Math.max(anchor.current, w)]);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    try {
      chartRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const [from, to] = range;
  const fullSeason = from === 1 && to === WEEKS;
  const rangeLabel = fullSeason ? 'Full season' : `Weeks ${from}–${to}`;
  const cols = STAT_COLS[player.position] ?? [];
  const posLabel = player.position === 'DEF' ? 'D/ST' : player.position;

  return createPortal(
    <div
      className={`pws__backdrop modal-anim-backdrop${closing ? ' is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`pws modal-anim-card${closing ? ' is-closing' : ''}`}
        style={{ ['--pos']: posColor } as CSSProperties}
        role="dialog"
        aria-label={`${player.name} week-by-week stats`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pws__head">
          <span className="pws__pos" style={{ background: posColor }}>
            {player.position}
          </span>
          <div className="pws__id">
            <h3>{player.name}</h3>
            <div className="pws__sub">
              {posLabel} · {player.nfl_team}
              {player.bye_week ? ` · Bye ${player.bye_week}` : ''}
            </div>
          </div>
          <span className="pws__season">{season} SEASON</span>
          <button className="pws__close" aria-label="Close" onClick={requestClose}>
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <div className="pws__body">
          {loading ? (
            <p className="pws__state">Loading week-by-week stats…</p>
          ) : error ? (
            <p className="pws__state">Couldn’t load week-by-week stats.</p>
          ) : !hasData ? (
            <p className="pws__state">
              Week-by-week stats aren’t available for {player.name}
              {player.position === 'DEF' ? ' (D/ST)' : ''} yet.
            </p>
          ) : (
            <>
              <div className="pws__controls">
                <div className="pws__seg" role="tablist" aria-label="Scoring">
                  <button
                    className={scoreKey === 'league' ? 'on' : ''}
                    onClick={() => setScoreKey('league')}
                  >
                    League
                    {leaguePreset && (
                      <span className="pws__seg-sub">{SCORING_PRESETS[leaguePreset].label.split(' ')[0]}</span>
                    )}
                  </button>
                  <button className={scoreKey === 'PPR' ? 'on' : ''} onClick={() => setScoreKey('PPR')}>PPR</button>
                  <button className={scoreKey === 'HALF_PPR' ? 'on' : ''} onClick={() => setScoreKey('HALF_PPR')}>Half</button>
                  <button className={scoreKey === 'STANDARD' ? 'on' : ''} onClick={() => setScoreKey('STANDARD')}>Std</button>
                </div>
                {!fullSeason && (
                  <button className="pws__reset" onClick={() => setRange([1, WEEKS])}>
                    Full season
                  </button>
                )}
              </div>

              <div className="pws__summary">
                <div className="pws__rank">
                  <div className="pws__rank-v">
                    {posLabel}
                    <span>{rangeStats.rank ?? '—'}</span>
                  </div>
                  <div className="pws__rank-lab">{rangeLabel}</div>
                </div>
                <div className="pws__summary-body">
                  <div className="pws__summary-head">
                    <b>{player.name}</b> ranked <b>{posLabel}{rangeStats.rank ?? '—'}</b> of{' '}
                    {rangeStats.of} over {rangeLabel.toLowerCase()}.
                  </div>
                  <div className="pws__metrics">
                    <div className="pws__metric">
                      <div className="v">{rangeStats.ppg.toFixed(1)}</div>
                      <div className="k">PPG</div>
                    </div>
                    <div className="pws__metric">
                      <div className="v">{rangeStats.tot.toFixed(1)}</div>
                      <div className="k">Total</div>
                    </div>
                    <div className="pws__metric">
                      <div className="v">{rangeStats.gp}</div>
                      <div className="k">Games</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pws__chart-lab">
                <span className="t">Fantasy points by week</span>
                <span className="hint">drag across the bars to pick a range</span>
              </div>
              <div
                className="pws__chart"
                ref={chartRef}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
              >
                {Array.from({ length: WEEKS }, (_, i) => i + 1).map((w) => {
                  const pts = subjectPts?.get(w);
                  const inRange = w >= from && w <= to;
                  const wr = weekRank(w);
                  const isBye = pts == null;
                  const h = isBye ? 6 : Math.max(5, (pts / maxPts) * 100);
                  return (
                    <div
                      key={w}
                      className={`pws__col${inRange ? ' inrange' : ''}${isBye ? ' bye' : ''}`}
                    >
                      {!isBye && <span className="pws__col-v">{pts.toFixed(0)}</span>}
                      <span
                        className="pws__bar"
                        style={{ height: `${h}%`, background: isBye ? undefined : rankColor(wr?.rank ?? null, wr?.of ?? 0) }}
                      />
                      <span className="pws__col-w">{w}</span>
                    </div>
                  );
                })}
              </div>

              <div className="pws__tbl-wrap">
                <table className="pws__tbl">
                  <thead>
                    <tr>
                      <th>Wk</th>
                      <th>Opp</th>
                      {cols.map((c) => (
                        <th key={c.h}>{c.h}</th>
                      ))}
                      <th>Pts</th>
                      <th>{posLabel} rk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: WEEKS }, (_, i) => i + 1).map((w) => {
                      const row = model.subjectRows.get(w);
                      const pts = subjectPts?.get(w);
                      const inRange = w >= from && w <= to;
                      const isBye = pts == null;
                      const wr = weekRank(w);
                      const s = row?.stats ?? {};
                      return (
                        <tr key={w} className={`${inRange ? 'inrange' : ''}${isBye ? ' bye' : ''}`}>
                          <td className="wk">{w}</td>
                          <td>{row?.opp ?? '—'}</td>
                          {isBye ? (
                            <td colSpan={cols.length} className="byecell">
                              {w === player.bye_week ? 'BYE' : 'DNP'}
                            </td>
                          ) : (
                            cols.map((c) => <td key={c.h}>{c.get(s)}</td>)
                          )}
                          <td className="pts">{isBye ? '—' : pts.toFixed(1)}</td>
                          <td className="rk">
                            {wr ? (
                              <span style={{ color: rankColor(wr.rank, wr.of) }}>
                                {posLabel}{wr.rank}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="pws__foot">
                Points scored under{' '}
                <b>
                  {scoreKey === 'league'
                    ? leaguePreset
                      ? SCORING_PRESETS[leaguePreset].label
                      : 'your league’s scoring'
                    : SCORING_PRESETS[scoreKey].label}
                </b>
                . Rank is against every {posLabel} who played that week.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
