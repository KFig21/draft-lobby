import {
  DEFAULT_SCORING_RULES,
  DRAFT_RESULTS_LOCK_MS,
  POSITIONS,
  ROLLBACK_LOCK_MS,
  defaultAvatar,
  draftablePositions,
  draftPositionForOverall,
  extractMentionedUsernames,
  openSlots,
  overallForDraftPosition,
  roundsForSettings,
  secondsForRound,
  type Avatar as AvatarData,
  type DraftGrade,
  type Position,
} from '@draft-lobby/shared';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import StarIcon from '@mui/icons-material/Star';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FastForwardIcon from '@mui/icons-material/FastForward';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import GroupsIcon from '@mui/icons-material/Groups';
import HomeIcon from '@mui/icons-material/Home';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import MenuIcon from '@mui/icons-material/Menu';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import PauseIcon from '@mui/icons-material/Pause';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutlineOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsIcon from '@mui/icons-material/Settings';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SportsFootballIcon from '@mui/icons-material/SportsFootball';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import type { SvgIconComponent } from '@mui/icons-material';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { Avatar } from '../../components/Avatar/Avatar';
import { ChampionBadge } from '../../components/ChampionBadge/ChampionBadge';
import { ConfirmModal } from '../../components/ConfirmModal/ConfirmModal';
import { DraftChat } from '../../components/DraftChat/DraftChat';
import { DraftGrid, type ReactionEntry } from '../../components/DraftGrid/DraftGrid';
import { DraftOutroModal } from '../../components/DraftOutroModal/DraftOutroModal';
import { PowerRankingsPanel } from '../../components/PowerRankings/PowerRankingsPanel';
import { DraftUserSettingsModal } from '../../components/DraftUserSettingsModal/DraftUserSettingsModal';
import { ErrorScreen } from '../../components/ErrorScreen/ErrorScreen';
import { GradeBadge } from '../../components/GradeBadge/GradeBadge';
import { KeeperManagerModal } from '../../components/KeeperManager/KeeperManagerModal';
import { KeeperOptionsViewModal } from '../../components/KeeperManager/KeeperOptionsViewModal';
import { OwnerKeepersModal } from '../../components/KeeperManager/OwnerKeepersModal';
import { Loader } from '../../components/Loader/Loader';
import { LockInModal } from '../../components/LockInModal/LockInModal';
import { Modal } from '../../components/Modal/Modal';
import { NavDrawer } from '../../components/Navbar/NavDrawer';
import { PickClock } from '../../components/PickClock/PickClock';
import { PickModal, type PickComment } from '../../components/PickModal/PickModal';
import type { Reactor } from '../../components/ReactorsModal/ReactorsModal';
import { PlayerCard } from '../../components/PlayerCard/PlayerCard';
import { PlayerDetailModal } from '../../components/PlayerDetailModal/PlayerDetailModal';
import { LeagueRulesModal } from '../../components/LeagueRulesModal/LeagueRulesModal';
import { TeamLineup } from '../../components/TeamLineup/TeamLineup';
import {
  TeamResultsDrawer,
  type ResultsDrawerView,
} from '../../components/TeamResultsDrawer/TeamResultsDrawer';
import { ThemeToggle } from '../../components/ThemeToggle/ThemeToggle';
import { useAuth } from '../../auth/AuthContext';
import { useLobby } from '../../hooks/useLobby';
import { usePlayers } from '../../hooks/usePlayers';
import { useFavorites } from '../../hooks/useFavorites';
import { CompactPlayerCard } from '../../components/PlayerCard/CompactPlayerCard';
import {
  getPlayerCardStyle,
  setPlayerCardStyle,
  type PlayerCardStyle,
} from '../../lib/playerCardStyle';
import { getTeamColorsEnabled, setTeamColorsEnabled } from '../../lib/nflTeamColors';
import { scorePlayers } from '../../lib/playerPoints';
import { api } from '../../lib/api';
import { byeClashCountsForWeek, byeClashLookup } from '../../lib/byeClashes';
import {
  getDraftCellStyle,
  getShowByeClashes,
  getShowCellReactions,
  setDraftCellStyle,
  setShowByeClashes,
  setShowCellReactions,
  type DraftCellStyle,
} from '../../lib/draftCellStyle';
import { mostCommonGrade } from '../../lib/draftGrade';
import { exportDraftCsv, exportDraftExcel } from '../../lib/exportDraft';
import { avatarForTeam } from '../../lib/teamAvatar';
import { supabase } from '../../supabase';
import { useToast } from '../../toast/ToastContext';
import {
  getToastPrefs,
  setToastCategoryEnabled,
  setToastsEnabled,
  type ToastCategory,
} from '../../toast/toastPrefs';
import type {
  ChatMessageRow,
  ChatReactionRow,
  DraftCrownVoteRow,
  DraftGradeRow,
  PickRow,
  PlayerRow,
  TeamRow,
} from '../../lib/types';
import './DraftBoardPage.scss';

type Filter = 'ALL' | Position | 'FLEX' | 'SUPERFLEX' | 'QUEUE' | 'FAVORITES';
type PanelTab = 'players' | 'roster' | 'chat' | 'results';
type MobileTab = 'board' | PanelTab;

// Multi-position filters (no pick counts shown next to these).
const FLEX_POS: Position[] = ['RB', 'WR', 'TE'];
const SUPERFLEX_POS: Position[] = ['QB', 'RB', 'WR', 'TE'];

// The right sidebar's tabs (desktop) — labels shown in the tab strip. Post-draft
// Power Rankings live in the center view (top-bar Board/Power Rankings toggle),
// not the sidebar, so there's no "results" tab here.
const SIDEBAR_TABS: { key: PanelTab; label: string; Icon: SvgIconComponent }[] = [
  { key: 'players', label: 'Players', Icon: SportsFootballIcon },
  { key: 'roster', label: 'Roster', Icon: FormatListBulletedIcon },
  { key: 'chat', label: 'Chat', Icon: ChatBubbleOutlineIcon },
];
// Bottom-bar sections (mobile) — Board plus the sidebar tabs, and (post-draft)
// Rankings. Mobile has no top bar, so the Power Rankings are reached via this
// "Rankings" tab (key stays 'results' — same panel slot, crown/grade data).
const MOBILE_TABS: { key: MobileTab; label: string; Icon: SvgIconComponent }[] = [
  { key: 'board', label: 'Board', Icon: GridViewOutlinedIcon },
  { key: 'players', label: 'Players', Icon: SportsFootballIcon },
  { key: 'roster', label: 'Roster', Icon: FormatListBulletedIcon },
  { key: 'chat', label: 'Chat', Icon: ChatBubbleOutlineIcon },
  { key: 'results', label: 'Rankings', Icon: LeaderboardIcon },
];

const MIN_SIDEBAR = 300;
const MAX_SIDEBAR = 600;

