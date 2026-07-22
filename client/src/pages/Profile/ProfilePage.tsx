import { defaultAvatar } from '@draft-lobby/shared';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/Avatar/Avatar';
import { Loader } from '../../components/Loader/Loader';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { supabase } from '../../supabase';
import type { LobbyRow } from '../../lib/types';
import './ProfilePage.scss';

const PAST_PAGE_SIZE = 10;

interface MyLobby {
  role: string;
  archived: boolean;
  lobby: Pick<LobbyRow, 'id' | 'name' | 'status' | 'settings' | 'created_at'>;
}

interface RawRow {
  role: string;
  archived: boolean;
  lobbies: MyLobby['lobby'] | MyLobby['lobby'][] | null;
}

function toMyLobbies(rows: RawRow[]): MyLobby[] {
  return rows
    .map((r) => {
      // Supabase types the to-one relation as an array; it's a single row.
      const lobby = (Array.isArray(r.lobbies) ? r.lobbies[0] : r.lobbies) ?? undefined;
      return lobby ? { role: r.role, archived: !!r.archived, lobby } : null;
    })
    .filter((r): r is MyLobby => r !== null);
}

export function ProfilePage() {
  const { session } = useAuth();
  const [active, setActive] = useState<MyLobby[]>([]);
  const [archived, setArchived] = useState<MyLobby[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [past, setPast] = useState<MyLobby[]>([]);
  const [pastPage, setPastPage] = useState(0);
  const [pastTotal, setPastTotal] = useState(0);
  const [pastLoading, setPastLoading] = useState(true);

  const userId = session?.user.id;
  const username =
    (session?.user.user_metadata?.username as string | undefined) ??
    session?.user.email ??
    'drafter';

  useEffect(() => {
    if (!userId) return;
    setSectionsLoading(true);
    Promise.all([
      supabase
        .from('lobby_members')
        .select('role, archived, lobbies!inner ( id, name, status, settings, created_at )')
        .eq('user_id', userId)
        .eq('archived', false)
        .neq('lobbies.status', 'COMPLETE')
        .order('created_at', { foreignTable: 'lobbies', ascending: false }),
      supabase
        .from('lobby_members')
        .select('role, archived, lobbies ( id, name, status, settings, created_at )')
        .eq('user_id', userId)
        .eq('archived', true)
        .order('created_at', { foreignTable: 'lobbies', ascending: false }),
    ]).then(([activeRes, archivedRes]) => {
      setActive(toMyLobbies((activeRes.data ?? []) as unknown as RawRow[]));
      setArchived(toMyLobbies((archivedRes.data ?? []) as unknown as RawRow[]));
      setSectionsLoading(false);
    });
  }, [userId]);

  const loadPast = useCallback(
    (page: number) => {
      if (!userId) return;
      setPastLoading(true);
      void supabase
        .from('lobby_members')
        .select('role, archived, lobbies!inner ( id, name, status, settings, created_at )', {
          count: 'exact',
        })
        .eq('user_id', userId)
        .eq('archived', false)
        .eq('lobbies.status', 'COMPLETE')
        .order('created_at', { foreignTable: 'lobbies', ascending: false })
        .range(page * PAST_PAGE_SIZE, page * PAST_PAGE_SIZE + PAST_PAGE_SIZE - 1)
        .then(({ data, count }) => {
          setPast(toMyLobbies((data ?? []) as unknown as RawRow[]));
          setPastTotal(count ?? 0);
          setPastLoading(false);
        });
    },
    [userId],
  );

  useEffect(() => {
    loadPast(pastPage);
  }, [loadPast, pastPage]);

  async function setLobbyArchived(row: MyLobby, archivedNext: boolean) {
    // Optimistic — the flag is personal so there's no conflict to reconcile.
    if (archivedNext) {
      setActive((prev) => prev.filter((r) => r.lobby.id !== row.lobby.id));
      setPast((prev) => prev.filter((r) => r.lobby.id !== row.lobby.id));
      setArchived((prev) => [{ ...row, archived: true }, ...prev]);
    } else {
      setArchived((prev) => prev.filter((r) => r.lobby.id !== row.lobby.id));
      if (row.lobby.status === 'COMPLETE') loadPast(pastPage);
      else setActive((prev) => [{ ...row, archived: false }, ...prev]);
    }
    try {
      await api(`/lobbies/${row.lobby.id}/archive`, {
        method: 'POST',
        body: { archived: archivedNext },
      });
    } catch {
      // Revert on failure by reloading both sources of truth.
      if (archivedNext) setArchived((prev) => prev.filter((r) => r.lobby.id !== row.lobby.id));
      loadPast(pastPage);
    }
  }

  const pastPageCount = Math.max(1, Math.ceil(pastTotal / PAST_PAGE_SIZE));

  return (
    <main className="profile">
      <header className="profile__header">
        <div className="profile__identity">
          <Avatar avatar={defaultAvatar(userId ?? username)} size={32} />
          <h1>{username}</h1>
        </div>
      </header>

      {sectionsLoading ? (
        <div className="section-loading">
          <Loader label="Loading your drafts…" />
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="profile__section">
              <h2>Active &amp; upcoming</h2>
              <LobbyList
                rows={active}
                renderAction={(row) => (
                  <button
                    type="button"
                    className="lobby-list__action"
                    aria-label={`Archive ${row.lobby.name}`}
                    title="Archive"
                    onClick={() => setLobbyArchived(row, true)}
                  >
                    <ArchiveOutlinedIcon fontSize="small" />
                  </button>
                )}
              />
            </section>
          )}

          <section className="profile__section">
            <h2>Past drafts</h2>
            {pastLoading ? (
              <div className="section-loading section-loading--inline">
                <Loader label="Loading…" />
              </div>
            ) : past.length === 0 ? (
              <p className="muted">No completed drafts yet.</p>
            ) : (
              <>
                <LobbyList
                  rows={past}
                  renderAction={(row) => (
                    <button
                      type="button"
                      className="lobby-list__action"
                      aria-label={`Archive ${row.lobby.name}`}
                      title="Archive"
                      onClick={() => setLobbyArchived(row, true)}
                    >
                      <ArchiveOutlinedIcon fontSize="small" />
                    </button>
                  )}
                />
                {pastPageCount > 1 && (
                  <div className="profile__pager">
                    <button
                      type="button"
                      className="profile__pager-btn"
                      disabled={pastPage === 0}
                      onClick={() => setPastPage((p) => Math.max(0, p - 1))}
                      aria-label="Previous page"
                    >
                      <ChevronLeftIcon fontSize="small" />
                    </button>
                    <span className="muted">
                      Page {pastPage + 1} of {pastPageCount}
                    </span>
                    <button
                      type="button"
                      className="profile__pager-btn"
                      disabled={pastPage >= pastPageCount - 1}
                      onClick={() => setPastPage((p) => Math.min(pastPageCount - 1, p + 1))}
                      aria-label="Next page"
                    >
                      <ChevronRightIcon fontSize="small" />
                    </button>
                  </div>
                )}
              </>
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
                      onClick={() => setLobbyArchived(row, false)}
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
