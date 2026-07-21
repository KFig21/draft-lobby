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

/** Seconds a bot / auto-draft team gets on the clock before the engine picks. */
export const AUTO_PICK_SECONDS = 5;

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
