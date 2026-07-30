import { z } from 'zod';
import { lobbySettingsSchema } from './lobby.js';
import { scoringRulesSchema } from './scoring.js';

/** A shareable ruleset is either a bare scoring format or a full league setup
 * (a LobbySettings snapshot). Kept in its own module so it can pull in both
 * lobby + scoring schemas without the social.ts ↔ lobby.ts import cycle. */
export const SHARED_RULESET_KINDS = ['SCORING', 'LEAGUE'] as const;
export type SharedRulesetKind = (typeof SHARED_RULESET_KINDS)[number];

/** Body for POST /api/rulesets/share. Always creates a shareable snapshot
 * (returns its token id); when `toUserId` is an accepted friend, also sends
 * them a RULESET_SHARE notification. */
export const shareRulesetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('SCORING'),
    name: z.string().trim().min(1).max(60),
    payload: scoringRulesSchema,
    toUserId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal('LEAGUE'),
    name: z.string().trim().min(1).max(60),
    payload: lobbySettingsSchema,
    toUserId: z.string().uuid().optional(),
  }),
]);
export type ShareRulesetInput = z.infer<typeof shareRulesetSchema>;
