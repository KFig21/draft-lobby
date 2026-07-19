import { defaultAvatar } from '@draft-lobby/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/Avatar/Avatar';
import { useAuth } from '../../auth/AuthContext';
import { supabase } from '../../supabase';
import type { LobbyRow } from '../../lib/types';
import './ProfilePage.scss';

interface MyLobby {
  role: string;
  lobby: Pick<LobbyRow, 'id' | 'name' | 'status' | 'settings' | 'created_at'>;
}

export function ProfilePage() {
  const { session } = useAuth();
  const [lobbies, setLobbies] = useState<MyLobby[]>([]);
  const [loading, setLoading] = useState(true);

  const userId = session?.user.id;
  const username =
    (session?.user.user_metadata?.username as string | undefined) ??
    session?.user.email ??
    'drafter';

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('lobby_members')
      .select('role, lobbies ( id, name, status, settings, created_at )')
      .eq('user_id', userId)
      .then(({ data }) => {
        const rows: MyLobby[] = (data ?? [])
          .map((r) => {
            // Supabase types the to-one relation as an array; it's a single row.
            const lobby = (
              Array.isArray(r.lobbies) ? r.lobbies[0] : r.lobbies
            ) as MyLobby['lobby'] | undefined;
            return lobby ? { role: r.role as string, lobby } : null;
          })
          .filter((r): r is MyLobby => r !== null)
          .sort(
            (a, b) =>
              new Date(b.lobby.created_at).getTime() -
              new Date(a.lobby.created_at).getTime(),
          );
        setLobbies(rows);
        setLoading(false);
      });
  }, [userId]);

  const drafts = lobbies.filter((l) => l.lobby.status === 'COMPLETE');
  const active = lobbies.filter((l) => l.lobby.status !== 'COMPLETE');

  return (
    <main className="profile">
      <header className="profile__header">
        <Link to="/home" className="back-link">
          ← Home
        </Link>
        <div className="profile__identity">
          <Avatar avatar={defaultAvatar(userId ?? username)} size={64} />
          <h1>{username}</h1>
        </div>
      </header>

      {loading ? (
        <p className="muted">Loading your drafts…</p>
      ) : (
        <>
          {active.length > 0 && (
            <section className="profile__section">
              <h2>Active &amp; upcoming</h2>
              <LobbyList rows={active} />
            </section>
          )}

          <section className="profile__section">
            <h2>Past drafts</h2>
            {drafts.length === 0 ? (
              <p className="muted">No completed drafts yet.</p>
            ) : (
              <LobbyList rows={drafts} />
            )}
          </section>
        </>
      )}
    </main>
  );
}

function LobbyList({ rows }: { rows: MyLobby[] }) {
  return (
    <ul className="lobby-list">
      {rows.map(({ lobby, role }) => {
        const live = lobby.status === 'DRAFTING' || lobby.status === 'COMPLETE';
        const to = live ? `/lobby/${lobby.id}/draft` : `/lobby/${lobby.id}`;
        return (
          <li key={lobby.id}>
            <Link to={to} className="lobby-list__row">
              <div className="lobby-list__main">
                <span className="lobby-list__name">{lobby.name}</span>
                <span className="muted">
                  {lobby.settings.teamCount} teams ·{' '}
                  {new Date(lobby.created_at).toLocaleDateString()}
                  {role === 'COMMISSIONER' ? ' · Commissioner' : ''}
                </span>
              </div>
              <span
                className={`status-pill status-pill--${lobby.status.toLowerCase()}`}
              >
                {lobby.status}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
