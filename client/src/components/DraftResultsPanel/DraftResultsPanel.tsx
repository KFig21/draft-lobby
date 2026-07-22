import { DRAFT_GRADES, type DraftGrade } from '@draft-lobby/shared';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import { useMemo, useState } from 'react';
import { mostCommonGrade } from '../../lib/draftGrade';
import { avatarForTeam } from '../../lib/teamAvatar';
import type { DraftCrownVoteRow, DraftGradeRow, MemberRow, TeamRow } from '../../lib/types';
import { Avatar } from '../Avatar/Avatar';
import './DraftResultsPanel.scss';

interface Props {
  teams: TeamRow[];
  members: MemberRow[];
  myTeamId: string | null;
  myUserId: string | undefined;
  crownVotes: DraftCrownVoteRow[];
  grades: DraftGradeRow[];
  /** Post-draft window has closed — read-only from here on. */
  locked: boolean;
  onVote: (teamId: string) => void;
  onGrade: (teamId: string, grade: DraftGrade, comment: string) => void;
}

/** Crown voting + peer grading — shared between the post-draft outro modal
 * and the persistent "Results" tab (same data, same actions). */
export function DraftResultsPanel({
  teams,
  members,
  myTeamId,
  myUserId,
  crownVotes,
  grades,
  locked,
  onVote,
  onGrade,
}: Props) {
  const otherTeams = useMemo(() => teams.filter((t) => t.id !== myTeamId), [teams, myTeamId]);

  const voteCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of crownVotes) m.set(v.team_id, (m.get(v.team_id) ?? 0) + 1);
    return m;
  }, [crownVotes]);
  const myVoteTeamId = crownVotes.find((v) => v.voter_id === myUserId)?.team_id ?? null;
  const totalVotes = crownVotes.length;

  const gradesByTeam = useMemo(() => {
    const m = new Map<string, DraftGradeRow[]>();
    for (const g of grades) {
      const list = m.get(g.team_id);
      if (list) list.push(g);
      else m.set(g.team_id, [g]);
    }
    return m;
  }, [grades]);

  const usernameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of members) m.set(mem.user_id, mem.profiles?.username ?? 'Player');
    return m;
  }, [members]);

  // Unlike grading, the crown-vote leaderboard includes your own team — you
  // just can't vote for it — so you can see where you place on the list.
  const sortedByVotes = useMemo(
    () => [...teams].sort((a, b) => (voteCounts.get(b.id) ?? 0) - (voteCounts.get(a.id) ?? 0)),
    [teams, voteCounts],
  );

  return (
    <div className="draft-results">
      <section className="draft-results__section">
        <h4 className="draft-results__title">
          <EmojiEventsIcon fontSize="small" /> Crown the best roster
        </h4>
        {totalVotes > 0 && (
          <p className="muted draft-results__subtitle">{totalVotes} vote{totalVotes === 1 ? '' : 's'} so far</p>
        )}
        <ul className="draft-results__votes">
          {sortedByVotes.map((team) => {
            const count = voteCounts.get(team.id) ?? 0;
            const mine = myVoteTeamId === team.id;
            const isSelf = team.id === myTeamId;
            return (
              <li key={team.id} className={`draft-results__vote-row${mine ? ' is-mine' : ''}`}>
                <Avatar avatar={avatarForTeam(team, members)} size={26} />
                <span className="draft-results__vote-name">
                  {team.name}
                  {isSelf && <span className="muted"> (you)</span>}
                </span>
                <span className="draft-results__vote-count">{count}</span>
                <button
                  type="button"
                  className={`draft-results__crown-btn${mine ? ' is-active' : ''}`}
                  aria-label={
                    isSelf
                      ? "You can't vote for your own roster"
                      : mine
                        ? 'Your pick for best roster'
                        : `Vote for ${team.name}`
                  }
                  title={
                    isSelf
                      ? "You can't vote for your own roster"
                      : mine
                        ? 'Your pick for best roster'
                        : `Vote for ${team.name}`
                  }
                  disabled={locked || isSelf}
                  onClick={() => onVote(team.id)}
                >
                  {mine ? (
                    <EmojiEventsIcon fontSize="small" />
                  ) : (
                    <EmojiEventsOutlinedIcon fontSize="small" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="draft-results__section">
        <h4 className="draft-results__title">Grade their rosters</h4>
        <ul className="draft-results__grades">
          {otherTeams.map((team) => (
            <TeamGradeCard
              key={team.id}
              team={team}
              members={members}
              grades={gradesByTeam.get(team.id) ?? []}
              myGrade={grades.find((g) => g.team_id === team.id && g.rater_id === myUserId) ?? null}
              usernameById={usernameById}
              locked={locked}
              onGrade={(grade, comment) => onGrade(team.id, grade, comment)}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function TeamGradeCard({
  team,
  members,
  grades,
  myGrade,
  usernameById,
  locked,
  onGrade,
}: {
  team: TeamRow;
  members: MemberRow[];
  grades: DraftGradeRow[];
  myGrade: DraftGradeRow | null;
  usernameById: Map<string, string>;
  locked: boolean;
  onGrade: (grade: DraftGrade, comment: string) => void;
}) {
  const [grade, setGrade] = useState<DraftGrade>(myGrade?.grade ?? 'B');
  const [comment, setComment] = useState(myGrade?.comment ?? '');
  const [showComments, setShowComments] = useState(false);

  const avg = useMemo(() => mostCommonGrade(grades), [grades]);

  return (
    <li className="draft-results__grade-card">
      <div className="draft-results__grade-head">
        <Avatar avatar={avatarForTeam(team, members)} size={26} />
        <span className="draft-results__grade-name">{team.name}</span>
        {avg && (
          <span className="draft-results__grade-avg">
            {avg} <span className="muted">({grades.length})</span>
          </span>
        )}
        {grades.length > 0 && (
          <button
            type="button"
            className="draft-results__grade-toggle"
            onClick={() => setShowComments((v) => !v)}
          >
            {showComments ? 'Hide' : 'View'} comments
          </button>
        )}
      </div>

      {showComments && (
        <ul className="draft-results__comments">
          {grades.map((g) => (
            <li key={g.rater_id} className="draft-results__comment">
              <span className="draft-results__comment-grade">{g.grade}</span>
              <span className="draft-results__comment-author">
                {usernameById.get(g.rater_id) ?? 'Player'}
              </span>
              <span className="draft-results__comment-body">{g.comment}</span>
            </li>
          ))}
        </ul>
      )}

      {!locked && (
        <div className="draft-results__grade-form">
          <div className="draft-results__grade-picker">
            {DRAFT_GRADES.map((g) => (
              <button
                key={g}
                type="button"
                className={`draft-results__grade-pill${grade === g ? ' is-active' : ''}`}
                onClick={() => setGrade(g)}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="draft-results__grade-comment">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 140))}
              placeholder="Say something about this roster…"
              maxLength={140}
            />
            <span className="draft-results__grade-count">{comment.length}/140</span>
          </div>
          <button
            type="button"
            className="button button--sm button--primary draft-results__grade-save"
            disabled={!comment.trim()}
            onClick={() => onGrade(grade, comment.trim())}
          >
            {myGrade ? 'Update grade' : 'Submit grade'}
          </button>
        </div>
      )}
    </li>
  );
}
