import { z } from 'zod';

// ── The scoreable-stat catalog (football) ───────────────────────────
// Canonical set of stat categories a scoring format may award points for. The
// custom-format wizard only offers these (no free-form keys), and saved rules
// are validated against it.

export type StatKind =
  | 'count' // points per single occurrence (a TD)
  | 'rate'; // points per N units (yards)

export interface StatCategory {
  key: string;
  label: string;
  group: string;
  kind: StatKind;
  unit?: string; // rate only, singular noun (e.g. "yard")
  defaultPoints: number;
  defaultPer?: number; // rate only, e.g. 25 → "1 pt per 25 yds"
  defaultOn: boolean;
  advanced?: boolean;
  // Positions that may carry a per-position override for this stat
  // (stored as "<key>.<POS>", e.g. rushingTd.QB).
  overridePositions?: string[];
}

export const FOOTBALL_CATALOG: StatCategory[] = [
  // Passing
  { key: 'passingYards', label: 'Passing yards', group: 'Passing', kind: 'rate', unit: 'yard', defaultPoints: 1, defaultPer: 25, defaultOn: true },
  { key: 'passingTd', label: 'Passing TD', group: 'Passing', kind: 'count', defaultPoints: 4, defaultOn: true },
  { key: 'interception', label: 'Interception', group: 'Passing', kind: 'count', defaultPoints: -2, defaultOn: true },
  { key: 'bonusPassYd300_399', label: '300–399 passing yard game', group: 'Passing', kind: 'count', defaultPoints: 2, defaultOn: false, advanced: true },
  { key: 'bonusPassYd400p', label: '400+ passing yard game', group: 'Passing', kind: 'count', defaultPoints: 3, defaultOn: false, advanced: true },
  { key: 'passingTd40_49', label: 'Passing TD 40–49 yds bonus', group: 'Passing', kind: 'count', defaultPoints: 2, defaultOn: false, advanced: true },
  { key: 'passingTd50p', label: 'Passing TD 50+ yds bonus', group: 'Passing', kind: 'count', defaultPoints: 2, defaultOn: false, advanced: true },
  // Rushing
  { key: 'rushingYards', label: 'Rushing yards', group: 'Rushing', kind: 'rate', unit: 'yard', defaultPoints: 1, defaultPer: 10, defaultOn: true },
  { key: 'rushingTd', label: 'Rushing TD', group: 'Rushing', kind: 'count', defaultPoints: 6, defaultOn: true, overridePositions: ['QB'] },
  { key: 'bonusRushYd100_199', label: '100–199 rushing yard game', group: 'Rushing', kind: 'count', defaultPoints: 2, defaultOn: false, advanced: true },
  { key: 'bonusRushYd200p', label: '200+ rushing yard game', group: 'Rushing', kind: 'count', defaultPoints: 3, defaultOn: false, advanced: true },
  // Receiving
  { key: 'reception', label: 'Reception', group: 'Receiving', kind: 'count', defaultPoints: 1, defaultOn: true },
  { key: 'receivingYards', label: 'Receiving yards', group: 'Receiving', kind: 'rate', unit: 'yard', defaultPoints: 1, defaultPer: 10, defaultOn: true },
  { key: 'receivingTd', label: 'Receiving TD', group: 'Receiving', kind: 'count', defaultPoints: 6, defaultOn: true },
  { key: 'bonusRecYd100_199', label: '100–199 receiving yard game', group: 'Receiving', kind: 'count', defaultPoints: 2, defaultOn: false, advanced: true },
  { key: 'bonusRecYd200p', label: '200+ receiving yard game', group: 'Receiving', kind: 'count', defaultPoints: 3, defaultOn: false, advanced: true },
  { key: 'receivingTd40_49', label: 'Receiving TD 40–49 yds bonus', group: 'Receiving', kind: 'count', defaultPoints: 2, defaultOn: false, advanced: true },
  { key: 'receivingTd50p', label: 'Receiving TD 50+ yds bonus', group: 'Receiving', kind: 'count', defaultPoints: 2, defaultOn: false, advanced: true },
  // Miscellaneous
  { key: 'fumbleLost', label: 'Fumble lost', group: 'Miscellaneous', kind: 'count', defaultPoints: -2, defaultOn: true },
  { key: 'twoPointConversion', label: '2-point conversion', group: 'Miscellaneous', kind: 'count', defaultPoints: 2, defaultOn: false, advanced: true },
  // Kicking
  { key: 'fgMade0_39', label: 'FG made 0–39 yds', group: 'Kicking', kind: 'count', defaultPoints: 3, defaultOn: false },
  { key: 'fgMade40_49', label: 'FG made 40–49 yds', group: 'Kicking', kind: 'count', defaultPoints: 4, defaultOn: false },
  { key: 'fgMade50p', label: 'FG made 50+ yds', group: 'Kicking', kind: 'count', defaultPoints: 5, defaultOn: false },
  { key: 'fgMiss', label: 'FG missed', group: 'Kicking', kind: 'count', defaultPoints: -1, defaultOn: false },
  { key: 'xpMade', label: 'Extra point made', group: 'Kicking', kind: 'count', defaultPoints: 1, defaultOn: false },
  { key: 'xpMiss', label: 'Extra point missed', group: 'Kicking', kind: 'count', defaultPoints: -1, defaultOn: false, advanced: true },
  // Team defense (D/ST)
  { key: 'dstSack', label: 'Sack', group: 'Team defense', kind: 'count', defaultPoints: 1, defaultOn: false },
  { key: 'dstInt', label: 'Interception', group: 'Team defense', kind: 'count', defaultPoints: 2, defaultOn: false },
  { key: 'dstFumRec', label: 'Fumble recovery', group: 'Team defense', kind: 'count', defaultPoints: 2, defaultOn: false },
  { key: 'dstTd', label: 'Defensive TD', group: 'Team defense', kind: 'count', defaultPoints: 6, defaultOn: false },
  { key: 'dstForcedFumble', label: 'Forced fumble', group: 'Team defense', kind: 'count', defaultPoints: 1, defaultOn: false, advanced: true },
  { key: 'dstSpecialTeamsTd', label: 'Special teams TD', group: 'Team defense', kind: 'count', defaultPoints: 6, defaultOn: false, advanced: true },
  { key: 'dstPtsAllow0', label: '0 points allowed', group: 'Team defense', kind: 'count', defaultPoints: 10, defaultOn: false },
  { key: 'dstPtsAllow1_6', label: '1–6 points allowed', group: 'Team defense', kind: 'count', defaultPoints: 7, defaultOn: false },
  { key: 'dstPtsAllow7_13', label: '7–13 points allowed', group: 'Team defense', kind: 'count', defaultPoints: 4, defaultOn: false },
  { key: 'dstPtsAllow14_20', label: '14–20 points allowed', group: 'Team defense', kind: 'count', defaultPoints: 1, defaultOn: false },
  { key: 'dstPtsAllow21_27', label: '21–27 points allowed', group: 'Team defense', kind: 'count', defaultPoints: 0, defaultOn: false },
  { key: 'dstPtsAllow28_34', label: '28–34 points allowed', group: 'Team defense', kind: 'count', defaultPoints: -1, defaultOn: false },
  { key: 'dstPtsAllow35p', label: '35+ points allowed', group: 'Team defense', kind: 'count', defaultPoints: -4, defaultOn: false },
  // Individual defensive players (IDP)
  { key: 'idpTackleSolo', label: 'Solo tackle', group: 'IDP', kind: 'count', defaultPoints: 1, defaultOn: false },
  { key: 'idpTackleAst', label: 'Assisted tackle', group: 'IDP', kind: 'count', defaultPoints: 0.5, defaultOn: false },
  { key: 'idpSack', label: 'Sack', group: 'IDP', kind: 'count', defaultPoints: 2, defaultOn: false },
  { key: 'idpInt', label: 'Interception', group: 'IDP', kind: 'count', defaultPoints: 3, defaultOn: false },
  { key: 'idpTd', label: 'Defensive TD', group: 'IDP', kind: 'count', defaultPoints: 6, defaultOn: false },
  { key: 'idpForcedFumble', label: 'Forced fumble', group: 'IDP', kind: 'count', defaultPoints: 2, defaultOn: false, advanced: true },
  { key: 'idpFumRec', label: 'Fumble recovery', group: 'IDP', kind: 'count', defaultPoints: 2, defaultOn: false, advanced: true },
  { key: 'idpPassDefended', label: 'Pass defended', group: 'IDP', kind: 'count', defaultPoints: 1, defaultOn: false, advanced: true },
  { key: 'idpSafety', label: 'Safety', group: 'IDP', kind: 'count', defaultPoints: 2, defaultOn: false, advanced: true },
];

