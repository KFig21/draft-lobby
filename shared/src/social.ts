import { z } from 'zod';

export const NOTIFICATION_TYPES = [
  'FRIEND_REQUEST',
  'FRIEND_ACCEPTED',
  'LOBBY_INVITE',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const FRIENDSHIP_STATUSES = ['PENDING', 'ACCEPTED'] as const;
export type FriendshipStatus = (typeof FRIENDSHIP_STATUSES)[number];

/** Send a friend request to another user. */
export const friendRequestSchema = z.object({ userId: z.string().uuid() });
export type FriendRequestInput = z.infer<typeof friendRequestSchema>;

/** Accept or decline an incoming friend request from `requesterId`. */
export const friendRespondSchema = z.object({
  requesterId: z.string().uuid(),
  accept: z.boolean(),
});
export type FriendRespondInput = z.infer<typeof friendRespondSchema>;

/** Remove an existing friend (either direction). */
export const removeFriendSchema = z.object({ userId: z.string().uuid() });
export type RemoveFriendInput = z.infer<typeof removeFriendSchema>;

/** Invite a user to a lobby. */
export const inviteToLobbySchema = z.object({ userId: z.string().uuid() });
export type InviteToLobbyInput = z.infer<typeof inviteToLobbySchema>;
