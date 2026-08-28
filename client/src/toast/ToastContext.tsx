import type { Avatar as AvatarData, DraftGrade, Position } from '@draft-lobby/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  getToastStyle,
  isToastCategoryEnabled,
  type ToastCategory,
  type ToastStyle,
} from './toastPrefs';
import { ToastViewport } from './ToastViewport';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  /** Usually a plain string, but can be a small fragment (e.g. a username
   * followed by a champion badge) when the title needs to embed more than text. */
  title: ReactNode;
  /** Small icon shown before the title text (e.g. a comment bubble for
   * "commented on your pick"). */
  titleIcon?: ReactNode;
  body?: string;
  tone?: ToastTone;
  /** Auto-dismiss after this long, unless paused. Default 6000ms. */
  durationMs?: number;
  /** Optional actionable button (e.g. "Pause draft"), distinct from the
   * built-in pause/close controls every toast has. */
  action?: ToastAction;
  /** Shown next to the title when the toast is about a specific person. */
  avatar?: AvatarData | null;
  /** Shown as a colored badge in the title — for grade notifications. */
  grade?: DraftGrade | null;
  /** Player summary shown in place of a plain `body` string — for toasts
   * about a specific pick (e.g. a reaction), so the position and round/pick
   * are visible without needing to click through. */
  pick?: { position: Position; name: string; round: number; overall: number } | null;
  /** Which Settings toggle silences this toast. Omit for toasts that are
   * direct feedback on the user's own action (errors, confirmations) —
   * those aren't "notifications" and always show. */
  category?: ToastCategory;
  /** Makes the whole card clickable (e.g. jump to the pick that was reacted
   * to) — like clicking a notification. Dismisses the toast when clicked. */
  onClick?: () => void;
}

export interface ToastItem extends Required<Pick<ToastInput, 'title' | 'tone' | 'durationMs'>> {
  id: string;
  titleIcon?: ReactNode;
  body?: string;
  action?: ToastAction;
  avatar?: AvatarData | null;
  grade?: DraftGrade | null;
  pick?: ToastInput['pick'];
  category?: ToastCategory;
  onClick?: () => void;
  /** Card layout captured when the toast was created (Settings: Detailed/Brief). */
  style: ToastStyle;
  paused: boolean;
  closing: boolean;
}

interface ToastState {
  toasts: ToastItem[];
  showToast: (input: ToastInput) => string;
  dismissToast: (id: string) => void;
  togglePause: (id: string) => void;
}

const ToastContext = createContext<ToastState | null>(null);

/** Delay between flagging a toast "closing" and actually removing it — must
 * cover the slide-down/fade-out transition on .toast.is-closing in
 * ToastViewport.scss (220ms). */
export const TOAST_EXIT_MS = 240;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // Per-toast full duration + remaining, in refs so ticking them never triggers
  // a re-render.
  const durationRef = useRef(new Map<string, number>());
  const remainingRef = useRef(new Map<string, number>());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      durationRef.current.delete(id);
      remainingRef.current.delete(id);
    }, TOAST_EXIT_MS);
  }, []);

  const showToast = useCallback((input: ToastInput): string => {
    const id = crypto.randomUUID();
    if (input.category && !isToastCategoryEnabled(input.category)) return id;
    const durationMs = input.durationMs ?? 6000;
    durationRef.current.set(id, durationMs);
    const item: ToastItem = {
      id,
      title: input.title,
      titleIcon: input.titleIcon,
      body: input.body,
      tone: input.tone ?? 'info',
      action: input.action,
      avatar: input.avatar,
      grade: input.grade,
      pick: input.pick,
      category: input.category,
      onClick: input.onClick,
      style: getToastStyle(),
      durationMs,
      paused: false,
      closing: false,
    };
    setToasts((prev) => [...prev, item]);
    return id;
  }, []);

  const togglePause = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, paused: !t.paused } : t)));
  }, []);

  // While a modal is open the deck ducks away behind it (see ToastViewport.scss),
  // so freeze the countdown too — otherwise a toast could quietly expire while
  // hidden. Track any .modal-anim-backdrop in the DOM (shared by ~every modal).
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => {
    const check = () => setModalOpen(!!document.querySelector('.modal-anim-backdrop'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // iOS-style stack: only the front toast (the oldest one not yet closing)
  // counts down — a toast's timer doesn't begin until it reaches the top of the
  // stack. Keyed on that toast's id + paused/modal state so newer toasts arriving
  // behind it never reset its clock; on cleanup we bank how much time is left so
  // pause/resume (and handing off to the next toast) resume from the right spot.
  const front = toasts.find((t) => !t.closing) ?? null;
  const frontId = front?.id ?? null;
  const frontPaused = front?.paused ?? false;
  useEffect(() => {
    if (!frontId || frontPaused || modalOpen) return;
    const remaining =
      remainingRef.current.get(frontId) ?? durationRef.current.get(frontId) ?? 6000;
    const startedAt = Date.now();
    const timeoutId = window.setTimeout(() => dismissToast(frontId), remaining);
    return () => {
      clearTimeout(timeoutId);
      remainingRef.current.set(frontId, Math.max(0, remaining - (Date.now() - startedAt)));
    };
  }, [frontId, frontPaused, modalOpen, dismissToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast, togglePause }}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

/** Fire-and-forget toasts from anywhere in the tree: `showToast({ title, body, action })`. */
export function useToast(): Pick<ToastState, 'showToast' | 'dismissToast'> {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

/** Internal — only ToastViewport needs the full list + pause control. */
export function useToastInternal(): ToastState {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToastInternal must be used within a ToastProvider');
  return ctx;
}
