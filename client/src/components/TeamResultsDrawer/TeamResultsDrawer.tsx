import { DRAFT_GRADES, defaultAvatar } from '@draft-lobby/shared';
import CloseIcon from '@mui/icons-material/Close';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useMemo } from 'react';
import type { DraftCrownVoteRow, DraftGradeRow, MemberRow, TeamRow } from '../../lib/types';
import { Avatar } from '../Avatar/Avatar';
import './TeamResultsDrawer.scss';

export type ResultsDrawerView = 'closed' | 'open' | 'full';

interface Props {
  team: TeamRow | undefined;
  members: MemberRow[];
  crownVotes: DraftCrownVoteRow[];
  grades: DraftGradeRow[];
  view: ResultsDrawerView;
  onViewChange: (view: ResultsDrawerView) => void;
}

/** Full crown-vote + grade breakdown for one team. Desktop: slides in beside
 * the roster sidebar so both stay visible and independently scrollable.
 * Mobile: a bottom sheet (mirrors .room-chatdrawer) that opens ~80%, with an
 * up-chevron to expand full screen and a down-chevron to close. */
export function TeamResultsDrawer({ team, members, crownVotes, grades, view, onViewChange }: Props) {
  const open = view !== 'closed';
  const voters = useMemo(
    () => (team ? crownVotes.filter((v) => v.team_id === team.id) : []),
    [crownVotes, team],
  );
  const teamGrades = useMemo(
    () =>
      team
        ? grades
            .filter((g) => g.team_id === team.id)
            .slice()
            .sort((a, b) => DRAFT_GRADES.indexOf(a.grade) - DRAFT_GRADES.indexOf(b.grade))
        : [],
    [grades, team],
  );

  function memberFor(userId: string) {
    return members.find((m) => m.user_id === userId);
  }

  if (!team) return null;

  return (
    <>
      <div
        className={`team-results-drawer__backdrop${open ? ' is-open' : ''}`}
        onClick={() => onViewChange('closed')}
      />
      <aside
        className={`team-results-drawer${open ? ' is-open' : ''}${view === 'full' ? ' is-full' : ''}`}
        aria-label={`${team.name} results`}
      >
        <div className="team-results-drawer__head">
          <h3>{team.name} — Results</h3>
          <div className="team-results-drawer__ctrls">
            {view !== 'full' && (
              <button
                type="button"
                className="team-results-drawer__ctrl"
                aria-label="Expand to full screen"
                onClick={() => onViewChange('full')}
              >
                <KeyboardArrowUpIcon fontSize="small" />
              </button>
            )}
            <button
              type="button"
              className="team-results-drawer__ctrl"
              aria-label="Close"
              onClick={() => onViewChange('closed')}
            >
              <KeyboardArrowDownIcon fontSize="small" />
            </button>
            <button
              type="button"
              className="team-results-drawer__close"
              aria-label="Close"
              onClick={() => onViewChange('closed')}
            >
              <CloseIcon fontSize="small" />
            </button>
          </div>
        </div>

        <div className="team-results-drawer__body">
          <section className="team-results-drawer__section">
            <h4 className="team-results-drawer__label">
              <EmojiEventsIcon fontSize="small" /> Crown votes ({voters.length})
            </h4>
            {voters.length === 0 ? (
              <p className="muted">No votes yet.</p>
            ) : (
              <ul className="team-results-drawer__voters">
                {voters.map((v) => {
                  const member = memberFor(v.voter_id);
                  return (
                    <li key={v.voter_id} className="team-results-drawer__voter">
                      <Avatar avatar={member?.profiles?.avatar ?? defaultAvatar(v.voter_id)} size={24} />
                      <span>{member?.profiles?.username ?? 'Player'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="team-results-drawer__section">
            <h4 className="team-results-drawer__label">
              Report Card ({teamGrades.length})
            </h4>
            {teamGrades.length === 0 ? (
              <p className="muted">No grades yet.</p>
            ) : (
              <ul className="team-results-drawer__grades">
                {teamGrades.map((g) => {
                  const member = memberFor(g.rater_id);
                  return (
                    <li key={g.rater_id} className="team-results-drawer__grade">
                      <div className="team-results-drawer__grade-head">
                        <span className="team-results-drawer__grade-badge">{g.grade}</span>
                        <Avatar
                          avatar={member?.profiles?.avatar ?? defaultAvatar(g.rater_id)}
                          size={20}
                        />
                        <span className="team-results-drawer__grade-author">
                          {member?.profiles?.username ?? 'Player'}
                        </span>
                      </div>
                      <p className="team-results-drawer__grade-comment">{g.comment}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
