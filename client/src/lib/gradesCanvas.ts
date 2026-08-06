import { DRAFT_GRADE_COLORS, POSITION_COLORS, type DraftGrade, type Position } from '@draft-lobby/shared';
import { FONT, drawAvatar, fitText, roundRect, wrapLines } from './canvasKit';
import type { LeagueGrade, PickValue, TeamGradeCard } from './draftGradeExport';

/**
 * Deterministic PNG renderer for the shareable draft-grade cards — same
 * canvas-only approach as boardCanvas.ts (no html2canvas), so the output is
 * identical on every machine. Cards are a fixed portrait width and sized to
 * their content height, committed to the app's dark look for a consistent
 * share graphic. Type weights are kept on the lighter side (600–750) so the
 * dense stat content reads clean rather than chunky.
 *
 * Two modes: a single "all teams" summary card, or a full breakdown (a league
 * cover card + one card per team, in rank order).
 */

const CARD_W = 390;
const PAD = 22;
const FOOTER_H = 44; // rule + label + bottom padding below the content

// Dark share-card palette (committed, not theme-aware).
const TEXT = '#eef3f4';
const MUTED = '#8a94a6';
const FAINT = '#c3ccce';
const LINE = 'rgba(255,255,255,0.09)';
const PANEL = '#161d21';
const MINT = '#3fd6a5';
const REACH = '#f2793a';
const ON_GRADE = '#05231a'; // dark ink on a grade/position fill
const GOLD = '#f0b73e';

// Futura (italic) as a stylistic accent for per-player projected points; falls
// back to other geometric sans where Futura isn't installed.
const FUTURA = "Futura, 'Futura PT', 'Century Gothic', 'Trebuchet MS', sans-serif";

// MUI icon path data (24×24 viewBox), drawn as vectors so they're crisp and
// machine-independent — unlike emoji, which vary by OS font. Bolt = best pick /
// steal, TrendingUp = biggest reach, EmojiEvents (trophy) = crown votes.
const IC_BOLT = 'M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z';
const IC_TREND = 'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z';
const IC_TROPHY = 'M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z';

/** Draw an MUI 24×24 icon path scaled to `size`, filled with `color`. */
function drawIcon(ctx: CanvasRenderingContext2D, path: string, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(path));
  ctx.restore();
}

export interface GradeCard {
  key: string;
  label: string;
  canvas: HTMLCanvasElement;
}

type Align = CanvasTextAlign;
type Baseline = CanvasTextBaseline;

// A shared offscreen context for pre-layout text measurement (wrapping verdict
// comments to know a card's height before it's created).
const _measure = document.createElement('canvas').getContext('2d');

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

function gradeBadge(
  ctx: CanvasRenderingContext2D,
  grade: DraftGrade | null,
  x: number,
  y: number,
  size: number,
  fs?: number,
): void {
  roundRect(ctx, x, y, size, size, size * 0.3);
  ctx.fillStyle = grade ? DRAFT_GRADE_COLORS[grade] : 'rgba(255,255,255,0.08)';
  ctx.fill();
  text(ctx, grade ?? '—', x + size / 2, y + size / 2 + 0.5, `800 ${fs ?? Math.round(size * 0.46)}`, grade ? ON_GRADE : MUTED, 'center', 'middle');
}

function posPill(ctx: CanvasRenderingContext2D, pos: string, x: number, y: number, w = 34, h = 16): void {
  roundRect(ctx, x, y, w, h, 5);
  ctx.fillStyle = POSITION_COLORS[pos as Position] ?? '#8a94a6';
  ctx.fill();
  text(ctx, pos, x + w / 2, y + h / 2 + 0.5, '700 10', '#0b0f11', 'center', 'middle');
}

function num(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
}

/** Create a card canvas of the given content height and paint its background. */
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
  ctx.fillRect(0, 0, CARD_W, Math.min(H, 360));
  return { canvas, ctx };
}

