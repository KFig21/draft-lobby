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

interface ExportOptions {
  lobbyName: string;
  picks: PickRow[];
  teamsById: Map<string, TeamRow>;
  playersById: Map<string, PlayerRow>;
}

const HEADERS = [
  'Overall',
  'Round',
  'Team',
  'Player',
  'Position',
  'NFL Team',
  'Bye',
  'Keeper',
];

function rows({ picks, teamsById, playersById }: ExportOptions): (string | number)[][] {
  return [...picks]
    .sort((a, b) => a.overall - b.overall)
    .map((p) => {
      const team = teamsById.get(p.team_id);
      const player = playersById.get(p.player_id);
      return [
        p.overall,
        p.round,
        team?.name ?? '',
        player?.name ?? '',
        player?.position ?? '',
        player?.nfl_team ?? '',
        player?.bye_week ?? '',
        p.is_keeper ? 'Yes' : '',
      ];
    });
}

/** Download the draft results as a CSV (opens directly in Excel and Sheets). */
export function exportDraftCsv(opts: ExportOptions): void {
  const lines = [HEADERS, ...rows(opts)].map((r) => r.map(csvCell).join(','));
  triggerDownload(lines.join('\n'), `${slugify(opts.lobbyName)}-draft.csv`, 'text/csv');
}

/**
 * Download the draft as an Excel-native file. Uses the SpreadsheetML 2003 (.xls)
 * XML format — no dependency, and Excel/Sheets open it as a real spreadsheet.
 */
export function exportDraftExcel(opts: ExportOptions): void {
  const esc = (v: string | number) =>
    String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cell = (v: string | number) => {
    const isNum = typeof v === 'number';
    return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${esc(v)}</Data></Cell>`;
  };
  const row = (cells: (string | number)[]) =>
    `<Row>${cells.map(cell).join('')}</Row>`;
  const body = [HEADERS, ...rows(opts)].map(row).join('');
  const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Draft"><Table>${body}</Table></Worksheet>
</Workbook>`;
  triggerDownload(
    xml,
    `${slugify(opts.lobbyName)}-draft.xls`,
    'application/vnd.ms-excel',
  );
}
