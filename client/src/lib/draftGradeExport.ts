import {
  ROSTER_SLOTS,
  SCORING_PRESETS,
  matchPreset,
  type Avatar,
  type DraftGrade,
  type LobbySettings,
  type RosterSlot,
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
  /** round − adpRound: how many rounds later than ADP the player was taken
   * (+ = a value/steal, − = a reach). */
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

/** The worst-hit team(s) for a single bye week — used for the league-summary
 * "worst bye weeks" chart. Ties keep every team sharing the peak. */
export interface WeekByeClash {
  week: number;
  /** Most players any single team has on bye this week. */
  count: number;
  /** The team(s) tied for that most-on-bye count this week. */
  teams: { team: TeamRow; avatar: Avatar }[];
}

/** A team's projected-points strength at one position, ranked league-wide. */
export interface PositionStat {
  total: number;
  /** 1 = the most projected points at this position in the league. */
  rank: number;
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
  avgProjection: number;
  lowProjection: number;
  topProjName: string;
  lowProjName: string;
  /** A–F bucket counts for the distribution bar. */
  distribution: { letter: string; count: number }[];
  leagueSteal: (PickValue & { team: TeamRow }) | null;
  leagueReach: (PickValue & { team: TeamRow }) | null;
  /** Worst-hit team(s) per bye week, ordered by week. */
  byeClashes: WeekByeClash[];
  /** Starter slots this league uses (QB/RB/WR/TE/FLEX/OP/K/DEF…), canonical order. */
  slots: RosterSlot[];
  /** Per team id → per starter slot → projected-points total + league rank. */
  slotStats: Map<string, Map<RosterSlot, PositionStat>>;
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
    // + = the actual pick number is LATER than ADP → drafted at a discount
    // (a value/steal); − = taken EARLIER than ADP (a reach).
    const raw = pick.overall - player.adp;
    const adpRound = Math.max(1, Math.ceil(player.adp / teamCount));
    const entry: PickValue & { team_id: string; raw: number } = {
      player,
      round: pick.round,
      adpRound,
      valueRounds: pick.round - adpRound, // + rounds later than ADP = value
      team_id: pick.team_id,
      raw,
    };
    if (!best || raw > best.raw) best = entry; // most value
    if (!reach || raw < reach.raw) reach = entry; // biggest reach
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
  // Optimal starting lineup per team — the basis for the positional analysis so
  // bench depth (e.g. hoarding QBs) can't inflate a team's positional strength.
  const startersByTeam = new Map(
    teams.map((t) => [t.id, buildLineup(t.id, picks, playersById, settings).starters]),
  );

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
      starters: startersByTeam.get(r.team.id) ?? [],
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

  // Worst bye week: for each bye week, the team(s) with the most players
  // sidelined that week (ties keep every tied team). Ordered by week.
  const teamWeekCounts = new Map<string, Map<number, number>>();
  const allByeWeeks = new Set<number>();
  for (const p of picks) {
    const bw = playersById.get(p.player_id)?.bye_week;
    if (bw == null) continue;
    allByeWeeks.add(bw);
    let byWeek = teamWeekCounts.get(p.team_id);
    if (!byWeek) {
      byWeek = new Map();
      teamWeekCounts.set(p.team_id, byWeek);
    }
    byWeek.set(bw, (byWeek.get(bw) ?? 0) + 1);
  }
  const byeClashes: WeekByeClash[] = [...allByeWeeks]
    .sort((a, b) => a - b)
    .map((week) => {
      let count = 0;
      let tied: { team: TeamRow; avatar: Avatar }[] = [];
      for (const team of teams) {
        const c = teamWeekCounts.get(team.id)?.get(week) ?? 0;
        if (c === 0) continue;
        if (c > count) {
          count = c;
          tied = [{ team, avatar: avatarForTeam(team, members) }];
        } else if (c === count) {
          tied.push({ team, avatar: avatarForTeam(team, members) });
        }
      }
      return { week, count, teams: tied };
    });

  // Position analysis: each team's projected-points total at every STARTER SLOT
  // the league uses (QB/RB/WR/TE/FLEX/OP/K/DEF…), ranked league-wide. Grouping by
  // slot — not the player's base position — keeps a QB started in an OP/superflex
  // slot out of the QB column. Powers the team-pane bars, comparison, and heat map.
  const slots = ROSTER_SLOTS.filter(
    (s) => s !== 'BENCH' && settings.rosterComposition.some((rc) => rc.slot === s && rc.count > 0),
  );
  const slotTotals = new Map<string, Map<RosterSlot, number>>();
  for (const t of teams) slotTotals.set(t.id, new Map(slots.map((s) => [s, 0])));
  for (const t of teams) {
    const bySlot = slotTotals.get(t.id);
    if (!bySlot) continue;
    for (const row of startersByTeam.get(t.id) ?? []) {
      if (!row.player || !bySlot.has(row.slot)) continue;
      bySlot.set(row.slot, (bySlot.get(row.slot) ?? 0) + (row.player.proj_points ?? 0));
    }
  }
  const slotStats = new Map<string, Map<RosterSlot, PositionStat>>();
  for (const t of teams) slotStats.set(t.id, new Map());
  for (const slot of slots) {
    const totals = teams.map((t) => ({ id: t.id, total: slotTotals.get(t.id)?.get(slot) ?? 0 }));
    for (const { id, total } of totals) {
      const rank = 1 + totals.filter((o) => o.total > total).length;
      slotStats.get(id)?.set(slot, { total, rank });
    }
  }

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
    topProjection: teamCards.length ? Math.max(...teamCards.map((t) => t.starterPoints)) : 0,
    avgProjection: teamCards.length
      ? teamCards.reduce((s, t) => s + t.starterPoints, 0) / teamCards.length
      : 0,
    lowProjection: teamCards.length ? Math.min(...teamCards.map((t) => t.starterPoints)) : 0,
    // teamCards are in rank order (= projection order), so first/last are the
    // highest/lowest projected rosters.
    topProjName: teamCards[0]?.team.name ?? '',
    lowProjName: teamCards[teamCards.length - 1]?.team.name ?? '',
    distribution,
    leagueSteal: withTeam(leagueBest),
    leagueReach: withTeam(leagueReach),
    byeClashes,
    slots,
    slotStats,
  };
}
