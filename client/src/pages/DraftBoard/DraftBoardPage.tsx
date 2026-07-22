import {
  CHAT_LOCK_MS,
  DRAFT_RESULTS_LOCK_MS,
  POSITIONS,
  REACTION_LOCK_MS,
  ROLLBACK_LOCK_MS,
  defaultAvatar,
  draftPositionForOverall,
  extractMentionedUsernames,
  roundsForSettings,
  type Avatar as AvatarData,
  type DraftGrade,
  type Position,
} from '@draft-lobby/shared';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
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
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { ConfirmModal } from '../../components/ConfirmModal/ConfirmModal';
import { DraftChat } from '../../components/DraftChat/DraftChat';
import { DraftGrid, type ReactionEntry } from '../../components/DraftGrid/DraftGrid';
import { DraftOutroModal } from '../../components/DraftOutroModal/DraftOutroModal';
import { DraftResultsPanel } from '../../components/DraftResultsPanel/DraftResultsPanel';
import { ErrorScreen } from '../../components/ErrorScreen/ErrorScreen';
import { Loader } from '../../components/Loader/Loader';
import { LockInModal } from '../../components/LockInModal/LockInModal';
import { Modal } from '../../components/Modal/Modal';
import { NavDrawer } from '../../components/Navbar/NavDrawer';
import { PickClock } from '../../components/PickClock/PickClock';
import { PickModal, type PickComment } from '../../components/PickModal/PickModal';
import type { Reactor } from '../../components/ReactorsModal/ReactorsModal';
import { PlayerCard } from '../../components/PlayerCard/PlayerCard';
import { TeamLineup } from '../../components/TeamLineup/TeamLineup';
import {
  TeamResultsDrawer,
  type ResultsDrawerView,
} from '../../components/TeamResultsDrawer/TeamResultsDrawer';
import { ThemeToggle } from '../../components/ThemeToggle/ThemeToggle';
import { useAuth } from '../../auth/AuthContext';
import { useLobby } from '../../hooks/useLobby';
import { usePlayers } from '../../hooks/usePlayers';
import { api } from '../../lib/api';
import { mostCommonGrade } from '../../lib/draftGrade';
import { exportDraftCsv, exportDraftExcel } from '../../lib/exportDraft';
import { supabase } from '../../supabase';
import { useToast } from '../../toast/ToastContext';
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

type Filter = 'ALL' | Position | 'FLEX' | 'SUPERFLEX';
type PanelTab = 'players' | 'roster' | 'chat' | 'results';
type MobileTab = 'board' | PanelTab;

// Multi-position filters (no pick counts shown next to these).
const FLEX_POS: Position[] = ['RB', 'WR', 'TE'];
const SUPERFLEX_POS: Position[] = ['QB', 'RB', 'WR', 'TE'];

