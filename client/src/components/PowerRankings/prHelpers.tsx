import {
  DRAFT_GRADE_COLORS,
  POSITION_COLORS,
  type Position,
  type RosterSlot,
} from '@draft-lobby/shared';
import './prHelpers.scss';

// Small UI helpers shared across the Power Rankings surfaces — the fullscreen
// board, the extracted League summary pane, and the mobile rankings flow. Kept
// framework-light (pure functions + one tiny component) so both layouts render
// from a single source rather than duplicating the colour maths / formatting.

/** "D/ST" for team defenses, otherwise the position label as-is. */
export const posLabel = (p: Position) => (p === 'DEF' ? 'D/ST' : p);

/** Colour for a starter slot — position colours for dedicated slots, distinct
 * hues for the flex/OP/IDP slots. */
export const slotColor = (slot: RosterSlot): string => {
  if (slot === 'FLEX') return '#2bb7a3'; // teal
  if (slot === 'SUPERFLEX') return '#6c5ce7'; // indigo (OP)
  if (slot === 'IDP') return '#9aa0a6';
  return POSITION_COLORS[slot as Position] ?? '#8a94a6';
};

// Vertical stride per league-comparison row (row height + gap); rows are absolutely
// positioned by index so re-sorting animates them up/down.
export const CMP_ROW_H = 28;

/** 1 → "1st", 2 → "2nd", 11 → "11th" … */
export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** The draft-grade colour scale (A → F) applied to a league rank: the best ranks
 * get the A/B greens, the worst the D/F reds. Shared by the positional analysis
 * bars and the heat map. */
const GRADE_SCALE = ['A', 'B', 'C', 'D', 'F'] as const;
export const rankGradeColor = (rank: number, count: number) => {
  const p = count > 1 ? (rank - 1) / (count - 1) : 0; // 0 best → 1 worst
  const idx = Math.min(GRADE_SCALE.length - 1, Math.floor(p * GRADE_SCALE.length));
  return DRAFT_GRADE_COLORS[GRADE_SCALE[idx]];
};

/** Diverging heat-map tint for a rank (1 = best → count = worst): green → grey
 * → red, translucent so it reads on either theme. */
export const heatColor = (rank: number, count: number) => {
  const t = count > 1 ? (rank - 1) / (count - 1) : 0;
  const base =
    t <= 0.5
      ? `color-mix(in srgb, #8a94a6 ${(t * 200).toFixed(0)}%, #3fd6a5)`
      : `color-mix(in srgb, #f8577d ${((t - 0.5) * 200).toFixed(0)}%, #8a94a6)`;
  return `color-mix(in srgb, ${base} 45%, transparent)`;
};

/** A relative "time ago" label — "now", "5m", "3h", "2d", "1w", "2mo". */
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h`;
  const d = h / 24;
  if (d < 7) return `${Math.floor(d)}d`;
  const w = d / 7;
  if (w < 5) return `${Math.floor(w)}w`;
  return `${Math.floor(d / 30)}mo`;
}

/** Projected points, Futura-italic with a smaller decimal — matches the
 * grade-export PNG cards (see gradesCanvas drawProj). */
export function ProjPoints({ value, className }: { value: number; className?: string }) {
  const [int, dec] = value.toFixed(1).split('.');
  return (
    <span className={`prb-proj${className ? ` ${className}` : ''}`}>
      {Number(int).toLocaleString('en-US')}
      <span className="prb-proj__dec">.{dec}</span>
    </span>
  );
}
