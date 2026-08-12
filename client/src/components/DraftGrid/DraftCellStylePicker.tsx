import { useState } from 'react';
import type { DraftCellStyle } from '../../lib/draftCellStyle';
import type { PickRow, PlayerRow } from '../../lib/types';
import { BoldPickCell } from './components/BoldPickCell/BoldPickCell';
import { DefaultPickCell } from './components/DefaultPickCell/DefaultPickCell';
import type { ReactionEntry } from './components/PickCell/PickCell';
import { PickCell } from './components/PickCell/PickCell';
import { randomSamplePlayer } from './samplePlayers';
import './DraftCellStylePicker.scss';

const SAMPLE_PICK: PickRow = {
  id: 'sample',
  lobby_id: 'sample',
  overall: 1,
  round: 1,
  team_id: 'sample',
  player_id: 'sample',
  is_keeper: false,
  is_auto_pick: false,
  picked_at: new Date().toISOString(),
};

// Fake reaction/comment data for the swatch preview — only meaningful when
// showReactions is on (see the Props comment below).
const SAMPLE_ENTRY: ReactionEntry = { counts: { '🔥': 2 }, mine: new Set() };

// A 12-team league, just to give Default's round.pick line something to
// render (and show off its 10+ team zero-padding, e.g. "1.01").
const SAMPLE_TEAM_COUNT = 12;

const OPTIONS: { value: DraftCellStyle; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'bold', label: 'Big screen' },
  { value: 'clean', label: 'Clean' },
];

/** Lets the user pick a draft cell style by showing a real, live-rendered
 * example of each — same components the actual board uses, not mockups —
 * against a randomly-picked classic player so it's a little fun to look at. */
export function DraftCellStylePicker({
  value,
  onChange,
  showReactions,
  player: playerProp,
}: {
  value: DraftCellStyle;
  onChange: (style: DraftCellStyle) => void;
  /** Mirrors the "Reactions on cells" setting — shows a sample reaction/
   * comment flag-chip on the previews when on, so this control's own effect
   * is visible right next to it instead of only on the real board. */
  showReactions: boolean;
  /** Sample player to preview. Omit to pick one at random on mount; the
   * parent passes a shared one so the Team-colors preview below can show the
   * same player. */
  player?: PlayerRow;
}) {
  // Picked once per page load, not per render — the point is a fun surprise
  // each visit to Settings, not a different player on every re-render.
  const [ownPlayer] = useState(randomSamplePlayer);
  const player = playerProp ?? ownPlayer;

  return (
    <div className="cell-style-picker">
      {OPTIONS.map((opt) => (
        <div key={opt.value} className="cell-style-picker__option">
          <label className="cell-style-picker__radio-row">
            <input
              type="radio"
              name="draftCellStyle"
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            <span
              className={`cell-style-picker__name${value === opt.value ? ' is-selected' : ''}`}
            >
              {opt.label}
            </span>
          </label>
          {/* The swatch is a mouse convenience: clicking it selects that style
              too. The radio row above stays the accessible/keyboard control. */}
          <span
            className="cell-style-picker__swatch"
            onClick={() => onChange(opt.value)}
          >
            <table className="cell-style-picker__table">
              <tbody>
                <tr>
                  {opt.value === 'bold' ? (
                    <BoldPickCell
                      pick={SAMPLE_PICK}
                      player={player}
                      entry={showReactions ? SAMPLE_ENTRY : undefined}
                      hasComment={showReactions}
                    />
                  ) : opt.value === 'clean' ? (
                    <PickCell
                      pick={SAMPLE_PICK}
                      player={player}
                      teamCount={SAMPLE_TEAM_COUNT}
                      entry={showReactions ? SAMPLE_ENTRY : undefined}
                      hasComment={showReactions}
                      onEnter={() => {}}
                      onLeave={() => {}}
                    />
                  ) : (
                    <DefaultPickCell
                      pick={SAMPLE_PICK}
                      player={player}
                      teamCount={SAMPLE_TEAM_COUNT}
                      entry={showReactions ? SAMPLE_ENTRY : undefined}
                      hasComment={showReactions}
                    />
                  )}
                </tr>
              </tbody>
            </table>
          </span>
        </div>
      ))}
    </div>
  );
}
