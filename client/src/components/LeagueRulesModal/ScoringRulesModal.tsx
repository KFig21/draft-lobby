import {
  SCORING_PRESETS,
  groupScoringRules,
  matchPreset,
  type ScoringRules,
} from '@draft-lobby/shared';
import ScoreboardIcon from '@mui/icons-material/Scoreboard';
import { useMemo } from 'react';
import { Modal } from '../Modal/Modal';
import './LeagueRulesModal.scss';

interface Props {
  rules: ScoringRules;
  /** Badge label when `rules` isn't an exact preset match — e.g. a saved
   * format's own name. Presets always show their own label regardless. */
  name?: string;
  onClose: () => void;
}

/** Read-only scoring breakdown for a bare ScoringRules value — the same
 * grouped-card layout as LeagueRulesModal's own Scoring section, standing
 * alone (no lineup/pick-clock/save-league sections) for pages that only ever
 * deal with a scoring format on its own, like Rankings' ruleset picker. */
export function ScoringRulesModal({ rules, name, onClose }: Props) {
  const preset = matchPreset(rules);
  const label = preset ? SCORING_PRESETS[preset].label : (name ?? 'Custom');
  const scoringGroups = useMemo(() => groupScoringRules(rules), [rules]);

  return (
    <Modal title="Scoring rules" onClose={onClose} wide>
      <div className="rules-modal">
        <section className="rules-modal__section">
          <h3 className="rules-modal__h3">
            <ScoreboardIcon fontSize="small" className="rules-modal__h-icon" />
            Scoring
            <span className="rules-modal__preset-badge">{label}</span>
          </h3>
          <div className="rules-modal__scoring-grid">
            {scoringGroups.map(({ group, items }) => (
              <div className="rules-modal__scoregroup" key={group}>
                <h4>{group}</h4>
                <div className="rules-modal__scoregroup-body">
                  <ul className="rules-modal__scorelist">
                    {items.map((it, i) => (
                      <li key={i}>
                        <span className="rules-modal__scorelabel">{it.label}</span>
                        <span className="rules-modal__scoreval">{it.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
