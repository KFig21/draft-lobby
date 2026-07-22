import {
  POSITIONS,
  POSITION_COLORS,
  SLOT_LABELS,
  type LobbySettings,
  type Position,
  type RosterSlot,
} from '@draft-lobby/shared';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { PlayerCard } from '../PlayerCard/PlayerCard';
import type { PickRow, PlayerRow, TeamRow } from '../../lib/types';
import './TeamLineup.scss';

interface Props {
  teams: TeamRow[];
  selectedTeamId: string;
  onSelectTeam: (teamId: string) => void;
  picks: PickRow[];
  playersById: Map<string, PlayerRow>;
  settings: LobbySettings;
  /** Current user id — controls whether the auto-draft toggle is theirs to flip. */
  myUserId?: string;
  isCommish?: boolean;
  /** When provided, shows an auto-draft toggle for the selected team. */
  onToggleAuto?: (teamId: string, on: boolean) => void;
  /** Click a drafted player's card to open that pick's detail modal. */
  onPickClick?: (pick: PickRow) => void;
  /** Rendered directly beneath the team dropdown (and its bot/auto status row). */
  belowSelect?: React.ReactNode;
}

const FLEX_ELIGIBLE: Position[] = ['RB', 'WR', 'TE'];
const SUPERFLEX_ELIGIBLE: Position[] = ['QB', 'RB', 'WR', 'TE'];

function eligible(slot: RosterSlot, pos: Position): boolean {
  if (slot === 'BENCH') return true;
  if (slot === 'FLEX') return FLEX_ELIGIBLE.includes(pos);
  if (slot === 'SUPERFLEX') return SUPERFLEX_ELIGIBLE.includes(pos);
  if (slot === 'IDP') return false; // no IDP positions in the current player pool
  return slot === pos;
}

interface Row {
  slot: RosterSlot;
  player?: PlayerRow;
  pick?: PickRow;
}

interface PoolEntry {
  pick: PickRow;
  player: PlayerRow;
}

/** Fills a team's roster slots greedily (best projection first), rest to bench. */
function buildLineup(
  teamId: string,
  picks: PickRow[],
  playersById: Map<string, PlayerRow>,
  settings: LobbySettings,
): Row[] {
  const pool: PoolEntry[] = picks
    .filter((p) => p.team_id === teamId)
    .map((p) => {
      const player = playersById.get(p.player_id);
      return player ? { pick: p, player } : null;
    })
    .filter((e): e is PoolEntry => !!e)
    .sort((a, b) => (b.player.proj_points ?? 0) - (a.player.proj_points ?? 0));

  const assigned = new Set<string>();
  const rows: Row[] = [];
  for (const rc of settings.rosterComposition) {
    if (rc.slot === 'BENCH') continue;
    for (let i = 0; i < rc.count; i++) {
      const entry = pool.find(
        (e) => !assigned.has(e.player.id) && eligible(rc.slot, e.player.position as Position),
      );
      if (entry) assigned.add(entry.player.id);
      rows.push({ slot: rc.slot, player: entry?.player, pick: entry?.pick });
    }
  }

  const benchCount = settings.rosterComposition.find((r) => r.slot === 'BENCH')?.count ?? 0;
  const leftover = pool.filter((e) => !assigned.has(e.player.id));
  for (let i = 0; i < Math.max(benchCount, leftover.length); i++) {
    const entry = leftover[i] as PoolEntry | undefined;
    rows.push({ slot: 'BENCH', player: entry?.player, pick: entry?.pick });
  }
  return rows;
}

export function TeamLineup({
  teams,
  selectedTeamId,
  onSelectTeam,
  picks,
  playersById,
  settings,
  myUserId,
  isCommish,
  onToggleAuto,
  onPickClick,
  belowSelect,
}: Props) {
  const rows = buildLineup(selectedTeamId, picks, playersById, settings);
  const starters = rows.filter((r) => r.slot !== 'BENCH');
  const bench = rows.filter((r) => r.slot === 'BENCH');
  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const canToggleAuto =
    !!onToggleAuto &&
    !!selectedTeam &&
    !selectedTeam.is_bot &&
    (isCommish || selectedTeam.owner_id === myUserId);

  // Roster composition: how many players drafted at each position.
  const posCounts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const p of picks) {
    if (p.team_id !== selectedTeamId) continue;
    const pos = playersById.get(p.player_id)?.position as Position | undefined;
    if (pos) posCounts[pos] += 1;
  }

  return (
    <div className="lineup-view">
      <select
        className="lineup-view__select"
        value={selectedTeamId}
        onChange={(e) => onSelectTeam(e.target.value)}
      >
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      {selectedTeam && (
        <div className="lineup-view__auto">
          {selectedTeam.is_bot ? (
            <span className="bot-badge">
              <SmartToyIcon fontSize="inherit" /> Bot — drafts automatically
            </span>
          ) : canToggleAuto ? (
            <label className="auto-toggle">
              <input
                type="checkbox"
                checked={selectedTeam.auto_draft}
                onChange={(e) => onToggleAuto!(selectedTeam.id, e.target.checked)}
              />
              <span>
                Auto-draft {selectedTeam.auto_draft ? 'on' : 'off'}
                {isCommish && selectedTeam.owner_id !== myUserId ? ' (for this team)' : ''}
              </span>
            </label>
          ) : onToggleAuto && selectedTeam.auto_draft ? (
            <span className="bot-badge">
              <SmartToyIcon fontSize="inherit" /> Auto-drafting
            </span>
          ) : null}
        </div>
      )}

      {belowSelect}

      <div className="lineup-view__composition">
        {POSITIONS.map((pos) => (
          <span
            key={pos}
            className="roster-count"
            style={{ ['--pos' as string]: POSITION_COLORS[pos] }}
          >
            <span className="roster-count__pos">{pos === 'DEF' ? 'D/ST' : pos}</span>
            <span className="roster-count__n">{posCounts[pos]}</span>
          </span>
        ))}
      </div>

      <section className="lineup-view__section">
        <h4 className="lineup-view__section-title">
          <span>Starting lineup</span>
          <span className="lineup-view__section-count">{starters.length}</span>
        </h4>
        <ul className="lineup-view__rows">
          {starters.map((r, i) => (
            <LineupSlot key={`s${i}`} row={r} onPickClick={onPickClick} />
          ))}
        </ul>
      </section>

      {bench.length > 0 && (
        <section className="lineup-view__section">
          <h4 className="lineup-view__section-title lineup-view__section-title--bench">
            <span>Bench</span>
            <span className="lineup-view__section-count">{bench.length}</span>
          </h4>
          <ul className="lineup-view__rows">
            {bench.map((r, i) => (
              <LineupSlot key={`b${i}`} row={r} onPickClick={onPickClick} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function LineupSlot({
  row,
  onPickClick,
}: {
  row: Row;
  onPickClick?: (pick: PickRow) => void;
}) {
  const { slot, player, pick } = row;
  return (
    <li className="lineup-slot">
      <span className="lineup-slot__label">{SLOT_LABELS[slot]}</span>
      {player ? (
        pick && onPickClick ? (
          <button
            type="button"
            className="lineup-slot__card lineup-slot__card--link"
            onClick={() => onPickClick(pick)}
          >
            <PlayerCard player={player} />
          </button>
        ) : (
          <div className="lineup-slot__card">
            <PlayerCard player={player} />
          </div>
        )
      ) : (
        <div className="lineup-slot__empty muted">Empty</div>
      )}
    </li>
  );
}
