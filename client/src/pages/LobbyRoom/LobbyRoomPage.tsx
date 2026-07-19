import {
  defaultAvatar,
  roundsForSettings,
  type Avatar as AvatarData,
} from '@draft-lobby/shared';
import { clockSummary } from '../../lib/format';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar/Avatar';
import { useAuth } from '../../auth/AuthContext';
import { useLobby } from '../../hooks/useLobby';
import { api } from '../../lib/api';
import './LobbyRoomPage.scss';

export function LobbyRoomPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const { lobby, teams, members, loading, error } = useLobby(id);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const userId = session?.user.id;
  const isCommish = useMemo(() => {
    if (!userId) return false;
    if (lobby?.commissioner_id === userId) return true;
    return members.some(
      (m) => m.user_id === userId && m.role === 'SUB_COMMISSIONER',
    );
  }, [userId, lobby, members]);

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

  const draftLive = lobby.status === 'DRAFTING' || lobby.status === 'COMPLETE';

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
        <h2>Draft order</h2>
        <ol className="team-list">
          {teams.map((team) => (
            <li key={team.id} className="team-list__row">
              <span className="team-list__pos">{team.draft_position}</span>
              <Avatar avatar={avatarFor(team.owner_id)} size={32} />
              <span className="team-list__name">{team.name}</span>
              {team.is_prev_champion && <span title="Defending champion">👑</span>}
              {team.owner_id === userId && (
                <span className="team-list__you">you</span>
              )}
            </li>
          ))}
          {Array.from({ length: emptySlots }, (_, i) => (
            <li key={`empty-${i}`} className="team-list__row team-list__row--empty">
              <span className="team-list__pos">{filledSlots + i + 1}</span>
              <Avatar avatar={avatarFor(null)} size={32} />
              <span className="team-list__name muted">Open slot</span>
            </li>
          ))}
        </ol>
      </section>

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

