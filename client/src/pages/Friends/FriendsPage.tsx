import { defaultAvatar } from '@draft-lobby/shared';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar/Avatar';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { supabase } from '../../supabase';
import type { FriendshipRow, ProfileMini } from '../../lib/types';
import './FriendsPage.scss';

type Relation = 'none' | 'friends' | 'incoming' | 'outgoing';

export function FriendsPage() {
  const { session } = useAuth();
  const me = session?.user.id ?? '';

  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileMini[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFriendships = useCallback(() => {
    void supabase
      .from('friendships')
      .select(
        '*, requester:requester_id ( id, username, avatar ), addressee:addressee_id ( id, username, avatar )',
      )
      .then(({ data }) => setFriendships((data ?? []) as unknown as FriendshipRow[]));
  }, []);

  useEffect(() => {
    loadFriendships();
  }, [loadFriendships]);

  // Relationship + counterpart profile keyed by the other user's id.
  const relations = useMemo(() => {
    const map = new Map<string, { relation: Relation; profile: ProfileMini | null }>();
    for (const f of friendships) {
      const iAmRequester = f.requester_id === me;
      const otherId = iAmRequester ? f.addressee_id : f.requester_id;
      const profile = (iAmRequester ? f.addressee : f.requester) ?? null;
      const relation: Relation =
        f.status === 'ACCEPTED' ? 'friends' : iAmRequester ? 'outgoing' : 'incoming';
      map.set(otherId, { relation, profile });
    }
    return map;
  }, [friendships, me]);

  const friends = useMemo(
    () =>
      friendships
        .filter((f) => f.status === 'ACCEPTED')
        .map((f) => (f.requester_id === me ? f.addressee : f.requester))
        .filter((p): p is ProfileMini => !!p),
    [friendships, me],
  );
  const incoming = useMemo(
    () =>
      friendships.filter((f) => f.status === 'PENDING' && f.addressee_id === me),
    [friendships, me],
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
    setResults((data ?? []) as ProfileMini[]);
    setSearching(false);
  }

  async function act(path: string, body: unknown) {
    setError(null);
    try {
      await api(`/friends/${path}`, { method: 'POST', body });
      loadFriendships();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  const relationOf = (userId: string): Relation =>
    relations.get(userId)?.relation ?? 'none';

  return (
    <main className="friends">
      <header className="friends__header">
        <h1>Friends</h1>
      </header>

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
                <Avatar avatar={p.avatar ?? defaultAvatar(p.id)} size={36} />
                <span className="friends__name">{p.username}</span>
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
                <Avatar
                  avatar={f.requester?.avatar ?? defaultAvatar(f.requester_id)}
                  size={36}
                />
                <span className="friends__name">{f.requester?.username ?? 'Someone'}</span>
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
        <h2>Your friends ({friends.length})</h2>
        {friends.length === 0 ? (
          <p className="muted">No friends yet. Search above to add some.</p>
        ) : (
          <ul className="friends__list">
            {friends.map((p) => (
              <li key={p.id} className="friends__row">
                <Avatar avatar={p.avatar ?? defaultAvatar(p.id)} size={36} />
                <span className="friends__name">{p.username}</span>
                <button
                  className="button friends__btn"
                  onClick={() => act('remove', { userId: p.id })}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
