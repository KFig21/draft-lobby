import {
  REACTION_EMOJIS,
  defaultAvatar,
  type ActivityType,
  type Avatar as AvatarData,
  type LobbySettings,
  type LobbyStatus,
} from '@draft-lobby/shared';
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import SportsFootballOutlinedIcon from '@mui/icons-material/SportsFootballOutlined';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/Avatar/Avatar';
import { Loader } from '../../components/Loader/Loader';
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
  lobbyStatus: string | null;
  isMember: boolean;
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
        <h1>Home</h1>
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
          <div className="section-loading">
            <Loader label="Loading your feed…" />
          </div>
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
              {item.lobbyName ? <strong>{item.lobbyName}</strong> : 'a draft'}{' '}
              <SportsFootballOutlinedIcon className="feed-card__icon" sx={{ fontSize: 17 }} />
            </>
          )}
          {item.type === 'FRIEND_ACCEPTED' && (
            <>
              <strong>{lead?.username ?? 'Someone'}</strong> and{' '}
              <strong>{item.subject?.username ?? 'someone'}</strong> are now friends{' '}
              <HandshakeOutlinedIcon className="feed-card__icon" sx={{ fontSize: 17 }} />
            </>
          )}
          {item.type === 'OPEN_LOBBY_CREATED' && (
            <>
              <strong>{lead?.username ?? 'Someone'}</strong> opened{' '}
              <strong>{item.lobbyName ?? 'a lobby'}</strong>
              {/* Only offer to join if the draft hasn't started yet. */}
              {item.lobbyId &&
              (item.lobbyStatus === 'SETUP' || item.lobbyStatus === 'SCHEDULED') ? (
                <>
                  {' '}—{' '}
                  <Link to={`/lobby/${item.lobbyId}`} className="feed-card__link">
                    join up →
                  </Link>
                </>
              ) : (
                item.lobbyStatus && ' — draft already started'
              )}
            </>
          )}
        </p>
        <div className="feed-card__foot">
          <span className="feed-card__time">{timeAgo(item.createdAt)}</span>
          {/* Drafts the user is part of link straight to the lobby. */}
          {item.isMember && item.lobbyId && item.type !== 'OPEN_LOBBY_CREATED' && (
            <Link to={`/lobby/${item.lobbyId}`} className="feed-card__link">
              View draft →
            </Link>
          )}
        </div>

        <FeedReactions item={item} onReact={onReact} />
      </div>
    </li>
  );
}

function FeedReactions({
  item,
  onReact,
}: {
  item: FeedItem;
  onReact: (id: string, emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = REACTION_EMOJIS.filter((e) => (item.reactions[e] ?? 0) > 0);

  return (
    <div className="feed-card__reactions">
      {active.map((emoji) => {
        const count = item.reactions[emoji] ?? 0;
        const mine = item.myReactions.includes(emoji);
        return (
          <button
            key={emoji}
            className={`reaction reaction--has${mine ? ' reaction--on' : ''}`}
            onClick={() => onReact(item.id, emoji)}
          >
            <span className="reaction__emoji">{emoji}</span>
            <span className="reaction__count">{count}</span>
          </button>
        );
      })}
      <button
        className="reaction reaction--add"
        aria-label="Add reaction"
        onClick={() => setOpen((o) => !o)}
      >
        <AddReactionOutlinedIcon sx={{ fontSize: 18 }} />
      </button>
      {open && (
        <div className="feed-card__palette">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onReact(item.id, emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
