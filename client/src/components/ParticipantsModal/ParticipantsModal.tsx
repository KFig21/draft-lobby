import { defaultAvatar, type Avatar as AvatarData } from '@draft-lobby/shared';
import CheckIcon from '@mui/icons-material/Check';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { supabase } from '../../supabase';
import { Avatar } from '../Avatar/Avatar';
import { Modal } from '../Modal/Modal';
import { ProfileLink } from '../ProfileLink/ProfileLink';
import './ParticipantsModal.scss';

/** One human participant to list — a lobby member (bots/ownerless seats excluded
 * by the caller). */
export interface Participant {
  id: string;
  username: string | null;
  avatar: AvatarData | null;
}

type Relation = 'none' | 'friends' | 'incoming' | 'outgoing';

/**
 * The people in a draft — view their profiles and send/accept friend requests
 * without leaving the lobby. Self-contained: it loads its own friendship
 * relations for the given participants and posts to the shared /friends routes,
 * so it drops into both the lobby room and the draft room.
 */
export function ParticipantsModal({
  participants,
  onClose,
}: {
  participants: Participant[];
  onClose: () => void;
}) {
  const { session } = useAuth();
  const me = session?.user.id ?? '';

  // Everyone but yourself, de-duped (a person can't friend themselves, and the
  // same user never appears twice).
  const others = useMemo(() => {
    const seen = new Set<string>();
    return participants.filter((p) => p.id && p.id !== me && !seen.has(p.id) && seen.add(p.id));
  }, [participants, me]);

  const [relations, setRelations] = useState<Map<string, Relation>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const idKey = others.map((p) => p.id).join(',');
  useEffect(() => {
    if (!me || others.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id, status')
        .or(
          `and(requester_id.eq.${me},addressee_id.in.(${idKey})),and(addressee_id.eq.${me},requester_id.in.(${idKey}))`,
        );
      if (cancelled) return;
      const map = new Map<string, Relation>();
      for (const f of (data ?? []) as {
        requester_id: string;
        addressee_id: string;
        status: string;
      }[]) {
        const iAmRequester = f.requester_id === me;
        const other = iAmRequester ? f.addressee_id : f.requester_id;
        map.set(other, f.status === 'ACCEPTED' ? 'friends' : iAmRequester ? 'outgoing' : 'incoming');
      }
      setRelations(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [me, idKey]);

  async function act(path: string, body: unknown, targetId: string, next: Relation) {
    setBusyId(targetId);
    setError(null);
    try {
      await api(`/friends/${path}`, { method: 'POST', body });
      setRelations((prev) => new Map(prev).set(targetId, next));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal title="Participants" icon={<GroupsOutlinedIcon fontSize="small" />} onClose={onClose}>
      <div className="participants">
        {others.length === 0 ? (
          <p className="muted participants__empty">No other participants have joined yet.</p>
        ) : (
          <ul className="participants__list">
            {others.map((p) => {
              const rel = relations.get(p.id) ?? 'none';
              const busy = busyId === p.id;
              return (
                <li key={p.id} className="participants__row">
                  <ProfileLink userId={p.id}>
                    <Avatar avatar={p.avatar ?? defaultAvatar(p.id)} size={36} />
                  </ProfileLink>
                  <ProfileLink userId={p.id} className="participants__name">
                    {p.username ?? 'Player'}
                  </ProfileLink>
                  {rel === 'friends' && (
                    <span className="participants__friends">
                      <CheckIcon fontSize="inherit" /> Friends
                    </span>
                  )}
                  {rel === 'outgoing' && <span className="muted participants__pending">Requested</span>}
                  {rel === 'incoming' && (
                    <button
                      type="button"
                      className="button button--primary participants__btn"
                      disabled={busy}
                      onClick={() => act('respond', { requesterId: p.id, accept: true }, p.id, 'friends')}
                    >
                      Accept
                    </button>
                  )}
                  {rel === 'none' && (
                    <button
                      type="button"
                      className="button participants__btn"
                      disabled={busy}
                      onClick={() => act('request', { userId: p.id }, p.id, 'outgoing')}
                    >
                      <PersonAddAlt1Icon fontSize="small" /> Add
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {error && <p className="participants__error">{error}</p>}
      </div>
    </Modal>
  );
}
