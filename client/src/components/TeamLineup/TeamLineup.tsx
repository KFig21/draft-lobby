import {
  SLOT_LABELS,
  type LobbySettings,
  type Position,
  type RosterSlot,
} from '@draft-lobby/shared';
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
}

/** Fills a team's roster slots greedily (best projection first), rest to bench. */
function buildLineup(
  teamId: string,
  picks: PickRow[],
  playersById: Map<string, PlayerRow>,
  settings: LobbySettings,
): Row[] {
  const pool = picks
    .filter((p) => p.team_id === teamId)
    .map((p) => playersById.get(p.player_id))
    .filter((p): p is PlayerRow => !!p)
    .sort((a, b) => (b.proj_points ?? 0) - (a.proj_points ?? 0));

  const assigned = new Set<string>();
  const rows: Row[] = [];
  for (const rc of settings.rosterComposition) {
    if (rc.slot === 'BENCH') continue;
    for (let i = 0; i < rc.count; i++) {
      const pick = pool.find(
        (pl) => !assigned.has(pl.id) && eligible(rc.slot, pl.position as Position),
      );
      if (pick) assigned.add(pick.id);
      rows.push({ slot: rc.slot, player: pick });
    }
  }

  const benchCount = settings.rosterComposition.find((r) => r.slot === 'BENCH')?.count ?? 0;
  const leftover = pool.filter((pl) => !assigned.has(pl.id));
  for (let i = 0; i < Math.max(benchCount, leftover.length); i++) {
    rows.push({ slot: 'BENCH', player: leftover[i] });
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
}: Props) {
  const rows = buildLineup(selectedTeamId, picks, playersById, settings);
  const starters = rows.filter((r) => r.slot !== 'BENCH');
  const bench = rows.filter((r) => r.slot === 'BENCH');

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

      <ul className="lineup-view__rows">
        {starters.map((r, i) => (
          <LineupSlot key={`s${i}`} row={r} />
        ))}
        {bench.length > 0 && <li className="lineup-view__divider">Bench</li>}
        {bench.map((r, i) => (
          <LineupSlot key={`b${i}`} row={r} />
        ))}
      </ul>
    </div>
  );
}

function LineupSlot({ row }: { row: Row }) {
  const { slot, player } = row;
  return (
    <li className="lineup-slot">
      <span className="lineup-slot__label">{SLOT_LABELS[slot]}</span>
      {player ? (
        <div className="lineup-slot__card">
          <PlayerCard player={player} />
        </div>
      ) : (
        <div className="lineup-slot__empty muted">Empty</div>
      )}
    </li>
  );
}
