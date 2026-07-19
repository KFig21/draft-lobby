import { z } from 'zod';

/** Fantasy-relevant player positions. */
export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
export const positionSchema = z.enum(POSITIONS);
export type Position = z.infer<typeof positionSchema>;

/** Roster slot types, including flex variants that accept multiple positions. */
export const ROSTER_SLOTS = [
  'QB',
  'RB',
  'WR',
  'TE',
  'FLEX', // RB/WR/TE
  'SUPERFLEX', // QB/RB/WR/TE
  'K',
  'DEF', // D/ST
  'IDP', // individual defensive player (DL/LB/DB)
  'BENCH',
] as const;
export const rosterSlotSchema = z.enum(ROSTER_SLOTS);
export type RosterSlot = z.infer<typeof rosterSlotSchema>;

/** Which positions each roster slot will accept during a draft. */
export const SLOT_ELIGIBILITY: Record<RosterSlot, readonly Position[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  SUPERFLEX: ['QB', 'RB', 'WR', 'TE'],
  K: ['K'],
  DEF: ['DEF'],
  IDP: [], // IDP player positions aren't in the offense-only pool yet
  BENCH: POSITIONS,
};

/** Display labels for roster slots. */
export const SLOT_LABELS: Record<RosterSlot, string> = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  FLEX: 'FLEX',
  SUPERFLEX: 'SUPERFLEX',
  K: 'K',
  DEF: 'D/ST',
  IDP: 'IDP',
  BENCH: 'Bench',
};

/** Short help text for flex-type slots. */
export const SLOT_HINTS: Partial<Record<RosterSlot, string>> = {
  FLEX: 'RB/WR/TE',
  SUPERFLEX: 'QB/RB/WR/TE',
  IDP: 'DL/LB/DB',
};

/** Per-slot ceiling so counts stay sane (mirrors the zod bounds). */
export const SLOT_MAX: Record<RosterSlot, number> = {
  QB: 5,
  RB: 10,
  WR: 10,
  TE: 5,
  FLEX: 5,
  SUPERFLEX: 3,
  K: 3,
  DEF: 3,
  IDP: 10,
  BENCH: 20,
};

/** Consistent color coding for positions, used across the UI. */
export const POSITION_COLORS: Record<Position, string> = {
  QB: '#f8577d',
  RB: '#3fd6a5',
  WR: '#4aa8ff',
  TE: '#f6a642',
  K: '#b98bff',
  DEF: '#8a94a6',
};
