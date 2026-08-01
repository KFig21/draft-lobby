import type { DraftGrade } from '@draft-lobby/shared';

/** Letter grades don't average numerically — the most common one stands in
 * for an "overall" grade across everyone who graded a team. */
export function mostCommonGrade(grades: { grade: DraftGrade }[]): DraftGrade | null {
  if (grades.length === 0) return null;
  const counts = new Map<DraftGrade, number>();
  for (const g of grades) counts.set(g.grade, (counts.get(g.grade) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
