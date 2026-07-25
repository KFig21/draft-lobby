import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlineOutlined';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { KEEPER_IMPORT_EXAMPLE, parseKeeperImport } from '../../lib/keeperImport';
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
 * offer-pool add-a-candidate row, and editing an existing candidate's player. */
function PlayerSearch({
  players,
  excludeIds,
  value,
  onChange,
  placeholder = 'Search players…',
  inline = false,
}: {
  players: PlayerRow[];
  excludeIds: Set<string>;
  value: string | null;
  onChange: (playerId: string | null) => void;
  placeholder?: string;
  /** The offer-pool accordion's rows are cramped/scrolling, so its dropdown
   * pushes content down (static) instead of floating over neighboring rows —
   * the manual "Add one" form has room to float (the default). */
  inline?: boolean;
}) {
  const [search, setSearch] = useState('');
  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const chosen = value ? playersById.get(value) : undefined;
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return players.filter((p) => !excludeIds.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 20);
  }, [players, excludeIds, search]);

  if (chosen) {
    return (
      <span className="keeper-modal__chosen">
        <strong>{chosen.position}</strong> {chosen.name}
        <button type="button" onClick={() => onChange(null)}>
          Change
        </button>
      </span>
    );
  }
  return (
    <span className="keeper-modal__search-wrap">
      <input
        type="text"
        className="keeper-modal__add-input"
        placeholder={placeholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      {matches.length > 0 && (
        <ul className={`keeper-modal__results${inline ? ' keeper-modal__results--inline' : ''}`}>
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setSearch('');
                }}
              >
                <span className="keeper-modal__result-pos">{p.position}</span>
                {p.name}
                <span className="keeper-modal__result-team">{p.nfl_team}</span>
              </button>
            </li>
          ))}
        </ul>
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

  // Offer-pool accordion: one team open at a time, with an inline add form
  // and an inline edit-player form (only one candidate editable at a time).
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [addPlayerId, setAddPlayerId] = useState<string | null>(null);
  const [addRound, setAddRound] = useState(1);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);

  const parsed = useMemo(
    () => parseKeeperImport(importText, teams, players),
    [importText, teams, players],
  );
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

  function downloadExample() {
    const blob = new Blob([KEEPER_IMPORT_EXAMPLE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keepers-example.csv';
    a.click();
    URL.revokeObjectURL(url);
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
                onDownloadExample={downloadExample}
                onImport={importKeepers}
                importBusy={importBusy}
                importResult={importResult}
                hint="Paste CSV or JSON with columns "
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
                            <strong>{player.position}</strong> {player.name}
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
            <ImportPanel
              importText={importText}
              setImportText={setImportText}
              parsed={parsed}
              readyRows={readyRows}
              problemRows={problemRows}
              onDownloadExample={downloadExample}
              onImport={importOffer}
              importBusy={importBusy}
              importResult={importResult}
              hint="Paste each team’s prior roster as candidates — owners choose which to keep. "
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
                                    inline
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
                                      <strong>{player.position}</strong> {player.name}
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
                            inline
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
  importBusy,
  importResult,
  hint,
  actionLabel,
}: {
  importText: string;
  setImportText: (v: string) => void;
  parsed: ReturnType<typeof parseKeeperImport>;
  readyRows: ReturnType<typeof parseKeeperImport>['rows'];
  problemRows: ReturnType<typeof parseKeeperImport>['rows'];
  onDownloadExample: () => void;
  onImport: () => void;
  importBusy: boolean;
  importResult: { added: number; skipped: number } | null;
  hint: string;
  actionLabel: string;
}) {
  return (
    <div className="keeper-modal__import">
      <div className="keeper-modal__import-head">
        <p className="keeper-modal__import-hint">
          {hint}
          <code>team, player, position, round</code>. Team matches by name or draft position; round
          defaults to 1 if left blank.
        </p>
        <button type="button" className="keeper-modal__example" onClick={onDownloadExample}>
          Download example
        </button>
      </div>
      <textarea
        className="keeper-modal__textarea"
        placeholder={KEEPER_IMPORT_EXAMPLE}
        value={importText}
        onChange={(e) => setImportText(e.target.value)}
        rows={6}
        spellCheck={false}
      />
      <div className="keeper-modal__example-block">
        <span className="keeper-modal__example-label">Example</span>
        <pre>{KEEPER_IMPORT_EXAMPLE}</pre>
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
