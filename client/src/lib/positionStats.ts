import type { Position } from '@draft-lobby/shared';

/** A position stat column: a header label + the raw scoring-catalog stat key it
 * reads off proj_stats / prev_stats. */
export interface StatCol {
  key: string;
  label: string;
}

/**
 * Per-position stat columns shown — and made sortable — when a player list is
 * filtered to a single position. Shared by the Rankings page and the draft
 * board's player pool. Positions without an entry (K, DEF, and any
 * multi-position view) fall back to a generic stat line.
 */
export const POS_STAT_COLS: Partial<Record<Position, StatCol[]>> = {
  QB: [
    { key: 'passingYards', label: 'Pass Yd' },
    { key: 'passingTd', label: 'Pass TD' },
    { key: 'interception', label: 'INT' },
    { key: 'rushingYards', label: 'Rush Yd' },
    { key: 'rushingTd', label: 'Rush TD' },
  ],
  RB: [
    { key: 'rushingYards', label: 'Rush Yd' },
    { key: 'rushingTd', label: 'Rush TD' },
    { key: 'reception', label: 'Rec' },
    { key: 'receivingYards', label: 'Rec Yd' },
    { key: 'receivingTd', label: 'Rec TD' },
  ],
  WR: [
    { key: 'reception', label: 'Rec' },
    { key: 'receivingYards', label: 'Rec Yd' },
    { key: 'receivingTd', label: 'Rec TD' },
    { key: 'rushingYards', label: 'Rush Yd' },
    { key: 'rushingTd', label: 'Rush TD' },
  ],
  TE: [
    { key: 'reception', label: 'Rec' },
    { key: 'receivingYards', label: 'Rec Yd' },
    { key: 'receivingTd', label: 'Rec TD' },
  ],
};

/** The fixed (non-stat) sort keys, used to tell a stat-column sort apart. */
export const BASE_SORT_KEYS = new Set(['points', 'name', 'adp']);

/** A stat value for a position column — rounded, thousands-separated, em dash
 * when the stat is missing or rounds to zero (a "—" reads cleaner than a wall
 * of 0s across the empty stat cells). */
export const fmtStat = (v: number | undefined): string =>
  v == null || Math.round(v) === 0 ? '—' : Math.round(v).toLocaleString('en-US');
