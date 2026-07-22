import type {
  Avatar,
  FriendshipStatus,
  LobbySettings,
  LobbyStatus,
  LobbyRole,
  NotificationTargetType,
  NotificationType,
} from '@draft-lobby/shared';

/** DB row shapes as returned by Supabase (snake_case columns). */

export interface LobbyRow {
  id: string;
  name: string;
  commissioner_id: string;
  settings: LobbySettings;
  status: LobbyStatus;
  current_overall: number;
  pick_deadline: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ChatMessageRow {
  id: string;
  lobby_id: string;
  user_id: string;
  body: string;
  kind: 'USER' | 'SYSTEM';
  reply_to_pick_id: string | null;
  created_at: string;
}

export interface ChatReactionRow {
  id: string;
  lobby_id: string;
  target_type: 'MESSAGE' | 'PICK';
  target_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface TeamRow {
  id: string;
  lobby_id: string;
  owner_id: string | null;
  name: string;
  draft_position: number;
  color: string;
  is_prev_champion: boolean;
  is_bot: boolean;
  auto_draft: boolean;
}

export interface MemberRow {
  user_id: string;
  role: LobbyRole;
  profiles: { username: string; avatar: Avatar | null } | null;
}

export interface PickRow {
  id: string;
  lobby_id: string;
  overall: number;
  round: number;
  team_id: string;
  player_id: string;
  is_keeper: boolean;
  is_auto_pick: boolean;
  picked_at: string;
}

/** Minimal profile shape as embedded in social queries. */
export interface ProfileMini {
  id: string;
  username: string;
  avatar: Avatar | null;
}

export interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  requester?: ProfileMini | null;
  addressee?: ProfileMini | null;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  lobby_id: string | null;
  lobby_name: string | null;
  target_type: NotificationTargetType | null;
  target_id: string | null;
  count: number;
  snippet: string | null;
  read: boolean;
  status: 'ACCEPTED' | 'DECLINED' | null;
  created_at: string;
  actor?: ProfileMini | null;
}

export interface PlayerRow {
  id: string;
  name: string;
  position: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
  nfl_team: string;
  bye_week: number | null;
  injury_status: string;
  proj_points: number | null;
  adp: number | null;
  prev_points: number | null;
  prev_rank: number | null;
}
