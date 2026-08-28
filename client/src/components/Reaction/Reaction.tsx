import { CUSTOM_EMOJIS, isMissingCustomEmoji } from '../../lib/customEmojis';
import './Reaction.scss';

/**
 * Renders one reaction "emoji" — a plain unicode character for the built-in
 * reactions, an <img> for a custom image-based one (retired or not, so history
 * always renders), or a neutral placeholder for a `:shortcode:` whose custom
 * emoji was deleted (see lib/customEmojis' lifecycle notes). Drops in exactly
 * where a render site used to interpolate `{emoji}`; the unicode case returns a
 * bare fragment so no wrapper markup changes. The image/placeholder size to
 * `1em`, inheriting whatever font-size the surrounding chip/palette sets.
 */
export function Reaction({ emoji, className }: { emoji: string; className?: string }) {
  const custom = CUSTOM_EMOJIS[emoji];
  if (custom) {
    return (
      <img
        src={custom.src}
        alt={custom.label}
        className={`reaction-img${className ? ` ${className}` : ''}`}
        draggable={false}
      />
    );
  }
  // A shortcode-shaped token with no manifest entry = a removed custom emoji.
  // Never leak the raw ":name:" — show a neutral, self-explaining placeholder.
  if (isMissingCustomEmoji(emoji)) {
    return (
      <span
        className={`reaction-img reaction-img--missing${className ? ` ${className}` : ''}`}
        role="img"
        aria-label="removed reaction"
        title="Removed reaction"
      >
        ?
      </span>
    );
  }
  return <>{emoji}</>;
}