function brandRow(ctx: CanvasRenderingContext2D, right: string): void {
  const y = 28;
  // Match the app favicon: mint rounded square + dark-teal trophy (EmojiEvents).
  roundRect(ctx, PAD, y - 11, 22, 22, 6);
  ctx.fillStyle = '#3fd6a5';
  ctx.fill();
  drawIcon(ctx, IC_TROPHY, PAD, y - 11, 22, '#106482');
  text(ctx, 'draft-lobby', PAD + 30, y + 1, '700 13', TEXT, 'left', 'middle');
  text(ctx, right, CARD_W - PAD, y + 1, '600 10.5', MUTED, 'right', 'middle', CARD_W * 0.52);
}

/** Eyebrow + league name + meta; returns the y content below should start at. */
function titleBlock(ctx: CanvasRenderingContext2D, eyebrow: string, name: string, meta: string): number {
  text(ctx, eyebrow, PAD, 60, '700 11', MINT);
  text(ctx, name, PAD, 88, '750 26', TEXT, 'left', 'alphabetic', CARD_W - PAD * 2);
  text(ctx, meta, PAD, 107, '500 11.5', MUTED, 'left', 'alphabetic', CARD_W - PAD * 2);
  return 124;
}

function footer(ctx: CanvasRenderingContext2D, H: number, left: string, right: string, leftIcon?: string): void {
  const y = H - 16;
  hline(ctx, PAD, H - 34, CARD_W - PAD);
  let lx = PAD;
  if (leftIcon) {
    drawIcon(ctx, leftIcon, PAD, y - 8, 14, GOLD);
    lx = PAD + 18;
  }
  text(ctx, left, lx, y, '500 10.5', MUTED, 'left', 'middle', CARD_W * 0.6);
  text(ctx, right, CARD_W - PAD, y, '500 10.5', MUTED, 'right', 'middle');
}

// ── Card 1: all teams on one page ──────────────────────────────────────
function renderAllTeams(model: LeagueGrade, scale: number): HTMLCanvasElement {
  const top = 124;
  const rowH = 45;
  const n = Math.max(1, model.teams.length);
  const H = Math.round(top + n * rowH + FOOTER_H);
  const { canvas, ctx } = beginCard(scale, H);
  brandRow(ctx, `${model.season} · Draft grades`);
  titleBlock(ctx, 'FINAL DRAFT GRADES', model.lobbyName, `${model.teamCount} teams · ${model.scoringLabel} · ${model.draftTypeLabel}`);

  model.teams.forEach((t, i) => {
    const y = top + i * rowH;
    const cy = y + rowH / 2;
    const lead = i === 0;
    if (lead) {
      roundRect(ctx, PAD - 6, y + 3, CARD_W - PAD * 2 + 12, rowH - 6, 10);
      ctx.fillStyle = 'rgba(63,214,165,0.12)';
      ctx.fill();
    } else {
      hline(ctx, PAD, y, CARD_W - PAD);
    }
    text(ctx, String(t.rank), PAD + 6, cy, '700 12', lead ? MINT : MUTED, 'center', 'middle');
    drawAvatar(ctx, t.avatar, PAD + 20, cy - 13, 26);
    const nameX = PAD + 54;
    text(ctx, t.team.name, nameX, cy - 5, '600 14', TEXT, 'left', 'middle', CARD_W - nameX - 96);
    text(ctx, t.ownerLabel, nameX, cy + 9, '500 11', MUTED, 'left', 'middle', CARD_W - nameX - 96);
    const badgeX = CARD_W - PAD - 28;
    gradeBadge(ctx, t.grade, badgeX, cy - 14, 28, 13);
    text(ctx, num(t.starterPoints), badgeX - 12, cy - 3, '600 12', TEXT, 'right', 'middle');
    text(ctx, 'PROJ', badgeX - 12, cy + 9, '600 8', MUTED, 'right', 'middle');
  });

  footer(ctx, H, `Best draft: ${model.championName}`, model.dateLabel, IC_TROPHY);
  return canvas;
}

