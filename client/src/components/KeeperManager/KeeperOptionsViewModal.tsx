import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useMemo } from 'react';
import { useModalClose } from '../../lib/useModalClose';
import type { KeeperOptionRow, PlayerRow, TeamRow } from '../../lib/types';
import './KeeperOptionsViewModal.scss';

interface Props {
  teams: TeamRow[];
  players: PlayerRow[];
  keeperOptions: KeeperOptionRow[];
  /** One team's candidates (roster tab) instead of every team's (staging
   * banner's "View all"). */
  teamId?: string;
  onClose: () => void;
}

/** Read-only view of the offered keeper pool — everyone's candidates (from
 * the staging banner) or one team's (from the roster tab's team select).
 * Selected candidates are highlighted; nothing here is editable — that's the
 * commissioner's Keeper Manager or the owner's own "Your keepers" modal. */
export function KeeperOptionsViewModal({ teams, players, keeperOptions, teamId, onClose }: Props) {
  const { closing, requestClose } = useModalClose(onClose);

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const orderedTeams = useMemo(
    () => [...teams].sort((a, b) => a.draft_position - b.draft_position),
    [teams],
  );
  const shownTeams = teamId ? orderedTeams.filter((t) => t.id === teamId) : orderedTeams;

  const optionsByTeam = useMemo(() => {
    const m = new Map<string, KeeperOptionRow[]>();
    for (const o of keeperOptions) {
      const list = m.get(o.team_id) ?? [];
      list.push(o);
      m.set(o.team_id, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.round - b.round);
    return m;
  }, [keeperOptions]);

  const single = teamId != null;

  return (
    <div
      className={`keeper-view__backdrop modal-anim-backdrop${closing ? ' is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`keeper-view${single ? ' keeper-view--single' : ''} modal-anim-card${
          closing ? ' is-closing' : ''
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={single ? `${shownTeams[0]?.name ?? 'Team'}'s keepers` : 'All keeper candidates'}
      >
        <button className="keeper-view__close" aria-label="Close" onClick={requestClose}>
          <CloseIcon fontSize="small" />
        </button>

        <h2 className="keeper-view__title">
          {single ? `${shownTeams[0]?.name ?? 'Team'}’s keepers` : 'Keeper candidates'}
        </h2>
        {!single && (
          <p className="keeper-view__intro">
            Every team’s offered keepers — highlighted ones are locked in.
          </p>
        )}

        <div className={`keeper-view__grid${single ? ' keeper-view__grid--single' : ''}`}>
          {shownTeams.map((t) => {
            const opts = optionsByTeam.get(t.id) ?? [];
            const kept = opts.filter((o) => o.selected).length;
            return (
              <div key={t.id} className="keeper-view__team">
                {!single && (
                  <div className="keeper-view__team-head">
                    <span className="keeper-view__team-name">
                      {t.draft_position}. {t.name}
                    </span>
                    <span className="keeper-view__team-count">
                      {kept}/{t.keeper_count}
                    </span>
                  </div>
                )}
                {opts.length === 0 ? (
                  <p className="keeper-view__empty">No candidates offered.</p>
                ) : (
                  <ul className="keeper-view__list">
                    {opts.map((o) => {
                      const player = playersById.get(o.player_id);
                      return (
                        <li key={o.id} className={`keeper-view__opt${o.selected ? ' is-selected' : ''}`}>
                          <span className="keeper-view__round">R{o.round}</span>
                          <span className="keeper-view__player">
                            {player ? (
                              <>
                                <strong>{player.position}</strong> {player.name}
                              </>
                            ) : (
                              'Player'
                            )}
                          </span>
                          {o.selected && <CheckIcon fontSize="inherit" className="keeper-view__check" />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
