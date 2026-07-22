import { defaultAvatar } from '@draft-lobby/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../../components/Avatar/Avatar';
import { Loader } from '../../components/Loader/Loader';
import { useNotifications } from '../../notifications/NotificationsContext';
import { api } from '../../lib/api';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll';
import type { NotificationRow } from '../../lib/types';
import './NotificationsPage.scss';

/** "Kevin" or "Kevin and 2 others" — for notifications grouped by `count`. */
function withGroup(name: string, count: number): ReactNode {
  if (count <= 1) return <strong>{name}</strong>;
  const others = count - 1;
  return (
    <>
      <strong>{name}</strong> and {others} other{others > 1 ? 's' : ''}
    </>
  );
}

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
  const { notifications, loading, loadingMore, hasMore, loadMore, markAllRead, refetch } =
    useNotifications();
  const navigate = useNavigate();
  const [handled, setHandled] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  // Snapshot of which ids were unread when the page opened. `read` flips to
  // true right away (see effect below) so this is what actually drives the
  // New/Seen split — otherwise it would collapse to empty instantly.
  const [newIds, setNewIds] = useState<Set<string> | null>(null);

  const sentinelRef = useInfiniteScroll(loadMore, { hasMore, loading: loadingMore });

  useEffect(() => {
    if (!loading && newIds === null) {
      setNewIds(new Set(notifications.filter((n) => !n.read).map((n) => n.id)));
      void markAllRead();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

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

  const { newItems, seenItems } = useMemo(() => {
    const ids = newIds ?? new Set<string>();
    const newItems: NotificationRow[] = [];
    const seenItems: NotificationRow[] = [];
    for (const n of notifications) (ids.has(n.id) ? newItems : seenItems).push(n);
    return { newItems, seenItems };
  }, [notifications, newIds]);

  function renderRow(n: NotificationRow) {
    const name = n.actor?.username ?? 'Someone';
    const avatar = n.actor?.avatar ?? defaultAvatar(n.actor_id ?? n.id);
    const busy = busyId === n.id;
    const resolved =
      handled[n.id] ??
      (n.status === 'ACCEPTED' ? 'Accepted' : n.status === 'DECLINED' ? 'Declined' : undefined);
    const isDraftLink =
      (n.type === 'PICK_REACTION' ||
        n.type === 'MESSAGE_REACTION' ||
        n.type === 'PICK_REPLY' ||
        n.type === 'MENTION' ||
        n.type === 'DRAFT_GRADE') &&
      !!n.lobby_id;
    return (
      <li
        key={n.id}
        className={`notifs__row${n.read ? '' : ' notifs__row--unread'}${
          isDraftLink ? ' notifs__row--link' : ''
        }`}
        onClick={
          isDraftLink
            ? () =>
                navigate(`/lobby/${n.lobby_id}/draft`, {
                  state:
                    n.target_type && n.target_id
                      ? {
                          focusTarget: {
                            targetType: n.target_type,
                            targetId: n.target_id,
                            notifType: n.type,
                          },
                        }
                      : undefined,
                })
            : undefined
        }
      >
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
            {n.type === 'PICK_REACTION' && (
              <>
                {withGroup(name, n.count)} reacted to your pick
                {n.snippet ? (
                  <>
                    {' '}
                    of <strong>{n.snippet}</strong>
                  </>
                ) : (
                  ''
                )}{' '}
                in <strong>{n.lobby_name ?? 'a draft'}</strong>
              </>
            )}
            {n.type === 'MESSAGE_REACTION' && (
              <>
                {withGroup(name, n.count)} reacted to your message
                {n.snippet ? <>: “{n.snippet}”</> : ''} in{' '}
                <strong>{n.lobby_name ?? 'a draft'}</strong>
              </>
            )}
            {n.type === 'PICK_REPLY' && (
              <>
                {withGroup(name, n.count)} replied to your pick
                {n.snippet ? <>: “{n.snippet}”</> : ''} in{' '}
                <strong>{n.lobby_name ?? 'a draft'}</strong>
              </>
            )}
            {n.type === 'MENTION' && (
              <>
                <strong>{name}</strong> mentioned you
                {n.snippet ? <>: “{n.snippet}”</> : ''} in{' '}
                <strong>{n.lobby_name ?? 'a draft'}</strong>
              </>
            )}
            {n.type === 'DRAFT_GRADE' && (
              <>
                {withGroup(name, n.count)} graded your roster
                {n.snippet ? <>: {n.snippet}</> : ''} in{' '}
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
  }

  return (
    <main className="notifs">
      <header className="notifs__header">
        <h1>Notifications</h1>
      </header>

      {loading ? (
        <div className="section-loading">
          <Loader label="Loading…" />
        </div>
      ) : notifications.length === 0 ? (
        <p className="muted">You're all caught up.</p>
      ) : (
        <>
          {newItems.length > 0 && (
            <section className="notifs__section">
              <h2 className="notifs__section-title">New</h2>
              <ul className="notifs__list">{newItems.map(renderRow)}</ul>
            </section>
          )}
          {seenItems.length > 0 && (
            <section className="notifs__section">
              {newItems.length > 0 && <h2 className="notifs__section-title">Earlier</h2>}
              <ul className="notifs__list">{seenItems.map(renderRow)}</ul>
            </section>
          )}
          <div ref={sentinelRef} />
          {loadingMore && (
            <div className="section-loading section-loading--inline">
              <Loader label="Loading more…" />
            </div>
          )}
        </>
      )}
    </main>
  );
}
