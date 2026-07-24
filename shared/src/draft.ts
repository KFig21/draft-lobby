import { z } from 'zod';

/** A member's role within a lobby. */
export const lobbyRoleSchema = z.enum([
  'COMMISSIONER',
  'SUB_COMMISSIONER',
  'MEMBER',
]);
export type LobbyRole = z.infer<typeof lobbyRoleSchema>;

/** A team slot within a lobby (may or may not have a human owner assigned). */
export const teamSchema = z.object({
  id: z.string().uuid(),
  lobbyId: z.string().uuid(),
  ownerId: z.string().uuid().nullable(),
  name: z.string().min(1).max(40),
  draftPosition: z.number().int().min(1), // 1-indexed slot in the draft order
  color: z.string().default('#4aa8ff'),
  isPrevChampion: z.boolean().default(false),
});
export type Team = z.infer<typeof teamSchema>;

/** A single completed pick in a draft. */
export const pickSchema = z.object({
  id: z.string().uuid(),
  lobbyId: z.string().uuid(),
  overall: z.number().int().min(1), // 1-indexed overall pick number
  round: z.number().int().min(1),
  teamId: z.string().uuid(),
  playerId: z.string().uuid(),
  isKeeper: z.boolean().default(false),
  isAutoPick: z.boolean().default(false),
  pickedAt: z.string().datetime(),
});
export type Pick = z.infer<typeof pickSchema>;

/** Request to make a pick (the player + the team it's for; server derives overall/round). */
export const makePickSchema = z.object({
  lobbyId: z.string().uuid(),
  playerId: z.string().uuid(),
  /** Set only when a commissioner picks on behalf of another team. */
  onBehalfOfTeamId: z.string().uuid().optional(),
});
export type MakePickInput = z.infer<typeof makePickSchema>;

/** Commissioner rolls the draft back to (and including) a specific pick —
 * deletes it and every pick after it, putting that slot back on the clock. */
export const rollbackToSchema = z.object({
  overall: z.number().int().min(1),
});
export type RollbackToInput = z.infer<typeof rollbackToSchema>;

export const renameTeamSchema = z.object({
  /** Omit to rename your own team; a commissioner may target any team. */
  teamId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(40),
});
export type RenameTeamInput = z.infer<typeof renameTeamSchema>;

/**
 * Commissioner sets the draft order. `slots` is positional: index 0 = pick 1,
 * index N-1 = pick N. Each entry is a team id, or null for an open (unassigned)
 * slot — so the commissioner can seat themselves at any pick and leave the rest
 * open for players to trickle in.
 */
export const setDraftOrderSchema = z.object({
  slots: z.array(z.string().uuid().nullable()).min(1),
});
export type SetDraftOrderInput = z.infer<typeof setDraftOrderSchema>;

/** Toggle auto-draft for a team (owner for their own team; commissioner for any). */
export const setAutoDraftSchema = z.object({
  teamId: z.string().uuid(),
  on: z.boolean(),
});
export type SetAutoDraftInput = z.infer<typeof setAutoDraftSchema>;

/**
 * Commissioner assigns a keeper: `playerId` is kept by `teamId`, costing that
 * team its pick in `round`. Placed as an is_keeper pick before the draft starts.
 */
export const assignKeeperSchema = z.object({
  teamId: z.string().uuid(),
  playerId: z.string().uuid(),
  round: z.number().int().min(1),
});
export type AssignKeeperInput = z.infer<typeof assignKeeperSchema>;

/**
 * Bulk keeper assignment from an imported roster. The client resolves the raw
 * team/player names (and rounds) against the lobby's teams and the player pool
 * before sending, so the server just validates + places each resolved row.
 */
export const bulkAssignKeepersSchema = z.object({
  keepers: z
    .array(
      z.object({
        teamId: z.string().uuid(),
        playerId: z.string().uuid(),
        round: z.number().int().min(1),
      }),
    )
    .min(1)
    .max(500),
});
export type BulkAssignKeepersInput = z.infer<typeof bulkAssignKeepersSchema>;

