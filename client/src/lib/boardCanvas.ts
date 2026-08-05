import { POSITION_COLORS, type DraftType, type Position } from '@draft-lobby/shared';
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
 * The export renders the canonical "default" (Hybrid) cell look — a
 * position-colored cell with an abbreviated name, team/bye, and the
 * round.pick — regardless of the viewer's per-device cell-style preference,
 * and shows only made picks (no transient on-the-clock / skipped overlays).
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

// Draw a small vector padlock (keeper flag) centered in a keeper-gold chip.
function drawKeeperLock(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  keeper: string,
): void {
  const chip = 13;
  ctx.save();
  roundRect(ctx, cx - chip / 2, cy - chip / 2, chip, chip, chip / 2);
  ctx.fillStyle = keeper;
  ctx.fill();
  // padlock in a dark ink so it reads on the gold chip
  ctx.strokeStyle = '#1a1a1a';
  ctx.fillStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  // shackle
  ctx.beginPath();
  ctx.arc(cx, cy - 1.2, 2, Math.PI, 0);
  ctx.stroke();
  // body
  ctx.fillRect(cx - 3, cy - 1.2, 6, 4.4);
  ctx.restore();
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
  ctx.font = `${Math.round(size * 0.62)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Color emoji ignore fillStyle; this is only a fallback for monochrome glyphs.
  ctx.fillStyle = '#000';
  ctx.fillText(avatar.emoji, x + size / 2, y + size / 2 + size * 0.04);
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
    theme,
    anonymize,
    highlightMine,
  } = opts;
  const pal = PALETTES[theme];
  const pad = opts.padding ?? 16;
  const scale = opts.scale ?? Math.min(2, window.devicePixelRatio || 1);

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

    const inset = 8;
    const avSize = 16;
    const avY = y + (HEADER_H - avSize) / 2;
    let textX = x + inset;
    if (anonymize) {
      // Slot disc + "Slot N".
      ctx.save();
      roundRect(ctx, x + inset, avY, avSize, avSize, avSize / 2);
      ctx.fillStyle = pal.slotBg;
      ctx.fill();
      ctx.fillStyle = pal.textMuted;
      ctx.font = `800 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(team.draft_position), x + inset + avSize / 2, avY + avSize / 2 + 0.5);
      ctx.restore();
      textX = x + inset + avSize + 5;
    } else {
      drawAvatar(ctx, avatarForTeam(team, members), x + inset, avY, avSize);
      textX = x + inset + avSize + 5;
    }

    ctx.fillStyle = pal.text;
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const crown = team.is_prev_champion ? ' 🏆' : '';
    const label = anonymize ? `Slot ${team.draft_position}` : team.name;
    const maxTextW = x + CELL_W - inset - (textX - x);
    ctx.fillText(fitText(ctx, `${label}${crown}`, maxTextW), textX, y + HEADER_H / 2 + 0.5);
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

      // Filled pick — position-colored fill (Hybrid look).
      const posColor = POSITION_COLORS[player.position as Position] ?? pal.textMuted;
      roundRect(ctx, x, y, CELL_W, CELL_H, RADIUS);
      ctx.fillStyle = posColor;
      ctx.fill();
      if (pick.is_keeper) {
        // Keeper: inset gold outline (matches --keeper outline on the board).
        roundRect(ctx, x + 1, y + 1, CELL_W - 2, CELL_H - 2, RADIUS - 1);
        ctx.strokeStyle = pal.keeper;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      const tx = x + CELL_PAD;
      const maxW = CELL_W - CELL_PAD * 2;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // Name (abbreviated), bold black.
      ctx.fillStyle = '#000';
      ctx.font = `800 14px ${FONT}`;
      ctx.fillText(
        fitText(ctx, abbreviateName(player.name, player.position), maxW),
        tx,
        y + CELL_PAD + 13,
      );

      // Team · Bye.
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.font = `600 9px ${FONT}`;
      const bye = player.bye_week != null ? `  ·  Bye ${player.bye_week}` : '';
      ctx.fillText(fitText(ctx, `${player.nfl_team}${bye}`, maxW), tx, y + CELL_PAD + 27);

      // round.pick.
      const pickInRound = pick.overall - (pick.round - 1) * teamCount;
      ctx.fillText(formatRoundPick(pick.round, pickInRound, teamCount), tx, y + CELL_PAD + 39);

      if (pick.is_keeper) {
        drawKeeperLock(ctx, x + CELL_W - 10, y + CELL_H - 9, pal.keeper);
      }
    });
  }

  return canvas;
}
