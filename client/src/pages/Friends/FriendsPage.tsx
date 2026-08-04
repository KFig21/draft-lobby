import { defaultAvatar } from '@draft-lobby/shared';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import IosShareIcon from '@mui/icons-material/IosShare';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '../../components/Avatar/Avatar';
import { Loader } from '../../components/Loader/Loader';
import { ProfileLink } from '../../components/ProfileLink/ProfileLink';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import {
  getMyInviteToken,
  resetMyInviteToken,
  inviteUrl,
} from '../../lib/friendInvite';
import { supabase } from '../../supabase';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll';
import type { FriendshipRow, ProfileMini } from '../../lib/types';
import './FriendsPage.scss';

type Relation = 'none' | 'friends' | 'incoming' | 'outgoing';

const PAGE_SIZE = 25;

const FRIENDS_SELECT =
  '*, requester:requester_id ( id, username, avatar ), addressee:addressee_id ( id, username, avatar )';

export function FriendsPage() {
  const { session } = useAuth();
  const me = session?.user.id ?? '';

  // "Your friends" — the only list that can realistically grow large, so it's
  // the one that's paginated.
  const [friends, setFriends] = useState<FriendshipRow[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsLoadingMore, setFriendsLoadingMore] = useState(false);
  const [friendsHasMore, setFriendsHasMore] = useState(true);
  const friendsCursorRef = useRef<string | null>(null);

  // Incoming pending requests — bounded/actionable, loaded in full.
  const [incoming, setIncoming] = useState<FriendshipRow[]>([]);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileMini[]>([]);
  const [resultRelations, setResultRelations] = useState<Map<string, Relation>>(new Map());
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFriendsPage = useCallback(
    async (before?: string | null) => {
      if (!me) return [] as FriendshipRow[];
      let q = supabase
        .from('friendships')
        .select(FRIENDS_SELECT)
        .eq('status', 'ACCEPTED')
        .or(`requester_id.eq.${me},addressee_id.eq.${me}`)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (before) q = q.lt('created_at', before);
      const { data } = await q;
      return (data ?? []) as unknown as FriendshipRow[];
    },
    [me],
  );

  const loadFirstFriendsPage = useCallback(() => {
    setFriendsLoading(true);
    void fetchFriendsPage().then((rows) => {
      setFriends(rows);
      friendsCursorRef.current = rows.length > 0 ? rows[rows.length - 1].created_at : null;
      setFriendsHasMore(rows.length === PAGE_SIZE);
      setFriendsLoading(false);
    });
  }, [fetchFriendsPage]);

  const loadMoreFriends = useCallback(() => {
    if (!friendsCursorRef.current) return;
    setFriendsLoadingMore(true);
    void fetchFriendsPage(friendsCursorRef.current).then((rows) => {
      setFriends((prev) => [...prev, ...rows]);
      friendsCursorRef.current = rows.length > 0 ? rows[rows.length - 1].created_at : null;
      setFriendsHasMore(rows.length === PAGE_SIZE);
      setFriendsLoadingMore(false);
    });
  }, [fetchFriendsPage]);

  const friendsSentinelRef = useInfiniteScroll(loadMoreFriends, {
    hasMore: friendsHasMore,
    loading: friendsLoadingMore,
  });

  const loadIncoming = useCallback(() => {
    if (!me) {
      setIncoming([]);
      return;
    }
    void supabase
      .from('friendships')
      .select('*, requester:requester_id ( id, username, avatar )')
      .eq('status', 'PENDING')
      .eq('addressee_id', me)
      .order('created_at', { ascending: false })
      .then(({ data }) => setIncoming((data ?? []) as unknown as FriendshipRow[]));
  }, [me]);

  useEffect(() => {
    loadFirstFriendsPage();
    loadIncoming();
  }, [loadFirstFriendsPage, loadIncoming]);

  // Relation of `me` to a specific set of other users — used only for search
  // results, so it never needs to load the (potentially large) full friend list.
  const loadRelationsFor = useCallback(
    async (ids: string[]) => {
      if (!me || ids.length === 0) return new Map<string, Relation>();
      const idList = ids.join(',');
      const { data } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id, status')
        .or(
          `and(requester_id.eq.${me},addressee_id.in.(${idList})),and(addressee_id.eq.${me},requester_id.in.(${idList}))`,
        );
      const map = new Map<string, Relation>();
      for (const f of (data ?? []) as { requester_id: string; addressee_id: string; status: string }[]) {
        const iAmRequester = f.requester_id === me;
        const otherId = iAmRequester ? f.addressee_id : f.requester_id;
        const relation: Relation =
          f.status === 'ACCEPTED' ? 'friends' : iAmRequester ? 'outgoing' : 'incoming';
        map.set(otherId, relation);
      }
      return map;
    },
    [me],
  );

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar')
      .ilike('username', `%${q}%`)
      .neq('id', me)
      .limit(12);
    const found = (data ?? []) as ProfileMini[];
    setResults(found);
    setResultRelations(await loadRelationsFor(found.map((p) => p.id)));
    setSearching(false);
  }

  async function act(path: string, body: unknown) {
    setError(null);
    try {
      await api(`/friends/${path}`, { method: 'POST', body });
      loadIncoming();
      if (path === 'respond' || path === 'remove') loadFirstFriendsPage();
      if (results.length > 0) setResultRelations(await loadRelationsFor(results.map((p) => p.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  const relationOf = (userId: string): Relation => resultRelations.get(userId) ?? 'none';

  return (
    <main className="friends">
      <header className="friends__header">
        <h1>Friends</h1>
      </header>

      {/* Invite link */}
      <section className="friends__section">
        <h2>Invite a friend</h2>
        <InviteShare />
      </section>

      {/* Search */}
      <section className="friends__section">
        <h2>Find people</h2>
        <form className="friends__search" onSubmit={runSearch}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username…"
          />
          <button className="button button--primary" disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
        {error && <p className="friends__error">{error}</p>}
        <ul className="friends__list">
          {results.map((p) => {
            const rel = relationOf(p.id);
            return (
              <li key={p.id} className="friends__row">
                <ProfileLink userId={p.id}>
                  <Avatar avatar={p.avatar ?? defaultAvatar(p.id)} size={36} />
                </ProfileLink>
                <ProfileLink userId={p.id} className="friends__name">
                  {p.username}
                </ProfileLink>
                {rel === 'friends' && <span className="muted">Friends</span>}
                {rel === 'outgoing' && <span className="muted">Requested</span>}
                {rel === 'incoming' && (
                  <button
                    className="button button--primary friends__btn"
                    onClick={() => act('respond', { requesterId: p.id, accept: true })}
                  >
                    Accept
                  </button>
                )}
                {rel === 'none' && (
                  <button
                    className="button friends__btn"
                    onClick={() => act('request', { userId: p.id })}
                  >
                    <PersonAddAlt1Icon fontSize="small" /> Add
                  </button>
                )}
              </li>
            );
          })}
          {results.length === 0 && query && !searching && (
            <li className="muted friends__empty">No users found.</li>
          )}
        </ul>
      </section>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <section className="friends__section">
          <h2>Requests</h2>
          <ul className="friends__list">
            {incoming.map((f) => (
              <li key={f.id} className="friends__row">
                <ProfileLink userId={f.requester_id}>
                  <Avatar
                    avatar={f.requester?.avatar ?? defaultAvatar(f.requester_id)}
                    size={36}
                  />
                </ProfileLink>
                <ProfileLink userId={f.requester_id} className="friends__name">
                  {f.requester?.username ?? 'Someone'}
                </ProfileLink>
                <button
                  className="button button--primary friends__btn"
                  onClick={() => act('respond', { requesterId: f.requester_id, accept: true })}
                >
                  Accept
                </button>
                <button
                  className="button friends__btn"
                  onClick={() => act('respond', { requesterId: f.requester_id, accept: false })}
                >
                  Decline
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Friends */}
      <section className="friends__section">
        <h2>Your friends</h2>
        {friendsLoading ? (
          <div className="section-loading">
            <Loader label="Loading your friends…" />
          </div>
        ) : friends.length === 0 ? (
          <p className="muted">No friends yet. Search above to add some.</p>
        ) : (
          <>
            <ul className="friends__list">
              {friends.map((f) => {
                const p = (f.requester_id === me ? f.addressee : f.requester) ?? null;
                if (!p) return null;
                return (
                  <li key={f.id} className="friends__row">
                    <ProfileLink userId={p.id}>
                      <Avatar avatar={p.avatar ?? defaultAvatar(p.id)} size={36} />
                    </ProfileLink>
                    <ProfileLink userId={p.id} className="friends__name">
                      {p.username}
                    </ProfileLink>
                    <button
                      className="button friends__btn"
                      onClick={() => act('remove', { userId: p.id })}
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
            <div ref={friendsSentinelRef} />
            {friendsLoadingMore && (
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

/** Your personal, reusable friend-invite link — copy or share it, and anyone
 * who opens it connects with you (signing up first if they're new). */
function InviteShare() {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    void getMyInviteToken().then(setToken).catch(() => setToken(null));
  }, []);

  const url = token ? inviteUrl(token) : '';
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — the link is still visible to select manually.
    }
  }

  async function share() {
    if (!url) return;
    try {
      await navigator.share({
        title: 'Draft Lobby',
        text: 'Connect with me on Draft Lobby',
        url,
      });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  }

  async function reset() {
    setResetting(true);
    try {
      setToken(await resetMyInviteToken());
    } catch {
      // Keep the old link on failure.
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="friends__invite">
      <p className="muted friends__invite-lead">
        Share your link — anyone who opens it can connect with you, even if
        they're new to Draft Lobby.
      </p>
      <div className="friends__invite-row">
        <input
          className="friends__invite-url"
          value={url}
          readOnly
          placeholder="Generating link…"
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Your invite link"
        />
        <button
          type="button"
          className="button button--primary friends__invite-copy"
          onClick={copy}
          disabled={!url}
        >
          <ContentCopyIcon fontSize="small" /> {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="friends__invite-actions">
        {canShare && (
          <button type="button" className="button friends__invite-btn" onClick={share} disabled={!url}>
            <IosShareIcon fontSize="small" /> Share
          </button>
        )}
        <button
          type="button"
          className="friends__invite-reset"
          onClick={reset}
          disabled={resetting || !token}
          title="Revoke this link and create a new one"
        >
          <RefreshIcon fontSize="small" /> {resetting ? 'Resetting…' : 'Reset link'}
        </button>
      </div>
    </div>
  );
}
