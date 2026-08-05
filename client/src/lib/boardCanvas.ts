import { POSITION_COLORS, type DraftType, type Position } from '@draft-lobby/shared';
import type { DraftCellStyle } from './draftCellStyle';
import { avatarForTeam } from './teamAvatar';
import type { MemberRow, PickRow, PlayerRow, TeamRow } from './types';

/**
 * Deterministic PNG board renderer — draws the draft board straight onto a
 * <canvas> from the pick data, with NO html2canvas / DOM clone / iframe.
 *
 * Why this exists: html2canvas re-paints the live DOM inside a temporary
 * iframe, and that iframe step is exactly what work/enterprise machines
 * interfere with (DLP agents, security extensions, content inspectors),
 * producing a "barely formatted" export on some machines while the live board
 * looks perfect. Drawing the board ourselves depends on nothing but the 2D
 * canvas API, so the output is identical on every machine, OS and browser —
 * verifying it anywhere proves it everywhere.
 *
 * The export mirrors the viewer's selected cell style ('default'/Hybrid,
 * 'bold'/Big screen, or 'clean'), and shows only made picks (no transient
 * on-the-clock / skipped overlays).
 */

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif";

// Geometry — mirrors DraftGrid.scss's natural (non-fill) sizes.
const GAP = 4; // border-spacing
const RADIUS = 6; // $radius-sm
const ROUND_COL_W = 30;
const HEADER_H = 34;
const CELL_W = 120;
const CELL_H = 52;
const CELL_PAD = 6; // $space * 0.75

interface Palette {
  canvas: string; // --grid-canvas (gaps + backing)
  cellBg: string; // --cell-bg (empty cell)
  headerFace: string; // --bg-overlay (header/round face)
  border: string; // --border
  text: string; // --text
  textMuted: string; // --text-muted
  keeper: string; // --keeper
  ring: string; // "my team" export ring
  slotBg: string; // anonymized slot disc
}

const PALETTES: Record<'dark' | 'light', Palette> = {
  dark: {
    canvas: '#12141d',
    cellBg: '#12141d',
    headerFace: '#232738',
    border: '#2e3347',
    text: '#e8eaf2',
    textMuted: '#8a94a6',
    keeper: '#e0a92b',
    ring: '#3fd6a5', // $accent
    slotBg: '#12141d',
  },
  light: {
    canvas: '#ffffff',
    cellBg: '#ffffff',
    headerFace: '#e9ebf1',
    border: '#d4d8e2',
    text: '#1a1d29',
    textMuted: '#667085',
    keeper: '#c39124',
    ring: '#137a83', // $primary
    slotBg: '#ffffff',
  },
};

const ACCENT = '#3fd6a5';
const ON_ACCENT = '#05231a'; // dark text on the accent fill

export interface BoardRenderOptions {
  teams: TeamRow[]; // in draft (column) order
  members: MemberRow[];
  picks: PickRow[];
  playersById: Map<string, PlayerRow>;
  rounds: number;
  teamCount: number;
  draftType: DraftType;
  currentRound: number;
  myTeamId: string | null;
  /** Which pick-cell look to draw — mirrors the viewer's Settings preference. */
  cellStyle: DraftCellStyle;
  /** Pick ids that have reactions / comments — draws the same corner flags as
   * the live board. Omit to draw none. */
  reactionPickIds?: Set<string>;
  commentPickIds?: Set<string>;
  theme: 'dark' | 'light';
  /** Replace names/avatars with the draft-slot number. */
  anonymize: boolean;
  /** Draw the "my team" ring on the owner's column header. */
  highlightMine: boolean;
  /** Padding (css px) of canvas color around the board. */
  padding?: number;
  /** Pixel-density multiplier (defaults to devicePixelRatio, capped at 2). */
  scale?: number;
}

