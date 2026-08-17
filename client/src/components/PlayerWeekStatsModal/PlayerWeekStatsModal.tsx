import {
  POSITION_COLORS,
  SCORING_PRESETS,
  computeFantasyPoints,
  matchPreset,
  type Position,
  type ScoringRules,
} from '@draft-lobby/shared';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { usePlayerWeekStats } from '../../hooks/usePlayerWeekStats';
import { getTeamColors, getTeamColorsEnabled } from '../../lib/nflTeamColors';
import { useModalClose } from '../../lib/useModalClose';
import type { PlayerRow, PlayerWeekStatRow } from '../../lib/types';
import './PlayerWeekStatsModal.scss';

const WEEKS = 18;

/** Rank → colour on a green (best) → amber → red (worst) scale. */
function rankColor(rank: number | null, count: number): string {
  if (rank == null || count < 2) return '#8a94a6';
  const t = (rank - 1) / (count - 1);
  return t <= 0.5
    ? `color-mix(in srgb, #f6a642 ${(t * 200).toFixed(0)}%, #3fd6a5)`
    : `color-mix(in srgb, #f8577d ${((t - 0.5) * 200).toFixed(0)}%, #f6a642)`;
}

/** A one-decimal number with its fractional part rendered smaller — the same
 * treatment as the Power Rankings projected-points figures (.prb-proj). */
