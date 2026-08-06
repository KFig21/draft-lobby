import { DRAFT_GRADE_COLORS, POSITION_COLORS, type DraftGrade, type Position } from '@draft-lobby/shared';
import { FONT, drawAvatar, drawCenteredEmoji, fitText, roundRect, wrapLines } from './canvasKit';
import type { LeagueGrade, PickValue, TeamGradeCard } from './draftGradeExport';

/**
 * Deterministic PNG renderer for the shareable draft-grade cards — same
 * canvas-only approach as boardCanvas.ts (no html2canvas), so the output is
 * identical on every machine. Cards are portrait 9:16 (phone/story size),
 * committed to the app's dark look for a consistent share graphic.
 *
 * Two modes: a single "all teams" summary card, or a full breakdown (a league
 * cover card + one card per team, in rank order).
 */

const CARD_W = 390;
const CARD_H = 693; // 9:16
const PAD = 22;

// Dark share-card palette (committed, not theme-aware).
const TEXT = '#eef3f4';
const MUTED = '#8a94a6';
const FAINT = '#c3ccce';
const LINE = 'rgba(255,255,255,0.09)';
const PANEL = '#161d21';
const MINT = '#3fd6a5';
const REACH = '#f2793a';
const ON_GRADE = '#05231a'; // dark ink on a grade/position fill

export interface GradeCard {
  key: string;
  label: string;
  canvas: HTMLCanvasElement;
}

type Align = CanvasTextAlign;
type Baseline = CanvasTextBaseline;

/** Set font (`"<weight> <size>"`, px + app font appended), color, alignment,
 * and draw — optionally fitting to maxW. */
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
  text(ctx, grade ?? '—', x + size / 2, y + size / 2 + 0.5, `900 ${fs ?? Math.round(size * 0.48)}`, grade ? ON_GRADE : MUTED, 'center', 'middle');
}

function posPill(ctx: CanvasRenderingContext2D, pos: string, x: number, y: number, w = 34, h = 16): void {
  roundRect(ctx, x, y, w, h, 5);
  ctx.fillStyle = POSITION_COLORS[pos as Position] ?? '#8a94a6';
  ctx.fill();
  text(ctx, pos, x + w / 2, y + h / 2 + 0.5, '800 10', '#0b0f11', 'center', 'middle');
}

function num(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
}

