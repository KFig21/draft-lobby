import {
  DEFAULT_SCORING_RULES,
  POSITIONS,
  POSITION_COLORS,
  SCORING_PRESETS,
  SLOT_LABELS,
  type Position,
  type ScoringRules,
} from '@draft-lobby/shared';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import TuneIcon from '@mui/icons-material/Tune';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { useEffect, useMemo, useState } from 'react';
import { Loader } from '../../components/Loader/Loader';
import { Modal } from '../../components/Modal/Modal';
import { PlayerDetailModal } from '../../components/PlayerDetailModal/PlayerDetailModal';
import { ScoringRulesModal } from '../../components/LeagueRulesModal/ScoringRulesModal';
import { usePlayers } from '../../hooks/usePlayers';
import { useFavorites } from '../../hooks/useFavorites';
import { getDefaultScoringChoice, setDefaultScoringChoice } from '../../lib/defaultScoring';
import { INJURY_ABBR, INJURY_SEVERITY } from '../../lib/injuryStatus';
import { scorePlayers } from '../../lib/playerPoints';
import { BASE_SORT_KEYS, POS_STAT_COLS, fmtStat } from '../../lib/positionStats';
import { supabase } from '../../supabase';
import type { PlayerRow } from '../../lib/types';
import {
  ScoringFormatCreatorPage,
  type SavedScoringFormat,
} from '../ScoringFormatCreator/ScoringFormatCreatorPage';
import './RankingsPage.scss';

type Filter = 'ALL' | Position | 'FLEX' | 'SUPERFLEX';
const FLEX_POS: Position[] = ['RB', 'WR', 'TE'];
const SUPERFLEX_POS: Position[] = ['QB', 'RB', 'WR', 'TE'];
type StatYear = 'proj' | 'prev';
// A sort key is one of the fixed columns or a raw scoring-catalog stat key
// (when the list is filtered to one position and shows that position's stats).
type SortKey = 'points' | 'name' | 'adp' | (string & {});
type SortDir = 'asc' | 'desc';

const CURRENT_YEAR = new Date().getUTCFullYear();

/** Interactive draft cheat sheet: the full player pool, ranked under a
 * chosen scoring format (any preset or one of the user's saved formats) and
 * either this season's projections or last season's actual results — with
 * a per-user "favorite" star that follows across every draft. */
