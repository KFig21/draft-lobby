import { defaultAvatar } from '@draft-lobby/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '../../components/Avatar/Avatar';
import { useNotifications } from '../../notifications/NotificationsContext';
import { api } from '../../lib/api';
import type { NotificationRow } from '../../lib/types';
import './NotificationsPage.scss';

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString();
}

export function NotificationsPage() {
  const { notifications, loading, markAllRead, refetch } = useNotifications();
  const navigate = useNavigate();
  const [handled, setHandled] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Reading the page clears the unread badge.
  useEffect(() => {
    void markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respondFriend(n: NotificationRow, accept: boolean) {
    if (!n.actor_id) return;
    setBusyId(n.id);
    try {
      await api('/friends/respond', {
        method: 'POST',
        body: { requesterId: n.actor_id, accept },
      });
      setHandled((h) => ({ ...h, [n.id]: accept ? 'Accepted' : 'Declined' }));
    } finally {
      setBusyId(null);
    }
  }

  async function respondInvite(n: NotificationRow, accept: boolean) {
    if (!n.lobby_id) return;
    setBusyId(n.id);
    try {
      await api(`/lobbies/${n.lobby_id}/${accept ? 'accept-invite' : 'decline-invite'}`, {
        method: 'POST',
      });
      if (accept) {
        navigate(`/lobby/${n.lobby_id}`);
      } else {
        setHandled((h) => ({ ...h, [n.id]: 'Declined' }));
      }
    } finally {
      setBusyId(null);
      refetch();
    }
  }

  return (
    <main className="notifs">
      <header className="notifs__header">
        <Link to="/home" className="back-link">
          ← Home
        </Link>
        <h1>Notifications</h1>
      </header>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : notifications.length === 0 ? (
        <p className="muted">You're all caught up.</p>
      ) : (
        <ul className="notifs__list">
          {notifications.map((n) => {
            const name = n.actor?.username ?? 'Someone';
            const avatar = n.actor?.avatar ?? defaultAvatar(n.actor_id ?? n.id);
            const resolved = handled[n.id];
            const busy = busyId === n.id;
            return (
              <li key={n.id} className={`notifs__row${n.read ? '' : ' notifs__row--unread'}`}>
                <Avatar avatar={avatar} size={40} />
                <div className="notifs__body">
                  <p className="notifs__text">
                    {n.type === 'FRIEND_REQUEST' && (
                      <>
                        <strong>{name}</strong> sent you a friend request
                      </>
                    )}
                    {n.type === 'FRIEND_ACCEPTED' && (
                      <>
                        <strong>{name}</strong> accepted your friend request
                      </>
                    )}
                    {n.type === 'LOBBY_INVITE' && (
                      <>
                        <strong>{name}</strong> invited you to{' '}
                        <strong>{n.lobby_name ?? 'a draft'}</strong>
                      </>
                    )}
                  </p>
                  <span className="notifs__time">{timeAgo(n.created_at)}</span>
                </div>

                {resolved ? (
                  <span className="muted notifs__resolved">{resolved}</span>
                ) : n.type === 'FRIEND_REQUEST' ? (
                  <div className="notifs__actions">
                    <button
                      className="button button--primary notifs__btn"
                      disabled={busy}
                      onClick={() => respondFriend(n, true)}
                    >
                      Accept
                    </button>
                    <button
                      className="button notifs__btn"
                      disabled={busy}
                      onClick={() => respondFriend(n, false)}
                    >
                      Decline
                    </button>
                  </div>
                ) : n.type === 'LOBBY_INVITE' ? (
                  <div className="notifs__actions">
                    <button
                      className="button button--primary notifs__btn"
                      disabled={busy}
                      onClick={() => respondInvite(n, true)}
                    >
                      Join
                    </button>
                    <button
                      className="button notifs__btn"
                      disabled={busy}
                      onClick={() => respondInvite(n, false)}
                    >
                      Decline
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
