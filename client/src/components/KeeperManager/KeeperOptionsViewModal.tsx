import {
  draftablePositions,
  POSITION_COLORS,
  POSITIONS,
  type Position,
  type RosterComposition,
} from '@draft-lobby/shared';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useModalClose } from '../../lib/useModalClose';
import { avatarForTeam } from '../../lib/teamAvatar';
import type { KeeperOptionRow, MemberRow, PlayerRow, TeamRow } from '../../lib/types';
import { Avatar } from '../Avatar/Avatar';
import { Loader } from '../Loader/Loader';
import { ToggleSwitch } from '../ToggleSwitch/ToggleSwitch';
import './KeeperOptionsViewModal.scss';

interface Props {
  teams: TeamRow[];
  /** Lobby members, for resolving each team's owner avatar beside its name. */
  members: MemberRow[];
  players: PlayerRow[];
  keeperOptions: KeeperOptionRow[];
  /** Needed to POST selections when `canSelect` is on. */
  lobbyId?: string;
  /** Commissioner + keepers still editable (pre-draft): shows a "Select
   * keepers" toggle that turns rows into keep/unkeep controls for any team. */
  canSelect?: boolean;
  /** Which positions get a filter pill — a league that doesn't roster K/DEF
   * shouldn't offer them as filters. */
  rosterComposition: RosterComposition;
  /** One team's candidates (roster tab) instead of every team's (staging
   * banner's "View all"). */
  teamId?: string;
  /** Opens the full player-detail modal — omit to leave rows unclickable. */
  onOpenPlayer?: (player: PlayerRow) => void;
  /** Commissioner-only: opens the Keeper Manager's "Let owners choose" import,
   * scoped to this team. Omit to hide the edit pencil (e.g. for regular lobby
   * members, who can't manage keepers). */
  onEditTeam?: (teamId: string) => void;
  onClose: () => void;
}

/** Read-only view of the offered keeper pool — everyone's candidates (from
 * the staging banner) or one team's (from the roster tab's team select).
 * Selected candidates are highlighted; nothing here is editable — that's the
 * commissioner's Keeper Manager or the owner's own "Your keepers" modal. */
