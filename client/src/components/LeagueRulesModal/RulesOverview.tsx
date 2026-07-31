import {
  SCORING_PRESETS,
  matchPreset,
  roundsForSettings,
  type LobbySettings,
} from '@draft-lobby/shared';
import AssignmentIcon from '@mui/icons-material/Assignment';
import GroupsIcon from '@mui/icons-material/Groups';
import LockIcon from '@mui/icons-material/Lock';
import RepeatIcon from '@mui/icons-material/Repeat';
import ScoreboardIcon from '@mui/icons-material/Scoreboard';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import { type ComponentType } from 'react';
import { clockSummary } from '../../lib/format';
import './LeagueRulesModal.scss';

/** The "Overview" heading + six-tile "Teams / Draft type / Rounds / Pick
 * clock / Scoring / Keepers" stat grid — the League rules modal's own
 * Overview section, pulled out so the lobby room can show the same
 * at-a-glance summary (see LobbyRoomPage's room__overview, which wraps this
 * in a button that opens the full modal). Reuses LeagueRulesModal.scss's
 * classes rather than a copy, so the two stay visually identical without
 * duplicated CSS. */
export function RulesOverview({ settings }: { settings: LobbySettings }) {
  const preset = matchPreset(settings.scoring);
  const scoringLabel = preset ? SCORING_PRESETS[preset].label : 'Custom';
  const totalRounds = roundsForSettings(settings);

  return (
    <>
      <h3 className="rules-modal__h3">
        <AssignmentIcon fontSize="small" className="rules-modal__h-icon" />
        Overview
      </h3>
      <div className="rules-modal__overview">
        {(
          [
            ['Teams', String(settings.teamCount), GroupsIcon],
            ['Draft type', settings.draftType === 'SNAKE' ? 'Snake' : 'Straight', SwapVertIcon],
            ['Rounds', String(totalRounds), RepeatIcon],
            ['Pick clock', clockSummary(settings.pickTiers), TimerOutlinedIcon],
            ['Scoring', scoringLabel, ScoreboardIcon],
            ['Keepers', settings.keepersEnabled ? 'On' : 'Off', LockIcon],
          ] as [string, string, ComponentType<{ fontSize?: 'small'; className?: string }>][]
        ).map(([label, value, Icon]) => (
          <div className="rules-modal__stat" key={label}>
            <span className="rules-modal__stat-label">
              <Icon fontSize="small" className="rules-modal__stat-icon" />
              {label}
            </span>
            <span className="rules-modal__stat-value">{value}</span>
          </div>
        ))}
      </div>
    </>
  );
}
