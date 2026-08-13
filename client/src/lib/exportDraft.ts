import type { PickRow, PlayerRow, TeamRow } from './types';

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  // Quote if it contains a comma, quote, or newline.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function triggerDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'draft';
}

export interface ExportOptions {
  lobbyName: string;
  picks: PickRow[];
  teamsById: Map<string, TeamRow>;
  playersById: Map<string, PlayerRow>;
  /** Whether the league runs keepers — drops the Keeper column/field when off. */
  keepers: boolean;
}

export type ExportFormat = 'csv' | 'xls' | 'json';

/** A built export's file content plus its name and MIME — enough to preview,
 * copy, or download it. */
export interface BuiltExport {
  content: string;
  filename: string;
  mime: string;
}

/** One drafted player, resolved from a pick + the player it landed. */
interface ExportPlayer {
  overall: number;
  round: number;
  name: string;
  position: string;
  nflTeam: string;
  byeWeek: number | null;
  isKeeper: boolean;
}

/** A team and the players it drafted, in round order. */
interface ExportTeam {
  team: TeamRow;
  players: ExportPlayer[];
}

/** Per-team column headers, shared by the CSV and Excel exports. The Keeper
 * column is only included when the league runs keepers. */
function teamHeaders(keepers: boolean): string[] {
  const h = ['Round', 'Player', 'Pos', 'Team', 'Bye'];
  if (keepers) h.push('Keeper');
  return h;
}

/**
 * Regroup the flat pick list into one bucket per team, ordered by draft slot,
 * with each team's picks sorted into round order. This is the shared shape the
 * three "by team" exporters render — a team-first view rather than the old
 * pick-by-pick log.
 */
function groupByTeam({ picks, teamsById, playersById }: ExportOptions): ExportTeam[] {
  const teams = [...teamsById.values()].sort((a, b) => a.draft_position - b.draft_position);
  const byTeam = new Map<string, ExportPlayer[]>();
  for (const t of teams) byTeam.set(t.id, []);
  for (const p of [...picks].sort((a, b) => a.overall - b.overall)) {
    const bucket = byTeam.get(p.team_id);
    if (!bucket) continue;
    const player = playersById.get(p.player_id);
    bucket.push({
      overall: p.overall,
      round: p.round,
      name: player?.name ?? '',
      position: player?.position ?? '',
      nflTeam: player?.nfl_team ?? '',
      byeWeek: player?.bye_week ?? null,
      isKeeper: p.is_keeper,
    });
  }
  return teams.map((t) => ({ team: t, players: byTeam.get(t.id) ?? [] }));
}

/** A player's tabular (string/number) cells for CSV + Excel. */
function playerCells(pl: ExportPlayer, keepers: boolean): (string | number)[] {
  const c: (string | number)[] = [pl.round, pl.name, pl.position, pl.nflTeam, pl.byeWeek ?? ''];
  if (keepers) c.push(pl.isKeeper ? 'Yes' : '');
  return c;
}

/**
 * The draft as CSV text: one team block after another going down the file (team
 * name, a header row, then that team's picks, then a blank line). Opens directly
 * in Excel and Sheets.
 */
function buildCsv(opts: ExportOptions): string {
  const header = teamHeaders(opts.keepers);
  const lines: string[] = [];
  groupByTeam(opts).forEach((t, i) => {
    if (i > 0) lines.push('');
    lines.push(csvCell(t.team.name));
    lines.push(header.map(csvCell).join(','));
    for (const pl of t.players) lines.push(playerCells(pl, opts.keepers).map(csvCell).join(','));
  });
  return lines.join('\n');
}

/**
 * The draft as an Excel-native (.xls) document with each team laid out as its own
 * block of columns side by side (scroll horizontally across teams). Uses the
 * SpreadsheetML 2003 XML format — no dependency, and Excel/Sheets open it as a
 * real spreadsheet.
 */
