/** The scoring format ("preset:<key>" or "format:<id>", same choice shape the
 * pickers themselves use) that seeds a freshly opened Rankings page or a
 * newly created league, until the user picks something else there. Per-device
 * preference, same pattern as draftCellStyle. */
const STORAGE_KEY = 'defaultScoringChoice';
const FALLBACK = 'preset:PPR';

export function getDefaultScoringChoice(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function setDefaultScoringChoice(choice: string): void {
  localStorage.setItem(STORAGE_KEY, choice);
}
