/** How a drafted pick renders on the draft board. 'default' is a
 * position-colored fill with an abbreviated name pinned to the top corner and
 * team/bye/round underneath — laid out for reading up close. 'bold' is meant
 * for a big screen viewed from across the room — the same fill, but just the
 * player's name, large. 'clean' is the same layout as 'default' on a faded
 * position-tinted surface rather than a solid fill. Per-device preference (not
 * synced), same pattern as toastPrefs. */
export type DraftCellStyle = 'default' | 'bold' | 'clean';

const STORAGE_KEY = 'draftCellStyle';
const VALID_STYLES: DraftCellStyle[] = ['default', 'bold', 'clean'];

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

/** Whether the player pool draws projection lines showing where the viewer's
 * upcoming picks are expected to land (how many players are likely gone by
 * then) — per-device preference, same pattern as the toggles above. */
const PICK_PROJECTION_STORAGE_KEY = 'showPickProjection';

export function getShowPickProjection(): boolean {
  try {
    return localStorage.getItem(PICK_PROJECTION_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setShowPickProjection(show: boolean): void {
  localStorage.setItem(PICK_PROJECTION_STORAGE_KEY, show ? '1' : '0');
}

/** Which desktop draft-board layout to use. 'detailed' is the 3-lane dashboard
 * (roster · board+players · chat, all visible at once); 'simple' is the classic
 * board with a tabbed sidebar. Only affects wide screens — mobile and the
 * fullscreen/TV view always use the classic layout. Per-device preference, same
 * pattern as the toggles above; defaults to 'detailed'. */
export type DraftBoardLayout = 'simple' | 'detailed';

const BOARD_LAYOUT_STORAGE_KEY = 'draftBoardLayout';

export function getDraftBoardLayout(): DraftBoardLayout {
  try {
    return localStorage.getItem(BOARD_LAYOUT_STORAGE_KEY) === 'simple' ? 'simple' : 'detailed';
  } catch {
    return 'detailed';
  }
}

export function setDraftBoardLayout(layout: DraftBoardLayout): void {
  localStorage.setItem(BOARD_LAYOUT_STORAGE_KEY, layout);
}
