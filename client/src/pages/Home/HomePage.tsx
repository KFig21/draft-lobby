import {
  REACTION_EMOJIS,
  defaultAvatar,
  type ActivityType,
  type Avatar as AvatarData,
  type LobbySettings,
  type LobbyStatus,
} from '@draft-lobby/shared';
import AddIcon from '@mui/icons-material/Add';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/Avatar/Avatar';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import './HomePage.scss';

interface FeedActor {
  id: string;
  username: string;
  avatar: AvatarData | null;
}
interface FeedItem {
  id: string;
  type: ActivityType;
  createdAt: string;
  lobbyId: string | null;
  lobbyName: string | null;
  actors: FeedActor[];
  subject: { id: string; username: string } | null;
  reactions: Record<string, number>;
  myReactions: string[];
}
interface ActiveLobby {
  id: string;
  name: string;
  status: LobbyStatus;
  settings: LobbySettings;
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return days < 7 ? `${days}d` : new Date(iso).toLocaleDateString();
}

export function HomePage() {
  const { session } = useAuth();
  const username =
    (session?.user.user_metadata?.username as string | undefined) ??
    session?.user.email ??
    'drafter';

  const [items, setItems] = useState<FeedItem[]>([]);
  const [activeLobbies, setActiveLobbies] = useState<ActiveLobby[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<{ activeLobbies: ActiveLobby[]; items: FeedItem[] }>('/feed')
      .then(({ activeLobbies, items }) => {
        setActiveLobbies(activeLobbies);
        setItems(items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleReaction(itemId: string, emoji: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const has = it.myReactions.includes(emoji);
        const count = (it.reactions[emoji] ?? 0) + (has ? -1 : 1);
        const reactions = { ...it.reactions };
        if (count <= 0) delete reactions[emoji];
        else reactions[emoji] = count;
        return {
          ...it,
          reactions,
          myReactions: has
            ? it.myReactions.filter((e) => e !== emoji)
            : [...it.myReactions, emoji],
        };
      }),
    );
    void api(`/feed/${itemId}/react`, { method: 'POST', body: { emoji } }).catch(() => {});
  }

  return (
    <main className="home">
      <header className="home__top">
        <h1>Welcome, {username}</h1>
        <Link className="button button--primary home__new" to="/lobby/new">
          <AddIcon fontSize="small" /> New lobby
        </Link>
      </header>

      {/* Pinned active drafts */}
      {activeLobbies.length > 0 && (
        <section className="home__pinned">
          <h2 className="home__section-title">Your active drafts</h2>
          <div className="home__pinned-grid">
            {activeLobbies.map((l) => {
              const live = l.status === 'DRAFTING' || l.status === 'PAUSED';
              return (
                <Link
                  key={l.id}
                  to={live ? `/lobby/${l.id}/draft` : `/lobby/${l.id}`}
                  className="pinned-card"
                >
                  <span className={`status-pill status-pill--${l.status.toLowerCase()}`}>
                    {l.status}
                  </span>
                  <span className="pinned-card__name">{l.name}</span>
                  <span className="muted">
                    {l.settings.teamCount} teams · {l.settings.draftType === 'SNAKE' ? 'Snake' : 'Straight'}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Timeline */}
      <section className="home__feed">
        <h2 className="home__section-title">Timeline</h2>
        {loading ? (
          <p className="muted">Loading your feed…</p>
        ) : items.length === 0 ? (
          <p className="muted">
            Nothing here yet. Add friends and finish some drafts — activity from you
            and your friends shows up here.
          </p>
        ) : (
          <ul className="feed">
            {items.map((it) => (
              <FeedCard key={it.id} item={it} onReact={toggleReaction} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function FeedCard({
  item,
  onReact,
}: {
  item: FeedItem;
  onReact: (id: string, emoji: string) => void;
}) {
  const lead = item.actors[0];
  const extra = item.actors.length - 1;

  return (
    <li className="feed-card">
      <div className="feed-card__avatars">
        {item.actors.slice(0, 3).map((a) => (
          <Avatar key={a.id} avatar={a.avatar ?? defaultAvatar(a.id)} size={40} />
        ))}
      </div>
      <div className="feed-card__body">
        <p className="feed-card__text">
          {item.type === 'DRAFT_COMPLETED' && (
            <>
              <strong>{lead?.username ?? 'Someone'}</strong>
              {extra > 0 && ` & ${extra} other${extra > 1 ? 's' : ''}`} completed{' '}
              {item.lobbyName ? <strong>{item.lobbyName}</strong> : 'a draft'} 🏈
            </>
          )}
          {item.type === 'FRIEND_ACCEPTED' && (
            <>
              <strong>{lead?.username ?? 'Someone'}</strong> and{' '}
              <strong>{item.subject?.username ?? 'someone'}</strong> are now friends 🤝
            </>
          )}
          {item.type === 'OPEN_LOBBY_CREATED' && (
            <>
              <strong>{lead?.username ?? 'Someone'}</strong> opened{' '}
              <strong>{item.lobbyName ?? 'a lobby'}</strong> —{' '}
              {item.lobbyId && (
                <Link to={`/lobby/${item.lobbyId}`} className="feed-card__link">
                  join up →
                </Link>
              )}
            </>
          )}
        </p>
        <span className="feed-card__time">{timeAgo(item.createdAt)}</span>

        <div className="feed-card__reactions">
          {REACTION_EMOJIS.map((emoji) => {
            const count = item.reactions[emoji] ?? 0;
            const mine = item.myReactions.includes(emoji);
            return (
              <button
                key={emoji}
                className={`reaction${mine ? ' reaction--on' : ''}${
                  count > 0 ? ' reaction--has' : ''
                }`}
                onClick={() => onReact(item.id, emoji)}
              >
                <span className="reaction__emoji">{emoji}</span>
                {count > 0 && <span className="reaction__count">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </li>
  );
}
