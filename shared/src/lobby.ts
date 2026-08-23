import { z } from 'zod';
import {
  POSITIONS,
  SLOT_ELIGIBILITY,
  SLOT_MAX,
  positionSchema,
  rosterSlotSchema,
  type Position,
} from './positions.js';
import { DEFAULT_SCORING_RULES, scoringRulesSchema } from './scoring.js';
import { CHAT_LOCK_MS, MAX_CHAT_LOCK_MS } from './social.js';

export const draftTypeSchema = z.enum(['SNAKE', 'STRAIGHT']);
export type DraftType = z.infer<typeof draftTypeSchema>;

export const lobbyStatusSchema = z.enum([
  'SETUP', // being configured by commissioner
  'SCHEDULED', // params locked, waiting for start time
  'STAGING', // draft room open pre-draft: seats + keepers, no clock yet
  'DRAFTING', // draft in progress
  'PAUSED', // commissioner paused
  'COMPLETE', // draft finished
]);
export type LobbyStatus = z.infer<typeof lobbyStatusSchema>;

// ── Size caps ───────────────────────────────────────────────────────
// Kept deliberately generous (deeper than any standard league) while still
// bounding what the draft board, projections, and power-ranking screens have
// to render — and stopping a crafted request from configuring something that
// visibly breaks them. Per-slot caps live in SLOT_MAX (positions.ts).
export const MIN_TEAMS = 2;
export const MAX_TEAMS = 16; // 32 broke the board width + every team×slot grid
export const MAX_ROSTER_SIZE = 30; // total spots = draft rounds
export const MAX_STARTING_SPOTS = 16; // non-bench spots

/** Roster composition: how many of each slot type a team must fill. Per-slot
 * counts are capped by SLOT_MAX; the whole roster by the aggregate caps above.
 * Enforced here (not just in the wizard UI) so a direct API call can't slip an
 * abusive roster past the client. */
export const rosterCompositionSchema = z
  .array(
    z.object({
      slot: rosterSlotSchema,
      count: z.number().int().min(0),
    }),
  )
  .superRefine((comp, ctx) => {
    for (const { slot, count } of comp) {
      if (count > SLOT_MAX[slot]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `At most ${SLOT_MAX[slot]} ${slot} spot(s) allowed`,
        });
      }
    }
    const total = comp.reduce((n, r) => n + r.count, 0);
    const starters = comp.reduce((n, r) => (r.slot === 'BENCH' ? n : n + r.count), 0);
    if (starters < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A roster needs at least one starting spot' });
    }
    if (starters > MAX_STARTING_SPOTS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `At most ${MAX_STARTING_SPOTS} starting spots allowed`,
      });
    }
    if (total > MAX_ROSTER_SIZE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `A roster can be at most ${MAX_ROSTER_SIZE} rounds`,
      });
    }
  });
export type RosterComposition = z.infer<typeof rosterCompositionSchema>;

/** Total roster spots = number of draft rounds (one pick per spot). */
export function rosterSize(composition: RosterComposition): number {
  return composition.reduce((n, r) => n + r.count, 0);
}

/** Starting spots = everything except the bench. */
export function startingSpots(composition: RosterComposition): number {
  return composition.reduce((n, r) => (r.slot === 'BENCH' ? n : n + r.count), 0);
}

/**
 * Which positions this league's roster can actually hold — position filter
 * UI (player pool, keeper pickers) should only offer these, not the full
 * POSITIONS list unconditionally. BENCH is deliberately excluded from the
 * check even though it's technically eligible for every position (see
 * SLOT_ELIGIBILITY) — a league that dropped K/DEF from its roster on purpose
 * (a common "no kicker/no defense" customization) shouldn't have them show
 * back up just because bench slots exist.
 */
export function draftablePositions(composition: RosterComposition): Set<Position> {
  const positions = new Set<Position>();
  for (const { slot, count } of composition) {
    if (slot === 'BENCH' || count <= 0) continue;
    for (const pos of SLOT_ELIGIBILITY[slot]) positions.add(pos);
  }
  return positions;
}