export function RankingsPage() {
  const { players: rawPlayers, loading: playersLoading } = usePlayers();
  const { favoriteIds, toggleFavorite, canFavorite } = useFavorites();

  const [scoringFormats, setScoringFormats] = useState<SavedScoringFormat[]>([]);
  const [rulesetChoice, setRulesetChoice] = useState(() => getDefaultScoringChoice());
  const [showScoringModal, setShowScoringModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [statYear, setStatYear] = useState<StatYear>('proj');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<PlayerRow | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('points');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  // Mobile only: the filters live in a slide-up bottom sheet (desktop shows
  // them inline). Closed by default so the table gets the full screen.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Mobile: the table freezes star/rank/player and scrolls Points/Stats/ADP
  // under them (see &__star/&__rank/&__player's sticky-left CSS) — Points
  // moves in front of Stats to lead with the number people scan first, and
  // player names abbreviate to "F. Last" to leave the frozen columns room.
  // Same matchMedia-in-state pattern as LobbyRoomPage's isDesktop.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    void supabase
      .from('scoring_formats')
      .select('id, name, rules')
      .order('created_at')
      .then(({ data }) => setScoringFormats((data ?? []) as SavedScoringFormat[]));
  }, []);

  const rules: ScoringRules = useMemo(() => {
    const [kind, key] = rulesetChoice.split(':');
    if (kind === 'preset' && key in SCORING_PRESETS) {
      return SCORING_PRESETS[key as keyof typeof SCORING_PRESETS].rules;
    }
    return scoringFormats.find((f) => f.id === key)?.rules ?? DEFAULT_SCORING_RULES;
  }, [rulesetChoice, scoringFormats]);

  // A saved (non-preset) format's own name, for the "View ruleset" modal's
  // badge — presets already show their own label there regardless.
  const rulesetName = useMemo(() => {
    const [kind, key] = rulesetChoice.split(':');
    return kind === 'format' ? scoringFormats.find((f) => f.id === key)?.name : undefined;
  }, [rulesetChoice, scoringFormats]);

  // Same recompute-from-raw-stats helper the draft board uses — this page is
  // just a different "lobby" (an arbitrary ruleset) feeding the same engine.
  const players = useMemo(() => scorePlayers(rawPlayers, rules), [rawPlayers, rules]);

  // Persists to the same "default scoring format" preference Settings'
  // dropdown manages, so whatever the user last picks here (or just saved) is
  // what Rankings — and a fresh league — seeds with next time, instead of
  // reverting the moment they leave the page.
  function updateRulesetChoice(choice: string) {
    setRulesetChoice(choice);
    setDefaultScoringChoice(choice);
  }

  function onScoringSaved(fmt: SavedScoringFormat) {
    setScoringFormats((prev) => [...prev.filter((f) => f.id !== fmt.id), fmt]);
    updateRulesetChoice(`format:${fmt.id}`);
    setShowScoringModal(false);
  }

  // The stat columns for the current single-position filter (undefined on the
  // ALL/FLEX/OP views and for K/DEF, which keep the generic stat line).
  const statCols = POS_STAT_COLS[filter as Position];

  // A stat sort only makes sense while its column is on screen — if the filter
  // changes away from that position, fall back to the default ranking.
  useEffect(() => {
    if (!BASE_SORT_KEYS.has(sortKey) && !statCols?.some((c) => c.key === sortKey)) {
      setSortKey('points');
      setSortDir('desc');
    }
  }, [filter, sortKey, statCols]);

  // Natural (first-click) direction: A→Z for name, earliest-first for ADP,
  // high-to-low for points and every stat column.
  function naturalDir(key: SortKey): SortDir {
    return key === 'name' || key === 'adp' ? 'asc' : 'desc';
  }

  // Tri-state sort. A fresh column starts in its natural direction; clicking the
  // active column advances natural → reversed → reset (back to points, high-to-
  // low).
  function toggleSort(key: SortKey) {
    const natural = naturalDir(key);
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir(natural);
      return;
    }
    if (sortDir === natural) {
      setSortDir(natural === 'asc' ? 'desc' : 'asc');
    } else {
      // Third click — reset to the default ranking.
      setSortKey('points');
      setSortDir('desc');
    }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pointsOf = (p: PlayerRow) => (statYear === 'proj' ? p.proj_points : p.prev_points) ?? -Infinity;
    const statsOf = (p: PlayerRow) => (statYear === 'proj' ? p.proj_stats : p.prev_stats) ?? {};

    // Ascending base comparator, always sorting missing ADP last regardless
    // of direction — flipped below for descending instead of duplicated.
    function compareAsc(a: PlayerRow, b: PlayerRow): number {
      if (sortKey === 'points') return pointsOf(a) - pointsOf(b);
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'adp') {
        if (a.adp == null && b.adp == null) return 0;
        if (a.adp == null) return 1;
        if (b.adp == null) return -1;
        return a.adp - b.adp;
      }
      // A stat column — sort by its raw value, missing/absent last.
      return (statsOf(a)[sortKey] ?? -Infinity) - (statsOf(b)[sortKey] ?? -Infinity);
    }

    return players
      .filter((p) => {
        if (favoritesOnly && !favoriteIds?.has(p.id)) return false;
        if (q && !p.name.toLowerCase().includes(q)) return false;
        if (filter === 'ALL') return true;
        if (filter === 'FLEX') return (FLEX_POS as string[]).includes(p.position);
        if (filter === 'SUPERFLEX') return (SUPERFLEX_POS as string[]).includes(p.position);
        return p.position === filter;
      })
      .sort((a, b) => (sortDir === 'asc' ? compareAsc(a, b) : compareAsc(b, a)));
  }, [players, filter, search, favoritesOnly, favoriteIds, statYear, sortKey, sortDir]);

  function SortHeader({
    label,
    sortKeyFor,
    className,
  }: {
    label: string;
    sortKeyFor: SortKey;
    className?: string;
  }) {
    const active = sortKey === sortKeyFor;
    return (
      <th
        className={`rankings-table__sortable${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
        onClick={() => toggleSort(sortKeyFor)}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      >
        {label}
        {active &&
          (sortDir === 'asc' ? (
            <ArrowUpwardIcon className="rankings-table__sort-icon" />
          ) : (
            <ArrowDownwardIcon className="rankings-table__sort-icon" />
          ))}
      </th>
    );
  }

  return (
    <main className="rankings">
      {/* The height-constrained, frozen-header scroll region. Kept one level in
          (not on <main>) so the fixed-position modals below — rendered as
          direct children of the unconstrained <main> — escape to the viewport
          and dim the whole page, rather than being clipped to this box. */}
      <div className="rankings__scroll">
        <header className="rankings__header">
          <h1>Player Rankings</h1>
          {/* Mobile only — opens the filters bottom sheet (see &__filters). */}
          <button
            type="button"
            className="rankings__filters-btn"
            onClick={() => setFiltersOpen(true)}
            aria-label="Filters"
          >
            <TuneIcon fontSize="small" /> Filters
          </button>
        </header>

        {/* Mobile: tapping the backdrop closes the filters sheet. */}
        {filtersOpen && (
          <div
            className="rankings__filters-scrim"
            onClick={() => setFiltersOpen(false)}
            aria-hidden
          />
        )}

        <section className={`rankings__filters${filtersOpen ? ' is-open' : ''}`}>
        <div className="rankings__filters-grip" aria-hidden />
        <div className="rankings__filters-head">
          <span>Filters</span>
          <button
            type="button"
            className="rankings__filters-done"
            onClick={() => setFiltersOpen(false)}
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>
        <div className="rankings__controls">
          <span className="rankings__ruleset-wrap">
            <select
              className="rankings__ruleset"
              value={rulesetChoice}
              onChange={(e) => updateRulesetChoice(e.target.value)}
              aria-label="Ranking scoring format"
            >
              <optgroup label="Presets">
                {(Object.keys(SCORING_PRESETS) as (keyof typeof SCORING_PRESETS)[]).map((p) => (
                  <option key={p} value={`preset:${p}`}>
                    {SCORING_PRESETS[p].label}
                  </option>
                ))}
              </optgroup>
              {scoringFormats.length > 0 && (
                <optgroup label="Your saved formats">
                  {scoringFormats.map((f) => (
                    <option key={f.id} value={`format:${f.id}`}>
                      {f.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {/* Native select arrows don't reliably pick up `color` (iOS in
                particular renders a near-black chevron regardless of theme) —
                hide it and draw our own so it's visible on a dark background. */}
            <KeyboardArrowDownIcon className="rankings__ruleset-chevron" fontSize="small" />
          </span>
          <button
            type="button"
            className="rankings__new-format"
            onClick={() => setShowRulesModal(true)}
          >
            <VisibilityOutlinedIcon fontSize="small" /> View ruleset
          </button>
          <button
            type="button"
            className="rankings__new-format"
            onClick={() => setShowScoringModal(true)}
          >
            + New format
          </button>

          <div className="segmented">
            <button
              type="button"
              className={`segmented__opt${statYear === 'proj' ? ' segmented__opt--on' : ''}`}
              onClick={() => setStatYear('proj')}
            >
              {CURRENT_YEAR} projections
            </button>
            <button
              type="button"
              className={`segmented__opt${statYear === 'prev' ? ' segmented__opt--on' : ''}`}
              onClick={() => setStatYear('prev')}
            >
              {CURRENT_YEAR - 1} stats
            </button>
          </div>

          <div className="rankings__search-wrap">
            <input
              className="rankings__search"
              type="search"
              placeholder="Search players…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search players"
            />
            {search && (
              <button
                type="button"
                className="rankings__search-clear"
                aria-label="Clear search"
                onClick={() => setSearch('')}
              >
                <CloseIcon fontSize="small" />
              </button>
            )}
          </div>
        </div>

        <div className="chip-row rankings__positions">
          <button
            type="button"
            className={`chip rankings__pos-chip${filter === 'ALL' ? ' chip--active' : ''}`}
            onClick={() => setFilter('ALL')}
          >
            All
          </button>
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              type="button"
              className={`chip rankings__pos-chip${filter === pos ? ' chip--active' : ''}`}
              onClick={() => setFilter(pos)}
            >
              {pos}
            </button>
          ))}
          {(['FLEX', 'SUPERFLEX'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`chip rankings__pos-chip${filter === f ? ' chip--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {SLOT_LABELS[f]}
            </button>
          ))}
          <button
            type="button"
            className={`chip rankings__fav-toggle${favoritesOnly ? ' chip--active' : ''}`}
            onClick={() => setFavoritesOnly((v) => !v)}
          >
            <StarIcon fontSize="inherit" /> Favorites
          </button>
        </div>
      </section>

      {playersLoading ? (
        <div className="section-loading">
          <Loader label="Loading players…" />
        </div>
      ) : (
        <div className="rankings__table-wrap">
          <table className="rankings-table">
            <thead>
              <tr>
                <th className="rankings-table__star" aria-label="Favorite" />
                <th className="rankings-table__rank">{isMobile ? '' : 'Rank'}</th>
                <SortHeader label="Player" sortKeyFor="name" className="rankings-table__player" />
                {statCols ? (
                  statCols.map((c) => (
                    <SortHeader
                      key={c.key}
                      label={c.label}
                      sortKeyFor={c.key}
                      className="rankings-table__statcol"
                    />
                  ))
                ) : (
                  <th className="rankings-table__stats">Stats</th>
                )}
                <SortHeader label="Points" sortKeyFor="points" className="rankings-table__points" />
                <SortHeader label="ADP" sortKeyFor="adp" className="rankings-table__adp" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const color = POSITION_COLORS[p.position as Position];
                const injury = INJURY_ABBR[p.injury_status];
                const posRank = statYear === 'proj' ? p.proj_rank : p.prev_rank;
                const statLine = statYear === 'proj' ? p.proj_stat_line : p.prev_stat_line;
                const stats = (statYear === 'proj' ? p.proj_stats : p.prev_stats) ?? {};
                const points = statYear === 'proj' ? p.proj_points : p.prev_points;
                const isFav = favoriteIds?.has(p.id) ?? false;
                return (
                  <tr
                    key={p.id}
                    className="rankings-table__row"
                    onClick={() => setDetailPlayer(p)}
                  >
                    <td className="rankings-table__star">
                      <button
                        type="button"
                        className={`rankings-table__fav${isFav ? ' is-on' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(p.id);
                        }}
                        aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                        disabled={!canFavorite}
                      >
                        {isFav ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                      </button>
                    </td>
                    <td className="rankings-table__rank muted">{i + 1}</td>
                    <td className="rankings-table__player">
                      <span className="rankings-table__pos" style={{ background: color }}>
                        {p.position}
                        <span className="rankings-table__pos-dot" />
                        {posRank ?? '—'}
                      </span>
                      <div className="rankings-table__name-block">
                        <span className="rankings-table__name">
                          {p.name}
                          {injury && (
                            <span
                              className={`injury-badge injury-badge--${INJURY_SEVERITY[p.injury_status] ?? 'danger'}`}
                              title={p.injury_status}
                            >
                              {injury}
                            </span>
                          )}
                        </span>
                        <span className="muted rankings-table__team">
                          {p.nfl_team}
                          {p.bye_week != null ? ` · Bye ${p.bye_week}` : ''}
                        </span>
                      </div>
                    </td>
                    {statCols ? (
                      statCols.map((c) => (
                        <td key={c.key} className="rankings-table__statcol">
                          {fmtStat(stats[c.key])}
                        </td>
                      ))
                    ) : (
                      <td className="rankings-table__stats muted">{statLine ?? '—'}</td>
                    )}
                    <td className="rankings-table__points">
                      {points != null ? points.toFixed(1) : '—'}
                    </td>
                    <td className="rankings-table__adp muted">
                      {p.adp != null ? p.adp.toFixed(1) : '—'}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={statCols ? 5 + statCols.length : 6} className="muted rankings-table__empty">
                    No players match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {detailPlayer && (
        <PlayerDetailModal
          player={detailPlayer}
          onClose={() => setDetailPlayer(null)}
          onFavorite={() => toggleFavorite(detailPlayer.id)}
          favorited={favoriteIds?.has(detailPlayer.id) ?? false}
          weekStats={{
            // The pool is this-season-scoped (usePlayers defaults to the current
            // year), so "last year"'s weekly actuals are that minus one.
            season: new Date().getFullYear() - 1,
            scoring: rules,
          }}
        />
      )}

      {showScoringModal && (
        <Modal title="New scoring format" wide onClose={() => setShowScoringModal(false)}>
          <ScoringFormatCreatorPage embedded onSaved={onScoringSaved} />
        </Modal>
      )}

      {showRulesModal && (
        <ScoringRulesModal
          rules={rules}
          name={rulesetName}
          onClose={() => setShowRulesModal(false)}
        />
      )}
    </main>
  );
}
