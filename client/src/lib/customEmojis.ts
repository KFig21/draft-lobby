import fImg from '../assets/emojis/f.png';

/**
 * Custom (image-based) reactions. The reaction system is otherwise all unicode
 * text — one shared REACTION_EMOJIS list used as a zod enum, a DB text key, and
 * rendered inline as a character. A custom emoji rides through that same plumbing
 * as a shortcode-style TOKEN (`:name:`) that also lives in REACTION_EMOJIS; only
 * the render layer differs, branching here (via <Reaction>) to draw an <img>.
 *
 * ── Three layers, deliberately independent ──────────────────────────────────
 *   1. VALIDATION / STORAGE  — shared REACTION_EMOJIS (zod enum + DB text key).
 *      A token must be here to be accepted + stored server-side.
 *   2. PALETTE (addable)      — what a user can pick right now. Built-in unicode
 *      plus every non-`retired` entry below. See lib/reactions#addableReactionEmojis.
 *   3. RENDER (displayable)   — <Reaction> can draw ANY entry below, retired or
 *      not, so historical reactions never break.
 *
 * ── Lifecycle (the whole point of this split) ───────────────────────────────
 *   ADD    — add a `:name:` entry here (+ its PNG) AND add the token to shared
 *            REACTION_EMOJIS. Ships in the client bundle + validated server-side.
 *   RETIRE — set `retired: true`. It drops out of the palette (nobody can add it
 *            fresh) but its asset stays, so every draft that already used it keeps
 *            rendering it exactly as before. This is the preferred "remove it after
 *            my draft" path: lossless, client-only, no lost history.
 *   DELETE — actually remove the entry (+ PNG). Only do this if you truly want the
 *            asset gone. Any historical reaction still keyed to the now-missing
 *            token renders as a neutral placeholder (see isMissingCustomEmoji +
 *            <Reaction>), never the raw ":name:" text.
 *
 * ── Future (user-submitted / league-scoped emojis; not built) ───────────────
 *   When emojis become runtime data, this manifest moves to a DB table + object
 *   storage, <Reaction> fetches instead of importing, and reaction validation
 *   relaxes from the fixed enum to "known unicode OR a :shortcode: in the
 *   registry" (optionally scoped by league). The token scheme + the <Reaction>
 *   seam already support that; nothing here needs to be re-thought, only sourced
 *   differently.
 */
export interface CustomEmoji {
  /** Hashed URL Vite emits from the static import — never a raw string path. */
  src: string;
  /** alt text / tooltip label. */
  label: string;
  /** Retired: still renders on old reactions, but no longer offered in the
   * palette. Keeps historical drafts intact after an emoji is "removed". */
  retired?: boolean;
}

/**
 * Keyed by the token that also appears in REACTION_EMOJIS. Entries are kept
 * FOREVER (mark `retired` instead of deleting) so historical reactions render.
 */
export const CUSTOM_EMOJIS: Record<string, CustomEmoji> = {
  ':f:': { src: fImg, label: 'F' },
};

/** A `:shortcode:`-shaped token — how a custom reaction is distinguished from a
 * unicode glyph. Used to tell a REMOVED custom emoji (placeholder) apart from a
 * plain unicode reaction (renders as itself). */
export function isCustomTokenShape(emoji: string): boolean {
  return /^:[^:\s]+:$/.test(emoji);
}

export function isCustomEmoji(emoji: string): boolean {
  return emoji in CUSTOM_EMOJIS;
}

/** In the manifest but retired — renders, but excluded from the palette. */
export function isRetiredEmoji(emoji: string): boolean {
  return CUSTOM_EMOJIS[emoji]?.retired === true;
}

/** A shortcode-shaped token with no manifest entry = a fully-deleted custom
 * emoji. Its reactions still exist in old drafts; <Reaction> shows a placeholder. */
export function isMissingCustomEmoji(emoji: string): boolean {
  return isCustomTokenShape(emoji) && !(emoji in CUSTOM_EMOJIS);
}

/**
 * Text stand-in for a reaction in string-only surfaces (e.g. somewhere a plain
 * string is required and JSX can't be used). Built-in unicode emoji pass through
 * as themselves; a custom token becomes its label; a removed one becomes a
 * neutral marker — never the raw ":name:" shortcode. Anywhere that can render
 * JSX should use <Reaction> instead.
 */
export function reactionText(emoji: string): string {
  if (CUSTOM_EMOJIS[emoji]) return CUSTOM_EMOJIS[emoji].label;
  if (isMissingCustomEmoji(emoji)) return '❔';
  return emoji;
}
