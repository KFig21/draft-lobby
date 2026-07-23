import { DRAFT_GRADE_COLORS, type DraftGrade } from '@draft-lobby/shared';
import './GradeBadge.scss';

interface Props {
  /** null renders a neutral placeholder square — no grades yet. */
  grade: DraftGrade | null;
  size?: number;
}

/** Colored rounded-square badge for a letter grade — same convention as the
 * player position badges (bright fill, dark text for contrast). */
export function GradeBadge({ grade, size = 22 }: Props) {
  return (
    <span
      className={`grade-badge${grade ? '' : ' grade-badge--empty'}`}
      style={{
        width: size,
        height: size,
        background: grade ? DRAFT_GRADE_COLORS[grade] : undefined,
        fontSize: size * 0.5,
      }}
    >
      {grade ?? '—'}
    </span>
  );
}
