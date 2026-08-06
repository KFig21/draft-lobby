import {
  SCORING_PRESETS,
  matchPreset,
  type Avatar,
  type DraftGrade,
  type LobbySettings,
} from '@draft-lobby/shared';
import { buildLineup, computePowerRankings, type LineupRow } from './powerRankings';
import { mostCommonGrade } from './draftGrade';
import { avatarForTeam } from './teamAvatar';
import type {
  DraftCrownVoteRow,
  DraftGradeRow,
  MemberRow,
  PickRow,
  PlayerRow,
  TeamRow,
} from './types';

/** A pick measured against the player's ADP — positive rounds = a value/steal. */
export interface PickValue {
  player: PlayerRow;
  round: number;
  adpRound: number;
  /** adpRound − round: how many rounds later than ADP the player was taken. */
  valueRounds: number;
}

export interface TeamGradeCard {
  team: TeamRow;
  avatar: Avatar;
  /** "@username", or a role label for ownerless seats. */
  ownerLabel: string;
  rank: number;
  starterPoints: number;
  grade: DraftGrade;
  /** Most common peer grade for this team (post-draft grading), if any. */
  peerGrade: DraftGrade | null;
  /** How many peers graded this team. */
  peerCount: number;
  /** Every peer grade left on this team (grade + optional comment + author). */
  peerGrades: { grade: DraftGrade; comment: string | null; author: string | null }[];
  crownVotes: number;
  /** Optimal starter slots in fixed order (empty slots have no player). */
  starters: LineupRow[];
  bestPick: PickValue | null;
  biggestReach: PickValue | null;
}

export interface LeagueGrade {
  lobbyName: string;
  season: number;
  teamCount: number;
  rounds: number;
  scoringLabel: string;
  draftTypeLabel: string;
  dateLabel: string;
  /** Teams in rank order (best draft first). */
  teams: TeamGradeCard[];
  championName: string;
  avgGrade: DraftGrade | null;
  topProjection: number;
  /** A–F bucket counts for the distribution bar. */
  distribution: { letter: string; count: number }[];
  leagueSteal: (PickValue & { team: TeamRow }) | null;
  leagueReach: (PickValue & { team: TeamRow }) | null;
}

function ownerLabelFor(team: TeamRow, members: MemberRow[]): string {
  if (team.is_bot) return 'Autodraft';
  if (team.is_standin) return 'Stand-in';
  const member = members.find((m) => m.user_id === team.owner_id);
  const username = member?.profiles?.username;
  return username ? `@${username}` : 'Open seat';
}

/** Best value pick + biggest reach among a team's own picks, measured vs ADP.
 * Keepers are excluded — they weren't a draft-day decision at that slot. */
function pickValues(
  picks: PickRow[],
  playersById: Map<string, PlayerRow>,
  teamCount: number,
  teamId?: string,
): { best: (PickValue & { team_id: string }) | null; reach: (PickValue & { team_id: string }) | null } {
  let best: (PickValue & { team_id: string; raw: number }) | null = null;
  let reach: (PickValue & { team_id: string; raw: number }) | null = null;
  for (const pick of picks) {
    if (pick.is_keeper) continue;
    if (teamId && pick.team_id !== teamId) continue;
    const player = playersById.get(pick.player_id);
    if (!player || player.adp == null) continue;
    const raw = player.adp - pick.overall; // + = taken later than ADP (value)
    const entry: PickValue & { team_id: string; raw: number } = {
      player,
      round: pick.round,
      adpRound: Math.max(1, Math.ceil(player.adp / teamCount)),
      valueRounds: Math.max(1, Math.ceil(player.adp / teamCount)) - pick.round,
      team_id: pick.team_id,
      raw,
    };
    if (!best || raw > best.raw) best = entry;
    if (!reach || raw < reach.raw) reach = entry;
  }
  const strip = (e: typeof best) =>
    e ? { player: e.player, round: e.round, adpRound: e.adpRound, valueRounds: e.valueRounds, team_id: e.team_id } : null;
  return { best: strip(best), reach: strip(reach) };
}

/** Assemble everything the grade-export cards render, from the same live data
 * (and the same power-ranking math) the results panel already uses. */
export function buildLeagueGrade(opts: {
  lobbyName: string;
  season: number;
  teams: TeamRow[];
  members: MemberRow[];
  picks: PickRow[];
  playersById: Map<string, PlayerRow>;
  settings: LobbySettings;
  crownVotes: DraftCrownVoteRow[];
  grades: DraftGradeRow[];
}): LeagueGrade {
  const { lobbyName, season, teams, members, picks, playersById, settings, crownVotes, grades } = opts;
  const teamCount = settings.teamCount;
  const rounds = settings.rosterComposition.reduce((sum, rc) => sum + rc.count, 0);
  const preset = matchPreset(settings.scoring);
  const scoringLabel = preset ? SCORING_PRESETS[preset].label : 'Custom scoring';
  const draftTypeLabel = settings.draftType === 'SNAKE' ? 'Snake' : 'Straight';

  const rankings = computePowerRankings(teams, picks, playersById, settings);

  const teamCards: TeamGradeCard[] = rankings.map((r) => {
    const teamGrades = grades.filter((g) => g.team_id === r.team.id);
    const { best, reach } = pickValues(picks, playersById, teamCount, r.team.id);
    // Comment-bearing grades first, so the export headlines the ones with something to say.
    const peerGrades = [...teamGrades]
      .sort((a, b) => (b.comment?.trim() ? 1 : 0) - (a.comment?.trim() ? 1 : 0))
      .map((g) => ({
        grade: g.grade,
        comment: g.comment && g.comment.trim() ? g.comment.trim() : null,
        author: members.find((m) => m.user_id === g.rater_id)?.profiles?.username ?? null,
      }));
    return {
      team: r.team,
      avatar: avatarForTeam(r.team, members),
      ownerLabel: ownerLabelFor(r.team, members),
      rank: r.rank,
      starterPoints: r.starterPoints,
      grade: r.grade,
      peerGrade: mostCommonGrade(teamGrades),
      peerCount: teamGrades.length,
      peerGrades,
      crownVotes: crownVotes.filter((v) => v.team_id === r.team.id).length,
      starters: buildLineup(r.team.id, picks, playersById, settings).starters,
      bestPick: best,
      biggestReach: reach,
    };
  });

  // League-wide steal / reach across every team's picks.
  const { best: leagueBest, reach: leagueReach } = pickValues(picks, playersById, teamCount);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const withTeam = (e: (PickValue & { team_id: string }) | null) => {
    if (!e) return null;
    const team = teamById.get(e.team_id);
    return team ? { player: e.player, round: e.round, adpRound: e.adpRound, valueRounds: e.valueRounds, team } : null;
  };

  const letters = ['A', 'B', 'C', 'D', 'F'];
  const distribution = letters.map((letter) => ({
    letter,
    count: teamCards.filter((t) => t.grade[0] === letter).length,
  }));

  return {
    lobbyName,
    season,
    teamCount,
    rounds,
    scoringLabel,
    draftTypeLabel,
    dateLabel: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    teams: teamCards,
    championName: teamCards[0]?.team.name ?? '',
    avgGrade: mostCommonGrade(teamCards.map((t) => ({ grade: t.grade }))),
    topProjection: teamCards[0]?.starterPoints ?? 0,
    distribution,
    leagueSteal: withTeam(leagueBest),
    leagueReach: withTeam(leagueReach),
  };
}
