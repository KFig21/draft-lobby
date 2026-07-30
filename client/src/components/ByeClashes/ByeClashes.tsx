import { POSITIONS, POSITION_COLORS, type Position } from '@draft-lobby/shared';
import './ByeClashes.scss';

interface Props {
  byeWeek: number | null;
  /** Per-position count of the viewer's own drafted players sharing this bye
   * week — omit (or leave every position at 0) to render nothing. */
  counts?: Partial<Record<Position, number>>;
}

/**
 * "Would drafting/viewing this player stack a bye week?" — shown beneath the
 * stat grid in both PlayerDetailModal (an undrafted player) and PickModal (an
 * already-made pick). One chip per position with 1+ existing player sharing
 * the bye week, not just this player's own position — e.g. drafting a WR on
 * a week you've already loaded up on at RB is just as worth flagging.
 */
export function ByeClashes({ byeWeek, counts }: Props) {
  const entries = POSITIONS.map((pos) => [pos, counts?.[pos] ?? 0] as const).filter(
    ([, count]) => count > 0,
  );
  if (byeWeek == null || entries.length === 0) return null;

  // The header badge is the TOTAL clashing players across every position
  // (e.g. RB · 1 + WR · 2 = 3), not the number of distinct positions.
  const totalClashes = entries.reduce((sum, [, count]) => sum + count, 0);
  const badgeSeverity = totalClashes >= 3 ? 'danger' : totalClashes === 2 ? 'warning' : 'neutral';

  return (
    <div className="bye-clashes">
      <div className="bye-clashes__header">
        <span className="bye-clashes__label">Bye week {byeWeek} clashes</span>
        <span className={`bye-clashes__count bye-clashes__count--${badgeSeverity}`}>
          {totalClashes}
        </span>
      </div>
      <div className="bye-clashes__list">
        {entries.map(([pos, count]) => (
          <span
            key={pos}
            className={`bye-clashes__chip bye-clashes__chip--${count >= 2 ? 'danger' : 'warning'}`}
          >
            <span
              className="bye-clashes__dot"
              style={{ background: POSITION_COLORS[pos] }}
              aria-hidden
            />
            {pos === 'DEF' ? 'D/ST' : pos} · {count}
          </span>
        ))}
      </div>
    </div>
  );
}
