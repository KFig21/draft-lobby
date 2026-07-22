import { z } from 'zod';
import { rosterSlotSchema } from './positions.js';
import { DEFAULT_SCORING_RULES, scoringRulesSchema } from './scoring.js';

export const draftTypeSchema = z.enum(['SNAKE', 'STRAIGHT']);
export type DraftType = z.infer<typeof draftTypeSchema>;

export const lobbyStatusSchema = z.enum([
  'SETUP', // being configured by commissioner
  'SCHEDULED', // params locked, waiting for start time
  'DRAFTING', // draft in progress
  'PAUSED', // commissioner paused
  'COMPLETE', // draft finished
]);
export type LobbyStatus = z.infer<typeof lobbyStatusSchema>;

/** Roster composition: how many of each slot type a team must fill. */
export const rosterCompositionSchema = z.array(
  z.object({
    slot: rosterSlotSchema,
    count: z.number().int().min(0).max(20),
  }),
);
export type RosterComposition = z.infer<typeof rosterCompositionSchema>;

/** Total roster spots = number of draft rounds (one pick per spot). */
export function rosterSize(composition: RosterComposition): number {
  return composition.reduce((n, r) => n + r.count, 0);
}

/** Starting spots = everything except the bench. */
export function startingSpots(composition: RosterComposition): number {
  return composition.reduce((n, r) => (r.slot === 'BENCH' ? n : n + r.count), 0);
}

// ── Per-round pick timers ───────────────────────────────────────────
export const MIN_PICK_SECONDS = 15;
export const MAX_PICK_SECONDS = 5 * 60; // 5 minutes

/**
 * A pick-clock tier: every round up to and including `untilRound` gets
 * `seconds` on the clock. `untilRound: null` is the catch-all for the
 * remaining rounds. Tiers let leagues ramp the clock down over the draft
 * (e.g. early rounds 2:00 → mid 1:00 → late 0:30).
 */
export const pickTierSchema = z.object({
  untilRound: z.number().int().min(1).nullable(),
  seconds: z.number().int().min(MIN_PICK_SECONDS).max(MAX_PICK_SECONDS),
});
export type PickTier = z.infer<typeof pickTierSchema>;

export const pickTiersSchema = z
  .array(pickTierSchema)
  .min(1)
  .refine((tiers) => tiers.some((t) => t.untilRound === null), {
    message: 'Pick timers need a catch-all tier for the remaining rounds',
  });

/** Seconds on the clock for a given (1-indexed) round. */
export function secondsForRound(round: number, tiers: PickTier[]): number {
  const sorted = [...tiers].sort((a, b) => {
    if (a.untilRound === null) return 1;
    if (b.untilRound === null) return -1;
    return a.untilRound - b.untilRound;
  });
  for (const t of sorted) {
    if (t.untilRound === null || round <= t.untilRound) return t.seconds;
  }
  return sorted[sorted.length - 1].seconds;
}

/** The full, editable configuration for a draft lobby. */
export const lobbyVisibilitySchema = z.enum(['PRIVATE', 'OPEN']);
export type LobbyVisibility = z.infer<typeof lobbyVisibilitySchema>;

/** MOCK = practice draft (bots welcome, kept out of friends' feeds); LIVE = a real league draft. */
export const draftModeSchema = z.enum(['LIVE', 'MOCK']);
export type DraftMode = z.infer<typeof draftModeSchema>;

export const lobbySettingsSchema = z.object({
  name: z.string().min(1).max(60),
  teamCount: z.number().int().min(2).max(32),
  draftType: draftTypeSchema.default('SNAKE'),
  /** OPEN lobbies are discoverable and joinable without the password. */
  visibility: lobbyVisibilitySchema.default('PRIVATE'),
  /** MOCK drafts are for practice — empty seats fill with bots and results stay off friends' feeds. */
  draftMode: draftModeSchema.default('LIVE'),
  // Rounds are derived from the roster (one pick per spot) — not stored.
  rosterComposition: rosterCompositionSchema,
  /** Per-round pick clock. */
  pickTiers: pickTiersSchema,
  /** Number of times a team may let the clock expire before auto-picks kick in. Null = unlimited. */
  timeoutAllowance: z.number().int().min(0).nullable().default(null),
  keepersEnabled: z.boolean().default(false),
  scheduledStart: z.string().datetime().nullable().default(null),
  /** Scoring rules (drives projections / power rankings). */
  scoring: scoringRulesSchema.default(DEFAULT_SCORING_RULES),
});
export type LobbySettings = z.infer<typeof lobbySettingsSchema>;

/** Rounds in a draft = total roster spots. */
export function roundsForSettings(settings: LobbySettings): number {
  return rosterSize(settings.rosterComposition);
}

/** Default roster used when creating a new lobby (standard ESPN-style league). */
export const DEFAULT_ROSTER: RosterComposition = [
  { slot: 'QB', count: 1 },
  { slot: 'RB', count: 2 },
  { slot: 'WR', count: 2 },
  { slot: 'TE', count: 1 },
  { slot: 'FLEX', count: 1 },
  { slot: 'K', count: 1 },
  { slot: 'DEF', count: 1 },
  { slot: 'BENCH', count: 6 },
];

export const DEFAULT_PICK_TIERS: PickTier[] = [{ untilRound: null, seconds: 90 }];

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
  name: '',
  teamCount: 10,
  draftType: 'SNAKE',
  visibility: 'PRIVATE',
  draftMode: 'LIVE',
  rosterComposition: DEFAULT_ROSTER,
  pickTiers: DEFAULT_PICK_TIERS,
  timeoutAllowance: null,
  keepersEnabled: false,
  scheduledStart: null,
  scoring: DEFAULT_SCORING_RULES,
};

/** A reusable league template = a saved, named LobbySettings bundle. */
export const createTemplateSchema = z.object({
  name: z.string().min(1).max(40),
  settings: lobbySettingsSchema,
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

/** Payload for creating a lobby (settings + an optional password to gate entry). */
export const createLobbySchema = z.object({
  settings: lobbySettingsSchema,
  // Optional: OPEN lobbies don't need a password.
  password: z.string().max(100).optional(),
  // Commissioner-controlled public visibility, once the draft is COMPLETE —
  // never while a draft is live. Independent of each other; publicVotingAllowed
  // additionally requires resultsPublic (enforced by a DB check constraint).
  resultsPublic: z.boolean().default(false),
  chatPublic: z.boolean().default(false),
  publicVotingAllowed: z.boolean().default(false),
});
export type CreateLobbyInput = z.infer<typeof createLobbySchema>;

export const joinLobbySchema = z.object({
  lobbyId: z.string().uuid(),
  // Optional: OPEN lobbies don't require a password.
  password: z.string().max(100).optional(),
  teamName: z.string().min(1).max(40).optional(),
});
export type JoinLobbyInput = z.infer<typeof joinLobbySchema>;
