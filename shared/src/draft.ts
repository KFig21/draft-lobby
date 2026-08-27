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
  /** Times this team's pick clock has expired (been skipped) — capped by the
   * lobby's `timeoutAllowance`. See skip-on-timeout feature. */
  timeouts: z.number().int().min(0).default(0),
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
  /**
   * Which specific open slot (overall) to fill. A team that was skipped and is
   * up again owns more than one open slot (e.g. the snake turn: the round it was
   * skipped in, plus its next round now on the clock) — this lets the picker
   * choose which one this player goes into. Omit to fill the team's EARLIEST
   * open slot (the default, and the only option when a team owns a single slot).
   */
  overall: z.number().int().min(1).optional(),
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

/** Replace a team's personal draft queue (ordered player ids, top first). */
export const setQueueSchema = z.object({
  teamId: z.string().uuid(),
  playerIds: z.array(z.string()).max(300),
});
export type SetQueueInput = z.infer<typeof setQueueSchema>;

/** Toggle "auto-draft from queue" for a team. */
export const setQueueAutopickSchema = z.object({
  teamId: z.string().uuid(),
  on: z.boolean(),
});
export type SetQueueAutopickInput = z.infer<typeof setQueueAutopickSchema>;

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

/** Commissioner edits a candidate's round and/or which player it refers to. */
export const updateKeeperOptionSchema = z.object({
  round: z.number().int().min(1).optional(),
  playerId: z.string().uuid().optional(),
});
export type UpdateKeeperOptionInput = z.infer<typeof updateKeeperOptionSchema>;

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

/** An open, pickable slot: its overall and the 1-indexed draft position (and
 * therefore team) it belongs to. */
export interface OpenSlot {
  overall: number;
  position: number;
}

/**
 * Every open (unfilled) slot at or before the clock frontier — the full set of
 * slots that can be picked into right now. A slot BELOW the frontier that's
 * still open means its team was skipped and can still catch up; the frontier
 * slot itself is the one live/timed pick. Slots past the frontier are never
 * open in this sense (teams only ever fill their own slots, all of which are
 * <= the frontier), so callers pass the frontier clamped to the last slot.
 *
 * `takenOveralls` is every overall that already has a pick (keepers included).
 * The frontier is NOT distinguished here — a caller that needs to separate the
 * timed slot from skipped ones compares `overall === frontier` itself. Pure and
 * shared by the engine (whose turn resolution) and the client (board state).
 */
export function openSlots(
  takenOveralls: Iterable<number>,
  frontier: number,
  teamCount: number,
  draftType: 'SNAKE' | 'STRAIGHT',
): OpenSlot[] {
  const taken = takenOveralls instanceof Set ? takenOveralls : new Set(takenOveralls);
  const out: OpenSlot[] = [];
  for (let overall = 1; overall <= frontier; overall++) {
    if (taken.has(overall)) continue;
    out.push({ overall, position: draftPositionForOverall(overall, teamCount, draftType) });
  }
  return out;
}
