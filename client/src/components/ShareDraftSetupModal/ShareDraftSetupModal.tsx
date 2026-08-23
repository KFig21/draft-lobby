import { defaultAvatar } from '@draft-lobby/shared';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { shareDraftSetup } from '../../lib/lobbyShare';
import { supabase } from '../../supabase';
import type { ProfileMini } from '../../lib/types';
import { Avatar } from '../Avatar/Avatar';
import { Loader } from '../Loader/Loader';
import { Modal } from '../Modal/Modal';
import './ShareDraftSetupModal.scss';

interface Props {
  /** The draft whose setup is being shared — only id + name are read. */
  source: { id: string; name: string };
  onClose: () => void;
}

interface FriendJoin {
  requester_id: string;
  addressee_id: string;
  requester: ProfileMini | null;
  addressee: ProfileMini | null;
}

/**
 * Share a draft's full setup — settings, teams, AND keepers — to a friend, so
 * they can spin up a lobby pre-loaded with it (see /lobbies/:id/share-setup →
 * shared_rulesets DRAFT_SETUP). Also offers a copy-link for anyone.
 */
export function ShareDraftSetupModal({ source, onClose }: Props) {
  const { session } = useAuth();
  const me = session?.user.id ?? '';

  const [friends, setFriends] = useState<ProfileMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [linkState, setLinkState] = useState<'idle' | 'working' | 'copied'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    // Hold the loader for at least ~0.5s even if the query returns instantly —
    // otherwise the empty state flashes for a frame before the list, which reads
    // as a jarring flicker + height jump.
    const started = Date.now();
    void supabase
      .from('friendships')
      .select(
        'requester_id, addressee_id, requester:requester_id ( id, username, avatar ), addressee:addressee_id ( id, username, avatar )',
      )
      .eq('status', 'ACCEPTED')
      // Cap the picker — never pull thousands of friends into a send list.
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        const list = ((data ?? []) as unknown as FriendJoin[])
          .map((f) => (f.requester_id === me ? f.addressee : f.requester))
          .filter((p): p is ProfileMini => !!p);
        const wait = Math.max(0, 500 - (Date.now() - started));
        setTimeout(() => {
          setFriends(list);
          setLoading(false);
        }, wait);
      });
  }, [me]);

  async function copyLink() {
    setLinkState('working');
    setError(null);
    try {
      const id = await shareDraftSetup(source.id);
      const url = `${window.location.origin}/import/ruleset/${id}`;
      await navigator.clipboard.writeText(url);
      setLinkState('copied');
      setTimeout(() => setLinkState('idle'), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create link');
      setLinkState('idle');
    }
  }

  async function sendTo(friend: ProfileMini) {
    setSendingId(friend.id);
    setError(null);
    try {
      await shareDraftSetup(source.id, friend.id);
      setSentIds((prev) => new Set(prev).add(friend.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSendingId(null);
    }
  }

  return (
    <Modal title="Share draft setup" onClose={onClose} icon={<ContentCopyIcon fontSize="small" />}>
      <div className="share-setup">
        <p className="muted share-setup__lead">
          Sends this draft's whole setup — teams, scoring, and keepers — so they can
          create a lobby pre-loaded with it, no re-entering keepers by hand.
        </p>

        <button
          type="button"
          className="button button--primary share-setup__link"
          onClick={copyLink}
          disabled={linkState === 'working'}
        >
          {linkState === 'copied' ? (
            <>
              <CheckIcon fontSize="small" /> Link copied
            </>
          ) : (
            <>
              <ContentCopyIcon fontSize="small" />{' '}
              {linkState === 'working' ? 'Creating…' : 'Copy share link'}
            </>
          )}
        </button>

        {error && <p className="share-setup__error">{error}</p>}

        <div className="share-setup__friends-head">Send to a friend</div>
        <div className="share-setup__friends-region">
          {loading ? (
            <div className="share-setup__loading">
              <Loader label="Loading friends…" />
            </div>
          ) : friends.length === 0 ? (
            <p className="muted share-setup__empty">No friends yet — copy the link instead.</p>
          ) : (
            <div className="share-setup__friends">
              {friends.map((f) => {
              const wasSent = sentIds.has(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className="share-setup__friend"
                  onClick={() => sendTo(f)}
                  disabled={wasSent || sendingId === f.id}
                >
                  <Avatar avatar={f.avatar ?? defaultAvatar(f.id)} size={24} />
                  <span className="share-setup__friend-name">{f.username}</span>
                  {wasSent ? (
                    <span className="share-setup__friend-sent">
                      <CheckIcon fontSize="inherit" /> Sent
                    </span>
                  ) : (
                    <span className="muted share-setup__friend-cta">
                      {sendingId === f.id ? 'Sending…' : 'Send'}
                    </span>
                  )}
                </button>
              );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