function beginCard(scale: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(CARD_W * scale);
  canvas.height = Math.round(CARD_H * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D drawing context');
  ctx.scale(scale, scale);
  const g = ctx.createLinearGradient(0, 0, 0, CARD_H);
  g.addColorStop(0, '#0d1214');
  g.addColorStop(1, '#0a0e10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const rg = ctx.createRadialGradient(CARD_W * 0.5, -30, 20, CARD_W * 0.5, -30, 300);
  rg.addColorStop(0, 'rgba(19,58,55,0.85)');
  rg.addColorStop(1, 'rgba(19,58,55,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  return { canvas, ctx };
}

function brandRow(ctx: CanvasRenderingContext2D, right: string): void {
  const y = 28;
  roundRect(ctx, PAD, y - 11, 22, 22, 7);
  const gg = ctx.createLinearGradient(PAD, y - 11, PAD + 22, y + 11);
  gg.addColorStop(0, '#137a83');
  gg.addColorStop(1, '#3fd6a5');
  ctx.fillStyle = gg;
  ctx.fill();
  drawCenteredEmoji(ctx, '🏈', PAD + 11, y, 13);
  text(ctx, 'draft-lobby', PAD + 30, y + 1, '800 13', TEXT, 'left', 'middle');
  text(ctx, right, CARD_W - PAD, y + 1, '700 10.5', MUTED, 'right', 'middle', CARD_W * 0.52);
}

function footer(ctx: CanvasRenderingContext2D, left: string, right: string): void {
  const y = CARD_H - 22;
  hline(ctx, PAD, y - 14, CARD_W - PAD);
  text(ctx, left, PAD, y, '600 10.5', MUTED, 'left', 'middle', CARD_W * 0.6);
  text(ctx, right, CARD_W - PAD, y, '600 10.5', MUTED, 'right', 'middle');
}

// ── Card 1: all teams on one page ──────────────────────────────────────
function renderAllTeams(model: LeagueGrade, scale: number): HTMLCanvasElement {
  const { canvas, ctx } = beginCard(scale);
  brandRow(ctx, `${model.season} · Draft grades`);
  text(ctx, 'FINAL DRAFT GRADES', PAD, 60, '800 11', MINT);
  text(ctx, model.lobbyName, PAD, 88, '850 27', TEXT, 'left', 'alphabetic', CARD_W - PAD * 2);
  text(ctx, `${model.teamCount} teams · ${model.scoringLabel} · ${model.draftTypeLabel}`, PAD, 107, '600 11.5', MUTED, 'left', 'alphabetic', CARD_W - PAD * 2);

  const top = 124;
  const bottom = CARD_H - 46;
  const n = Math.max(1, model.teams.length);
  const rowH = Math.min(46, (bottom - top) / n);

  model.teams.forEach((t, i) => {
    const y = top + i * rowH;
    const cy = y + rowH / 2;
    const lead = i === 0;
    if (lead) {
      roundRect(ctx, PAD - 6, y + 3, CARD_W - PAD * 2 + 12, rowH - 6, 10);
      ctx.fillStyle = 'rgba(63,214,165,0.13)';
      ctx.fill();
    } else {
      hline(ctx, PAD, y, CARD_W - PAD);
    }
    text(ctx, String(t.rank), PAD + 6, cy, '800 12', lead ? MINT : MUTED, 'center', 'middle');
    drawAvatar(ctx, t.avatar, PAD + 20, cy - 13, 26);
    const nameX = PAD + 54;
    text(ctx, t.team.name, nameX, cy - 5, '750 13.5', TEXT, 'left', 'middle', CARD_W - nameX - 96);
    text(ctx, t.ownerLabel, nameX, cy + 9, '600 11', MUTED, 'left', 'middle', CARD_W - nameX - 96);
    const badgeX = CARD_W - PAD - 28;
    gradeBadge(ctx, t.grade, badgeX, cy - 14, 28, 13);
    text(ctx, num(t.starterPoints), badgeX - 12, cy - 3, '700 12', TEXT, 'right', 'middle');
    text(ctx, 'PROJ', badgeX - 12, cy + 9, '700 8', MUTED, 'right', 'middle');
  });

  footer(ctx, `🏆 Best draft: ${model.championName}`, model.dateLabel);
  return canvas;
}

// ── Card 2: league cover ───────────────────────────────────────────────
function renderLeague(model: LeagueGrade, scale: number): HTMLCanvasElement {
  const { canvas, ctx } = beginCard(scale);
  brandRow(ctx, 'Draft recap');
  text(ctx, `${model.season} SEASON`, PAD, 60, '800 11', MINT);
  text(ctx, model.lobbyName, PAD, 88, '850 27', TEXT, 'left', 'alphabetic', CARD_W - PAD * 2);
  text(ctx, `${model.teamCount} teams · ${model.scoringLabel} · ${model.draftTypeLabel} · ${model.rounds} rounds`, PAD, 107, '600 11.5', MUTED, 'left', 'alphabetic', CARD_W - PAD * 2);

  // Podium: 2 · 1 · 3
  const podium = [model.teams[1], model.teams[0], model.teams[2]];
  const centerX = CARD_W / 2;
  const gap = 116;
  const cols = [
    { x: centerX - gap, card: podium[0], size: 42, crown: false },
    { x: centerX, card: podium[1], size: 56, crown: true },
    { x: centerX + gap, card: podium[2], size: 42, crown: false },
  ];
  const topY = 150;
  for (const col of cols) {
    if (!col.card) continue;
    if (col.crown) drawCenteredEmoji(ctx, '👑', col.x, topY - 12, 18);
    drawAvatar(ctx, col.card.avatar, col.x - col.size / 2, topY, col.size);
    const ny = topY + col.size + 16;
    text(ctx, col.card.team.name, col.x, ny, '750 11.5', TEXT, 'center', 'middle', 104);
    text(ctx, col.card.ownerLabel, col.x, ny + 13, '600 10', MUTED, 'center', 'middle', 104);
    gradeBadge(ctx, col.card.grade, col.x - 13, ny + 22, 26, 12);
    text(ctx, `#${col.card.rank}`, col.x, ny + 52, '800 10', MUTED, 'center', 'middle');
  }

  // Stat boxes
  const colW = (CARD_W - PAD * 2 - 8) / 2;
  const g1Top = 314;
  const boxH = 58;
  const statBox = (x: number, y: number, w: number, h: number, label: string, labelColor: string, value: string, valueFont: string, valueColor: string, sub?: string) => {
    roundRect(ctx, x, y, w, h, 12);
    ctx.fillStyle = PANEL;
    ctx.fill();
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 12);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, label, x + 12, y + 16, '800 9.5', labelColor);
    text(ctx, value, x + 12, y + (sub ? 36 : 40), valueFont, valueColor, 'left', 'alphabetic', w - 24);
    if (sub) text(ctx, sub, x + 12, y + 50, '600 10', MUTED, 'left', 'alphabetic', w - 24);
  };

  statBox(PAD, g1Top, colW, boxH, 'LEAGUE AVG', MUTED, model.avgGrade ?? '—', '850 22', model.avgGrade ? DRAFT_GRADE_COLORS[model.avgGrade] : MUTED, 'across all rosters');
  statBox(PAD + colW + 8, g1Top, colW, boxH, 'TOP PROJECTION', MUTED, num(model.topProjection), '850 22', TEXT, model.championName);

  const stealY = g1Top + boxH + 8;
  const fullW = CARD_W - PAD * 2;
  if (model.leagueSteal) {
    const s = model.leagueSteal;
    statBox(PAD, stealY, fullW, 46, '🥷 STEAL OF THE DRAFT', MINT, `${s.player.name} · ${s.player.position}`, '800 14', TEXT, `R${s.round} to ${s.team.name} — +${Math.max(0, s.valueRounds)} rds of value`);
  }
  const reachY = stealY + 54;
  if (model.leagueReach) {
    const r = model.leagueReach;
    statBox(PAD, reachY, fullW, 46, '📈 BIGGEST REACH', REACH, `${r.player.name} · ${r.player.position}`, '800 14', TEXT, `R${r.round} by ${r.team.name} — ${Math.abs(Math.min(0, r.valueRounds))} rds early`);
  }

  // Grade distribution
  const distTop = reachY + 68;
  text(ctx, 'GRADE DISTRIBUTION', PAD, distTop, '800 9.5', MUTED);
  const colors: Record<string, string> = { A: '#3fd6a5', B: '#8bd23f', C: '#f6a642', D: '#f2793a', F: '#f8577d' };
  const maxCount = Math.max(1, ...model.distribution.map((d) => d.count));
  const barMax = 46;
  const bw = (CARD_W - PAD * 2 - 4 * 8) / 5;
  const baseY = distTop + 16 + barMax;
  model.distribution.forEach((d, i) => {
    const x = PAD + i * (bw + 8);
    const h = d.count === 0 ? 4 : Math.round((d.count / maxCount) * barMax);
    roundRect(ctx, x, baseY - h, bw, h, 4);
    ctx.fillStyle = colors[d.letter];
    ctx.fill();
    text(ctx, String(d.count), x + bw / 2, baseY - h - 8, '800 10', TEXT, 'center', 'middle');
    text(ctx, d.letter, x + bw / 2, baseY + 12, '800 10', MUTED, 'center', 'middle');
  });

  footer(ctx, 'Swipe → for every team', model.dateLabel);
  return canvas;
}

// ── Card 3+: one team ──────────────────────────────────────────────────
function renderTeam(model: LeagueGrade, card: TeamGradeCard, scale: number): HTMLCanvasElement {
  const { canvas, ctx } = beginCard(scale);
  brandRow(ctx, `${model.lobbyName} · ${model.season}`);
  const tint = DRAFT_GRADE_COLORS[card.grade];

  // Hero panel
  const hx = PAD;
  const hy = 50;
  const hw = CARD_W - PAD * 2;
  const hh = 120;
  roundRect(ctx, hx, hy, hw, hh, 16);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.save();
  roundRect(ctx, hx, hy, hw, hh, 16);
  ctx.clip();
  const glow = ctx.createRadialGradient(hx + hw * 0.86, hy - 10, 8, hx + hw * 0.86, hy - 10, 150);
  glow.addColorStop(0, tint);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = glow;
  ctx.fillRect(hx, hy, hw, hh);
  ctx.globalAlpha = 1;
  ctx.restore();
  roundRect(ctx, hx + 0.5, hy + 0.5, hw - 1, hh - 1, 16);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.stroke();

  // rank pill
  ctx.font = `800 10px ${FONT}`;
  const rankLabel = `#${card.rank} of ${model.teamCount}`;
  const lw = ctx.measureText(rankLabel).width + 18;
  roundRect(ctx, hx + 14, hy + 12, lw, 20, 999);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  text(ctx, rankLabel, hx + 14 + lw / 2, hy + 22, '800 10', MUTED, 'center', 'middle');

  drawAvatar(ctx, card.avatar, hx + 14, hy + 44, 40);
  text(ctx, card.team.name, hx + 64, hy + 60, '800 18', TEXT, 'left', 'alphabetic', hw - 64 - 70);
  text(ctx, card.ownerLabel, hx + 64, hy + 78, '600 11.5', MUTED, 'left', 'alphabetic', hw - 64 - 70);
  text(ctx, card.grade, hx + hw - 14, hy + 80, '900 46', tint, 'right', 'alphabetic');

  // metrics
  const my = hy + 100;
  const metric = (x: number, value: string, lab: string) => {
    text(ctx, value, x, my, '850 19', TEXT, 'left', 'alphabetic');
    text(ctx, lab, x, my + 13, '800 9', MUTED, 'left', 'alphabetic');
  };
  metric(hx + 14, num(card.starterPoints), 'PROJ STARTER PTS');
  metric(hx + 150, `#${card.rank}`, 'LEAGUE RANK');
  metric(hx + 250, `👑 ${card.crownVotes}`, 'CROWN VOTES');

  // Lineup
  const luLabelY = hy + hh + 26;
  text(ctx, 'OPTIMAL STARTING LINEUP', PAD, luLabelY, '800 9.5', MUTED);
  text(ctx, 'PROJ', CARD_W - PAD, luLabelY, '800 9.5', MUTED, 'right');

  const starters = card.starters;
  const luTop = luLabelY + 12;
  const luBudget = 232;
  const rowH = Math.min(28, luBudget / Math.max(1, starters.length));
  starters.forEach((row, i) => {
    const y = luTop + i * rowH;
    const cy = y + rowH / 2;
    if (i > 0) hline(ctx, PAD, y, CARD_W - PAD);
    text(ctx, row.slot === 'SUPERFLEX' ? 'SFLX' : row.slot, PAD + 15, cy, '800 9.5', MUTED, 'center', 'middle');
    const pos = row.player?.position ?? row.slot;
    posPill(ctx, pos.length > 3 ? row.slot.slice(0, 3) : pos, PAD + 34, cy - 8, 34, 16);
    if (row.player) {
      const nameX = PAD + 76;
      text(ctx, row.player.name, nameX, cy - 4, '700 12.5', TEXT, 'left', 'middle', CARD_W - PAD - nameX - 44);
      text(ctx, row.player.nfl_team, nameX, cy + 8, '600 10', MUTED, 'left', 'middle');
      text(ctx, num(row.player.proj_points ?? 0), CARD_W - PAD, cy, '750 12.5', TEXT, 'right', 'middle');
    } else {
      text(ctx, 'Empty', PAD + 76, cy, '600 12', MUTED, 'left', 'middle');
      text(ctx, '—', CARD_W - PAD, cy, '750 12.5', MUTED, 'right', 'middle');
    }
  });

  // Highlights
  const hlY = luTop + starters.length * rowH + 12;
  const colW = (CARD_W - PAD * 2 - 8) / 2;
  const hlBox = (x: number, labelColor: string, label: string, v: PickValue | null, sign: '+' | '-') => {
    roundRect(ctx, x, hlY, colW, 50, 11);
    ctx.fillStyle = 'rgba(255,255,255,0.015)';
    ctx.fill();
    roundRect(ctx, x + 0.5, hlY + 0.5, colW - 1, 49, 11);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, label, x + 11, hlY + 15, '800 9', labelColor);
    if (v) {
      text(ctx, v.player.name, x + 11, hlY + 30, '750 12.5', TEXT, 'left', 'alphabetic', colW - 22);
      const rds = sign === '+' ? `+${Math.max(0, v.valueRounds)}` : `${Math.min(0, v.valueRounds)}`;
      text(ctx, `R${v.round} · ADP R${v.adpRound} · ${rds} rds`, x + 11, hlY + 43, '600 10', MUTED, 'left', 'alphabetic', colW - 22);
    } else {
      text(ctx, '—', x + 11, hlY + 32, '750 13', MUTED);
    }
  };
  hlBox(PAD, MINT, '🥷 BEST PICK', card.bestPick, '+');
  hlBox(PAD + colW + 8, REACH, '📈 BIGGEST REACH', card.biggestReach, '-');

  // Verdict
  const vY = hlY + 62;
  hline(ctx, PAD, vY, CARD_W - PAD);
  gradeBadge(ctx, card.peerGrade, PAD, vY + 12, 30, 13);
  text(ctx, 'PEERS', PAD + 15, vY + 50, '800 8.5', MUTED, 'center', 'middle');
  const blurbX = PAD + 44;
  const blurbW = CARD_W - PAD - blurbX;
  let blurb: string;
  if (card.peerComment) blurb = `“${card.peerComment}”`;
  else if (card.peerGrade) blurb = `Peers graded this roster ${card.peerGrade}${card.crownVotes ? ` · ${card.crownVotes} crown vote${card.crownVotes > 1 ? 's' : ''}` : ''}.`;
  else blurb = 'No peer grades in yet.';
  ctx.font = `italic 600 12px ${FONT}`;
  const lines = wrapLines(ctx, blurb, blurbW, 3);
  lines.forEach((ln, i) => {
    text(ctx, ln, blurbX, vY + 24 + i * 16, 'italic 600 12', FAINT, 'left', 'alphabetic');
  });

  footer(ctx, model.lobbyName, model.dateLabel);
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