/**
 * Owner-choice keepers: the commissioner offers each team a pool of candidate
 * players (from last year's roster). The client resolves names to ids first.
 */
export const offerKeeperOptionsSchema = z.object({
  options: z
    .array(
      z.object({
        teamId: z.string().uuid(),
        playerId: z.string().uuid(),
        round: z.number().int().min(1),
      }),
    )
    .min(1)
    .max(1000),
});
export type OfferKeeperOptionsInput = z.infer<typeof offerKeeperOptionsSchema>;

/** An owner (or commissioner) toggles whether a candidate is kept. */
export const selectKeeperOptionSchema = z.object({ selected: z.boolean() });
export type SelectKeeperOptionInput = z.infer<typeof selectKeeperOptionSchema>;

/** Commissioner sets how many keepers a team may pick. */
export const setKeeperCountSchema = z.object({
  teamId: z.string().uuid(),
  count: z.number().int().min(0).max(20),
});
export type SetKeeperCountInput = z.infer<typeof setKeeperCountSchema>;

/** Seconds a bot / auto-draft team gets on the clock before the engine picks. */
export const AUTO_PICK_SECONDS = 5;

/** Pool for the commissioner's "randomize bot names" action — plain "Bot N"
 * placeholders swapped for something with a little personality. */
export const RANDOM_BOT_TEAM_NAMES = [
  'Gridiron Gurus', 'Blitz Krewe', 'End Zone Elites', 'Fumble Bunch', 'Hail Mary Heroes',
  'Pigskin Pirates', 'Turf Titans', 'Red Zone Raiders', 'Sideline Savages', 'Fourth Down Fanatics',
  'Broken Tackles', 'Waiver Wire Warriors', 'Pocket Passers', 'Blocked Punts', 'Two Point Takers',
  'Screen Pass Squad', 'Audible Assassins', 'Chain Gang', 'Onside Kickers', 'Play Action Posse',
  'Goal Line Grinders', 'Deep Threats', 'Trick Play Troupe', 'Backfield Bandits', 'Snap Count Squad',
  'Bootleg Brigade', 'Cover Two Crew', 'Flea Flicker Fanclub', 'Punt Return Party', 'Draft Day Dynasty',
];

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  lobbyId: z.string().uuid(),
  userId: z.string().uuid(),
  body: z.string().min(1).max(1000),
  createdAt: z.string().datetime(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const sendChatSchema = z.object({
  lobbyId: z.string().uuid(),
  body: z.string().min(1).max(1000),
});
export type SendChatInput = z.infer<typeof sendChatSchema>;

/**
 * Compute the team draft-position that is on the clock for a given overall pick.
 * Positions are 1-indexed. Snake reverses direction every round.
 */
export function draftPositionForOverall(
  overall: number,
  teamCount: number,
  draftType: 'SNAKE' | 'STRAIGHT',
): number {
  const round = Math.floor((overall - 1) / teamCount); // 0-indexed
  const indexInRound = (overall - 1) % teamCount; // 0-indexed
  if (draftType === 'STRAIGHT' || round % 2 === 0) {
    return indexInRound + 1;
  }
  return teamCount - indexInRound; // reversed round for snake
}

/**
 * Inverse of draftPositionForOverall: the overall pick number at which a given
 * (1-indexed) draft position picks in a given (1-indexed) round. Used to place
 * keepers, which cost a team its pick in a specific round.
 */
export function overallForDraftPosition(
  round: number,
  draftPosition: number,
  teamCount: number,
  draftType: 'SNAKE' | 'STRAIGHT',
): number {
  const roundIndex = round - 1; // 0-indexed
  const indexInRound =
    draftType === 'STRAIGHT' || roundIndex % 2 === 0
      ? draftPosition - 1
      : teamCount - draftPosition; // reversed round for snake
  return roundIndex * teamCount + indexInRound + 1;
}
