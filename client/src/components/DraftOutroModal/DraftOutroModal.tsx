import type { DraftGrade, LobbySettings } from '@draft-lobby/shared';
import CloseIcon from '@mui/icons-material/Close';
import { useMemo, useState } from 'react';
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
  const { closing, requestClose } = useModalClose(onClose);
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
      className={`draft-outro__backdrop modal-anim-backdrop${closing ? ' is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`draft-outro modal-anim-card${closing ? ' is-closing' : ''}`}
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
              <h2 className="draft-outro__heading">Draft complete! 🏈</h2>
              {myRank && (
                <div className="draft-outro__grade">
                  <span className="draft-outro__grade-label">Your draft grade</span>
                  <GradeBadge grade={myRank.grade} size={56} />
                  <span className="muted draft-outro__grade-note">
                    #{myRank.rank} of {rankings.length} by projected starting-lineup points.
                  </span>
                </div>
              )}
              <div className="draft-outro__section-label">Your roster</div>
              <ul className="draft-outro__roster">
                {myPicks.map((p) => {
                  const player = playersById.get(p.player_id);
                  return player ? (
                    <li key={p.id}>
                      <PlayerCard player={player} />
                    </li>
                  ) : null;
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
                Crown the roster you think won the draft, and leave a grade + a
                quick note on the rest. {locked ? '' : 'You can change these anytime for the next 24 hours.'}
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