function buildXls(opts: ExportOptions): string {
  const teams = groupByTeam(opts);
  const headers = teamHeaders(opts.keepers);
  const esc = (v: string | number) =>
    String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cell = (v: string | number, style?: string) => {
    const isNum = typeof v === 'number';
    const attr = style ? ` ss:StyleID="${style}"` : '';
    return `<Cell${attr}><Data ss:Type="${isNum ? 'Number' : 'String'}">${esc(v)}</Data></Cell>`;
  };
  const empty = '<Cell/>'; // blank cell (also used for the spacer column)

  const BLOCK = headers.length; // columns per team
  const stride = BLOCK + 1; // team block + one spacer column between teams

  // Column widths, left to right: one block per team, a narrow spacer between.
  // (Round, Player, Pos, Team, Bye[, Keeper]) — the Keeper width only when on.
  const blockWidths = [42, 150, 40, 46, 40, ...(opts.keepers ? [52] : [])];
  const columns: string[] = [];
  teams.forEach((_, i) => {
    for (const w of blockWidths) columns.push(`<Column ss:Width="${w}"/>`);
    if (i < teams.length - 1) columns.push('<Column ss:Width="16"/>');
  });

  // Row 1 — team names, each merged across its block. MergeAcross doesn't
  // advance the column cursor past the span, so pin each name with ss:Index.
  const titleRow = teams
    .map((t, i) => {
      const idx = i === 0 ? '' : ` ss:Index="${i * stride + 1}"`;
      return `<Cell${idx} ss:MergeAcross="${BLOCK - 1}" ss:StyleID="title"><Data ss:Type="String">${esc(
        t.team.name,
      )}</Data></Cell>`;
    })
    .join('');

  // Row 2 — the per-team column headers, repeated across every block.
  const headRow = teams.map(() => headers.map((h) => cell(h, 'head')).join('')).join(empty);

  // Data rows — the i-th pick of each team on one row; pad short teams blank.
  const maxLen = teams.reduce((m, t) => Math.max(m, t.players.length), 0);
  const dataRows: string[] = [];
  for (let i = 0; i < maxLen; i++) {
    const cells = teams
      .map((t) => {
        const pl = t.players[i];
        if (!pl) return empty.repeat(BLOCK);
        return (
          cell(pl.round) +
          cell(pl.name, pl.isKeeper ? 'keep' : undefined) +
          cell(pl.position) +
          cell(pl.nflTeam) +
          cell(pl.byeWeek ?? '') +
          (opts.keepers ? cell(pl.isKeeper ? 'K' : '') : '')
        );
      })
      .join(empty);
    dataRows.push(`<Row>${cells}</Row>`);
  }

  const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="title"><Font ss:Bold="1" ss:Size="12" ss:Color="#FFFFFF"/><Interior ss:Color="#137A83" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>
  <Style ss:ID="head"><Font ss:Bold="1"/><Interior ss:Color="#E4E9EC" ss:Pattern="Solid"/></Style>
  <Style ss:ID="keep"><Font ss:Italic="1" ss:Color="#137A83"/></Style>
 </Styles>
 <Worksheet ss:Name="Teams"><Table>${columns.join('')}<Row>${titleRow}</Row><Row>${headRow}</Row>${dataRows.join(
   '',
 )}</Table></Worksheet>
</Workbook>`;
  return xml;
}

/**
 * The draft as JSON — one object per team, each holding an array of its drafted
 * players as objects. Meant for feeding into another tool/script, so it uses real
 * types (numbers, a boolean for isKeeper, null for a missing bye) rather than the
 * display-formatted strings CSV/Excel use.
 */
function buildJson(opts: ExportOptions): string {
  const data = groupByTeam(opts).map((t) => ({
    team: t.team.name,
    draftPosition: t.team.draft_position,
    players: t.players.map((pl) => ({
      overall: pl.overall,
      round: pl.round,
      name: pl.name,
      position: pl.position,
      nflTeam: pl.nflTeam,
      byeWeek: pl.byeWeek,
      // Keeper flag only when the league runs keepers (matches CSV/Excel).
      ...(opts.keepers ? { isKeeper: pl.isKeeper } : {}),
    })),
  }));
  return JSON.stringify(data, null, 2);
}

/**
 * Build a draft export's file content, name, and MIME — WITHOUT downloading — so
 * a preview modal can show it, copy it, and download it on demand.
 */
export function buildDraftExport(format: ExportFormat, opts: ExportOptions): BuiltExport {
  const base = `${slugify(opts.lobbyName)}-teams`;
  if (format === 'csv') return { content: buildCsv(opts), filename: `${base}.csv`, mime: 'text/csv' };
  if (format === 'xls')
    return { content: buildXls(opts), filename: `${base}.xls`, mime: 'application/vnd.ms-excel' };
  return { content: buildJson(opts), filename: `${base}.json`, mime: 'application/json' };
}

/** Trigger the browser download for an already-built export. */
export function downloadDraftExport(b: BuiltExport): void {
  triggerDownload(b.content, b.filename, b.mime);
}

/** Download a canvas as a PNG under `filename` (no extension needed). */
export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve();
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}

/** Save a captured board screenshot canvas as a PNG download. */
export function downloadBoardScreenshot(
  canvas: HTMLCanvasElement,
  lobbyName: string,
  anonymized: boolean,
): void {
  void downloadCanvasPng(canvas, `${slugify(lobbyName)}-board${anonymized ? '-anonymized' : ''}`);
}
