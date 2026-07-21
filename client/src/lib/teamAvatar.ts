import { defaultAvatar, type Avatar as AvatarData } from '@draft-lobby/shared';
import type { MemberRow, TeamRow } from './types';

// Vivid palette so each bot gets its own (stable) avatar colour — shared so a
// bot's avatar looks the same in the lobby and on the draft board.
const BOT_COLORS = [
  '#f8577d', '#f6a642', '#3fd6a5', '#6c5ce7', '#4aa8ff', '#e056fd',
  '#ff7675', '#00b894', '#fd79a8', '#a29bfe', '#fdcb6e', '#55efc4',
];

export function botAvatar(teamId: string): AvatarData {
  let h = 0;
  for (let i = 0; i < teamId.length; i++) h = (h * 31 + teamId.charCodeAt(i)) >>> 0;
  return { bgColor: BOT_COLORS[h % BOT_COLORS.length], shape: 'circle', emoji: '🤖' };
}

/** The avatar to show for a team: the owner's profile avatar, a bot avatar, or a fallback. */
export function avatarForTeam(team: TeamRow, members: MemberRow[]): AvatarData {
  if (team.is_bot) return botAvatar(team.id);
  const member = members.find((m) => m.user_id === team.owner_id);
  return member?.profiles?.avatar ?? defaultAvatar(team.owner_id ?? team.id);
}
