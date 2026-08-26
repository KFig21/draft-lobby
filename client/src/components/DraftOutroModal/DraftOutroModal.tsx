import { DRAFT_GRADE_COLORS, type DraftGrade, type LobbySettings } from '@draft-lobby/shared';
import CloseIcon from '@mui/icons-material/Close';
import SportsFootballIcon from '@mui/icons-material/SportsFootball';
import { useMemo, useState, type CSSProperties } from 'react';
import { computePowerRankings } from '../../lib/powerRankings';
import { useModalClose } from '../../lib/useModalClose';
import type {
  DraftCrownVoteRow,
  DraftGradeRow,
  MemberRow,
  PickRow,
  PlayerRow,
  TeamRow,
} from '../../lib/types';
import { GradeBadge } from '../GradeBadge/GradeBadge';
import { PowerRankingsPanel } from '../PowerRankings/PowerRankingsPanel';
import { PlayerCard } from '../PlayerCard/PlayerCard';
import './DraftOutroModal.scss';

interface Props {
  myTeam: TeamRow | undefined;
  teams: TeamRow[];
  members: MemberRow[];
  myUserId: string | undefined;
  picks: PickRow[];
  playersById: Map<string, PlayerRow>;
  settings: LobbySettings;
  crownVotes: DraftCrownVoteRow[];
  grades: DraftGradeRow[];
  locked: boolean;
  onVote: (teamId: string) => void;
  onGrade: (teamId: string, grade: DraftGrade, comment: string) => void;
  onClose: () => void;
}

/** Shown once, right after the draft finishes: a recap of your own roster +
 * grade, then a prompt to crown the best roster and grade everyone else's. */
export function DraftOutroModal({
  myTeam,
  teams,
  members,
  myUserId,
  picks,
  playersById,
  settings,
  crownVotes,
  grades,
  locked,
  onVote,
  onGrade,
  onClose,
}: Props) {
  const { open, closing, requestClose } = useModalClose(onClose);
  const [step, setStep] = useState<0 | 1>(0);

  const myPicks = useMemo(
    () =>
      myTeam
        ? picks.filter((p) => p.team_id === myTeam.id).sort((a, b) => a.overall - b.overall)
        : [],
    [picks, myTeam],
  );
  const rankings = useMemo(
    () => computePowerRankings(teams, picks, playersById, settings),
    [teams, picks, playersById, settings],
  );
  const myRank = myTeam ? rankings.find((r) => r.team.id === myTeam.id) ?? null : null;

  return (
    <div
      className={`draft-outro__backdrop modal-anim-backdrop${open ? ' is-open' : ''}${closing ? ' is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`draft-outro modal-anim-card${open ? ' is-open' : ''}${closing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Draft complete"
      >
        <button className="draft-outro__close" aria-label="Close" onClick={requestClose}>
          <CloseIcon fontSize="small" />
        </button>

        <div className="draft-outro__body">
          {step === 0 ? (
            <>
              <h2 className="draft-outro__heading">
                Draft complete!
                <SportsFootballIcon className="draft-outro__heading-icon" />
              </h2>
              {myRank && (
                <div
                  className="draft-outro__grade"
                  style={{ '--grade': DRAFT_GRADE_COLORS[myRank.grade] } as CSSProperties}
                >
                  <div className="draft-outro__grade-info">
                    <span className="draft-outro__grade-label">Your draft grade</span>
                    <span className="draft-outro__grade-rank">
                      #{myRank.rank} <span className="muted">of {rankings.length}</span>
                    </span>
                    <span className="muted draft-outro__grade-note">
                      by projected starting-lineup points
                    </span>
                  </div>
                  <GradeBadge grade={myRank.grade} size={68} />
                </div>
              )}
              <div className="draft-outro__section-label">Your roster</div>
              <ul className="draft-outro__roster">
                {myPicks.map((p) => {
                  const player = playersById.get(p.player_id);
                  if (!player) return null;
                  const round = Math.floor((p.overall - 1) / settings.teamCount) + 1;
                  const inRound = ((p.overall - 1) % settings.teamCount) + 1;
                  return (
                    <li key={p.id} className="draft-outro__roster-row">
                      <span className="draft-outro__pick-num">
                        {round}.{String(inRound).padStart(2, '0')}
                      </span>
                      <PlayerCard player={player} hideValue />
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="button button--primary draft-outro__continue"
                onClick={() => setStep(1)}
              >
                Continue
              </button>
            </>
          ) : (
            <>
              <h2 className="draft-outro__heading">How’d everyone else do?</h2>
              <p className="muted draft-outro__intro">
                Here’s how the league stacked up by projected starting-lineup points.
                Crown the winner and grade every roster anytime from the{' '}
                <b>Power Rankings</b> tab.
              </p>
              <PowerRankingsPanel
                teams={teams}
                members={members}
                picks={picks}
                playersById={playersById}
                settings={settings}
                myTeamId={myTeam?.id ?? null}
                myUserId={myUserId}
                crownVotes={crownVotes}
                grades={grades}
                locked={locked}
                onVote={onVote}
                onGrade={onGrade}
                readOnly
              />
              <button
                type="button"
                className="button button--primary draft-outro__continue"
                onClick={requestClose}
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
