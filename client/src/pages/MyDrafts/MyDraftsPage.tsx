import { SCORING_PRESETS, canDeleteLobby, defaultAvatar, matchPreset } from '@draft-lobby/shared';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import SensorsOutlinedIcon from '@mui/icons-material/SensorsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import UnarchiveOutlinedIcon from '@mui/icons-material/UnarchiveOutlined';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/Avatar/Avatar';
import { ConfirmModal } from '../../components/ConfirmModal/ConfirmModal';
import { CopyDraftModal } from '../../components/CopyDraftModal/CopyDraftModal';
import { Loader } from '../../components/Loader/Loader';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { supabase } from '../../supabase';
import type { LobbyRow } from '../../lib/types';
import './MyDraftsPage.scss';

const PAST_PAGE_SIZE = 10;

type DraftModeFilter = 'ALL' | 'LIVE' | 'MOCK';
type VisibilityFilter = 'ALL' | 'PRIVATE' | 'OPEN';
type SortOrder = 'NEWEST' | 'OLDEST' | 'NAME';

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

// PostgREST's order-by-embedded-resource (`.order(col, { foreignTable })`)
// doesn't actually reorder the parent `lobby_members` rows against this
// project's Supabase instance — confirmed empirically, rows came back in
// roughly insertion order regardless of what was requested. Sorting here
// client-side, on the already-fetched `lobbies` data, sidesteps it entirely.
function sortMyLobbies(rows: MyLobby[], order: SortOrder): MyLobby[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (order === 'NAME') return a.lobby.name.localeCompare(b.lobby.name);
    const diff =
      new Date(a.lobby.created_at).getTime() - new Date(b.lobby.created_at).getTime();
    return order === 'OLDEST' ? diff : -diff;
  });
  return sorted;
}