function DecimalNum({ value }: { value: number }) {
  const [whole, frac] = value.toFixed(1).split('.');
  return (
    <>
      {whole}
      <span className="pws__dec">.{frac}</span>
    </>
  );
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
// Count stats read cleaner with 0 shown as an em dash; volume stats show the 0.
const dash = (v: number | undefined) => n(v) || '—';
type StatCol = { h: string; get: (s: Record<string, number>) => string | number };
const STAT_COLS: Record<string, StatCol[]> = {
  QB: [
    { h: 'Pass Yd', get: (s) => n(s.passingYards) },
    { h: 'Pass TD', get: (s) => dash(s.passingTd) },
    { h: 'INT', get: (s) => dash(s.interception) },
    { h: 'Rush Yd', get: (s) => n(s.rushingYards) },
    { h: 'Rush TD', get: (s) => dash(s.rushingTd) },
    { h: 'Fum', get: (s) => dash(s.fumbleLost) },
  ],
  RB: [
    { h: 'Rush Yd', get: (s) => n(s.rushingYards) },
    { h: 'Rush TD', get: (s) => dash(s.rushingTd) },
    { h: 'Rec', get: (s) => n(s.reception) },
    { h: 'Rec Yd', get: (s) => n(s.receivingYards) },
    { h: 'Rec TD', get: (s) => dash(s.receivingTd) },
    { h: 'Fum', get: (s) => dash(s.fumbleLost) },
  ],
  WR: [
    { h: 'Rec', get: (s) => n(s.reception) },
    { h: 'Rec Yd', get: (s) => n(s.receivingYards) },
    { h: 'Rec TD', get: (s) => dash(s.receivingTd) },
    { h: 'Rush Yd', get: (s) => dash(s.rushingYards) },
    { h: 'Fum', get: (s) => dash(s.fumbleLost) },
  ],
  TE: [
    { h: 'Rec', get: (s) => n(s.reception) },
    { h: 'Rec Yd', get: (s) => n(s.receivingYards) },
    { h: 'Rec TD', get: (s) => dash(s.receivingTd) },
    { h: 'Fum', get: (s) => dash(s.fumbleLost) },
  ],
  K: [],
  DEF: [],
};

const fmt = (v: number | undefined) => Math.round(v ?? 0).toLocaleString('en-US');

/** A compact, position-appropriate aggregate stat line (fumbles appended only
 * when there were any). Fed the summed raw stats over the selected range. */
function rangeStatLineText(pos: string, s: Record<string, number>): string | null {
  const fum = n(s.fumbleLost) ? ` · ${fmt(s.fumbleLost)} FUM` : '';
  switch (pos) {
    case 'QB':
      return `${fmt(s.passingYards)} PASS YD · ${fmt(s.passingTd)} PASS TD · ${fmt(s.interception)} INT · ${fmt(s.rushingYards)} RUSH YD · ${fmt(s.rushingTd)} RUSH TD${fum}`;
    case 'RB':
      return `${fmt(s.rushingYards)} RUSH YD · ${fmt(s.rushingTd)} RUSH TD · ${fmt(s.reception)} REC · ${fmt(s.receivingYards)} REC YD · ${fmt(s.receivingTd)} REC TD${fum}`;
    case 'WR':
    case 'TE':
      return `${fmt(s.reception)} REC · ${fmt(s.receivingYards)} REC YD · ${fmt(s.receivingTd)} REC TD · ${fmt(s.rushingYards)} RUSH YD${fum}`;
    default:
      return null;
  }
}

interface Props {
  player: PlayerRow;
  /** The completed season whose weekly actuals to show (i.e. "last year"). */
  season: number;
  /** The scoring rules every week is scored under (the lobby's, or the Rankings
   * page's selected format). */
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
  // Team-colored abbreviation pill — only when the user's setting is on and we
  // have a color pair for the team (mirrors the player/pick modal header).
  const teamColors = getTeamColorsEnabled() ? getTeamColors(player.nfl_team) : null;

  // Everything is scored under the passed rules (the league's, always).
  const leaguePreset = matchPreset(scoring);
  const rules = scoring;

  const [range, setRange] = useState<[number, number]>([1, WEEKS]);

  // Points per player per week under the current rules, plus the per-week field
  // (for ranking) and the subject's raw rows (for the box-score table).
  const model = useMemo(() => {
    const byPlayer = new Map<string, Map<number, number>>();
    const byWeek = new Map<number, number[]>();
    const subjectRows = new Map<number, PlayerWeekStatRow>();
    for (const r of rows) {
      // Bye rows carry no game — keep them for the subject (so the table can
      // label the week BYE) but never score/rank them as a 0-point outing.
      if (r.is_bye) {
        if (r.player_id === player.id) subjectRows.set(r.week, r);
        continue;
      }
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
  // rank by TOTAL points among everyone who played ≥1 game in the range. Total
  // (not PPG) is the ranking basis so a full-season selection reads as the
  // player's season finish — matching the player modal's "Last yr rank". PPG is
  // still reported as a headline stat, just not the rank basis.
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
      if (t > tot) better++;
    }
    return { tot, gp, ppg, rank: gp ? better + 1 : null, of: ranked };
  }, [model, subjectPts, range]);

  // Summed raw stats over the range → the full stat line shown under the trio.
  const rangeStatLine = useMemo(() => {
    const [from, to] = range;
    const agg: Record<string, number> = {};
    let games = 0;
    for (let w = from; w <= to; w++) {
      const r = model.subjectRows.get(w);
      if (!r?.stats) continue;
      games++;
      for (const [k, v] of Object.entries(r.stats)) agg[k] = (agg[k] ?? 0) + (v ?? 0);
    }
    return games ? rangeStatLineText(player.position, agg) : null;
  }, [model, range, player.position]);

  // ── Drag-to-select the week range (shared by the chart and the table) ──
  const dragging = useRef(false);
  const anchor = useRef(1);
  const beginDrag = (w: number) => {
    dragging.current = true;
    anchor.current = w;
    // Clicking the already-sole-selected week toggles the selection off (back to
    // full season). A drag still re-anchors here, so dragging from that week
    // works — extendDrag overrides this on the first move.
    const [f, t] = range;
    setRange(f === w && t === w ? [1, WEEKS] : [w, w]);
  };
  const extendDrag = (w: number | null) => {
    if (!dragging.current || w == null) return;
    setRange([Math.min(anchor.current, w), Math.max(anchor.current, w)]);
  };
  const endDrag = () => {
    dragging.current = false;
  };

  // Chart: week from the pointer's x within the bar strip.
  const chartRef = useRef<HTMLDivElement>(null);
  const weekFromX = (clientX: number): number | null => {
    const el = chartRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const rel = (clientX - rect.left) / rect.width;
    return Math.min(WEEKS, Math.max(1, Math.floor(rel * WEEKS) + 1));
  };
  const onChartDown = (e: PointerEvent<HTMLDivElement>) => {
    const w = weekFromX(e.clientX);
    if (w == null) return;
    beginDrag(w);
    try {
      chartRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };
  const onChartMove = (e: PointerEvent<HTMLDivElement>) => extendDrag(weekFromX(e.clientX));
  const onChartUp = (e: PointerEvent<HTMLDivElement>) => {
    endDrag();
    try {
      chartRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  // Table: week from the row under the pointer. Mouse/pen only — on touch we
  // leave the gesture to the modal's own scroll (the table can overflow the
  // viewport and needs to be scrollable), and the chart already covers touch
  // range-selection.
  const tblRef = useRef<HTMLTableElement>(null);
  const weekFromPoint = (clientX: number, clientY: number): number | null => {
    const tr = document
      .elementFromPoint(clientX, clientY)
      ?.closest('tr[data-week]') as HTMLElement | null;
    if (!tr) return null;
    const w = Number(tr.dataset.week);
    return Number.isFinite(w) ? w : null;
  };
  const onTblDown = (e: PointerEvent<HTMLTableElement>) => {
    if (e.pointerType === 'touch') return;
    const w = weekFromPoint(e.clientX, e.clientY);
    if (w == null) return;
    beginDrag(w);
    try {
      tblRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };
  const onTblMove = (e: PointerEvent<HTMLTableElement>) => {
    if (!dragging.current) return;
    extendDrag(weekFromPoint(e.clientX, e.clientY));
  };
  const onTblUp = (e: PointerEvent<HTMLTableElement>) => {
    endDrag();
    try {
      tblRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  // ── Sticky, collapsing summary ──────────────────────────────────────
  // As the summary scrolls out of the body it pins flush under the header (full
  // width) and minimizes to a compact bar, so the rank/PPG/total stay visible
  // while you drag a range in the table. A zero-height sentinel above the
  // summary tells us when it's pinned.
  const bodyRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const root = bodyRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), {
      root,
      threshold: 0,
    });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasData]);

  const [from, to] = range;
  const fullSeason = from === 1 && to === WEEKS;
  // Only surface a selection when it's a genuine sub-range — highlighting all 18
  // weeks (the default) is just noise.
  const selecting = !fullSeason;
  const rangeLabel = fullSeason
    ? 'Full season'
    : from === to
      ? `Week ${from}`
      : `Weeks ${from}–${to}`;
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
              {posLabel} ·{' '}
              {teamColors ? (
                <span
                  className="pws__team"
                  style={{ background: teamColors.bg, color: teamColors.text }}
                >
                  {player.nfl_team}
                </span>
              ) : (
                player.nfl_team
              )}
              {player.bye_week ? ` · Bye ${player.bye_week}` : ''}
            </div>
          </div>
          <span className="pws__season">{season} SEASON</span>
          <button className="pws__close" aria-label="Close" onClick={requestClose}>
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <div className="pws__body" ref={bodyRef}>
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
              <div ref={sentinelRef} className="pws__sentinel" aria-hidden="true" />
              <div className={`pws__summary${stuck ? ' is-stuck' : ''}`}>
                <div className="pws__summary-head">
                  <b>{player.name}</b> ranked <b>{posLabel}{rangeStats.rank ?? '—'}</b> of{' '}
                  {rangeStats.of} over {fullSeason ? 'the full season' : rangeLabel.toLowerCase()} (
                  {rangeStats.gp} game{rangeStats.gp === 1 ? '' : 's'}).
                </div>
                <div className="pws__metrics">
                  <div className="pws__metric">
                    {/* Rank is coloured by performance (same green→red scale as
                        the chart/table), not the position hue — RB40 shouldn't
                        read as "good" green. */}
                    <div
                      className="v"
                      style={{ color: rankColor(rangeStats.rank, rangeStats.of) }}
                    >
                      {posLabel}
                      {rangeStats.rank ?? '—'}
                    </div>
                    <div className="k">Pos rank</div>
                  </div>
                  <div className="pws__metric">
                    <div className="v">
                      <DecimalNum value={rangeStats.ppg} />
                    </div>
                    <div className="k">PPG</div>
                  </div>
                  <div className="pws__metric">
                    <div className="v">
                      <DecimalNum value={rangeStats.tot} />
                    </div>
                    <div className="k">Total</div>
                  </div>
                </div>
                {rangeStatLine && <div className="pws__statline">{rangeStatLine}</div>}
                {/* Reset to the full season — a small icon in the summary's
                    top-right corner, so it stays reachable while the bar is
                    pinned. Only shown when a sub-range is active. */}
                {selecting && (
                  <button
                    type="button"
                    className="pws__reset pws__reset--corner"
                    onClick={() => setRange([1, WEEKS])}
                    aria-label="Reset to full season"
                    title="Reset to full season"
                  >
                    <RestartAltIcon sx={{ fontSize: 17 }} />
                  </button>
                )}
              </div>

              <div className="pws__chart-lab">
                <span className="t">Fantasy points by week</span>
                <span className="hint">drag across the bars to pick a range</span>
              </div>
              <div
                className="pws__chart"
                ref={chartRef}
                onPointerDown={onChartDown}
                onPointerMove={onChartMove}
                onPointerUp={onChartUp}
              >
                {Array.from({ length: WEEKS }, (_, i) => i + 1).map((w) => {
                  const pts = subjectPts?.get(w);
                  const inRange = selecting && w >= from && w <= to;
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
                <table
                  className="pws__tbl"
                  ref={tblRef}
                  onPointerDown={onTblDown}
                  onPointerMove={onTblMove}
                  onPointerUp={onTblUp}
                >
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
                      const inRange = selecting && w >= from && w <= to;
                      const isBye = pts == null;
                      const wr = weekRank(w);
                      const s = row?.stats ?? {};
                      return (
                        <tr
                          key={w}
                          data-week={w}
                          className={`${inRange ? 'inrange' : ''}${isBye ? ' bye' : ''}`}
                        >
                          <td className="wk">{w}</td>
                          <td className="opp">{row?.opp ?? '—'}</td>
                          {isBye ? (
                            <td colSpan={cols.length} className="byecell">
                              {/* A synthesized is_bye row = the team's real bye;
                                  no row at all (row undefined) = a DNP. */}
                              {row?.is_bye ? 'BYE' : 'DNP'}
                            </td>
                          ) : (
                            cols.map((c) => {
                              const v = c.get(s);
                              return (
                                <td key={c.h} className={v === '—' ? 'is-dash' : undefined}>
                                  {v}
                                </td>
                              );
                            })
                          )}
                          <td className={`pts${isBye ? ' is-dash' : ''}`}>
                            {isBye ? '—' : pts.toFixed(1)}
                          </td>
                          <td className={`rk${wr ? '' : ' is-dash'}`}>
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
                <b>{leaguePreset ? SCORING_PRESETS[leaguePreset].label : 'your league’s scoring'}</b>
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
