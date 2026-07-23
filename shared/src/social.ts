import { z } from 'zod';

export const NOTIFICATION_TYPES = [
  'FRIEND_REQUEST',
  'FRIEND_ACCEPTED',
  'LOBBY_INVITE',
  'PICK_REACTION',
  'MESSAGE_REACTION',
  'PICK_REPLY',
  'MENTION',
  'DRAFT_GRADE',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Notification target for the pick/message/team-scoped types (for grouping). */
export const NOTIFICATION_TARGET_TYPES = ['PICK', 'MESSAGE', 'TEAM'] as const;
export type NotificationTargetType = (typeof NOTIFICATION_TARGET_TYPES)[number];

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

// ── Draft-room chat ─────────────────────────────────────────────────
export const CHAT_TARGET_TYPES = ['MESSAGE', 'PICK'] as const;
export type ChatTargetType = (typeof CHAT_TARGET_TYPES)[number];

/** Post a chat message in the draft room. */
export const postChatSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});
export type PostChatInput = z.infer<typeof postChatSchema>;

/** Comment on a specific pick — posts to chat as a reply to that pick. */
export const pickCommentSchema = z.object({
  pickId: z.string().uuid(),
  body: z.string().trim().min(1).max(1000),
});
export type PickCommentInput = z.infer<typeof pickCommentSchema>;

/** Toggle an emoji reaction on a chat message or a pick. */
export const chatReactSchema = z.object({
  targetType: z.enum(CHAT_TARGET_TYPES),
  targetId: z.string().uuid(),
  emoji: z.enum(REACTION_EMOJIS),
});
export type ChatReactInput = z.infer<typeof chatReactSchema>;

/** How long after a draft ends the chat locks (matches REACTION_LOCK_MS). */
export const CHAT_LOCK_MS = 24 * 60 * 60 * 1000;

/** How long after a draft ends emoji reactions (on picks and messages) lock. */
export const REACTION_LOCK_MS = 24 * 60 * 60 * 1000;

/** How long after a draft ends the commissioner can still roll back picks. */
export const ROLLBACK_LOCK_MS = 5 * 60 * 1000;

// ── Post-draft results: crown vote + peer grades ─────────────────────
/** Letter-grade scale for both the auto-computed grade and peer grades. */
export const DRAFT_GRADES = [
  'A+', 'A', 'A-',
  'B+', 'B', 'B-',
  'C+', 'C', 'C-',
  'D+', 'D', 'D-',
  'F',
] as const;
export type DraftGrade = (typeof DRAFT_GRADES)[number];

/** Consistent color coding for grade badges, used across the UI — a
 * green-to-red gradient by letter, +/- variants share their letter's color. */
export const DRAFT_GRADE_COLORS: Record<DraftGrade, string> = {
  'A+': '#3fd6a5',
  A: '#3fd6a5',
  'A-': '#3fd6a5',
  'B+': '#8bd23f',
  B: '#8bd23f',
  'B-': '#8bd23f',
  'C+': '#f6a642',
  C: '#f6a642',
  'C-': '#f6a642',
  'D+': '#f2793a',
  D: '#f2793a',
  'D-': '#f2793a',
  F: '#f8577d',
};

/** Cast (or change) your vote for which OTHER team had the best draft. */
export const crownVoteSchema = z.object({
  teamId: z.string().uuid(),
});
export type CrownVoteInput = z.infer<typeof crownVoteSchema>;

/** Leave (or update) a grade + short comment on an OTHER team's roster. */
export const gradeTeamSchema = z.object({
  teamId: z.string().uuid(),
  grade: z.enum(DRAFT_GRADES),
  comment: z.string().trim().min(1).max(140),
});
export type GradeTeamInput = z.infer<typeof gradeTeamSchema>;

/** How long after a draft ends the crown vote / peer grading stays open. */
export const DRAFT_RESULTS_LOCK_MS = 24 * 60 * 60 * 1000;

/** Keep usernames short enough to fit in the draft board's team columns,
 * chat author names, etc. without truncation looking cramped. */
export const USERNAME_MIN_LEN = 3;
export const USERNAME_MAX_LEN = 20;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Usernames referenced via "@username" in a message body. Matches are
 * case-insensitive and exact — `@Kevin` won't match a candidate `Kevin2`
 * because of the trailing word-boundary lookahead.
 */
export function extractMentionedUsernames(
  body: string,
  candidateUsernames: string[],
): string[] {
  return candidateUsernames.filter((uname) => {
    const re = new RegExp(`@${escapeRegExp(uname)}(?![\\w])`, 'i');
    return re.test(body);
  });
}
