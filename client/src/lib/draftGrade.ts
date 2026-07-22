import type { DraftGrade } from '@draft-lobby/shared';
import type { PickRow, PlayerRow } from './types';

/**
 * Provisional "how'd you do" heuristic for a team's own draft grade: average
 * ADP value across its picks (positive = got players later than their ADP
 * suggested — good value; negative = reached). Thresholds are a rough first
 * pass, not tuned against real outcomes yet — revisit once there's data to
 * calibrate against (e.g. actual season-end standings).
 */
export function computeDraftGrade(
  teamId: string,
  picks: PickRow[],
  playersById: Map<string, PlayerRow>,
): DraftGrade | null {
  let totalValue = 0;
  let counted = 0;
  for (const p of picks) {
    if (p.team_id !== teamId) continue;
    const player = playersById.get(p.player_id);
    if (!player || player.adp == null) continue;
    totalValue += player.adp - p.overall;
    counted++;
  }
  if (counted === 0) return null;
  const avg = totalValue / counted;

  if (avg >= 8) return 'A+';
  if (avg >= 5) return 'A';
  if (avg >= 3) return 'A-';
  if (avg >= 1.5) return 'B+';
  if (avg >= 0.5) return 'B';
  if (avg >= -0.5) return 'B-';
  if (avg >= -1.5) return 'C+';
  if (avg >= -3) return 'C';
  if (avg >= -5) return 'C-';
  if (avg >= -8) return 'D+';
  if (avg >= -12) return 'D';
  return 'F';
}

/** Letter grades don't average numerically — the most common one stands in
 * for an "overall" grade across everyone who graded a team. */
export function mostCommonGrade(grades: { grade: DraftGrade }[]): DraftGrade | null {
  if (grades.length === 0) return null;
  const counts = new Map<DraftGrade, number>();
  for (const g of grades) counts.set(g.grade, (counts.get(g.grade) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