// ── Per-position roster limits ──────────────────────────────────────
/**
 * A single position's roster bounds: `min` players a team must end up with
 * (0 = no floor) and `max` it may hold (`null` = "No max"). Enforced hard at
 * pick time — see pickAllowedForLimits.
 */
export const positionLimitSchema = z.object({
  min: z.number().int().min(0),
  max: z.number().int().min(0).nullable(),
});
export type PositionLimit = z.infer<typeof positionLimitSchema>;

/**
 * Per-position min/max map. A missing position (or the whole map missing on an
 * older lobby's stored settings) means "no limits" — always read through
 * positionLimitFor, never the raw field, so that default is applied uniformly.
 */
export const positionLimitsSchema = z.record(positionSchema, positionLimitSchema);
export type PositionLimits = Partial<Record<Position, PositionLimit>>;

/** A position's effective bounds, defaulting an unset position to no limits. */
export function positionLimitFor(
  limits: PositionLimits | undefined,
  pos: Position,
): PositionLimit {
  const l = limits?.[pos];
  return { min: l?.min ?? 0, max: l?.max ?? null };
}

/** Whether any position carries a real (non-default) limit — drives whether the
 * rules screen shows a "Position limits" section and whether enforcement runs. */
export function hasAnyPositionLimit(limits: PositionLimits | undefined): boolean {
  if (!limits) return false;
  return POSITIONS.some((pos) => {
    const { min, max } = positionLimitFor(limits, pos);
    return min > 0 || max != null;
  });
}

/**
 * Whether a team may draft a player of position `pos` given its current roster
 * (`have` counts by position, keepers included), how many roster spots it has
 * left (`remainingSpots`), and the league's limits.
 *
 * Two independent bounds (see the plan's derivation):
 *   max — never hold more than `max[pos]`.
 *   min — a "reserved" floor: drafting a still-needed position is always fine;
 *         drafting an already-satisfied one is only allowed while there's a
 *         spare spot beyond every outstanding minimum, so the last spots get
 *         held back for unmet floors.
 *
 * The one predicate the client (to disable buttons), the /pick route (to
 * reject), and the bot chooser (to filter) all share.
 */
export function pickAllowedForLimits(
  limits: PositionLimits | undefined,
  have: Record<Position, number>,
  remainingSpots: number,
  pos: Position,
): { ok: boolean; reason?: 'max' | 'min' } {
  const { max } = positionLimitFor(limits, pos);
  if (max != null && have[pos] >= max) return { ok: false, reason: 'max' };

  let totalDeficit = 0;
  for (const p of POSITIONS) {
    const { min } = positionLimitFor(limits, p);
    totalDeficit += Math.max(0, min - have[p]);
  }
  const myDeficit = Math.max(0, positionLimitFor(limits, pos).min - have[pos]);
  // Needed position → always ok; otherwise only if a spot is free beyond the
  // outstanding minimums (the "< remainingSpots" leaves room for this pick too).
  if (myDeficit > 0 || totalDeficit < remainingSpots) return { ok: true };
  return { ok: false, reason: 'min' };
}

// ── Per-round pick timers ───────────────────────────────────────────
export const MIN_PICK_SECONDS = 15;
export const MAX_PICK_SECONDS = 5 * 60; // 5 minutes

/**
 * Sentinel `seconds` value meaning "no clock" — humans on such a round are
 * never timed out (the draft waits for their pick), so a mock can proceed at
 * its own pace. Bots still pick on their own short clock. Zero rather than
 * null keeps `seconds` a plain number everywhere; guard with isUnlimitedPick.
 */
export const UNLIMITED_PICK_SECONDS = 0;
export function isUnlimitedPick(seconds: number): boolean {
  return seconds === UNLIMITED_PICK_SECONDS;
}

/**
 * Sentinel `botPickSeconds` value meaning "bots get the same clock a human
 * would that round" (secondsForRound), instead of a fixed short bot clock.
 * Handy when the bot seats are really stand-ins for absent people the
 * commissioner is drafting for — they deserve the full round clock. Negative
 * so it can't collide with a real duration or the unlimited (0) sentinel;
 * guard with isMatchRoundBot.
 */
