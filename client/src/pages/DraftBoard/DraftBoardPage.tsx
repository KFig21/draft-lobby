import {
  CHAT_LOCK_MS,
  POSITIONS,
  draftPositionForOverall,
  roundsForSettings,
  type Position,
} from '@draft-lobby/shared';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FastForwardIcon from '@mui/icons-material/FastForward';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SportsFootballIcon from '@mui/icons-material/SportsFootball';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import type { SvgIconComponent } from '@mui/icons-material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ConfirmModal } from '../../components/ConfirmModal/ConfirmModal';
import { DraftChat } from '../../components/DraftChat/DraftChat';
import { DraftGrid, type ReactionEntry } from '../../components/DraftGrid/DraftGrid';
import { LockInModal } from '../../components/LockInModal/LockInModal';
import { Modal } from '../../components/Modal/Modal';
import { NavDrawer } from '../../components/Navbar/NavDrawer';
import { PickClock } from '../../components/PickClock/PickClock';
import { PickModal } from '../../components/PickModal/PickModal';
import { PlayerCard } from '../../components/PlayerCard/PlayerCard';
import { TeamLineup } from '../../components/TeamLineup/TeamLineup';
import { ThemeToggle } from '../../components/ThemeToggle/ThemeToggle';
import { useAuth } from '../../auth/AuthContext';
import { useLobby } from '../../hooks/useLobby';
import { usePlayers } from '../../hooks/usePlayers';
import { api } from '../../lib/api';
import { exportDraftCsv, exportDraftExcel } from '../../lib/exportDraft';
import { supabase } from '../../supabase';
import type { ChatReactionRow, PickRow, PlayerRow, TeamRow } from '../../lib/types';
import './DraftBoardPage.scss';

type Filter = 'ALL' | Position | 'FLEX' | 'SUPERFLEX';
type PanelTab = 'players' | 'roster' | 'chat';
type MobileTab = 'board' | PanelTab;

// Multi-position filters (no pick counts shown next to these).
const FLEX_POS: Position[] = ['RB', 'WR', 'TE'];
const SUPERFLEX_POS: Position[] = ['QB', 'RB', 'WR', 'TE'];

