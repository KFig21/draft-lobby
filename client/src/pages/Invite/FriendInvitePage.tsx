import { defaultAvatar } from '@draft-lobby/shared';
import CheckIcon from '@mui/icons-material/Check';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/Avatar/Avatar';
import { Loader } from '../../components/Loader/Loader';
import {
  fetchInviteInfo,
  redeemInvite,
  setPendingInvite,
  type InviterMini,
} from '../../lib/friendInvite';
import './FriendInvitePage.scss';

type RedeemState = 'idle' | 'working' | 'done' | 'error';

export function FriendInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loadingInfo, setLoadingInfo] = useState(true);
  const [inviter, setInviter] = useState<InviterMini | null>(null);
  const [redeem, setRedeem] = useState<RedeemState>('idle');
  const [alreadyFriends, setAlreadyFriends] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoadingInfo(true);
    fetchInviteInfo(token)
      .then(setInviter)
      .catch(() => setInviter(null))
      .finally(() => setLoadingInfo(false));
  }, [token]);

  async function accept() {
    if (!token) return;
    setRedeem('working');
    setError(null);
    try {
      const res = await redeemInvite(token);
      setAlreadyFriends(!!res.alreadyFriends);
      setInviter(res.inviter);
      setRedeem('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept the invite');
      setRedeem('error');
    }
  }

  /** Signed-out: stash the token so it's redeemed once they authenticate, then
   * head to the auth page (sign up or sign in). */
  function goAuth(mode: 'signup' | 'signin') {
    if (token) setPendingInvite(token);
    navigate(`/auth?mode=${mode}`);
  }

  const avatar = inviter ? inviter.avatar ?? defaultAvatar(inviter.id) : null;

  return (
    <main className="invite">
      <div className="invite__card">
        {loadingInfo || authLoading ? (
          <Loader />
        ) : !inviter ? (
          <>
            <h1>Invite not found</h1>
            <p className="invite__lead">This invite link is invalid or has expired.</p>
            <Link className="button button--primary" to="/home">
              Go to Draft Lobby
            </Link>
          </>
        ) : redeem === 'done' ? (
          <>
            <div className="invite__avatar">
              <Avatar avatar={avatar!} size={88} />
              <span className="invite__check">
                <CheckIcon fontSize="small" />
              </span>
            </div>
            <h1>
              {alreadyFriends ? "You're already friends" : "You're connected!"}
            </h1>
            <p className="invite__lead">
              You and <strong>{inviter.username}</strong>{' '}
              {alreadyFriends ? 'are friends on Draft Lobby.' : 'are now friends.'}
            </p>
            <div className="invite__actions">
              <button
                className="button button--primary"
                onClick={() => navigate(`/profile/${inviter.id}`)}
              >
                View {inviter.username}'s profile
              </button>
              <Link className="button" to="/home">
                Go home
              </Link>
            </div>
          </>
        ) : session ? (
          // Signed in — one tap to connect.
          <>
            <div className="invite__avatar">
              <Avatar avatar={avatar!} size={88} />
            </div>
            <h1>
              <strong>{inviter.username}</strong> invited you to connect
            </h1>
            <p className="invite__lead">Add them as a friend on Draft Lobby.</p>
            {error && <p className="invite__error">{error}</p>}
            <button
              className="button button--primary invite__cta"
              onClick={accept}
              disabled={redeem === 'working'}
            >
              <PersonAddAlt1Icon fontSize="small" />{' '}
              {redeem === 'working' ? 'Connecting…' : 'Accept friend invite'}
            </button>
          </>
        ) : (
          // Signed out — sign up (or in) to connect. Token is stashed first.
          <>
            <div className="invite__avatar">
              <Avatar avatar={avatar!} size={88} />
            </div>
            <h1>
              <strong>{inviter.username}</strong> wants to connect
            </h1>
            <p className="invite__lead">
              Join Draft Lobby — fantasy draft lobbies, live boards and rankings — and
              you'll land already friended with {inviter.username}.
            </p>
            <div className="invite__actions">
              <button className="button button--primary" onClick={() => goAuth('signup')}>
                Create account &amp; connect
              </button>
              <button className="invite__switch" onClick={() => goAuth('signin')}>
                Already have an account? Sign in
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
