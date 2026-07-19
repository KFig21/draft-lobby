import { defaultAvatar } from '@draft-lobby/shared';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/Avatar/Avatar';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { supabase } from '../../supabase';
import type { LobbyRow } from '../../lib/types';
import './ProfilePage.scss';

interface MyLobby {
  role: string;
  archived: boolean;
  lobby: Pick<LobbyRow, 'id' | 'name' | 'status' | 'settings' | 'created_at'>;
}

export function ProfilePage() {
  const { session } = useAuth();
  const [lobbies, setLobbies] = useState<MyLobby[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const userId = session?.user.id;
  const username =
    (session?.user.user_metadata?.username as string | undefined) ??
    session?.user.email ??
    'drafter';

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('lobby_members')
      .select('role, archived, lobbies ( id, name, status, settings, created_at )')
      .eq('user_id', userId)
      .then(({ data }) => {
        const rows: MyLobby[] = (data ?? [])
          .map((r) => {
            // Supabase types the to-one relation as an array; it's a single row.
            const lobby = (
              Array.isArray(r.lobbies) ? r.lobbies[0] : r.lobbies
            ) as MyLobby['lobby'] | undefined;
            return lobby
              ? { role: r.role as string, archived: !!r.archived, lobby }
              : null;
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

  async function setArchived(lobbyId: string, archived: boolean) {
    // Optimistic; the flag is personal so there's no conflict to reconcile.
    setLobbies((prev) =>
      prev.map((r) => (r.lobby.id === lobbyId ? { ...r, archived } : r)),
    );
    try {
      await api(`/lobbies/${lobbyId}/archive`, { method: 'POST', body: { archived } });
    } catch {
      setLobbies((prev) =>
        prev.map((r) => (r.lobby.id === lobbyId ? { ...r, archived: !archived } : r)),
      );
    }
  }

  const active = lobbies.filter((l) => !l.archived && l.lobby.status !== 'COMPLETE');
  const past = lobbies.filter((l) => !l.archived && l.lobby.status === 'COMPLETE');
  const archived = lobbies.filter((l) => l.archived);

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
            {past.length === 0 ? (
              <p className="muted">No completed drafts yet.</p>
            ) : (
              <LobbyList
                rows={past}
                renderAction={(row) => (
                  <button
                    type="button"
                    className="lobby-list__action"
                    aria-label={`Archive ${row.lobby.name}`}
                    title="Archive"
                    onClick={() => setArchived(row.lobby.id, true)}
                  >
                    <ArchiveOutlinedIcon fontSize="small" />
                  </button>
                )}
              />
            )}
          </section>

          {archived.length > 0 && (
            <section className="profile__section">
              <button
                type="button"
                className="profile__archived-toggle"
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived ? '▾' : '▸'} Archived ({archived.length})
              </button>
              {showArchived && (
                <LobbyList
                  rows={archived}
                  renderAction={(row) => (
                    <button
                      type="button"
                      className="lobby-list__action"
                      aria-label={`Unarchive ${row.lobby.name}`}
                      title="Unarchive"
                      onClick={() => setArchived(row.lobby.id, false)}
                    >
                      <UnarchiveOutlinedIcon fontSize="small" />
                    </button>
                  )}
                />
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

function LobbyList({
  rows,
  renderAction,
}: {
  rows: MyLobby[];
  renderAction?: (row: MyLobby) => ReactNode;
}) {
  return (
    <ul className="lobby-list">
      {rows.map((row) => {
        const { lobby, role } = row;
        const live = lobby.status === 'DRAFTING' || lobby.status === 'COMPLETE';
        const to = live ? `/lobby/${lobby.id}/draft` : `/lobby/${lobby.id}`;
        return (
          <li key={lobby.id} className="lobby-list__item">
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
            {renderAction?.(row)}
          </li>
        );
      })}
    </ul>
  );
}