export const MATCH_ROUND_PICK_SECONDS = -1;
export function isMatchRoundBot(seconds: number): boolean {
  return seconds === MATCH_ROUND_PICK_SECONDS;
}

/** Default bot pick clock (seconds) when a lobby hasn't set one. */
export const DEFAULT_BOT_PICK_SECONDS = 5;

/**
 * Buffer between picks (seconds): after a pick is made or a team is skipped, the
 * next team's clock is frozen at full for this long before it starts ticking —
 * a breather that also lets the pick-reveal animation play without eating the
 * next picker's time. Picking is never blocked during it (the clock is just
 * frozen), so a skipped team and the on-clock team can both pick right away.
 * 0 disables it. The default matches the ~5s pick-reveal animation.
 */
export const DEFAULT_PICK_BUFFER_SECONDS = 5;
export const MAX_PICK_BUFFER_SECONDS = 15;

/**
 * A pick-clock tier: every round up to and including `untilRound` gets
 * `seconds` on the clock. `untilRound: null` is the catch-all for the
 * remaining rounds. Tiers let leagues ramp the clock down over the draft
 * (e.g. early rounds 2:00 → mid 1:00 → late 0:30). `seconds` is either in
 * [MIN, MAX] or UNLIMITED_PICK_SECONDS (no clock).
 */
export const pickTierSchema = z.object({
  untilRound: z.number().int().min(1).nullable(),
  seconds: z.number().int().refine(
    (s) => s === UNLIMITED_PICK_SECONDS || (s >= MIN_PICK_SECONDS && s <= MAX_PICK_SECONDS),
    { message: `Pick clock must be ${MIN_PICK_SECONDS}–${MAX_PICK_SECONDS}s, or no limit` },
  ),
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
  teamCount: z.number().int().min(MIN_TEAMS).max(MAX_TEAMS),
  draftType: draftTypeSchema.default('SNAKE'),
  /** OPEN lobbies are discoverable and joinable without the password. */
  visibility: lobbyVisibilitySchema.default('PRIVATE'),
  /** MOCK drafts are for practice — empty seats fill with bots and results stay off friends' feeds. */
  draftMode: draftModeSchema.default('LIVE'),
  // Rounds are derived from the roster (one pick per spot) — not stored.
  rosterComposition: rosterCompositionSchema,
  /** Per-position roster floors/ceilings. Omitted positions = no limits;
   * defaults to no limits at all, so existing leagues are unaffected. */
  positionLimits: positionLimitsSchema.default(() => ({})),
  /** Per-round pick clock. */
  pickTiers: pickTiersSchema,
  /** Seconds a bot / auto-draft team gets on the clock. Capped at runtime by
   * the round's own clock (a bot never gets longer than a human would), unless
   * set to UNLIMITED_PICK_SECONDS — then bots never auto-pick either, so one
   * person can mock the whole draft by picking for every team by hand — or
   * MATCH_ROUND_PICK_SECONDS, which gives bots the round's full human clock. */
  botPickSeconds: z.number().int().refine(
    (s) =>
      s === UNLIMITED_PICK_SECONDS ||
      s === MATCH_ROUND_PICK_SECONDS ||
      (s >= 1 && s <= MAX_PICK_SECONDS),
    { message: `Bot pick speed must be 1–${MAX_PICK_SECONDS}s, no limit, or match the round clock` },
  ).default(DEFAULT_BOT_PICK_SECONDS),
  /** When on, a team that lets its clock expire is SKIPPED (the next team comes
   * on the clock) instead of auto-picked — the skipped team can still pick any
   * time afterward. Off = today's behavior (auto-pick on timeout). The skip cap
   * is `timeoutAllowance` (below): once a team is skipped that many times it's
   * auto-picked instead. */
  allowSkips: z.boolean().default(false),
  /** Number of times a team may let the clock expire before auto-picks kick in. Null = unlimited. */
  timeoutAllowance: z.number().int().min(0).nullable().default(null),
  /** Seconds the next team's clock is frozen at full after a pick/skip before it
   * ticks (a between-picks breather; also covers the pick-reveal animation). 0 =
   * off. Picking is allowed throughout — the clock is only frozen, not blocked. */
  pickBufferSeconds: z
    .number()
    .int()
    .min(0)
    .max(MAX_PICK_BUFFER_SECONDS)
    .default(DEFAULT_PICK_BUFFER_SECONDS),
  keepersEnabled: z.boolean().default(false),
  scheduledStart: z.string().datetime().nullable().default(null),
  /** Scoring rules (drives projections / power rankings). */
  scoring: scoringRulesSchema.default(DEFAULT_SCORING_RULES),
}).superRefine((s, ctx) => {
  // Position limits must be internally consistent and leave a fillable roster.
  const limits = s.positionLimits ?? {};
  const rounds = rosterSize(s.rosterComposition);
  // Dedicated (single-position) starter slots per position — a position's max
  // can't sit below the lineup that already forces that many of it.
  const dedicated: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const { slot, count } of s.rosterComposition) {
    if (slot in dedicated) dedicated[slot as Position] += count;
  }
  let minSum = 0;
  for (const pos of POSITIONS) {
    const { min, max } = positionLimitFor(limits, pos);
    minSum += min;
    if (max != null && min > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${pos} minimum can't exceed its maximum`,
        path: ['positionLimits', pos],
      });
    }
    if (max != null && max < dedicated[pos]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${pos} maximum must be at least ${dedicated[pos]} (its starting spots)`,
        path: ['positionLimits', pos],
      });
    }
  }
  if (minSum > rounds) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Position minimums add up to ${minSum}, more than the ${rounds} roster spots`,
      path: ['positionLimits'],
    });
  }
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
  positionLimits: {},
  pickTiers: DEFAULT_PICK_TIERS,
  botPickSeconds: DEFAULT_BOT_PICK_SECONDS,
  allowSkips: false,
  timeoutAllowance: null,
  pickBufferSeconds: DEFAULT_PICK_BUFFER_SECONDS,
  keepersEnabled: false,
  scheduledStart: null,
  scoring: DEFAULT_SCORING_RULES,
};

