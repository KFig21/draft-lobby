import type { Avatar as AvatarData, DraftGrade } from '@draft-lobby/shared';
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ToastViewport } from './ToastViewport';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  title: string;
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
  /** Makes the whole card clickable (e.g. jump to the pick that was reacted
   * to) — like clicking a notification. Dismisses the toast when clicked. */
  onClick?: () => void;
}

export interface ToastItem extends Required<Pick<ToastInput, 'title' | 'tone' | 'durationMs'>> {
  id: string;
  body?: string;
  action?: ToastAction;
  avatar?: AvatarData | null;
  grade?: DraftGrade | null;
  onClick?: () => void;
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
 * match the toast-out CSS animation duration in ToastViewport.scss. */
export const TOAST_EXIT_MS = 180;

interface TimerEntry {
  timeoutId: number;
  startedAt: number;
  remaining: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef(new Map<string, TimerEntry>());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer.timeoutId);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_EXIT_MS);
  }, []);

  const showToast = useCallback(
    (input: ToastInput): string => {
      const id = crypto.randomUUID();
      const durationMs = input.durationMs ?? 6000;
      const item: ToastItem = {
        id,
        title: input.title,
        body: input.body,
        tone: input.tone ?? 'info',
        action: input.action,
        avatar: input.avatar,
        grade: input.grade,
        onClick: input.onClick,
        durationMs,
        paused: false,
        closing: false,
      };
      setToasts((prev) => [...prev, item]);
      timersRef.current.set(id, {
        timeoutId: window.setTimeout(() => dismissToast(id), durationMs),
        startedAt: Date.now(),
        remaining: durationMs,
      });
      return id;
    },
    [dismissToast],
  );

  const togglePause = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    setToasts((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        if (!t.paused) {
          if (timer) {
            clearTimeout(timer.timeoutId);
            timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
          }
          return { ...t, paused: true };
        }
        if (timer) {
          timer.startedAt = Date.now();
          timer.timeoutId = window.setTimeout(() => dismissToast(id), timer.remaining);
        }
        return { ...t, paused: false };
      }),
    );
  }, [dismissToast]);

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
