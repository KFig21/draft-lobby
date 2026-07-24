import { useState } from 'react';
import type { DraftCellStyle } from '../../lib/draftCellStyle';
import type { PickRow } from '../../lib/types';
import { BoldPickCell } from './components/BoldPickCell/BoldPickCell';
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
        // A <table> isn't valid inside a <button> (button only accepts
        // phrasing content) — role="button" on a plain div is the same
        // pattern DraftGrid.tsx's own on-clock cell already uses for a
        // clickable <td> that needs richer content than a button allows.
        <div
          key={opt.value}
          role="button"
          tabIndex={0}
          aria-pressed={value === opt.value}
          className={`cell-style-picker__option${value === opt.value ? ' is-selected' : ''}`}
          onClick={() => onChange(opt.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onChange(opt.value);
            }
          }}
        >
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
        </div>
      ))}
    </div>
  );
}
