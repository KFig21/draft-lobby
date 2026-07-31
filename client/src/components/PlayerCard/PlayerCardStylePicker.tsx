import type { PlayerCardStyle } from '../../lib/playerCardStyle';
import type { PlayerRow } from '../../lib/types';
import { CompactPlayerCard } from './CompactPlayerCard';
import { PlayerCard } from './PlayerCard';
import './PlayerCardStylePicker.scss';

const OPTIONS: { value: PlayerCardStyle; label: string }[] = [
  { value: 'comfy', label: 'Comfy' },
  { value: 'compact', label: 'Compact' },
];

/** Lets the user pick a player-pool row density with a real, live-rendered
 * example of each underneath (not a mockup) — same "show, don't just tell"
 * pattern as DraftCellStylePicker for the board's own cell styles. Radio +
 * colored label rather than a segmented toggle, so the picker and its
 * examples read as one list instead of a separate control-plus-preview. */
export function PlayerCardStylePicker({
  value,
  onChange,
  player,
}: {
  value: PlayerCardStyle;
  onChange: (style: PlayerCardStyle) => void;
  /** Sample player rendered in the previews — the parent passes the same one
   * shown in the Cell-style and Team-colors previews. */
  player: PlayerRow;
}) {
  return (
    <div className="card-style-picker">
      {OPTIONS.map((opt) => (
        <div key={opt.value} className="card-style-picker__option">
          <label className="card-style-picker__radio-row">
            <input
              type="radio"
              name="playerCardStyle"
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            <span
              className={`card-style-picker__name${value === opt.value ? ' is-selected' : ''}`}
            >
              {opt.label}
            </span>
          </label>
          <div className="card-style-picker__preview">
            {opt.value === 'compact' ? (
              <CompactPlayerCard
                player={player}
                posRank={player.proj_rank}
                favorited
                queued={false}
                onFavorite={() => {}}
                onQueue={() => {}}
              />
            ) : (
              <PlayerCard
                player={player}
                posRank={player.proj_rank}
                favorited
                queued={false}
                onFavorite={() => {}}
                onQueue={() => {}}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
