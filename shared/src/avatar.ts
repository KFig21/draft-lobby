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
  '#fdcb6e',
  '#ff6b6b',
  '#00d2d3',
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

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to255 = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}

/**
 * A random *vivid* background color for the shuffle die. Drawn from HSL with a
 * high saturation + mid lightness floor so it can never land on a black, brown,
 * grey, or white — a roll always yields something colorful. Re-rolls on the
 * (rare) exact match with `exclude` so the die always visibly changes the color.
 */
export function randomVividColor(exclude?: string): string {
  let hex: string;
  do {
    const h = Math.floor(Math.random() * 360);
    const s = 65 + Math.floor(Math.random() * 25); // 65–90% → never washed out
    const l = 52 + Math.floor(Math.random() * 12); // 52–64% → never near-black/white
    hex = hslToHex(h, s, l);
  } while (exclude && hex.toLowerCase() === exclude.toLowerCase());
  return hex;
}

// A broad pool of well-supported emoji for the "any old emoji" side of the
// shuffle die — space-separated so multi-codepoint glyphs stay intact.
const EMOJI_POOL: readonly string[] = (
  '😀 😁 😂 🤣 😃 😄 😅 😆 😉 😊 😋 😎 😍 😘 🙂 🤗 🤔 😐 😶 🙄 😏 😮 😪 😴 😌 😛 😜 😝 🤤 😔 🙃 🤑 😲 🤪 😵 🥳 🥴 🥺 🤠 🤡 😷 🤒 🤕 🤢 🤮 🤧 😈 👿 👹 👺 💀 👻 👽 👾 🤖 💩 🎃 ' +
  '👋 🤚 🖐 👌 ✌ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🙏 💪 🧠 👀 👅 👄 ' +
  '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐢 🐍 🐙 🦑 🦀 🐡 🐠 🐟 🐳 🐋 🦈 🐊 🦓 🦍 🐘 🦏 🐪 🐫 🦒 🦘 🐄 🐎 🐖 🐑 🐐 🦌 🐕 🐈 🐓 🦃 🦚 🦜 🦢 🐇 🐁 🐿 🦔 ' +
  '🌵 🎄 🌲 🌳 🌴 🌱 🌿 🍀 🍃 🍂 🍁 🍄 🌾 💐 🌷 🌹 🌺 🌸 🌼 🌻 🌞 🌝 🌚 🌙 ⭐ 🌟 💫 ✨ ⚡ 💥 🔥 🌈 ☀ ❄ ☃ ⛄ 💧 💦 ☔ 🌊 ' +
  '🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🍍 🥝 🍅 🍆 🥑 🥦 🌽 🥕 🥔 🥐 🍞 🥨 🧀 🥚 🍳 🥞 🥓 🍗 🍖 🌭 🍔 🍟 🍕 🌮 🌯 🥗 🍿 🍱 🍚 🍛 🍜 🍝 🍣 🍤 🍦 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍮 🍯 🥛 ☕ 🍵 🍺 🍻 🥂 ' +
  '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 ⛳ 🏹 🎣 🥊 ⛸ 🎿 🏂 🏋 🏄 🏊 🚴 🎪 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 🎲 🎯 🎳 🎮 🎰 ' +
  '🚗 🚕 🚙 🚌 🏎 🚓 🚑 🚒 🚚 🚜 🚲 🏍 🚀 🛸 🚁 ⛵ 🚤 🚢 ⚓ 🗺 🗽 🏰 🎡 🎢 🎠 🌋 ⛰ 🏕 🏠 🏡 ⛪ ' +
  '⌚ 📱 💻 🖥 🖨 🕹 📷 📹 🎥 📞 📺 📻 🎙 ⏰ ⌛ 🔋 🔌 💡 🔦 🕯 💰 💎 🔧 🔨 🔩 🔫 💣 🔪 🛡 🔮 📿 🔭 🔬 💊 💉 🔑 🎁 🎈 🎏 🎀 🎊 🎉 🏮 ✉ 💌 📦 📚 📖 🔖 📎 📌 ✏ ✂ 🔍 🔒 🔑 ' +
  '❤ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 💕 💖 💘 💝 💯 💢 💫 💥 🔥 🌟 ⭐'
).split(' ');

/**
 * A random emoji for the shuffle die: 40% of the time a curated preset
 * ({@link AVATAR_EMOJI_CHOICES}), 60% of the time any old emoji from the broad
 * pool. Re-rolls on an exact match with `exclude` so the die always visibly
 * changes the emoji.
 */
export function randomEmoji(exclude?: string): string {
  const pool: readonly string[] =
    Math.random() < 0.4 ? AVATAR_EMOJI_CHOICES : EMOJI_POOL;
  let emoji: string;
  let guard = 0;
  do {
    emoji = pool[Math.floor(Math.random() * pool.length)];
  } while (emoji === exclude && ++guard < 8);
  return emoji;
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
