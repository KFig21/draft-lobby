import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlineOutlined';
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';
import {
  KEEPER_IMPORT_EXAMPLE,
  KEEPER_IMPORT_EXAMPLE_BY_TEAM,
  parseKeeperImport,
  type ParsedKeeperRow,
} from '../../lib/keeperImport';
import { useModalClose } from '../../lib/useModalClose';
import type { KeeperOptionRow, PickRow, PlayerRow, TeamRow } from '../../lib/types';
import './KeeperManagerModal.scss';

interface Props {
  lobbyId: string;
  teams: TeamRow[];
  players: PlayerRow[];
  /** Every pick in the lobby — keepers are the is_keeper ones; all of them
   * count as "already taken" for the search. Updates via the parent's realtime
   * subscription, so the list reflects adds/removes without a manual refetch. */
  picks: PickRow[];
  /** Owner-choice candidate pool, for the "Let owners choose" mode. */
  keeperOptions: KeeperOptionRow[];
  rounds: number;
  onClose: () => void;
}

type TopMode = 'assign' | 'offer';

/** A small inline "search a player" box, reused for the manual-add form, the
 * offer-pool add-a-candidate row, and editing an existing candidate's player.
 * The results list is portaled to <body> and positioned with `fixed` coords
 * computed from the input's own rect — every usage lives inside a scrolling
 * ancestor (the modal itself, or the offer accordion), and an absolutely
 * positioned dropdown gets silently clipped by that ancestor's overflow, so
 * anchoring in-flow doesn't work regardless of context. */
function PlayerSearch({
  players,
  excludeIds,
  value,
  onChange,
  placeholder = 'Search players…',
}: {
  players: PlayerRow[];
  excludeIds: Set<string>;
  value: string | null;
  onChange: (playerId: string | null) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ anchor: 'below' | 'above'; y: number; left: number; width: number } | null>(
    null,
  );
  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const chosen = value ? playersById.get(value) : undefined;
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return players.filter((p) => !excludeIds.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 20);
  }, [players, excludeIds, search]);

  useLayoutEffect(() => {
    if (matches.length === 0 || !wrapRef.current) {
      setPos(null);
      return;
    }
    const update = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      if (spaceBelow < 160 && r.top > spaceBelow) {
        setPos({ anchor: 'above', y: window.innerHeight - r.top + 4, left: r.left, width: r.width });
      } else {
        setPos({ anchor: 'below', y: r.bottom + 4, left: r.left, width: r.width });
      }
    };
    update();
    // Scroll listener needs capture:true — the modal (and the offer accordion
    // inside it) are the elements that actually scroll, and scroll events
    // don't bubble, so a plain window listener would never fire for them.
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [matches.length]);

  if (chosen) {
    return (
      <span className="keeper-modal__chosen">
        <span
          className="keeper-modal__pos"
          style={{ background: POSITION_COLORS[chosen.position as Position] }}
        >
          {chosen.position}
        </span>
        {chosen.name}
        <button type="button" onClick={() => onChange(null)}>
          Change
        </button>
      </span>
    );
  }

  const style: CSSProperties | undefined = pos
    ? { position: 'fixed', left: pos.left, width: pos.width, ...(pos.anchor === 'below' ? { top: pos.y } : { bottom: pos.y }) }
    : undefined;

  return (
    <span className="keeper-modal__search-wrap" ref={wrapRef}>
      <input
        type="text"
        className="keeper-modal__add-input"
        placeholder={placeholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      {matches.length > 0 &&
        pos &&
        createPortal(
          <ul className="keeper-modal__results" style={style}>
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setSearch('');
                  }}
                >
                  <span
                    className="keeper-modal__result-pos"
                    style={{ background: POSITION_COLORS[p.position as Position] }}
                  >
                    {p.position}
                  </span>
                  {p.name}
                  <span className="keeper-modal__result-team">{p.nfl_team}</span>
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </span>
  );
}

/**
 * Commissioner tool (draft-room staging): set up each team's keepers from last
 * season, either directly (exact keepers, entered or imported) or by offering
 * a pool of candidates for each team's owner to choose from. Either path lands
 * as an is_keeper pick, which the draft engine then skips.
 */
