import type {
  Avatar,
  DraftGrade,
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
  /** Fantasy season this draft is for (e.g. 2026) — see migration 0040. */
  season: number;
  current_overall: number;
  pick_deadline: string | null;
  pick_deadline_remaining_ms: number | null;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
  results_public: boolean;
  chat_public: boolean;
  public_voting_allowed: boolean;
  // Live spectating (migration 0047): master read toggle + write sub-toggles.
  spectate_public: boolean;
  spectate_react: boolean;
  spectate_grade: boolean;
  chat_lock_ms: number;
  team_names_locked: boolean;
  keepers_locked: boolean;
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
  /** Ownerless seat the commissioner drafts for in-person (no account). Unlike
   * a bot it's human-like on the clock (skippable, not AI-auto-drafted). */
  is_standin: boolean;
  /** Set when this seat is reserved for a specific (not-yet-joined) user — they
   * claim it on join. Null once owned or if never reserved. */
  reserved_for_user_id: string | null;
  /** How many keepers this team may select (owner-choice flow). Default 1. */
  keeper_count: number;
  /** Times this team's pick clock has expired (been skipped). Skip-on-timeout. */
  timeouts: number;
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

/** A candidate a team may keep (owner-choice flow) — mirrored by an is_keeper
 * pick while `selected`. */
export interface KeeperOptionRow {
  id: string;
  lobby_id: string;
  team_id: string;
  player_id: string;
  round: number;
  selected: boolean;
  is_default: boolean;
}

/** A vote for which OTHER team had the best draft (one per voter per lobby). */
export interface DraftCrownVoteRow {
  lobby_id: string;
  voter_id: string;
  team_id: string;
  created_at: string;
}

/** A letter grade + short comment left on an OTHER team's roster. */
export interface DraftGradeRow {
  lobby_id: string;
  rater_id: string;
  team_id: string;
  grade: DraftGrade;
  comment: string;
  created_at: string;
  updated_at: string;
}

/** A like (+1) or dislike (-1) on one peer grade, identified by the graded
 * team + the leaguemate who authored that grade. One row per reactor. */
export interface DraftGradeReactionRow {
  lobby_id: string;
  team_id: string;
  grade_rater_id: string;
  reactor_id: string;
  value: number;
  created_at: string;
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
  /** For RULESET_SHARE: the shared_rulesets row to import (name is in snippet). */
  shared_ruleset_id: string | null;
  count: number;
  snippet: string | null;
  emoji: string | null;
  grade: string | null;
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
  proj_rank: number | null;
  proj_stat_line: string | null;
  proj_stats: Record<string, number> | null;
  adp: number | null;
  /** League-aware value (points over positional replacement) + its overall rank
   * (1 = best value in this league's roster/scoring). Attached client-side by
   * scorePlayers, not persisted — absent on the raw pool until it's scored. */
  value?: number | null;
  value_rank?: number | null;
  prev_points: number | null;
  prev_rank: number | null;
  prev_stat_line: string | null;
  prev_stats: Record<string, number> | null;
}

/** One player's actuals for a single week of a completed season — the data
 * behind the deep-stats modal (see the player_week_stats table). `stats` is the
 * raw FOOTBALL_CATALOG line (null for K), so each week can be scored under any
 * league's rules; pts_ppr/pos_rank_ppr are the Sleeper fallbacks. */
export interface PlayerWeekStatRow {
  player_id: string;
  position: PlayerRow['position'];
  season: number;
  week: number;
  opp: string | null;
  stats: Record<string, number> | null;
  pts_ppr: number | null;
  pos_rank_ppr: number | null;
  /** A synthesized bye-week row (no stats/points) — lets the deep-stats modal
   * show a real bye vs. a DNP (a week with no row at all). */
  is_bye: boolean;
}
