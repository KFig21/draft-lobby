/** How a row in the draft pool's player list is laid out. 'comfy' is the
 * default roomy card (position, name, a second line of team/bye, projection +
 * ADP, marks in their own column). 'compact' drops the second line and ADP and
 * tucks the queue/favorite marks right after the name, so more players fit on
 * screen at once. Per-device preference (not synced), same pattern as
 * draftCellStyle / toastPrefs. */
export type PlayerCardStyle = 'comfy' | 'compact';

const STORAGE_KEY = 'playerCardStyle';
const VALID_STYLES: PlayerCardStyle[] = ['comfy', 'compact'];

export function getPlayerCardStyle(): PlayerCardStyle {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (VALID_STYLES as string[]).includes(stored ?? '')
      ? (stored as PlayerCardStyle)
      : 'comfy';
  } catch {
    return 'comfy';
  }
}

export function setPlayerCardStyle(style: PlayerCardStyle): void {
  localStorage.setItem(STORAGE_KEY, style);
}