export function catalogByKey(): Map<string, StatCategory> {
  return new Map(FOOTBALL_CATALOG.map((c) => [c.key, c]));
}

export const STAT_LABELS: Record<string, string> = Object.fromEntries(
  FOOTBALL_CATALOG.map((c) => [c.key, c.label]),
);
export const statLabel = (key: string): string => STAT_LABELS[key] ?? key;

// ── Scoring rules (stored shape) ────────────────────────────────────
// Rate stats keep the intended framing { points, per }; count stats a number.
const points = z.number().finite().gte(-100).lte(100);
export const rateRuleSchema = z.object({
  points,
  per: z.number().int().min(1).max(1000),
});
export const scoringRuleValueSchema = z.union([points, rateRuleSchema]);
export type ScoringRuleValue = z.infer<typeof scoringRuleValueSchema>;

export const scoringRulesSchema = z.record(z.string(), scoringRuleValueSchema);
export type ScoringRules = z.infer<typeof scoringRulesSchema>;

export const POSITION_OVERRIDE_SEP = '.';

// ── Presets ─────────────────────────────────────────────────────────
const BASE_RULES: ScoringRules = {
  passingYards: { points: 1, per: 25 },
  passingTd: 4,
  interception: -2,
  rushingYards: { points: 1, per: 10 },
  rushingTd: 6,
  receivingYards: { points: 1, per: 10 },
  receivingTd: 6,
  fumbleLost: -2,
};

