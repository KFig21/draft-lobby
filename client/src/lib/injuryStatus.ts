/** Short badge letters for each injury designation. */
export const INJURY_ABBR: Record<string, string> = {
  QUESTIONABLE: 'Q',
  DOUBTFUL: 'D',
  OUT: 'O',
  IR: 'IR',
  SUSPENDED: 'SUS',
};

/** Mild (might still play) vs severe (not playing this week / long-term) —
 * drives the badge color (.injury-badge--warn / --danger in global.scss). */
export const INJURY_SEVERITY: Record<string, 'warn' | 'danger'> = {
  QUESTIONABLE: 'warn',
  DOUBTFUL: 'warn',
  OUT: 'danger',
  IR: 'danger',
  SUSPENDED: 'danger',
};
