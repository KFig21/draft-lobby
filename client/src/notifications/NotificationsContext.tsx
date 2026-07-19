import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../supabase';
import type { NotificationRow } from '../lib/types';

interface NotificationsState {
  notifications: NotificationRow[];
  unreadCount: number;
  loading: boolean;
  refetch: () => void;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsState>({
  notifications: [],
  unreadCount: 0,
  loading: true,
  refetch: () => {},
  markAllRead: async () => {},
});

const SELECT = '*, actor:actor_id ( id, username, avatar )';

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    void supabase
      .from('notifications')
      .select(SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setNotifications((data ?? []) as unknown as NotificationRow[]);
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
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
  }, [userId, refetch]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    // Optimistic — RLS lets a user update their own notifications.
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
  }, [userId, notifications]);

  const unreadCount = notifications.reduce((n, x) => n + (x.read ? 0 : 1), 0);

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, loading, refetch, markAllRead }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsState {
  return useContext(NotificationsContext);
}
