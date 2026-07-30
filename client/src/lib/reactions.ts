import { REACTION_EMOJIS } from '@draft-lobby/shared';

/** REACTION_EMOJIS ordered by usage count (highest first) for the given
 * target — ties fall back to the default REACTION_EMOJIS order. Used
 * everywhere a reaction row/palette is rendered so the most-used emoji for
 * that specific pick/player/message/post surfaces first. */
export function sortReactionEmojis(counts: Record<string, number> | undefined): string[] {
  if (!counts) return [...REACTION_EMOJIS];
  return [...REACTION_EMOJIS].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
}
