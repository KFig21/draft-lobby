import {
  DEFAULT_SCORING_RULES,
  DRAFT_RESULTS_LOCK_MS,
  POSITIONS,
  POSITION_COLORS,
  ROLLBACK_LOCK_MS,
  defaultAvatar,
  draftablePositions,
  draftPositionForOverall,
  extractMentionedUsernames,
  hasAnyPositionLimit,
  openSlots,
  overallForDraftPosition,
  pickAllowedForLimits,
  roundsForSettings,
  secondsForRound,
  type Avatar as AvatarData,
  type DraftGrade,
  type Position,
} from '@draft-lobby/shared';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AssignmentIndOutlinedIcon from '@mui/icons-material/AssignmentIndOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import ChecklistIcon from '@mui/icons-material/Checklist';
import CloseIcon from '@mui/icons-material/Close';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
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
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import MoreTimeIcon from '@mui/icons-material/MoreTime';
import ZoomInMapIcon from '@mui/icons-material/ZoomInMap';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
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
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsIcon from '@mui/icons-material/Settings';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SportsFootballIcon from '@mui/icons-material/SportsFootball';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import type { SvgIconComponent } from '@mui/icons-material';
import type { ReactNode } from 'react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { PowerRankingsBoard } from '../../components/PowerRankings/PowerRankingsBoard';
import { PowerRankingsMobile } from '../../components/PowerRankings/PowerRankingsMobile';
import { DataExportModal } from '../../components/DataExportModal/DataExportModal';
import { EspnExportModal } from '../../components/EspnExportModal/EspnExportModal';
import { GradeExportModal } from '../../components/GradeExportModal/GradeExportModal';
import { RosterExportModal } from '../../components/RosterExportModal/RosterExportModal';
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
import { PickClock, formatDuration } from '../../components/PickClock/PickClock';
import { TopbarPickReveal } from '../../components/TopbarPickReveal/TopbarPickReveal';
import { SettingsEditorModal } from '../../components/SettingsEditorModal/SettingsEditorModal';
import { PickModal, type PickComment } from '../../components/PickModal/PickModal';
import type { Reactor } from '../../components/ReactorsModal/ReactorsModal';
import { PlayerCard } from '../../components/PlayerCard/PlayerCard';
import { PlayerDetailModal } from '../../components/PlayerDetailModal/PlayerDetailModal';
import { LeagueRulesModal } from '../../components/LeagueRulesModal/LeagueRulesModal';
import { ParticipantsModal } from '../../components/ParticipantsModal/ParticipantsModal';
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
import { BASE_SORT_KEYS, POS_STAT_COLS, fmtStat } from '../../lib/positionStats';
import { INJURY_ABBR, INJURY_SEVERITY } from '../../lib/injuryStatus';
import { HoldButton } from '../../components/HoldButton/HoldButton';
import { api } from '../../lib/api';
import { byeClashCountsForWeek, byeClashLookup } from '../../lib/byeClashes';
import {
  getDraftBoardLayout,
  getDraftCellStyle,
  getHostMode,
  getShowByeClashes,
  getShowCellReactions,
  getShowPickProjection,
  getShowPoolMarks,
  getTopbarPickReveal,
  getTvMode,
  setDraftBoardLayout,
  setDraftCellStyle,
  setHostMode,
  setShowByeClashes,
  setShowCellReactions,
  setShowPickProjection,
  setShowPoolMarks,
  setTopbarPickReveal,
  setTvMode,
  type DraftBoardLayout,
  type DraftCellStyle,
} from '../../lib/draftCellStyle';
import { renderBoardCanvas } from '../../lib/boardCanvas';
import { computePowerRankings } from '../../lib/powerRankings';
import { downloadBoardScreenshot, type ExportFormat } from '../../lib/exportDraft';
import { avatarForTeam } from '../../lib/teamAvatar';
import { useClickOutside } from '../../lib/useClickOutside';
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
  DraftGradeReactionRow,
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

// How long the top-bar pick reveal holds before the readout unfreezes (must
// match the 5s animation timeline in TopbarPickReveal.scss).
const TOPBAR_REVEAL_MS = 5000;
// How long the revealed pick slides out the bottom for at the end (must match
// draft-center-exit in DraftBoardPage.scss).
const TOPBAR_REVEAL_EXIT_MS = 340;
// How long the next team + clock slide in for once a reveal ends / on a plain
// pick flip (must match the draft-center-enter animation in DraftBoardPage.scss).
const TOPBAR_NEXT_ENTER_MS = 1020;

