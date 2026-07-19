import {
  POSITIONS,
  draftPositionForOverall,
  roundsForSettings,
  type Position,
} from '@draft-lobby/shared';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SportsFootballIcon from '@mui/icons-material/SportsFootball';
import UndoIcon from '@mui/icons-material/Undo';
import type { SvgIconComponent } from '@mui/icons-material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { DraftChat } from '../../components/DraftChat/DraftChat';
import { DraftGrid } from '../../components/DraftGrid/DraftGrid';
import { LockInModal } from '../../components/LockInModal/LockInModal';
import { NavDrawer } from '../../components/Navbar/NavDrawer';
import { PickClock } from '../../components/PickClock/PickClock';
import { PlayerCard } from '../../components/PlayerCard/PlayerCard';
import { TeamLineup } from '../../components/TeamLineup/TeamLineup';
import { useAuth } from '../../auth/AuthContext';
import { useLobby } from '../../hooks/useLobby';
import { usePlayers } from '../../hooks/usePlayers';
import { api } from '../../lib/api';
import { exportDraftCsv, exportDraftExcel } from '../../lib/exportDraft';
import type { PlayerRow, TeamRow } from '../../lib/types';
import './DraftBoardPage.scss';

type Filter = 'ALL' | Position;
type PanelTab = 'players' | 'roster' | 'chat';
type MobileTab = 'board' | PanelTab;

// The right sidebar's tabs (desktop) — labels shown in the tab strip.
const SIDEBAR_TABS: { key: PanelTab; label: string; Icon: SvgIconComponent }[] = [
  { key: 'players', label: 'Players & queue', Icon: SportsFootballIcon },
  { key: 'roster', label: 'Roster', Icon: FormatListBulletedIcon },
  { key: 'chat', label: 'Chat', Icon: ChatBubbleOutlineIcon },
];
// Bottom-bar sections (mobile) — Board plus the three sidebar tabs.
const MOBILE_TABS: { key: MobileTab; label: string; Icon: SvgIconComponent }[] = [
  { key: 'board', label: 'Board', Icon: GridViewOutlinedIcon },
  { key: 'players', label: 'Players', Icon: SportsFootballIcon },
  { key: 'roster', label: 'Roster', Icon: FormatListBulletedIcon },
  { key: 'chat', label: 'Chat', Icon: ChatBubbleOutlineIcon },
];

const MIN_SIDEBAR = 300;
const MAX_SIDEBAR = 600;

