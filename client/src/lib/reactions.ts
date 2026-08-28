import { REACTION_EMOJIS } from '@draft-lobby/shared';
import { isRetiredEmoji } from './customEmojis';

/** REACTION_EMOJIS ordered by usage count (highest first) for the given
 * target — ties fall back to the default REACTION_EMOJIS order. Used
 * everywhere a reaction row/palette is rendered so the most-used emoji for
 * that specific pick/player/message/post surfaces first.
 *
 * Includes retired custom emojis, so a pick that already has them still LISTS
 * them (callers filter to `count > 0` for the existing-reactions display). For
 * the pick-a-new-reaction palette use addableReactionEmojis instead. */
export function sortReactionEmojis(counts: Record<string, number> | undefined): string[] {
  if (!counts) return [...REACTION_EMOJIS];
  return [...REACTION_EMOJIS].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
}

/** The emoji a user can ADD right now — sorted like sortReactionEmojis but with
 * retired custom emojis dropped, so a removed emoji can't be applied fresh while
 * still rendering on the reactions it already has. Use this for every palette. */
export function addableReactionEmojis(counts: Record<string, number> | undefined): string[] {
  return sortReactionEmojis(counts).filter((e) => !isRetiredEmoji(e));
}
