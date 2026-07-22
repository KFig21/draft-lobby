import {
  defaultAvatar,
  extractMentionedUsernames,
  roundsForSettings,
  type Avatar as AvatarData,
} from '@draft-lobby/shared';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import { clockSummary } from '../../lib/format';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar/Avatar';
import { ConfirmModal } from '../../components/ConfirmModal/ConfirmModal';
import { DraftChat } from '../../components/DraftChat/DraftChat';
import { ErrorScreen } from '../../components/ErrorScreen/ErrorScreen';
import { Loader } from '../../components/Loader/Loader';
import { useAuth } from '../../auth/AuthContext';
import { useLobby } from '../../hooks/useLobby';
import { usePlayers } from '../../hooks/usePlayers';
import { api } from '../../lib/api';
import { avatarForTeam } from '../../lib/teamAvatar';
import { supabase } from '../../supabase';
import { useToast } from '../../toast/ToastContext';
import type { FriendshipRow, PickRow, PlayerRow, ProfileMini, TeamRow } from '../../lib/types';
import './LobbyRoomPage.scss';

const OPEN_AVATAR = { bgColor: '#2e3347', shape: 'circle', emoji: '➕' } as const;

export function LobbyRoomPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { lobby, teams, members, picks, loading, error, refetch } = useLobby(id);
  const { players } = usePlayers();
  const [starting, setStarting] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ userId: string; name: string } | null>(null);
  const [kicking, setKicking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [friendBusy, setFriendBusy] = useState<string | null>(null);
  const [orderMode, setOrderMode] = useState(false);
  // Positional draft order: index 0 = pick 1; each entry is a team id or null (open slot).
  const [slotOccupants, setSlotOccupants] = useState<(string | null)[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Mobile: chat is a bottom drawer; desktop keeps the right sidebar.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1100px)').matches,
  );
  // Mobile chat drawer: collapsed handle → open (~80%) → full screen.
  const [chatView, setChatView] = useState<'closed' | 'open' | 'full'>('closed');
  const [chatUnread, setChatUnread] = useState(0);
  const chatActive = chatView !== 'closed';
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1100px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const userId = session?.user.id;

  function memberAvatar(uid: string): AvatarData {
    return members.find((m) => m.user_id === uid)?.profiles?.avatar ?? defaultAvatar(uid);
  }

  // All friendships (any status) + who's already been invited, for the invite/friend UI.
  const loadInvitables = useCallback(() => {
    if (!userId) return;
    void supabase
      .from('friendships')
      .select(
        '*, requester:requester_id ( id, username, avatar ), addressee:addressee_id ( id, username, avatar )',
      )
      .then(({ data }) => setFriendships((data ?? []) as unknown as FriendshipRow[]));
    void supabase
      .from('lobby_invites')
      .select('invitee_id, status')
      .eq('lobby_id', id)
      .then(({ data }) => {
        const s = new Set<string>();
        for (const inv of data ?? []) {
          if ((inv as { status: string }).status === 'PENDING') {
            s.add((inv as { invitee_id: string }).invitee_id);
          }
        }
        setInvitedIds(s);
      });
  }, [userId, id]);

  useEffect(() => {
    loadInvitables();
  }, [loadInvitables]);

  // Toast: alert everyone else when a new team joins the lobby — a real user
  // claiming a bot's seat (UPDATE) or the lowest open slot (INSERT).
  useEffect(() => {
    const ch = supabase
      .channel(`lobby-toast:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'teams', filter: `lobby_id=eq.${id}` },
        (payload) => {
          const oldRow = payload.old as { owner_id: string | null };
          const newRow = payload.new as { owner_id: string | null; name: string };
          if (!newRow.owner_id || newRow.owner_id === oldRow.owner_id) return;
          if (newRow.owner_id === userId) return;
          showToast({
            title: 'New team joined',
            body: `${newRow.name} joined the lobby`,
            avatar: memberAvatar(newRow.owner_id),
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'teams', filter: `lobby_id=eq.${id}` },
        (payload) => {
          const row = payload.new as { owner_id: string | null; name: string; is_bot: boolean };
          if (row.is_bot || !row.owner_id || row.owner_id === userId) return;
          showToast({
            title: 'New team joined',
            body: `${row.name} joined the lobby`,
            avatar: memberAvatar(row.owner_id),
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `lobby_id=eq.${id}` },
        (payload) => {
          const row = payload.new as { kind: string; user_id: string; body: string };
          if (row.kind !== 'USER' || row.user_id === userId) return;
          const myUsername = members.find((m) => m.user_id === userId)?.profiles?.username;
          if (myUsername && extractMentionedUsernames(row.body, [myUsername]).length > 0) {
            showToast({
              title: 'You were mentioned',
              body: row.body,
              tone: 'info',
              avatar: memberAvatar(row.user_id),
            });
          }
        },
      )
      // An avatar/username edit should refresh the invite/friends list too
      // (it embeds its own profiles join, separate from useLobby's members).
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => loadInvitables(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [id, userId, showToast, members, loadInvitables]);

  const isCommish = useMemo(() => {
    if (!userId) return false;
    if (lobby?.commissioner_id === userId) return true;
    return members.some(
      (m) => m.user_id === userId && m.role === 'SUB_COMMISSIONER',
    );
  }, [userId, lobby, members]);

  // Accepted friends (for the invite list).
  const friends = useMemo(
    () =>
      friendships
        .filter((f) => f.status === 'ACCEPTED')
        .map((f) => (f.requester_id === userId ? f.addressee : f.requester))
        .filter((p): p is ProfileMini => !!p),
    [friendships, userId],
  );

  // Relationship with each other user, keyed by their id.
  type Relation = 'friends' | 'incoming' | 'outgoing';
  const relations = useMemo(() => {
    const map = new Map<string, Relation>();
    for (const f of friendships) {
      const iAmRequester = f.requester_id === userId;
      const otherId = iAmRequester ? f.addressee_id : f.requester_id;
      map.set(
        otherId,
        f.status === 'ACCEPTED' ? 'friends' : iAmRequester ? 'outgoing' : 'incoming',
      );
    }
    return map;
  }, [friendships, userId]);

  async function friendAction(path: string, body: unknown, targetId: string) {
    setFriendBusy(targetId);
    setActionError(null);
    try {
      await api(`/friends/${path}`, { method: 'POST', body });
      loadInvitables();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update friend');
    } finally {
      setFriendBusy(null);
    }
  }

  const avatarFor = (ownerId: string | null): AvatarData => {
    if (!ownerId) return OPEN_AVATAR;
    const member = members.find((m) => m.user_id === ownerId);
    return member?.profiles?.avatar ?? defaultAvatar(ownerId);
  };
  const teamAvatar = (team: TeamRow): AvatarData => avatarForTeam(team, members);

  // Maps for the lobby chat (players load lazily; picks are empty pre-draft).
  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const playersById = useMemo(() => {
    const m = new Map<string, PlayerRow>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  // The lobby chat has no pick modal / draft board of its own — clicking a
  // pick, a "replied to" reference, or a pick reaction line instead hops over
  // to the draft room and opens that pick there. Uses a plain `?pick=` query
  // param rather than router `state` — state doesn't survive a refresh or a
  // link opened in a new tab, and is otherwise harder to verify was actually
  // attached; a query param is visible in the URL and unambiguous.
  const openPickInDraftRoom = useCallback(
    (pick: PickRow) => {
      navigate(`/lobby/${id}/draft?pick=${pick.id}`);
    },
    [id, navigate],
  );

  async function addBot() {
    setBotBusy(true);
    setActionError(null);
    try {
      await api(`/lobbies/${id}/add-bot`, { method: 'POST' });
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add a bot');
    } finally {
      setBotBusy(false);
    }
  }
  async function fillBots() {
    setBotBusy(true);
    setActionError(null);
    try {
      await api(`/lobbies/${id}/fill-bots`, { method: 'POST' });
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add bots');
    } finally {
      setBotBusy(false);
    }
  }
  async function removeBot(teamId: string) {
    setActionError(null);
    try {
      await api(`/lobbies/${id}/remove-bot`, { method: 'POST', body: { teamId } });
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove bot');
    }
  }
  async function confirmDelete() {
    setDeleting(true);
    setActionError(null);
    try {
      await api(`/lobbies/${id}`, { method: 'DELETE' });
      navigate('/home');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete lobby');
      setDeleting(false);
      setShowDeleteModal(false);
    }
  }
  async function confirmLeave() {
    setLeaving(true);
    setActionError(null);
    try {
      await api(`/lobbies/${id}/leave`, { method: 'POST' });
      navigate('/home');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to leave lobby');
      setLeaving(false);
      setShowLeaveModal(false);
    }
  }
  async function confirmKick() {
    if (!kickTarget) return;
    setKicking(true);
    setActionError(null);
    try {
      await api(`/lobbies/${id}/kick`, { method: 'POST', body: { userId: kickTarget.userId } });
      setKickTarget(null);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setKicking(false);
    }
  }

  if (loading)
    return (
      <div className="loading">
        <Loader label="Loading lobby…" />
      </div>
    );
  if (error || !lobby)
    return (
      <ErrorScreen
        title="Lobby not found"
        message={error ?? 'This lobby may have been deleted or the link is incorrect.'}
      />
    );

  const s = lobby.settings;
  const filledSlots = teams.length;
  const emptySlots = Math.max(0, s.teamCount - filledSlots);

  async function startDraft() {
    setActionError(null);
    setStarting(true);
    try {
      await api(`/lobbies/${id}/start`, { method: 'POST' });
      navigate(`/lobby/${id}/draft`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to start');
    } finally {
      setStarting(false);
    }
  }

  async function copyInvite() {
    const url = `${window.location.origin}/lobby/join?lobby=${id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function startEditName(teamId: string, current: string) {
    setActionError(null);
    setEditingTeamId(teamId);
    setEditName(current);
  }

  async function saveName(teamId: string) {
    const name = editName.trim();
    if (!name) return;
    setSavingName(true);
    setActionError(null);
    try {
      await api(`/lobbies/${id}/team-name`, {
        method: 'POST',
        body: { teamId, name },
      });
      setEditingTeamId(null);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to rename team');
    } finally {
      setSavingName(false);
    }
  }

  async function invite(friendId: string) {
    setInviteBusy(friendId);
    setActionError(null);
    try {
      await api(`/lobbies/${id}/invite`, { method: 'POST', body: { userId: friendId } });
      setInvitedIds((prev) => new Set(prev).add(friendId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to invite');
    } finally {
      setInviteBusy(null);
    }
  }

  // ── Draft order editing (positional; open slots allowed) ──
  function startOrderEdit() {
    const arr = Array<string | null>(s.teamCount).fill(null);
    for (const t of teams) {
      if (t.draft_position >= 1 && t.draft_position <= s.teamCount) {
        arr[t.draft_position - 1] = t.id;
      }
    }
    setSlotOccupants(arr);
    setOrderMode(true);
    setActionError(null);
  }
  function swapSlots(i: number, j: number) {
    if (j < 0 || j >= slotOccupants.length) return;
    setSlotOccupants((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function handleDragEnter(index: number) {
    if (dragIndex === null || dragIndex === index) return;
    swapSlots(dragIndex, index);
    setDragIndex(index);
  }
  function randomizeOrder() {
    setSlotOccupants((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
  }
  async function saveOrder() {
    setSavingOrder(true);
    setActionError(null);
    try {
      await api(`/lobbies/${id}/draft-order`, {
        method: 'POST',
        body: { slots: slotOccupants },
      });
      setOrderMode(false);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save order');
    } finally {
      setSavingOrder(false);
    }
  }

  const draftLive = lobby.status === 'DRAFTING' || lobby.status === 'COMPLETE';
  const memberIds = new Set(members.map((m) => m.user_id));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  // Positional view of the draft order: each slot holds its team, or null if open.
  const orderedSlots: (TeamRow | null)[] = Array(s.teamCount).fill(null);
  for (const t of teams) {
    if (t.draft_position >= 1 && t.draft_position <= s.teamCount) {
      orderedSlots[t.draft_position - 1] = t;
    }
  }

  return (
    <main className="room">
      <div className="room__main">
        <header className="room__header">
          <button
            type="button"
            className="header-back"
            onClick={() => navigate('/home')}
            aria-label="Back to home"
          >
            <ArrowBackIcon fontSize="small" />
          </button>
          <div className="room__title">
            <h1>{lobby.name}</h1>
            <span className={`status-pill status-pill--${lobby.status.toLowerCase()}`}>
              {lobby.status}
            </span>
          </div>
        </header>

        <div className="room__meta">
          <span>{s.teamCount} teams</span>
          <span>{s.draftType === 'SNAKE' ? 'Snake' : 'Straight'}</span>
          <span>{roundsForSettings(s)} rounds</span>
          <span>{clockSummary(s.pickTiers)}/pick</span>
          {s.draftMode === 'MOCK' && <span>🤖 Mock</span>}
          {s.keepersEnabled && <span>Keepers</span>}
        </div>

        <section className="room__invite card">
          <div>
            <h2>Invite</h2>
            <p className="muted">Share the link or lobby ID + password.</p>
            <code className="room__id">{id}</code>
          </div>
          <button className="button" onClick={copyInvite}>
            {copied ? 'Copied!' : 'Copy invite link'}
          </button>
        </section>

        {/* Primary action sits between the invite and the draft order. */}
        <div className="room__primary-action">
          {draftLive ? (
            <Link className="button button--primary button--lg" to={`/lobby/${id}/draft`}>
              Go to draft board →
            </Link>
          ) : isCommish ? (
            <button
              className="button button--primary button--lg room__start"
              onClick={startDraft}
              disabled={starting || orderMode}
              title={orderMode ? 'Save or cancel the draft order first' : undefined}
            >
              {starting ? 'Starting…' : 'Start draft'}
            </button>
          ) : (
            <p className="muted">Waiting for the commissioner to start the draft…</p>
          )}
        </div>

        <section className="room__teams">
          <div className="room__teams-head">
            <h2>Draft order</h2>
            {isCommish && !draftLive && !orderMode && (
              <div className="room__teams-actions">
                {emptySlots > 0 && (
                  <>
                    <button
                      type="button"
                      className="room__order-btn"
                      onClick={addBot}
                      disabled={botBusy}
                    >
                      <AddIcon fontSize="small" />
                      Add bot
                    </button>
                    <button
                      type="button"
                      className="room__order-btn"
                      onClick={fillBots}
                      disabled={botBusy}
                    >
                      <SmartToyOutlinedIcon fontSize="small" />
                      {botBusy ? 'Working…' : `Fill ${emptySlots} with bots`}
                    </button>
                  </>
                )}
                <button type="button" className="room__order-btn" onClick={startOrderEdit}>
                  <FormatListNumberedIcon fontSize="small" />
                  Set draft order
                </button>
              </div>
            )}
          </div>

          {orderMode ? (
            <>
              <p className="muted room__order-hint">
                Drag teams into any slot — leave slots open for players to fill later.
              </p>
              <div className="room__order-actions">
                <button type="button" className="button" onClick={randomizeOrder}>
                  <ShuffleIcon fontSize="small" /> Randomize
                </button>
                <button type="button" className="button" onClick={() => setOrderMode(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={saveOrder}
                  disabled={savingOrder}
                >
                  {savingOrder ? 'Saving…' : 'Save order'}
                </button>
              </div>
              <ol className="team-list">
                {slotOccupants.map((occId, i) => {
                  const team = occId ? teamById.get(occId) : null;
                  return (
                    <li
                      key={i}
                      className={`team-list__row${team ? ' team-list__row--draggable' : ' team-list__row--empty'}${
                        dragIndex === i ? ' team-list__row--dragging' : ''
                      }`}
                      draggable={!!team}
                      onDragStart={() => team && setDragIndex(i)}
                      onDragEnter={() => handleDragEnter(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnd={() => setDragIndex(null)}
                    >
                      <span className="team-list__drag" aria-hidden>
                        {team && <DragIndicatorIcon fontSize="small" />}
                      </span>
                      <span className="team-list__pos">{i + 1}</span>
                      {team ? (
                        <>
                          <Avatar avatar={teamAvatar(team)} size={32} />
                          <span className="team-list__name">{team.name}</span>
                          {team.is_bot && (
                            <span className="team-list__chip muted">Bot</span>
                          )}
                          {team.owner_id === userId && (
                            <span className="team-list__you">you</span>
                          )}
                        </>
                      ) : (
                        <>
                          <Avatar avatar={OPEN_AVATAR} size={32} />
                          <span className="team-list__name muted">Open slot</span>
                        </>
                      )}
                      <span className="team-list__spacer" />
                      <div className="team-list__order-ctrls">
                        <button
                          type="button"
                          className="team-list__icon"
                          aria-label="Move up"
                          disabled={i === 0}
                          onClick={() => swapSlots(i, i - 1)}
                        >
                          <ArrowUpwardIcon fontSize="small" />
                        </button>
                        <button
                          type="button"
                          className="team-list__icon"
                          aria-label="Move down"
                          disabled={i === slotOccupants.length - 1}
                          onClick={() => swapSlots(i, i + 1)}
                        >
                          <ArrowDownwardIcon fontSize="small" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <ol className="team-list">
              {orderedSlots.map((team, slotIdx) => {
                if (!team) {
                  return (
                    <li
                      key={`open-${slotIdx}`}
                      className="team-list__row team-list__row--empty"
                    >
                      <span className="team-list__pos">{slotIdx + 1}</span>
                      <Avatar avatar={OPEN_AVATAR} size={32} />
                      <span className="team-list__name muted">Open slot</span>
                    </li>
                  );
                }
                const canEdit = team.owner_id === userId || isCommish;
                const editing = editingTeamId === team.id;
                const otherUserId =
                  team.owner_id && team.owner_id !== userId ? team.owner_id : null;
                const rel = otherUserId ? relations.get(otherUserId) : undefined;
                return (
                  <li key={team.id} className="team-list__row">
                    <span className="team-list__pos">{team.draft_position}</span>
                    <Avatar avatar={teamAvatar(team)} size={32} />
                    {editing ? (
                      <form
                        className="team-list__edit"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveName(team.id);
                        }}
                      >
                        <input
                          autoFocus
                          value={editName}
                          maxLength={40}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                        <button
                          type="submit"
                          className="team-list__icon"
                          aria-label="Save team name"
                          disabled={savingName || !editName.trim()}
                        >
                          <CheckIcon fontSize="small" />
                        </button>
                        <button
                          type="button"
                          className="team-list__icon"
                          aria-label="Cancel"
                          onClick={() => setEditingTeamId(null)}
                        >
                          <CloseIcon fontSize="small" />
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="team-list__name">{team.name}</span>
                        {/* Status chips sit right next to the team name. */}
                        {team.owner_id === userId && (
                          <span className="team-list__you">you</span>
                        )}
                        {rel === 'friends' && (
                          <span className="team-list__chip team-list__chip--friend">
                            <HowToRegOutlinedIcon sx={{ fontSize: 15 }} />
                            Friends
                          </span>
                        )}
                        {rel === 'outgoing' && (
                          <span className="team-list__chip muted">Requested</span>
                        )}
                        {team.is_bot && <span className="team-list__chip muted">Bot</span>}
                        {team.is_prev_champion && (
                          <span title="Defending champion">👑</span>
                        )}

                        <span className="team-list__spacer" />

                        {canEdit && (
                          <button
                            type="button"
                            className="team-list__icon team-list__edit-btn"
                            aria-label={`Rename ${team.name}`}
                            onClick={() => startEditName(team.id, team.name)}
                          >
                            <EditOutlinedIcon fontSize="small" />
                          </button>
                        )}
                        {team.is_bot && isCommish && !draftLive && (
                          <button
                            type="button"
                            className="team-list__icon"
                            aria-label={`Remove ${team.name}`}
                            title="Remove bot"
                            onClick={() => removeBot(team.id)}
                          >
                            <CloseIcon fontSize="small" />
                          </button>
                        )}
                        {!team.is_bot &&
                          isCommish &&
                          !draftLive &&
                          team.owner_id &&
                          team.owner_id !== lobby.commissioner_id && (
                            <button
                              type="button"
                              className="team-list__icon"
                              aria-label={`Remove ${team.name} from the lobby`}
                              title="Remove from lobby"
                              onClick={() =>
                                setKickTarget({ userId: team.owner_id!, name: team.name })
                              }
                            >
                              <PersonRemoveOutlinedIcon fontSize="small" />
                            </button>
                          )}
                        {otherUserId && rel === 'incoming' && (
                          <button
                            type="button"
                            className="button team-list__friend-btn"
                            disabled={friendBusy === otherUserId}
                            onClick={() =>
                              friendAction(
                                'respond',
                                { requesterId: otherUserId, accept: true },
                                otherUserId,
                              )
                            }
                          >
                            Accept
                          </button>
                        )}
                        {otherUserId && rel === undefined && (
                          <button
                            type="button"
                            className="team-list__icon team-list__friend-add"
                            aria-label={`Add ${team.name} as a friend`}
                            title="Add friend"
                            disabled={friendBusy === otherUserId}
                            onClick={() =>
                              friendAction('request', { userId: otherUserId }, otherUserId)
                            }
                          >
                            <PersonAddAlt1Icon fontSize="small" />
                          </button>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {!draftLive && (
          <section className="room__friends">
            <div className="room__friends-head">
              <h2>Invite friends</h2>
              <Link className="room__friends-link" to="/friends">
                Manage friends →
              </Link>
            </div>
            {friends.length === 0 ? (
              <p className="muted">
                Add friends to invite them with one tap.{' '}
                <Link to="/friends" className="room__friends-inline">
                  Find friends →
                </Link>
              </p>
            ) : (
              <ul className="room__friends-list">
                {friends.map((f) => {
                  const isMember = memberIds.has(f.id);
                  const invited = invitedIds.has(f.id);
                  return (
                    <li key={f.id} className="room__friend">
                      <Avatar avatar={f.avatar ?? avatarFor(f.id)} size={32} />
                      <span className="room__friend-name">{f.username}</span>
                      {isMember ? (
                        <span className="muted">In lobby</span>
                      ) : invited ? (
                        <span className="muted">Invited</span>
                      ) : (
                        <button
                          className="button room__friend-btn"
                          disabled={inviteBusy === f.id}
                          onClick={() => invite(f.id)}
                        >
                          {inviteBusy === f.id ? 'Inviting…' : 'Invite'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {actionError && <p className="room__error">{actionError}</p>}

        {isCommish && !draftLive && (
          <div className="room__actions">
            <button
              className="button button--sm room__delete"
              onClick={() => setShowDeleteModal(true)}
            >
              Delete lobby
            </button>
          </div>
        )}
        {lobby.commissioner_id !== userId && !draftLive && (
          <div className="room__actions">
            <button
              className="button button--sm room__delete"
              onClick={() => setShowLeaveModal(true)}
            >
              Leave lobby
            </button>
          </div>
        )}
      </div>

      {/* Chat: right sidebar on desktop, bottom drawer on mobile. */}
      {isDesktop ? (
        <aside className="room__chat">
          <h2 className="room__chat-title">Chat</h2>
          <div className="room__chat-panel">
            <DraftChat
              lobbyId={id}
              status={lobby.status}
              completedAt={lobby.completed_at}
              picks={picks}
              teamsById={teamsById}
              playersById={playersById}
              members={members}
              onOpenPick={openPickInDraftRoom}
            />
          </div>
        </aside>
      ) : (
        <div
          className={`room-chatdrawer${chatView === 'open' ? ' is-open' : ''}${
            chatView === 'full' ? ' is-full' : ''
          }`}
        >
          <div className="room-chatdrawer__handle">
            <button
              className="room-chatdrawer__handle-label"
              onClick={() => setChatView((v) => (v === 'closed' ? 'open' : 'closed'))}
            >
              <ChatBubbleOutlineIcon fontSize="small" />
              <span>Chat</span>
              {!chatActive && chatUnread > 0 && (
                <span className="room-chatdrawer__badge">{chatUnread}</span>
              )}
            </button>
            <div className="room-chatdrawer__ctrls">
              {chatView !== 'full' && (
                <button
                  className="room-chatdrawer__ctrl"
                  aria-label={chatView === 'closed' ? 'Open chat' : 'Expand chat to full screen'}
                  onClick={() => setChatView((v) => (v === 'closed' ? 'open' : 'full'))}
                >
                  <KeyboardArrowUpIcon />
                </button>
              )}
              {chatView !== 'closed' && (
                <button
                  className="room-chatdrawer__ctrl"
                  aria-label="Close chat"
                  onClick={() => setChatView('closed')}
                >
                  <KeyboardArrowDownIcon />
                </button>
              )}
            </div>
          </div>
          <div className="room-chatdrawer__body">
            <DraftChat
              lobbyId={id}
              status={lobby.status}
              completedAt={lobby.completed_at}
              picks={picks}
              teamsById={teamsById}
              playersById={playersById}
              members={members}
              active={chatActive}
              onUnread={setChatUnread}
              onOpenPick={openPickInDraftRoom}
            />
          </div>
        </div>
      )}

      {showDeleteModal && (
        <ConfirmModal
          title="Delete this lobby?"
          confirmLabel="Delete lobby"
          busyLabel="Deleting…"
          busy={deleting}
          danger
          onConfirm={confirmDelete}
          onClose={() => setShowDeleteModal(false)}
        >
          This permanently deletes <strong>{lobby.name}</strong> and all of its teams and
          settings. This can’t be undone.
        </ConfirmModal>
      )}

      {showLeaveModal && (
        <ConfirmModal
          title="Leave this lobby?"
          confirmLabel="Leave lobby"
          busyLabel="Leaving…"
          busy={leaving}
          danger
          onConfirm={confirmLeave}
          onClose={() => setShowLeaveModal(false)}
        >
          You’ll give up your draft slot in <strong>{lobby.name}</strong>. You can rejoin
          later if a slot is still open.
        </ConfirmModal>
      )}

      {kickTarget && (
        <ConfirmModal
          title={`Remove ${kickTarget.name}?`}
          confirmLabel="Remove"
          busyLabel="Removing…"
          busy={kicking}
          danger
          onConfirm={confirmKick}
          onClose={() => setKickTarget(null)}
        >
          <strong>{kickTarget.name}</strong> will lose their draft slot and have to be
          re-invited to rejoin.
        </ConfirmModal>
      )}
    </main>
  );
}
