import { z } from 'zod';

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex color');

/** Background disc shapes → border-radius applied in the Avatar component. */
export const AVATAR_SHAPES = ['circle', 'rounded', 'square'] as const;
export type AvatarShape = (typeof AVATAR_SHAPES)[number];

/**
 * Generative avatar — no image uploads. A colored shape with a centered emoji.
 * Ported from the leet_pix convention (emoji + bgColor + shape).
 */
export const avatarSchema = z.object({
  bgColor: hexColor,
  shape: z.enum(AVATAR_SHAPES).default('circle'),
  emoji: z.string().min(1).max(8),
});
export type Avatar = z.infer<typeof avatarSchema>;

/** A palette of pleasant background colors for the avatar picker. */
export const AVATAR_BG_COLORS = [
  '#6c5ce7',
  '#3fd6a5',
  '#4aa8ff',
  '#f6a642',
  '#f8577d',
  '#b98bff',
  '#00b894',
  '#e17055',
  '#0984e3',
  '#fdcb6e',
] as const;

/** Handful of on-theme default emoji for the picker. */
export const AVATAR_EMOJI_CHOICES = [
  '🏈',
  '🏆',
  '🔥',
  '💪',
  '🐐',
  '⚡',
  '🎯',
  '👑',
  '🤖',
  '🦅',
  '🐻',
  '🦁',
  '🐬',
  '😎',
  '🤠',
  '👽',
] as const;

/** A randomly-chosen avatar (emoji + color) for a brand-new account, before
 * the user customizes it in onboarding. Non-deterministic, unlike
 * defaultAvatar — two accounts created back-to-back won't look alike. */
export function randomAvatar(): Avatar {
  const pick = <T>(arr: readonly T[]): T =>
    arr[Math.floor(Math.random() * arr.length)];
  return {
    bgColor: pick(AVATAR_BG_COLORS),
    shape: 'circle',
    emoji: pick(AVATAR_EMOJI_CHOICES),
  };
}

/** Deterministic default avatar derived from a seed string (e.g. user id). */
export function defaultAvatar(seed: string): Avatar {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash);
  return {
    bgColor: AVATAR_BG_COLORS[idx % AVATAR_BG_COLORS.length],
    shape: 'circle',
    emoji: AVATAR_EMOJI_CHOICES[idx % AVATAR_EMOJI_CHOICES.length],
  };
}