export function MyDraftsPage() {
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const username =
    profile?.username ??
    (session?.user.user_metadata?.username as string | undefined) ??
    session?.user.email ??
    'drafter';

  const [active, setActive] = useState<MyLobby[]>([]);
  const [archived, setArchived] = useState<MyLobby[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [past, setPast] = useState<MyLobby[]>([]);
  const [pastPage, setPastPage] = useState(0);
  const [pastTotal, setPastTotal] = useState(0);
  const [pastLoading, setPastLoading] = useState(true);

  const [draftModeFilter, setDraftModeFilter] = useState<DraftModeFilter>('ALL');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('ALL');
  const [sortOrder, setSortOrder] = useState<SortOrder>('NEWEST');

  // The draft currently being copied (opens CopyDraftModal).
  const [copySource, setCopySource] = useState<MyLobby['lobby'] | null>(null);
  // The draft pending delete (opens the confirm modal).
  const [deleteTarget, setDeleteTarget] = useState<MyLobby | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setSectionsLoading(true);
    let activeQ = supabase
      .from('lobby_members')
      .select('role, archived, lobbies!inner ( id, name, status, settings, created_at )')
      .eq('user_id', userId)
      .eq('archived', false)
      .neq('lobbies.status', 'COMPLETE');
    let archivedQ = supabase
      .from('lobby_members')
      .select('role, archived, lobbies!inner ( id, name, status, settings, created_at )')
      .eq('user_id', userId)
      .eq('archived', true);
    if (draftModeFilter !== 'ALL') {
      activeQ = activeQ.eq('lobbies.settings->>draftMode', draftModeFilter);
      archivedQ = archivedQ.eq('lobbies.settings->>draftMode', draftModeFilter);
    }
    if (visibilityFilter !== 'ALL') {
      activeQ = activeQ.eq('lobbies.settings->>visibility', visibilityFilter);
      archivedQ = archivedQ.eq('lobbies.settings->>visibility', visibilityFilter);
    }
    Promise.all([activeQ, archivedQ]).then(([activeRes, archivedRes]) => {
      setActive(
        sortMyLobbies(toMyLobbies((activeRes.data ?? []) as unknown as RawRow[]), sortOrder),
      );
      setArchived(
        sortMyLobbies(toMyLobbies((archivedRes.data ?? []) as unknown as RawRow[]), sortOrder),
      );
      setSectionsLoading(false);
    });
  }, [userId, draftModeFilter, visibilityFilter, sortOrder]);

  const loadPast = useCallback(
    (page: number) => {
      if (!userId) return;
      setPastLoading(true);
      let q = supabase
        .from('lobby_members')
        .select('role, archived, lobbies!inner ( id, name, status, settings, created_at )')
        .eq('user_id', userId)
        .eq('archived', false)
        .eq('lobbies.status', 'COMPLETE');
      if (draftModeFilter !== 'ALL') q = q.eq('lobbies.settings->>draftMode', draftModeFilter);
      if (visibilityFilter !== 'ALL') q = q.eq('lobbies.settings->>visibility', visibilityFilter);
      // No server-side range/order here — see sortMyLobbies for why. The full
      // set of a single user's past drafts is small, so fetching it all and
      // paginating the (correctly) sorted array client-side is cheap.
      void q.then(({ data }) => {
        const sorted = sortMyLobbies(toMyLobbies((data ?? []) as unknown as RawRow[]), sortOrder);
        setPastTotal(sorted.length);
        setPast(sorted.slice(page * PAST_PAGE_SIZE, page * PAST_PAGE_SIZE + PAST_PAGE_SIZE));
        setPastLoading(false);
      });
    },
    [userId, draftModeFilter, visibilityFilter, sortOrder],
  );

  useEffect(() => {
    loadPast(pastPage);
  }, [loadPast, pastPage]);

  // Restart pagination whenever the filters/sort change underneath it.
  useEffect(() => {
    setPastPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftModeFilter, visibilityFilter, sortOrder]);

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

  async function confirmDeleteLobby() {
    if (!deleteTarget) return;
    const id = deleteTarget.lobby.id;
    setDeleting(true);
    try {
      await api(`/lobbies/${id}`, { method: 'DELETE' });
      setActive((prev) => prev.filter((r) => r.lobby.id !== id));
      setArchived((prev) => prev.filter((r) => r.lobby.id !== id));
      setDeleteTarget(null);
    } catch {
      // Keep the modal open so they can retry.
    } finally {
      setDeleting(false);
    }
  }

  const pastPageCount = Math.max(1, Math.ceil(pastTotal / PAST_PAGE_SIZE));

  /** Copy action shared by every section's row. */
  const copyButton = (row: MyLobby) => (
    <button
      type="button"
      className="lobby-list__action"
      aria-label={`Copy ${row.lobby.name}`}
      title="Copy draft"
      onClick={() => setCopySource(row.lobby)}
    >
      <ContentCopyIcon fontSize="small" />
    </button>
  );

  /** Delete action — only for a commissioner on a not-yet-drafting draft; self-
   * gates so it can be dropped into any section's row (returns null otherwise). */
  const deleteButton = (row: MyLobby) =>
    (row.role === 'COMMISSIONER' || row.role === 'SUB_COMMISSIONER') &&
    canDeleteLobby(row.lobby.status) ? (
      <button
        type="button"
        className="lobby-list__action lobby-list__action--danger"
        aria-label={`Delete ${row.lobby.name}`}
        title="Delete draft"
        onClick={() => setDeleteTarget(row)}
      >
        <DeleteOutlineIcon fontSize="small" />
      </button>
    ) : null;

  return (
    <main className="my-drafts">
      <header className="my-drafts__header">
        <div className="my-drafts__identity">
          <Avatar avatar={profile?.avatar ?? defaultAvatar(userId ?? username)} size={32} />
          <h1>{username}'s drafts</h1>
        </div>
      </header>

      <div className="my-drafts__filters">
        <div className="segmented">
          {(['ALL', 'LIVE', 'MOCK'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`segmented__opt${draftModeFilter === v ? ' segmented__opt--on' : ''}`}
              onClick={() => setDraftModeFilter(v)}
            >
              {v === 'ALL' ? (
                'All'
              ) : v === 'LIVE' ? (
                <>
                  <SensorsOutlinedIcon fontSize="inherit" /> Live
                </>
              ) : (
                <>
                  <SmartToyOutlinedIcon fontSize="inherit" /> Mock
                </>
              )}
            </button>
          ))}
        </div>
        <div className="segmented">
          {(['ALL', 'PRIVATE', 'OPEN'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`segmented__opt${visibilityFilter === v ? ' segmented__opt--on' : ''}`}
              onClick={() => setVisibilityFilter(v)}
            >
              {v === 'ALL' ? (
                'All'
              ) : v === 'PRIVATE' ? (
                <>
                  <LockOutlinedIcon fontSize="inherit" /> Private
                </>
              ) : (
                <>
                  <PublicOutlinedIcon fontSize="inherit" /> Open
                </>
              )}
            </button>
          ))}
        </div>
        <select
          className="my-drafts__sort"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          aria-label="Sort drafts"
        >
          <option value="NEWEST">Newest first</option>
          <option value="OLDEST">Oldest first</option>
          <option value="NAME">Name (A–Z)</option>
        </select>
      </div>

      {sectionsLoading ? (
        <div className="section-loading">
          <Loader label="Loading your drafts…" />
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="my-drafts__section">
              <h2>Active &amp; upcoming</h2>
              <LobbyList
                rows={active}
                renderAction={(row) => (
                  <>
                    {copyButton(row)}
                    <button
                      type="button"
                      className="lobby-list__action"
                      aria-label={`Archive ${row.lobby.name}`}
                      title="Archive"
                      onClick={() => setLobbyArchived(row, true)}
                    >
                      <ArchiveOutlinedIcon fontSize="small" />
                    </button>
                    {deleteButton(row)}
                  </>
                )}
              />
            </section>
          )}

          <section className="my-drafts__section">
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
                    <>
                      {copyButton(row)}
                      <button
                        type="button"
                        className="lobby-list__action"
                        aria-label={`Archive ${row.lobby.name}`}
                        title="Archive"
                        onClick={() => setLobbyArchived(row, true)}
                      >
                        <ArchiveOutlinedIcon fontSize="small" />
                      </button>
                    </>
                  )}
                />
                {pastPageCount > 1 && (
                  <div className="my-drafts__pager">
                    <button
                      type="button"
                      className="my-drafts__pager-btn"
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
                      className="my-drafts__pager-btn"
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
            <section className="my-drafts__section">
              <button
                type="button"
                className="my-drafts__archived-toggle"
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived ? '▾' : '▸'} Archived ({archived.length})
              </button>
              {showArchived && (
                <LobbyList
                  rows={archived}
                  renderAction={(row) => (
                    <>
                      {copyButton(row)}
                      <button
                        type="button"
                        className="lobby-list__action"
                        aria-label={`Unarchive ${row.lobby.name}`}
                        title="Unarchive"
                        onClick={() => setLobbyArchived(row, false)}
                      >
                        <UnarchiveOutlinedIcon fontSize="small" />
                      </button>
                      {deleteButton(row)}
                    </>
                  )}
                />
              )}
            </section>
          )}
        </>
      )}

      {copySource && (
        <CopyDraftModal source={copySource} onClose={() => setCopySource(null)} />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete this draft?"
          confirmLabel="Delete draft"
          busyLabel="Deleting…"
          busy={deleting}
          danger
          onConfirm={confirmDeleteLobby}
          onClose={() => setDeleteTarget(null)}
        >
          This permanently deletes <strong>{deleteTarget.lobby.name}</strong> and all of its
          teams and settings. This can’t be undone.
        </ConfirmModal>
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
        const { settings } = lobby;
        const live = lobby.status === 'DRAFTING' || lobby.status === 'COMPLETE';
        const to = live ? `/lobby/${lobby.id}/draft` : `/lobby/${lobby.id}`;
        const preset = matchPreset(settings.scoring);
        return (
          <li key={lobby.id} className="lobby-list__item">
            <Link to={to} className="lobby-list__row">
              <div className="lobby-list__main">
                <div className="lobby-list__name-row">
                  <span className="lobby-list__name">{lobby.name}</span>
                  <span className="lobby-list__badge">
                    {settings.draftMode === 'MOCK' ? (
                      <>
                        <SmartToyOutlinedIcon fontSize="inherit" /> Mock
                      </>
                    ) : (
                      <>
                        <SensorsOutlinedIcon fontSize="inherit" /> Live
                      </>
                    )}
                  </span>
                  <span className="lobby-list__badge">
                    {settings.visibility === 'OPEN' ? (
                      <>
                        <PublicOutlinedIcon fontSize="inherit" /> Open
                      </>
                    ) : (
                      <>
                        <LockOutlinedIcon fontSize="inherit" /> Private
                      </>
                    )}
                  </span>
                </div>
                <span className="muted">
                  {settings.teamCount} teams · {settings.draftType === 'SNAKE' ? 'Snake' : 'Straight'}
                  {' · '}
                  {preset ? SCORING_PRESETS[preset].label : 'Custom scoring'} ·{' '}
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
            {renderAction && <div className="lobby-list__actions">{renderAction(row)}</div>}
          </li>
        );
      })}
    </ul>
  );
}
