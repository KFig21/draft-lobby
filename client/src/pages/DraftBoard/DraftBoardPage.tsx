import {
  POSITIONS,
  draftPositionForOverall,
  roundsForSettings,
  type Position,
} from '@draft-lobby/shared';
import BarChartIcon from '@mui/icons-material/BarChart';
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
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { DraftGrid } from '../../components/DraftGrid/DraftGrid';
import { LockInModal } from '../../components/LockInModal/LockInModal';
import { Modal } from '../../components/Modal/Modal';
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

type MobileTab = 'board' | 'players' | 'chat' | 'rankings';
const MOBILE_TABS: { key: MobileTab; label: string; Icon: SvgIconComponent }[] = [
  { key: 'board', label: 'Board', Icon: GridViewOutlinedIcon },
  { key: 'players', label: 'Players', Icon: SportsFootballIcon },
  { key: 'chat', label: 'Chat', Icon: ChatBubbleOutlineIcon },
  { key: 'rankings', label: 'Rankings', Icon: BarChartIcon },
];

export function DraftBoardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { lobby, teams, members, picks, loading } = useLobby(id);
  const { players, loading: playersLoading } = usePlayers();

  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('board');
  const [selected, setSelected] = useState<PlayerRow | null>(null);
  const [pickBusy, setPickBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commishBusy, setCommishBusy] = useState(false);
  const [commishError, setCommishError] = useState<string | null>(null);
  const [lineupTeamId, setLineupTeamId] = useState<string | null>(null);

  const userId = session?.user.id;

  const playersById = useMemo(() => {
    const m = new Map<string, PlayerRow>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  const draftedIds = useMemo(
    () => new Set(picks.map((p) => p.player_id)),
    [picks],
  );

  const teamsById = useMemo(() => {
    const m = new Map<string, TeamRow>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  function doExport(kind: 'csv' | 'xls') {
    const opts = {
      lobbyName: lobby?.name ?? 'draft',
      picks,
      teamsById,
      playersById,
    };
    if (kind === 'csv') exportDraftCsv(opts);
    else exportDraftExcel(opts);
  }

  const derived = useMemo(() => {
    if (!lobby) return null;
    const s = lobby.settings;
    const overall = lobby.current_overall;
    const round = Math.floor((overall - 1) / s.teamCount) + 1;
    const onClockPosition = draftPositionForOverall(
      overall,
      s.teamCount,
      s.draftType,
    );
    const onClockTeam =
      teams.find((t) => t.draft_position === onClockPosition) ?? null;
    return { s, overall, round, onClockTeam };
  }, [lobby, teams]);

  const isCommish = useMemo(() => {
    if (!userId || !lobby) return false;
    if (lobby.commissioner_id === userId) return true;
    return members.some(
      (m) => m.user_id === userId && m.role === 'SUB_COMMISSIONER',
    );
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
  // When a commissioner picks for a team that isn't theirs, surface it in the modal.
  const pickingForTeam = !isMyTurn && onClockTeam ? onClockTeam.name : null;
  const myTeamId = teams.find((t) => t.owner_id === userId)?.id ?? teams[0]?.id ?? null;

  async function confirmPick() {
    if (!selected) return;
    setPickError(null);
    setPickBusy(true);
    try {
      await api(`/lobbies/${id}/pick`, {
        method: 'POST',
        body: { playerId: selected.id },
      });
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

  return (
    <div className="draft">
      <header className="draft__topbar">
        <div className="draft__left">
          <Link to={`/lobby/${id}`} className="back-link draft__desktop-only">
            ← Room
          </Link>
          <button
            type="button"
            className="draft__lineup-open"
            onClick={() => setLineupTeamId(myTeamId)}
            disabled={!myTeamId}
          >
            <FormatListBulletedIcon fontSize="small" />
            My team
          </button>
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
            <button
              className="button button--primary"
              onClick={() => navigate('/home')}
            >
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

      {isPaused && (
        <div className="draft__paused-banner">
          The draft is paused
          {isCommish ? '.' : ' by the commissioner.'}
        </div>
      )}

      <div className="draft__body">
        <section
          className={`draft__board ${mobileTab === 'board' ? 'is-active' : ''}`}
        >
          <DraftGrid
            teams={teams}
            rounds={roundsForSettings(lobby.settings)}
            picks={picks}
            playersById={playersById}
            onClockTeamId={onClockTeam?.id ?? null}
            currentRound={round}
            onTeamClick={setLineupTeamId}
          />
        </section>

        <aside
          className={`draft__pool ${mobileTab === 'players' ? 'is-active' : ''}`}
        >
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
              />
            ))}
            {available.length === 0 && (
              <p className="muted pool__empty">No players match.</p>
            )}
          </div>
        </aside>

        {/* Placeholder sections — wired up in later epics. */}
        <div className={`draft__panel ${mobileTab === 'chat' ? 'is-active' : ''}`}>
          <p className="muted">💬 Chat is coming soon.</p>
        </div>
        <div
          className={`draft__panel ${mobileTab === 'rankings' ? 'is-active' : ''}`}
        >
          <p className="muted">📊 Power rankings are coming soon.</p>
        </div>
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

      {lineupTeamId && (
        <Modal title="Team lineup" onClose={() => setLineupTeamId(null)}>
          <TeamLineup
            teams={teams}
            selectedTeamId={lineupTeamId}
            onSelectTeam={setLineupTeamId}
            picks={picks}
            playersById={playersById}
            settings={lobby.settings}
          />
        </Modal>
      )}
    </div>
  );
}