// Board screenshot: breathing room (px, pre-scale) around the captured table
// — html2canvas otherwise crops exactly to the table's own box, edge to edge.
const BOARD_SCREENSHOT_PADDING = 16;

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
  const { lobby, teams, members, picks, keeperOptions, loading, refetch } = useLobby(id);
  const { players: rawPlayers, loading: playersLoading } = usePlayers(lobby?.season);
  // Recomputed from each player's raw stat line under this lobby's own
  // scoring rules — so bot picks, lineup order, and every player card here
  // agree with each other and with the lobby's actual scoring format,
  // instead of everyone independently trusting Sleeper's flat PPR total.
  const players = useMemo(
    () =>
      scorePlayers(
        rawPlayers,
        lobby?.settings.scoring ?? DEFAULT_SCORING_RULES,
        lobby
          ? {
              rosterComposition: lobby.settings.rosterComposition,
              teamCount: lobby.settings.teamCount,
            }
          : undefined,
      ),
    [rawPlayers, lobby?.settings.scoring, lobby?.settings.rosterComposition, lobby?.settings.teamCount],
  );

  // Personal preferences (also editable from Settings directly) — read once
  // on mount, then kept live so the gear-icon settings modal below (see
  // showUserSettings) can update them without a page refresh.
  const [cellStyle, setCellStyleState] = useState(() => getDraftCellStyle());
  const [showCellReactions, setShowCellReactionsState] = useState(() => getShowCellReactions());
  const [showByeClashes, setShowByeClashesState] = useState(() => getShowByeClashes());
  const [showPickProjection, setShowPickProjectionState] = useState(() => getShowPickProjection());
  const [showPoolMarks, setShowPoolMarksState] = useState(() => getShowPoolMarks());
  const [boardLayout, setBoardLayoutState] = useState<DraftBoardLayout>(() => getDraftBoardLayout());
  const [cardStyle, setCardStyleState] = useState<PlayerCardStyle>(() => getPlayerCardStyle());
  const [teamColors, setTeamColorsState] = useState(() => getTeamColorsEnabled());
  const [tvMode, setTvModeState] = useState(() => getTvMode());
  const [hostMode, setHostModeState] = useState(() => getHostMode());
  const [topbarPickReveal, setTopbarPickRevealState] = useState(() => getTopbarPickReveal());
  const [toastPrefs, setToastPrefsState] = useState(() => getToastPrefs());
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);

  // Top-bar pick reveal (opt-in, see topbarPickReveal): the pick currently being
  // announced in the top bar, held for the animation's length so the readout
  // stays frozen on it instead of jumping to the next team. `committedRevealPickIds`
  // seeds the picks already on the board (so toggling on mid-draft never replays
  // the backlog); `prevClockLabelRef` snapshots the clock a render behind so the
  // reveal opens on the picking team's last clock value, not the next team's
  // fresh one; `lastRevealAtRef` debounces bursts (fast-forward / simulate).
  const [pickReveal, setPickReveal] = useState<{
    /** null → a skip announcement ("SKIPPED") rather than a made pick. */
    player: PlayerRow | null;
    skipped: boolean;
    /** true → no announcement at all: just freeze the outgoing team and slide it
     * out (the reveal-off flip, so the previous team doesn't vanish abruptly). */
    plain: boolean;
    team: TeamRow | null;
    round: number;
    overall: number;
    clockLabel: string;
  } | null>(null);
  const committedRevealPickIds = useRef<Set<string> | null>(null);
  const committedRevealSkipKeys = useRef<Set<string> | null>(null);
  const revealTimer = useRef<number | null>(null);
  const prevClockLabelRef = useRef('');
  const lastRevealAtRef = useRef(0);
  // Hand-off out of a reveal: first the just-revealed pick slides out the bottom
  // (`revealExiting`), then the next team + clock slide in from the top
  // (`nextEntering`) — a continuous downward motion.
  const [revealExiting, setRevealExiting] = useState(false);
  const [nextEntering, setNextEntering] = useState(false);
  const revealExitTimer = useRef<number | null>(null);
  const nextEnterTimer = useRef<number | null>(null);
  // Reveal-off plain flip: track the on-clock team (with its round/pick) so a
  // change (advance) can slide the OUTGOING team out and the next in, with its
  // own debounce (separate from the reveal's).
  const committedOnClockRef = useRef<
    { id: string; team: TeamRow; round: number; overall: number } | null | undefined
  >(undefined);
  const lastFlipAtRef = useRef(0);

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
  function updateShowPickProjection(show: boolean) {
    setShowPickProjection(show);
    setShowPickProjectionState(show);
  }
  function updateShowPoolMarks(show: boolean) {
    setShowPoolMarks(show);
    setShowPoolMarksState(show);
  }
  function updateBoardLayout(layout: DraftBoardLayout) {
    setDraftBoardLayout(layout);
    setBoardLayoutState(layout);
  }
  function updateTeamColors(enabled: boolean) {
    setTeamColorsEnabled(enabled);
    setTeamColorsState(enabled);
  }
  function updateTvMode(on: boolean) {
    setTvMode(on);
    setTvModeState(on);
  }
  function updateHostMode(on: boolean) {
    setHostMode(on);
    setHostModeState(on);
  }
  function updateTopbarPickReveal(on: boolean) {
    setTopbarPickReveal(on);
    setTopbarPickRevealState(on);
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
  // Pool stat lens: 'proj' shows this season's projections (points + position
  // rank), 'prev' shows last season's actuals. Sort key: 'points' sorts by the
  // currently-shown stat's points, 'value' by league-aware value rank.
  const [statMode, setStatMode] = useState<'proj' | 'prev'>('proj');
  // Pool sort: one of the fixed columns ('points' | 'name' | 'value') or a raw
  // stat key (when the dashboard table is filtered to a position), plus a
  // direction. 'value' asc (best value first) is the default ranking — the
  // league-aware order that replaces generic ADP.
  const [sortMode, setSortMode] = useState<'points' | 'name' | 'value' | (string & {})>('value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // Natural (first-click) direction: A→Z for name, best-value-first for value,
  // high-to-low for points and every stat column.
  const poolNaturalDir = (key: string): 'asc' | 'desc' =>
    key === 'name' || key === 'value' ? 'asc' : 'desc';
  // The Pts/Value quick buttons just set a column in its natural direction.
  function setPoolSort(key: 'points' | 'value') {
    setSortMode(key);
    setSortDir(poolNaturalDir(key));
  }
  // Sortable table headers: natural → reversed → reset (points, high-to-low).
  function togglePoolSort(key: string) {
    const natural = poolNaturalDir(key);
    if (sortMode !== key) {
      setSortMode(key);
      setSortDir(natural);
    } else if (sortDir === natural) {
      setSortDir(natural === 'asc' ? 'desc' : 'asc');
    } else {
      setSortMode('value');
      setSortDir('asc');
    }
  }
  // A stat-column sort only makes sense while that position's columns are shown;
  // if the filter changes away, fall back to the default points ranking.
  useEffect(() => {
    const cols = POS_STAT_COLS[filter as Position];
    if (!BASE_SORT_KEYS.has(sortMode) && !cols?.some((c) => c.key === sortMode)) {
      setSortMode('points');
      setSortDir('desc');
    }
  }, [filter, sortMode]);
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
  // Desktop = the two-pane tier ($bp-lg / 1100, mirrors LobbyRoom + variables).
  // Below it the layout is the mobile single-panel/tab UI; the fullscreen
  // Power Rankings board + sidebar-hiding only apply on desktop.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1100px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1100px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
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
  // Guards Start when reserved seats are still unclaimed (they'll become bots).
  const [confirmStart, setConfirmStart] = useState(false);
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
  const [showGradeExport, setShowGradeExport] = useState(false);
  const [showRosterExport, setShowRosterExport] = useState(false);
  const [showEspnExport, setShowEspnExport] = useState(false);
  // CSV/Excel/JSON open a preview modal (copy / download / back) rather than
  // downloading straight away; null when closed.
  const [dataExport, setDataExport] = useState<ExportFormat | null>(null);
  // Commissioner mid-draft settings editor (clocks + skips at this phase).
  const [showLobbySettings, setShowLobbySettings] = useState(false);
  // Board screenshot (see captureBoardScreenshot): 'menu' shows the CSV/Excel/
  // screenshot choices, 'screenshot' shows the export options + download.
  const [exportStep, setExportStep] = useState<'menu' | 'screenshot'>('menu');
  const [screenshotAnonymize, setScreenshotAnonymize] = useState(false);
  // Off by default — an export is often shared outside the league, and
  // "which one's mine" is exactly the kind of thing you may not want to hand
  // a stranger, especially alongside anonymized names.
  const [screenshotHighlightMine, setScreenshotHighlightMine] = useState(false);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  // Rendered board PNG shown as a preview in the export modal — as a data-URL
  // <img> so it can be long-pressed → "Save to Photos" on mobile. The canvas is
  // kept alongside for the explicit Download action.
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const screenshotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Overflow "Tools" popover in the top bar (Export / Auto-draft / Draft
  // settings / League rules / Your settings) — keeps the toolbar uncluttered
  // so the fullscreen-critical Menu button isn't crowded.
  const [showTools, setShowTools] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  useClickOutside(toolsRef, () => setShowTools(false), showTools);
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

  // "Simulate to end" runs on the server as one long-lived request (it loops
  // every remaining pick). Track it so the board can show a "simulating…" banner
  // and let the commissioner cancel — aborting the request closes the connection,
  // which the server watches (req.on('close')) to stop the loop mid-run.
  const [simulating, setSimulating] = useState(false);
  const simulateAbortRef = useRef<AbortController | null>(null);

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

  // "TV mode" only takes visual effect in full screen (the point is reading a
  // TV from across the room). When active, flag the fullscreened element so the
  // pop-up scaling styles (:root.is-tv …) apply — modals portal to <body>, a
  // descendant of documentElement, so the class reaches them too.
  const tvActive = tvMode && isFullscreen;
  useEffect(() => {
    document.documentElement.classList.toggle('is-tv', tvActive);
    return () => {
      document.documentElement.classList.remove('is-tv');
    };
  }, [tvActive]);

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

  // ── Desktop dashboard: resizable center split (board over players) + a
  // resizable queue pane. The vertical split is a percent so it keeps its
  // proportion as the window resizes; the queue is a fixed px width. Both
  // persist across sessions, same as the sidebar width above.
  const dashCenterRef = useRef<HTMLDivElement>(null);
  const dashBottomRef = useRef<HTMLDivElement>(null);
  const dashDragRef = useRef<null | 'h' | 'v'>(null);

  // Detailed-board zoom: a fit-all ↔ 100% toggle plus trackpad pinch. Uses the
  // CSS `zoom` property (not `transform`) on the grid's own scroll container so
  // the sticky team-header row / round column and horizontal scroll keep working
  // while the board is scaled. The wheel listener is attached natively
  // (non-passive) via a callback ref because React's onWheel is passive and
  // can't preventDefault the browser's own ctrl+wheel page zoom.
  const MIN_BOARD_ZOOM = 0.35;
  const [boardZoom, setBoardZoom] = useState(1);
  const boardPaneEl = useRef<HTMLDivElement | null>(null);
  const boardWheelCleanup = useRef<(() => void) | null>(null);
  const clampZoom = (z: number) => Math.min(1, Math.max(MIN_BOARD_ZOOM, Math.round(z * 1000) / 1000));
  const setBoardPaneRef = useCallback((el: HTMLDivElement | null) => {
    boardWheelCleanup.current?.();
    boardWheelCleanup.current = null;
    boardPaneEl.current = el;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // trackpad pinch arrives as ctrl+wheel
      e.preventDefault();
      setBoardZoom((z) => clampZoom(z - e.deltaY * 0.01));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    boardWheelCleanup.current = () => el.removeEventListener('wheel', onWheel);
  }, []);
  function toggleBoardZoom() {
    setBoardZoom((z) => {
      if (z < 0.999) return 1; // already zoomed out → back to 100%
      // The grid owns its own scroll (.grid-scroll); at zoom 1 its scrollWidth is
      // the board's natural width, so this scales just enough to fit every team.
      const gs = boardPaneEl.current?.querySelector<HTMLElement>('.grid-scroll');
      if (!gs || gs.scrollWidth === 0) return 1;
      return clampZoom(gs.clientWidth / gs.scrollWidth);
    });
  }
  // Mobile board pinch-to-zoom. Two-finger pinch scales the grid via the CSS
  // `zoom` property on its scroll container (a CSS variable set on the board
  // section) — same reasoning as the desktop zoom above: `zoom` (not transform)
  // keeps the sticky header/round column and scrolling intact. Single-finger
  // panning still scrolls; only a two-finger gesture zooms. Listeners are
  // attached natively (touchmove non-passive) because React's onTouchMove is
  // passive and can't preventDefault the browser's own page pinch. A floating
  // "Reset zoom" button (rendered on the board) returns to 1×.
  const MIN_MOBILE_ZOOM = 0.4;
  const MAX_MOBILE_ZOOM = 2.5;
  const [mobileZoom, setMobileZoom] = useState(1);
  const mobileZoomRef = useRef(1);
  mobileZoomRef.current = mobileZoom;
  const clampMobileZoom = (z: number) =>
    Math.min(MAX_MOBILE_ZOOM, Math.max(MIN_MOBILE_ZOOM, Math.round(z * 1000) / 1000));
  useEffect(() => {
    // Touch affordance only — never on desktop (where the dashboard has its own
    // pinch/fit control). Depends on `lobby` so it re-runs once the board
    // section actually mounts (past the loading guard), same as the fullscreen
    // row-height effect above that reads this ref.
    if (isDesktop) return;
    const el = boardSectionRef.current;
    if (!el) return;
    let startZoom = 1;

    // Safari (incl. iOS) drives pinch through non-standard gesture events and
    // won't reliably let a touchmove cancel its own page zoom — prefer those
    // there; every other browser gets the standard two-finger touch math.
    if ('ongesturestart' in window) {
      const onGStart = (e: Event) => {
        e.preventDefault();
        startZoom = mobileZoomRef.current;
      };
      const onGChange = (e: Event) => {
        e.preventDefault();
        setMobileZoom(clampMobileZoom(startZoom * (e as Event & { scale: number }).scale));
      };
      const onGEnd = (e: Event) => e.preventDefault();
      el.addEventListener('gesturestart', onGStart);
      el.addEventListener('gesturechange', onGChange);
      el.addEventListener('gestureend', onGEnd);
      return () => {
        el.removeEventListener('gesturestart', onGStart);
        el.removeEventListener('gesturechange', onGChange);
        el.removeEventListener('gestureend', onGEnd);
      };
    }

    let startDist = 0;
    const pinchDist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      startDist = pinchDist(e.touches);
      startZoom = mobileZoomRef.current;
    };
    const onMove = (e: TouchEvent) => {
      if (startDist === 0 || e.touches.length !== 2) return;
      e.preventDefault(); // block the browser's own page pinch while zooming the board
      setMobileZoom(clampMobileZoom(startZoom * (pinchDist(e.touches) / startDist)));
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
    };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [isDesktop, lobby]);

  const [dashBoardPct, setDashBoardPct] = useState(() => {
    const v = Number(localStorage.getItem('draftDashBoardPct'));
    return v >= 25 && v <= 80 ? v : 56;
  });
  const [dashQueueW, setDashQueueW] = useState(() => {
    const v = Number(localStorage.getItem('draftDashQueueW'));
    return v >= 180 && v <= 460 ? v : 264;
  });
  useEffect(() => {
    localStorage.setItem('draftDashBoardPct', String(Math.round(dashBoardPct)));
  }, [dashBoardPct]);
  useEffect(() => {
    localStorage.setItem('draftDashQueueW', String(Math.round(dashQueueW)));
  }, [dashQueueW]);
  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (dashDragRef.current === 'h') {
        const el = dashCenterRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setDashBoardPct(Math.min(80, Math.max(25, ((e.clientY - r.top) / r.height) * 100)));
      } else if (dashDragRef.current === 'v') {
        const el = dashBottomRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        // Queue sits on the right, so its width grows as the divider is dragged
        // leftward — measure from the right edge. Keep the list ≥ ~320px.
        setDashQueueW(Math.min(r.width - 320, Math.max(180, r.right - e.clientX)));
      }
    }
    function onUp() {
      if (!dashDragRef.current) return;
      dashDragRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);
  function startDashDrag(dir: 'h' | 'v') {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      dashDragRef.current = dir;
      document.body.style.userSelect = 'none';
      document.body.style.cursor = dir === 'h' ? 'row-resize' : 'col-resize';
    };
  }

  const userId = session?.user.id;

  const playersById = useMemo(() => {
    const m = new Map<string, PlayerRow>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  // Players just hold-to-drafted, marked drafted locally so the pool reacts the
  // instant a hold completes instead of waiting ~1s for the server round-trip +
  // realtime echo (that gap read as "did my pick even go through?"). Reconciled
  // away once the real pick lands, and rolled back if the pick fails.
  const [optimisticDrafted, setOptimisticDrafted] = useState<Set<string>>(() => new Set());
  const draftedIds = useMemo(() => {
    const s = new Set(picks.map((p) => p.player_id));
    for (const pid of optimisticDrafted) s.add(pid);
    return s;
  }, [picks, optimisticDrafted]);

  // Drop optimistic marks once the real pick for that player has arrived (keeps
  // the set from growing stale). Returns the same ref when nothing changed so
  // this never loops.
  useEffect(() => {
    setOptimisticDrafted((prev) => {
      if (prev.size === 0) return prev;
      const real = new Set(picks.map((p) => p.player_id));
      let changed = false;
      const next = new Set<string>();
      for (const pid of prev) {
        if (real.has(pid)) changed = true;
        else next.add(pid);
      }
      return changed ? next : prev;
    });
  }, [picks]);

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
  const [gradeReactions, setGradeReactions] = useState<DraftGradeReactionRow[]>([]);
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
    const loadReactions = () =>
      supabase
        .from('draft_grade_reactions')
        .select('*')
        .eq('lobby_id', id)
        .then(({ data }) => setGradeReactions((data ?? []) as DraftGradeReactionRow[]));
    void loadVotes();
    void loadGrades();
    void loadReactions();
    const ch = supabase
      .channel(`draft-results:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'draft_crown_votes', filter: `lobby_id=eq.${id}` },
        () => void loadVotes(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'draft_grade_reactions', filter: `lobby_id=eq.${id}` },
        () => void loadReactions(),
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

  // App (power-ranking) grade per team — used by the mobile roster-tab report
  // card. Empty until the draft is complete.
  const powerRankGradeByTeam = useMemo(() => {
    const m = new Map<string, DraftGrade>();
    if (!lobby || lobby.status !== 'COMPLETE') return m;
    for (const r of computePowerRankings(teams, picks, playersById, lobby.settings)) {
      m.set(r.team.id, r.grade);
    }
    return m;
  }, [lobby, teams, picks, playersById]);

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

  /** Like (+1) / dislike (-1) a peer's grade on a roster, or clear it (0). */
  async function reactGrade(teamId: string, raterId: string, value: 1 | -1 | 0) {
    if (resultsLocked) return;
    try {
      await api(`/lobbies/${id}/grade-reaction`, {
        method: 'POST',
        body: { teamId, raterId, value },
      });
    } catch (err) {
      showToast({
        title: 'Reaction failed',
        titleIcon: <ErrorOutlineIcon fontSize="inherit" />,
        body: err instanceof Error ? err.message : undefined,
        tone: 'warning',
      });
    }
  }

  /**
   * Capture the draft board as a PNG by drawing it straight onto a <canvas>
   * from the pick data (see lib/boardCanvas) — no html2canvas, no DOM clone,
   * no iframe. That makes the export byte-for-byte deterministic across every
   * machine/OS/browser, instead of depending on html2canvas re-painting the
   * live DOM (which work/enterprise machines' security agents were mangling).
   * Because it renders from data, it needs neither the board scrolled into
   * view nor a live table ref.
   */
  // Reset the export modal back to a clean menu (clears any stale preview).
  function resetExport() {
    setExportStep('menu');
    setScreenshotError(null);
    setScreenshotUrl(null);
    screenshotCanvasRef.current = null;
  }

  // Download the already-rendered board PNG (the one shown in the preview).
  function downloadBoardImage() {
    const canvas = screenshotCanvasRef.current;
    if (canvas && lobby) downloadBoardScreenshot(canvas, lobby.name, screenshotAnonymize);
  }

  // Render the board to a canvas and show it as a preview; the user then saves
  // it (Download button, or long-press → Save to Photos on the preview image).
  async function captureBoardScreenshot(anonymize: boolean, highlightMine: boolean) {
    if (!lobby) return;
    setScreenshotError(null);
    setScreenshotBusy(true);
    try {
      const themeAttr = document.documentElement.getAttribute('data-theme');
      const theme = themeAttr === 'light' ? 'light' : 'dark';
      const teamCount = lobby.settings.teamCount;
      const overall = lobby.current_overall;
      const currentRound = Math.floor((overall - 1) / teamCount) + 1;
      const ownTeamId = teams.find((t) => t.owner_id === userId)?.id ?? null;
      // Corner flags mirror the live board — only when the viewer has cell
      // reactions/comments turned on (same gate DraftGrid uses).
      const reactionPickIds = new Set<string>();
      const commentPickIds = new Set<string>();
      if (showCellReactions) {
        for (const [pid, entry] of reactionsByPick)
          if (Object.keys(entry.counts).length) reactionPickIds.add(pid);
        for (const [pid, list] of commentsByPick) if (list.length) commentPickIds.add(pid);
      }
      const canvas = renderBoardCanvas({
        teams,
        members,
        picks,
        playersById,
        rounds: roundsForSettings(lobby.settings),
        teamCount,
        draftType: lobby.settings.draftType,
        currentRound,
        myTeamId: ownTeamId,
        cellStyle,
        reactionPickIds,
        commentPickIds,
        theme,
        anonymize,
        highlightMine,
        padding: BOARD_SCREENSHOT_PADDING,
      });
      screenshotCanvasRef.current = canvas;
      setScreenshotUrl(canvas.toDataURL('image/png'));
    } catch (err) {
      setScreenshotError(err instanceof Error ? err.message : 'Could not capture the board');
    } finally {
      setScreenshotBusy(false);
    }
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
    // Projection for each of my upcoming picks across the WHOLE board — not just
    // the frontier that `open` covers, so the lines show even when I'm nowhere
    // near the clock. For each of my still-unfilled slots, `before` is how many
    // players are expected to be drafted first (= all earlier unfilled slots),
    // which is where the player pool draws its "your pick lands here" line. A
    // board-order best-available heuristic, like ESPN's.
    const untakenOveralls: number[] = [];
    const myFutureOpen: number[] = [];
    for (let o = 1; o <= totalPicks; o++) {
      if (taken.has(o)) continue;
      untakenOveralls.push(o);
      if (teamByPos.get(draftPositionForOverall(o, s.teamCount, s.draftType))?.owner_id === userId)
        myFutureOpen.push(o);
    }
    const myPickProjections = myFutureOpen.map((o) => ({
      overall: o,
      round: Math.floor((o - 1) / s.teamCount) + 1,
      before: untakenOveralls.indexOf(o),
    }));
    return { s, overall, round, onClockTeam, totalPicks, skipped, myOpen, myPickProjections };
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

  // The pick clock's current readout, formatted like PickClock. Kept a render
  // behind in prevClockLabelRef (updated below, after the reveal-detection effect
  // runs) so a reveal can open on the picking team's last value rather than the
  // next team's fresh clock that lands on the same tick as the pick.
  const clockLabelNow = (() => {
    if (!lobby) return '';
    if (lobby.pick_deadline) {
      const rem = Math.max(0, Math.floor((new Date(lobby.pick_deadline).getTime() - clockNow) / 1000));
      return formatDuration(rem);
    }
    if (lobby.status === 'PAUSED' && lobby.pick_deadline_remaining_ms != null) {
      return formatDuration(Math.max(0, Math.floor(lobby.pick_deadline_remaining_ms / 1000)));
    }
    return '∞';
  })();

  // Shared hand-off after a top-bar reveal (pick or skip): hold, then slide the
  // announcement out the bottom and the next team + clock in from the top.
  function scheduleRevealHandoff() {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => {
      setRevealExiting(true);
      if (revealExitTimer.current) clearTimeout(revealExitTimer.current);
      revealExitTimer.current = window.setTimeout(() => {
        setPickReveal(null);
        setRevealExiting(false);
        setNextEntering(true);
        if (nextEnterTimer.current) clearTimeout(nextEnterTimer.current);
        nextEnterTimer.current = window.setTimeout(() => setNextEntering(false), TOPBAR_NEXT_ENTER_MS);
      }, TOPBAR_REVEAL_EXIT_MS);
    }, TOPBAR_REVEAL_MS);
  }

  // Top-bar pick reveal: when a single new draft pick lands during live drafting,
  // freeze the top-bar readout on it and play the reveal (see TopbarPickReveal).
  // Seeds the current picks on first run so an already-populated board / a
  // mid-draft toggle-on never replays; a 1.2s debounce keeps fast-forward and
  // simulate bursts from flickering through it. (When the reveal is OFF, the
  // plain flip is handled by the on-clock-change effect below instead.)
  useEffect(() => {
    const liveIds = new Set(picks.filter((p) => !p.is_keeper).map((p) => p.id));
    const seeded = committedRevealPickIds.current !== null;
    const fresh = seeded
      ? [...liveIds].filter((pid) => !committedRevealPickIds.current!.has(pid))
      : [];
    committedRevealPickIds.current = liveIds;
    // Skip-bots mode auto-picks a bot roughly every second — far faster than the
    // reveal can play — so suppress the top-bar animation while it's on.
    if (!seeded || !topbarPickReveal || autoSkipBots || lobby?.status !== 'DRAFTING') return;
    if (fresh.length !== 1) return; // one clean pick at a time (skip bulk arrivals)
    const now = Date.now();
    if (now - lastRevealAtRef.current < 1200) return; // burst — don't flicker
    const p = picks.find((pp) => pp.id === fresh[0]);
    const player = p ? playersById.get(p.player_id) : undefined;
    if (!p || !player) return;
    lastRevealAtRef.current = now;
    setPickReveal({
      player,
      skipped: false,
      plain: false,
      team: teamsById.get(p.team_id) ?? null,
      round: Math.floor((p.overall - 1) / lobby.settings.teamCount) + 1,
      overall: p.overall,
      clockLabel: prevClockLabelRef.current,
    });
    scheduleRevealHandoff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, topbarPickReveal, autoSkipBots, lobby?.status]);

  // Reveal OFF: still animate the top bar flipping to the next team — keyed on
  // the on-clock team actually changing (a pick/skip advances the frontier), so
  // it uses the NEW team, not the old one a beat early. Freezes the OUTGOING
  // team and slides it out the bottom, then the next drops in from the top — so
  // the previous team doesn't just vanish.
  useEffect(() => {
    // Read round/overall off `derived` directly (not the destructured `round`/
    // `frontierOverall`, which are declared after an early return below — using
    // them here would be a temporal-dead-zone crash on the early-return render).
    const cur = derived?.onClockTeam
      ? {
          id: derived.onClockTeam.id,
          team: derived.onClockTeam,
          round: derived.round,
          overall: derived.overall,
        }
      : null;
    const prev = committedOnClockRef.current;
    committedOnClockRef.current = cur;
    if (prev === undefined) return; // seed
    if (topbarPickReveal || autoSkipBots || lobby?.status !== 'DRAFTING') return;
    if (!cur || !prev || cur.id === prev.id) return;
    const now = Date.now();
    if (now - lastFlipAtRef.current < 1200) return;
    lastFlipAtRef.current = now;
    // Freeze on the team that just left the clock and slide it out the bottom…
    setPickReveal({
      player: null,
      skipped: false,
      plain: true,
      team: prev.team,
      round: prev.round,
      overall: prev.overall,
      clockLabel: prevClockLabelRef.current,
    });
    setRevealExiting(true);
    if (revealExitTimer.current) clearTimeout(revealExitTimer.current);
    revealExitTimer.current = window.setTimeout(() => {
      // …then the next team + clock drop in from the top.
      setPickReveal(null);
      setRevealExiting(false);
      setNextEntering(true);
      if (nextEnterTimer.current) clearTimeout(nextEnterTimer.current);
      nextEnterTimer.current = window.setTimeout(() => setNextEntering(false), TOPBAR_NEXT_ENTER_MS);
    }, TOPBAR_REVEAL_EXIT_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived?.onClockTeam?.id, topbarPickReveal, autoSkipBots, lobby?.status]);

  // Top-bar skip reveal: same treatment when a team is skipped (its clock runs
  // out and no pick is made) — the clock slides down to "SKIPPED", which holds
  // then hands off to the next team. Keyed by the newly-appeared skipped slot.
  useEffect(() => {
    const live = derived?.skipped ?? [];
    const liveKeys = new Set(live.map((sl) => `${sl.round}:${sl.team.id}`));
    const seeded = committedRevealSkipKeys.current !== null;
    const fresh = seeded
      ? [...liveKeys].filter((k) => !committedRevealSkipKeys.current!.has(k))
      : [];
    committedRevealSkipKeys.current = liveKeys;
    if (!seeded || !topbarPickReveal || autoSkipBots || lobby?.status !== 'DRAFTING') return;
    if (fresh.length !== 1) return;
    const now = Date.now();
    if (now - lastRevealAtRef.current < 1200) return;
    const sl = live.find((s) => `${s.round}:${s.team.id}` === fresh[0]);
    if (!sl) return;
    lastRevealAtRef.current = now;
    setPickReveal({
      player: null,
      skipped: true,
      plain: false,
      team: sl.team,
      round: sl.round,
      overall: sl.overall,
      clockLabel: prevClockLabelRef.current,
    });
    scheduleRevealHandoff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived?.skipped, topbarPickReveal, autoSkipBots, lobby?.status]);

  // Snapshot the clock a render behind for the reveal above (must run after it).
  useEffect(() => {
    prevClockLabelRef.current = clockLabelNow;
  });

  useEffect(() => () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    if (revealExitTimer.current) clearTimeout(revealExitTimer.current);
    if (nextEnterTimer.current) clearTimeout(nextEnterTimer.current);
  }, []);

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
    const rows = players.filter((p) => {
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
    // Sort by the active column/direction. Missing values always sink to the
    // bottom regardless of direction (comparator computed ascending, then
    // flipped for descending).
    const pointsOf = (p: PlayerRow) => (statMode === 'prev' ? p.prev_points : p.proj_points);
    const statsOf = (p: PlayerRow) => (statMode === 'prev' ? p.prev_stats : p.proj_stats) ?? {};
    function compareAsc(a: PlayerRow, b: PlayerRow): number {
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'value') {
        // Ascending = best value first (rank 1). Unranked always sinks.
        const ar = a.value_rank ?? Infinity;
        const br = b.value_rank ?? Infinity;
        return ar - br;
      }
      if (sortMode === 'points') return (pointsOf(a) ?? -Infinity) - (pointsOf(b) ?? -Infinity);
      return (statsOf(a)[sortMode] ?? -Infinity) - (statsOf(b)[sortMode] ?? -Infinity);
    }
    rows.sort((a, b) => (sortDir === 'asc' ? compareAsc(a, b) : compareAsc(b, a)));
    return rows;
  }, [
    players,
    draftedIds,
    filter,
    search,
    queue,
    favoriteIds,
    excludedByeWeeks,
    showDrafted,
    statMode,
    sortMode,
    sortDir,
  ]);

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

  // Commissioner "add time" — a token bucket, not a hard lockout: a burst of up
  // to ADD_TIME_MAX quick clicks goes straight through, then it refills one
  // token every ADD_TIME_REFILL_MS so time can still be topped up steadily
  // without letting the clock be inflated without limit. The bucket lives in a
  // ref (mutated only on click) and is read against clockNow (which ticks every
  // second) so the button re-enables on its own as tokens refill.
  // NOTE: these hooks must stay above the loading/`!lobby` guards below — hooks
  // can't run conditionally.
  const ADD_TIME_MAX = 10;
  const ADD_TIME_REFILL_MS = 4000;
  const addBucketRef = useRef({ tokens: ADD_TIME_MAX, at: Date.now() });
  const [addTick, setAddTick] = useState(0);
  const [addTimeMenuOpen, setAddTimeMenuOpen] = useState(false);
  const addTokens = Math.min(
    ADD_TIME_MAX,
    addBucketRef.current.tokens +
      Math.floor((clockNow - addBucketRef.current.at) / ADD_TIME_REFILL_MS),
  );
  void addTick; // re-derive after a consume/refund, not just on the clock tick
  async function addTime(seconds: number) {
    const b = addBucketRef.current;
    const refill = Math.floor((Date.now() - b.at) / ADD_TIME_REFILL_MS);
    if (refill > 0) {
      b.tokens = Math.min(ADD_TIME_MAX, b.tokens + refill);
      b.at += refill * ADD_TIME_REFILL_MS;
    }
    if (b.tokens < 1) return; // out of tokens (the button is disabled anyway)
    b.tokens -= 1;
    setAddTick((n) => n + 1);
    setCommishError(null);
    try {
      await api(`/lobbies/${id}/add-time`, { method: 'POST', body: { seconds } });
    } catch (err) {
      // Refund on failure so a network blip doesn't cost a click.
      b.tokens = Math.min(ADD_TIME_MAX, b.tokens + 1);
      setAddTick((n) => n + 1);
      setCommishError(err instanceof Error ? err.message : 'Could not add time');
    }
  }
  // Close the add-time preset menu on any outside click. Keyed on the shared
  // `.draft__addtime` class so it works for whichever CommishTools instance is
  // visible (the top bar's or the mobile bar's) without a per-instance ref.
  useEffect(() => {
    if (!addTimeMenuOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Element) || !t.closest('.draft__addtime')) setAddTimeMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [addTimeMenuOpen]);

  if (loading || playersLoading)
    return (
      <div className="loading">
        <Loader label="Loading draft…" />
      </div>
    );
  if (!lobby) return <ErrorScreen title="Draft not found" />;
  if (lobby.status === 'SETUP' || lobby.status === 'SCHEDULED')
    return <Navigate to={`/lobby/${id}`} replace />;

  const {
    round,
    overall: frontierOverall,
    totalPicks,
    onClockTeam,
    skipped,
    myOpen,
    myPickProjections,
  } = derived!;
  const totalRounds = roundsForSettings(lobby.settings);
  const isComplete = lobby.status === 'COMPLETE';
  // The 3-column Power Rankings board replaces the grid on desktop/fullscreen; it
  // manages its own panel padding, so the board section drops its padding for it.
  const showPowerRankings = isComplete && centerView === 'rankings' && (isDesktop || isFullscreen);
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
  // I can pick if I own ANY open slot (on the clock OR skipped), or I'm a commish.
  const iOwnAnOpenSlot = !isStaging && myOpen.length > 0;
  // While paused only the commissioner may pick (to fill the current pick or a
  // skipped slot by hand); everyone else is frozen out until it resumes.
  const canPick =
    !isStaging &&
    !isComplete &&
    (iOwnAnOpenSlot || isCommish) &&
    (!isPaused || isCommish);
  // Hold-to-draft (press-and-hold to pick instantly, no confirm modal) is
  // deliberately limited to picking your OWN open slot — never a commissioner
  // drafting on behalf of the team on the clock, where an accidental long-press
  // could make an unintended pick for someone else. A commissioner covering
  // another team still gets the tap → lock-in modal (with its per-team/round
  // target chooser); only the instant hold is withheld. A skipped picker still
  // owns an open slot, so they keep hold-to-draft; and when they owe more than
  // one slot (skipped, then up again on the snake turn) a bare pick fills their
  // EARLIEST open slot server-side — i.e. the earliest skipped pick.
  const canHoldDraft = canPick && iOwnAnOpenSlot;
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
  // Commissioner pick targets — every open slot that currently owes a pick: each
  // skipped slot (one per round, so a team skipped several times can be filled in
  // a chosen round) plus the team on the clock. Surfaced in the LockInModal so
  // the commish chooses which team/round a hand-made pick is for once teams have
  // been skipped; empty for non-commish and when nobody's been skipped. Skipped
  // slots (behind the frontier) sort first by overall, the on-clock pick last.
  const commishTargets: {
    key: string;
    teamId: string;
    teamName: string;
    avatar: ReactNode;
    overall: number;
    round: number;
    onClock: boolean;
  }[] = [];
  if (isCommish && skipped.length > 0) {
    for (const sl of skipped) {
      commishTargets.push({
        key: `${sl.overall}`,
        teamId: sl.team.id,
        teamName: sl.team.name,
        avatar: <Avatar avatar={avatarForTeam(sl.team, members)} size={20} />,
        overall: sl.overall,
        round: sl.round,
        onClock: false,
      });
    }
    if (onClockTeam && frontierOverall <= totalPicks) {
      commishTargets.push({
        key: `${frontierOverall}`,
        teamId: onClockTeam.id,
        teamName: onClockTeam.name,
        avatar: <Avatar avatar={avatarForTeam(onClockTeam, members)} size={20} />,
        overall: frontierOverall,
        round,
        onClock: true,
      });
    }
    commishTargets.sort((a, b) => a.overall - b.overall);
  }
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
  const canGrade = isMember || lobby.spectate_grade;
  // Spectators (non-members) can react + comment when the commissioner allows it.
  const canReact = isMember || lobby.spectate_react;
  const rosterTeamId = rosterTeamSel ?? myTeamId ?? teams[0]?.id ?? '';

  // How many players the current user has drafted at each position (for filter badges).
  const myPosCounts: Partial<Record<Position, number>> = {};
  for (const p of picks) {
    if (p.team_id !== myTeamId) continue;
    const pos = playersById.get(p.player_id)?.position as Position | undefined;
    if (pos) myPosCounts[pos] = (myPosCounts[pos] ?? 0) + 1;
  }

  // Per-position roster limits: mirror the server rule client-side so blocked
  // Draft buttons grey out with a reason instead of failing on tap. The pick
  // lands on the team that owns the slot — my own team, or (commish covering the
  // clock) the on-clock team. Only computed when the league sets any limit.
  const positionLimits = lobby.settings.positionLimits;
  const limitsEnabled = hasAnyPositionLimit(positionLimits);
  const limitTeamId = iOwnAnOpenSlot ? myTeamId : onClockTeam?.id ?? myTeamId;
  const limitHave: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  let limitTeamPicks = 0;
  if (limitsEnabled && limitTeamId) {
    for (const p of picks) {
      if (p.team_id !== limitTeamId) continue;
      limitTeamPicks += 1;
      const pos = playersById.get(p.player_id)?.position as Position | undefined;
      if (pos) limitHave[pos] += 1;
    }
  }
  const limitRemainingSpots = roundsForSettings(lobby.settings) - limitTeamPicks;
  function limitBlock(player: PlayerRow): string | undefined {
    if (!limitsEnabled || !limitTeamId) return undefined;
    const verdict = pickAllowedForLimits(
      positionLimits,
      limitHave,
      limitRemainingSpots,
      player.position as Position,
    );
    if (verdict.ok) return undefined;
    const pos = player.position === 'DEF' ? 'D/ST' : player.position;
    return verdict.reason === 'max'
      ? `Roster limit reached for ${pos}`
      : 'Save your last spots for your position minimums';
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
  async function confirmPick(overall?: number, onBehalfOfTeamId?: string) {
    if (!selected) return;
    setPickError(null);
    setPickBusy(true);
    try {
      await api(`/lobbies/${id}/pick`, {
        method: 'POST',
        body: {
          playerId: selected.id,
          ...(overall != null ? { overall } : {}),
          ...(onBehalfOfTeamId ? { onBehalfOfTeamId } : {}),
        },
      });
      setSelected(null);
      setShowFsMenu(false); // pick made — close the fullscreen Menu too (no-op if closed)
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Pick failed');
    } finally {
      setPickBusy(false);
    }
  }

  /**
   * Hold-to-draft: draft `p` immediately, bypassing the lock-in modal (fills the
   * picker's earliest open slot server-side). Since a completed hold can land
   * just after the clock times out — the user kept holding through their skip —
   * this fills their now-skipped-but-open slot; the server accepts behind-the-
   * frontier picks. No modal here, so surface any failure as a toast.
   */
  async function holdDraft(p: PlayerRow) {
    // Optimistic + instant: mark drafted locally and close the fullscreen menu
    // right away so a completed hold feels immediate, instead of the board and
    // menu only reacting a beat later when the server response/echo arrives.
    setOptimisticDrafted((s) => new Set(s).add(p.id));
    setSelected(null);
    setShowFsMenu(false);
    try {
      await api(`/lobbies/${id}/pick`, { method: 'POST', body: { playerId: p.id } });
    } catch (err) {
      // Roll the optimistic mark back so the player returns to the pool.
      setOptimisticDrafted((s) => {
        const n = new Set(s);
        n.delete(p.id);
        return n;
      });
      showToast({
        title: 'Pick failed',
        titleIcon: <ErrorOutlineIcon fontSize="inherit" />,
        body: err instanceof Error ? err.message : undefined,
        tone: 'warning',
      });
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
  // Reserved seats whose user never joined — they'll fall back to bots on start.
  const unclaimedReserved = teams.filter((t) => t.reserved_for_user_id && !t.owner_id).length;

  async function doStart() {
    setCommishError(null);
    setCommishBusy(true);
    try {
      await api(`/lobbies/${id}/start`, { method: 'POST' });
      setConfirmStart(false);
    } catch (err) {
      setCommishError(err instanceof Error ? err.message : 'Failed to start the draft');
    } finally {
      setCommishBusy(false);
    }
  }
  // Heads-up first if reserved seats are still unclaimed; otherwise start now.
  function startDraft() {
    if (unclaimedReserved > 0) setConfirmStart(true);
    else void doStart();
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

  // Kick off a full simulation: close the settings editor so the commissioner
  // watches picks land on the board, then hold the request open (picks + the
  // "draft complete" all arrive via realtime). Cancelling aborts it — the picks
  // made so far stay, and the draft is left where it stopped.
  async function startSimulate() {
    setShowLobbySettings(false);
    setCommishError(null);
    setSimulating(true);
    const controller = new AbortController();
    simulateAbortRef.current = controller;
    try {
      await api(`/lobbies/${id}/simulate`, { method: 'POST', signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setCommishError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setSimulating(false);
      simulateAbortRef.current = null;
    }
  }

  async function cancelSimulate() {
    // Pausing is the reliable stop: the server simulate loop breaks the instant
    // the draft leaves DRAFTING (it polls status each iteration), and a paused
    // draft also halts the background bot auto-draft. The request abort is
    // best-effort — a proxy can swallow the connection close — so we don't lean
    // on it. `resetClock` freezes a fresh full clock (the sim left the deadline
    // in an arbitrary spot), so the team on the clock gets its whole turn on
    // resume. The draft is left paused; the commissioner can resume or roll back.
    simulateAbortRef.current?.abort();
    setPauseBusy(true);
    try {
      await api(`/lobbies/${id}/pause`, { method: 'POST', body: { resetClock: true } });
    } catch (err) {
      setCommishError(err instanceof Error ? err.message : 'Could not pause the draft');
    } finally {
      setPauseBusy(false);
    }
  }

  // The top bar keeps its "your pick" colour + warning/danger even while paused,
  // using the frozen remaining time (pick_deadline goes null server-side when
  // paused, so fall back to pick_deadline_remaining_ms — same as the on-clock
  // cell below). The pulse still stops while paused (a frozen clock shouldn't
  // throb), but the colour holds where it was instead of resetting to neutral.
  const myTurnHighlight = isMyTurn && !isComplete;
  const myTurnRemainingMs = !myTurnHighlight
    ? null
    : isPaused
      ? lobby.pick_deadline_remaining_ms
      : lobby.pick_deadline
        ? new Date(lobby.pick_deadline).getTime() - clockNow
        : null;
  const myTurnSecondsLeft =
    myTurnRemainingMs != null ? Math.max(0, Math.floor(myTurnRemainingMs / 1000)) : null;
  const myTurnUrgency =
    myTurnSecondsLeft == null
      ? null
      : myTurnSecondsLeft <= 10
        ? 'danger'
        : myTurnSecondsLeft <= 25
          ? 'warning'
          : null;
  const myTurnFlashing = !isPaused && myTurnSecondsLeft != null && myTurnSecondsLeft <= 5;

  // There's a pick clock the commissioner can extend: a live deadline while
  // drafting, or a frozen remaining while paused (an unlimited round has neither).
  const hasExtendableClock =
    !isComplete &&
    !isStaging &&
    (lobby.pick_deadline != null || (isPaused && lobby.pick_deadline_remaining_ms != null));

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

  // Hosting mode ("Your settings" → Hosting, desktop-only): colour the whole top
  // bar with whoever's on-the-clock pick timer — green highlight, amber/red
  // urgency, last-5s flash — so a screen shared with a room shows the countdown
  // to everyone, not just the person picking. Off, the bar reacts only to your
  // own turn as before. (The countdown fill already shows for all viewers.)
  const hostBarColors = hostMode && !isComplete && !isStaging && !!onClockTeam;
  const topbarHighlight = hostBarColors || myTurnHighlight;
  const topbarUrgency = hostBarColors ? onClockCellUrgency : myTurnUrgency;
  const topbarFlashing = hostBarColors ? onClockCellFlashing : myTurnFlashing;

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
              <span className="draft__btn-label">Edit Keepers</span>
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
              if (v) {
                // Abort the open request AND tell the server to stop — the abort
                // alone can be swallowed by a proxy, leaving the loop skipping.
                fastForwardAbortRef.current?.abort();
                void api(`/lobbies/${id}/fast-forward/cancel`, { method: 'POST' }).catch(() => {});
              }
              return !v;
            })
          }
          title="Automatically skip bot picks as they come on the clock"
        >
          <FastForwardIcon fontSize="small" />
          <span className="draft__btn-label">Skip bots{autoSkipBots ? ' · On' : ''}</span>
        </button>
        {hasExtendableClock && (
          <div className="draft__addtime">
            <button
              className="draft__tool-btn draft__addtime-main"
              onClick={() => addTime(5)}
              disabled={addTokens < 1}
              title={addTokens < 1 ? 'Add time is recharging…' : 'Add 5 seconds to the pick clock'}
            >
              <MoreTimeIcon fontSize="small" />
              <span className="draft__btn-label">+5s</span>
            </button>
            <button
              className="draft__tool-btn draft__addtime-caret"
              onClick={() => setAddTimeMenuOpen((o) => !o)}
              aria-label="More time options"
              aria-expanded={addTimeMenuOpen}
            >
              <ArrowDropDownIcon fontSize="small" />
            </button>
            {addTimeMenuOpen && (
              <div className="draft__addtime-menu" role="menu">
                {[15, 30, 60].map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="menuitem"
                    className="draft__addtime-item"
                    onClick={() => {
                      addTime(s);
                      setAddTimeMenuOpen(false);
                    }}
                    disabled={addTokens < 1}
                  >
                    +{s < 60 ? `${s}s` : `${Math.floor(s / 60)}:00`}
                  </button>
                ))}
              </div>
            )}
          </div>
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
  function renderPlayersPool(opts: { hideQueue?: boolean; table?: boolean } = {}) {
    if (!lobby) return null; // already guaranteed by the guard above — narrows for TS
    // Opens the pick-confirm dialog. The fullscreen Menu modal (if open) stays
    // open behind it — LockInModal now stacks above it (see its z-index) — so
    // cancelling drops the user right back on the Players tab. confirmPick
    // closes the menu once a pick actually goes through.
    function pick(p: PlayerRow) {
      setSelected(p);
    }

    // "Your pick lands here" projection lines — a 1px rule in the pool marking
    // where each of my upcoming picks lands: simply `before` players down the
    // shown list (if I'm 2 picks away, the line sits under the first 2 rows),
    // whatever the list is currently filtered/sorted to. Keyed by the shown-list
    // index the line sits *before*.
    type ProjLine = { round: number; isNext: boolean };
    const displayed = available.slice(0, 200);
    const projectionByIndex = new Map<number, ProjLine>();
    const showProjection =
      showPickProjection && !search.trim() && !showDrafted && !isStaging && !isComplete;
    if (showProjection) {
      myPickProjections.forEach((proj, i) => {
        if (proj.before <= displayed.length && !projectionByIndex.has(proj.before)) {
          projectionByIndex.set(proj.before, { round: proj.round, isNext: i === 0 });
        }
      });
    }
    const renderProjectionLine = (line: ProjLine) => (
      <div
        className={`pool__proj${line.isNext ? ' pool__proj--next' : ''}`}
        aria-hidden
      >
        <span className="pool__proj-label">
          {line.isNext ? 'Your pick' : `Round ${line.round}`}
        </span>
      </div>
    );

    // ── Table mode (dashboard) helpers ──
    // Position stat columns when filtered to a single position; else a generic
    // stat line. colCount spans [marks] + player + stats + pts + rank + actions
    // — the marks column drops out when the pool-marks setting is off.
    const statCols = POS_STAT_COLS[filter as Position];
    const colCount = (showPoolMarks ? 5 : 4) + (statCols ? statCols.length : 1);
    const sortTh = (label: string, key: string, cls?: string) => (
      <th
        className={`pool-table__th${sortMode === key ? ' is-active' : ''}${cls ? ` ${cls}` : ''}`}
        onClick={() => togglePoolSort(key)}
        aria-sort={sortMode === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      >
        {label}
        {sortMode === key && <span className="pool-table__arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
      </th>
    );
    const projRow = (line: ProjLine) => (
      <tr className={`pool-table__proj${line.isNext ? ' is-next' : ''}`} aria-hidden>
        <td colSpan={colCount}>
          <span className="pool-table__proj-label">
            {line.isNext ? 'Your pick' : `Round ${line.round}`}
          </span>
        </td>
      </tr>
    );

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
    // Hidden for now (felt like clutter) — flip SHOW_BYE_FILTER to re-enable;
    // all the wiring below stays intact so it's a one-line switch.
    const SHOW_BYE_FILTER = false;
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
        {!opts.hideQueue && queuedPlayers.length > 0 && (
          <div className="pool__queue">
            <div className="pool__queue-head">Queue ({queuedPlayers.length})</div>
            {queuedPlayers.map((p) => (
              <PoolCard
                key={p.id}
                player={p}
                statMode={statMode}
                posRank={statMode === 'prev' ? p.prev_rank : p.proj_rank}
                queued
                onQueue={() => toggleQueue(p.id)}
                onFavorite={canFavorite ? () => toggleFavorite(p.id) : undefined}
                favorited={favoriteIds?.has(p.id) ?? false}
                onPick={canPick ? () => pick(p) : undefined}
                onHoldPick={canHoldDraft ? () => holdDraft(p) : undefined}
                disabled={!canPick}
                blockedReason={limitBlock(p)}
                onOpenDetail={() => setDetailPlayer(p)}
                byeClashCount={
                  p.bye_week != null ? byeLookup.get(`${p.position}:${p.bye_week}`) : undefined
                }
              />
            ))}
          </div>
        )}
        <div className={`pool__filters${opts.table ? ' pool__filters--condensed' : ''}`}>
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
          </div>
          <div className="pool__searchrow">
            <div className="pool__search-wrap">
              <input
                className="pool__search"
                type="search"
                // TV mode zooms the pool up, overflowing the longer label — keep
                // it to "Search" there so it doesn't clip to "Search play".
                placeholder={tvActive ? 'Search' : 'Search players…'}
                aria-label="Search players"
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
            <div className="pool__toggles">
              <div className="pool__seg" role="group" aria-label="Stat view">
                <button
                  type="button"
                  className={`pool__seg-btn ${statMode === 'proj' ? 'is-active' : ''}`}
                  onClick={() => setStatMode('proj')}
                >
                  Proj
                </button>
                <button
                  type="button"
                  className={`pool__seg-btn ${statMode === 'prev' ? 'is-active' : ''}`}
                  onClick={() => setStatMode('prev')}
                >
                  Last yr
                </button>
              </div>
              <div className="pool__seg" role="group" aria-label="Sort by">
                <button
                  type="button"
                  className={`pool__seg-btn ${sortMode === 'points' ? 'is-active' : ''}`}
                  onClick={() => setPoolSort('points')}
                  title="Sort by points"
                >
                  Pts
                </button>
                <button
                  type="button"
                  className={`pool__seg-btn ${sortMode === 'value' ? 'is-active' : ''}`}
                  onClick={() => setPoolSort('value')}
                  title="Sort by league rank (draft order by value over positional replacement)"
                >
                  Rank
                </button>
              </div>
              {SHOW_BYE_FILTER && byeFilter}
              <label className="pool__showdrafted" title="Include already-drafted players">
                <input
                  type="checkbox"
                  checked={showDrafted}
                  onChange={(e) => setShowDrafted(e.target.checked)}
                />
                Show drafted
              </label>
            </div>
          </div>
        </div>
        {opts.table ? (
          <div className="pool-table-wrap">
            <table className="pool-table">
              <thead>
                <tr>
                  {showPoolMarks && (
                    <th className="pool-table__marks" aria-label="Favorite & queue" />
                  )}
                  {sortTh('Rank', 'value', 'pool-table__adp')}
                  {sortTh('Player', 'name', 'pool-table__player')}
                  {statCols ? (
                    statCols.map((c) => sortTh(c.label, c.key, 'pool-table__stat'))
                  ) : (
                    <th className="pool-table__statline">Stats</th>
                  )}
                  {sortTh('Pts', 'points', 'pool-table__pts')}
                  <th className="pool-table__act" aria-label="Draft" />
                </tr>
              </thead>
              <tbody>
                {displayed.map((p, i) => {
                  const isDrafted = draftedIds.has(p.id);
                  const line = projectionByIndex.get(i);
                  const posRank = statMode === 'prev' ? p.prev_rank : p.proj_rank;
                  const points = statMode === 'prev' ? p.prev_points : p.proj_points;
                  const stats = (statMode === 'prev' ? p.prev_stats : p.proj_stats) ?? {};
                  const statLine = statMode === 'prev' ? p.prev_stat_line : p.proj_stat_line;
                  const injury = INJURY_ABBR[p.injury_status];
                  const clash =
                    p.bye_week != null ? byeLookup.get(`${p.position}:${p.bye_week}`) : undefined;
                  const isFav = favoriteIds?.has(p.id) ?? false;
                  const isQueued = queue.includes(p.id);
                  const row = (
                    <tr
                      className={`pool-table__row${isDrafted ? ' is-drafted' : ''}`}
                      onClick={() => {
                        const pk = isDrafted ? pickByPlayerId.get(p.id) : undefined;
                        if (pk) setPickModal(pk);
                        else setDetailPlayer(p);
                      }}
                    >
                      {showPoolMarks && (
                        <td className="pool-table__marks">
                          {canFavorite && (
                            <button
                              type="button"
                              className={`pool-table__fav${isFav ? ' is-on' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(p.id);
                              }}
                              aria-label={isFav ? 'Remove favorite' : 'Add favorite'}
                            >
                              {isFav ? (
                                <StarIcon fontSize="inherit" />
                              ) : (
                                <StarBorderIcon fontSize="inherit" />
                              )}
                            </button>
                          )}
                          {!isDrafted && (
                            <button
                              type="button"
                              className={`pool-table__q${isQueued ? ' is-on' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleQueue(p.id);
                              }}
                              aria-label={isQueued ? 'Remove from queue' : 'Add to queue'}
                              title={isQueued ? 'Remove from queue' : 'Add to queue'}
                            >
                              {isQueued ? (
                                <BookmarkIcon fontSize="inherit" />
                              ) : (
                                <BookmarkBorderIcon fontSize="inherit" />
                              )}
                            </button>
                          )}
                        </td>
                      )}
                      <td
                        className={`pool-table__adp${p.value_rank == null ? ' is-dash' : ''}`}
                        title={p.value != null ? `${p.value > 0 ? '+' : ''}${p.value.toFixed(1)} pts over replacement` : undefined}
                      >
                        {p.value_rank != null ? Math.round(p.value_rank) : '—'}
                      </td>
                      <td className="pool-table__player">
                        <div className="pool-table__player-inner">
                        <span
                          className="pool-table__pos"
                          style={{ background: POSITION_COLORS[p.position as Position] }}
                        >
                          {p.position}
                          {posRank != null && (
                            <>
                              <span className="pool-table__pos-dot" />
                              {posRank}
                            </>
                          )}
                        </span>
                        <span className="pool-table__nameblock">
                          <span className="pool-table__name">
                            {p.name}
                            {injury && (
                              <span
                                className={`injury-badge injury-badge--${
                                  INJURY_SEVERITY[p.injury_status] ?? 'danger'
                                }`}
                                title={p.injury_status}
                              >
                                {injury}
                              </span>
                            )}
                          </span>
                          <span className="pool-table__team">
                            {p.nfl_team}
                            {p.bye_week != null && (
                              <span
                                className={
                                  clash
                                    ? clash >= 2
                                      ? 'pool-table__bye--danger'
                                      : 'pool-table__bye--warn'
                                    : undefined
                                }
                              >
                                {' '}
                                · Bye {p.bye_week}
                              </span>
                            )}
                          </span>
                        </span>
                        {isDrafted && (
                          <span className="pool-table__drafted">
                            {pickLabelByPlayerId.get(p.id) ?? 'Drafted'}
                          </span>
                        )}
                        </div>
                      </td>
                      {statCols ? (
                        statCols.map((c) => {
                          const s = fmtStat(stats[c.key]);
                          return (
                            <td
                              key={c.key}
                              className={`pool-table__stat${s === '—' ? ' is-dash' : ''}`}
                            >
                              {s}
                            </td>
                          );
                        })
                      ) : (
                        <td className="pool-table__statline muted">{statLine ?? '—'}</td>
                      )}
                      <td className={`pool-table__pts${points == null ? ' is-dash' : ''}`}>
                        {points != null ? points.toFixed(1) : '—'}
                      </td>
                      <td className="pool-table__act">
                        {!isDrafted && canPick && (
                          <HoldButton
                            className="button button--primary pool-table__draft"
                            onTap={() => pick(p)}
                            // Hold only drafts instantly for your own slot;
                            // otherwise fall back to the confirm modal (see
                            // canHoldDraft).
                            onHold={canHoldDraft ? () => holdDraft(p) : () => pick(p)}
                            disabled={!!limitBlock(p)}
                            title={limitBlock(p) ?? 'Hold to draft instantly · tap to confirm'}
                            ariaLabel={`Draft ${p.name}`}
                          >
                            Draft
                          </HoldButton>
                        )}
                      </td>
                    </tr>
                  );
                  return line ? (
                    <Fragment key={p.id}>
                      {projRow(line)}
                      {row}
                    </Fragment>
                  ) : (
                    <Fragment key={p.id}>{row}</Fragment>
                  );
                })}
                {(() => {
                  const tail = projectionByIndex.get(displayed.length);
                  return tail ? projRow(tail) : null;
                })()}
                {available.length === 0 && (
                  <tr>
                    <td className="pool-table__empty muted" colSpan={colCount}>
                      No players match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="pool__list">
            {displayed.map((p, i) => {
              const isDrafted = draftedIds.has(p.id);
              const line = projectionByIndex.get(i);
              const card = (
                <PoolCard
                  player={p}
                  statMode={statMode}
                  posRank={statMode === 'prev' ? p.prev_rank : p.proj_rank}
                  drafted={isDrafted}
                  draftedLabel={isDrafted ? pickLabelByPlayerId.get(p.id) : undefined}
                  onPick={!isDrafted && canPick ? () => pick(p) : undefined}
                  onHoldPick={!isDrafted && canHoldDraft ? () => holdDraft(p) : undefined}
                  disabled={!canPick}
                  blockedReason={isDrafted ? undefined : limitBlock(p)}
                  onQueue={!showPoolMarks || isDrafted ? undefined : () => toggleQueue(p.id)}
                  queued={queue.includes(p.id)}
                  onFavorite={showPoolMarks && canFavorite ? () => toggleFavorite(p.id) : undefined}
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
              return line ? (
                <Fragment key={p.id}>
                  {renderProjectionLine(line)}
                  {card}
                </Fragment>
              ) : (
                <Fragment key={p.id}>{card}</Fragment>
              );
            })}
            {/* A pick projected to land past the last shown player draws its line
                at the very end of the list. */}
            {(() => {
              const tail = projectionByIndex.get(displayed.length);
              return tail ? renderProjectionLine(tail) : null;
            })()}
            {available.length === 0 && <p className="muted pool__empty">No players match.</p>}
          </div>
        )}
      </>
    );
  }

  // Shared between the actual sidebar (hidden in full screen) and the
  // fullscreen "Menu" modal — same tab bar, same four panels. All of
  // .draft__sidebar-tabs/.draft__panel-body/etc. are styled as standalone
  // BEM-ish classes (not scoped to .draft__sidebar specifically), so this
  // markup renders identically wherever it's dropped in.
  // ── Panel bodies, shared by the tabbed sidebar and the desktop dashboard ──
  function renderRosterPanel() {
    if (!lobby) return null;
    return (
      <div className="draft__roster">
        <TeamLineup
          teams={teams}
          selectedTeamId={rosterTeamId}
          onSelectTeam={setRosterTeamSel}
          picks={picks}
          playersById={playersById}
          settings={lobby.settings}
          onPickClick={setPickModal}
          belowSelect={
            isComplete && !isDesktop
              ? (() => {
                  const voteCount = crownVotes.filter((v) => v.team_id === rosterTeamId).length;
                  const teamGrades = grades.filter((g) => g.team_id === rosterTeamId);
                  const appGrade = powerRankGradeByTeam.get(rosterTeamId) ?? null;
                  return (
                    <>
                      <span className="lineup-view__label">Report Card</span>
                      <button
                        type="button"
                        className="draft__results-summary"
                        onClick={() => {
                          if (isFullscreen) {
                            setCenterView('rankings');
                            setShowFsMenu(false);
                          } else setResultsDrawerView((v) => (v === 'closed' ? 'open' : 'closed'));
                        }}
                      >
                        <GradeBadge grade={appGrade} size={44} />
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
    );
  }

  function renderChatPanel() {
    if (!lobby) return null;
    return (
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
        viewOnly={!canReact}
      />
    );
  }

  // Queued players as their own scrollable pane — the dashboard's bottom-left
  // split (mirrors the pool's inline queue, which is hidden in dashboard mode).
  function renderQueuePane() {
    return (
      <div className="draft-dash__queue">
        <div className="draft-dash__pane-head">
          Queue <span className="draft-dash__count">{queuedPlayers.length}</span>
          {queuedPlayers.length > 0 && (
            <button
              type="button"
              className="draft-dash__queue-clear"
              onClick={() => setQueue([])}
              title="Clear the entire queue"
            >
              Clear
            </button>
          )}
        </div>
        <div className="draft-dash__queue-list">
          {queuedPlayers.map((p) => {
            const posRank = statMode === 'prev' ? p.prev_rank : p.proj_rank;
            const points = statMode === 'prev' ? p.prev_points : p.proj_points;
            return (
              <div className="draft-dash__qrow" key={p.id}>
                <span
                  className="draft-dash__qrow-pos"
                  style={{ background: POSITION_COLORS[p.position as Position] }}
                >
                  {p.position}
                  {posRank != null && <span className="draft-dash__qrow-rank">{posRank}</span>}
                </span>
                <button
                  type="button"
                  className="draft-dash__qrow-main"
                  onClick={() => setDetailPlayer(p)}
                >
                  <span className="draft-dash__qrow-name">{p.name}</span>
                  <span className="draft-dash__qrow-sub">
                    {p.nfl_team}
                    {p.bye_week != null && ` · Bye ${p.bye_week}`}
                    {points != null && ` · ${points.toFixed(1)}`}
                  </span>
                </button>
                {canPick && (
                  <HoldButton
                    className="button button--primary draft-dash__qrow-draft"
                    onTap={() => setSelected(p)}
                    // Hold only drafts instantly for your own slot; otherwise
                    // fall back to the confirm modal (see canHoldDraft).
                    onHold={canHoldDraft ? () => holdDraft(p) : () => setSelected(p)}
                    disabled={!!limitBlock(p)}
                    title={limitBlock(p) ?? 'Hold to draft instantly · tap to confirm'}
                    ariaLabel={`Draft ${p.name}`}
                  >
                    Draft
                  </HoldButton>
                )}
                <button
                  type="button"
                  className="draft-dash__qrow-remove"
                  onClick={() => toggleQueue(p.id)}
                  aria-label={`Remove ${p.name} from queue`}
                  title="Remove from queue"
                >
                  <CloseIcon fontSize="inherit" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Desktop 3-lane dashboard: roster | (board over players) | chat, with a
  // draggable split between board & players and — when players are queued — a
  // draggable queue pane beside the list.
  function renderDashboard() {
    const showQueueSplit = queuedPlayers.length > 0;
    return (
      <div className="draft-dash">
        <aside className="draft-dash__lane">
          <div className="draft-dash__pane draft-dash__roster">{renderRosterPanel()}</div>
        </aside>

        <div
          className="draft-dash__center"
          ref={dashCenterRef}
          style={{ ['--board-pct' as string]: `${dashBoardPct}%` }}
        >
          <div
            className="draft-dash__pane draft-dash__board"
            ref={setBoardPaneRef}
            style={{ ['--board-zoom' as string]: boardZoom }}
          >
            <button
              type="button"
              className="draft-dash__zoom-btn"
              onClick={toggleBoardZoom}
              title={
                boardZoom < 0.999
                  ? 'Zoom back in (100%)'
                  : 'Zoom out to see every team · pinch to zoom'
              }
              aria-label={boardZoom < 0.999 ? 'Zoom board back in' : 'Zoom board out to see all teams'}
            >
              {boardZoom < 0.999 ? (
                <ZoomInMapIcon fontSize="small" />
              ) : (
                <ZoomOutMapIcon fontSize="small" />
              )}
            </button>
            <div className="draft-dash__board-scroll">{renderDraftGrid()}</div>
          </div>
          <div
            className="draft-dash__hdiv"
            onPointerDown={startDashDrag('h')}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize board and players"
          >
            <span className="draft-dash__grip" />
          </div>
          <div
            className={`draft-dash__pane draft-dash__bottom${showQueueSplit ? ' is-split' : ''}`}
            ref={dashBottomRef}
            style={{ ['--queue-w' as string]: `${dashQueueW}px` }}
          >
            <div className="draft-dash__players">
              {renderPlayersPool({ hideQueue: true, table: true })}
            </div>
            {showQueueSplit && (
              <>
                <div
                  className="draft-dash__vdiv"
                  onPointerDown={startDashDrag('v')}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize queue and players"
                >
                  <span className="draft-dash__grip draft-dash__grip--v" />
                </div>
                {renderQueuePane()}
              </>
            )}
          </div>
        </div>

        <aside className="draft-dash__lane">
          <div className="draft-dash__pane draft-dash__chat">{renderChatPanel()}</div>
        </aside>
      </div>
    );
  }

  function renderDraftGrid() {
    if (!lobby) return null;
    return (
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
        onReactPick={canReact ? reactPick : undefined}
        onPickClick={setPickModal}
        commentsByPick={showCellReactions ? commentsByPick : undefined}
        cellStyle={cellStyle}
        tvMode={tvActive}
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
    );
  }

  function renderSidebarPanels() {
    if (!lobby) return null; // already guaranteed by the guard above — narrows for TS
    return (
      <>
        <div className="draft__sidebar-tabs">
          {SIDEBAR_TABS.filter((t) => t.key !== 'results' || isComplete)
            .filter((t) => t.key !== 'chat' || isMember || lobby.chat_public || lobby.spectate_public)
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
          {/* In fullscreen, a Detailed-layout user gets the dense sortable
              table (stats + per-position columns) here too — matching their
              draft-board pool. This panel only renders fullscreen (the menu
              modal), on the simple sidebar, or on mobile; the table is gated to
              the fullscreen+detailed case so the other two keep the card list. */}
          {renderPlayersPool(
            isFullscreen && boardLayout === 'detailed' ? { table: true } : {},
          )}
        </div>

        {/* Roster */}
        <div
          className={`draft__panel-body ${panelTab === 'roster' ? 'is-desktop-active' : ''} ${
            mobileTab === 'roster' ? 'is-mobile-active' : ''
          }`}
        >
          {renderRosterPanel()}
        </div>

        {/* Chat */}
        <div
          className={`draft__panel-body ${panelTab === 'chat' ? 'is-desktop-active' : ''} ${
            mobileTab === 'chat' ? 'is-mobile-active' : ''
          }`}
        >
          {renderChatPanel()}
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
            <PowerRankingsMobile
              lobbyName={lobby.name}
              season={lobby.season}
              teams={teams}
              members={members}
              picks={picks}
              playersById={playersById}
              settings={lobby.settings}
              myTeamId={myTeam?.id ?? null}
              myUserId={userId}
              crownVotes={crownVotes}
              grades={grades}
              gradeReactions={gradeReactions}
              locked={resultsLocked}
              canVote={canVote}
              canGrade={canGrade}
              onVote={castCrownVote}
              onGrade={gradeTeam}
              onReact={reactGrade}
              onPickClick={setPickModal}
            />
          </div>
        )}
      </>
    );
  }

  // The 3-lane desktop dashboard replaces the board + tabbed-sidebar layout for
  // the windowed board view (>=1100px). Fullscreen, mobile, and the desktop
  // Power Rankings view all keep the original layout below.
  const useDashboard =
    isDesktop && !isFullscreen && centerView === 'board' && boardLayout === 'detailed';

  return (
    <div className="draft">
      <header
        ref={topbarRef}
        className={`draft__topbar${isFullscreen ? ' draft__topbar--fill' : ''}${
          topbarCompact ? ' draft__topbar--compact' : ''
        }${topbarHighlight ? ' draft__topbar--myturn' : ''}${
          topbarUrgency ? ` draft__topbar--${topbarUrgency}` : ''
        }${topbarFlashing ? ' draft__topbar--flash' : ''}${
          pickReveal || revealExiting || nextEntering ? ' draft__topbar--reveal-clip' : ''
        }`}
      >
        {onClockCellElapsedPct != null && (
          <span
            className={`draft__topbar-fill${fillResetting ? ' draft__topbar-fill--reset' : ''}`}
            style={{ width: `${onClockCellElapsedPct * 100}%` }}
            aria-hidden
          />
        )}
        <div className="draft__left">
          {/* Brand logo, top-left — links home. Desktop/fullscreen only (mobile
              reaches home via its own nav). Home + Room live in the Tools (☰)
              drawer. */}
          <Link to="/home" className="draft__brand" title="Draft Lobby — home" aria-label="Home">
            <SportsFootballIcon fontSize="small" />
          </Link>
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
        <div
          className={`draft__center${
            !isComplete && !isStaging ? ' draft__center--split' : ''
          }${pickReveal && revealExiting ? ' draft__center--reveal-exit' : ''}${
            nextEntering && !pickReveal && !isComplete && !isStaging
              ? ' draft__center--entering'
              : ''
          }`}
        >
          {pickReveal && !isComplete && !isStaging ? (
            // Reveal in progress: keep the readout frozen on the pick being
            // announced (its team + round/pick), and run the reveal where the
            // clock normally sits — so the bar never jumps to the next team.
            <>
              <div className="draft__status">
                <span className="draft__onclock-team">
                  {pickReveal.team && (
                    <span className="draft__onclock-avatar">
                      <Avatar
                        avatar={avatarForTeam(pickReveal.team, members)}
                        size={isFullscreen ? 30 : 20}
                      />
                    </span>
                  )}
                  {pickReveal.team?.name ?? 'On the clock'}
                </span>
                <span className="muted">
                  Round {pickReveal.round} · Pick {pickReveal.overall}
                </span>
              </div>
              {pickReveal.plain ? (
                // Reveal-off flip: no announcement, just the outgoing team's
                // frozen clock riding out the bottom with its status.
                <div className="draft__clock-wrap">
                  <span className="clock">{pickReveal.clockLabel}</span>
                </div>
              ) : (
                <div className="draft__clock-wrap draft__clock-wrap--reveal">
                  {/* Hidden live clock reserves the normal footprint so the top
                      bar layout doesn't shift while the reveal overlays it. */}
                  <PickClock
                    deadline={lobby.pick_deadline}
                    frozenMs={lobby.pick_deadline_remaining_ms}
                    unlimited={clockUnlimited}
                  />
                  <TopbarPickReveal
                    clockLabel={pickReveal.clockLabel}
                    skipped={pickReveal.skipped}
                    player={pickReveal.player}
                  />
                </div>
              )}
            </>
          ) : (
            <>
          <div className="draft__status">
            {isComplete ? (
              <strong className="draft__complete">
                <EmojiEventsIcon className="draft__complete-trophy" fontSize="small" /> Draft complete
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
                    {/* No "Your pick" badge — the bar turning green already
                        signals it's your turn. */}
                    {isPaused && (
                      <span className="draft__paused-pill" title="Paused" aria-label="Paused">
                        <PauseIcon fontSize="inherit" />
                      </span>
                    )}
                  </button>
                ) : (
                  <span className="draft__onclock-team">
                    {skipped.length > 0 ? 'Waiting on skipped picks' : 'Waiting…'}
                    {isPaused && (
                      <span className="draft__paused-pill" title="Paused" aria-label="Paused">
                        <PauseIcon fontSize="inherit" />
                      </span>
                    )}
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
            <div className="draft__clock-wrap">
              <PickClock
                deadline={lobby.pick_deadline}
                frozenMs={lobby.pick_deadline_remaining_ms}
                unlimited={clockUnlimited}
                maxSeconds={onClockCellTotalSeconds}
              />
            </div>
          )}
            </>
          )}
        </div>
        <div className="draft__right">
          {!isComplete && RequestPauseButton({ compact: true })}
          {isFullscreen && (
            <button
              className="draft__fs-menu-btn"
              onClick={() => setShowFsMenu(true)}
              aria-label="Menu"
              title="Players, roster, chat & results"
            >
              <SpaceDashboardOutlinedIcon fontSize="small" />
              <span className="draft__btn-label">Menu</span>
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
          {/* Overflow "Tools" popover (desktop): Export, Auto-draft, Draft
              settings, League rules, Your settings — folded into one menu so the
              toolbar stays Fullscreen · Tools · Theme (+ Menu in fullscreen) and
              the important Menu button isn't crowded. Mobile reaches all of these
              via the nav drawer, so this is desktop-only (see &__tools). */}
          <div className="draft__tools" ref={toolsRef}>
            <button
              type="button"
              className={`draft__icon-btn draft__tools-btn${showTools ? ' is-open' : ''}`}
              onClick={() => setShowTools((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={showTools}
              aria-label="Draft tools"
              title="Draft tools"
            >
              <MenuIcon fontSize="small" />
            </button>
            {showTools && (
              <div className="draft__tools-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="draft__tools-item"
                  onClick={() => {
                    setShowTools(false);
                    navigate('/home');
                  }}
                >
                  <HomeIcon fontSize="small" />
                  <span className="draft__tools-item-label">Home</span>
                </button>
                {isMember && (
                  <button
                    type="button"
                    role="menuitem"
                    className="draft__tools-item"
                    onClick={() => {
                      setShowTools(false);
                      navigate(`/lobby/${id}`);
                    }}
                  >
                    <MeetingRoomIcon fontSize="small" />
                    <span className="draft__tools-item-label">Room</span>
                  </button>
                )}
                {myTeam && !myTeam.is_bot && !isComplete && (
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={myTeam.auto_draft}
                    className="draft__tools-item"
                    onClick={() => toggleAuto(myTeam.id, !myTeam.auto_draft)}
                  >
                    {myTeam.auto_draft ? (
                      <SmartToyIcon fontSize="small" />
                    ) : (
                      <SmartToyOutlinedIcon fontSize="small" />
                    )}
                    <span className="draft__tools-item-label">Auto-draft</span>
                    <span className={`draft__tools-state${myTeam.auto_draft ? ' is-on' : ''}`}>
                      {myTeam.auto_draft ? 'On' : 'Off'}
                    </span>
                  </button>
                )}
                {isCommish && skipped.length > 0 && (
                  <button
                    type="button"
                    role="menuitem"
                    className="draft__tools-item"
                    onClick={() => {
                      setShowTools(false);
                      autopickSkipped();
                    }}
                    disabled={autopickBusy}
                    title="Auto-pick for every skipped team's outstanding slot"
                  >
                    <SkipNextIcon fontSize="small" />
                    <span className="draft__tools-item-label">Auto-pick skipped</span>
                    <span className="draft__tools-state">{skipped.length}</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="draft__tools-item"
                  onClick={() => {
                    setShowTools(false);
                    setExportStep('menu');
                    setScreenshotError(null);
                    setShowExport(true);
                  }}
                >
                  <FileDownloadOutlinedIcon fontSize="small" />
                  <span className="draft__tools-item-label">Export</span>
                </button>
                {isCommish && !isComplete && (
                  <button
                    type="button"
                    role="menuitem"
                    className="draft__tools-item"
                    onClick={() => {
                      setShowTools(false);
                      setShowLobbySettings(true);
                    }}
                  >
                    <TuneOutlinedIcon fontSize="small" />
                    <span className="draft__tools-item-label">Draft settings</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="draft__tools-item"
                  onClick={() => {
                    setShowTools(false);
                    setShowRules(true);
                  }}
                >
                  <MenuBookOutlinedIcon fontSize="small" />
                  <span className="draft__tools-item-label">League rules</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="draft__tools-item"
                  onClick={() => {
                    setShowTools(false);
                    setShowParticipants(true);
                  }}
                >
                  <GroupsIcon fontSize="small" />
                  <span className="draft__tools-item-label">Participants</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="draft__tools-item"
                  onClick={() => {
                    setShowTools(false);
                    setShowUserSettings(true);
                  }}
                >
                  <SettingsIcon fontSize="small" />
                  <span className="draft__tools-item-label">Your settings</span>
                </button>
              </div>
            )}
          </div>
          <ThemeToggle className="draft__icon-btn draft__theme-btn" />
          {/* Mobile-only, and only once the draft is complete — opens the export
              options (board / grades / roster PNGs + data files). While the draft
              is live it would crowd the paused/clock header, so during the draft
              it lives in the nav drawer instead (see the NavDrawer "Export board"
              item below). */}
          {isComplete && (
            <button
              type="button"
              className="draft__icon-btn draft__boardpng-btn"
              onClick={() => {
                resetExport();
                setExportStep('menu');
                setShowExport(true);
              }}
              aria-label="Export options"
              title="Export the draft — board, grades, or roster"
            >
              <FileDownloadOutlinedIcon fontSize="small" />
            </button>
          )}
        </div>
      </header>

      {isPaused && (
        <div className="draft__paused-banner">
          <span>
            The draft is paused
            {isCommish ? ' — you can still make picks.' : ' by the commissioner.'}
          </span>
          {lobby.paused_at && <PausedDuration since={lobby.paused_at} />}
        </div>
      )}

      {simulating && (
        <div className="draft__simulating-banner">
          <span>
            <AutorenewIcon className="draft__simulating-spin" fontSize="small" /> Simulating the
            rest of the draft…
          </span>
          <button
            type="button"
            className="draft__simulating-cancel"
            onClick={cancelSimulate}
          >
            Cancel
          </button>
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
        {useDashboard ? (
          renderDashboard()
        ) : (
          <>
        <section
          ref={boardSectionRef}
          className={`draft__board ${mobileTab === 'board' ? 'is-mobile-active' : ''}${
            showPowerRankings ? ' draft__board--rankings' : ''
          }`}
          style={{ ['--mobile-board-zoom' as string]: mobileZoom }}
        >
          {showPowerRankings ? (
            <PowerRankingsBoard
              lobbyName={lobby.name}
              season={lobby.season}
              teams={teams}
              members={members}
              picks={picks}
              playersById={playersById}
              settings={lobby.settings}
              myTeamId={myTeam?.id ?? null}
              myUserId={userId}
              crownVotes={crownVotes}
              grades={grades}
              gradeReactions={gradeReactions}
              locked={resultsLocked}
              canVote={canVote}
              canGrade={canGrade}
              onVote={castCrownVote}
              onGrade={gradeTeam}
              onReact={reactGrade}
              onPickClick={setPickModal}
              onExportGrades={() => setShowGradeExport(true)}
              chatPanel={
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
                  viewOnly={!canReact}
                />
              }
            />
          ) : (
            renderDraftGrid()
          )}
          {/* Mobile pinch-zoom reset — floats over the board once zoomed. */}
          {!isDesktop && !showPowerRankings && Math.abs(mobileZoom - 1) > 0.001 && (
            <button
              type="button"
              className="draft__zoom-reset"
              onClick={() => setMobileZoom(1)}
              aria-label="Reset board zoom"
            >
              <ZoomInMapIcon fontSize="small" />
              Reset zoom
            </button>
          )}
        </section>

        {/* Desktop rankings view goes full-width — the right sidebar is
            board-specific, so it (and the results drawer) only render for the
            board view. On mobile the sidebar is the tab content, so it always
            renders there regardless of centerView. */}
        {!isFullscreen && (centerView === 'board' || !isDesktop) && (
          <>
            <div className="draft__resizer" onMouseDown={startResize} aria-hidden />

            <aside
          className={`draft__sidebar ${mobileTab !== 'board' ? 'is-mobile-active' : ''}`}
        >
          {renderSidebarPanels()}
        </aside>

        {/* Results drawer is a mobile-only slide-out now — on desktop the
            Power Rankings view replaces it. */}
        {isComplete && !isDesktop && (
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
          .filter((t) => t.key !== 'chat' || isMember || lobby.chat_public || lobby.spectate_public)
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
          commishTargets={commishTargets.length > 0 ? commishTargets : undefined}
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
                }
              : undefined
          }
          onHoldPick={
            canHoldDraft && !draftedIds.has(detailPlayer.id)
              ? () => {
                  setDetailPlayer(null);
                  holdDraft(detailPlayer);
                }
              : undefined
          }
          disabled={!canPick}
          blockedReason={draftedIds.has(detailPlayer.id) ? undefined : limitBlock(detailPlayer)}
          onQueue={
            draftedIds.has(detailPlayer.id) ? undefined : () => toggleQueue(detailPlayer.id)
          }
          queued={queue.includes(detailPlayer.id)}
          onFavorite={() => toggleFavorite(detailPlayer.id)}
          favorited={favoriteIds?.has(detailPlayer.id) ?? false}
          byeClashCounts={byeClashCountsForWeek(detailPlayer.bye_week, byeLookup)}
          weekStats={{ season: lobby.season - 1, scoring: lobby.settings.scoring }}
        />
      )}

      {showRules && (
        <LeagueRulesModal
          settings={lobby.settings}
          defaultName={lobby.name}
          onClose={() => setShowRules(false)}
        />
      )}

      {showParticipants && (
        <ParticipantsModal
          participants={members.map((m) => ({
            id: m.user_id,
            username: m.profiles?.username ?? null,
            avatar: m.profiles?.avatar ?? null,
          }))}
          onClose={() => setShowParticipants(false)}
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
            {isCommish && !isComplete && (
              <button
                type="button"
                className="navbar-drawer__link"
                onClick={() => {
                  setShowLobbySettings(true);
                  setDrawerOpen(false);
                }}
              >
                <TuneOutlinedIcon fontSize="small" />
                Draft settings
              </button>
            )}
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
            <button
              type="button"
              className="navbar-drawer__link"
              onClick={() => {
                setShowParticipants(true);
                setDrawerOpen(false);
              }}
            >
              <GroupsIcon fontSize="small" />
              Participants
            </button>
            {/* Personal draft-board preferences — the top bar's gear only shows
                on desktop/fullscreen, so mobile reaches it from here. */}
            <button
              type="button"
              className="navbar-drawer__link"
              onClick={() => {
                setShowUserSettings(true);
                setDrawerOpen(false);
              }}
            >
              <SettingsIcon fontSize="small" />
              Your settings
            </button>
            {/* Export lives in the drawer at every stage so mobile users can grab
                the board before the draft starts (staging, keepers already on the
                board), mid-draft, or after. When complete it opens the full export
                menu (board / grades / roster / data); before then only the board
                is meaningful, so it jumps straight to the board screenshot. The
                top-bar shortcut still mirrors this once the draft is complete. */}
            <button
              type="button"
              className="navbar-drawer__link"
              onClick={() => {
                resetExport();
                setExportStep(isComplete ? 'menu' : 'screenshot');
                setShowExport(true);
                setDrawerOpen(false);
              }}
            >
              <FileDownloadOutlinedIcon fontSize="small" />
              {isComplete ? 'Export' : 'Export board'}
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
            {/* Commissioner: fill every skipped team's outstanding slot at once —
                lives here now instead of crowding the top bar. */}
            {isCommish && skipped.length > 0 && (
              <button
                type="button"
                className="navbar-drawer__link"
                onClick={() => {
                  autopickSkipped();
                  setDrawerOpen(false);
                }}
                disabled={autopickBusy}
                title="Auto-pick for every skipped team's outstanding slot"
              >
                <SkipNextIcon fontSize="small" />
                Auto-pick skipped
                <span className="navbar-drawer__toggle-pill">{skipped.length}</span>
              </button>
            )}
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
          lobbyId={lobby.id}
          canSelect={isCommish && isStaging}
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
          lobbyId={lobby.id}
          canSelect={isCommish && isStaging}
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
              locked={chatLocked || !canReact}
              reactionsLocked={reactionsLocked || !canReact}
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
              weekStats={{ season: lobby.season - 1, scoring: lobby.settings.scoring }}
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
                {!isSkip && player && (
                  <span
                    className="rollback-summary__pos"
                    style={{ background: POSITION_COLORS[player.position as Position] }}
                  >
                    {player.position}
                  </span>
                )}
                <div className="rollback-summary__info">
                  <span className="rollback-summary__player">
                    {isSkip ? 'Skipped pick' : (player?.name ?? 'Unknown player')}
                  </span>
                  <span className="rollback-summary__meta">
                    {team && (
                      <Avatar avatar={avatarForTeam(team, members)} size={16} />
                    )}
                    {team?.name ?? 'A team'} · Round {round} · Pick {overall} overall
                  </span>
                </div>
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

      {confirmStart && (
        <ConfirmModal
          title="Start the draft?"
          confirmLabel="Start draft"
          busyLabel="Starting…"
          busy={commishBusy}
          onConfirm={() => void doStart()}
          onClose={() => setConfirmStart(false)}
        >
          <p>
            {unclaimedReserved === 1
              ? '1 reserved seat hasn’t been claimed yet.'
              : `${unclaimedReserved} reserved seats haven’t been claimed yet.`}{' '}
            Starting now turns {unclaimedReserved === 1 ? 'it' : 'them'} into
            {unclaimedReserved === 1 ? ' a bot' : ' bots'} for the draft.
          </p>
        </ConfirmModal>
      )}

      {showExport && (
        <Modal
          title={exportStep === 'screenshot' ? 'Board screenshot' : 'Export draft'}
          onBack={
            exportStep !== 'screenshot'
              ? undefined
              : screenshotUrl
                ? () => {
                    // Preview → back to the options step (discard this render).
                    setScreenshotUrl(null);
                    screenshotCanvasRef.current = null;
                  }
                : () => setExportStep('menu') // Options → back to the export menu.
          }
          onClose={() => {
            setShowExport(false);
            resetExport();
          }}
          footer={
            exportStep !== 'screenshot' ? undefined : (
              <div className="draft-export-screenshot__actions">
                {screenshotUrl ? (
                  <button type="button" className="button button--primary" onClick={downloadBoardImage}>
                    <FileDownloadOutlinedIcon fontSize="small" /> Download PNG
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => captureBoardScreenshot(screenshotAnonymize, screenshotHighlightMine)}
                    disabled={screenshotBusy}
                  >
                    {screenshotBusy ? 'Rendering…' : 'Create image'}
                  </button>
                )}
              </div>
            )
          }
        >
          {exportStep === 'menu' ? (
            <div className="draft-export-options">
              {/* Draft Board (screenshot) — the one export available mid-draft too. */}
              <button
                className="button draft-export-options__opt"
                onClick={() => {
                  setScreenshotUrl(null);
                  screenshotCanvasRef.current = null;
                  setScreenshotError(null);
                  setExportStep('screenshot');
                }}
              >
                <PhotoCameraOutlinedIcon fontSize="small" />
                <span>
                  <strong>Draft Board</strong>
                  <span className="muted">A PNG image of the draft board</span>
                </span>
              </button>
              {isComplete && (
                <>
                  <button
                    className="button draft-export-options__opt"
                    onClick={() => {
                      setShowExport(false);
                      setShowRosterExport(true);
                    }}
                  >
                    <AssignmentIndOutlinedIcon fontSize="small" />
                    <span>
                      <strong>Roster</strong>
                      <span className="muted">A clean PNG of a team's roster</span>
                    </span>
                  </button>
                  <button
                    className="button draft-export-options__opt"
                    onClick={() => {
                      setShowExport(false);
                      setShowGradeExport(true);
                    }}
                  >
                    <EmojiEventsOutlinedIcon fontSize="small" />
                    <span>
                      <strong>Draft Grades</strong>
                      <span className="muted">Shareable grade cards — one or per team</span>
                    </span>
                  </button>
                  {/* ESPN entry needs a desktop browser (console/bookmarklet + ESPN's
                      offline-draft grid), so it's hidden below the desktop breakpoint. */}
                  {isDesktop && (
                    <button
                      className="button draft-export-options__opt"
                      onClick={() => {
                        setShowExport(false);
                        setShowEspnExport(true);
                      }}
                    >
                      <ChecklistIcon fontSize="small" />
                      <span>
                        <strong>ESPN</strong>
                        <span className="muted">Guided + auto-fill into ESPN's offline draft</span>
                      </span>
                    </button>
                  )}
                  <button
                    className="button draft-export-options__opt"
                    onClick={() => {
                      setShowExport(false);
                      setDataExport('csv');
                    }}
                  >
                    <InsertDriveFileOutlinedIcon fontSize="small" />
                    <span>
                      <strong>CSV</strong>
                      <span className="muted">Teams stacked top to bottom (.csv)</span>
                    </span>
                  </button>
                  <button
                    className="button draft-export-options__opt"
                    onClick={() => {
                      setShowExport(false);
                      setDataExport('xls');
                    }}
                  >
                    <TableChartOutlinedIcon fontSize="small" />
                    <span>
                      <strong>Excel</strong>
                      <span className="muted">Teams side by side, scroll across (.xls)</span>
                    </span>
                  </button>
                  <button
                    className="button draft-export-options__opt"
                    onClick={() => {
                      setShowExport(false);
                      setDataExport('json');
                    }}
                  >
                    <DataObjectOutlinedIcon fontSize="small" />
                    <span>
                      <strong>JSON</strong>
                      <span className="muted">One object per team, for scripts and tools</span>
                    </span>
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="draft-export-screenshot">
              <label className="draft-export-screenshot__toggle">
                <input
                  type="checkbox"
                  checked={screenshotAnonymize}
                  onChange={(e) => {
                    setScreenshotAnonymize(e.target.checked);
                    setScreenshotUrl(null); // stale — re-render with the new choice
                  }}
                />
                <span>
                  <strong>Anonymize team names</strong>
                  <span className="muted">
                    Replace names and avatars with draft slot numbers — for sharing
                    outside the league.
                  </span>
                </span>
              </label>
              <label className="draft-export-screenshot__toggle">
                <input
                  type="checkbox"
                  checked={screenshotHighlightMine}
                  onChange={(e) => {
                    setScreenshotHighlightMine(e.target.checked);
                    setScreenshotUrl(null);
                  }}
                />
                <span>
                  <strong>Highlight my team</strong>
                  <span className="muted">
                    Show your team's colored ring, like it appears live.
                  </span>
                </span>
              </label>
              {screenshotError && <p className="draft-export-screenshot__error">{screenshotError}</p>}

              {screenshotUrl && (
                <>
                  <div className="draft-export-screenshot__preview">
                    <img src={screenshotUrl} alt="Draft board preview" />
                  </div>
                  <p className="draft-export-screenshot__hint">
                    Long-press the image to save it to your photos — or use Download below.
                  </p>
                </>
              )}
            </div>
          )}
        </Modal>
      )}

      {showGradeExport && (
        <GradeExportModal
          lobbyName={lobby.name}
          season={lobby.season}
          teams={teams}
          members={members}
          picks={picks}
          playersById={playersById}
          settings={lobby.settings}
          crownVotes={crownVotes}
          grades={grades}
          onBack={() => {
            setShowGradeExport(false);
            setShowExport(true);
          }}
          onClose={() => setShowGradeExport(false)}
        />
      )}

      {showRosterExport && (
        <RosterExportModal
          lobbyName={lobby.name}
          season={lobby.season}
          teams={teams}
          members={members}
          picks={picks}
          playersById={playersById}
          settings={lobby.settings}
          crownVotes={crownVotes}
          grades={grades}
          myTeamId={myTeam?.id ?? null}
          onBack={() => {
            setShowRosterExport(false);
            setShowExport(true);
          }}
          onClose={() => setShowRosterExport(false)}
        />
      )}

      {showEspnExport && lobby && (
        <EspnExportModal
          teams={teams}
          picks={picks}
          playersById={playersById}
          myTeamId={myTeam?.id ?? null}
          onBack={() => {
            setShowEspnExport(false);
            setShowExport(true);
          }}
          onClose={() => setShowEspnExport(false)}
        />
      )}

      {dataExport && lobby && (
        <DataExportModal
          format={dataExport}
          opts={{
            lobbyName: lobby.name,
            picks,
            teamsById,
            playersById,
            keepers: lobby.settings.keepersEnabled ?? false,
          }}
          onBack={() => {
            setDataExport(null);
            setShowExport(true);
          }}
          onClose={() => setDataExport(null)}
        />
      )}

      {isFullscreen && showFsMenu && (
        <Modal
          title={SIDEBAR_TABS.find((t) => t.key === panelTab)?.label ?? 'Menu'}
          onClose={() => setShowFsMenu(false)}
          // Detailed layout: the modal resizes per tab (wide for the players
          // table, narrower for roster/chat). Simple layout: a single 600px
          // width for every tab. Both handled by .draft__fs-menu-dialog.
          className={
            boardLayout === 'detailed'
              ? `draft__fs-menu-dialog is-${panelTab}`
              : 'draft__fs-menu-dialog is-simple'
          }
        >
          <div className="draft__fs-sidebar">{renderSidebarPanels()}</div>
        </Modal>
      )}

      {showUserSettings && (
        <DraftUserSettingsModal
          onClose={() => setShowUserSettings(false)}
          boardLayout={boardLayout}
          onBoardLayoutChange={updateBoardLayout}
          cellStyle={cellStyle}
          onCellStyleChange={updateCellStyle}
          cardStyle={cardStyle}
          onCardStyleChange={updateCardStyle}
          showCellReactions={showCellReactions}
          onShowCellReactionsChange={updateShowCellReactions}
          showByeClashes={showByeClashes}
          onShowByeClashesChange={updateShowByeClashes}
          showPickProjection={showPickProjection}
          onShowPickProjectionChange={updateShowPickProjection}
          showPoolMarks={showPoolMarks}
          onShowPoolMarksChange={updateShowPoolMarks}
          teamColors={teamColors}
          onTeamColorsChange={updateTeamColors}
          tvMode={tvMode}
          onTvModeChange={updateTvMode}
          hostMode={hostMode}
          onHostModeChange={updateHostMode}
          topbarPickReveal={topbarPickReveal}
          onTopbarPickRevealChange={updateTopbarPickReveal}
          toastPrefs={toastPrefs}
          onToastsEnabledChange={updateToastsEnabled}
          onToastCategoryChange={updateToastCategory}
        />
      )}

      {showLobbySettings && (
        <SettingsEditorModal
          lobbyId={lobby.id}
          status={lobby.status}
          settings={lobby.settings}
          name={lobby.name}
          onClose={() => setShowLobbySettings(false)}
          onSaved={() => refetch()}
          spectate={
            isCommish
              ? {
                  spectatePublic: lobby.spectate_public,
                  spectateReact: lobby.spectate_react,
                  spectateGrade: lobby.spectate_grade,
                }
              : undefined
          }
          onSpectateChange={() => refetch()}
          onSimulate={startSimulate}
        />
      )}
    </div>
  );
}
