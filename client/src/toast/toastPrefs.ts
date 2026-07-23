/** Toast categories a user can silence individually. Toasts with no category
 * (direct feedback on the user's own action, e.g. "Vote failed") always show
 * — they aren't "notifications", they're the result of something you just did. */
export const TOAST_CATEGORIES = [
  { key: 'reaction', label: 'Reactions to your picks & replies' },
  { key: 'grade', label: 'Roster grades' },
  { key: 'mention', label: 'Mentions' },
  { key: 'reply', label: 'Comments on your picks' },
  { key: 'lobby', label: 'Lobby activity (teams joining)' },
  { key: 'draft_control', label: 'Draft pause / resume / rollback' },
] as const;
export type ToastCategory = (typeof TOAST_CATEGORIES)[number]['key'];

export interface ToastPrefs {
  enabled: boolean;
  categories: Record<ToastCategory, boolean>;
}

const STORAGE_KEY = 'toastPrefs';

function defaults(): ToastPrefs {
  return {
    enabled: true,
    categories: Object.fromEntries(TOAST_CATEGORIES.map((c) => [c.key, true])) as Record<
      ToastCategory,
      boolean
    >,
  };
}

export function getToastPrefs(): ToastPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<ToastPrefs>;
    return {
      enabled: parsed.enabled ?? true,
      categories: { ...defaults().categories, ...parsed.categories },
    };
  } catch {
    return defaults();
  }
}

function save(prefs: ToastPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function setToastsEnabled(enabled: boolean): void {
  save({ ...getToastPrefs(), enabled });
}

export function setToastCategoryEnabled(category: ToastCategory, enabled: boolean): void {
  const prefs = getToastPrefs();
  save({ ...prefs, categories: { ...prefs.categories, [category]: enabled } });
}

export function isToastCategoryEnabled(category: ToastCategory): boolean {
  const prefs = getToastPrefs();
  return prefs.enabled && prefs.categories[category] !== false;
}