export const SCORING_PRESETS = {
  STANDARD: { label: 'Standard', rules: { ...BASE_RULES } },
  HALF_PPR: { label: 'Half-PPR', rules: { ...BASE_RULES, reception: 0.5 } },
  PPR: { label: 'PPR', rules: { ...BASE_RULES, reception: 1 } },
} satisfies Record<string, { label: string; rules: ScoringRules }>;

export type ScoringPreset = keyof typeof SCORING_PRESETS;

export const DEFAULT_SCORING_RULES: ScoringRules = SCORING_PRESETS.PPR.rules;

/** Which preset (if any) a rule set exactly matches — for labeling. */
export function matchPreset(rules: ScoringRules): ScoringPreset | null {
  const json = JSON.stringify(rules);
  for (const [key, preset] of Object.entries(SCORING_PRESETS) as [
    ScoringPreset,
    { rules: ScoringRules },
  ][]) {
    if (JSON.stringify(preset.rules) === json) return key;
  }
  return null;
}

// ── Rate ⇄ points-per-unit conversion ───────────────────────────────
export function toPointsPerUnit(cat: StatCategory, pts: number, per?: number): number {
  if (cat.kind !== 'rate') return pts;
  const denom = per ?? cat.defaultPer ?? 1;
  return denom ? pts / denom : 0;
}

export function fromPointsPerUnit(
  cat: StatCategory,
  pointsPerUnit: number,
): { points: number; per: number } {
  if (cat.kind !== 'rate') return { points: pointsPerUnit, per: 1 };
  const per = cat.defaultPer ?? 1;
  return { points: Math.round(pointsPerUnit * per * 1000) / 1000, per };
}

/** Collapse a stored rule value to points-per-unit. */
export function ruleToPointsPerUnit(value: ScoringRuleValue | undefined): number {
  if (value === undefined) return 0;
  if (typeof value === 'number') return value;
  return value.per ? value.points / value.per : 0;
}

/** Human-readable award, honoring the stored framing. */
export function formatScoringRule(key: string, value: ScoringRuleValue): string {
  if (typeof value === 'object') {
    const unit = catalogByKey().get(key.split(POSITION_OVERRIDE_SEP)[0])?.unit ?? 'unit';
    const pts = `${value.points} pt${Math.abs(value.points) === 1 ? '' : 's'}`;
    return value.per === 1 ? `${pts} per ${unit}` : `${pts} per ${value.per} ${unit}s`;
  }
  return value > 0 ? `+${value}` : `${value}`;
}

// ── Validation for saved formats ────────────────────────────────────
export const createScoringFormatSchema = z
  .object({
    name: z.string().min(1).max(40),
    rules: scoringRulesSchema,
  })
  .superRefine((val, ctx) => {
    const catalog = catalogByKey();
    const keys = Object.keys(val.rules);
    if (keys.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rules'],
        message: 'A scoring format needs at least one category.',
      });
    }
    for (const key of keys) {
      const [base, pos] = key.split(POSITION_OVERRIDE_SEP);
      const cat = catalog.get(base);
      if (!cat) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rules', key],
          message: `Unknown stat category: ${base}`,
        });
        continue;
      }
      if (pos && !(cat.overridePositions ?? []).includes(pos)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rules', key],
          message: `${cat.label} can't be scored per-position for ${pos}`,
        });
      }
    }
  });
export type CreateScoringFormatInput = z.infer<typeof createScoringFormatSchema>;
