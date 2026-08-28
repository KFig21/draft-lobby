import { CUSTOM_EMOJIS } from '../../lib/customEmojis';
import './Reaction.scss';

/**
 * Renders one reaction "emoji" — a plain unicode character for the built-in
 * reactions, or an <img> for a custom image-based one (see lib/customEmojis).
 * Drops in exactly where a render site used to interpolate `{emoji}`; the text
 * case returns a bare fragment so no wrapper markup changes. The image sizes to
 * `1em`, so it inherits whatever font-size the surrounding chip/palette sets —
 * matching the unicode glyphs it sits beside without per-site sizing.
 */
export function Reaction({ emoji, className }: { emoji: string; className?: string }) {
  const custom = CUSTOM_EMOJIS[emoji];
  if (!custom) return <>{emoji}</>;
  return (
    <img
      src={custom.src}
      alt={custom.label}
      className={`reaction-img${className ? ` ${className}` : ''}`}
      draggable={false}
    />
  );
}