// ── Editing an existing lobby's settings ────────────────────────────
// Which settings a commissioner may change depends on how far the draft has
// progressed, so an edit can never corrupt an in-progress board. Fields are
// grouped by how risky they are to change:
//   structural  — changes the board's shape (team count, draft type, roster/
//                 rounds, keepers on/off) + pre-draft metadata. Pre-draft only.
//   scoring     — only drives displayed projections/points, never the picks.
//                 Editable until the draft actually starts.
//   behavioral  — pick clock, bot clock, skip rules. Only affect FUTURE picks'
//                 deadlines, so they're safe to change any time before COMPLETE.
export type SettingsGroup = 'structural' | 'scoring' | 'behavioral';

export const SETTINGS_FIELD_GROUP: Record<keyof LobbySettings, SettingsGroup> = {
  name: 'structural', // edited via /rename, not the settings editor
  teamCount: 'structural',
  draftType: 'structural',
  visibility: 'structural',
  draftMode: 'structural',
  rosterComposition: 'structural',
  positionLimits: 'structural',
  keepersEnabled: 'structural',
  scheduledStart: 'structural',
  scoring: 'scoring',
  pickTiers: 'behavioral',
  botPickSeconds: 'behavioral',
  allowSkips: 'behavioral',
  timeoutAllowance: 'behavioral',
  pickBufferSeconds: 'behavioral',
};

/**
 * Whether a commissioner may permanently delete a lobby at this status. Only
 * before the draft is under way — once picks/results exist (DRAFTING, PAUSED,
 * COMPLETE) the board is preserved; members hide it from their own lists
 * instead. Single gate for the client (to show the action) and the server
 * (to enforce it).
 */
export function canDeleteLobby(status: LobbyStatus): boolean {
  return status === 'SETUP' || status === 'SCHEDULED' || status === 'STAGING';
}

