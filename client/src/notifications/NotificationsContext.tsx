import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../supabase';
import type { NotificationRow } from '../lib/types';

const PAGE_SIZE = 25;

interface NotificationsState {
  notifications: NotificationRow[];
  unreadCount: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsState>({
  notifications: [],
  unreadCount: 0,
  loading: true,
  loadingMore: false,
  hasMore: false,
  loadMore: () => {},
  refetch: () => {},
  markAllRead: async () => {},
});

const SELECT = '*, actor:actor_id ( id, username, avatar )';

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // Mirrors `notifications` for use inside callbacks without retriggering them.
  const notificationsRef = useRef<NotificationRow[]>([]);
  notificationsRef.current = notifications;

  // Re-fetches from the top, preserving however many rows are already loaded
  // (at least one page), so a realtime insert/update doesn't collapse a list
  // the user has scrolled through back down to the first page.
  const refetch = useCallback(() => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      setHasMore(false);
      return;
    }
    const count = Math.max(notificationsRef.current.length, PAGE_SIZE);
    void supabase
      .from('notifications')
      .select(SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(count)
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as NotificationRow[];
        setNotifications(rows);
        setHasMore(rows.length >= count);
        setLoading(false);
      });
  }, [userId]);

  const loadMore = useCallback(() => {
    if (!userId) return;
    const current = notificationsRef.current;
    const last = current[current.length - 1];
    if (!last) return;
    setLoadingMore(true);
    void supabase
      .from('notifications')
      .select(SELECT)
      .eq('user_id', userId)
      .lt('created_at', last.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as NotificationRow[];
        setNotifications((prev) => [...prev, ...rows]);
        setHasMore(rows.length === PAGE_SIZE);
        setLoadingMore(false);
      });
  }, [userId]);

  useEffect(() => {
    setNotifications([]);
    setHasMore(true);
    setLoading(true);
    refetch();
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => refetch(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const unreadIds = notificationsRef.current.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    // Optimistic — RLS lets a user update their own notifications.
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
  }, [userId]);

  const unreadCount = notifications.reduce((n, x) => n + (x.read ? 0 : 1), 0);

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        loadingMore,
        hasMore,
        loadMore,
        refetch,
        markAllRead,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsState {
  return useContext(NotificationsContext);
}