function roundRect(
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

/** Trim text with an ellipsis until it fits maxWidth (ctx.font already set). */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

// "First initial. Last name" — but keep names that are already initials
// (C.J., A.J.) whole, and leave D/ST entries alone. Mirrors HybridPickCell.
function abbreviateName(name: string, position: string): string {
  if (position === 'DEF') return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const [first, ...rest] = parts;
  if (/^([A-Z]\.){2,}$/.test(first)) return `${first} ${rest.join(' ')}`;
  return `${first[0]?.toUpperCase() ?? ''}. ${rest.join(' ')}`;
}

function formatRoundPick(round: number, pickInRound: number, teamCount: number): string {
  const pad = teamCount >= 10 ? 2 : 1;
  return `${round}.${String(pickInRound).padStart(pad, '0')}`;
}

// Small vector glyphs for the corner flags — a padlock (keeper) and a speech
// bubble (comment). Drawn in `ink` at center (cx, cy).
function padlock(ctx: CanvasRenderingContext2D, cx: number, cy: number, ink: string): void {
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy - 1.2, 2, Math.PI, 0); // shackle
  ctx.stroke();
  ctx.fillRect(cx - 3, cy - 1.2, 6, 4.4); // body
}

function bubble(ctx: CanvasRenderingContext2D, cx: number, cy: number, ink: string): void {
  ctx.fillStyle = ink;
  roundRect(ctx, cx - 4, cy - 3.5, 8, 6, 2);
  ctx.fill();
  ctx.beginPath(); // little tail
  ctx.moveTo(cx - 2, cy + 2);
  ctx.lineTo(cx - 3.5, cy + 4);
  ctx.lineTo(cx, cy + 2.5);
  ctx.closePath();
  ctx.fill();
}

interface CellFlags {
  keeper: boolean;
  comment: boolean;
  reaction: boolean;
}

