import type { Avatar as AvatarData, AvatarShape } from '@draft-lobby/shared';
import './Avatar.scss';

interface Props {
  avatar: AvatarData;
  size?: number;
}

// border-radius per shape (as a % of the box).
const SHAPE_RADIUS: Record<AvatarShape, string> = {
  circle: '50%',
  rounded: '30%',
  square: '18%',
};

/**
 * Generative identicon: a colored shape with a centered emoji. No image
 * uploads (per spec) — ported from the leet_pix avatar convention.
 */
export function Avatar({ avatar, size = 40 }: Props) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: avatar.bgColor,
        borderRadius: SHAPE_RADIUS[avatar.shape ?? 'circle'],
        fontSize: size * 0.5,
      }}
      aria-hidden
    >
      {avatar.emoji}
    </span>
  );
}