export function DraftBoardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { lobby, teams, members, picks, loading } = useLobby(id);
  const { players, loading: playersLoading } = usePlayers();

  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('board');
  const [panelTab, setPanelTab] = useState<PanelTab>('players');
  const [rosterTeamSel, setRosterTeamSel] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [selected, setSelected] = useState<PlayerRow | null>(null);
  const [pickBusy, setPickBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commishBusy, setCommishBusy] = useState(false);
  const [commishError, setCommishError] = useState<string | null>(null);
  const [reqPauseBusy, setReqPauseBusy] = useState(false);

  // Resizable sidebar (desktop). Persisted across sessions.
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem('draftSidebarWidth'));
    return saved >= MIN_SIDEBAR && saved <= MAX_SIDEBAR ? saved : 380;
  });
  const draggingRef = useRef(false);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const w = window.innerWidth - e.clientX;
      setSidebarWidth(Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, w)));
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);
  useEffect(() => {
    localStorage.setItem('draftSidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }

  const userId = session?.user.id;

  const playersById = useMemo(() => {
    const m = new Map<string, PlayerRow>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  const draftedIds = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);

  const teamsById = useMemo(() => {
    const m = new Map<string, TeamRow>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  function doExport(kind: 'csv' | 'xls') {
    const opts = { lobbyName: lobby?.name ?? 'draft', picks, teamsById, playersById };
    if (kind === 'csv') exportDraftCsv(opts);
    else exportDraftExcel(opts);
  }

  const derived = useMemo(() => {
    if (!lobby) return null;
    const s = lobby.settings;
    const overall = lobby.current_overall;
    const round = Math.floor((overall - 1) / s.teamCount) + 1;
    const onClockPosition = draftPositionForOverall(overall, s.teamCount, s.draftType);
    const onClockTeam = teams.find((t) => t.draft_position === onClockPosition) ?? null;
    return { s, overall, round, onClockTeam };
  }, [lobby, teams]);

  const isCommish = useMemo(() => {
    if (!userId || !lobby) return false;
    if (lobby.commissioner_id === userId) return true;
    return members.some((m) => m.user_id === userId && m.role === 'SUB_COMMISSIONER');
  }, [userId, lobby, members]);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      if (draftedIds.has(p.id)) return false;
      if (filter !== 'ALL' && p.position !== filter) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [players, draftedIds, filter, search]);

  if (loading || playersLoading) return <div className="loading">Loading draft…</div>;
  if (!lobby) return <div className="loading">Lobby not found</div>;
  if (lobby.status === 'SETUP' || lobby.status === 'SCHEDULED')
    return <Navigate to={`/lobby/${id}`} replace />;

  const { round, onClockTeam } = derived!;
  const isComplete = lobby.status === 'COMPLETE';
  const isPaused = lobby.status === 'PAUSED';
  const isMyTurn = !!onClockTeam && onClockTeam.owner_id === userId;
  const canPick = !isComplete && !isPaused && (isMyTurn || isCommish);
  const pickingForTeam = !isMyTurn && onClockTeam ? onClockTeam.name : null;
  const myTeamId = teams.find((t) => t.owner_id === userId)?.id ?? teams[0]?.id ?? null;
  const rosterTeamId = rosterTeamSel ?? myTeamId ?? teams[0]?.id ?? '';

  // Queued players still on the board, in queue order.
  const queuedPlayers = queue
    .map((pid) => playersById.get(pid))
    .filter((p): p is PlayerRow => !!p && !draftedIds.has(p.id));

  function toggleQueue(pid: string) {
    setQueue((q) => (q.includes(pid) ? q.filter((x) => x !== pid) : [...q, pid]));
  }
  function openTeamRoster(teamId: string) {
    setRosterTeamSel(teamId);
    setPanelTab('roster');
    setMobileTab('roster');
  }

  async function confirmPick() {
    if (!selected) return;
    setPickError(null);
    setPickBusy(true);
    try {
      await api(`/lobbies/${id}/pick`, { method: 'POST', body: { playerId: selected.id } });
      setSelected(null);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Pick failed');
    } finally {
      setPickBusy(false);
    }
  }

  async function commishAction(path: 'pause' | 'resume' | 'rollback') {
    if (path === 'rollback' && !confirm('Undo the most recent pick?')) return;
    setCommishError(null);
    setCommishBusy(true);
    try {
      await api(`/lobbies/${id}/${path}`, { method: 'POST' });
    } catch (err) {
      setCommishError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setCommishBusy(false);
    }
  }

  async function requestPause() {
    setReqPauseBusy(true);
    try {
      await api(`/lobbies/${id}/request-pause`, { method: 'POST' });
    } catch {
      /* the alert is best-effort */
    } finally {
      setReqPauseBusy(false);
    }
  }

  return (
    <div className="draft">
      <header className="draft__topbar">
        <Link to={`/lobby/${id}`} className="back-link draft__desktop-only">
          ← Room
        </Link>
        <div className="draft__status">
          {isComplete ? (
            <strong className="draft__complete">🏆 Draft complete</strong>
          ) : (
            <>
              <span className="draft__onclock-team">
                {onClockTeam ? onClockTeam.name : 'Waiting…'}
                {isMyTurn && !isPaused && (
                  <span className="draft__yourturn">Your pick</span>
                )}
                {isPaused && <span className="draft__paused-pill">Paused</span>}
              </span>
              <span className="muted">
                Round {round} · Pick {lobby.current_overall}
              </span>
            </>
          )}
        </div>
        {isComplete ? (
          <div className="draft__actions draft__desktop-only">
            <div className="draft__export">
              <button className="button" onClick={() => doExport('csv')}>
                Export CSV
              </button>
              <button className="button" onClick={() => doExport('xls')}>
                Excel
              </button>
            </div>
            <button className="button button--primary" onClick={() => navigate('/home')}>
              Home
            </button>
          </div>
        ) : (
          <PickClock deadline={lobby.pick_deadline} />
        )}
      </header>

      {isCommish && !isComplete && (
        <div className="draft__commish">
          {isPaused ? (
            <button
              className="button draft__commish-btn"
              onClick={() => commishAction('resume')}
              disabled={commishBusy}
            >
              <PlayArrowIcon fontSize="small" /> Resume
            </button>
          ) : (
            <button
              className="button draft__commish-btn"
              onClick={() => commishAction('pause')}
              disabled={commishBusy}
            >
              <PauseIcon fontSize="small" /> Pause
            </button>
          )}
          <button
            className="button draft__commish-btn"
            onClick={() => commishAction('rollback')}
            disabled={commishBusy || picks.length === 0}
          >
            <UndoIcon fontSize="small" /> Undo last pick
          </button>
          {commishError && <span className="draft__commish-error">{commishError}</span>}
        </div>
      )}

      {!isCommish && !isComplete && !isPaused && (
        <div className="draft__commish">
          <button
            className="button draft__commish-btn"
            onClick={requestPause}
            disabled={reqPauseBusy}
          >
            🙋 Request pause
          </button>
        </div>
      )}

      {isPaused && (
        <div className="draft__paused-banner">
          The draft is paused
          {isCommish ? '.' : ' by the commissioner.'}
        </div>
      )}

      <div className="draft__body">
        <section
          className={`draft__board ${mobileTab === 'board' ? 'is-mobile-active' : ''}`}
        >
          <DraftGrid
            teams={teams}
            rounds={roundsForSettings(lobby.settings)}
            picks={picks}
            playersById={playersById}
            onClockTeamId={onClockTeam?.id ?? null}
            currentRound={round}
            onTeamClick={openTeamRoster}
          />
        </section>

        <div className="draft__resizer" onMouseDown={startResize} aria-hidden />

        <aside
          className={`draft__sidebar ${mobileTab !== 'board' ? 'is-mobile-active' : ''}`}
          style={{ ['--sidebar-w' as string]: `${sidebarWidth}px` }}
        >
          <div className="draft__sidebar-tabs">
            {SIDEBAR_TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                className={`draft__stab ${panelTab === key ? 'is-active' : ''}`}
                onClick={() => setPanelTab(key)}
              >
                <Icon fontSize="small" />
                {label}
              </button>
            ))}
          </div>

          {/* Players & queue */}
          <div
            className={`draft__panel-body ${panelTab === 'players' ? 'is-desktop-active' : ''} ${
              mobileTab === 'players' ? 'is-mobile-active' : ''
            }`}
          >
            {queuedPlayers.length > 0 && (
              <div className="pool__queue">
                <div className="pool__queue-head">Queue ({queuedPlayers.length})</div>
                {queuedPlayers.map((p) => (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    queued
                    onQueue={() => toggleQueue(p.id)}
                    onPick={canPick ? () => setSelected(p) : undefined}
                    disabled={!canPick}
                  />
                ))}
              </div>
            )}
            <div className="pool__filters">
              <div className="chip-row">
                {(['ALL', ...POSITIONS] as Filter[]).map((f) => (
                  <button
                    key={f}
                    className={`chip ${filter === f ? 'chip--active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'DEF' ? 'D/ST' : f}
                  </button>
                ))}
              </div>
              <input
                className="pool__search"
                placeholder="Search players…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="pool__list">
              {available.slice(0, 200).map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  onPick={canPick ? () => setSelected(p) : undefined}
                  disabled={!canPick}
                  onQueue={() => toggleQueue(p.id)}
                  queued={queue.includes(p.id)}
                />
              ))}
              {available.length === 0 && (
                <p className="muted pool__empty">No players match.</p>
              )}
            </div>
          </div>

          {/* Roster */}
          <div
            className={`draft__panel-body ${panelTab === 'roster' ? 'is-desktop-active' : ''} ${
              mobileTab === 'roster' ? 'is-mobile-active' : ''
            }`}
          >
            <div className="draft__roster">
              <TeamLineup
                teams={teams}
                selectedTeamId={rosterTeamId}
                onSelectTeam={setRosterTeamSel}
                picks={picks}
                playersById={playersById}
                settings={lobby.settings}
              />
            </div>
          </div>

          {/* Chat */}
          <div
            className={`draft__panel-body ${panelTab === 'chat' ? 'is-desktop-active' : ''} ${
              mobileTab === 'chat' ? 'is-mobile-active' : ''
            }`}
          >
            <DraftChat
              lobbyId={id}
              status={lobby.status}
              completedAt={lobby.completed_at}
              picks={picks}
              teamsById={teamsById}
              playersById={playersById}
              members={members}
            />
          </div>
        </aside>
      </div>

      {/* Mobile-only section tabs + nav. */}
      <nav className="draft__tabs">
        {MOBILE_TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`draft__tab ${mobileTab === key ? 'is-active' : ''}`}
            onClick={() => setMobileTab(key)}
          >
            <span className="draft__tab-icon">
              <Icon fontSize="small" />
            </span>
            {label}
          </button>
        ))}
        <button
          className="draft__tab"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <span className="draft__tab-icon">
            <MenuIcon fontSize="small" />
          </span>
          Menu
        </button>
      </nav>

      {selected && (
        <LockInModal
          player={selected}
          onConfirm={confirmPick}
          onCancel={() => {
            setSelected(null);
            setPickError(null);
          }}
          busy={pickBusy}
          error={pickError}
          onBehalfOfTeam={pickingForTeam}
        />
      )}

      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extraItems={[
          { to: `/lobby/${id}`, label: 'Lobby room', Icon: MeetingRoomOutlinedIcon },
        ]}
      />
    </div>
  );
}
