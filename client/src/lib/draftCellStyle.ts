/** How a drafted pick renders on the draft board. 'bold' is meant for a big
 * screen viewed from across the room — a solid position-colored fill with
 * just the player's name, large. Per-device preference (not synced), same
 * pattern as toastPrefs. */
export type DraftCellStyle = 'default' | 'bold';

const STORAGE_KEY = 'draftCellStyle';

export function getDraftCellStyle(): DraftCellStyle {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'bold' ? 'bold' : 'default';
  } catch {
    return 'default';
  }
}

export function setDraftCellStyle(style: DraftCellStyle): void {
  localStorage.setItem(STORAGE_KEY, style);
}