// The right sidebar's tabs (desktop) — labels shown in the tab strip.
const SIDEBAR_TABS: { key: PanelTab; label: string; Icon: SvgIconComponent }[] = [
  { key: 'players', label: 'Players', Icon: SportsFootballIcon },
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
  const [showRollback, setShowRollback] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Commissioner toggle: auto-skip bot picks as they come on the clock,
  // instead of clicking "Skip bots" every time.
  const [autoSkipBots, setAutoSkipBots] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) void rootRef.current?.requestFullscreen?.();
    else void document.exitFullscreen?.();
  }

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

  const usernameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of members) m.set(mem.user_id, mem.profiles?.username ?? 'Player');
    return m;
  }, [members]);

  // ── Pick reactions (board hover + pick modal) ──
  const [pickReactions, setPickReactions] = useState<ChatReactionRow[]>([]);
  const [pickModal, setPickModal] = useState<PickRow | null>(null);
  useEffect(() => {
    const load = () =>
      supabase
        .from('chat_reactions')
        .select('*')
        .eq('lobby_id', id)
        .eq('target_type', 'PICK')
        .then(({ data }) => setPickReactions((data ?? []) as ChatReactionRow[]));
    void load();
    const ch = supabase
      .channel(`board-react:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_reactions', filter: `lobby_id=eq.${id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [id]);

  const reactionsByPick = useMemo(() => {
    const m = new Map<string, ReactionEntry>();
    for (const r of pickReactions) {
      const e = m.get(r.target_id) ?? { counts: {}, mine: new Set<string>() };
      e.counts[r.emoji] = (e.counts[r.emoji] ?? 0) + 1;
      if (r.user_id === userId) e.mine.add(r.emoji);
      m.set(r.target_id, e);
    }
    return m;
  }, [pickReactions, userId]);

  async function reactPick(pickId: string, emoji: string) {
    try {
      await api(`/lobbies/${id}/chat-react`, {
        method: 'POST',
        body: { targetType: 'PICK', targetId: pickId, emoji },
      });
    } catch {
      /* realtime reconciles */
    }
  }

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

  // While "Skip bots" is toggled on, auto-fast-forward whenever a bot lands on
  // the clock — re-fires each time the on-the-clock team changes, so it keeps
  // skipping through bot turns without the commissioner re-clicking.
  useEffect(() => {
    if (!autoSkipBots || !isCommish || commishBusy) return;
    if (!lobby || lobby.status === 'PAUSED' || lobby.status === 'COMPLETE') return;
    if (!derived?.onClockTeam?.is_bot) return;
    void fastForward();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSkipBots, isCommish, lobby?.status, derived?.onClockTeam?.id, derived?.onClockTeam?.is_bot]);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      if (draftedIds.has(p.id)) return false;
      if (filter === 'FLEX') {
        if (!(FLEX_POS as string[]).includes(p.position)) return false;
      } else if (filter === 'SUPERFLEX') {
        if (!(SUPERFLEX_POS as string[]).includes(p.position)) return false;
      } else if (filter !== 'ALL' && p.position !== filter) {
        return false;
      }
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
  const myTeam = teams.find((t) => t.owner_id === userId) ?? null;
  const rosterTeamId = rosterTeamSel ?? myTeamId ?? teams[0]?.id ?? '';

  // How many players the current user has drafted at each position (for filter badges).
  const myPosCounts: Partial<Record<Position, number>> = {};
  for (const p of picks) {
    if (p.team_id !== myTeamId) continue;
    const pos = playersById.get(p.player_id)?.position as Position | undefined;
    if (pos) myPosCounts[pos] = (myPosCounts[pos] ?? 0) + 1;
  }

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
    setCommishError(null);
    setCommishBusy(true);
    try {
      await api(`/lobbies/${id}/${path}`, { method: 'POST' });
    } catch (err) {
      setCommishError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setCommishBusy(false);
      setShowRollback(false);
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

  async function toggleAuto(teamId: string, on: boolean) {
    try {
      await api(`/lobbies/${id}/auto-draft`, { method: 'POST', body: { teamId, on } });
    } catch {
      /* realtime will reconcile the team row */
    }
  }

  async function fastForward() {
    setCommishError(null);
    setCommishBusy(true);
    try {
      await api(`/lobbies/${id}/fast-forward`, { method: 'POST' });
    } catch (err) {
      setCommishError(err instanceof Error ? err.message : 'Fast-forward failed');
    } finally {
      setCommishBusy(false);
    }
  }

  const myTurnHighlight = isMyTurn && !isPaused && !isComplete;

  return (
    <div className="draft">
      <header className={`draft__topbar${myTurnHighlight ? ' draft__topbar--myturn' : ''}`}>
        <div className="draft__left">
          <div className="draft__nav-links">
            <button
              type="button"
              className="button draft__home-btn"
              onClick={() => navigate('/home')}
            >
              <HomeOutlinedIcon fontSize="small" /> Home
            </button>
            <Link to={`/lobby/${id}`} className="button draft__room-btn">
              <MeetingRoomOutlinedIcon fontSize="small" /> Room
            </Link>
          </div>
          {isCommish && !isComplete && (
            <>
              {isPaused ? (
                <button
                  className="draft__tool-btn"
                  onClick={() => commishAction('resume')}
                  disabled={commishBusy}
                >
                  <PlayArrowIcon fontSize="small" /> Resume
                </button>
              ) : (
                <button
                  className="draft__tool-btn"
                  onClick={() => commishAction('pause')}
                  disabled={commishBusy}
                >
                  <PauseIcon fontSize="small" /> Pause
                </button>
              )}
              <button
                className="draft__tool-btn"
                onClick={() => setShowRollback(true)}
                disabled={commishBusy || picks.length === 0}
              >
                <UndoIcon fontSize="small" /> Undo
              </button>
              <button
                className={`draft__tool-btn draft__skipbots-btn${
                  autoSkipBots ? ' is-on' : ''
                }`}
                onClick={() => setAutoSkipBots((v) => !v)}
                title="Automatically skip bot picks as they come on the clock"
              >
                <FastForwardIcon fontSize="small" /> Skip bots
                {autoSkipBots ? ' · On' : ''}
              </button>
              {commishError && <span className="draft__commish-error">{commishError}</span>}
            </>
          )}
          {!isCommish && !isComplete && !isPaused && (
            <button
              className="draft__tool-btn"
              onClick={requestPause}
              disabled={reqPauseBusy}
            >
              🙋 Request pause
            </button>
          )}
        </div>
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
        <div className="draft__right">
          {isComplete ? (
            <button className="button draft__export-btn" onClick={() => setShowExport(true)}>
              <FileDownloadOutlinedIcon fontSize="small" /> Export
            </button>
          ) : (
            <PickClock deadline={lobby.pick_deadline} />
          )}
          {myTeam && !myTeam.is_bot && !isComplete && (
            <button
              className={`draft__icon-btn draft__auto-btn${myTeam.auto_draft ? ' is-on' : ''}`}
              onClick={() => toggleAuto(myTeam.id, !myTeam.auto_draft)}
              aria-label={myTeam.auto_draft ? 'Turn auto-draft off' : 'Turn auto-draft on'}
              title={`Auto-draft ${myTeam.auto_draft ? 'on' : 'off'}`}
            >
              {myTeam.auto_draft ? (
                <SmartToyIcon fontSize="small" />
              ) : (
                <SmartToyOutlinedIcon fontSize="small" />
              )}
            </button>
          )}
          <button
            className="draft__icon-btn draft__fs-btn"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            title={isFullscreen ? 'Exit full screen' : 'Full screen (great for a TV)'}
          >
            {isFullscreen ? (
              <FullscreenExitIcon fontSize="small" />
            ) : (
              <FullscreenIcon fontSize="small" />
            )}
          </button>
          <ThemeToggle className="draft__icon-btn draft__theme-btn" />
        </div>
      </header>

      {isPaused && (
        <div className="draft__paused-banner">
          The draft is paused
          {isCommish ? '.' : ' by the commissioner.'}
        </div>
      )}

      <div className="draft__body">
        <section
          ref={rootRef}
          className={`draft__board ${mobileTab === 'board' ? 'is-mobile-active' : ''}${
            isFullscreen ? ' draft__board--fs' : ''
          }`}
        >
          {isFullscreen && (
            <button
              className="draft__fs-exit"
              onClick={toggleFullscreen}
              aria-label="Exit full screen"
            >
              <FullscreenExitIcon fontSize="small" /> Exit full screen
            </button>
          )}
          <DraftGrid
            teams={teams}
            rounds={roundsForSettings(lobby.settings)}
            picks={picks}
            playersById={playersById}
            onClockTeamId={onClockTeam?.id ?? null}
            currentRound={round}
            draftType={lobby.settings.draftType}
            onTeamClick={openTeamRoster}
            reactionsByPick={reactionsByPick}
            onReactPick={reactPick}
            onPickClick={setPickModal}
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
                <button
                  className={`chip ${filter === 'ALL' ? 'chip--active' : ''}`}
                  onClick={() => setFilter('ALL')}
                >
                  ALL
                </button>
                {POSITIONS.map((pos) => (
                  <button
                    key={pos}
                    className={`chip ${filter === pos ? 'chip--active' : ''}`}
                    onClick={() => setFilter(pos)}
                  >
                    {pos === 'DEF' ? 'D/ST' : pos}
                    <span className="chip__dot"> · </span>
                    <span className="chip__count">{myPosCounts[pos] ?? 0}</span>
                  </button>
                ))}
                {(['FLEX', 'SUPERFLEX'] as const).map((f) => (
                  <button
                    key={f}
                    className={`chip ${filter === f ? 'chip--active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f}
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
                myUserId={userId}
                isCommish={isCommish}
                onToggleAuto={isComplete ? undefined : toggleAuto}
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

      {pickModal &&
        (() => {
          const player = playersById.get(pickModal.player_id);
          if (!player) return null;
          const endedAt = isComplete ? lobby.completed_at ?? null : null;
          const chatLocked =
            !!endedAt && Date.now() >= new Date(endedAt).getTime() + CHAT_LOCK_MS;
          // Usernames that reacted to this pick, grouped by emoji (for tooltips).
          const reactors: Record<string, string[]> = {};
          for (const r of pickReactions) {
            if (r.target_id !== pickModal.id) continue;
            (reactors[r.emoji] ??= []).push(usernameById.get(r.user_id) ?? 'Someone');
          }
          return (
            <PickModal
              lobbyId={id}
              pick={pickModal}
              player={player}
              team={teamsById.get(pickModal.team_id)}
              entry={reactionsByPick.get(pickModal.id)}
              reactors={reactors}
              onReact={(emoji) => reactPick(pickModal.id, emoji)}
              locked={chatLocked}
              onClose={() => setPickModal(null)}
            />
          );
        })()}

      {showRollback && (
        <ConfirmModal
          title="Undo the last pick?"
          confirmLabel="Undo pick"
          busyLabel="Undoing…"
          busy={commishBusy}
          onConfirm={() => commishAction('rollback')}
          onClose={() => setShowRollback(false)}
        >
          This removes the most recent pick and puts that team back on the clock.
        </ConfirmModal>
      )}

      {showExport && (
        <Modal title="Export draft" onClose={() => setShowExport(false)}>
          <div className="draft-export-options">
            <button
              className="button draft-export-options__opt"
              onClick={() => {
                doExport('csv');
                setShowExport(false);
              }}
            >
              <InsertDriveFileOutlinedIcon fontSize="small" />
              <span>
                <strong>CSV</strong>
                <span className="muted">A plain spreadsheet file (.csv)</span>
              </span>
            </button>
            <button
              className="button draft-export-options__opt"
              onClick={() => {
                doExport('xls');
                setShowExport(false);
              }}
            >
              <TableChartOutlinedIcon fontSize="small" />
              <span>
                <strong>Excel</strong>
                <span className="muted">A formatted workbook (.xlsx)</span>
              </span>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