export function KeeperManagerModal({
  lobbyId,
  teams,
  players,
  picks,
  keeperOptions,
  rounds,
  onClose,
}: Props) {
  const { closing, requestClose } = useModalClose(onClose);

  const orderedTeams = useMemo(
    () => [...teams].sort((a, b) => a.draft_position - b.draft_position),
    [teams],
  );
  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const draftedIds = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);
  const keeperPicks = useMemo(
    () => picks.filter((p) => p.is_keeper).sort((a, b) => a.round - b.round),
    [picks],
  );

  const [topMode, setTopMode] = useState<TopMode>('assign');
  const [assignMode, setAssignMode] = useState<'manual' | 'import'>('manual');
  const [teamId, setTeamId] = useState<string>('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [round, setRound] = useState(1);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [importText, setImportText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);

  // Offer-pool import can be scoped to one team at a time — the team column
  // is then dropped from the pasted text since it's already picked here.
  const [offerImportMode, setOfferImportMode] = useState<'all' | 'team'>('all');
  const [offerImportTeamId, setOfferImportTeamId] = useState('');

  // Offer-pool accordion: one team open at a time, with an inline add form
  // and an inline edit-player form (only one candidate editable at a time).
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [addPlayerId, setAddPlayerId] = useState<string | null>(null);
  const [addRound, setAddRound] = useState(1);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);

  const teamScoped = topMode === 'offer' && offerImportMode === 'team';
  const parsed = useMemo(() => {
    if (teamScoped && !offerImportTeamId) return { rows: [], parseError: null };
    return parseKeeperImport(importText, teams, players, 1, teamScoped ? offerImportTeamId : null);
  }, [importText, teams, players, teamScoped, offerImportTeamId]);
  const readyRows = useMemo(() => parsed.rows.filter((r) => !r.error), [parsed]);
  const problemRows = useMemo(() => parsed.rows.filter((r) => r.error), [parsed]);

  // Offered candidates grouped by team, for the "Let owners choose" mode.
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

  function toggleTeam(id: string) {
    setExpandedTeam((cur) => (cur === id ? null : id));
    setAddPlayerId(null);
    setAddRound(1);
    setEditingOptionId(null);
  }

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? 'Team';

  async function addKeeper() {
    if (!teamId || !playerId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/lobbies/${lobbyId}/keepers`, {
        method: 'POST',
        body: { teamId, playerId, round },
      });
      // Realtime refreshes `picks`; just clear the player entry for the next add.
      setPlayerId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add keeper');
    } finally {
      setBusy(false);
    }
  }

  async function removeKeeper(pickId: string) {
    setRemovingId(pickId);
    setError(null);
    try {
      await api(`/lobbies/${lobbyId}/keepers/${pickId}`, { method: 'DELETE' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove keeper');
    } finally {
      setRemovingId(null);
    }
  }

  function downloadExample(content: string) {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keepers-example.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  /** "Did you mean X?" → swap the mistyped name for the suggested one in the
   * raw pasted text. Targets the first remaining occurrence of the exact
   * mistyped text, so re-clicking the same suggestion on a duplicate row
   * (already fixed once) correctly moves on to the next one. */
  function applySuggestion(row: ParsedKeeperRow) {
    if (!row.suggestion) return;
    const fixedName = row.suggestion.name;
    setImportText((prev) => {
      const idx = prev.indexOf(row.player);
      if (idx === -1) return prev;
      return prev.slice(0, idx) + fixedName + prev.slice(idx + row.player.length);
    });
  }

  async function importKeepers() {
    if (readyRows.length === 0) return;
    setImportBusy(true);
    setError(null);
    setImportResult(null);
    try {
      const res = await api<{ added: number; skipped: number }>(
        `/lobbies/${lobbyId}/keepers/bulk`,
        {
          method: 'POST',
          body: {
            keepers: readyRows.map((r) => ({ teamId: r.teamId, playerId: r.playerId, round: r.round })),
          },
        },
      );
      setImportResult({ added: res.added, skipped: res.skipped });
      setImportText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportBusy(false);
    }
  }

  async function importOffer() {
    if (readyRows.length === 0) return;
    setImportBusy(true);
    setError(null);
    setImportResult(null);
    try {
      const res = await api<{ added: number; skipped: number }>(
        `/lobbies/${lobbyId}/keeper-options/bulk`,
        {
          method: 'POST',
          body: {
            options: readyRows.map((r) => ({ teamId: r.teamId, playerId: r.playerId, round: r.round })),
          },
        },
      );
      setImportResult({ added: res.added, skipped: res.skipped });
      setImportText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportBusy(false);
    }
  }

  async function removeOption(optionId: string) {
    setRemovingId(optionId);
    setError(null);
    try {
      await api(`/lobbies/${lobbyId}/keeper-options/${optionId}`, { method: 'DELETE' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove candidate');
    } finally {
      setRemovingId(null);
    }
  }

  async function setCount(teamId: string, count: number) {
    if (count < 0) return;
    setError(null);
    try {
      await api(`/lobbies/${lobbyId}/keeper-count`, { method: 'PATCH', body: { teamId, count } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set keeper count');
    }
  }

  async function updateOption(optionId: string, body: { round?: number; playerId?: string }) {
    setError(null);
    try {
      await api(`/lobbies/${lobbyId}/keeper-options/${optionId}`, { method: 'PATCH', body });
      setEditingOptionId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the candidate');
    }
  }

  async function addOption(teamId: string) {
    if (!addPlayerId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/lobbies/${lobbyId}/keeper-options/bulk`, {
        method: 'POST',
        body: { options: [{ teamId, playerId: addPlayerId, round: addRound }] },
      });
      setAddPlayerId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add candidate');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`keeper-modal__backdrop modal-anim-backdrop${closing ? ' is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`keeper-modal modal-anim-card${closing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Manage keepers"
      >
        <button className="keeper-modal__close" aria-label="Close" onClick={requestClose}>
          <CloseIcon fontSize="small" />
        </button>

        <h2 className="keeper-modal__title">🔒 Keepers</h2>
        <p className="keeper-modal__intro">
          Each keeper costs a team its pick in a chosen round, and appears on the board right away.
        </p>

        {/* Two fundamentally different setups — who decides the keepers. */}
        <div className="keeper-modal__topmodes">
          <button
            type="button"
            className={`keeper-modal__topmode${topMode === 'assign' ? ' is-active' : ''}`}
            onClick={() => setTopMode('assign')}
          >
            <PersonOutlineIcon fontSize="small" />
            <span className="keeper-modal__topmode-label">Assign directly</span>
            <span className="keeper-modal__topmode-desc">You set each team's exact keepers</span>
          </button>
          <button
            type="button"
            className={`keeper-modal__topmode${topMode === 'offer' ? ' is-active' : ''}`}
            onClick={() => setTopMode('offer')}
          >
            <GroupsOutlinedIcon fontSize="small" />
            <span className="keeper-modal__topmode-label">Let owners choose</span>
            <span className="keeper-modal__topmode-desc">Offer candidates, owners pick</span>
          </button>
        </div>

        {topMode === 'assign' ? (
          <>
            <div className="keeper-modal__tabs">
              <button
                type="button"
                className={`keeper-modal__tab${assignMode === 'manual' ? ' is-active' : ''}`}
                onClick={() => setAssignMode('manual')}
              >
                Add one
              </button>
              <button
                type="button"
                className={`keeper-modal__tab${assignMode === 'import' ? ' is-active' : ''}`}
                onClick={() => setAssignMode('import')}
              >
                Import
              </button>
            </div>

            {assignMode === 'manual' ? (
              <div className="keeper-modal__form">
                <label className="keeper-modal__field">
                  <span>Team</span>
                  <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                    <option value="">Select team…</option>
                    {orderedTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.draft_position}. {t.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="keeper-modal__field keeper-modal__field--player">
                  <span>Player</span>
                  <PlayerSearch
                    players={players}
                    excludeIds={draftedIds}
                    value={playerId}
                    onChange={setPlayerId}
                  />
                </label>

                <label className="keeper-modal__field keeper-modal__field--round">
                  <span>Round</span>
                  <select value={round} onChange={(e) => setRound(Number(e.target.value))}>
                    {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="button button--primary keeper-modal__add"
                  onClick={addKeeper}
                  disabled={busy || !teamId || !playerId}
                >
                  {busy ? 'Adding…' : 'Add keeper'}
                </button>
              </div>
            ) : (
              <ImportPanel
                importText={importText}
                setImportText={setImportText}
                parsed={parsed}
                readyRows={readyRows}
                problemRows={problemRows}
                onDownloadExample={() => downloadExample(KEEPER_IMPORT_EXAMPLE)}
                onImport={importKeepers}
                onApplySuggestion={applySuggestion}
                importBusy={importBusy}
                importResult={importResult}
                hint="Paste CSV or JSON with columns "
                columnsLabel="team, player, position, round"
                example={KEEPER_IMPORT_EXAMPLE}
                actionLabel="keeper"
              />
            )}

            {error && <p className="keeper-modal__error">{error}</p>}

            <div className="keeper-modal__list">
              {keeperPicks.length === 0 ? (
                <p className="keeper-modal__empty">No keepers yet.</p>
              ) : (
                keeperPicks.map((k) => {
                  const player = playersById.get(k.player_id);
                  return (
                    <div key={k.id} className="keeper-modal__row">
                      <span className="keeper-modal__row-round">R{k.round}</span>
                      <span className="keeper-modal__row-player">
                        {player ? (
                          <>
                            <span
                              className="keeper-modal__pos"
                              style={{ background: POSITION_COLORS[player.position as Position] }}
                            >
                              {player.position}
                            </span>
                            {player.name}
                          </>
                        ) : (
                          'Player'
                        )}
                      </span>
                      <span className="keeper-modal__row-team">{teamName(k.team_id)}</span>
                      <button
                        className="keeper-modal__remove"
                        onClick={() => removeKeeper(k.id)}
                        disabled={removingId === k.id}
                        aria-label="Remove keeper"
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <>
            <div className="keeper-modal__import-scope">
              <div className="keeper-modal__tabs">
                <button
                  type="button"
                  className={`keeper-modal__tab${offerImportMode === 'all' ? ' is-active' : ''}`}
                  onClick={() => setOfferImportMode('all')}
                >
                  Import all
                </button>
                <button
                  type="button"
                  className={`keeper-modal__tab${offerImportMode === 'team' ? ' is-active' : ''}`}
                  onClick={() => setOfferImportMode('team')}
                >
                  Import by team
                </button>
              </div>
              {offerImportMode === 'team' && (
                <select
                  className="keeper-modal__scope-team"
                  value={offerImportTeamId}
                  onChange={(e) => setOfferImportTeamId(e.target.value)}
                  aria-label="Team to import candidates for"
                >
                  <option value="">Select team…</option>
                  {orderedTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.draft_position}. {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <ImportPanel
              importText={importText}
              setImportText={setImportText}
              parsed={parsed}
              readyRows={readyRows}
              problemRows={problemRows}
              onDownloadExample={() =>
                downloadExample(teamScoped ? KEEPER_IMPORT_EXAMPLE_BY_TEAM : KEEPER_IMPORT_EXAMPLE)
              }
              onImport={importOffer}
              onApplySuggestion={applySuggestion}
              importBusy={importBusy}
              importResult={importResult}
              hint={
                teamScoped
                  ? `Paste ${orderedTeams.find((t) => t.id === offerImportTeamId)?.name ?? 'this team'}’s prior roster as candidates — owners choose which to keep. `
                  : 'Paste each team’s prior roster as candidates — owners choose which to keep. '
              }
              columnsLabel={teamScoped ? 'player, position, round' : 'team, player, position, round'}
              example={teamScoped ? KEEPER_IMPORT_EXAMPLE_BY_TEAM : KEEPER_IMPORT_EXAMPLE}
              blockedMessage={teamScoped && !offerImportTeamId ? 'Pick a team above to paste its roster.' : null}
              actionLabel="candidate"
            />

            {error && <p className="keeper-modal__error">{error}</p>}

            <div className="keeper-modal__pool">
              {orderedTeams.map((t) => {
                const opts = optionsByTeam.get(t.id) ?? [];
                const chosen = opts.filter((o) => o.selected).length;
                const open = expandedTeam === t.id;
                return (
                  <div key={t.id} className={`keeper-modal__acc${open ? ' is-open' : ''}`}>
                    <button type="button" className="keeper-modal__acc-head" onClick={() => toggleTeam(t.id)}>
                      <ExpandMoreIcon className="keeper-modal__acc-chev" fontSize="small" />
                      <span className="keeper-modal__acc-name">
                        {t.draft_position}. {t.name}
                      </span>
                      <span className="keeper-modal__acc-meta">
                        {opts.length > 0 ? `${chosen}/${t.keeper_count} · ${opts.length} offered` : 'empty'}
                      </span>
                    </button>

                    {open && (
                      <div className="keeper-modal__acc-body">
                        <div className="keeper-modal__pool-head">
                          <span className="keeper-modal__count">
                            keeps
                            <button
                              type="button"
                              onClick={() => setCount(t.id, t.keeper_count - 1)}
                              disabled={t.keeper_count <= 0}
                              aria-label="Fewer keepers"
                            >
                              −
                            </button>
                            <span className="keeper-modal__count-val">{t.keeper_count}</span>
                            <button
                              type="button"
                              onClick={() => setCount(t.id, t.keeper_count + 1)}
                              aria-label="More keepers"
                            >
                              +
                            </button>
                          </span>
                        </div>

                        {opts.map((o) => {
                          const player = playersById.get(o.player_id);
                          const editing = editingOptionId === o.id;
                          return (
                            <div key={o.id} className="keeper-modal__row">
                              <select
                                className="keeper-modal__round-sel"
                                value={o.round}
                                onChange={(e) => updateOption(o.id, { round: Number(e.target.value) })}
                                aria-label="Compensation round"
                              >
                                {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
                                  <option key={r} value={r}>
                                    R{r}
                                  </option>
                                ))}
                              </select>
                              {editing ? (
                                <span className="keeper-modal__row-player keeper-modal__row-player--editing">
                                  <PlayerSearch
                                    players={players}
                                    excludeIds={draftedIds}
                                    value={null}
                                    onChange={(id) => {
                                      if (id) void updateOption(o.id, { playerId: id });
                                    }}
                                    placeholder="Replace with…"
                                  />
                                  <button
                                    type="button"
                                    className="keeper-modal__edit-cancel"
                                    onClick={() => setEditingOptionId(null)}
                                  >
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <span className="keeper-modal__row-player">
                                  {player ? (
                                    <>
                                      <span
                                        className="keeper-modal__pos"
                                        style={{ background: POSITION_COLORS[player.position as Position] }}
                                      >
                                        {player.position}
                                      </span>
                                      {player.name}
                                    </>
                                  ) : (
                                    'Player'
                                  )}
                                  {o.selected && <span className="keeper-modal__kept">kept</span>}
                                  <button
                                    type="button"
                                    className="keeper-modal__edit-btn"
                                    onClick={() => setEditingOptionId(o.id)}
                                    aria-label="Change player"
                                    title="Change player"
                                  >
                                    <EditOutlinedIcon sx={{ fontSize: 14 }} />
                                  </button>
                                </span>
                              )}
                              <button
                                className="keeper-modal__remove"
                                onClick={() => removeOption(o.id)}
                                disabled={removingId === o.id}
                                aria-label="Remove candidate"
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </button>
                            </div>
                          );
                        })}

                        {/* Manual add */}
                        <div className="keeper-modal__add-row">
                          <select
                            className="keeper-modal__round-sel"
                            value={addRound}
                            onChange={(e) => setAddRound(Number(e.target.value))}
                            aria-label="Round"
                          >
                            {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
                              <option key={r} value={r}>
                                R{r}
                              </option>
                            ))}
                          </select>
                          <PlayerSearch
                            players={players}
                            excludeIds={draftedIds}
                            value={addPlayerId}
                            onChange={setAddPlayerId}
                            placeholder="Add a player…"
                          />
                          <button
                            className="keeper-modal__add-btn"
                            onClick={() => addOption(t.id)}
                            disabled={busy || !addPlayerId}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The paste-a-roster panel, shared by "Assign directly → Import" and
 * "Let owners choose" (which always offers candidates via import + the
 * per-team accordion, no separate sub-tab needed). */
function ImportPanel({
  importText,
  setImportText,
  parsed,
  readyRows,
  problemRows,
  onDownloadExample,
  onImport,
  onApplySuggestion,
  importBusy,
  importResult,
  hint,
  columnsLabel,
  example,
  blockedMessage = null,
  actionLabel,
}: {
  importText: string;
  setImportText: (v: string) => void;
  parsed: ReturnType<typeof parseKeeperImport>;
  readyRows: ReturnType<typeof parseKeeperImport>['rows'];
  problemRows: ReturnType<typeof parseKeeperImport>['rows'];
  onDownloadExample: () => void;
  onImport: () => void;
  onApplySuggestion: (row: ParsedKeeperRow) => void;
  importBusy: boolean;
  importResult: { added: number; skipped: number } | null;
  hint: string;
  columnsLabel: string;
  example: string;
  /** When set, the team-scoped import has no team picked yet — show this
   * instead of the textarea/preview rather than parsing an ambiguous paste. */
  blockedMessage?: string | null;
  actionLabel: string;
}) {
  if (blockedMessage) {
    return (
      <div className="keeper-modal__import">
        <p className="keeper-modal__import-hint">{hint}</p>
        <p className="keeper-modal__import-blocked">{blockedMessage}</p>
      </div>
    );
  }

  const hasTeamCol = columnsLabel.includes('team');
  return (
    <div className="keeper-modal__import">
      <div className="keeper-modal__import-head">
        <p className="keeper-modal__import-hint">
          {hint}
          <code>{columnsLabel}</code>.{hasTeamCol && ' Team matches by name or draft position;'} position
          is optional and either order works (<code>player, position</code> or{' '}
          <code>position, player</code>); round defaults to 1 if left blank.
        </p>
        <button type="button" className="keeper-modal__example" onClick={onDownloadExample}>
          Download example
        </button>
      </div>
      <textarea
        className="keeper-modal__textarea"
        placeholder={example}
        value={importText}
        onChange={(e) => setImportText(e.target.value)}
        rows={6}
        spellCheck={false}
      />
      <div className="keeper-modal__example-block">
        <span className="keeper-modal__example-label">Example</span>
        <pre>{example}</pre>
      </div>
      {parsed.parseError && <p className="keeper-modal__error">{parsed.parseError}</p>}
      {parsed.rows.length > 0 && (
        <div className="keeper-modal__preview">
          <div className="keeper-modal__preview-summary">
            <span className="keeper-modal__ready">{readyRows.length} ready</span>
            {problemRows.length > 0 && <span className="keeper-modal__problem">{problemRows.length} to fix</span>}
          </div>
          {problemRows.length > 0 && (
            <ul className="keeper-modal__problems">
              {problemRows.slice(0, 8).map((r, i) => (
                <li key={i}>
                  {r.error}
                  {r.suggestion && (
                    <button
                      type="button"
                      className="keeper-modal__suggest-yes"
                      onClick={() => onApplySuggestion(r)}
                    >
                      Yes
                    </button>
                  )}
                  <span className="keeper-modal__problem-src">
                    {r.team || '—'} / {r.player || '—'}
                  </span>
                </li>
              ))}
              {problemRows.length > 8 && <li>+{problemRows.length - 8} more…</li>}
            </ul>
          )}
        </div>
      )}
      <button
        className="button button--primary keeper-modal__add"
        onClick={onImport}
        disabled={importBusy || readyRows.length === 0}
      >
        {importBusy
          ? 'Importing…'
          : `Import ${readyRows.length} ${actionLabel}${readyRows.length === 1 ? '' : 's'}`}
      </button>
      {importResult && (
        <p className="keeper-modal__import-result">
          Added {importResult.added}
          {importResult.skipped ? `, skipped ${importResult.skipped} (already taken)` : ''}.
        </p>
      )}
    </div>
  );
}