// A reusable stat/callout box.
function statBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  labelColor: string,
  value: string,
  valueFont: string,
  valueColor: string,
  sub?: string,
  icon?: string,
): void {
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = PANEL;
  ctx.fill();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 12);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  let labelX = x + 14;
  if (icon) {
    drawIcon(ctx, icon, x + 14, y + 8, 12, labelColor);
    labelX = x + 14 + 16;
  }
  text(ctx, label, labelX, y + 18, '700 9.5', labelColor);
  text(ctx, value, x + 14, y + (sub ? 41 : 45), valueFont, valueColor, 'left', 'alphabetic', w - 28);
  if (sub) text(ctx, sub, x + 14, y + 57, '500 10', MUTED, 'left', 'alphabetic', w - 28);
}

// ── Card 2: league cover ───────────────────────────────────────────────
function renderLeague(model: LeagueGrade, scale: number): HTMLCanvasElement {
  const podiumTop = 140;
  const bigSize = 56;
  const podiumBottom = podiumTop + bigSize + 16 + 13 + 22 + 21;
  const statTop = podiumBottom + 16;
  const boxH = 66;
  // Callouts carry label + value + sub (statBox puts the sub at y+57), so they
  // need the same height as the stat boxes or the sub line spills out the bottom.
  const calloutH = 66;
  const gapY = 10; // vertical breathing room between stacked boxes
  const distLabelY = statTop + boxH + gapY + calloutH + gapY + calloutH + 24;
  const barsTop = distLabelY + 12;
  const barMax = 46;
  const distBottom = barsTop + barMax + 18;
  const H = Math.round(distBottom + FOOTER_H);

  const { canvas, ctx } = beginCard(scale, H);
  brandRow(ctx, 'Draft recap');
  titleBlock(ctx, `${model.season} SEASON`, model.lobbyName, `${model.teamCount} teams · ${model.scoringLabel} · ${model.draftTypeLabel} · ${model.rounds} rounds`);

  // Podium: 2 · 1 · 3
  const podium = [model.teams[1], model.teams[0], model.teams[2]];
  const centerX = CARD_W / 2;
  const gap = 116;
  const cols = [
    { x: centerX - gap, card: podium[0], size: 42 },
    { x: centerX, card: podium[1], size: bigSize, crown: true },
    { x: centerX + gap, card: podium[2], size: 42 },
  ];
  for (const col of cols) {
    if (!col.card) continue;
    const avY = podiumTop + (bigSize - col.size);
    if (col.crown) drawIcon(ctx, IC_TROPHY, col.x - 10, avY - 26, 20, GOLD);
    drawAvatar(ctx, col.card.avatar, col.x - col.size / 2, avY, col.size);
    const ny = podiumTop + bigSize + 16;
    text(ctx, col.card.team.name, col.x, ny, '600 11.5', TEXT, 'center', 'middle', 104);
    text(ctx, col.card.ownerLabel, col.x, ny + 13, '500 10', MUTED, 'center', 'middle', 104);
    gradeBadge(ctx, col.card.grade, col.x - 13, ny + 22, 26, 12);
    text(ctx, `#${col.card.rank}`, col.x, ny + 57, '700 10', MUTED, 'center', 'middle');
  }

  // Stat boxes
  const colW = (CARD_W - PAD * 2 - gapY) / 2;
  statBox(ctx, PAD, statTop, colW, boxH, 'LEAGUE AVG', MUTED, model.avgGrade ?? '—', '750 22', model.avgGrade ? DRAFT_GRADE_COLORS[model.avgGrade] : MUTED, 'across all rosters');
  statBox(ctx, PAD + colW + gapY, statTop, colW, boxH, 'TOP PROJECTION', MUTED, num(model.topProjection), '750 22', TEXT, model.championName);

  const fullW = CARD_W - PAD * 2;
  const stealY = statTop + boxH + gapY;
  if (model.leagueSteal) {
    const s = model.leagueSteal;
    statBox(ctx, PAD, stealY, fullW, calloutH, 'STEAL OF THE DRAFT', MINT, `${s.player.name} · ${s.player.position}`, '700 14', TEXT, `R${s.round} to ${s.team.name} — +${Math.max(0, s.valueRounds)} rds of value`, IC_BOLT);
  }
  const reachY = stealY + calloutH + gapY;
  if (model.leagueReach) {
    const r = model.leagueReach;
    statBox(ctx, PAD, reachY, fullW, calloutH, 'BIGGEST REACH', REACH, `${r.player.name} · ${r.player.position}`, '700 14', TEXT, `R${r.round} by ${r.team.name} — ${Math.abs(Math.min(0, r.valueRounds))} rds early`, IC_TREND);
  }

  // Grade distribution
  text(ctx, 'GRADE DISTRIBUTION', PAD, distLabelY, '700 9.5', MUTED);
  const colors: Record<string, string> = { A: '#3fd6a5', B: '#8bd23f', C: '#f6a642', D: '#f2793a', F: '#f8577d' };
  const maxCount = Math.max(1, ...model.distribution.map((d) => d.count));
  const bw = (CARD_W - PAD * 2 - 4 * 8) / 5;
  const baseY = barsTop + barMax;
  model.distribution.forEach((d, i) => {
    const x = PAD + i * (bw + 8);
    const h = d.count === 0 ? 4 : Math.round((d.count / maxCount) * barMax);
    roundRect(ctx, x, baseY - h, bw, h, 4);
    ctx.fillStyle = colors[d.letter];
    ctx.fill();
    text(ctx, String(d.count), x + bw / 2, baseY - h - 8, '700 10', TEXT, 'center', 'middle');
    text(ctx, d.letter, x + bw / 2, baseY + 12, '600 10', MUTED, 'center', 'middle');
  });

  footer(ctx, H, 'Swipe → for every team', model.dateLabel);
  return canvas;
}

