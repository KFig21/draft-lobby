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

// ── Activity feed ───────────────────────────────────────────────────
export const ACTIVITY_TYPES = [
  'DRAFT_COMPLETED',
  'FRIEND_ACCEPTED',
  'OPEN_LOBBY_CREATED',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Emoji reactions available on feed items. */
export const REACTION_EMOJIS = ['❤️', '😂', '🤮', '😡', '🏆', '🐐', '🍻', '🗑️'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Toggle a reaction on a feed item. */
export const reactSchema = z.object({
  emoji: z.enum(REACTION_EMOJIS),
});
export type ReactInput = z.infer<typeof reactSchema>;
