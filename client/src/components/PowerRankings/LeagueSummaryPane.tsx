import { SLOT_LABELS, type RosterSlot } from '@draft-lobby/shared';
import BoltIcon from '@mui/icons-material/Bolt';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import ReplayIcon from '@mui/icons-material/Replay';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useState, type CSSProperties } from 'react';
import type { LeagueGrade } from '../../lib/draftGradeExport';
import { Avatar } from '../Avatar/Avatar';
import { GradeBadge } from '../GradeBadge/GradeBadge';
import { CMP_ROW_H, ProjPoints, heatColor, slotColor } from './prHelpers';
import './LeagueSummaryPane.scss';

/** DOM version of the grade-export "league cover" card — podium (2·1·3),
 * top/avg/low projections, steal + biggest reach, and a projected-points-by-team
 * bar chart (lowest → highest, each bar topped by the team's avatar). Shared by
 * the fullscreen board (centre view) and the mobile rankings (League tab). */
export function LeagueSummaryPane({
  model,
  compact = false,
}: {
  model: LeagueGrade;
  /** Narrow layouts (mobile) shorten the projection labels so they never wrap. */
  compact?: boolean;
}) {
  const podium = [model.teams[1], model.teams[0], model.teams[2]]; // 2 · 1 · 3
  // teamCards come in rank order (highest projection first); reverse for the
  // lowest→highest bar chart. Scale bars across the min→max spread (not from 0)
  // so the tight point range still reads as distinct heights.
  // Projected points as a value axis: each team sits at its projection (lowest
  // left → highest right), with the league average marked. Avatars whose values
  // cluster stack upward so they don't fully cover each other.
  const projLow = model.lowProjection;
  const projRange = Math.max(1, model.topProjection - projLow);
  const projPct = (v: number) => ((v - projLow) / projRange) * 100;
  const avgPct = projPct(model.avgProjection);
  const OVERLAP_GAP = 5.5; // % apart under which two avatars are treated as colliding
  const placedPct: number[] = [];
  const scaleDots = [...model.teams]
    .sort((a, b) => a.starterPoints - b.starterPoints)
    .map((t) => {
      const pct = projPct(t.starterPoints);
      const row = placedPct.filter((q) => Math.abs(q - pct) < OVERLAP_GAP).length;
      placedPct.push(pct);
      return { team: t.team, avatar: t.avatar, value: t.starterPoints, pct, row };
    });
  const maxScaleRow = scaleDots.reduce((m, d) => Math.max(m, d.row), 0);
  const scaleHeight = 46 + maxScaleRow * 16;
  // Worst bye week: one bar per bye week (in week order) sized by how many
  // players the hardest-hit team has out that week. Counts are small integers,
  // so height maps directly (+ a floor that fits the number inside the bar).
  const hasByes = model.byeClashes.length > 0;

  // Position strength per team (rank order): per-position starter projected-points
  // totals + league rank, plus their sum (= starter points) for the comparison
  // bars and the heat-map TOTAL column.
  const teamCount = model.teams.length;
  const compTeams = model.teams.map((t) => {
    const stats = model.slotStats.get(t.team.id);
    const cells = model.slots.map((slot) => ({
      slot,
      total: stats?.get(slot)?.total ?? 0,
      rank: stats?.get(slot)?.rank ?? teamCount,
    }));
    return {
      team: t.team,
      avatar: t.avatar,
      cells,
      rosterTotal: cells.reduce((s, c) => s + c.total, 0),
    };
  });
  const overallRank = new Map(
    compTeams.map((t) => [
      t.team.id,
      1 + compTeams.filter((o) => o.rosterTotal > t.rosterTotal).length,
    ]),
  );
  const worstRank = Math.max(...overallRank.values());
  // Per column, the worst (highest) rank present — the red-bordered cell. Rank 1
  // is always the green-bordered cell.
  const worstBySlot = new Map(
    model.slots.map((slot) => [
      slot,
      Math.max(1, ...compTeams.map((t) => t.cells.find((c) => c.slot === slot)?.rank ?? 1)),
    ]),
  );
  const cellFlag = (rank: number, worst: number) =>
    teamCount < 2 ? '' : rank === 1 ? ' is-best' : rank === worst ? ' is-worst' : '';
  const hasSlots = model.slots.length > 0 && teamCount > 0;

  // League comparison filter: click slots to keep only those segments and re-sort
  // the teams by that combined total; the rows animate to their new positions. No
  // selection = every slot, power-rank order.
  const [slotFilter, setSlotFilter] = useState<Set<RosterSlot>>(new Set());
  const toggleSlot = (s: RosterSlot) =>
    setSlotFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  const activeSlots = slotFilter.size
    ? model.slots.filter((s) => slotFilter.has(s))
    : model.slots;
  const cmpRows = compTeams.map((t) => ({
    ...t,
    activeTotal: t.cells
      .filter((c) => slotFilter.size === 0 || slotFilter.has(c.slot))
      .reduce((s, c) => s + c.total, 0),
  }));
  const maxActive = Math.max(1, ...cmpRows.map((r) => r.activeTotal));
  const cmpOrder = new Map(
    [...cmpRows].sort((a, b) => b.activeTotal - a.activeTotal).map((r, i) => [r.team.id, i]),
  );

  // Number shrinks top → avg → low, mirroring the downloadable recap (1 / .88 / .78).
  const proj = (label: string, value: number, color: string, scale: number, name?: string) => (
    <div className="prb-sum__projbox">
      <span className="prb-sum__projlab">{label}</span>
      <span
        className="prb-sum__projval"
        style={{ ['--c']: color, ['--s']: scale } as CSSProperties}
      >
        <ProjPoints value={value} />
      </span>
      {name && <span className="prb-sum__projsub">{name}</span>}
    </div>
  );
  return (
    <div className="prb-sum">
      <div className="prb-sum__head">
        <div className="prb-sum__eyebrow">{model.season} SEASON</div>
        <h2 className="prb-sum__name">{model.lobbyName}</h2>
        <div className="prb-sum__meta">
          {model.teamCount} teams · {model.scoringLabel} · {model.draftTypeLabel} · {model.rounds}{' '}
          rounds
        </div>
      </div>

      <div className="prb-sum__podium">
        {podium.map((card, i) =>
          card ? (
            <div key={card.team.id} className={`prb-sum__pod${i === 1 ? ' is-champ' : ''}`}>
              {i === 1 && <EmojiEventsIcon className="prb-sum__crown" />}
              <Avatar avatar={card.avatar} size={i === 1 ? 76 : 60} />
              <div className="prb-sum__pod-name">{card.team.name}</div>
              <div className="prb-sum__pod-owner">{card.ownerLabel}</div>
              <GradeBadge grade={card.grade} size={26} />
              <div className="prb-sum__pod-rank">#{card.rank}</div>
            </div>
          ) : null,
        )}
      </div>

      <div className="prb-sum__proj">
        {proj(compact ? 'TOP PROJ' : 'TOP PROJECTION', model.topProjection, '#3fd6a5', 1, model.topProjName)}
        {proj(compact ? 'AVG PROJ' : 'AVG PROJECTION', model.avgProjection, '#f6a642', 0.88)}
        {proj(compact ? 'LOW PROJ' : 'LOW PROJECTION', model.lowProjection, '#f8577d', 0.78, model.lowProjName)}
      </div>

      {(model.leagueSteal || model.leagueReach) && (
        <div className="prb-sum__callouts">
          {model.leagueSteal && (
            <div className="prb-sum__callout prb-sum__callout--steal">
              <div className="prb-sum__callout-lab">
                <BoltIcon fontSize="inherit" /> STEAL OF THE DRAFT
              </div>
              <div className="prb-sum__callout-main">
                {model.leagueSteal.player.name} · {model.leagueSteal.player.position}
              </div>
              <div className="prb-sum__callout-sub">
                R{model.leagueSteal.round} to {model.leagueSteal.team.name} — +
                {Math.max(0, model.leagueSteal.valueRounds)} rds of value
              </div>
            </div>
          )}
          {model.leagueReach && (
            <div className="prb-sum__callout prb-sum__callout--reach">
              <div className="prb-sum__callout-lab">
                <TrendingUpIcon fontSize="inherit" /> BIGGEST REACH
              </div>
              <div className="prb-sum__callout-main">
                {model.leagueReach.player.name} · {model.leagueReach.player.position}
              </div>
              <div className="prb-sum__callout-sub">
                R{model.leagueReach.round} by {model.leagueReach.team.name} —{' '}
                {Math.abs(Math.min(0, model.leagueReach.valueRounds))} rds early
              </div>
            </div>
          )}
        </div>
      )}

      {hasByes && (
        <div className="prb-sum__byes">
          <div className="prb-sum__dist-lab prb-sum__dist-lab--bye">WORST BYE WEEKS</div>
          <div className="prb-sum__byebars">
            {model.byeClashes.map((b) => (
              <div
                key={b.week}
                className="prb-sum__byecol"
                title={b.teams.map((t) => t.team.name).join(', ')}
              >
                <div className="prb-sum__byeavs">
                  {b.teams.map((t) => (
                    <span key={t.team.id} className="prb-sum__byeav">
                      <Avatar avatar={t.avatar} size={22} />
                    </span>
                  ))}
                </div>
                <span className="prb-sum__byebar" style={{ height: `${10 + b.count * 15}px` }}>
                  <span className="prb-sum__byen">{b.count}</span>
                </span>
                <span className="prb-sum__byewk">Wk {b.week}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="prb-sum__dist">
        <div className="prb-sum__dist-lab">PROJECTED POINTS BY TEAM</div>
        <div className="prb-sum__scale" style={{ height: `${scaleHeight}px` }}>
          <div className="prb-sum__scale-track" />
          <div className="prb-sum__scale-avg" style={{ left: `${avgPct}%` }}>
            <span className="prb-sum__scale-avg-lab">AVG</span>
          </div>
          {scaleDots.map((d) => (
            <div
              key={d.team.id}
              className="prb-sum__scale-dot"
              style={{ left: `${d.pct}%`, bottom: `${12 + d.row * 16}px` }}
              title={`${d.team.name} · ${d.value.toFixed(1)}`}
            >
              <Avatar avatar={d.avatar} size={22} />
            </div>
          ))}
        </div>
      </div>

      {hasSlots && (
        <div className="prb-sum__cmp">
          <div className="prb-sum__dist-lab">LEAGUE COMPARISON</div>
          <div className="prb-sum__cmp-legend">
            {model.slots.map((slot) => (
              <button
                key={slot}
                type="button"
                className={`prb-sum__cmp-key${slotFilter.has(slot) ? ' is-on' : ''}`}
                style={{ ['--pos']: slotColor(slot) } as CSSProperties}
                onClick={() => toggleSlot(slot)}
                aria-pressed={slotFilter.has(slot)}
              >
                <span className="prb-sum__cmp-dot" style={{ background: slotColor(slot) }} />
                {SLOT_LABELS[slot]}
              </button>
            ))}
            {slotFilter.size > 0 && (
              <button
                type="button"
                className="prb-sum__cmp-reset"
                onClick={() => setSlotFilter(new Set())}
              >
                <ReplayIcon fontSize="inherit" /> Reset
              </button>
            )}
          </div>
          <div className="prb-sum__cmp-rows" style={{ height: `${cmpRows.length * CMP_ROW_H}px` }}>
            {cmpRows.map((t) => (
              <div
                key={t.team.id}
                className="prb-sum__cmp-row"
                style={{ transform: `translateY(${(cmpOrder.get(t.team.id) ?? 0) * CMP_ROW_H}px)` }}
              >
                <span className="prb-sum__cmp-team" title={t.team.name}>
                  <Avatar avatar={t.avatar} size={18} />
                  <span className="prb-sum__cmp-name">{t.team.name}</span>
                </span>
                <span className="prb-sum__cmp-bar">
                  {activeSlots.map((slot) => {
                    const total = t.cells.find((c) => c.slot === slot)?.total ?? 0;
                    return total > 0 ? (
                      <span
                        key={slot}
                        className="prb-sum__cmp-seg"
                        style={{
                          width: `${(total / maxActive) * 100}%`,
                          background: slotColor(slot),
                        }}
                        title={`${SLOT_LABELS[slot]} · ${total.toFixed(1)}`}
                      />
                    ) : null;
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasSlots && (
        <div className="prb-sum__heat">
          <div className="prb-sum__dist-lab">LEAGUE HEAT MAP</div>
          <div className="prb-sum__heat-scroll">
            <table className="prb-sum__heat-table">
              <thead>
                <tr>
                  <th className="prb-sum__heat-th prb-sum__heat-th--team">Team</th>
                  {model.slots.map((slot) => (
                    <th key={slot} className="prb-sum__heat-th">
                      {SLOT_LABELS[slot]}
                    </th>
                  ))}
                  <th className="prb-sum__heat-gap" aria-hidden="true" />
                  <th className="prb-sum__heat-th prb-sum__heat-th--total">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {compTeams.map((t) => {
                  const totRank = overallRank.get(t.team.id) ?? teamCount;
                  return (
                    <tr key={t.team.id}>
                      <td className="prb-sum__heat-team" title={t.team.name}>
                        <span className="prb-sum__heat-teamin">
                          <Avatar avatar={t.avatar} size={16} />
                          <span className="prb-sum__heat-name">{t.team.name}</span>
                        </span>
                      </td>
                      {t.cells.map((c) => (
                        <td
                          key={c.slot}
                          className={`prb-sum__heat-cell${cellFlag(c.rank, worstBySlot.get(c.slot) ?? teamCount)}`}
                          style={{ background: heatColor(c.rank, teamCount) }}
                        >
                          <b>{c.rank}</b>
                          <small>{c.total.toFixed(1)}</small>
                        </td>
                      ))}
                      <td className="prb-sum__heat-gap" aria-hidden="true" />
                      <td
                        className={`prb-sum__heat-cell prb-sum__heat-cell--total${cellFlag(totRank, worstRank)}`}
                        style={{ background: heatColor(totRank, teamCount) }}
                      >
                        <b>{totRank}</b>
                        <small>{t.rosterTotal.toFixed(0)}</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
