import {
  DRAFT_GRADES,
  POSITION_COLORS,
  SLOT_LABELS,
  containsSlur,
  type DraftGrade,
  type LobbySettings,
  type Position,
} from '@draft-lobby/shared';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useMemo, useState } from 'react';
import { mostCommonGrade } from '../../lib/draftGrade';
import { buildLineup, computePowerRankings } from '../../lib/powerRankings';
import { avatarForTeam } from '../../lib/teamAvatar';
import type {
  DraftCrownVoteRow,
  DraftGradeRow,
  MemberRow,
  PickRow,
  PlayerRow,
  TeamRow,
} from '../../lib/types';
import { Avatar } from '../Avatar/Avatar';
import { GradeBadge } from '../GradeBadge/GradeBadge';
import { InfoButton } from '../InfoButton/InfoButton';
import { Modal } from '../Modal/Modal';
import './PowerRankingsPanel.scss';

interface Props {
  teams: TeamRow[];
  members: MemberRow[];
  picks: PickRow[];
  playersById: Map<string, PlayerRow>;
  settings: LobbySettings;
  myTeamId: string | null;
  myUserId: string | undefined;
  crownVotes: DraftCrownVoteRow[];
  grades: DraftGradeRow[];
  /** Post-draft window has closed — voting/grading read-only from here on. */
  locked: boolean;
  /** False for a non-member viewing public results, unless the commissioner
   * opted in to public voting — grading always stays members-only. */
  canVote?: boolean;
  canGrade?: boolean;
  onVote: (teamId: string) => void;
  onGrade: (teamId: string, grade: DraftGrade, comment: string) => void;
  onPickClick?: (pick: PickRow) => void;
  /** When set, shows a "Share draft grades" button that opens the PNG export. */
  onExportGrades?: () => void;
  /** Recap mode (the post-draft outro modal): a read-only standings list —
   * hides the peer-grade indicators and the per-row "League grades received" +
   * "Your take" sections, since crowning/grading lives in the Power Rankings tab. */
  readOnly?: boolean;
}

/**
 * The end-of-draft "Power Rankings" — teams ranked by projected starting-lineup
 * points, each given a league-relative letter grade, with crown voting + peer
 * grading folded inline. Renders in the desktop/fullscreen center view, the
 * mobile "Rankings" tab, and the post-draft outro modal.
 */
