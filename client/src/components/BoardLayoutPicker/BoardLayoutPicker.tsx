import type { DraftBoardLayout } from '../../lib/draftCellStyle';
import './BoardLayoutPicker.scss';

const OPTIONS: { value: DraftBoardLayout; label: string; desc: string }[] = [
  {
    value: 'detailed',
    label: 'Detailed',
    desc: 'Roster, board, players and chat side by side in one dashboard',
  },
  {
    value: 'simple',
    label: 'Simple',
    desc: 'The classic board with a tabbed sidebar',
  },
];

/** Picks the desktop draft-board layout (see getDraftBoardLayout). A pair of
 * radio rows — label + one-line description — rather than a visual preview,
 * since the difference is the whole-page arrangement, not a single element.
 * Only takes effect on wide screens; mobile/fullscreen always use the classic
 * layout. */
export function BoardLayoutPicker({
  value,
  onChange,
}: {
  value: DraftBoardLayout;
  onChange: (layout: DraftBoardLayout) => void;
}) {
  return (
    <div className="board-layout-picker">
      {OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className={`board-layout-picker__option${value === opt.value ? ' is-selected' : ''}`}
        >
          <input
            type="radio"
            name="draftBoardLayout"
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span className="board-layout-picker__text">
            <span className="board-layout-picker__name">{opt.label}</span>
            <span className="board-layout-picker__desc muted">{opt.desc}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
