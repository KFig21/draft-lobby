import { useState } from 'react';
import type { DraftCellStyle } from '../../lib/draftCellStyle';
import type { PickRow } from '../../lib/types';
import { BoldPickCell } from './BoldPickCell';
import { PickCell } from './DraftGrid';
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

const OPTIONS: { value: DraftCellStyle; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'bold', label: 'Big screen' },
];

/** Lets the user pick a draft cell style by showing a real, live-rendered
 * example of each — same components the actual board uses, not mockups —
 * against a randomly-picked classic player so it's a little fun to look at. */
export function DraftCellStylePicker({
  value,
  onChange,
}: {
  value: DraftCellStyle;
  onChange: (style: DraftCellStyle) => void;
}) {
  // Picked once per page load, not per render — the point is a fun surprise
  // each visit to Settings, not a different player on every re-render.
  const [player] = useState(randomSamplePlayer);

  return (
    <div className="cell-style-picker">
      {OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className={`cell-style-picker__option${value === opt.value ? ' is-selected' : ''}`}
        >
          <input
            type="checkbox"
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span className="cell-style-picker__swatch">
            <table className="cell-style-picker__table">
              <tbody>
                <tr>
                  {opt.value === 'bold' ? (
                    <BoldPickCell pick={SAMPLE_PICK} player={player} />
                  ) : (
                    <PickCell
                      pick={SAMPLE_PICK}
                      player={player}
                      entry={undefined}
                      hasComment={false}
                      onEnter={() => {}}
                      onLeave={() => {}}
                    />
                  )}
                </tr>
              </tbody>
            </table>
          </span>
          <span className="cell-style-picker__name">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}
