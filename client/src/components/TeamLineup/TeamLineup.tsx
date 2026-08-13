import {
  POSITIONS,
  POSITION_COLORS,
  SLOT_LABELS,
  type LobbySettings,
  type Position,
} from '@draft-lobby/shared';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { PlayerCard } from '../PlayerCard/PlayerCard';
import { buildLineup, type LineupRow } from '../../lib/powerRankings';
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

interface ByeEntry {
  pick: PickRow;
  player: PlayerRow;
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
  const { starters, bench } = buildLineup(selectedTeamId, picks, playersById, settings);
  const rows = [...starters, ...bench];

  // Group every drafted player (starter or bench) by bye week, so an owner
  // can spot a pile-up of players sharing the same off week at a glance.
  const byeMap = new Map<number, ByeEntry[]>();
  for (const r of rows) {
    if (!r.player || r.player.bye_week == null) continue;
    const entry: ByeEntry = { player: r.player, pick: r.pick! };
    const group = byeMap.get(r.player.bye_week);
    if (group) group.push(entry);
    else byeMap.set(r.player.bye_week, [entry]);
  }
  const byeGroups = Array.from(byeMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([week, byePlayers]) => ({ week, players: byePlayers }));
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
  const rosterSize = POSITIONS.reduce((sum, pos) => sum + posCounts[pos], 0);

  return (
    <div className="lineup-view">
      <span className="lineup-view__label">Team select</span>
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

      <section className="lineup-view__section">
        <h4 className="lineup-view__section-title lineup-view__section-title--pos">
          <span>Position breakdown</span>
          <span className="lineup-view__section-count">{rosterSize}</span>
        </h4>
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
      </section>

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

      {byeGroups.length > 0 && (
        <section className="lineup-view__section">
          <h4 className="lineup-view__section-title lineup-view__section-title--bye">
            <span>Bye week breakdown</span>
            <span className="lineup-view__section-count">{byeGroups.length}</span>
          </h4>
          <ul className="bye-breakdown">
            {byeGroups.map(({ week, players: byePlayers }) => (
              <li
                key={week}
                className={`bye-breakdown__row${
                  byePlayers.length > 1 ? ' bye-breakdown__row--stacked' : ''
                }`}
              >
                <span className="bye-breakdown__week">Wk {week}</span>
                <span className="bye-breakdown__count">{byePlayers.length}</span>
                <span className="bye-breakdown__players">
                  {byePlayers.map(({ player: p, pick }) =>
                    onPickClick ? (
                      <button
                        key={p.id}
                        type="button"
                        className="bye-breakdown__player bye-breakdown__player--link"
                        onClick={() => onPickClick(pick)}
                      >
                        <span
                          className="bye-breakdown__dot"
                          style={{ ['--pos' as string]: POSITION_COLORS[p.position as Position] }}
                        />
                        {p.name}
                      </button>
                    ) : (
                      <span key={p.id} className="bye-breakdown__player">
                        <span
                          className="bye-breakdown__dot"
                          style={{ ['--pos' as string]: POSITION_COLORS[p.position as Position] }}
                        />
                        {p.name}
                      </span>
                    ),
                  )}
                </span>
              </li>
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
  row: LineupRow;
  onPickClick?: (pick: PickRow) => void;
}) {
  const { slot, player, pick } = row;
  return (
    <li className="lineup-slot">
      <span className="lineup-slot__label">
        {slot === 'BENCH' ? 'BE' : SLOT_LABELS[slot]}
      </span>
      {player ? (
        pick && onPickClick ? (
          <button
            type="button"
            className="lineup-slot__card lineup-slot__card--link"
            onClick={() => onPickClick(pick)}
          >
            <PlayerCard player={player} isKeeper={pick.is_keeper} hideValue />
          </button>
        ) : (
          <div className="lineup-slot__card">
            <PlayerCard player={player} isKeeper={pick?.is_keeper} hideValue />
          </div>
        )
      ) : (
        <div className="lineup-slot__empty muted">Empty</div>
      )}
    </li>
  );
}
