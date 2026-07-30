import {
  REACTION_EMOJIS,
  defaultAvatar,
  type ActivityType,
  type Avatar as AvatarData,
  type LobbySettings,
  type LobbyStatus,
} from '@draft-lobby/shared';
import AddReactionIcon from '@mui/icons-material/AddReaction';
import HandshakeIcon from '@mui/icons-material/Handshake';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import SportsFootballIcon from '@mui/icons-material/SportsFootball';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/Avatar/Avatar';
import { HScrollRow } from '../../components/HScrollRow/HScrollRow';
import { Loader } from '../../components/Loader/Loader';
import { ReactorsModal, type Reactor } from '../../components/ReactorsModal/ReactorsModal';
import { api } from '../../lib/api';
import { sortReactionEmojis } from '../../lib/reactions';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll';
import './HomePage.scss';

const PAGE_SIZE = 25;
const PINNED_LIMIT = 5;

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
  friendMembers: FeedActor[];
}
interface FriendOpenLobby {
  id: string;
  name: string;
  status: LobbyStatus;
  settings: LobbySettings;
  filled: number;
  teamCount: number;
  friendMembers: FeedActor[];
}

/** "You" for the signed-in user, their actual name for everyone else. */
function nameFor(username: string | undefined, id: string | undefined, myUserId?: string): string {
  if (!username) return 'Someone';
  return id && id === myUserId ? 'You' : username;
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
  const myUserId = session?.user.id;

  const [items, setItems] = useState<FeedItem[]>([]);
  const [activeLobbies, setActiveLobbies] = useState<ActiveLobby[]>([]);
  const [friendOpenLobbies, setFriendOpenLobbies] = useState<FriendOpenLobby[]>([]);
  const [showAllActive, setShowAllActive] = useState(false);
  const [showAllFriendOpen, setShowAllFriendOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);

  useEffect(() => {
    void api<{
      activeLobbies: ActiveLobby[];
      friendOpenLobbies: FriendOpenLobby[];
      items: FeedItem[];
      nextCursor: string | null;
      hasMore: boolean;
    }>(`/feed?limit=${PAGE_SIZE}`)
      .then(({ activeLobbies, friendOpenLobbies, items, nextCursor, hasMore }) => {
        setActiveLobbies(activeLobbies);
        setFriendOpenLobbies(friendOpenLobbies);
        setItems(items);
        cursorRef.current = nextCursor;
        setHasMore(hasMore);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadMore = useCallback(() => {
    if (!cursorRef.current) return;
    setLoadingMore(true);
    void api<{ items: FeedItem[]; nextCursor: string | null; hasMore: boolean }>(
      `/feed?limit=${PAGE_SIZE}&before=${encodeURIComponent(cursorRef.current)}`,
    )
      .then(({ items: more, nextCursor, hasMore }) => {
        setItems((prev) => [...prev, ...more]);
        cursorRef.current = nextCursor;
        setHasMore(hasMore);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, []);

  const sentinelRef = useInfiniteScroll(loadMore, { hasMore, loading: loadingMore });

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

  const visibleActive = showAllActive ? activeLobbies : activeLobbies.slice(0, PINNED_LIMIT);
  const visibleFriendOpen = showAllFriendOpen
    ? friendOpenLobbies
    : friendOpenLobbies.slice(0, PINNED_LIMIT);

  return (
    <main className="home">
      <header className="home__top">
        <h1>Home</h1>
      </header>

      {/* Pinned active drafts */}
      {activeLobbies.length > 0 && (
        <section className="home__pinned">
          <HScrollRow title="Your active drafts">
            {visibleActive.map((l) => {
              const live = l.status === 'STAGING' || l.status === 'DRAFTING' || l.status === 'PAUSED';
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
                  {l.friendMembers.length > 0 && (
                    <div className="pinned-card__friends">
                      {l.friendMembers.slice(0, 4).map((f) => (
                        <Avatar key={f.id} avatar={f.avatar ?? defaultAvatar(f.id)} size={22} />
                      ))}
                    </div>
                  )}
                  <span className="muted">
                    {l.settings.teamCount} teams · {l.settings.draftType === 'SNAKE' ? 'Snake' : 'Straight'}
                  </span>
                </Link>
              );
            })}
            {!showAllActive && activeLobbies.length > PINNED_LIMIT && (
              <button
                type="button"
                className="pinned-card pinned-card--more"
                onClick={() => setShowAllActive(true)}
              >
                See more
                <span className="muted">+{activeLobbies.length - PINNED_LIMIT}</span>
              </button>
            )}
          </HScrollRow>
        </section>
      )}

      {/* Pinned: public lobbies friends are in that you haven't joined. */}
      {friendOpenLobbies.length > 0 && (
        <section className="home__pinned">
          <HScrollRow title="Friends in open lobbies">
            {visibleFriendOpen.map((l) => (
              <FriendOpenCard key={l.id} lobby={l} />
            ))}
            {!showAllFriendOpen && friendOpenLobbies.length > PINNED_LIMIT && (
              <button
                type="button"
                className="pinned-card pinned-card--more"
                onClick={() => setShowAllFriendOpen(true)}
              >
                See more
                <span className="muted">+{friendOpenLobbies.length - PINNED_LIMIT}</span>
              </button>
            )}
          </HScrollRow>
        </section>
      )}

      {/* Timeline */}
      <section className="home__feed">
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
          <>
            <ul className="feed">
              {items.map((it) => (
                <FeedCard key={it.id} item={it} myUserId={myUserId} onReact={toggleReaction} />
              ))}
            </ul>
            <div ref={sentinelRef} />
            {loadingMore && (
              <div className="section-loading section-loading--inline">
                <Loader label="Loading more…" />
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function FriendOpenCard({ lobby }: { lobby: FriendOpenLobby }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = lobby.status !== 'SETUP' && lobby.status !== 'SCHEDULED';
  const isFull = lobby.filled >= lobby.teamCount;
  const canJoin = !live && !isFull;

  async function join() {
    setBusy(true);
    setError(null);
    try {
      await api('/lobbies/join', { method: 'POST', body: { lobbyId: lobby.id } });
      navigate(`/lobby/${lobby.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pinned-card pinned-card--friend-open">
      <span className={`status-pill status-pill--${lobby.status.toLowerCase()}`}>
        {lobby.status}
      </span>
      <span className="pinned-card__name">{lobby.name}</span>
      {lobby.friendMembers.length > 0 && (
        <div className="pinned-card__friends">
          {lobby.friendMembers.slice(0, 4).map((f) => (
            <Avatar key={f.id} avatar={f.avatar ?? defaultAvatar(f.id)} size={22} />
          ))}
        </div>
      )}
      <span className="muted">
        {lobby.filled}/{lobby.teamCount} teams
      </span>
      {canJoin ? (
        <button
          type="button"
          className="button button--sm button--primary pinned-card__action"
          disabled={busy}
          onClick={join}
        >
          {busy ? 'Joining…' : 'Join'}
        </button>
      ) : (
        <Link
          className="button button--sm pinned-card__action"
          to={live ? `/lobby/${lobby.id}/draft` : `/lobby/${lobby.id}`}
        >
          View
        </Link>
      )}
      {error && <p className="pinned-card__error">{error}</p>}
    </div>
  );
}

function FeedCard({
  item,
  myUserId,
  onReact,
}: {
  item: FeedItem;
  myUserId: string | undefined;
  onReact: (id: string, emoji: string) => void;
}) {
  const lead = item.actors[0];
  const extra = item.actors.length - 1;

  return (
    <li className="feed-card">
      {/* Upper: avatars + text content, side by side. */}
      <div className="feed-card__upper">
        <div className="feed-card__avatars">
          {item.actors.slice(0, 3).map((a) => (
            <Avatar key={a.id} avatar={a.avatar ?? defaultAvatar(a.id)} size={40} />
          ))}
        </div>
        <div className="feed-card__body">
          <p className="feed-card__text">
            {item.type === 'DRAFT_COMPLETED' && (
              <>
                <strong>{nameFor(lead?.username, lead?.id, myUserId)}</strong>
                {extra > 0 && ` & ${extra} other${extra > 1 ? 's' : ''}`} completed{' '}
                {item.lobbyName ? <strong>{item.lobbyName}</strong> : 'a draft'}{' '}
                <SportsFootballIcon className="feed-card__icon" sx={{ fontSize: 17 }} />
              </>
            )}
            {item.type === 'FRIEND_ACCEPTED' && (
              <>
                <strong>{nameFor(lead?.username, lead?.id, myUserId)}</strong> and{' '}
                <strong>{nameFor(item.subject?.username, item.subject?.id, myUserId)}</strong> are
                now friends <HandshakeIcon className="feed-card__icon" sx={{ fontSize: 17 }} />
              </>
            )}
            {item.type === 'OPEN_LOBBY_CREATED' && (
              <>
                <strong>{nameFor(lead?.username, lead?.id, myUserId)}</strong> opened{' '}
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
              <Link to={`/lobby/${item.lobbyId}/draft`} className="feed-card__link">
                View draft →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Lower: reactions — its own full-width row so its left edge is
          consistent card to card, instead of drifting with however many
          avatars happen to be stacked in &__upper above it. */}
      <div className="feed-card__lower">
        <FeedReactions item={item} myUserId={myUserId} onReact={onReact} />
      </div>
    </li>
  );
}

function FeedReactions({
  item,
  myUserId,
  onReact,
}: {
  item: FeedItem;
  myUserId: string | undefined;
  onReact: (id: string, emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reactorsModal, setReactorsModal] = useState<Record<string, Reactor[]> | null>(null);
  const active = REACTION_EMOJIS.filter((e) => (item.reactions[e] ?? 0) > 0);

  async function showReactors() {
    try {
      const { reactors } = await api<{ reactors: Record<string, Reactor[]> }>(
        `/feed/${item.id}/reactors`,
      );
      setReactorsModal(reactors);
    } catch {
      // Ignore — reactions still show as counts either way.
    }
  }

  return (
    <div className="feed-card__reactions">
      <button
        className="reaction reaction--add"
        aria-label="Add reaction"
        onClick={() => setOpen((o) => !o)}
      >
        <AddReactionIcon sx={{ fontSize: 18 }} />
      </button>
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
      {active.length > 0 && (
        <button
          type="button"
          className="reaction reaction--who"
          aria-label="See who reacted"
          title="See who reacted"
          onClick={showReactors}
        >
          <PeopleAltOutlinedIcon sx={{ fontSize: 15 }} />
        </button>
      )}
      {open && (
        <div className="feed-card__palette">
          {sortReactionEmojis(item.reactions).map((emoji) => (
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
      {reactorsModal && (
        <ReactorsModal
          reactors={reactorsModal}
          myUserId={myUserId}
          onClose={() => setReactorsModal(null)}
        />
      )}
    </div>
  );
}
