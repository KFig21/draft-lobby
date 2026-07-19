import {
  defaultAvatar,
  roundsForSettings,
  type Avatar as AvatarData,
} from '@draft-lobby/shared';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import { clockSummary } from '../../lib/format';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar/Avatar';
import { useAuth } from '../../auth/AuthContext';
import { useLobby } from '../../hooks/useLobby';
import { api } from '../../lib/api';
import { supabase } from '../../supabase';
import type { FriendshipRow, ProfileMini } from '../../lib/types';
import './LobbyRoomPage.scss';

export function LobbyRoomPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const { lobby, teams, members, loading, error, refetch } = useLobby(id);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [friends, setFriends] = useState<ProfileMini[]>([]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [orderMode, setOrderMode] = useState(false);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  const userId = session?.user.id;
  const isCommish = useMemo(() => {
    if (!userId) return false;
    if (lobby?.commissioner_id === userId) return true;
    return members.some(
      (m) => m.user_id === userId && m.role === 'SUB_COMMISSIONER',
    );
  }, [userId, lobby, members]);

  // Accepted friends + who's already been invited, for the invite section.
  const loadInvitables = useCallback(() => {
    if (!userId) return;
    void supabase
      .from('friendships')
      .select(
        'status, requester_id, addressee_id, requester:requester_id ( id, username, avatar ), addressee:addressee_id ( id, username, avatar )',
      )
      .eq('status', 'ACCEPTED')
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as FriendshipRow[];
        const list = rows
          .map((f) => (f.requester_id === userId ? f.addressee : f.requester))
          .filter((p): p is ProfileMini => !!p);
        setFriends(list);
      });
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

  const avatarFor = (ownerId: string | null): AvatarData => {
    if (!ownerId) return { bgColor: '#2e3347', shape: 'circle', emoji: '➕' };
    const member = members.find((m) => m.user_id === ownerId);
    return member?.profiles?.avatar ?? defaultAvatar(ownerId);
  };

  if (loading) return <div className="loading">Loading lobby…</div>;
  if (error || !lobby)
    return <div className="loading">{error ?? 'Lobby not found'}</div>;

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

  function startOrderEdit() {
    setOrderIds(teams.map((t) => t.id));
    setOrderMode(true);
    setActionError(null);
  }
  function moveTeam(index: number, dir: -1 | 1) {
    const next = [...orderIds];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setOrderIds(next);
  }
  function randomizeOrder() {
    const next = [...orderIds];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrderIds(next);
  }
  async function saveOrder() {
    setSavingOrder(true);
    setActionError(null);
    try {
      await api(`/lobbies/${id}/draft-order`, {
        method: 'POST',
        body: { teamIds: orderIds },
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
  const canSetOrder = isCommish && !draftLive && teams.length > 1;

  return (
    <main className="room">
      <header className="room__header">
        <Link to="/home" className="back-link">
          ← Home
        </Link>
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

      <section className="room__teams">
        <div className="room__teams-head">
          <h2>Draft order</h2>
          {canSetOrder && !orderMode && (
            <button type="button" className="room__order-btn" onClick={startOrderEdit}>
              Set draft order
            </button>
          )}
        </div>

        {orderMode ? (
          <>
            <ol className="team-list">
              {orderIds.map((tid, i) => {
                const team = teamById.get(tid);
                if (!team) return null;
                return (
                  <li key={tid} className="team-list__row">
                    <span className="team-list__pos">{i + 1}</span>
                    <Avatar avatar={avatarFor(team.owner_id)} size={32} />
                    <span className="team-list__name">{team.name}</span>
                    <div className="team-list__order-ctrls">
                      <button
                        type="button"
                        className="team-list__icon"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={() => moveTeam(i, -1)}
                      >
                        <ArrowUpwardIcon fontSize="small" />
                      </button>
                      <button
                        type="button"
                        className="team-list__icon"
                        aria-label="Move down"
                        disabled={i === orderIds.length - 1}
                        onClick={() => moveTeam(i, 1)}
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
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
          </>
        ) : (
          <ol className="team-list">
          {teams.map((team) => {
            const canEdit = team.owner_id === userId || isCommish;
            const editing = editingTeamId === team.id;
            return (
              <li key={team.id} className="team-list__row">
                <span className="team-list__pos">{team.draft_position}</span>
                <Avatar avatar={avatarFor(team.owner_id)} size={32} />
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
                    {team.is_prev_champion && (
                      <span title="Defending champion">👑</span>
                    )}
                    {team.owner_id === userId && (
                      <span className="team-list__you">you</span>
                    )}
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
                  </>
                )}
              </li>
            );
          })}
          {Array.from({ length: emptySlots }, (_, i) => (
            <li key={`empty-${i}`} className="team-list__row team-list__row--empty">
              <span className="team-list__pos">{filledSlots + i + 1}</span>
              <Avatar avatar={avatarFor(null)} size={32} />
              <span className="team-list__name muted">Open slot</span>
            </li>
          ))}
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

      <div className="room__actions">
        {draftLive ? (
          <Link className="button button--primary" to={`/lobby/${id}/draft`}>
            Go to draft board →
          </Link>
        ) : isCommish ? (
          <button
            className="button button--primary"
            onClick={startDraft}
            disabled={starting}
          >
            {starting ? 'Starting…' : 'Start draft'}
          </button>
        ) : (
          <p className="muted">Waiting for the commissioner to start the draft…</p>
        )}
      </div>
    </main>
  );
}

