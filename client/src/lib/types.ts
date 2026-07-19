import type { Avatar, LobbySettings, LobbyStatus, LobbyRole } from '@draft-lobby/shared';

/** DB row shapes as returned by Supabase (snake_case columns). */

export interface LobbyRow {
  id: string;
  name: string;
  commissioner_id: string;
  settings: LobbySettings;
  status: LobbyStatus;
  current_overall: number;
  pick_deadline: string | null;
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
