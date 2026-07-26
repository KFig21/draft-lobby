import {
  draftablePositions,
  POSITION_COLORS,
  POSITIONS,
  type Position,
  type RosterComposition,
} from '@draft-lobby/shared';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useMemo, useState } from 'react';
import { useModalClose } from '../../lib/useModalClose';
import type { KeeperOptionRow, PlayerRow, TeamRow } from '../../lib/types';
import './KeeperOptionsViewModal.scss';

interface Props {
  teams: TeamRow[];
  players: PlayerRow[];
  keeperOptions: KeeperOptionRow[];
  /** Which positions get a filter pill — a league that doesn't roster K/DEF
   * shouldn't offer them as filters. */
  rosterComposition: RosterComposition;
  /** One team's candidates (roster tab) instead of every team's (staging
   * banner's "View all"). */
  teamId?: string;
  /** Opens the full player-detail modal — omit to leave rows unclickable. */
  onOpenPlayer?: (player: PlayerRow) => void;
  onClose: () => void;
}

/** Read-only view of the offered keeper pool — everyone's candidates (from
 * the staging banner) or one team's (from the roster tab's team select).
 * Selected candidates are highlighted; nothing here is editable — that's the
 * commissioner's Keeper Manager or the owner's own "Your keepers" modal. */
export function KeeperOptionsViewModal({
  teams,
  players,
  keeperOptions,
  rosterComposition,
  teamId,
  onOpenPlayer,
  onClose,
}: Props) {
  const { closing, requestClose } = useModalClose(onClose);

  const draftable = useMemo(() => draftablePositions(rosterComposition), [rosterComposition]);
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

  // Multi-select position filter — "View all" only (see the modal header
  // below). Empty set = no filter, show everything.
  const [posFilter, setPosFilter] = useState<Set<Position>>(new Set());
  function togglePos(pos: Position) {
    setPosFilter((cur) => {
      const next = new Set(cur);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  }

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
          <>
            <p className="keeper-view__intro">
              Every team’s offered keepers — highlighted ones are locked in.
            </p>
            <div className="keeper-view__posfilter">
              {POSITIONS.filter((pos) => draftable.has(pos)).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  className={`keeper-view__pill${posFilter.has(pos) ? ' is-active' : ''}`}
                  style={posFilter.has(pos) ? { background: POSITION_COLORS[pos] } : undefined}
                  onClick={() => togglePos(pos)}
                >
                  {pos}
                </button>
              ))}
              {posFilter.size > 0 && (
                <button
                  type="button"
                  className="keeper-view__pill-clear"
                  onClick={() => setPosFilter(new Set())}
                >
                  Clear
                </button>
              )}
            </div>
          </>
        )}

        <div className={`keeper-view__grid${single ? ' keeper-view__grid--single' : ''}`}>
          {shownTeams.map((t) => {
            const allOpts = optionsByTeam.get(t.id) ?? [];
            const opts =
              posFilter.size === 0
                ? allOpts
                : allOpts.filter((o) => {
                    const p = playersById.get(o.player_id);
                    return p && posFilter.has(p.position as Position);
                  });
            const kept = allOpts.filter((o) => o.selected).length;
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
                  <p className="keeper-view__empty">
                    {allOpts.length === 0 ? 'No candidates offered.' : 'No matches for this filter.'}
                  </p>
                ) : (
                  <ul className="keeper-view__list">
                    {opts.map((o) => {
                      const player = playersById.get(o.player_id);
                      const clickable = player && onOpenPlayer;
                      return (
                        <li
                          key={o.id}
                          className={`keeper-view__opt${o.selected ? ' is-selected' : ''}${
                            clickable ? ' keeper-view__opt--clickable' : ''
                          }`}
                          onClick={clickable ? () => onOpenPlayer(player) : undefined}
                          role={clickable ? 'button' : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          onKeyDown={
                            clickable
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onOpenPlayer(player);
                                  }
                                }
                              : undefined
                          }
                        >
                          <span className="keeper-view__round">R{o.round}</span>
                          <span className="keeper-view__player">
                            {player ? (
                              <>
                                <span
                                  className="keeper-view__pos"
                                  style={{ background: POSITION_COLORS[player.position as Position] }}
                                >
                                  {player.position}
                                </span>{' '}
                                {player.name}
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