export function PowerRankingsPanel({
  teams,
  members,
  picks,
  playersById,
  settings,
  myTeamId,
  myUserId,
  crownVotes,
  grades,
  locked,
  canVote = true,
  canGrade = true,
  onVote,
  onGrade,
  onPickClick,
  onExportGrades,
  readOnly = false,
}: Props) {
  const [showHelp, setShowHelp] = useState(false);

  const rankings = useMemo(
    () => computePowerRankings(teams, picks, playersById, settings),
    [teams, picks, playersById, settings],
  );

  const voteCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of crownVotes) m.set(v.team_id, (m.get(v.team_id) ?? 0) + 1);
    return m;
  }, [crownVotes]);
  const myVoteTeamId = crownVotes.find((v) => v.voter_id === myUserId)?.team_id ?? null;

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

  return (
    <div className="power-rankings">
      <div className="power-rankings__inner">
        <header className="power-rankings__head">
          <div className="power-rankings__title">
            <div className="power-rankings__title-main">
              <h2>Power Rankings</h2>
            <InfoButton
              className="power-rankings__help"
              onClick={() => setShowHelp(true)}
              label="How grades work"
            />
            </div>
            {onExportGrades && (
              <button type="button" className="power-rankings__export" onClick={onExportGrades}>
                <FileDownloadOutlinedIcon fontSize="inherit" /> Share
              </button>
            )}
          </div>
          <p className="power-rankings__sub">
            Graded on projected points from each team’s optimal <b>starting lineup</b> — the
            strongest roster earns the top grade, the field slides toward F from there.
          </p>
          <div className="power-rankings__legend">
            <span className="power-rankings__legend-item">
              <GradeBadge grade="A" size={16} /> App grade (projected)
            </span>
            {!readOnly && (
              <>
                <span className="power-rankings__legend-item">
                  <EmojiEventsOutlinedIcon fontSize="inherit" /> Crown votes from the league
                </span>
                <span className="power-rankings__legend-item">
                  <b>Peer</b> — grade the league gave them
                </span>
              </>
            )}
          </div>
          {locked && (
            <p className="power-rankings__locked">
              <LockOutlinedIcon fontSize="inherit" /> Voting and grading closed 24h after the draft
              ended — showing final results.
            </p>
          )}
        </header>

        <ul className="power-rankings__list">
          {rankings.map((row) => (
            <RankRow
              key={row.team.id}
              team={row.team}
              rank={row.rank}
              grade={row.grade}
              strength={row.strength}
              starterPoints={row.starterPoints}
              members={members}
              picks={picks}
              playersById={playersById}
              settings={settings}
              voteCount={voteCounts.get(row.team.id) ?? 0}
              teamGrades={gradesByTeam.get(row.team.id) ?? []}
              myGrade={
                grades.find((g) => g.team_id === row.team.id && g.rater_id === myUserId) ?? null
              }
              myVote={myVoteTeamId === row.team.id}
              isSelf={row.team.id === myTeamId}
              usernameById={usernameById}
              locked={locked}
              canVote={canVote}
              canGrade={canGrade}
              readOnly={readOnly}
              onVote={() => onVote(row.team.id)}
              onGrade={(grade, comment) => onGrade(row.team.id, grade, comment)}
              onPickClick={onPickClick}
            />
          ))}
        </ul>
      </div>

      {showHelp && (
        <Modal title="How grades are calculated" onClose={() => setShowHelp(false)}>
          <div className="power-rankings__help-body">
            <p>
              Every team is ranked by the projected points of its <b>optimal starting lineup</b> —
              the best players it drafted, slotted into the league’s starting positions (flex and
              superflex included), bench excluded.
            </p>
            <p>
              Those totals are then put on a sliding scale: the highest earns <b>A+</b>, the lowest
              <b> F</b>, and everyone else lands in between based on how their total compares —
              normalized between the league’s highest and lowest starter totals, then mapped onto
              the A+…F scale.
            </p>
            <p>
              The <b>peer grade</b> and <b>crown votes</b> are separate — they’re the league’s own
              opinion, shown side-by-side with the projected grade, and they can (and often will)
              disagree with it.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RankRow({
  team,
  rank,
  grade,
  strength,
  starterPoints,
  members,
  picks,
  playersById,
  settings,
  voteCount,
  teamGrades,
  myGrade,
  myVote,
  isSelf,
  usernameById,
  locked,
  canVote,
  canGrade,
  readOnly,
  onVote,
  onGrade,
  onPickClick,
}: {
  team: TeamRow;
  rank: number;
  grade: DraftGrade;
  strength: number;
  starterPoints: number;
  members: MemberRow[];
  picks: PickRow[];
  playersById: Map<string, PlayerRow>;
  settings: LobbySettings;
  voteCount: number;
  teamGrades: DraftGradeRow[];
  myGrade: DraftGradeRow | null;
  myVote: boolean;
  isSelf: boolean;
  usernameById: Map<string, string>;
  locked: boolean;
  canVote: boolean;
  canGrade: boolean;
  readOnly: boolean;
  onVote: () => void;
  onGrade: (grade: DraftGrade, comment: string) => void;
  onPickClick?: (pick: PickRow) => void;
}) {
  const [open, setOpen] = useState(rank === 1);
  const [pendingGrade, setPendingGrade] = useState<DraftGrade>(myGrade?.grade ?? 'B');
  const [comment, setComment] = useState(myGrade?.comment ?? '');
  const [commentError, setCommentError] = useState<string | null>(null);

  const submitGrade = () => {
    const body = comment.trim();
    if (containsSlur(body)) {
      setCommentError('That comment contains language that isn’t allowed here');
      return;
    }
    setCommentError(null);
    onGrade(pendingGrade, body || 'No notes');
  };

  const peerGrade = useMemo(() => mostCommonGrade(teamGrades), [teamGrades]);
  const starters = useMemo(
    () =>
      buildLineup(team.id, picks, playersById, settings, { fillPlaceholders: true }).starters.filter(
        (r) => r.player,
      ),
    [team.id, picks, playersById, settings],
  );
  const ownerName = team.owner_id ? usernameById.get(team.owner_id) : null;

  return (
    <li className={`pr-row${isSelf ? ' pr-row--mine' : ''}${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="pr-row__main"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span
          className={`pr-row__rank${
            rank <= 3 ? ` pr-row__rank--medal pr-row__rank--r${rank}` : ''
          }`}
        >
          <span className="pr-row__rank-n">{rank}</span>
        </span>

        <Avatar avatar={avatarForTeam(team, members)} size={40} />

        <span className="pr-row__team">
          <span className="pr-row__name">
            <span className="pr-row__name-text">{team.name}</span>
            {ownerName && <span className="pr-row__owner muted">@{ownerName}</span>}
          </span>
          <span className="pr-row__meta">
            <span className="pr-row__bar">
              <i style={{ width: `${(0.1 + 0.9 * strength) * 100}%` }} />
            </span>
            <span className="pr-row__pts">
              <b>{starterPoints.toFixed(1)}</b> proj
            </span>
            {voteCount > 0 && (
              <span className="pr-row__votes-chip" title="Crown votes">
                <EmojiEventsIcon fontSize="inherit" /> {voteCount}
              </span>
            )}
          </span>
        </span>

        {!readOnly && (
          <span className="pr-row__side">
            <span className="pr-row__votes" title="Crown votes">
              <EmojiEventsIcon fontSize="inherit" /> {voteCount}
            </span>
            <span className="pr-row__peer">
              Peer{' '}
              {peerGrade ? (
                <>
                  <b>{peerGrade}</b> · {teamGrades.length}
                </>
              ) : (
                <span className="muted">—</span>
              )}
            </span>
          </span>
        )}

        <GradeBadge grade={grade} size={46} />

        <ExpandMoreIcon className="pr-row__chev" fontSize="small" />
      </button>

      {open && (
        <div className="pr-row__detail">
          <div className={`pr-row__detail-grid${readOnly ? ' pr-row__detail-grid--solo' : ''}`}>
            <section className="pr-row__col">
              <h4 className="pr-row__col-title">
                Projected starting lineup · {starterPoints.toFixed(1)} pts
              </h4>
              <ul className="pr-row__starters">
                {starters.map((r, i) => {
                  const p = r.player!;
                  const line = (
                    <>
                      <span className="pr-row__slot">{SLOT_LABELS[r.slot]}</span>
                      <span className="pr-row__pname">
                        <i
                          className="pr-row__pos"
                          style={{ background: POSITION_COLORS[p.position as Position] }}
                        />
                        {p.name}
                        {r.placeholder && (
                          <span className="pr-row__ph" title="Best available — this slot wasn’t drafted">
                            FA
                          </span>
                        )}
                      </span>
                      <span className="pr-row__pp">{(p.proj_points ?? 0).toFixed(1)}</span>
                    </>
                  );
                  return r.pick && onPickClick ? (
                    <li key={i}>
                      <button
                        type="button"
                        className="pr-row__starter pr-row__starter--link"
                        onClick={() => onPickClick(r.pick!)}
                      >
                        {line}
                      </button>
                    </li>
                  ) : (
                    <li key={i} className={`pr-row__starter${r.placeholder ? ' pr-row__starter--ph' : ''}`}>
                      {line}
                    </li>
                  );
                })}
              </ul>
            </section>

            {!readOnly && (
            <section className="pr-row__col">
              <h4 className="pr-row__col-title">
                League grades received{teamGrades.length > 0 ? ` · ${teamGrades.length}` : ''}
              </h4>
              {teamGrades.length > 0 ? (
                <ul className="pr-row__comments">
                  {teamGrades.map((g) => (
                    <li key={g.rater_id} className="pr-row__comment">
                      <GradeBadge grade={g.grade} size={26} />
                      <div>
                        <span className="pr-row__comment-author">
                          {usernameById.get(g.rater_id) ?? 'Player'}
                        </span>{' '}
                        <span className="muted">{g.comment}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted pr-row__empty">No grades yet.</p>
              )}

              {isSelf ? (
                <p className="muted pr-row__self-note">
                  This is your team — the league grades you, not the other way around.
                </p>
              ) : (
                (canVote || canGrade) && (
                  <div className="pr-row__form">
                    <h4 className="pr-row__col-title">Your take</h4>
                    <div className="pr-row__actions">
                      {canVote && (
                        <button
                          type="button"
                          className={`pr-row__crown${myVote ? ' is-on' : ''}`}
                          disabled={locked}
                          onClick={onVote}
                        >
                          <EmojiEventsIcon fontSize="inherit" />
                          {myVote ? 'Crowned' : 'Crown roster'}
                        </button>
                      )}
                      {canGrade && !locked && (
                        <div className="pr-row__pills">
                          {DRAFT_GRADES.map((g) => (
                            <button
                              key={g}
                              type="button"
                              className={`pr-row__pill${pendingGrade === g ? ' is-on' : ''}`}
                              onClick={() => setPendingGrade(g)}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {canGrade && !locked && (
                      <>
                        <div className="pr-row__grade-input">
                          <input
                            value={comment}
                            onChange={(e) => {
                              setComment(e.target.value.slice(0, 140));
                              if (commentError) setCommentError(null);
                            }}
                            placeholder="Say something about this roster… (optional)"
                            maxLength={140}
                          />
                          <button
                            type="button"
                            className={`button button--sm${myGrade ? '' : ' button--primary'}`}
                            onClick={submitGrade}
                          >
                            {myGrade ? 'Update' : 'Submit'}
                          </button>
                        </div>
                        {commentError && <p className="pr-row__grade-error">{commentError}</p>}
                      </>
                    )}
                  </div>
                )
              )}
            </section>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
