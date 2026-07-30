/** How a drafted pick renders on the draft board. 'bold' is meant for a big
 * screen viewed from across the room — a solid position-colored fill with
 * just the player's name, large. 'hybrid' keeps that same position-colored
 * fill but lays it out for reading up close: an abbreviated name pinned to
 * the top corner with position/team/bye underneath. Per-device preference
 * (not synced), same pattern as toastPrefs. */
export type DraftCellStyle = 'default' | 'bold' | 'hybrid';

const STORAGE_KEY = 'draftCellStyle';
const VALID_STYLES: DraftCellStyle[] = ['default', 'bold', 'hybrid'];

export function getDraftCellStyle(): DraftCellStyle {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (VALID_STYLES as string[]).includes(stored ?? '')
      ? (stored as DraftCellStyle)
      : 'default';
  } catch {
    return 'default';
  }
}

export function setDraftCellStyle(style: DraftCellStyle): void {
  localStorage.setItem(STORAGE_KEY, style);
}

/** Whether comment/reaction indicators show on drafted cells on the board —
 * per-device preference (not synced), same pattern as the cell style above.
 * Reactions/comments still work everywhere else (pick modal, chat) when off;
 * this only hides the on-cell indicators/popover. */
const REACTIONS_STORAGE_KEY = 'showCellReactions';

export function getShowCellReactions(): boolean {
  try {
    return localStorage.getItem(REACTIONS_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setShowCellReactions(show: boolean): void {
  localStorage.setItem(REACTIONS_STORAGE_KEY, show ? '1' : '0');
}

/** Whether the "bye week clashes" section shows in the player/pick detail
 * modals (and the color-coded bye badge in the player pool) — per-device
 * preference, same pattern as the two above. */
const BYE_CLASHES_STORAGE_KEY = 'showByeClashes';

export function getShowByeClashes(): boolean {
  try {
    return localStorage.getItem(BYE_CLASHES_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setShowByeClashes(show: boolean): void {
  localStorage.setItem(BYE_CLASHES_STORAGE_KEY, show ? '1' : '0');
}
