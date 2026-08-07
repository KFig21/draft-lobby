import {
  DRAFT_GRADE_COLORS,
  POSITION_COLORS,
  SLOT_LABELS,
  type DraftGrade,
  type Position,
} from '@draft-lobby/shared';
import { FONT, drawAvatar, fitText, roundRect } from './canvasKit';
import type { LineupRow } from './powerRankings';

/**
 * Deterministic PNG renderer for the "clean roster" share card — the same
 * canvas-only approach as boardCanvas / gradesCanvas (no html2canvas), so the
 * output is identical on every machine. A single portrait card: team header,
 * the optimal starting lineup, then the bench, committed to the app's dark
 * share look. Built on the canvasKit primitives; the small drawing helpers
 * mirror gradesCanvas so the two cards feel like one family.
 */

const CARD_W = 400;
const PAD = 24;
const ROW_H = 38;
const SEC_H = 30; // section header + underline space before the first row
const FOOTER_H = 46;

// Dark share-card palette (committed, not theme-aware) — matches gradesCanvas.
const TEXT = '#eef3f4';
const MUTED = '#8a94a6';
const FAINT = '#c3ccce';
const LINE = 'rgba(255,255,255,0.09)';
const OVERLAY = '#212a2f';
const MINT = '#3fd6a5';
const ON_GRADE = '#05231a';
const FUTURA = "Futura, 'Futura PT', 'Century Gothic', 'Trebuchet MS', sans-serif";

// EmojiEvents (trophy) path — drawn as a vector for the brand row so it's crisp
// and machine-independent.
const IC_TROPHY =
  'M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z';

const PROJ_DECIMAL_SCALE = 0.77;
const PROJ_RESERVE = 74; // width reserved at the right edge for the projection

type Align = CanvasTextAlign;
type Baseline = CanvasTextBaseline;

