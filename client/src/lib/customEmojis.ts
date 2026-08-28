import fImg from '../assets/emojis/f.png';

/**
 * Custom (image-based) reactions. The reaction system is otherwise all unicode
 * text — one shared REACTION_EMOJIS list used as a zod enum, a DB text key, and
 * rendered inline as a character. A custom emoji rides through that same plumbing
 * as a shortcode-style TOKEN (`:f:`) that lives in REACTION_EMOJIS alongside the
 * real emoji; only the render layer differs, branching here to draw an <img>.
 *
 * See <Reaction> for the shared render helper and lib/reactions for ordering.
 */
export interface CustomEmoji {
  /** Hashed URL Vite emits from the static import — never a raw string path. */
  src: string;
  /** alt text / tooltip label. */
  label: string;
}

/** Keyed by the token that also appears in REACTION_EMOJIS. */
export const CUSTOM_EMOJIS: Record<string, CustomEmoji> = {
  ':f:': { src: fImg, label: 'F' },
};

export function isCustomEmoji(emoji: string): boolean {
  return emoji in CUSTOM_EMOJIS;
}

/**
 * Text stand-in for a reaction in string-only surfaces (e.g. a toast title,
 * which is a plain string and can't hold an <img>). Built-in unicode emoji pass
 * through as themselves; a custom token becomes its label so it never leaks as
 * the raw ":f:" shortcode. Anywhere that can render JSX should use <Reaction>.
 */
export function reactionText(emoji: string): string {
  return CUSTOM_EMOJIS[emoji]?.label ?? emoji;
}