/** Counts up from `since`, ticking every second — how long a pause has lasted. */
function PausedDuration({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const text =
    h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  return <span className="draft__paused-duration">Paused for {text}</span>;
}

/** What the rollback confirm modal is aimed at: either a real pick, or a
 * skipped slot (an open slot the clock already passed, so it has no pick row).
 * Both roll back to the same `overall`; the skip case just has no player. */
type RollbackTarget =
  | { kind: 'pick'; pick: PickRow }
  | { kind: 'skip'; overall: number; round: number; teamId: string };

export function DraftBoardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const { showToast } = useToast();
  const { lobby, teams, members, picks, keeperOptions, loading } = useLobby(id);
  const { players: rawPlayers, loading: playersLoading } = usePlayers();
  // Recomputed from each player's raw stat line under this lobby's own
  // scoring rules — so bot picks, lineup order, and every player card here
  // agree with each other and with the lobby's actual scoring format,
  // instead of everyone independently trusting Sleeper's flat PPR total.
  const players = useMemo(
    () => scorePlayers(rawPlayers, lobby?.settings.scoring ?? DEFAULT_SCORING_RULES),
    [rawPlayers, lobby?.settings.scoring],
  );

  // Personal preferences (also editable from Settings directly) — read once
  // on mount, then kept live so the gear-icon settings modal below (see
  // showUserSettings) can update them without a page refresh.
  const [cellStyle, setCellStyleState] = useState(() => getDraftCellStyle());
  const [showCellReactions, setShowCellReactionsState] = useState(() => getShowCellReactions());
  const [showByeClashes, setShowByeClashesState] = useState(() => getShowByeClashes());
  const [cardStyle, setCardStyleState] = useState<PlayerCardStyle>(() => getPlayerCardStyle());
  const [teamColors, setTeamColorsState] = useState(() => getTeamColorsEnabled());
  const [toastPrefs, setToastPrefsState] = useState(() => getToastPrefs());
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);

  function updateCellStyle(style: DraftCellStyle) {
    setDraftCellStyle(style);
    setCellStyleState(style);
  }
  function updateShowCellReactions(show: boolean) {
    setShowCellReactions(show);
    setShowCellReactionsState(show);
  }
  function updateCardStyle(style: PlayerCardStyle) {
    setPlayerCardStyle(style);
    setCardStyleState(style);
  }
  function updateShowByeClashes(show: boolean) {
    setShowByeClashes(show);
    setShowByeClashesState(show);
  }
  function updateTeamColors(enabled: boolean) {
    setTeamColorsEnabled(enabled);
    setTeamColorsState(enabled);
  }
  function updateToastsEnabled(enabled: boolean) {
    setToastsEnabled(enabled);
    setToastPrefsState((p) => ({ ...p, enabled }));
  }
  function updateToastCategory(category: ToastCategory, enabled: boolean) {
    setToastCategoryEnabled(category, enabled);
    setToastPrefsState((p) => ({ ...p, categories: { ...p.categories, [category]: enabled } }));
  }
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  // Drafted players are hidden from the pool by default; this reveals them
  // (dimmed, non-draftable) so you can still see/favorite who's gone.
  const [showDrafted, setShowDrafted] = useState(false);
  // Per-device pool-row density (Settings, or the in-room settings modal).
  // The two layouts are separate components, chosen here at the render call.
  const PoolCard = cardStyle === 'compact' ? CompactPlayerCard : PlayerCard;
  // Bye weeks to hide from the player pool (desktop/fullscreen only) — a set
  // rather than a single value since a bye-heavy roster may want to dodge
  // more than one week at once. Tucked behind a dropdown (not a chip row)
  // since up to 18 weeks of chips would dominate the filter bar.
  const [excludedByeWeeks, setExcludedByeWeeks] = useState<Set<number>>(new Set());
  const [byeDropdownOpen, setByeDropdownOpen] = useState(false);
  const byeDropdownRef = useRef<HTMLDivElement>(null);
  function toggleByeWeekFilter(week: number) {
    setExcludedByeWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(week)) next.delete(week);
      else next.add(week);
      return next;
    });
  }
  useEffect(() => {
    if (!byeDropdownOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (!byeDropdownRef.current?.contains(e.target as Node)) setByeDropdownOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setByeDropdownOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [byeDropdownOpen]);
  const [mobileTab, setMobileTab] = useState<MobileTab>('board');
  const [panelTab, setPanelTab] = useState<PanelTab>('players');
  // Post-draft, the top-bar toggle (desktop/fullscreen) swaps the center between
  // the draft board and the Power Rankings. Mobile reaches rankings via its own
  // "Rankings" tab, so this stays 'board' there.
  const [centerView, setCenterView] = useState<'board' | 'rankings'>('board');
  const [rosterTeamSel, setRosterTeamSel] = useState<string | null>(null);
  const [resultsDrawerView, setResultsDrawerView] = useState<ResultsDrawerView>('closed');
  const [queue, setQueue] = useState<string[]>([]);
  const { favoriteIds, toggleFavorite, canFavorite } = useFavorites();
  const [selected, setSelected] = useState<PlayerRow | null>(null);
  // Set when a player row is clicked in the pool — a closer look before
  // deciding to draft/queue, separate from the pick-confirm flow (`selected`).
  const [detailPlayer, setDetailPlayer] = useState<PlayerRow | null>(null);
  const [pickBusy, setPickBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commishBusy, setCommishBusy] = useState(false);
  // Pause/resume get their own busy flag, separate from commishBusy (which
  // fast-forward also sets) — otherwise, while "Skip bots" is auto-advancing
  // through a streak of bot picks, commishBusy stays true almost
  // continuously and the Pause button goes disabled right when it's needed.
  const [pauseBusy, setPauseBusy] = useState(false);
  const [autopickBusy, setAutopickBusy] = useState(false);
  const [commishError, setCommishError] = useState<string | null>(null);
  const [keepersLockBusy, setKeepersLockBusy] = useState(false);
  const [reqPauseBusy, setReqPauseBusy] = useState(false);
  // The pick to roll back to (inclusive) — set from the toolbar's "Undo" (the
  // last pick) or from a pick modal's "Roll back to this pick" (any earlier one).
  const [rollbackTarget, setRollbackTarget] = useState<RollbackTarget | null>(null);
  const [rollbackConfirmText, setRollbackConfirmText] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [showKeepers, setShowKeepers] = useState(false);
  const [showMyKeepers, setShowMyKeepers] = useState(false);
  const [showAllKeepers, setShowAllKeepers] = useState(false);
  const [showTeamKeepers, setShowTeamKeepers] = useState(false);
  // Set by a view modal's edit pencil — opens the Keeper Manager straight into
  // "Let owners choose → Import by team" scoped to this team, instead of its
  // default landing. Cleared on close so reopening via the normal button
  // doesn't carry stale scoping.
  const [keeperEditTeamId, setKeeperEditTeamId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Only meaningful in full screen (the sidebar isn't mounted there) —
  // force-closed the moment full screen exits, since the sidebar comes back.
  const [showFsMenu, setShowFsMenu] = useState(false);
  // Ticks every second so the top bar can flip yellow/red as the pick clock
  // runs low, not just the clock text itself.
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // Commissioner toggle: auto-skip bot picks as they come on the clock,
  // instead of clicking "Skip bots" every time.
  const [autoSkipBots, setAutoSkipBots] = useState(false);
  // The fast-forward request can be mid-flight (server loops through every
  // consecutive bot in one call) when the commissioner turns the toggle back
  // off — abort it, or the server just keeps drafting bots regardless.
  const fastForwardAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement) setShowFsMenu(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      // Fullscreen targets the whole document now (see toggleFullscreen), so
      // it otherwise survives navigating to a different route entirely —
      // leaving the user stuck in a fullscreen home page/lobby list.
      if (document.fullscreenElement) void document.exitFullscreen?.();
    };
  }, []);

  function toggleFullscreen() {
    // The whole document, not just this page's root div — anything rendered
    // outside the fullscreened element (the toast viewport, mounted at the
    // app root) doesn't paint at all while fullscreen, since the Fullscreen
    // API only shows that element's own subtree.
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
    else void document.exitFullscreen?.();
  }

  // Fullscreen ("TV mode"): stretch the grid to fill the screen instead of
  // sitting at its natural fixed size with dead space around it. Width fills
  // via CSS (table-layout: fixed); height is measured here since HTML tables
  // don't do percentage row heights reliably, and applied as a CSS variable.
  const boardSectionRef = useRef<HTMLDivElement>(null);
  const [fsRowHeight, setFsRowHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!isFullscreen || !lobby) {
      setFsRowHeight(null);
      return;
    }
    const el = boardSectionRef.current;
    if (!el) return;
    const rounds = roundsForSettings(lobby.settings);

    const recompute = () => {
      // Measure the scroll container itself (not the padded section around
      // it) so we don't have to duplicate its padding here to stay in sync.
      const scrollEl = el.querySelector<HTMLElement>('.grid-scroll');
      const headerEl = el.querySelector<HTMLElement>('.draft-grid__team');
      if (!scrollEl) return;
      const headerH = headerEl?.offsetHeight ?? 40;
      // border-spacing (4px, see DraftGrid.scss) puts a gap around and
      // between every row — account for it or rows overflow by a few px
      // and force a scrollbar despite there being room to spare.
      const spacingPerRow = 4;
      const available = scrollEl.clientHeight - headerH - spacingPerRow * (rounds + 2);
      const raw = Math.floor(available / rounds);
      // Only a floor, no ceiling — the point is filling the screen, so a
      // short draft on a big monitor should get generously tall rows.
      setFsRowHeight(Math.max(44, raw));
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isFullscreen, lobby]);

  // ── Top bar overflow → icon-only tools ──
  // The bar keeps a symmetric grid so the clock/pick stays dead-center; when
  // the button groups would spill onto a second line (most often in fullscreen
  // TV mode, where everything scales up), collapse the text-buttons to
  // icon-only instead — each reveals its label on hover (CSS). Detected by
  // measuring, not a width guess, since the button set varies (member vs.
  // commissioner, staging, skip backlog…). The measuring effect itself lives
  // lower down, once the values that change the button set are in scope.
  const topbarRef = useRef<HTMLElement>(null);
  const [topbarCompact, setTopbarCompact] = useState(false);
  const topbarCompactRef = useRef(topbarCompact);
  topbarCompactRef.current = topbarCompact;

  // The top-bar countdown fill grows via a CSS `width` transition (matched to
  // the 1s clock tick). When the pick changes, the elapsed% snaps back near 0
  // — but that same transition would animate the *reset* too, sweeping the
  // fill quickly right→left before it starts growing again. Kill the
  // transition for the one frame the reset lands on, then restore it so the
  // normal per-second growth still animates.
  const [fillResetting, setFillResetting] = useState(false);
  const prevOverallRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const overall = lobby?.current_overall ?? null;
    const changed = prevOverallRef.current !== null && prevOverallRef.current !== overall;
    prevOverallRef.current = overall;
    if (!changed) return;
    setFillResetting(true);
    const raf = requestAnimationFrame(() => setFillResetting(false));
    return () => cancelAnimationFrame(raf);
  }, [lobby?.current_overall]);

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

  // The pick that took each drafted player — so a click on a drafted pool row
  // can open that pick's modal (who took them, round/pick) instead of the plain
  // player-detail modal.
  const pickByPlayerId = useMemo(() => {
    const m = new Map<string, PickRow>();
    for (const pk of picks) m.set(pk.player_id, pk);
    return m;
  }, [picks]);

  // "round.pick" label for each drafted player (e.g. round 5 pick 6 → "5.6" in
  // an 8-team draft, "5.06" in a 10/12-team draft). The pick-in-round is
  // zero-padded to the width of the team count so picks sort/align cleanly.
  const pickLabelByPlayerId = useMemo(() => {
    const m = new Map<string, string>();
    const teamCount = lobby?.settings.teamCount ?? 0;
    if (!teamCount) return m;
    const width = String(teamCount).length;
    for (const pk of picks) {
      const inRound = pk.overall - (pk.round - 1) * teamCount;
      m.set(pk.player_id, `${pk.round}.${String(inRound).padStart(width, '0')}`);
    }
    return m;
  }, [picks, lobby?.settings.teamCount]);

  // Most recent *real* pick (what the top-bar "Undo" rolls back to). Excludes
  // keepers: those are pre-placed at their round slot, so a late-round keeper
  // can be the highest-overall pick on the board even before any real pick is
  // made — undoing "the last pick" must never target one.
  const lastPick = useMemo(
    () =>
      picks
        .filter((p) => !p.is_keeper)
        .reduce<PickRow | null>(
          (latest, p) => (!latest || p.overall > latest.overall ? p : latest),
          null,
        ),
    [picks],
  );

  const teamsById = useMemo(() => {
    const m = new Map<string, TeamRow>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  // Users whose team is marked as last season's defending champion — badged
  // wherever their name shows up (chat, comments, reactions, toasts). Keyed
  // by userId (not teamId) since most of those spots only have a userId.
  const championUserIds = useMemo(
    () => new Set(teams.filter((t) => t.is_prev_champion && t.owner_id).map((t) => t.owner_id!)),
    [teams],
  );

  // Realtime handlers below live in effects that only re-subscribe on
  // [id, userId, isCommish] — refs keep them reading fresh picks/teams/
  // members/players without resubscribing every time any of that changes
  // (in particular, members/players can still be loading — [] — the first
  // time these effects run, which otherwise permanently stales the toasts'
  // usernames/avatars into "Someone" + the default avatar).
  const picksRef = useRef(picks);
  picksRef.current = picks;
  const teamsRef = useRef(teams);
  teamsRef.current = teams;
  const membersRef = useRef(members);
  membersRef.current = members;
  const playersByIdRef = useRef(playersById);
  playersByIdRef.current = playersById;
  const championUserIdsRef = useRef(championUserIds);
  championUserIdsRef.current = championUserIds;

  /** Username, badged with the trophy icon if that user is a defending
   * champion — for realtime toast titles built outside React's render path. */
  function championTitle(uid: string, suffix: string) {
    return (
      <>
        {memberUsername(uid)}
        {championUserIdsRef.current.has(uid) && <ChampionBadge size={12} />}
        {suffix}
      </>
    );
  }

  /** The pick, if it exists and belongs to my team — for realtime toasts. */
  function myPick(pickId: string): PickRow | null {
    const pick = picksRef.current.find((p) => p.id === pickId);
    if (!pick) return null;
    const team = teamsRef.current.find((t) => t.id === pick.team_id);
    return team?.owner_id === userId ? pick : null;
  }

  /** A reply (pick comment) of mine, if it exists — for realtime toasts. */
  function myReply(messageId: string): ChatMessageRow | null {
    const comment = pickCommentsRef.current.find((c) => c.id === messageId);
    return comment && comment.user_id === userId ? comment : null;
  }

  const usernameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of members) m.set(mem.user_id, mem.profiles?.username ?? 'Player');
    return m;
  }, [members]);

  function memberAvatar(uid: string): AvatarData {
    return membersRef.current.find((m) => m.user_id === uid)?.profiles?.avatar ?? defaultAvatar(uid);
  }

  /** Ref-backed so realtime toast handlers never read a stale "Someone". */
  function memberUsername(uid: string): string {
    return membersRef.current.find((m) => m.user_id === uid)?.profiles?.username ?? 'Someone';
  }

  // ── Reactions on picks (board hover + pick modal) and on messages/comments
  // (pick modal's comment thread) — one fetch, split by target_type. ──
  const [allReactions, setAllReactions] = useState<ChatReactionRow[]>([]);
  const [pickModal, setPickModal] = useState<PickRow | null>(null);
  useEffect(() => {
    const load = () =>
      supabase
        .from('chat_reactions')
        .select('*')
        .eq('lobby_id', id)
        .then(({ data }) => setAllReactions((data ?? []) as ChatReactionRow[]));
    void load();
    const ch = supabase
      .channel(`board-react:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_reactions', filter: `lobby_id=eq.${id}` },
        (payload) => {
          void load();
          if (payload.eventType !== 'INSERT') return;
          const row = payload.new as ChatReactionRow;
          if (row.user_id === userId) return;
          if (row.target_type === 'PICK') {
            const pick = myPick(row.target_id);
            if (!pick) return;
            const player = playersByIdRef.current.get(pick.player_id);
            showToast({
              title: championTitle(row.user_id, ` reacted ${row.emoji} to your pick`),
              pick: player
                ? {
                    position: player.position,
                    name: player.name,
                    round: pick.round,
                    overall: pick.overall,
                  }
                : undefined,
              tone: 'info',
              avatar: memberAvatar(row.user_id),
              category: 'reaction',
              onClick: () => setPickModal(pick),
            });
            return;
          }
          // MESSAGE: only toast for reactions on your own reply (pick comment)
          // — a plain chat message reaction still lands as a notification,
          // just not a live toast (the chat tab isn't otherwise tracked here).
          const comment = myReply(row.target_id);
          if (!comment) return;
          const pick = picksRef.current.find((p) => p.id === comment.reply_to_pick_id) ?? null;
          const replyPlayer = pick ? playersByIdRef.current.get(pick.player_id) : undefined;
          showToast({
            title: championTitle(row.user_id, ` reacted ${row.emoji} to your reply`),
            pick:
              pick && replyPlayer
                ? {
                    position: replyPlayer.position,
                    name: replyPlayer.name,
                    round: pick.round,
                    overall: pick.overall,
                  }
                : undefined,
            body: `“${comment.body}”`,
            tone: 'info',
            avatar: memberAvatar(row.user_id),
            category: 'reaction',
            onClick: pick ? () => setPickModal(pick) : undefined,
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userId]);

  // ── Post-draft crown vote + peer grades — plain fetch + realtime refresh. ──
  const [crownVotes, setCrownVotes] = useState<DraftCrownVoteRow[]>([]);
  const [grades, setGrades] = useState<DraftGradeRow[]>([]);
  useEffect(() => {
    const loadVotes = () =>
      supabase
        .from('draft_crown_votes')
        .select('*')
        .eq('lobby_id', id)
        .then(({ data }) => setCrownVotes((data ?? []) as DraftCrownVoteRow[]));
    const loadGrades = () =>
      supabase
        .from('draft_grades')
        .select('*')
        .eq('lobby_id', id)
        .then(({ data }) => setGrades((data ?? []) as DraftGradeRow[]));
    void loadVotes();
    void loadGrades();
    const ch = supabase
      .channel(`draft-results:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'draft_crown_votes', filter: `lobby_id=eq.${id}` },
        () => void loadVotes(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'draft_grades', filter: `lobby_id=eq.${id}` },
        (payload) => {
          void loadGrades();
          if (payload.eventType === 'DELETE') return;
          const row = payload.new as DraftGradeRow;
          if (row.rater_id === userId) return;
          const myTeam = teamsRef.current.find((t) => t.owner_id === userId);
          if (!myTeam || row.team_id !== myTeam.id) return;
          showToast({
            title: championTitle(row.rater_id, ' graded your roster'),
            body: row.comment,
            tone: 'info',
            avatar: memberAvatar(row.rater_id),
            grade: row.grade,
            category: 'grade',
            onClick: () => {
              setRosterTeamSel(myTeam.id);
              setPanelTab('roster');
              setMobileTab('roster');
            },
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userId]);

  // Show the outro once per user per lobby, right after the draft finishes —
  // skip it entirely once the results window has already closed, so it never
  // nags with a vote/grade prompt that can no longer be acted on.
  const [showOutro, setShowOutro] = useState(false);
  useEffect(() => {
    if (!lobby || lobby.status !== 'COMPLETE' || !userId) return;
    // Never for a non-member spectator (a public-results viewer) — they have
    // no roster of their own for the recap to show.
    if (!members.some((m) => m.user_id === userId)) return;
    const endedAtMs = lobby.completed_at ? new Date(lobby.completed_at).getTime() : null;
    if (endedAtMs != null && Date.now() >= endedAtMs + DRAFT_RESULTS_LOCK_MS) return;
    const seenKey = `draft-outro-seen:${id}:${userId}`;
    if (localStorage.getItem(seenKey)) return;
    setShowOutro(true);
  }, [lobby, userId, id, members]);

  function dismissOutro() {
    if (userId) localStorage.setItem(`draft-outro-seen:${id}:${userId}`, '1');
    setShowOutro(false);
  }

  function groupReactions(rows: ChatReactionRow[]): Map<string, ReactionEntry> {
    const m = new Map<string, ReactionEntry>();
    for (const r of rows) {
      const e = m.get(r.target_id) ?? { counts: {}, mine: new Set<string>(), reactors: {} };
      e.counts[r.emoji] = (e.counts[r.emoji] ?? 0) + 1;
      if (r.user_id === userId) e.mine.add(r.emoji);
      (e.reactors![r.emoji] ??= []).push({
        userId: r.user_id,
        username: usernameById.get(r.user_id) ?? 'Someone',
        avatar: memberAvatar(r.user_id),
      });
      m.set(r.target_id, e);
    }
    return m;
  }

  const reactionsByPick = useMemo(
    () => groupReactions(allReactions.filter((r) => r.target_type === 'PICK')),
    [allReactions, userId],
  );
  const reactionsByMessage = useMemo(
    () => groupReactions(allReactions.filter((r) => r.target_type === 'MESSAGE')),
    [allReactions, userId],
  );

  // ── Pick comments (board indicator + pick modal thread) ──
  const [pickComments, setPickComments] = useState<ChatMessageRow[]>([]);
  const [pickCommentsLoaded, setPickCommentsLoaded] = useState(false);
  useEffect(() => {
    void supabase
      .from('chat_messages')
      .select('*')
      .eq('lobby_id', id)
      .not('reply_to_pick_id', 'is', null)
      .order('created_at')
      .then(({ data }) => {
        setPickComments((data ?? []) as ChatMessageRow[]);
        setPickCommentsLoaded(true);
      });
    const ch = supabase
      .channel(`board-comments:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `lobby_id=eq.${id}` },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          if (row.reply_to_pick_id) setPickComments((prev) => [...prev, row]);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [id]);

  const commentsByPick = useMemo(() => {
    const m = new Map<string, ChatMessageRow[]>();
    for (const c of pickComments) {
      if (!c.reply_to_pick_id) continue;
      const list = m.get(c.reply_to_pick_id) ?? [];
      list.push(c);
      m.set(c.reply_to_pick_id, list);
    }
    return m;
  }, [pickComments]);
  const pickCommentsRef = useRef(pickComments);
  pickCommentsRef.current = pickComments;

  // ── Deep link from a notification: open the relevant pick modal, or hand
  // off to the chat panel to scroll+highlight a plain message/mention. ──
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
  const focusHandledRef = useRef(false);
  useEffect(() => {
    const target = (
      location.state as {
        focusTarget?: {
          targetType: 'PICK' | 'MESSAGE' | 'TEAM';
          targetId: string;
          notifType: string;
        };
      } | null
    )?.focusTarget;
    if (!target || focusHandledRef.current) return;

    if (target.targetType === 'PICK') {
      const pick = picks.find((p) => p.id === target.targetId);
      if (!pick) return; // wait for picks to load
      setPickModal(pick);
      focusHandledRef.current = true;
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    // TEAM: a grade left on your roster — jump to the Roster tab with that
    // team selected, where the crown-votes/grades summary now lives.
    if (target.targetType === 'TEAM') {
      setRosterTeamSel(target.targetId);
      setPanelTab('roster');
      setMobileTab('roster');
      focusHandledRef.current = true;
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

    // MESSAGE: a reaction on a pick-reply comment opens that pick's modal;
    // a mention (or a reaction on a plain message) scrolls the chat to it.
    if (target.notifType !== 'MENTION') {
      if (!pickCommentsLoaded) return; // wait for the comment list to load
      const comment = pickComments.find((c) => c.id === target.targetId);
      if (comment?.reply_to_pick_id) {
        const pick = picks.find((p) => p.id === comment.reply_to_pick_id);
        if (pick) {
          setPickModal(pick);
          focusHandledRef.current = true;
          navigate(location.pathname, { replace: true, state: null });
          return;
        }
      }
    }
    setPanelTab('chat');
    setMobileTab('chat');
    setFocusMessageId(target.targetId);
    focusHandledRef.current = true;
  }, [location.state, location.pathname, picks, pickComments, pickCommentsLoaded, navigate]);

  // ── Deep link from the lobby chat: `?pick=<id>` opens that pick's modal.
  // A plain query param rather than router state — it survives a refresh or
  // a link opened in a new tab, and is visible in the URL for easy debugging. ──
  const queryPickId = searchParams.get('pick');
  useEffect(() => {
    if (!queryPickId) return;
    const pick = picks.find((p) => p.id === queryPickId);
    if (!pick) return; // wait for picks to load
    setPickModal(pick);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('pick');
        return next;
      },
      { replace: true },
    );
  }, [queryPickId, picks, setSearchParams]);

  async function reactPick(pickId: string, emoji: string) {
    if (reactionsLocked) {
      showToast({ title: 'Reactions are locked', body: 'Reactions closed 24h after the draft ended.', tone: 'warning' });
      return;
    }
    try {
      await api(`/lobbies/${id}/chat-react`, {
        method: 'POST',
        body: { targetType: 'PICK', targetId: pickId, emoji },
      });
    } catch {
      /* realtime reconciles */
    }
  }

  async function reactMessage(messageId: string, emoji: string) {
    if (reactionsLocked) {
      showToast({ title: 'Reactions are locked', body: 'Reactions closed 24h after the draft ended.', tone: 'warning' });
      return;
    }
    try {
      await api(`/lobbies/${id}/chat-react`, {
        method: 'POST',
        body: { targetType: 'MESSAGE', targetId: messageId, emoji },
      });
    } catch {
      /* realtime reconciles */
    }
  }

  async function castCrownVote(teamId: string) {
    if (resultsLocked) return;
    try {
      await api(`/lobbies/${id}/crown-vote`, { method: 'POST', body: { teamId } });
    } catch (err) {
      showToast({
        title: 'Vote failed',
        titleIcon: <ErrorOutlineIcon fontSize="inherit" />,
        body: err instanceof Error ? err.message : undefined,
        tone: 'warning',
      });
    }
  }

  async function gradeTeam(teamId: string, grade: DraftGrade, comment: string) {
    if (resultsLocked) return;
    try {
      await api(`/lobbies/${id}/grade-team`, { method: 'POST', body: { teamId, grade, comment } });
    } catch (err) {
      showToast({
        title: 'Grade failed',
        titleIcon: <ErrorOutlineIcon fontSize="inherit" />,
        body: err instanceof Error ? err.message : undefined,
        tone: 'warning',
      });
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
    const totalPicks = s.teamCount * roundsForSettings(s);
    // The frontier parks past the last slot in end-game; clamp so openSlots
    // never walks off the board.
    const frontierClamped = Math.min(overall, totalPicks);
    const taken = new Set(picks.map((p) => p.overall));
    const open = openSlots(taken, frontierClamped, s.teamCount, s.draftType);
    const teamByPos = new Map(teams.map((t) => [t.draft_position, t]));
    // The single timed slot's team (none once the frontier is past the board).
    const onClockTeam =
      overall <= totalPicks
        ? teamByPos.get(draftPositionForOverall(overall, s.teamCount, s.draftType)) ?? null
        : null;
    // Skipped, still-open slots (behind the frontier) with their team + round.
    const skipped = open
      .filter((sl) => sl.overall !== overall)
      .map((sl) => ({
        overall: sl.overall,
        round: Math.floor((sl.overall - 1) / s.teamCount) + 1,
        team: teamByPos.get(sl.position) ?? null,
      }))
      .filter((x): x is { overall: number; round: number; team: TeamRow } => !!x.team);
    // Every open slot the signed-in user owns (frontier and/or skipped), ascending.
    const myOpen = open
      .filter((sl) => teamByPos.get(sl.position)?.owner_id === userId)
      .map((sl) => sl.overall)
      .sort((a, b) => a - b);
    return { s, overall, round, onClockTeam, totalPicks, skipped, myOpen };
  }, [lobby, teams, picks, userId]);

  const isCommish = useMemo(() => {
    if (!userId || !lobby) return false;
    if (lobby.commissioner_id === userId) return true;
    return members.some((m) => m.user_id === userId && m.role === 'SUB_COMMISSIONER');
  }, [userId, lobby, members]);

  // Collapse the top bar's text-buttons to icon-only whenever a button group
  // would wrap to a second line — measured, not guessed (see the topbarRef
  // declaration above for why). Runs before paint so a spilled row never
  // flashes, and re-runs on resize + whenever the rendered button set changes.
  useLayoutEffect(() => {
    const el = topbarRef.current;
    if (!el) return;
    // A group wraps if its buttons/links don't all sit on one row. Compare
    // each item's vertical CENTER, not offsetTop: the rows use
    // align-items:center, so items of different heights on the SAME row — e.g.
    // the fixed-size square icon buttons next to the text "Menu" button on the
    // right — have different offsetTops. offsetTop alone misread that as a
    // wrap and collapsed the bar even with tons of free space (and, since
    // "Menu" only exists in fullscreen, it collapsed on every fullscreen).
    // Centers are equal across a centered row and differ by ~a row height only
    // on a genuine wrap.
    const multiRow = (group: Element | null): boolean => {
      if (!group) return false;
      const items = group.querySelectorAll<HTMLElement>('button, a');
      let firstCenter: number | null = null;
      for (const it of items) {
        const center = it.offsetTop + it.offsetHeight / 2;
        if (firstCenter === null) firstCenter = center;
        else if (Math.abs(center - firstCenter) > 4) return true;
      }
      return false;
    };
    const measure = () => {
      // Always measure the EXPANDED layout — strip the compact class first so
      // the reading reflects full-text widths even when we're already
      // collapsed, then restore it so nothing repaints mid-measurement. The
      // --measuring class freezes label transitions across this swap so it can
      // never replay the reveal/collapse animation (the real state-driven
      // collapse still animates, since --measuring isn't present then).
      const wasCompact = el.classList.contains('draft__topbar--compact');
      el.classList.add('draft__topbar--measuring');
      el.classList.remove('draft__topbar--compact');
      const need =
        multiRow(el.querySelector('.draft__left')) ||
        multiRow(el.querySelector('.draft__right'));
      if (wasCompact) el.classList.add('draft__topbar--compact');
      el.classList.remove('draft__topbar--measuring');
      if (need !== topbarCompactRef.current) setTopbarCompact(need);
    };
    measure();
    // Only the bar's WIDTH decides whether the tools fit; its height changes
    // every second as the clock ticks (and when we collapse), which would
    // otherwise re-run measure() constantly and — before the --measuring guard
    // above — flicker the labels once a second. Skip same-width callbacks.
    let lastWidth = el.offsetWidth;
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      if (w === lastWidth) return;
      lastWidth = w;
      measure();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    isFullscreen,
    isCommish,
    lobby?.status,
    autoSkipBots,
    derived?.skipped.length,
    lobby?.settings.keepersEnabled,
    lobby?.keepers_locked,
    lastPick?.id,
  ]);

  // Toast the moment YOU get skipped — your slot stays open, so it's easy to
  // miss. Fires only on the false→true transition (not every re-render).
  const wasSkippedRef = useRef(false);
  useEffect(() => {
    if (!derived || lobby?.status !== 'DRAFTING') {
      wasSkippedRef.current = false;
      return;
    }
    const frontierMine =
      derived.onClockTeam?.owner_id === userId ? derived.overall : null;
    const skippedNow = derived.myOpen.some((o) => o !== frontierMine);
    if (skippedNow && !wasSkippedRef.current) {
      showToast({
        title: 'You were skipped',
        titleIcon: <SkipNextIcon fontSize="inherit" />,
        body: 'Your clock ran out — your slot stays open, pick whenever you’re ready.',
        tone: 'warning',
      });
    }
    wasSkippedRef.current = skippedNow;
  }, [derived, userId, lobby?.status, showToast]);

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

  // Toast alerts for pause requests / pause / resume / rollback — these
  // already post a system chat message, so detect them off that instead of a
  // separate notification channel. Skip the actor's own action.
  useEffect(() => {
    const ch = supabase
      .channel(`board-toast:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `lobby_id=eq.${id}` },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          if (row.user_id === userId) return;
          if (row.kind === 'USER') {
            // The pick this message replies to, if any — regardless of whose
            // pick it is (myPick() only matches the current user's own picks,
            // which is too narrow for "where was I mentioned").
            const repliedPick = row.reply_to_pick_id
              ? (picksRef.current.find((p) => p.id === row.reply_to_pick_id) ?? null)
              : null;
            const isMyPick =
              !!repliedPick &&
              teamsRef.current.find((t) => t.id === repliedPick.team_id)?.owner_id === userId;

            if (isMyPick && repliedPick) {
              const player = playersByIdRef.current.get(repliedPick.player_id);
              showToast({
                title: championTitle(row.user_id, ' commented on your pick'),
                titleIcon: <ChatBubbleOutlineIcon fontSize="inherit" />,
                pick: player
                  ? {
                      position: player.position,
                      name: player.name,
                      round: repliedPick.round,
                      overall: repliedPick.overall,
                    }
                  : undefined,
                body: player ? `“${row.body}”` : row.body,
                tone: 'info',
                avatar: memberAvatar(row.user_id),
                category: 'reply',
                onClick: () => setPickModal(repliedPick),
              });
              return;
            }
            const myUsername = membersRef.current.find((m) => m.user_id === userId)?.profiles
              ?.username;
            if (myUsername && extractMentionedUsernames(row.body, [myUsername]).length > 0) {
              const mentionPlayer = repliedPick
                ? playersByIdRef.current.get(repliedPick.player_id)
                : undefined;
              showToast({
                title: 'You were mentioned',
                titleIcon: <AlternateEmailIcon fontSize="inherit" />,
                pick:
                  repliedPick && mentionPlayer
                    ? {
                        position: mentionPlayer.position,
                        name: mentionPlayer.name,
                        round: repliedPick.round,
                        overall: repliedPick.overall,
                      }
                    : undefined,
                body: `“${row.body}”`,
                tone: 'info',
                avatar: memberAvatar(row.user_id),
                category: 'mention',
                onClick: repliedPick
                  ? () => setPickModal(repliedPick)
                  : () => {
                      setPanelTab('chat');
                      setMobileTab('chat');
                      setFocusMessageId(row.id);
                    },
              });
            }
            return;
          }
          if (row.kind !== 'SYSTEM') return;
          if (row.body.startsWith('🙋')) {
            if (isCommish) {
              showToast({
                title: 'Pause requested',
                titleIcon: <PauseCircleOutlineIcon fontSize="inherit" />,
                body: row.body.replace('🙋 ', ''),
                tone: 'warning',
                action: { label: 'Pause draft', onClick: () => commishAction('pause') },
                avatar: memberAvatar(row.user_id),
                category: 'draft_control',
              });
            }
          } else if (row.body.startsWith('⏸️')) {
            showToast({
              title: 'Draft paused',
              titleIcon: <PauseIcon fontSize="inherit" />,
              body: row.body.replace('⏸️ ', ''),
              tone: 'warning',
              avatar: memberAvatar(row.user_id),
              category: 'draft_control',
            });
          } else if (row.body.startsWith('▶️')) {
            showToast({
              title: 'Draft resumed',
              titleIcon: <PlayArrowIcon fontSize="inherit" />,
              body: row.body.replace('▶️ ', ''),
              tone: 'success',
              avatar: memberAvatar(row.user_id),
              durationMs: 2000,
              category: 'draft_control',
            });
          } else if (row.body.startsWith('↩️')) {
            showToast({
              title: 'Pick rolled back',
              titleIcon: <UndoIcon fontSize="inherit" />,
              body: row.body.replace('↩️ ', ''),
              tone: 'info',
              category: 'draft_control',
              avatar: memberAvatar(row.user_id),
            });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userId, isCommish]);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      if (!showDrafted && draftedIds.has(p.id)) return false;
      if (filter === 'QUEUE') {
        if (!queue.includes(p.id)) return false;
      } else if (filter === 'FAVORITES') {
        if (!favoriteIds?.has(p.id)) return false;
      } else if (filter === 'FLEX') {
        if (!(FLEX_POS as string[]).includes(p.position)) return false;
      } else if (filter === 'SUPERFLEX') {
        if (!(SUPERFLEX_POS as string[]).includes(p.position)) return false;
      } else if (filter !== 'ALL' && p.position !== filter) {
        return false;
      }
      if (p.bye_week != null && excludedByeWeeks.has(p.bye_week)) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [players, draftedIds, filter, search, queue, favoriteIds, excludedByeWeeks, showDrafted]);
  // Only offer bye weeks that actually appear in the pool right now (not a
  // fixed 1-18 list) — so the filter row shrinks as the board fills up.
  const availableByeWeeks = useMemo(() => {
    const weeks = new Set<number>();
    for (const p of players) {
      if (draftedIds.has(p.id)) continue;
      if (p.bye_week != null) weeks.add(p.bye_week);
    }
    return Array.from(weeks).sort((a, b) => a - b);
  }, [players, draftedIds]);

  if (loading || playersLoading)
    return (
      <div className="loading">
        <Loader label="Loading draft…" />
      </div>
    );
  if (!lobby) return <ErrorScreen title="Draft not found" />;
  if (lobby.status === 'SETUP' || lobby.status === 'SCHEDULED')
    return <Navigate to={`/lobby/${id}`} replace />;

  const { round, onClockTeam, skipped, myOpen } = derived!;
  const totalRounds = roundsForSettings(lobby.settings);
  const isComplete = lobby.status === 'COMPLETE';
  const isPaused = lobby.status === 'PAUSED';
  // STAGING: the room is open but the draft hasn't started — no clock, no
  // picking, no on-clock highlight. People take seats and (once keepers ship)
  // lock keepers; the commissioner starts from the red Start button below.
  const isStaging = lobby.status === 'STAGING';
  const endedAt = isComplete ? lobby.completed_at ?? null : null;
  // clockNow (ticks every second — see above), not Date.now(): these gate
  // interactive UI (chat box, grading form, etc.), so they need to flip the
  // moment their window closes, not just whenever something else happens to
  // trigger a re-render — otherwise a tab left open straddles the deadline
  // showing an already-locked form as if it were still open.
  // Commissioner-configured at lobby creation (default 24h) — chat and
  // reactions share this one lock delay.
  const chatLocked = !!endedAt && clockNow >= new Date(endedAt).getTime() + lobby.chat_lock_ms;
  const reactionsLocked = chatLocked;
  // Commissioners can still fix a mistake right after the draft ends, but the
  // rollback feature disappears for good a few minutes later.
  const rollbackLocked =
    !!endedAt && clockNow >= new Date(endedAt).getTime() + ROLLBACK_LOCK_MS;
  // Crown vote + peer grading stay open 24h after the draft, same as reactions.
  const resultsLocked =
    !!endedAt && clockNow >= new Date(endedAt).getTime() + DRAFT_RESULTS_LOCK_MS;
  const isMyTurn = !isStaging && !!onClockTeam && onClockTeam.owner_id === userId;
  // I own an open slot behind the frontier — I was skipped but can still pick.
  const myFrontierOverall = onClockTeam?.owner_id === userId ? derived!.overall : null;
  const iAmSkipped = !isStaging && myOpen.some((o) => o !== myFrontierOverall);
  // I can pick if I own ANY open slot (on the clock OR skipped), or I'm a commish.
  const iOwnAnOpenSlot = !isStaging && myOpen.length > 0;
  const canPick = !isStaging && !isComplete && !isPaused && (iOwnAnOpenSlot || isCommish);
  // My earliest open slot's round — what a pick will fill next.
  const myNextOverall = myOpen.length ? myOpen[0] : null;
  const myNextRound = myNextOverall
    ? Math.floor((myNextOverall - 1) / lobby.settings.teamCount) + 1
    : null;
  // Every open slot I own, as { overall, round } — when I owe more than one
  // (skipped and up again, e.g. the snake turn), the LockInModal offers a
  // button per slot so I choose which round/pick this player fills.
  const myOpenSlots = myOpen.map((o) => ({
    overall: o,
    round: Math.floor((o - 1) / lobby.settings.teamCount) + 1,
  }));
  // Only show "picking for X" when the caller doesn't own an open slot (a
  // commissioner covering the team on the clock) — never when picking your own.
  const pickingForTeam = !iOwnAnOpenSlot && onClockTeam ? onClockTeam.name : null;
  // Board highlight: `${round}:${teamId}` for every skipped, still-open slot.
  const skippedCellKeys = new Set(skipped.map((sl) => `${sl.round}:${sl.team.id}`));
  // Distinct skipped team names (a team may owe more than one) for the banner —
  // commented out alongside the center "Skipped: …" line it fed, to keep the
  // clock/pick uncluttered (skips still surface via the board cells, the
  // self-skip toast, and the commissioner's "Auto-pick skipped" button).
  // const skippedTeamNames = Array.from(
  //   new Map(skipped.map((sl) => [sl.team.id, sl.team.name])).values(),
  // );
  // Staging counters: humans seated, and keepers placed vs. the total allowance
  // (sum of each team's keeper_count) when keepers are enabled.
  const humansSeated = teams.filter((t) => t.owner_id && !t.is_bot).length;
  const keepersSelected = picks.filter((p) => p.is_keeper).length;
  const keepersExpected = lobby.settings.keepersEnabled
    ? teams.reduce((n, t) => n + t.keeper_count, 0)
    : 0;
  const myTeamId = teams.find((t) => t.owner_id === userId)?.id ?? teams[0]?.id ?? null;
  const myTeam = teams.find((t) => t.owner_id === userId) ?? null;
  // Owner-choice: this team's offered candidates + how many keepers remain.
  const myKeeperOptions = myTeam
    ? keeperOptions.filter((o) => o.team_id === myTeam.id)
    : [];
  const myKeepersLeft = myTeam
    ? myTeam.keeper_count - myKeeperOptions.filter((o) => o.selected).length
    : 0;
  // A signed-in visitor with no membership row — only possible at all once
  // the commissioner has opted into public results and/or public chat.
  const isMember = members.some((m) => m.user_id === userId);
  const canVote = isMember || lobby.public_voting_allowed;
  const canGrade = isMember;
  const rosterTeamId = rosterTeamSel ?? myTeamId ?? teams[0]?.id ?? '';

  // How many players the current user has drafted at each position (for filter badges).
  const myPosCounts: Partial<Record<Position, number>> = {};
  for (const p of picks) {
    if (p.team_id !== myTeamId) continue;
    const pos = playersById.get(p.player_id)?.position as Position | undefined;
    if (pos) myPosCounts[pos] = (myPosCounts[pos] ?? 0) + 1;
  }

  // My drafted-player count per (position, bye week) — powers the bye-clash
  // color coding in the player pool and the clash breakdown shown in the
  // player/pick detail modals. Skipped entirely when the setting is off.
  const byeLookup = showByeClashes
    ? byeClashLookup(picks, playersById, myTeamId)
    : new Map<string, number>();

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
    // In fullscreen the sidebar itself isn't rendered — the Roster panel only
    // becomes visible inside the Menu modal, so switching tabs alone would be
    // a silent no-op from the user's perspective.
    if (isFullscreen) setShowFsMenu(true);
  }

  /** Jump to the player pool — used when the commissioner clicks the on-clock
   * team to pick on its behalf. Same fullscreen caveat as openTeamRoster. */
  function openPlayersPool() {
    setPanelTab('players');
    setMobileTab('players');
    if (isFullscreen) setShowFsMenu(true);
  }

  // `overall` names a specific open slot to fill — set only when a skipped
  // picker who's up again chose which of their slots this player goes into
  // (see LockInModal). Omitted → the server fills their earliest open slot.
  async function confirmPick(overall?: number) {
    if (!selected) return;
    setPickError(null);
    setPickBusy(true);
    try {
      await api(`/lobbies/${id}/pick`, {
        method: 'POST',
        body: { playerId: selected.id, ...(overall != null ? { overall } : {}) },
      });
      setSelected(null);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Pick failed');
    } finally {
      setPickBusy(false);
    }
  }

  async function commishAction(path: 'pause' | 'resume') {
    setCommishError(null);
    setPauseBusy(true);
    try {
      await api(`/lobbies/${id}/${path}`, { method: 'POST' });
    } catch (err) {
      setCommishError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setPauseBusy(false);
    }
  }

  // Commissioner backstop: auto-pick every skipped team's outstanding slot at
  // once (an abandoned team on an unlimited allowance, or the end-game).
  async function autopickSkipped() {
    setCommishError(null);
    setAutopickBusy(true);
    try {
      await api(`/lobbies/${id}/autopick-skipped`, { method: 'POST' });
    } catch (err) {
      setCommishError(err instanceof Error ? err.message : 'Failed to auto-pick skipped teams');
    } finally {
      setAutopickBusy(false);
    }
  }

  // Commissioner starts the draft from staging (STAGING → DRAFTING). Realtime
  // flips everyone's board out of the staging layout — no navigation needed.
  async function startDraft() {
    setCommishError(null);
    setCommishBusy(true);
    try {
      await api(`/lobbies/${id}/start`, { method: 'POST' });
    } catch (err) {
      setCommishError(err instanceof Error ? err.message : 'Failed to start the draft');
    } finally {
      setCommishBusy(false);
    }
  }

  // Freezes everyone but the commissioner out of keep/unkeep — a deliberate
  // "everything's set" checkpoint before Start, same shape as team-names-locked.
  async function toggleKeepersLocked(locked: boolean) {
    setCommishError(null);
    setKeepersLockBusy(true);
    try {
      await api(`/lobbies/${id}/keepers-locked`, { method: 'POST', body: { locked } });
    } catch (err) {
      setCommishError(err instanceof Error ? err.message : 'Failed to update the keeper lock');
    } finally {
      setKeepersLockBusy(false);
    }
  }

  async function rollbackTo(overall: number) {
    setCommishError(null);
    setCommishBusy(true);
    try {
      await api(`/lobbies/${id}/rollback-to`, { method: 'POST', body: { overall } });
    } catch (err) {
      setCommishError(err instanceof Error ? err.message : 'Rollback failed');
    } finally {
      setCommishBusy(false);
      setRollbackTarget(null);
      setRollbackConfirmText('');
    }
  }

  // Commissioner clicked a skipped cell on the board — resolve which slot it is
  // (round + that team's draft position) and open the rollback confirm aimed at
  // it. The skip has no pick row, so this goes through the skip target path.
  function openSkipRollback(round: number, teamId: string) {
    const team = teamsById.get(teamId);
    if (!team || !lobby) return;
    const overall = overallForDraftPosition(
      round,
      team.draft_position,
      teams.length,
      lobby.settings.draftType,
    );
    setRollbackTarget({ kind: 'skip', overall, round, teamId });
  }

  async function requestPause() {
    setReqPauseBusy(true);
    try {
      await api(`/lobbies/${id}/request-pause`, { method: 'POST' });
      showToast({
        title: 'Pause requested',
        titleIcon: <PauseCircleOutlineIcon fontSize="inherit" />,
        body: "The commissioner's been notified.",
        tone: 'info',
        durationMs: 2000,
      });
    } catch {
      showToast({
        title: "Couldn't request a pause",
        titleIcon: <ErrorOutlineIcon fontSize="inherit" />,
        tone: 'danger',
      });
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
    const controller = new AbortController();
    fastForwardAbortRef.current = controller;
    try {
      await api(`/lobbies/${id}/fast-forward`, { method: 'POST', signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setCommishError(err instanceof Error ? err.message : 'Fast-forward failed');
    } finally {
      setCommishBusy(false);
      fastForwardAbortRef.current = null;
    }
  }

  const myTurnHighlight = isMyTurn && !isPaused && !isComplete;
  const myTurnSecondsLeft = myTurnHighlight && lobby.pick_deadline
    ? Math.max(0, Math.floor((new Date(lobby.pick_deadline).getTime() - clockNow) / 1000))
    : null;
  const myTurnUrgency =
    myTurnSecondsLeft == null
      ? null
      : myTurnSecondsLeft <= 10
        ? 'danger'
        : myTurnSecondsLeft <= 25
          ? 'warning'
          : null;
  const myTurnFlashing = myTurnSecondsLeft != null && myTurnSecondsLeft <= 5;

  // Same countdown, but for whichever team is on the clock (not just the
  // viewer) — drives the draft grid's on-clock cell progress fill/urgency
  // color for every viewer, not only the person whose turn it is. While
  // paused, pick_deadline goes null server-side, so this falls back to the
  // frozen snapshot (pick_deadline_remaining_ms) instead of going blank —
  // the cell's color/fill should hold exactly where it was, not reset.
  const onClockRemainingMs = isComplete
    ? null
    : isPaused
      ? lobby.pick_deadline_remaining_ms
      : lobby.pick_deadline
        ? new Date(lobby.pick_deadline).getTime() - clockNow
        : null;
  const onClockCellSecondsLeft =
    onClockRemainingMs != null ? Math.max(0, Math.floor(onClockRemainingMs / 1000)) : null;
  const onClockCellUrgency =
    onClockCellSecondsLeft == null
      ? null
      : onClockCellSecondsLeft <= 10
        ? 'danger'
        : onClockCellSecondsLeft <= 25
          ? 'warning'
          : null;
  // No pulse while paused — the pulse implies an actively ticking clock.
  const onClockCellFlashing =
    !isPaused && onClockCellSecondsLeft != null && onClockCellSecondsLeft <= 5;
  const onClockCellTotalSeconds = isComplete
    ? null
    : secondsForRound(round, lobby.settings.pickTiers);
  // Whoever's on the clock is untimed (an unlimited round, or an unlimited-bot
  // solo mock) — the engine leaves pick_deadline null, so show "∞" and no
  // progress fill. Paused/complete/"waiting" states are excluded.
  const clockUnlimited = !isComplete && !isPaused && !!onClockTeam && !lobby.pick_deadline;
  const onClockCellElapsedPct =
    onClockCellSecondsLeft != null && onClockCellTotalSeconds
      ? Math.min(
          1,
          Math.max(0, (onClockCellTotalSeconds - onClockCellSecondsLeft) / onClockCellTotalSeconds),
        )
      : null;

  // From a read-only keeper view modal's edit pencil: close it and open the
  // Keeper Manager scoped straight to this team.
  function openKeeperEditor(teamId: string) {
    setKeeperEditTeamId(teamId);
    setShowAllKeepers(false);
    setShowTeamKeepers(false);
    setShowKeepers(true);
  }

  // Commissioner-only tools. Rendered twice — inline in the desktop top bar,
  // and again in a bar flush above the mobile bottom nav — with CSS (not this
  // function) deciding which copy is visible per breakpoint.
  function CommishTools() {
    if (!isCommish) return null;
    // After the draft ends, only a short-lived "Undo" survives (so the
    // commissioner can fix a last-second mistake) — everything else goes away.
    if (isComplete) {
      if (rollbackLocked || !lastPick) return null;
      return (
        <>
          <button
            className="draft__tool-btn"
            onClick={() => setRollbackTarget({ kind: 'pick', pick: lastPick })}
            disabled={commishBusy}
          >
            <UndoIcon fontSize="small" />
            <span className="draft__btn-label">Undo</span>
          </button>
          {commishError && <span className="draft__commish-error">{commishError}</span>}
        </>
      );
    }
    // Staging: manage keepers (if enabled) and start the draft.
    if (isStaging) {
      return (
        <>
          {lobby?.settings.keepersEnabled && (
            <button
              className="draft__tool-btn draft__keepers-btn"
              onClick={() => setShowKeepers(true)}
              disabled={commishBusy}
            >
              <LockOutlinedIcon fontSize="small" />
              <span className="draft__btn-label">Keepers</span>
            </button>
          )}
          {lobby?.settings.keepersEnabled && (
            <button
              className={`draft__tool-btn draft__keeperslock-btn${
                lobby.keepers_locked ? ' is-on' : ''
              }`}
              onClick={() => toggleKeepersLocked(!lobby.keepers_locked)}
              disabled={keepersLockBusy}
              title={
                lobby.keepers_locked
                  ? 'Owners can no longer change their keepers — click to unlock'
                  : 'Lock keeper selections so nothing changes before you start'
              }
            >
              {lobby.keepers_locked ? (
                <LockOutlinedIcon fontSize="small" />
              ) : (
                <LockOpenOutlinedIcon fontSize="small" />
              )}
              <span className="draft__btn-label">
                {lobby.keepers_locked ? 'Keepers locked' : 'Lock keepers'}
              </span>
            </button>
          )}
          <button
            className="draft__tool-btn draft__start-btn"
            onClick={startDraft}
            disabled={commishBusy}
          >
            <PlayArrowIcon fontSize="small" />
            <span className="draft__btn-label">Start draft</span>
          </button>
          {commishError && <span className="draft__commish-error">{commishError}</span>}
        </>
      );
    }
    return (
      <>
        {isPaused ? (
          <button
            className="draft__tool-btn"
            onClick={() => commishAction('resume')}
            disabled={pauseBusy}
          >
            <PlayArrowIcon fontSize="small" />
            <span className="draft__btn-label">Resume</span>
          </button>
        ) : (
          <button
            className="draft__tool-btn"
            onClick={() => commishAction('pause')}
            disabled={pauseBusy}
          >
            <PauseIcon fontSize="small" />
            <span className="draft__btn-label">Pause</span>
          </button>
        )}
        <button
          className="draft__tool-btn"
          onClick={() => lastPick && setRollbackTarget({ kind: 'pick', pick: lastPick })}
          disabled={commishBusy || !lastPick}
        >
          <UndoIcon fontSize="small" />
          <span className="draft__btn-label">Undo</span>
        </button>
        <button
          className={`draft__tool-btn draft__skipbots-btn${autoSkipBots ? ' is-on' : ''}`}
          onClick={() =>
            setAutoSkipBots((v) => {
              if (v) fastForwardAbortRef.current?.abort();
              return !v;
            })
          }
          title="Automatically skip bot picks as they come on the clock"
        >
          <FastForwardIcon fontSize="small" />
          <span className="draft__btn-label">Skip bots{autoSkipBots ? ' · On' : ''}</span>
        </button>
        {skipped.length > 0 && (
          <button
            className="draft__tool-btn"
            onClick={autopickSkipped}
            disabled={autopickBusy}
            title="Auto-pick for every skipped team's outstanding slot"
          >
            <SkipNextIcon fontSize="small" />
            <span className="draft__btn-label">Auto-pick skipped · {skipped.length}</span>
          </button>
        )}
        {commishError && <span className="draft__commish-error">{commishError}</span>}
      </>
    );
  }

  // Member-only "Request pause". `compact` renders an icon-only button for
  // the mobile top bar; the full text version stays in the desktop top bar.
  function RequestPauseButton({ compact }: { compact?: boolean }) {
    if (isCommish || isComplete || isPaused || isStaging) return null;
    return (
      <button
        className={compact ? 'draft__icon-btn draft__reqpause-btn' : 'draft__tool-btn'}
        onClick={requestPause}
        disabled={reqPauseBusy}
        aria-label="Request pause"
        title="Ask the commissioner to pause the draft"
      >
        {compact ? (
          <PauseIcon fontSize="small" />
        ) : (
          <>
            <PauseIcon fontSize="small" />
            <span className="draft__btn-label">Request pause</span>
          </>
        )}
      </button>
    );
  }

  // Shared between the sidebar's Players tab and the fullscreen "Players"
  // modal. Deliberately a plain function called as {renderPlayersPool()}
  // rather than a nested <PlayersPool/> component — the latter would be a
  // new component type on every render and remount the subtree, dropping
  // focus out of the search input on every keystroke.
  function renderPlayersPool() {
    if (!lobby) return null; // already guaranteed by the guard above — narrows for TS
    // Also closes the fullscreen Players modal (no-op elsewhere) — it's
    // rendered later in the DOM than LockInModal, so left open it would
    // paint on top and hide the pick-confirm dialog behind it.
    function pick(p: PlayerRow) {
      setSelected(p);
      setShowFsMenu(false);
    }
    // Don't offer a filter chip for a position/slot this league's roster
    // doesn't actually use (e.g. a no-kicker league shouldn't show a K chip).
    const draftable = draftablePositions(lobby.settings.rosterComposition);
    const flexSlots = new Set(
      lobby.settings.rosterComposition.filter((r) => r.count > 0).map((r) => r.slot),
    );
    // Same dropdown either way — only its position in the layout changes.
    // Next to the chips there's room to spare on the desktop sidebar, but in
    // the fullscreen Menu modal the chip row is already tight, so it moves
    // down next to the search box instead.
    const byeFilter = availableByeWeeks.length > 0 && (
      <div className="pool__byefilter" ref={byeDropdownRef}>
        <button
          type="button"
          className={`pool__byefilter-btn ${excludedByeWeeks.size > 0 ? 'is-active' : ''}`}
          onClick={() => setByeDropdownOpen((o) => !o)}
          aria-expanded={byeDropdownOpen}
        >
          Hide byes
          {excludedByeWeeks.size > 0 && (
            <span className="pool__byefilter-count">{excludedByeWeeks.size}</span>
          )}
          <ExpandMoreIcon fontSize="small" />
        </button>
        {byeDropdownOpen && (
          <div className="pool__byefilter-panel">
            {availableByeWeeks.map((week) => (
              <label key={week} className="pool__byefilter-opt">
                <input
                  type="checkbox"
                  checked={excludedByeWeeks.has(week)}
                  onChange={() => toggleByeWeekFilter(week)}
                />
                Week {week}
              </label>
            ))}
            {excludedByeWeeks.size > 0 && (
              <button
                type="button"
                className="pool__byefilter-clear"
                onClick={() => setExcludedByeWeeks(new Set())}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>
    );
    return (
      <>
        {queuedPlayers.length > 0 && (
          <div className="pool__queue">
            <div className="pool__queue-head">Queue ({queuedPlayers.length})</div>
            {queuedPlayers.map((p) => (
              <PoolCard
                key={p.id}
                player={p}
                posRank={p.proj_rank}
                queued
                onQueue={() => toggleQueue(p.id)}
                onFavorite={canFavorite ? () => toggleFavorite(p.id) : undefined}
                favorited={favoriteIds?.has(p.id) ?? false}
                onPick={canPick ? () => pick(p) : undefined}
                disabled={!canPick}
                onOpenDetail={() => setDetailPlayer(p)}
                byeClashCount={
                  p.bye_week != null ? byeLookup.get(`${p.position}:${p.bye_week}`) : undefined
                }
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

            {POSITIONS.filter((pos) => draftable.has(pos)).map((pos) => (
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
            {(['FLEX', 'SUPERFLEX'] as const)
              .filter((f) => flexSlots.has(f))
              .map((f) => (
                <button
                  key={f}
                  className={`chip ${filter === f ? 'chip--active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'SUPERFLEX' ? 'OP' : f}
                </button>
              ))}
            <button
              className={`chip chip--queue ${filter === 'QUEUE' ? 'chip--active' : ''}`}
              onClick={() => setFilter(filter === 'QUEUE' ? 'ALL' : 'QUEUE')}
            >
              <BookmarkIcon fontSize="inherit" />
              <span className="chip__dot"> · </span>
              <span className="chip__count">{queuedPlayers.length}</span>
            </button>
            {canFavorite && (
              <button
                className={`chip chip--fav ${filter === 'FAVORITES' ? 'chip--active' : ''}`}
                onClick={() => setFilter(filter === 'FAVORITES' ? 'ALL' : 'FAVORITES')}
                title="Your favorites"
              >
                <StarIcon fontSize="inherit" />
                <span className="chip__dot"> · </span>
                <span className="chip__count">{favoriteIds?.size ?? 0}</span>
              </button>
            )}
            <label className="pool__showdrafted">
              <input
                type="checkbox"
                checked={showDrafted}
                onChange={(e) => setShowDrafted(e.target.checked)}
              />
              Show drafted
            </label>
          </div>
          <div className="pool__searchrow">
            <div className="pool__search-wrap">
              <input
                className="pool__search"
                type="search"
                placeholder="Search players…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="pool__search-clear"
                  aria-label="Clear search"
                  onClick={() => setSearch('')}
                >
                  <CloseIcon fontSize="small" />
                </button>
              )}
            </div>
            {byeFilter}
          </div>
        </div>
        <div className="pool__list">
          {available.slice(0, 200).map((p) => {
            const isDrafted = draftedIds.has(p.id);
            return (
              <PoolCard
                key={p.id}
                player={p}
                posRank={p.proj_rank}
                drafted={isDrafted}
                draftedLabel={isDrafted ? pickLabelByPlayerId.get(p.id) : undefined}
                onPick={!isDrafted && canPick ? () => pick(p) : undefined}
                disabled={!canPick}
                onQueue={isDrafted ? undefined : () => toggleQueue(p.id)}
                queued={queue.includes(p.id)}
                onFavorite={canFavorite ? () => toggleFavorite(p.id) : undefined}
                favorited={favoriteIds?.has(p.id) ?? false}
                onOpenDetail={() => {
                  // A drafted player opens its pick (who took them, round/pick);
                  // an available one opens the plain player-detail modal.
                  const pk = isDrafted ? pickByPlayerId.get(p.id) : undefined;
                  if (pk) setPickModal(pk);
                  else setDetailPlayer(p);
                }}
                byeClashCount={
                  p.bye_week != null ? byeLookup.get(`${p.position}:${p.bye_week}`) : undefined
                }
              />
            );
          })}
          {available.length === 0 && <p className="muted pool__empty">No players match.</p>}
        </div>
      </>
    );
  }

  // Shared between the actual sidebar (hidden in full screen) and the
  // fullscreen "Menu" modal — same tab bar, same four panels. All of
  // .draft__sidebar-tabs/.draft__panel-body/etc. are styled as standalone
  // BEM-ish classes (not scoped to .draft__sidebar specifically), so this
  // markup renders identically wherever it's dropped in.
  function renderSidebarPanels() {
    if (!lobby) return null; // already guaranteed by the guard above — narrows for TS
    return (
      <>
        <div className="draft__sidebar-tabs">
          {SIDEBAR_TABS.filter((t) => t.key !== 'results' || isComplete)
            .filter((t) => t.key !== 'chat' || isMember || lobby.chat_public)
            .map(({ key, label, Icon }) => (
              <button
                key={key}
                className={`draft__stab ${panelTab === key ? 'is-active' : ''}`}
                onClick={() => {
                  // Kept in sync so this tab strip also works inside the
                  // fullscreen modal on a narrow viewport, where panel
                  // visibility is driven by mobileTab, not panelTab.
                  setPanelTab(key);
                  setMobileTab(key);
                }}
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
          {renderPlayersPool()}
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
              onPickClick={setPickModal}
              belowSelect={
                isComplete
                  ? (() => {
                      const voteCount = crownVotes.filter((v) => v.team_id === rosterTeamId).length;
                      const teamGrades = grades.filter((g) => g.team_id === rosterTeamId);
                      const avgGrade = mostCommonGrade(teamGrades);
                      return (
                        <>
                          <span className="lineup-view__label">Report Card</span>
                          <button
                            type="button"
                            className="draft__results-summary"
                            onClick={() => {
                              // The fullscreen modal has no room for a second
                              // slide-in drawer on top of itself — jump to the
                              // Power Rankings center view (and close the menu so
                              // it's visible) instead.
                              if (isFullscreen) {
                                setCenterView('rankings');
                                setShowFsMenu(false);
                              } else setResultsDrawerView((v) => (v === 'closed' ? 'open' : 'closed'));
                            }}
                          >
                            <GradeBadge grade={avgGrade} size={44} />
                            <div className="draft__results-summary-main">
                              <span className="draft__results-summary-item">
                                <EmojiEventsOutlinedIcon fontSize="small" /> {voteCount} vote
                                {voteCount === 1 ? '' : 's'}
                              </span>
                              <span className="draft__results-summary-item muted">
                                {teamGrades.length} grade
                                {teamGrades.length === 1 ? '' : 's'}
                              </span>
                            </div>
                            <ChevronRightIcon
                              fontSize="small"
                              className="draft__results-summary-chevron"
                            />
                          </button>
                        </>
                      );
                    })()
                  : isStaging && lobby.settings.keepersEnabled
                    ? (
                        <button
                          type="button"
                          className="draft__view-keepers-btn"
                          onClick={() => setShowTeamKeepers(true)}
                        >
                          <LockOutlinedIcon fontSize="small" /> View keepers
                        </button>
                      )
                    : undefined
              }
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
            chatLockMs={lobby.chat_lock_ms}
            picks={picks}
            grades={grades}
            teamsById={teamsById}
            playersById={playersById}
            members={members}
            onOpenPick={setPickModal}
            focusMessageId={focusMessageId}
            onFocusHandled={() => setFocusMessageId(null)}
            viewOnly={!isMember}
          />
        </div>

        {/* Rankings (mobile) — Power Rankings + crown vote + peer grading. On
            desktop/fullscreen this lives in the center view instead; here it
            only ever shows on the mobile "Rankings" tab. */}
        {isComplete && (
          <div
            className={`draft__panel-body ${
              mobileTab === 'results' ? 'is-mobile-active' : ''
            }`}
          >
            <PowerRankingsPanel
              teams={teams}
              members={members}
              picks={picks}
              playersById={playersById}
              settings={lobby.settings}
              myTeamId={myTeam?.id ?? null}
              myUserId={userId}
              crownVotes={crownVotes}
              grades={grades}
              locked={resultsLocked}
              canVote={canVote}
              canGrade={canGrade}
              onVote={castCrownVote}
              onGrade={gradeTeam}
              onPickClick={setPickModal}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <div className="draft">
      <header
        ref={topbarRef}
        className={`draft__topbar${isFullscreen ? ' draft__topbar--fill' : ''}${
          topbarCompact ? ' draft__topbar--compact' : ''
        }${myTurnHighlight ? ' draft__topbar--myturn' : ''}${
          myTurnUrgency ? ` draft__topbar--${myTurnUrgency}` : ''
        }${myTurnFlashing ? ' draft__topbar--flash' : ''}`}
      >
        {onClockCellElapsedPct != null && (
          <span
            className={`draft__topbar-fill${fillResetting ? ' draft__topbar-fill--reset' : ''}`}
            style={{ width: `${onClockCellElapsedPct * 100}%` }}
            aria-hidden
          />
        )}
        <div className="draft__left">
          <div className="draft__nav-links">
            <button
              type="button"
              className="draft__home-btn"
              onClick={() => navigate('/home')}
            >
              <HomeIcon fontSize="small" />
              <span className="draft__btn-label">Home</span>
            </button>
            {isMember && (
              <Link to={`/lobby/${id}`} className="draft__room-btn">
                <MeetingRoomIcon fontSize="small" />
                <span className="draft__btn-label">Room</span>
              </Link>
            )}
          </div>
          {isComplete && (
            <div className="draft__viewtoggle" role="group" aria-label="Center view">
              <button
                type="button"
                className={`draft__viewtoggle-btn${centerView === 'board' ? ' is-active' : ''}`}
                aria-pressed={centerView === 'board'}
                onClick={() => setCenterView('board')}
              >
                <GridViewOutlinedIcon fontSize="small" />
                <span className="draft__btn-label">Board</span>
              </button>
              <button
                type="button"
                className={`draft__viewtoggle-btn${centerView === 'rankings' ? ' is-active' : ''}`}
                aria-pressed={centerView === 'rankings'}
                onClick={() => setCenterView('rankings')}
              >
                <LeaderboardIcon fontSize="small" />
                <span className="draft__btn-label">Power Rankings</span>
              </button>
            </div>
          )}
          {!isComplete && (
            <div className="draft__commish-tools">
              {/* Called as functions, NOT <CommishTools /> — a component
                  defined inside this one has a fresh identity every render, so
                  as JSX it would remount its whole button subtree on every
                  clock tick (recreating the DOM nodes and re-triggering their
                  label transitions). Same reason renderPlayersPool() is a
                  plain call. */}
              {CommishTools()}
              {RequestPauseButton({})}
            </div>
          )}
        </div>
        <div className="draft__center">
          <div className="draft__status">
            {isComplete ? (
              <strong className="draft__complete">
                <EmojiEventsIcon fontSize="small" /> Draft complete
              </strong>
            ) : isStaging ? (
              <span className="draft__staging-status">
                <MeetingRoomIcon fontSize="small" /> Draft room open
                <span className="draft__staging-counts">
                  <span
                    className={`draft__count draft__count--seated${
                      humansSeated >= lobby.settings.teamCount ? ' is-complete' : ''
                    }`}
                  >
                    {humansSeated >= lobby.settings.teamCount && <CheckIcon fontSize="inherit" />}
                    {humansSeated}/{lobby.settings.teamCount} seated
                  </span>
                  {keepersExpected > 0 && (
                    <span
                      className={`draft__count draft__count--keepers${
                        keepersSelected >= keepersExpected ? ' is-complete' : ''
                      }`}
                    >
                      {keepersSelected >= keepersExpected && <CheckIcon fontSize="inherit" />}
                      {keepersSelected}/{keepersExpected} keepers
                    </span>
                  )}
                </span>
              </span>
            ) : (
              <>
                {onClockTeam ? (
                  <button
                    type="button"
                    className="draft__onclock-team draft__onclock-team--btn"
                    onClick={() => openTeamRoster(onClockTeam.id)}
                    title={`View ${onClockTeam.name}'s lineup`}
                  >
                    <span className="draft__onclock-avatar">
                      <Avatar
                        avatar={avatarForTeam(onClockTeam, members)}
                        size={isFullscreen ? 30 : 20}
                      />
                    </span>
                    {onClockTeam.name}
                    {isMyTurn && !isPaused && (
                      <span className="draft__yourturn">Your pick</span>
                    )}
                    {!isMyTurn && iAmSkipped && !isPaused && (
                      <span className="draft__yourturn draft__yourturn--skipped">
                        You can still pick{myNextRound ? ` · R${myNextRound}` : ''}
                      </span>
                    )}
                    {isPaused && <span className="draft__paused-pill">Paused</span>}
                  </button>
                ) : (
                  <span className="draft__onclock-team">
                    {skipped.length > 0 ? 'Waiting on skipped picks' : 'Waiting…'}
                    {!isMyTurn && iAmSkipped && !isPaused && (
                      <span className="draft__yourturn draft__yourturn--skipped">
                        You can still pick{myNextRound ? ` · R${myNextRound}` : ''}
                      </span>
                    )}
                    {isPaused && <span className="draft__paused-pill">Paused</span>}
                  </span>
                )}
                {onClockTeam && (
                  <span className="muted">
                    Round {round} · Pick {lobby.current_overall}
                  </span>
                )}
                {/* {skippedTeamNames.length > 0 && (
                  <span className="draft__skipped-line" title="Skipped — still on the board">
                    <SkipNextIcon fontSize="inherit" /> Skipped: {skippedTeamNames.join(', ')}
                  </span>
                )} */}
              </>
            )}
          </div>
          {!isComplete && !isStaging && (
            <PickClock
              deadline={lobby.pick_deadline}
              frozenMs={lobby.pick_deadline_remaining_ms}
              unlimited={clockUnlimited}
            />
          )}
        </div>
        <div className="draft__right">
          {isComplete && (
            <button className="draft__export-btn" onClick={() => setShowExport(true)}>
              <FileDownloadOutlinedIcon fontSize="small" />
              <span className="draft__btn-label">Export</span>
            </button>
          )}
          {!isComplete && RequestPauseButton({ compact: true })}
          {isFullscreen && (
            <button
              className="draft__fs-menu-btn"
              onClick={() => setShowFsMenu(true)}
              aria-label="Menu"
              title="Players, roster, chat & results"
            >
              <MenuIcon fontSize="small" />
              <span className="draft__btn-label">Menu</span>
            </button>
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
          {/* Desktop/fullscreen only (see &__rules-btn) — full league rules.
              Mobile reaches it via the nav drawer instead. */}
          <button
            className="draft__icon-btn draft__rules-btn"
            onClick={() => setShowRules(true)}
            aria-label="League rules"
            title="League rules"
          >
            <MenuBookOutlinedIcon fontSize="small" />
          </button>
          {/* Desktop/fullscreen only (see &__settings-btn) — personal
              draft-board + notification prefs without leaving the room.
              Mobile already reaches these via the nav drawer -> Settings. */}
          <button
            className="draft__icon-btn draft__settings-btn"
            onClick={() => setShowUserSettings(true)}
            aria-label="Your settings"
            title="Your settings"
          >
            <SettingsIcon fontSize="small" />
          </button>
          <ThemeToggle className="draft__icon-btn draft__theme-btn" />
        </div>
      </header>

      {isPaused && (
        <div className="draft__paused-banner">
          <span>
            The draft is paused
            {isCommish ? '.' : ' by the commissioner.'}
          </span>
          {lobby.paused_at && <PausedDuration since={lobby.paused_at} />}
        </div>
      )}

      {isStaging && (
        <div className="draft__staging-banner">
          <span>
            {isCommish
              ? 'The draft room is open. Players are taking their seats — hit Start when everyone’s ready.'
              : 'The draft room is open — the commissioner will start the draft shortly.'}
          </span>
          {myKeeperOptions.length > 0 && (
            <button className="draft__staging-cta" onClick={() => setShowMyKeepers(true)}>
              <LockOutlinedIcon fontSize="small" />
              {myKeepersLeft > 0
                ? `Choose your keepers (${myKeepersLeft} left)`
                : 'Your keepers'}
            </button>
          )}
          {lobby.settings.keepersEnabled && (
            <button
              className="draft__staging-cta draft__staging-cta--ghost"
              onClick={() => setShowAllKeepers(true)}
            >
              <GroupsIcon fontSize="small" />
              View all
            </button>
          )}
        </div>
      )}

      <div className="draft__body" style={{ ['--sidebar-w' as string]: `${sidebarWidth}px` }}>
        <section
          ref={boardSectionRef}
          className={`draft__board ${mobileTab === 'board' ? 'is-mobile-active' : ''}`}
        >
          {isComplete && centerView === 'rankings' ? (
            <PowerRankingsPanel
              teams={teams}
              members={members}
              picks={picks}
              playersById={playersById}
              settings={lobby.settings}
              myTeamId={myTeam?.id ?? null}
              myUserId={userId}
              crownVotes={crownVotes}
              grades={grades}
              locked={resultsLocked}
              canVote={canVote}
              canGrade={canGrade}
              onVote={castCrownVote}
              onGrade={gradeTeam}
              onPickClick={setPickModal}
            />
          ) : (
            <DraftGrid
              teams={teams}
              members={members}
              rounds={totalRounds}
              picks={picks}
              playersById={playersById}
              onClockTeamId={isComplete || isStaging ? null : onClockTeam?.id ?? null}
              myTeamId={myTeam?.id ?? null}
              currentRound={round}
              draftType={lobby.settings.draftType}
              onTeamClick={openTeamRoster}
              reactionsByPick={showCellReactions ? reactionsByPick : undefined}
              onReactPick={isMember ? reactPick : undefined}
              onPickClick={setPickModal}
              commentsByPick={showCellReactions ? commentsByPick : undefined}
              cellStyle={cellStyle}
              fill={isFullscreen}
              fillRowHeight={fsRowHeight}
              onMyClockCellClick={openPlayersPool}
              onCommishClockCellClick={isCommish ? openPlayersPool : undefined}
              onClockUrgency={onClockCellUrgency}
              onClockFlashing={onClockCellFlashing}
              onClockElapsedPct={onClockCellElapsedPct}
              skippedCells={isComplete || isStaging ? undefined : skippedCellKeys}
              onRollbackSkipped={isCommish && !rollbackLocked ? openSkipRollback : undefined}
            />
          )}
        </section>

        {!isFullscreen && (
          <>
            <div className="draft__resizer" onMouseDown={startResize} aria-hidden />

            <aside
          className={`draft__sidebar ${mobileTab !== 'board' ? 'is-mobile-active' : ''}`}
        >
          {renderSidebarPanels()}
        </aside>

        {isComplete && (
          <TeamResultsDrawer
            team={teams.find((t) => t.id === rosterTeamId)}
            members={members}
            crownVotes={crownVotes}
            grades={grades}
            view={resultsDrawerView}
            onViewChange={setResultsDrawerView}
          />
        )}
          </>
        )}
      </div>

      {/* Mobile-only: commissioner tools flush above the bottom nav. Members
          only ever had "Request pause" here, which now lives as an icon
          button in the top bar instead, so this bar is commissioner-only. */}
      {isCommish && !isComplete && (
        <div className="draft__mobile-commish">
          {CommishTools()}
        </div>
      )}

      {/* Mobile-only section tabs + nav. */}
      <nav className="draft__tabs">
        {MOBILE_TABS.filter((t) => t.key !== 'results' || isComplete)
          .filter((t) => t.key !== 'chat' || isMember || lobby.chat_public)
          .map(({ key, label, Icon }) => (
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
          slots={myOpenSlots}
        />
      )}

      {detailPlayer && (
        <PlayerDetailModal
          player={detailPlayer}
          onClose={() => setDetailPlayer(null)}
          onPick={
            canPick && !draftedIds.has(detailPlayer.id)
              ? () => {
                  setDetailPlayer(null);
                  setSelected(detailPlayer);
                  setShowFsMenu(false);
                }
              : undefined
          }
          disabled={!canPick}
          onQueue={
            draftedIds.has(detailPlayer.id) ? undefined : () => toggleQueue(detailPlayer.id)
          }
          queued={queue.includes(detailPlayer.id)}
          onFavorite={() => toggleFavorite(detailPlayer.id)}
          favorited={favoriteIds?.has(detailPlayer.id) ?? false}
          byeClashCounts={byeClashCountsForWeek(detailPlayer.bye_week, byeLookup)}
        />
      )}

      {showRules && (
        <LeagueRulesModal
          settings={lobby.settings}
          defaultName={lobby.name}
          onClose={() => setShowRules(false)}
        />
      )}

      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extraItems={[
          { to: `/lobby/${id}`, label: 'Lobby room', Icon: MeetingRoomIcon },
        ]}
        extraContent={
          <>
            <button
              type="button"
              className="navbar-drawer__link"
              onClick={() => {
                setShowRules(true);
                setDrawerOpen(false);
              }}
            >
              <MenuBookOutlinedIcon fontSize="small" />
              League rules
            </button>
            {myTeam && !myTeam.is_bot && !isComplete ? (
              <button
                type="button"
                className="navbar-drawer__link"
                onClick={() => toggleAuto(myTeam.id, !myTeam.auto_draft)}
              >
                {myTeam.auto_draft ? (
                  <SmartToyIcon fontSize="small" />
                ) : (
                  <SmartToyOutlinedIcon fontSize="small" />
                )}
                Auto-draft
                <span
                  className={`navbar-drawer__toggle-pill${myTeam.auto_draft ? ' is-on' : ''}`}
                >
                  {myTeam.auto_draft ? 'On' : 'Off'}
                </span>
              </button>
            ) : null}
          </>
        }
      />

      {showKeepers && (
        <KeeperManagerModal
          lobbyId={id}
          teams={teams}
          members={members}
          players={players}
          picks={picks}
          keeperOptions={keeperOptions}
          rounds={totalRounds}
          initialOfferTeamId={keeperEditTeamId}
          onClose={() => {
            setShowKeepers(false);
            setKeeperEditTeamId(null);
          }}
        />
      )}

      {showMyKeepers && myTeam && (
        <OwnerKeepersModal
          lobbyId={id}
          team={myTeam}
          options={myKeeperOptions}
          players={players}
          locked={lobby.keepers_locked}
          onClose={() => setShowMyKeepers(false)}
        />
      )}

      {showAllKeepers && (
        <KeeperOptionsViewModal
          teams={teams}
          members={members}
          players={players}
          keeperOptions={keeperOptions}
          rosterComposition={lobby.settings.rosterComposition}
          onOpenPlayer={setDetailPlayer}
          onEditTeam={isCommish ? openKeeperEditor : undefined}
          onClose={() => setShowAllKeepers(false)}
        />
      )}

      {showTeamKeepers && (
        <KeeperOptionsViewModal
          teams={teams}
          members={members}
          players={players}
          keeperOptions={keeperOptions}
          rosterComposition={lobby.settings.rosterComposition}
          teamId={rosterTeamId}
          onOpenPlayer={setDetailPlayer}
          onEditTeam={isCommish ? openKeeperEditor : undefined}
          onClose={() => setShowTeamKeepers(false)}
        />
      )}

      {showOutro && (
        <DraftOutroModal
          myTeam={myTeam ?? undefined}
          teams={teams}
          members={members}
          myUserId={userId}
          picks={picks}
          playersById={playersById}
          settings={lobby.settings}
          crownVotes={crownVotes}
          grades={grades}
          locked={resultsLocked}
          onVote={castCrownVote}
          onGrade={gradeTeam}
          onClose={dismissOutro}
        />
      )}

      {pickModal &&
        (() => {
          const player = playersById.get(pickModal.player_id);
          if (!player) return null;
          // This pick's own team's clashes, not the viewer's — a pick made by
          // someone else's team must reflect THEIR roster. Excludes the pick
          // itself (it's already in `picks`), so a lone player at a position/
          // bye doesn't count as clashing with themselves.
          const pickTeamByeLookup = showByeClashes
            ? byeClashLookup(
                picks.filter((p) => p.id !== pickModal.id),
                playersById,
                pickModal.team_id,
              )
            : new Map<string, number>();
          // Who reacted to this pick, grouped by emoji (for tooltips + the full-list modal).
          const reactors: Record<string, Reactor[]> = {};
          for (const r of allReactions) {
            if (r.target_type !== 'PICK' || r.target_id !== pickModal.id) continue;
            (reactors[r.emoji] ??= []).push({
              userId: r.user_id,
              username: usernameById.get(r.user_id) ?? 'Someone',
              avatar: memberAvatar(r.user_id),
            });
          }
          const comments: PickComment[] = (commentsByPick.get(pickModal.id) ?? []).map((c) => {
            const commentReactors: Record<string, Reactor[]> = {};
            for (const r of allReactions) {
              if (r.target_type !== 'MESSAGE' || r.target_id !== c.id) continue;
              (commentReactors[r.emoji] ??= []).push({
                userId: r.user_id,
                username: usernameById.get(r.user_id) ?? 'Someone',
                avatar: memberAvatar(r.user_id),
              });
            }
            return {
              id: c.id,
              userId: c.user_id,
              author: usernameById.get(c.user_id) ?? 'Player',
              avatar: memberAvatar(c.user_id),
              body: c.body,
              at: c.created_at,
              entry: reactionsByMessage.get(c.id),
              reactors: commentReactors,
            };
          });
          return (
            <PickModal
              lobbyId={id}
              pick={pickModal}
              player={player}
              team={teamsById.get(pickModal.team_id)}
              teamCount={teams.length}
              entry={reactionsByPick.get(pickModal.id)}
              reactors={reactors}
              onReact={(emoji) => reactPick(pickModal.id, emoji)}
              comments={comments}
              onReactComment={reactMessage}
              members={members}
              locked={chatLocked || !isMember}
              reactionsLocked={reactionsLocked || !isMember}
              onClose={() => setPickModal(null)}
              isCommish={isCommish}
              myUserId={userId}
              championUserIds={championUserIds}
              onRollbackTo={
                // Keepers can't be rolled back (see the server route) — there's
                // nothing to re-pick at a keeper slot, so don't offer it.
                rollbackLocked || pickModal.is_keeper
                  ? undefined
                  : () => {
                      setRollbackTarget({ kind: 'pick', pick: pickModal });
                      setPickModal(null);
                    }
              }
              byeClashCounts={byeClashCountsForWeek(player.bye_week, pickTeamByeLookup)}
              onFavorite={() => toggleFavorite(player.id)}
              favorited={favoriteIds?.has(player.id) ?? false}
            />
          );
        })()}

      {rollbackTarget &&
        (() => {
          const target = rollbackTarget;
          const isSkip = target.kind === 'skip';
          const overall = isSkip ? target.overall : target.pick.overall;
          const round = isSkip ? target.round : target.pick.round;
          const teamId = isSkip ? target.teamId : target.pick.team_id;
          const player = isSkip ? undefined : playersById.get(target.pick.player_id);
          const team = teamsById.get(teamId);
          // Real picks at/after the target that will be deleted (keepers at/after
          // survive server-side, so exclude them from the count shown). For a
          // skipped slot every counted pick sits *after* it (the slot's own
          // overall is empty); for a real pick the count includes that pick.
          const count = picks.filter((p) => p.overall >= overall && !p.is_keeper).length;
          const multi = count > 1;
          const confirmWord = 'ROLLBACK';
          const title = isSkip
            ? 'Roll back to this skipped pick?'
            : multi
              ? `Roll back ${count} picks?`
              : 'Undo this pick?';
          return (
            <ConfirmModal
              title={title}
              confirmLabel={isSkip || multi ? 'Roll back' : 'Undo pick'}
              busyLabel={isSkip || multi ? 'Rolling back…' : 'Undoing…'}
              busy={commishBusy}
              danger={multi}
              confirmDisabled={multi && rollbackConfirmText.trim().toUpperCase() !== confirmWord}
              onConfirm={() => rollbackTo(overall)}
              onClose={() => {
                setRollbackTarget(null);
                setRollbackConfirmText('');
              }}
            >
              <div className="rollback-summary">
                <span className="rollback-summary__player">
                  {isSkip ? 'Skipped pick' : (player?.name ?? 'Unknown player')}
                </span>
                <span className="rollback-summary__meta">
                  {team?.name ?? 'A team'} · Round {round} · Pick {overall} overall
                </span>
              </div>
              {multi ? (
                <>
                  <p>
                    This puts {team?.name ?? 'that team'} back on the clock at pick {overall} and
                    permanently deletes the{' '}
                    <strong>{count}</strong>{' '}
                    {isSkip ? (
                      <>pick{count === 1 ? '' : 's'} made after it</>
                    ) : (
                      <>picks from pick {overall} onward</>
                    )}
                    . This can’t be undone.
                  </p>
                  <label>
                    Type <strong>{confirmWord}</strong> to confirm
                    <input
                      className="confirm-modal__confirm-input"
                      value={rollbackConfirmText}
                      onChange={(e) => setRollbackConfirmText(e.target.value)}
                      autoFocus
                      autoComplete="off"
                    />
                  </label>
                </>
              ) : isSkip ? (
                <p>
                  This puts {team?.name ?? 'that team'} back on the clock at pick {overall}
                  {count === 1 ? ', undoing the 1 pick made after it' : ''}.
                </p>
              ) : (
                <p>This removes the pick and puts that team back on the clock.</p>
              )}
            </ConfirmModal>
          );
        })()}

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

      {isFullscreen && showFsMenu && (
        <Modal
          title={SIDEBAR_TABS.find((t) => t.key === panelTab)?.label ?? 'Menu'}
          onClose={() => setShowFsMenu(false)}
          wide
        >
          <div className="draft__fs-sidebar">{renderSidebarPanels()}</div>
        </Modal>
      )}

      {showUserSettings && (
        <DraftUserSettingsModal
          onClose={() => setShowUserSettings(false)}
          cellStyle={cellStyle}
          onCellStyleChange={updateCellStyle}
          cardStyle={cardStyle}
          onCardStyleChange={updateCardStyle}
          showCellReactions={showCellReactions}
          onShowCellReactionsChange={updateShowCellReactions}
          showByeClashes={showByeClashes}
          onShowByeClashesChange={updateShowByeClashes}
          teamColors={teamColors}
          onTeamColorsChange={updateTeamColors}
          toastPrefs={toastPrefs}
          onToastsEnabledChange={updateToastsEnabled}
          onToastCategoryChange={updateToastCategory}
        />
      )}
    </div>
  );
}