function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: Align = 'left',
  baseline: Baseline = 'alphabetic',
  maxW?: number,
): void {
  ctx.font = `${font}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(maxW ? fitText(ctx, str, maxW) : str, x, y);
}

function hline(ctx: CanvasRenderingContext2D, x1: number, y: number, x2: number): void {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y + 0.5);
  ctx.lineTo(x2, y + 0.5);
  ctx.stroke();
}

function drawIcon(ctx: CanvasRenderingContext2D, path: string, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(path));
  ctx.restore();
}

/** Projection with a smaller fractional part sharing the whole number's baseline. */
function drawProj(
  ctx: CanvasRenderingContext2D,
  value: number,
  x: number,
  y: number,
  intPx: number,
  color: string,
): void {
  const [intRaw, dec] = (Math.round(value * 10) / 10).toFixed(1).split('.');
  const intStr = Number(intRaw).toLocaleString('en-US');
  const decStr = `.${dec}`;
  const intFont = `italic 600 ${intPx}px ${FUTURA}`;
  const decFont = `italic 600 ${intPx * PROJ_DECIMAL_SCALE}px ${FUTURA}`;

  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.font = intFont;
  const im = ctx.measureText(intStr);
  const intW = im.width;
  ctx.font = decFont;
  const decW = ctx.measureText(decStr).width;
  const left = x - (intW + decW); // right-aligned to x
  const baseY = y + (im.actualBoundingBoxAscent - im.actualBoundingBoxDescent) / 2;
  ctx.textBaseline = 'alphabetic';
  ctx.font = intFont;
  ctx.fillText(intStr, left, baseY);
  ctx.font = decFont;
  ctx.fillText(decStr, left + intW, baseY);
}

function gradeBadge(ctx: CanvasRenderingContext2D, grade: DraftGrade, x: number, y: number, size: number): void {
  roundRect(ctx, x, y, size, size, size * 0.3);
  ctx.fillStyle = DRAFT_GRADE_COLORS[grade];
  ctx.fill();
  text(ctx, grade, x + size / 2, y + size / 2 + 0.5, `800 ${Math.round(size * 0.46)}`, ON_GRADE, 'center', 'middle');
}

function posPill(ctx: CanvasRenderingContext2D, pos: string, x: number, cy: number): void {
  const w = 30;
  const h = 16;
  roundRect(ctx, x, cy - h / 2, w, h, 5);
  ctx.fillStyle = POSITION_COLORS[pos as Position] ?? '#8a94a6';
  ctx.fill();
  text(ctx, pos, x + w / 2, cy + 0.5, '700 10', '#0b0f11', 'center', 'middle');
}

/** Create the card canvas and paint the shared dark background. */
function beginCard(scale: number, H: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(CARD_W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D drawing context');
  ctx.scale(scale, scale);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0d1214');
  g.addColorStop(1, '#0a0e10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, H);
  const rg = ctx.createRadialGradient(CARD_W * 0.5, -30, 20, CARD_W * 0.5, -30, 300);
  rg.addColorStop(0, 'rgba(19,58,55,0.8)');
  rg.addColorStop(1, 'rgba(19,58,55,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, CARD_W, Math.min(H, 340));
  return { canvas, ctx };
}

function brandRow(ctx: CanvasRenderingContext2D, right: string): void {
  const y = 28;
  roundRect(ctx, PAD, y - 11, 22, 22, 6);
  ctx.fillStyle = '#3fd6a5';
  ctx.fill();
  drawIcon(ctx, IC_TROPHY, PAD, y - 11, 22, '#106482');
  text(ctx, 'draft-lobby', PAD + 30, y + 1, '700 13', TEXT, 'left', 'middle');
  text(ctx, right, CARD_W - PAD, y + 1, '600 10.5', MUTED, 'right', 'middle', CARD_W * 0.5);
}

/** Section header (mint/muted tick + label, optional right text, underline).
 * Returns the y at which the first row should be drawn. */
function sectionHead(ctx: CanvasRenderingContext2D, top: number, label: string, tick: string, right?: string): number {
  roundRect(ctx, PAD, top, 4, 15, 2);
  ctx.fillStyle = tick;
  ctx.fill();
  text(ctx, label, PAD + 12, top + 8, '800 12', TEXT, 'left', 'middle');
  if (right) text(ctx, right, CARD_W - PAD, top + 8, '700 11', MUTED, 'right', 'middle');
  hline(ctx, PAD, top + 22, CARD_W - PAD);
  return top + SEC_H;
}

function posLabel(pos: string): string {
  return pos === 'DEF' ? 'D/ST' : pos;
}

/** One lineup row within [y, y + ROW_H]: slot chip, position pill, player +
 * NFL team (two lines), and the right-aligned projection. */
function rosterRow(ctx: CanvasRenderingContext2D, row: LineupRow, y: number, bench: boolean): void {
  const cy = y + ROW_H / 2;
  const chipW = 44;
  const chipH = 22;
  roundRect(ctx, PAD, cy - chipH / 2, chipW, chipH, 6);
  ctx.fillStyle = OVERLAY;
  ctx.fill();
  text(ctx, bench ? 'BN' : SLOT_LABELS[row.slot], PAD + chipW / 2, cy + 0.5, '800 11', MUTED, 'center', 'middle');

  const p = row.player;
  if (!p) {
    text(ctx, 'Empty', PAD + chipW + 12, cy, '600 13', MUTED, 'left', 'middle');
    text(ctx, '—', CARD_W - PAD, cy, '600 13', MUTED, 'right', 'middle');
    return;
  }

  posPill(ctx, posLabel(p.position), PAD + chipW + 10, cy);
  const nameX = PAD + chipW + 50;
  const nameMaxW = CARD_W - PAD - PROJ_RESERVE - nameX;
  const nameColor = bench ? FAINT : TEXT;
  text(ctx, p.name, nameX, cy - 5, '650 14', nameColor, 'left', 'alphabetic', nameMaxW);
  const nfl = p.position === 'DEF' ? `${p.nfl_team} D/ST` : p.nfl_team ?? '';
  text(ctx, nfl, nameX, cy + 10, '500 10.5', MUTED, 'left', 'alphabetic', nameMaxW);

  drawProj(ctx, p.proj_points ?? 0, CARD_W - PAD, cy, 15, bench ? FAINT : TEXT);
}

export interface RosterRenderOptions {
  teamName: string;
  ownerName: string | null;
  avatar: { bgColor: string; emoji: string; shape?: 'circle' | 'rounded' | 'square' };
  starters: LineupRow[];
  bench: LineupRow[];
  starterPoints: number;
  lobbyName: string;
  season: number;
  /** Short "scoring · draft type" line for the footer. */
  meta?: string;
  rank?: number;
  teamCount?: number;
  grade?: DraftGrade | null;
  scale?: number;
}

/** Render a single clean roster card. Height is derived from the roster size. */
export function renderRosterCard(o: RosterRenderOptions): HTMLCanvasElement {
  const scale = o.scale ?? 2;
  const headBottom = 120;
  const startersH = SEC_H + o.starters.length * ROW_H;
  const benchH = o.bench.length ? SEC_H + o.bench.length * ROW_H + 14 : 0;
  const H = Math.round(headBottom + startersH + benchH + FOOTER_H);

  const { canvas, ctx } = beginCard(scale, H);
  brandRow(ctx, `${o.season} · Roster`);

  // ── Header: avatar + name + owner, grade badge (+ rank) at the right ──
  drawAvatar(ctx, o.avatar, PAD, 46, 56);
  const hasBadge = !!o.grade;
  const badgeX = CARD_W - PAD - 40;
  if (o.grade) gradeBadge(ctx, o.grade, badgeX, 50, 40);
  if (o.rank && o.teamCount) {
    text(ctx, `#${o.rank} of ${o.teamCount}`, CARD_W - PAD, 104, '600 10.5', MUTED, 'right', 'alphabetic');
  }
  const nameX = PAD + 70;
  const nameMaxW = (hasBadge ? badgeX - 10 : CARD_W - PAD) - nameX;
  text(ctx, o.teamName, nameX, 72, '750 22', TEXT, 'left', 'alphabetic', nameMaxW);
  // ownerLabel is already formatted ("@username" / "Autodraft" / "Open seat").
  if (o.ownerName) text(ctx, o.ownerName, nameX, 94, '500 12', MUTED, 'left', 'alphabetic', nameMaxW);

  // ── Starting lineup ──
  let y = sectionHead(
    ctx,
    headBottom,
    'STARTING LINEUP',
    MINT,
    `${(Math.round(o.starterPoints * 10) / 10).toLocaleString('en-US')} PROJ PTS`,
  );
  for (const row of o.starters) {
    rosterRow(ctx, row, y, false);
    y += ROW_H;
  }

  // ── Bench ──
  if (o.bench.length) {
    y += 14;
    y = sectionHead(ctx, y, 'BENCH', MUTED);
    for (const row of o.bench) {
      rosterRow(ctx, row, y, true);
      y += ROW_H;
    }
  }

  // ── Footer ──
  hline(ctx, PAD, H - 32, CARD_W - PAD);
  text(ctx, o.meta ? `${o.lobbyName} · ${o.meta}` : o.lobbyName, PAD, H - 15, '500 10.5', MUTED, 'left', 'middle', CARD_W * 0.6);
  text(ctx, `${o.season} SEASON`, CARD_W - PAD, H - 15, '600 10.5', MUTED, 'right', 'middle');

  return canvas;
}
