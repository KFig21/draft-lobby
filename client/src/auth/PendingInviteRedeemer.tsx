import { useEffect, useRef } from 'react';
import { useToast } from '../toast/ToastContext';
import {
  clearPendingInvite,
  getPendingInvite,
  redeemInvite,
} from '../lib/friendInvite';
import { useAuth } from './AuthContext';

/**
 * Redeems a friend-invite token that was stashed while the visitor was signed
 * out (see FriendInvitePage). Fires once the user is authenticated AND past
 * onboarding — so a brand-new user who arrived via an invite finishes setting
 * up their profile first, then lands friended with a confirming toast. Mounted
 * once, high in the tree, inside the auth + toast providers.
 */
export function PendingInviteRedeemer() {
  const { session, profileLoaded, profile } = useAuth();
  const { showToast } = useToast();
  const handled = useRef(false);

  useEffect(() => {
    if (!session || !profileLoaded) return;
    // Wait until onboarding is done (a fresh invite signup is mid-onboarding
    // with onboardedAt null); existing users are already onboarded.
    if (profile && !profile.onboardedAt) return;
    const token = getPendingInvite();
    if (!token || handled.current) return;
    handled.current = true;

    redeemInvite(token)
      .then((res) => {
        clearPendingInvite();
        if (res.self) return; // opened your own link — nothing to celebrate
        showToast({
          title: res.alreadyFriends
            ? `Already friends with ${res.inviter.username}`
            : `You're now friends with ${res.inviter.username}`,
          tone: 'success',
          avatar: res.inviter.avatar,
        });
      })
      .catch(() => {
        // Bad/expired token — drop it so we don't retry forever.
        clearPendingInvite();
      });
  }, [session, profileLoaded, profile, showToast]);

  return null;
}