/**
 * Whether a commissioner may restart the draft — wiping every drafted pick and
 * returning the lobby to STAGING (open room, pre-first-pick) so rules and
 * keepers can be changed and the draft re-run. In-progress only: a COMPLETE
 * draft keeps its board (use Copy Draft to spin off a fresh one). Single gate
 * for the client (to show the action) and the server (to enforce it).
 */
export function canRestartDraft(status: LobbyStatus): boolean {
  return status === 'DRAFTING' || status === 'PAUSED';
}

/** Which setting groups a commissioner may edit at a given lobby status. */
export function settingsEditableGroups(status: LobbyStatus): Set<SettingsGroup> {
  switch (status) {
    case 'SETUP':
    case 'SCHEDULED':
      return new Set(['structural', 'scoring', 'behavioral']);
    case 'STAGING':
      return new Set(['scoring', 'behavioral']);
    case 'DRAFTING':
    case 'PAUSED':
      return new Set(['behavioral']);
    case 'COMPLETE':
      return new Set();
  }
}

/**
 * Apply a proposed settings edit, keeping only the fields whose group is
 * editable at `status` and preserving the current value for the rest. The
 * single gate both the client (to disable inputs) and the server (to enforce)
 * rely on, so a client can never change a field it isn't allowed to.
 */
export function mergeEditableSettings(
  current: LobbySettings,
  incoming: LobbySettings,
  status: LobbyStatus,
): LobbySettings {
  const groups = settingsEditableGroups(status);
  const out = { ...current };
  for (const key of Object.keys(SETTINGS_FIELD_GROUP) as (keyof LobbySettings)[]) {
    if (groups.has(SETTINGS_FIELD_GROUP[key])) {
      (out[key] as LobbySettings[typeof key]) = incoming[key];
    }
  }
  return out;
}

/** Clean up user-entered pick tiers: clamp/sort boundaries, dedupe, ensure a
 * catch-all. Shared by the settings editor (client) and the PATCH endpoint. */
export function normalizeTiers(tiers: PickTier[], rounds: number): PickTier[] {
  const bounded = tiers
    .filter((t) => t.untilRound !== null)
    .map((t) => ({
      untilRound: Math.min(Math.max(1, t.untilRound as number), Math.max(1, rounds - 1)),
      seconds: t.seconds,
    }))
    .sort((a, b) => (a.untilRound as number) - (b.untilRound as number));
  const seen = new Set<number>();
  const deduped: PickTier[] = [];
  for (let i = bounded.length - 1; i >= 0; i--) {
    const r = bounded[i].untilRound as number;
    if (!seen.has(r)) {
      seen.add(r);
      deduped.unshift(bounded[i]);
    }
  }
  const catchAll = tiers.find((t) => t.untilRound === null) ?? {
    untilRound: null,
    seconds: 60,
  };
  return [...deduped, catchAll];
}

/** Payload for PATCH /api/lobbies/:id/settings — the full desired settings; the
 * server keeps only the fields editable at the lobby's current status. */
export const updateLobbySettingsSchema = z.object({ settings: lobbySettingsSchema });
export type UpdateLobbySettingsInput = z.infer<typeof updateLobbySettingsSchema>;

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
  // Delay (ms) after the draft ends before chat + reactions lock — one
  // combined timer, commissioner-configurable from immediate up to 7 days.
  chatLockMs: z.number().int().min(0).max(MAX_CHAT_LOCK_MS).default(CHAT_LOCK_MS),
});
export type CreateLobbyInput = z.infer<typeof createLobbySchema>;

/**
 * Commissioner renames the draft/lobby itself (distinct from a team's name).
 * Allowed at any time up until DRAFT_RESULTS_LOCK_MS (24h) after the draft
 * completes — enforced server-side against `completed_at`.
 */
export const renameLobbySchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export type RenameLobbyInput = z.infer<typeof renameLobbySchema>;

