/**
 * Low-level 2D-canvas primitives shared by the deterministic PNG renderers
 * (board export, draft-grade export). Kept dependency-free — nothing here
 * touches the DOM beyond an offscreen scratch canvas — so every renderer that
 * builds on it produces identical output on any machine/OS/browser (the whole
 * reason the exports avoid html2canvas). See boardCanvas.ts for the original
 * home of these helpers.
 */

export const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif";

/** Trace a rounded rectangle path (caller fills/strokes). */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Trim text with a trailing ellipsis until it fits maxWidth (font already set). */
export function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

/** Greedy word-wrap into at most maxLines; the last line is ellipsized if the
 * text overflows. */
export function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (!cur || ctx.measureText(trial).width <= maxWidth) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.join(' ').length < text.replace(/\s+/g, ' ').length) {
    let last = lines[lines.length - 1] ?? '';
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

// Emoji glyphs have no reliable text-metric center (the em box, ascent/descent
// and the actual ink all disagree, and it varies by OS emoji font). So render
// the emoji big on a scratch canvas, find its true ink bounding box by scanning
// pixels, and blit that box centered — exact on any OS. Cached per emoji.
const _scratch = document.createElement('canvas');
const _emojiInk = new Map<string, { minX: number; minY: number; w: number; h: number } | null>();

/** Draw an emoji centered at (cx, cy), scaled so its ink fits `box`. */
export function drawCenteredEmoji(
  ctx: CanvasRenderingContext2D,
  emoji: string,
  cx: number,
  cy: number,
  box: number,
): void {
  const F = 64;
  const dim = F * 2;
  let ink = _emojiInk.get(emoji);
  if (ink === undefined) {
    _scratch.width = dim;
    _scratch.height = dim;
    const sc = _scratch.getContext('2d', { willReadFrequently: true });
    if (!sc) return;
    sc.clearRect(0, 0, dim, dim);
    sc.font = `${F}px ${FONT}`;
    sc.textAlign = 'center';
    sc.textBaseline = 'middle';
    sc.fillText(emoji, dim / 2, dim / 2);
    const data = sc.getImageData(0, 0, dim, dim).data;
    let minX = dim;
    let minY = dim;
    let maxX = -1;
    let maxY = -1;
    for (let py = 0; py < dim; py++) {
      for (let px = 0; px < dim; px++) {
        if (data[(py * dim + px) * 4 + 3] > 12) {
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
    }
    ink = maxX < 0 ? null : { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    _emojiInk.set(emoji, ink);
  }
  if (!ink) return;
  _scratch.width = dim;
  _scratch.height = dim;
  const sc = _scratch.getContext('2d');
  if (!sc) return;
  sc.font = `${F}px ${FONT}`;
  sc.textAlign = 'center';
  sc.textBaseline = 'middle';
  sc.fillText(emoji, dim / 2, dim / 2);
  const s = box / Math.max(ink.w, ink.h);
  ctx.drawImage(
    _scratch,
    ink.minX,
    ink.minY,
    ink.w,
    ink.h,
    cx - (ink.w * s) / 2,
    cy - (ink.h * s) / 2,
    ink.w * s,
    ink.h * s,
  );
}

/** Draw a generative identicon (colored shape + centered emoji) at (x, y). */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  avatar: { bgColor: string; shape?: 'circle' | 'rounded' | 'square'; emoji: string },
  x: number,
  y: number,
  size: number,
): void {
  const shape = avatar.shape ?? 'circle';
  const r = shape === 'circle' ? size / 2 : shape === 'rounded' ? size * 0.3 : size * 0.18;
  ctx.save();
  roundRect(ctx, x, y, size, size, r);
  ctx.fillStyle = avatar.bgColor;
  ctx.fill();
  ctx.clip();
  drawCenteredEmoji(ctx, avatar.emoji, x + size / 2, y + size / 2, size * 0.72);
  ctx.restore();
}
