import type { Avatar as AvatarData } from '@draft-lobby/shared';
import { api } from './api';

export interface InviterMini {
  id: string;
  username: string;
  avatar: AvatarData | null;
}

/** The current user's shareable invite link token (minted on first call). */
export async function getMyInviteToken(): Promise<string> {
  const { token } = await api<{ token: string }>('/friends/invite', { method: 'POST' });
  return token;
}

/** Revoke the current link and mint a fresh one. */
export async function resetMyInviteToken(): Promise<string> {
  const { token } = await api<{ token: string }>('/friends/invite/reset', { method: 'POST' });
  return token;
}

/** Public — resolve whose invite a token belongs to (works signed out). */
export async function fetchInviteInfo(token: string): Promise<InviterMini> {
  const { inviter } = await api<{ inviter: InviterMini }>(
    `/friends/invite/${encodeURIComponent(token)}`,
  );
  return inviter;
}

export interface RedeemResult {
  ok: boolean;
  inviter: InviterMini;
  /** Opened your own link. */
  self?: boolean;
  /** Already friends before redeeming. */
  alreadyFriends?: boolean;
}

/** Accept an invite as the signed-in user — creates an instant friendship. */
export async function redeemInvite(token: string): Promise<RedeemResult> {
  return api<RedeemResult>(`/friends/invite/${encodeURIComponent(token)}/redeem`, {
    method: 'POST',
  });
}

/** Turn a token into the full shareable URL. */
export function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

// ── Pending-invite handoff across signup ────────────────────────────
// A signed-out visitor who opens an invite link has the token stashed here, so
// it survives the whole sign-up → email-verify → onboarding journey (localStorage
// outlives the Supabase redirect) and is redeemed once they're authenticated.
const PENDING_KEY = 'pendingFriendInvite';

export function setPendingInvite(token: string): void {
  try {
    localStorage.setItem(PENDING_KEY, token);
  } catch {
    // Ignore — a blocked localStorage just means no cross-signup handoff.
  }
}

export function getPendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Ignore.
  }
}