export const joinLobbySchema = z.object({
  lobbyId: z.string().uuid(),
  // Optional: OPEN lobbies don't require a password.
  password: z.string().max(100).optional(),
  teamName: z.string().min(1).max(40).optional(),
});
export type JoinLobbyInput = z.infer<typeof joinLobbySchema>;

/**
 * Which parts of a source draft to carry into a copy. League/scoring/timers all
 * live in the settings blob; anything left off falls back to
 * DEFAULT_LOBBY_SETTINGS. The two keeper flags require both `teamNames` and
 * `leagueSetup` (server-enforced) — keepers map to copied seats and their
 * round-cost `overall` needs the same team count / draft type / roster.
 */
export const copyLobbyIncludeSchema = z.object({
  leagueSetup: z.boolean(), // teamCount, draftType, rosterComposition
  scoring: z.boolean(),
  timers: z.boolean(), // pickTiers, allowSkips, timeoutAllowance
  teamNames: z.boolean(), // team names, draft order, colors
  keeperLists: z.boolean(), // keeper_options candidate pools
  keeperPicks: z.boolean(), // materialized is_keeper picks
});
export type CopyLobbyInclude = z.infer<typeof copyLobbyIncludeSchema>;

/** Payload for POST /api/lobbies/:id/copy — duplicate a draft into a new lobby. */
export const copyLobbySchema = z.object({
  name: z.string().trim().min(1).max(60),
  draftMode: draftModeSchema,
  include: copyLobbyIncludeSchema,
  // Turn every carried-over seat the copier doesn't own into a bot (instead of
  // an empty seat to re-invite) — a ready-to-run solo mock. Off by default.
  fillBots: z.boolean().default(false),
});
export type CopyLobbyInput = z.infer<typeof copyLobbySchema>;

/**
 * A self-contained snapshot of a draft's SETUP — settings + seats + keepers —
 * shared to another user (stored as shared_rulesets kind 'DRAFT_SETUP'). Teams
 * carry no owners; keepers reference their seat by draft position so they remap
 * onto the freshly-created seats. Materialized into a new staging lobby on
 * import (POST /lobbies/from-shared-setup), so keepers carry over without the
 * importer re-entering them by hand.
 */
export const draftSetupSnapshotSchema = z.object({
  settings: lobbySettingsSchema,
  teams: z.array(
    z.object({
      name: z.string(),
      draftPosition: z.number().int().positive(),
      color: z.string().nullable().optional(),
      isPrevChampion: z.boolean().optional(),
      isBot: z.boolean().optional(),
      autoDraft: z.boolean().optional(),
    }),
  ),
  keeperOptions: z.array(
    z.object({
      teamPos: z.number().int().positive(),
      playerId: z.string(),
      round: z.number().int().positive(),
      selected: z.boolean().optional(),
      isDefault: z.boolean().optional(),
    }),
  ),
  keeperPicks: z.array(
    z.object({
      teamPos: z.number().int().positive(),
      playerId: z.string(),
      round: z.number().int().positive(),
    }),
  ),
});
export type DraftSetupSnapshot = z.infer<typeof draftSetupSnapshotSchema>;

/** Payload for POST /api/lobbies/:id/share-setup — snapshot this draft's setup
 * into a shareable token, optionally notifying a friend. */
export const shareDraftSetupSchema = z.object({
  toUserId: z.string().uuid().optional(),
});
export type ShareDraftSetupInput = z.infer<typeof shareDraftSetupSchema>;

/** Payload for POST /api/lobbies/from-shared-setup — materialize a shared draft
 * setup into a fresh lobby the caller commissions. */
export const createLobbyFromSharedSetupSchema = z.object({
  sharedId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  draftMode: draftModeSchema,
  // The seat (by draft position) the caller takes. Omitted → the first seat,
  // preserving the original single-seat behavior.
  mySeat: z.number().int().positive().optional(),
  // Turn every other seat into a bot (instead of an empty seat to invite) — a
  // ready-to-run solo mock. Off by default.
  fillBots: z.boolean().default(false),
});
export type CreateLobbyFromSharedSetupInput = z.infer<typeof createLobbyFromSharedSetupSchema>;