// The bottom-right corner flag row — keeper lock (rightmost), then comment,
// then reaction "!!", stacking leftward like the live board (row-reverse).
// `chip` styles (Hybrid/Big): each on a rounded disc hanging off the corner.
// `bare` (Clean): flat muted glyphs tucked just inside the corner.
function drawFlags(
  ctx: CanvasRenderingContext2D,
  cellX: number,
  cellY: number,
  flags: CellFlags,
  posColor: string,
  keeper: string,
  bare: boolean,
): void {
  const size = bare ? 12 : 14;
  const gap = bare ? 3 : 2;
  let cx = cellX + CELL_W - (bare ? size / 2 + 2 : 4);
  const cy = cellY + CELL_H - (bare ? size / 2 + 2 : 4);
  const step = (fill: string, ink: string, draw: () => void) => {
    ctx.save();
    if (!bare) {
      roundRect(ctx, cx - size / 2, cy - size / 2, size, size, size / 2);
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.fillStyle = ink;
    draw();
    ctx.restore();
    cx -= size + gap;
  };
  if (flags.keeper) step(keeper, bare ? keeper : '#1a1a1a', () => padlock(ctx, cx, cy, bare ? keeper : '#1a1a1a'));
  if (flags.comment) {
    const ink = bare ? '#8a94a6' : '#1a1a1a';
    step(posColor, ink, () => bubble(ctx, cx, cy, ink));
  }
  if (flags.reaction) {
    const ink = bare ? '#8a94a6' : '#1a1a1a';
    step(posColor, ink, () => {
      ctx.font = `900 8px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!!', cx, cy + 0.5);
    });
  }
}

function nameScale(name: string): number {
  const l = name.length;
  if (l <= 13) return 1;
  if (l <= 16) return 0.88;
  if (l <= 19) return 0.76;
  return 0.66;
}

// Greedy word-wrap into at most maxLines; the last line is ellipsized if the
// text overflows. Mirrors BoldPickCell's 3-line clamp / break-word behavior.
function wrapLines(
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

// ── Per-style pick-cell renderers (top-left of the cell is x,y) ──────────
function drawHybridCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pick: PickRow,
  player: PlayerRow,
  pal: Palette,
  teamCount: number,
  flags: CellFlags,
): void {
  const posColor = POSITION_COLORS[player.position as Position] ?? pal.textMuted;
  roundRect(ctx, x, y, CELL_W, CELL_H, RADIUS);
  ctx.fillStyle = posColor;
  ctx.fill();
  if (pick.is_keeper) keeperOutline(ctx, x, y, pal.keeper);

  const tx = x + CELL_PAD;
  const maxW = CELL_W - CELL_PAD * 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';
  ctx.font = `800 14px ${FONT}`;
  ctx.fillText(fitText(ctx, abbreviateName(player.name, player.position), maxW), tx, y + CELL_PAD + 13);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.font = `600 9px ${FONT}`;
  const bye = player.bye_week != null ? `  ·  Bye ${player.bye_week}` : '';
  ctx.fillText(fitText(ctx, `${player.nfl_team}${bye}`, maxW), tx, y + CELL_PAD + 27);
  const pickInRound = pick.overall - (pick.round - 1) * teamCount;
  ctx.fillText(formatRoundPick(pick.round, pickInRound, teamCount), tx, y + CELL_PAD + 39);
  drawFlags(ctx, x, y, flags, posColor, pal.keeper, false);
}

function drawBoldCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pick: PickRow,
  player: PlayerRow,
  pal: Palette,
  flags: CellFlags,
): void {
  const posColor = POSITION_COLORS[player.position as Position] ?? pal.textMuted;
  roundRect(ctx, x, y, CELL_W, CELL_H, RADIUS);
  ctx.fillStyle = posColor;
  ctx.fill();
  if (pick.is_keeper) keeperOutline(ctx, x, y, pal.keeper);

  const fs = 16.5 * nameScale(player.name);
  const lh = fs * 1.15;
  ctx.fillStyle = '#000';
  ctx.font = `800 ${fs}px ${FONT}`;
  ctx.textAlign = 'center';
  // Center each line on its own vertical middle so the whole block sits on the
  // cell's true center (baseline math left it riding high).
  ctx.textBaseline = 'middle';
  const lines = wrapLines(ctx, player.name, CELL_W - 10, 3);
  const cy = y + CELL_H / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, x + CELL_W / 2, cy - ((lines.length - 1) * lh) / 2 + i * lh);
  });
  drawFlags(ctx, x, y, flags, posColor, pal.keeper, false);
}

function drawCleanCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pick: PickRow,
  player: PlayerRow,
  pal: Palette,
  flags: CellFlags,
): void {
  roundRect(ctx, x, y, CELL_W, CELL_H, RADIUS);
  ctx.fillStyle = pal.cellBg;
  ctx.fill();
  roundRect(ctx, x + 0.5, y + 0.5, CELL_W - 1, CELL_H - 1, RADIUS);
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = 1;
  ctx.stroke();
  if (pick.is_keeper) keeperOutline(ctx, x, y, pal.keeper);

  const tx = x + CELL_PAD;
  const maxW = CELL_W - CELL_PAD * 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = POSITION_COLORS[player.position as Position] ?? pal.textMuted;
  ctx.font = `800 10px ${FONT}`;
  ctx.fillText(player.position, tx, y + CELL_PAD + 9);
  ctx.fillStyle = pal.text;
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText(fitText(ctx, player.name, maxW), tx, y + CELL_PAD + 24);
  ctx.fillStyle = pal.textMuted;
  ctx.font = `400 10px ${FONT}`;
  const bye = player.bye_week != null ? ` · ${player.bye_week}` : '';
  ctx.fillText(fitText(ctx, `${player.nfl_team}${bye}`, maxW), tx, y + CELL_PAD + 37);
  const posColor = POSITION_COLORS[player.position as Position] ?? pal.textMuted;
  drawFlags(ctx, x, y, flags, posColor, pal.keeper, true);
}

// Inset gold keeper outline shared by all three cell styles (matches the
// board's `.draft-grid__cell--keeper` 2px outline).
function keeperOutline(ctx: CanvasRenderingContext2D, x: number, y: number, keeper: string): void {
  roundRect(ctx, x + 1, y + 1, CELL_W - 2, CELL_H - 2, RADIUS - 1);
  ctx.strokeStyle = keeper;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// Emoji glyphs have no reliable text-metric center (the em box, ascent/descent
// and the actual ink all disagree, and it varies by OS emoji font). So render
// the emoji big on a scratch canvas, find its true ink bounding box by scanning
// pixels, and blit that box centered — exact on any OS. Cached per emoji.
const _scratch = document.createElement('canvas');
const _emojiInk = new Map<string, { minX: number; minY: number; w: number; h: number } | null>();

function drawCenteredEmoji(
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
  // Re-render at F (scratch may have been reused) and blit the ink box centered.
  _scratch.width = dim;
  _scratch.height = dim;
  const sc = _scratch.getContext('2d');
  if (!sc) return;
  sc.font = `${F}px ${FONT}`;
  sc.textAlign = 'center';
  sc.textBaseline = 'middle';
  sc.fillText(emoji, dim / 2, dim / 2);
  const s = box / Math.max(ink.w, ink.h);
  ctx.drawImage(_scratch, ink.minX, ink.minY, ink.w, ink.h, cx - (ink.w * s) / 2, cy - (ink.h * s) / 2, ink.w * s, ink.h * s);
}

function drawAvatar(
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
  ctx.clip(); // keep a tall glyph inside the disc
  drawCenteredEmoji(ctx, avatar.emoji, x + size / 2, y + size / 2, size * 0.72);
  ctx.restore();
}

/**
 * Render the board and return a finished canvas (already padded with the
 * board's canvas color). Caller downloads it as a PNG.
 */
export function renderBoardCanvas(opts: BoardRenderOptions): HTMLCanvasElement {
  const {
    teams,
    members,
    picks,
    playersById,
    rounds,
    teamCount,
    draftType,
    currentRound,
    myTeamId,
    cellStyle,
    reactionPickIds,
    commentPickIds,
    theme,
    anonymize,
    highlightMine,
  } = opts;
  const pal = PALETTES[theme];
  const pad = opts.padding ?? 16;
  // Floor at 2× so the PNG is crisp regardless of which display Chrome is on —
  // a DPR-1 external monitor would otherwise render at half the resolution of
  // the Retina laptop screen and look pixelated. Capped at 3× to bound size.
  const scale = opts.scale ?? Math.min(3, Math.max(2, window.devicePixelRatio || 1));

  // Index picks by "round:teamId".
  const byCell = new Map<string, PickRow>();
  for (const p of picks) byCell.set(`${p.round}:${p.team_id}`, p);

  // Board dimensions (css px), then the padded canvas.
  const boardW = GAP + ROUND_COL_W + GAP + teams.length * (CELL_W + GAP);
  const boardH = GAP + HEADER_H + GAP + rounds * (CELL_H + GAP);
  const W = boardW + pad * 2;
  const H = boardH + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D drawing context');
  ctx.scale(scale, scale);
  // crisp text
  ctx.textBaseline = 'alphabetic';

  // Canvas background (fills the gaps too).
  ctx.fillStyle = pal.canvas;
  ctx.fillRect(0, 0, W, H);
  ctx.translate(pad, pad);

  const colX = (i: number) => GAP + ROUND_COL_W + GAP + i * (CELL_W + GAP);
  const rowY = (r: number) => GAP + HEADER_H + GAP + r * (CELL_H + GAP);

  // ── Team header row ────────────────────────────────────────────────
  teams.forEach((team, i) => {
    const x = colX(i);
    const y = GAP;
    roundRect(ctx, x, y, CELL_W, HEADER_H, RADIUS);
    ctx.fillStyle = pal.headerFace;
    ctx.fill();
    if (highlightMine && team.id === myTeamId) {
      roundRect(ctx, x + 0.5, y + 0.5, CELL_W - 1, HEADER_H - 1, RADIUS);
      ctx.strokeStyle = pal.ring;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Avatar (or slot disc) + name, centered as a group in the cell, with the
    // name ellipsized if it's too long to fit.
    const inset = 6;
    const avSize = 16;
    const avGap = 5;
    const avY = y + (HEADER_H - avSize) / 2;
    const crown = team.is_prev_champion ? ' 🏆' : '';
    const label = anonymize ? `Slot ${team.draft_position}` : team.name;
    ctx.font = `600 11px ${FONT}`;
    const maxNameW = CELL_W - inset * 2 - avSize - avGap;
    const name = fitText(ctx, `${label}${crown}`, maxNameW);
    const nameW = ctx.measureText(name).width;
    const groupW = avSize + avGap + nameW;
    const startX = x + Math.max(inset, (CELL_W - groupW) / 2);

    if (anonymize) {
      ctx.save();
      roundRect(ctx, startX, avY, avSize, avSize, avSize / 2);
      ctx.fillStyle = pal.slotBg;
      ctx.fill();
      ctx.fillStyle = pal.textMuted;
      ctx.font = `800 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(team.draft_position), startX + avSize / 2, avY + avSize / 2 + 0.5);
      ctx.restore();
    } else {
      drawAvatar(ctx, avatarForTeam(team, members), startX, avY, avSize);
    }

    ctx.fillStyle = pal.text;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, startX + avSize + avGap, y + HEADER_H / 2 + 0.5);
  });

  // ── Round column + cells ───────────────────────────────────────────
  for (let r = 0; r < rounds; r++) {
    const round = r + 1;
    const y = rowY(r);
    const isCurrent = round === currentRound;

    // Round pill.
    roundRect(ctx, GAP, y, ROUND_COL_W, CELL_H, RADIUS);
    ctx.fillStyle = isCurrent ? ACCENT : pal.headerFace;
    ctx.fill();
    const roundInk = isCurrent ? ON_ACCENT : pal.textMuted;
    ctx.fillStyle = roundInk;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const arrow = draftType === 'SNAKE' ? (round % 2 === 1 ? '→' : '←') : '';
    const cx = GAP + ROUND_COL_W / 2;
    if (arrow) {
      ctx.font = `700 11px ${FONT}`;
      ctx.fillText(String(round), cx, y + CELL_H / 2 - 6);
      ctx.font = `800 11px ${FONT}`;
      ctx.globalAlpha = isCurrent ? 1 : 0.6;
      ctx.fillText(arrow, cx, y + CELL_H / 2 + 8);
      ctx.globalAlpha = 1;
    } else {
      ctx.font = `700 11px ${FONT}`;
      ctx.fillText(String(round), cx, y + CELL_H / 2);
    }

    teams.forEach((team, i) => {
      const x = colX(i);
      const pick = byCell.get(`${round}:${team.id}`);
      const player = pick ? playersById.get(pick.player_id) : undefined;

      if (!pick || !player) {
        // Empty slot.
        roundRect(ctx, x, y, CELL_W, CELL_H, RADIUS);
        ctx.fillStyle = pal.cellBg;
        ctx.fill();
        roundRect(ctx, x + 0.5, y + 0.5, CELL_W - 1, CELL_H - 1, RADIUS);
        ctx.strokeStyle = pal.border;
        ctx.lineWidth = 1;
        ctx.stroke();
        return;
      }

      // Filled pick — render in the viewer's selected cell style, with the same
      // keeper / comment / reaction corner flags the live board shows.
      const flags: CellFlags = {
        keeper: pick.is_keeper,
        comment: commentPickIds?.has(pick.id) ?? false,
        reaction: reactionPickIds?.has(pick.id) ?? false,
      };
      if (cellStyle === 'bold') drawBoldCell(ctx, x, y, pick, player, pal, flags);
      else if (cellStyle === 'clean') drawCleanCell(ctx, x, y, pick, player, pal, flags);
      else drawHybridCell(ctx, x, y, pick, player, pal, teamCount, flags);
    });
  }

  return canvas;
}