export function KeeperOptionsViewModal({
  teams,
  members,
  players,
  keeperOptions,
  rosterComposition,
  lobbyId,
  canSelect,
  teamId,
  onOpenPlayer,
  onEditTeam,
  onClose,
}: Props) {
  const { closing, requestClose } = useModalClose(onClose);

  // Commissioner "select keepers" mode — off by default so this stays a viewer.
  const [selectMode, setSelectMode] = useState(false);
  // Options with an in-flight select POST — the team card shows a loader while
  // any of its options are busy.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  // Optimistic selected overrides (option id → selected) so a click flips the
  // row instantly instead of waiting on the POST + realtime round-trip. Each is
  // dropped once the incoming keeperOptions prop catches up (effect below).
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [selectError, setSelectError] = useState<string | null>(null);
  const selectable = !!canSelect && !!lobbyId;

  const isSelected = (o: KeeperOptionRow) => pending.get(o.id) ?? o.selected;

  async function toggleSelect(o: KeeperOptionRow) {
    if (!lobbyId || busyIds.has(o.id)) return;
    const next = !isSelected(o);
    setPending((m) => new Map(m).set(o.id, next));
    setBusyIds((s) => new Set(s).add(o.id));
    setSelectError(null);
    try {
      await api(`/lobbies/${lobbyId}/keeper-options/${o.id}/select`, {
        method: 'POST',
        body: { selected: next },
      });
    } catch (err) {
      setSelectError(err instanceof Error ? err.message : 'Could not update keeper');
      // Roll back the optimistic flip.
      setPending((m) => {
        const n = new Map(m);
        n.delete(o.id);
        return n;
      });
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(o.id);
        return n;
      });
    }
  }

  // Drop each optimistic override once the real data reflects it (or diverges).
  useEffect(() => {
    setPending((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const o of keeperOptions) {
        if (next.has(o.id) && next.get(o.id) === o.selected) {
          next.delete(o.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [keeperOptions]);

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
        <header className="keeper-view__header">
          <h2 className="keeper-view__title">
            {single && shownTeams[0] && (
              <Avatar avatar={avatarForTeam(shownTeams[0], members)} size={22} />
            )}
            {single ? `${shownTeams[0]?.name ?? 'Team'}’s keepers` : 'Keeper candidates'}
            {single && onEditTeam && shownTeams[0] && (
              <button
                type="button"
                className="keeper-view__edit-btn"
                onClick={() => onEditTeam(shownTeams[0].id)}
                aria-label={`Edit ${shownTeams[0].name}'s keepers`}
                title="Edit this team's keepers"
              >
                <EditOutlinedIcon fontSize="inherit" />
              </button>
            )}
          </h2>
          {!single && selectable && (
            <label className="keeper-view__selecttoggle">
              <ToggleSwitch
                label="Select keepers"
                checked={selectMode}
                onChange={(v) => {
                  setSelectMode(v);
                  setSelectError(null);
                }}
              />
              <span>Select keepers</span>
            </label>
          )}
          <button className="keeper-view__close" aria-label="Close" onClick={requestClose}>
            <CloseIcon fontSize="small" />
          </button>
        </header>

        <div className="keeper-view__body">
          {!single && (
            <p className="keeper-view__intro">
              Every team’s offered keepers — highlighted ones are locked in.
            </p>
          )}
          {selectable && selectMode && (
            <p className="keeper-view__selecthint">
              Click a candidate to keep or unkeep it for its team.
            </p>
          )}
          {selectError && <p className="keeper-view__selecterror">{selectError}</p>}

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
            const kept = allOpts.filter((o) => isSelected(o)).length;
            const teamBusy = allOpts.some((o) => busyIds.has(o.id));
            return (
              <div key={t.id} className="keeper-view__team">
                {teamBusy && (
                  <div className="keeper-view__team-loading" aria-hidden>
                    <Loader />
                  </div>
                )}
                {!single && (
                  <div className="keeper-view__team-head">
                    <span className="keeper-view__team-name">
                      <span className="keeper-view__team-pos">{t.draft_position}.</span>
                      <Avatar avatar={avatarForTeam(t, members)} size={18} />
                      {t.name}
                      {onEditTeam && (
                        <button
                          type="button"
                          className="keeper-view__edit-btn"
                          onClick={() => onEditTeam(t.id)}
                          aria-label={`Edit ${t.name}'s keepers`}
                          title="Edit this team's keepers"
                        >
                          <EditOutlinedIcon fontSize="inherit" />
                        </button>
                      )}
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
                      // Select mode: rows keep/unkeep instead of opening the
                      // player. A non-selected row is blocked once the team is
                      // at its keeper limit (server enforces this too).
                      const keepBlocked = selectMode && !isSelected(o) && kept >= t.keeper_count;
                      const rowSelectable =
                        selectMode && selectable && !!player && !keepBlocked && !busyIds.has(o.id);
                      const openable = !selectMode && player && onOpenPlayer;
                      const onActivate = rowSelectable
                        ? () => toggleSelect(o)
                        : openable
                          ? () => onOpenPlayer(player)
                          : undefined;
                      return (
                        <li
                          key={o.id}
                          className={`keeper-view__opt${isSelected(o) ? ' is-selected' : ''}${
                            onActivate ? ' keeper-view__opt--clickable' : ''
                          }${keepBlocked ? ' keeper-view__opt--blocked' : ''}`}
                          onClick={onActivate}
                          role={onActivate ? 'button' : undefined}
                          tabIndex={onActivate ? 0 : undefined}
                          title={
                            keepBlocked
                              ? `${t.name} is at its keeper limit (${t.keeper_count})`
                              : undefined
                          }
                          onKeyDown={
                            onActivate
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onActivate();
                                  }
                                }
                              : undefined
                          }
                        >
                          {selectMode &&
                            (isSelected(o) ? (
                              <CheckCircleIcon
                                className="keeper-view__selecticon is-on"
                                fontSize="inherit"
                              />
                            ) : (
                              <RadioButtonUncheckedIcon
                                className="keeper-view__selecticon"
                                fontSize="inherit"
                              />
                            ))}
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
                          {!selectMode && isSelected(o) && (
                            <CheckIcon fontSize="inherit" className="keeper-view__check" />
                          )}
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

        {!single && (
          <footer className="keeper-view__footer">
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
          </footer>
        )}

        {/* Single-team (roster tab) view: the commissioner's "Select keepers"
            toggle lives in a footer here rather than the header. */}
        {single && selectable && (
          <footer className="keeper-view__footer">
            <label className="keeper-view__selecttoggle">
              <ToggleSwitch
                label="Select keepers"
                checked={selectMode}
                onChange={(v) => {
                  setSelectMode(v);
                  setSelectError(null);
                }}
              />
              <span>Select keepers</span>
            </label>
          </footer>
        )}
      </div>
    </div>
  );
}
