import { z } from 'zod';
import { positionSchema } from './positions.js';

export const injuryStatusSchema = z.enum([
  'ACTIVE',
  'QUESTIONABLE',
  'DOUBTFUL',
  'OUT',
  'IR',
  'SUSPENDED',
]);
export type InjuryStatus = z.infer<typeof injuryStatusSchema>;

/** A draftable player and the data shown on their player card. */
export const playerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  position: positionSchema,
  nflTeam: z.string(), // e.g. "MIN", or "FA" for free agent
  byeWeek: z.number().int().min(0).max(18).nullable(),
  injuryStatus: injuryStatusSchema.default('ACTIVE'),
  // Current-season projections
  projPoints: z.number().nullable(),
  adp: z.number().nullable(), // average draft position
  // Prior-season results
  prevPoints: z.number().nullable(),
  prevRank: z.number().int().nullable(),
});
export type Player = z.infer<typeof playerSchema>;