// ── Card 3+: one team ──────────────────────────────────────────────────
function renderTeam(model: LeagueGrade, card: TeamGradeCard, scale: number): HTMLCanvasElement {
  const tint = DRAFT_GRADE_COLORS[card.grade];
  const hy = 50;
  const hh = 140;
  const hw = CARD_W - PAD * 2;

  // Lineup geometry.
  const starters = card.starters;
  const luLabelY = hy + hh + 26;
  const luTop = luLabelY + 12;
  const rowH = 30;
  const luBottom = luTop + starters.length * rowH;

  // Highlights.
  const hlY = luBottom + 12;
  const hlH = 50;

  // ── Verdict layout (measure up front so the card ends at the right height) ──
  const vY = hlY + hlH + 14;
  const blurbX = PAD + 44;
  const blurbW = CARD_W - PAD - blurbX;
  const commentEntries = card.peerGrades.filter((e) => e.comment).slice(0, 3);
  const moreCount = card.peerCount - commentEntries.length;
  const commentLines: string[][] = [];
  if (_measure) _measure.font = `italic 500 12px ${FONT}`;
  for (const e of commentEntries) {
    commentLines.push(_measure ? wrapLines(_measure, `“${e.comment}”`, blurbW, 2) : [`“${e.comment}”`]);
  }
  let vContent = 0;
  if (commentEntries.length) {
    commentEntries.forEach((_, i) => {
      vContent += commentLines[i].length * 15 + 15; // comment lines + attribution
    });
    if (moreCount > 0) vContent += 15;
  } else {
    vContent += 18; // single fallback line
  }
  const verdictH = Math.max(52, 14 + vContent);
  // Centered, grade-colored rank badge sits between the verdict and the footer.
  const rankBadgeH = 26;
  const rankBadgeY = vY + verdictH + 8;
  const H = Math.round(rankBadgeY + rankBadgeH + FOOTER_H);

  const { canvas, ctx } = beginCard(scale, H);
  brandRow(ctx, `${model.lobbyName} · ${model.season}`);

  // Hero panel
  const hx = PAD;
  roundRect(ctx, hx, hy, hw, hh, 16);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.save();
  roundRect(ctx, hx, hy, hw, hh, 16);
  ctx.clip();
  const glow = ctx.createRadialGradient(hx + hw * 0.86, hy - 10, 8, hx + hw * 0.86, hy - 10, 150);
  glow.addColorStop(0, tint);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = glow;
  ctx.fillRect(hx, hy, hw, hh);
  ctx.globalAlpha = 1;
  ctx.restore();
  roundRect(ctx, hx + 0.5, hy + 0.5, hw - 1, hh - 1, 16);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawAvatar(ctx, card.avatar, hx + 14, hy + 46, 40);
  text(ctx, card.team.name, hx + 64, hy + 62, '750 18', TEXT, 'left', 'alphabetic', hw - 64 - 66);
  text(ctx, card.ownerLabel, hx + 64, hy + 80, '500 11.5', MUTED, 'left', 'alphabetic', hw - 64 - 66);
  text(ctx, card.grade, hx + hw - 14, hy + 82, '800 42', tint, 'right', 'alphabetic');

  // metrics — extra gap below the name/avatar so the row doesn't crowd it
  const my = hy + 116;
  const metric = (x: number, value: string, lab: string) => {
    text(ctx, value, x, my, '750 19', TEXT, 'left', 'alphabetic');
    text(ctx, lab, x, my + 13, '600 9', MUTED, 'left', 'alphabetic');
  };
  metric(hx + 14, num(card.starterPoints), 'PROJ STARTER PTS');
  metric(hx + 150, `#${card.rank}`, 'LEAGUE RANK');
  // Crown votes — trophy icon + count (replaces the 👑 emoji).
  const cvX = hx + 250;
  drawIcon(ctx, IC_TROPHY, cvX, my - 16, 16, GOLD);
  text(ctx, String(card.crownVotes), cvX + 21, my, '750 19', TEXT, 'left', 'alphabetic');
  text(ctx, 'CROWN VOTES', cvX, my + 13, '600 9', MUTED, 'left', 'alphabetic');

  // Lineup
  text(ctx, 'OPTIMAL STARTING LINEUP', PAD, luLabelY, '700 9.5', MUTED);
  text(ctx, 'PROJ', CARD_W - PAD, luLabelY, '700 9.5', MUTED, 'right');
  starters.forEach((row, i) => {
    const y = luTop + i * rowH;
    const cy = y + rowH / 2;
    if (i > 0) hline(ctx, PAD, y, CARD_W - PAD);
    const slotLabel = row.slot === 'SUPERFLEX' ? 'SFLX' : row.slot;
    text(ctx, slotLabel, PAD + 15, cy, '700 9.5', MUTED, 'center', 'middle');
    if (row.player) {
      posPill(ctx, row.player.position, PAD + 34, cy - 8, 34, 16);
      const nameX = PAD + 76;
      text(ctx, row.player.name, nameX, cy - 5, '600 12.5', TEXT, 'left', 'middle', CARD_W - PAD - nameX - 44);
      text(ctx, row.player.nfl_team, nameX, cy + 9, '500 10', MUTED, 'left', 'middle');
      // Projected points in Futura italic. Futura's 'middle' baseline sits high,
      // so place the baseline explicitly to center the digits on the row.
      ctx.font = `italic 500 13.5px ${FUTURA}`;
      ctx.fillStyle = TEXT;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(num(row.player.proj_points ?? 0), CARD_W - PAD, cy + 4.5);
    } else {
      posPill(ctx, slotLabel.slice(0, 3), PAD + 34, cy - 8, 34, 16);
      text(ctx, 'Empty', PAD + 76, cy, '500 12', MUTED, 'left', 'middle');
      text(ctx, '—', CARD_W - PAD, cy, '600 12.5', MUTED, 'right', 'middle');
    }
  });

  // Highlights
  const colW = (CARD_W - PAD * 2 - 8) / 2;
  const hlBox = (x: number, labelColor: string, label: string, v: PickValue | null, sign: '+' | '-', icon: string) => {
    roundRect(ctx, x, hlY, colW, hlH, 11);
    ctx.fillStyle = 'rgba(255,255,255,0.015)';
    ctx.fill();
    roundRect(ctx, x + 0.5, hlY + 0.5, colW - 1, hlH - 1, 11);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.stroke();
    drawIcon(ctx, icon, x + 11, hlY + 6, 12, labelColor);
    text(ctx, label, x + 11 + 16, hlY + 15, '700 9', labelColor);
    if (v) {
      text(ctx, v.player.name, x + 11, hlY + 30, '600 12.5', TEXT, 'left', 'alphabetic', colW - 22);
      const rds = sign === '+' ? `+${Math.max(0, v.valueRounds)}` : `${Math.min(0, v.valueRounds)}`;
      text(ctx, `R${v.round} · ADP R${v.adpRound} · ${rds} rds`, x + 11, hlY + 43, '500 10', MUTED, 'left', 'alphabetic', colW - 22);
    } else {
      text(ctx, '—', x + 11, hlY + 32, '600 13', MUTED);
    }
  };
  hlBox(PAD, MINT, 'BEST PICK', card.bestPick, '+', IC_BOLT);
  hlBox(PAD + colW + 8, REACH, 'BIGGEST REACH', card.biggestReach, '-', IC_TREND);

  // Verdict — consensus badge on the left, peer comments (with attribution) stacked.
  hline(ctx, PAD, vY, CARD_W - PAD);
  gradeBadge(ctx, card.peerGrade, PAD, vY + 12, 30, 13);
  text(ctx, 'PEERS', PAD + 15, vY + 50, '700 8.5', MUTED, 'center', 'middle');
  if (commentEntries.length) {
    let ty = vY + 14;
    commentEntries.forEach((e, i) => {
      commentLines[i].forEach((ln, li) => {
        text(ctx, ln, blurbX, ty + 12 + li * 15, 'italic 500 12', FAINT, 'left', 'alphabetic');
      });
      ty += commentLines[i].length * 15;
      text(ctx, `— ${e.author ? `@${e.author}` : 'a leaguemate'} · graded ${e.grade}`, blurbX, ty + 12, '500 10', MUTED);
      ty += 15;
    });
    if (moreCount > 0) text(ctx, `+${moreCount} more grade${moreCount > 1 ? 's' : ''}`, blurbX, ty + 12, '500 10', MUTED);
  } else if (card.peerCount) {
    text(ctx, `Graded by ${card.peerCount} · consensus ${card.peerGrade ?? '—'}`, blurbX, vY + 28, 'italic 500 12', FAINT);
  } else {
    text(ctx, 'No peer grades in yet.', blurbX, vY + 28, 'italic 500 12', FAINT);
  }

  // Rank badge — centered, filled with the team's draft-grade color.
  const rankLabel = `#${card.rank} of ${model.teamCount}`;
  ctx.font = `800 11px ${FONT}`;
  const rbW = ctx.measureText(rankLabel).width + 28;
  roundRect(ctx, (CARD_W - rbW) / 2, rankBadgeY, rbW, rankBadgeH, 999);
  ctx.fillStyle = tint;
  ctx.fill();
  text(ctx, rankLabel, CARD_W / 2, rankBadgeY + rankBadgeH / 2 + 0.5, '800 11', ON_GRADE, 'center', 'middle');

  footer(ctx, H, model.lobbyName, model.dateLabel);
  return canvas;
}

/**
 * Render the export cards. `single` → one all-teams summary; `full` → a league
 * cover followed by one card per team (rank order). Caller downloads each.
 */
export function renderGradeCards(model: LeagueGrade, mode: 'single' | 'full', scale?: number): GradeCard[] {
  // A full breakdown renders N+1 large canvases at once, so cap its density at
  // 2× to bound memory on phones; the lone single-page card can afford 3×.
  const s = scale ?? (mode === 'single' ? 3 : 2);
  if (mode === 'single') {
    return [{ key: `${slug(model.lobbyName)}-grades`, label: 'All teams', canvas: renderAllTeams(model, s) }];
  }
  const cards: GradeCard[] = [
    { key: `${slug(model.lobbyName)}-league`, label: 'League', canvas: renderLeague(model, s) },
  ];
  model.teams.forEach((t, i) => {
    cards.push({
      key: `${slug(model.lobbyName)}-${String(i + 1).padStart(2, '0')}-${slug(t.team.name)}`,
      label: `#${t.rank} ${t.team.name}`,
      canvas: renderTeam(model, t, s),
    });
  });
  return cards;
}