// The right sidebar's tabs (desktop) — labels shown in the tab strip. "Results"
// only makes sense once the draft is complete, so it's filtered out until then.
const SIDEBAR_TABS: { key: PanelTab; label: string; Icon: SvgIconComponent }[] = [
  { key: 'players', label: 'Players', Icon: SportsFootballIcon },
  { key: 'roster', label: 'Roster', Icon: FormatListBulletedIcon },
  { key: 'chat', label: 'Chat', Icon: ChatBubbleOutlineIcon },
  { key: 'results', label: 'Results', Icon: EmojiEventsOutlinedIcon },
];
// Bottom-bar sections (mobile) — Board plus the sidebar tabs.
const MOBILE_TABS: { key: MobileTab; label: string; Icon: SvgIconComponent }[] = [
  { key: 'board', label: 'Board', Icon: GridViewOutlinedIcon },
  { key: 'players', label: 'Players', Icon: SportsFootballIcon },
  { key: 'roster', label: 'Roster', Icon: FormatListBulletedIcon },
  { key: 'chat', label: 'Chat', Icon: ChatBubbleOutlineIcon },
  { key: 'results', label: 'Results', Icon: EmojiEventsOutlinedIcon },
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

export function DraftBoardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const { showToast } = useToast();
  const { lobby, teams, members, picks, loading } = useLobby(id);
  const { players, loading: playersLoading } = usePlayers();

  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('board');
  const [panelTab, setPanelTab] = useState<PanelTab>('players');
  const [rosterTeamSel, setRosterTeamSel] = useState<string | null>(null);
  const [resultsDrawerView, setResultsDrawerView] = useState<ResultsDrawerView>('closed');
  const [queue, setQueue] = useState<string[]>([]);
  const [selected, setSelected] = useState<PlayerRow | null>(null);
  const [pickBusy, setPickBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commishBusy, setCommishBusy] = useState(false);
  const [commishError, setCommishError] = useState<string | null>(null);
  const [reqPauseBusy, setReqPauseBusy] = useState(false);
  // The pick to roll back to (inclusive) — set from the toolbar's "Undo" (the
  // last pick) or from a pick modal's "Roll back to this pick" (any earlier one).
  const [rollbackTarget, setRollbackTarget] = useState<PickRow | null>(null);
  const [rollbackConfirmText, setRollbackConfirmText] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  const lastPick = useMemo(
    () => picks.reduce<PickRow | null>((latest, p) => (!latest || p.overall > latest.overall ? p : latest), null),
    [picks],
  );

  const teamsById = useMemo(() => {
    const m = new Map<string, TeamRow>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

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

  /** The pick, if it exists and belongs to my team — for realtime toasts. */
  function myPick(pickId: string): PickRow | null {
    const pick = picksRef.current.find((p) => p.id === pickId);
    if (!pick) return null;
    const team = teamsRef.current.find((t) => t.id === pick.team_id);
    return team?.owner_id === userId ? pick : null;
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
          if (row.user_id === userId || row.target_type !== 'PICK') return;
          const pick = myPick(row.target_id);
          if (!pick) return;
          const player = playersByIdRef.current.get(pick.player_id);
          showToast({
            title: `${memberUsername(row.user_id)} reacted ${row.emoji} to your pick`,
            body: player?.name,
            tone: 'info',
            avatar: memberAvatar(row.user_id),
            onClick: () => setPickModal(pick),
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
            title: `${memberUsername(row.rater_id)} graded your roster: ${row.grade}`,
            body: row.comment,
            tone: 'info',
            avatar: memberAvatar(row.rater_id),
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
    const endedAtMs = lobby.completed_at ? new Date(lobby.completed_at).getTime() : null;
    if (endedAtMs != null && Date.now() >= endedAtMs + DRAFT_RESULTS_LOCK_MS) return;
    const seenKey = `draft-outro-seen:${id}:${userId}`;
    if (localStorage.getItem(seenKey)) return;
    setShowOutro(true);
  }, [lobby, userId, id]);

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
                title: `${memberUsername(row.user_id)} commented on your pick`,
                body: player ? `${player.name}: “${row.body}”` : row.body,
                tone: 'info',
                avatar: memberAvatar(row.user_id),
                onClick: () => setPickModal(repliedPick),
              });
              return;
            }
            const myUsername = membersRef.current.find((m) => m.user_id === userId)?.profiles
              ?.username;
            if (myUsername && extractMentionedUsernames(row.body, [myUsername]).length > 0) {
              showToast({
                title: 'You were mentioned',
                body: row.body,
                tone: 'info',
                avatar: memberAvatar(row.user_id),
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
                body: row.body.replace('🙋 ', ''),
                tone: 'warning',
                action: { label: 'Pause draft', onClick: () => commishAction('pause') },
                avatar: memberAvatar(row.user_id),
              });
            }
          } else if (row.body.startsWith('⏸️')) {
            showToast({
              title: 'Draft paused',
              body: row.body.replace('⏸️ ', ''),
              tone: 'warning',
              avatar: memberAvatar(row.user_id),
            });
          } else if (row.body.startsWith('▶️')) {
            showToast({
              title: 'Draft resumed',
              body: row.body.replace('▶️ ', ''),
              tone: 'success',
              avatar: memberAvatar(row.user_id),
              durationMs: 2000,
            });
          } else if (row.body.startsWith('↩️')) {
            showToast({
              title: 'Pick rolled back',
              body: row.body.replace('↩️ ', ''),
              tone: 'info',
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

  if (loading || playersLoading)
    return (
      <div className="loading">
        <Loader label="Loading draft…" />
      </div>
    );
  if (!lobby) return <ErrorScreen title="Draft not found" />;
  if (lobby.status === 'SETUP' || lobby.status === 'SCHEDULED')
    return <Navigate to={`/lobby/${id}`} replace />;

  const { round, onClockTeam } = derived!;
  const totalRounds = roundsForSettings(lobby.settings);
  const isComplete = lobby.status === 'COMPLETE';
  const isPaused = lobby.status === 'PAUSED';
  const endedAt = isComplete ? lobby.completed_at ?? null : null;
  const chatLocked = !!endedAt && Date.now() >= new Date(endedAt).getTime() + CHAT_LOCK_MS;
  // Emoji reactions stay open much longer than chat — locked 24h after the draft.
  const reactionsLocked =
    !!endedAt && Date.now() >= new Date(endedAt).getTime() + REACTION_LOCK_MS;
  // Commissioners can still fix a mistake right after the draft ends, but the
  // rollback feature disappears for good a few minutes later.
  const rollbackLocked =
    !!endedAt && Date.now() >= new Date(endedAt).getTime() + ROLLBACK_LOCK_MS;
  // Crown vote + peer grading stay open 24h after the draft, same as reactions.
  const resultsLocked =
    !!endedAt && Date.now() >= new Date(endedAt).getTime() + DRAFT_RESULTS_LOCK_MS;
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

  async function commishAction(path: 'pause' | 'resume') {
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

  async function requestPause() {
    setReqPauseBusy(true);
    try {
      await api(`/lobbies/${id}/request-pause`, { method: 'POST' });
      showToast({
        title: 'Pause requested',
        body: "The commissioner's been notified.",
        tone: 'info',
        durationMs: 2000,
      });
    } catch {
      showToast({ title: "Couldn't request a pause", tone: 'danger' });
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
            onClick={() => setRollbackTarget(lastPick)}
            disabled={commishBusy}
          >
            <UndoIcon fontSize="small" /> Undo
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
          onClick={() => lastPick && setRollbackTarget(lastPick)}
          disabled={commishBusy || !lastPick}
        >
          <UndoIcon fontSize="small" /> Undo
        </button>
        <button
          className={`draft__tool-btn draft__skipbots-btn${autoSkipBots ? ' is-on' : ''}`}
          onClick={() => setAutoSkipBots((v) => !v)}
          title="Automatically skip bot picks as they come on the clock"
        >
          <FastForwardIcon fontSize="small" /> Skip bots
          {autoSkipBots ? ' · On' : ''}
        </button>
        {commishError && <span className="draft__commish-error">{commishError}</span>}
      </>
    );
  }

  // Member-only "Request pause". `compact` renders an icon-only button for
  // the mobile top bar; the full text version stays in the desktop top bar.
  function RequestPauseButton({ compact }: { compact?: boolean }) {
    if (isCommish || isComplete || isPaused) return null;
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
            <PauseIcon fontSize="small" /> Request pause
          </>
        )}
      </button>
    );
  }

  return (
    <div className="draft" ref={rootRef}>
      <header
        className={`draft__topbar${myTurnHighlight ? ' draft__topbar--myturn' : ''}${
          myTurnUrgency ? ` draft__topbar--${myTurnUrgency}` : ''
        }${myTurnFlashing ? ' draft__topbar--flash' : ''}`}
      >
        <div className="draft__left">
          <div className="draft__nav-links">
            <button
              type="button"
              className="draft__home-btn"
              onClick={() => navigate('/home')}
            >
              <HomeOutlinedIcon fontSize="small" /> Home
            </button>
            <Link to={`/lobby/${id}`} className="draft__room-btn">
              <MeetingRoomOutlinedIcon fontSize="small" /> Room
            </Link>
          </div>
          {!isComplete && (
            <div className="draft__commish-tools">
              <CommishTools />
              <RequestPauseButton />
            </div>
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
            <button className="draft__export-btn" onClick={() => setShowExport(true)}>
              <FileDownloadOutlinedIcon fontSize="small" /> Export
            </button>
          ) : (
            <PickClock deadline={lobby.pick_deadline} frozenMs={lobby.pick_deadline_remaining_ms} />
          )}
          {!isComplete && <RequestPauseButton compact />}
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
          <span>
            The draft is paused
            {isCommish ? '.' : ' by the commissioner.'}
          </span>
          {lobby.paused_at && <PausedDuration since={lobby.paused_at} />}
        </div>
      )}

      <div className="draft__body" style={{ ['--sidebar-w' as string]: `${sidebarWidth}px` }}>
        <section
          ref={boardSectionRef}
          className={`draft__board ${mobileTab === 'board' ? 'is-mobile-active' : ''}`}
        >
          <DraftGrid
            teams={teams}
            members={members}
            rounds={totalRounds}
            picks={picks}
            playersById={playersById}
            onClockTeamId={isComplete ? null : onClockTeam?.id ?? null}
            myTeamId={myTeam?.id ?? null}
            currentRound={round}
            draftType={lobby.settings.draftType}
            onTeamClick={openTeamRoster}
            reactionsByPick={reactionsByPick}
            onReactPick={reactPick}
            onPickClick={setPickModal}
            commentsByPick={commentsByPick}
            fill={isFullscreen}
            fillRowHeight={fsRowHeight}
          />
        </section>

        {!isFullscreen && (
          <>
            <div className="draft__resizer" onMouseDown={startResize} aria-hidden />

            <aside
          className={`draft__sidebar ${mobileTab !== 'board' ? 'is-mobile-active' : ''}`}
        >
          <div className="draft__sidebar-tabs">
            {SIDEBAR_TABS.filter((t) => t.key !== 'results' || isComplete).map(({ key, label, Icon }) => (
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
                onPickClick={setPickModal}
                belowSelect={
                  isComplete &&
                  (() => {
                    const voteCount = crownVotes.filter((v) => v.team_id === rosterTeamId).length;
                    const teamGrades = grades.filter((g) => g.team_id === rosterTeamId);
                    const avgGrade = mostCommonGrade(teamGrades);
                    return (
                      <>
                        <span className="lineup-view__label">Report Card</span>
                        <button
                          type="button"
                          className="draft__results-summary"
                          onClick={() =>
                            setResultsDrawerView((v) => (v === 'closed' ? 'open' : 'closed'))
                          }
                        >
                          <span className="draft__results-summary-item">
                            <EmojiEventsOutlinedIcon fontSize="small" /> {voteCount} vote
                            {voteCount === 1 ? '' : 's'}
                          </span>
                          <span className="draft__results-summary-item">
                            {avgGrade ?? '—'}{' '}
                            <span className="muted">({teamGrades.length})</span>
                          </span>
                          <ChevronRightIcon
                            fontSize="small"
                            className="draft__results-summary-chevron"
                          />
                        </button>
                      </>
                    );
                  })()
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
              picks={picks}
              teamsById={teamsById}
              playersById={playersById}
              members={members}
              onOpenPick={setPickModal}
              focusMessageId={focusMessageId}
              onFocusHandled={() => setFocusMessageId(null)}
            />
          </div>

          {/* Results — crown vote + peer grading, only relevant post-draft. */}
          {isComplete && (
            <div
              className={`draft__panel-body ${panelTab === 'results' ? 'is-desktop-active' : ''} ${
                mobileTab === 'results' ? 'is-mobile-active' : ''
              }`}
            >
              <div className="draft__results">
                {resultsLocked && (
                  <p className="muted draft__results-locked">
                    🔒 Voting and grading closed 24h after the draft ended — showing final results.
                  </p>
                )}
                <DraftResultsPanel
                  teams={teams}
                  members={members}
                  myTeamId={myTeam?.id ?? null}
                  myUserId={userId}
                  crownVotes={crownVotes}
                  grades={grades}
                  locked={resultsLocked}
                  onVote={castCrownVote}
                  onGrade={gradeTeam}
                />
              </div>
            </div>
          )}
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
          <CommishTools />
        </div>
      )}

      {/* Mobile-only section tabs + nav. */}
      <nav className="draft__tabs">
        {MOBILE_TABS.filter((t) => t.key !== 'results' || isComplete).map(({ key, label, Icon }) => (
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
        extraContent={
          myTeam && !myTeam.is_bot && !isComplete ? (
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
          ) : undefined
        }
      />

      {showOutro && (
        <DraftOutroModal
          myTeam={myTeam ?? undefined}
          teams={teams}
          members={members}
          myUserId={userId}
          picks={picks}
          playersById={playersById}
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
              author: usernameById.get(c.user_id) ?? 'Player',
              body: c.body,
              at: c.created_at,
              mine: c.user_id === userId,
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
              entry={reactionsByPick.get(pickModal.id)}
              reactors={reactors}
              onReact={(emoji) => reactPick(pickModal.id, emoji)}
              comments={comments}
              onReactComment={reactMessage}
              members={members}
              locked={chatLocked}
              reactionsLocked={reactionsLocked}
              onClose={() => setPickModal(null)}
              isCommish={isCommish}
              onRollbackTo={
                rollbackLocked
                  ? undefined
                  : () => {
                      setRollbackTarget(pickModal);
                      setPickModal(null);
                    }
              }
            />
          );
        })()}

      {rollbackTarget &&
        (() => {
          const target = rollbackTarget;
          const player = playersById.get(target.player_id);
          const team = teamsById.get(target.team_id);
          const count = picks.filter((p) => p.overall >= target.overall).length;
          const multi = count > 1;
          const confirmWord = 'ROLLBACK';
          return (
            <ConfirmModal
              title={multi ? `Roll back ${count} picks?` : 'Undo this pick?'}
              confirmLabel={multi ? 'Roll back' : 'Undo pick'}
              busyLabel={multi ? 'Rolling back…' : 'Undoing…'}
              busy={commishBusy}
              danger={multi}
              confirmDisabled={multi && rollbackConfirmText.trim().toUpperCase() !== confirmWord}
              onConfirm={() => rollbackTo(target.overall)}
              onClose={() => {
                setRollbackTarget(null);
                setRollbackConfirmText('');
              }}
            >
              <div className="rollback-summary">
                <span className="rollback-summary__player">
                  {player?.name ?? 'Unknown player'}
                </span>
                <span className="rollback-summary__meta">
                  {team?.name ?? 'A team'} · Round {target.round} · Pick {target.overall} overall
                </span>
              </div>
              {multi ? (
                <>
                  <p>
                    This permanently deletes the last <strong>{count}</strong> picks (from pick{' '}
                    {target.overall} onward) and puts {team?.name ?? 'that team'} back on the
                    clock. This can’t be undone.
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
    </div>
  );
}
