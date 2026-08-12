import { isUnlimitedPick, type PickTier } from '@draft-lobby/shared';

/** Seconds → "m:ss", e.g. 120 → "2:00", 30 → "0:30". */
export function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** A pick-clock value for display — "No limit" for an unlimited tier. */
export function formatPickClock(seconds: number): string {
  return isUnlimitedPick(seconds) ? 'No limit' : formatSeconds(seconds);
}

/** Summarize pick-clock tiers, e.g. "2:00 → 0:30" (or "1:30" if flat). */
export function clockSummary(tiers: PickTier[]): string {
  const first = tiers[0]?.seconds ?? 0;
  const last = tiers[tiers.length - 1]?.seconds ?? 0;
  if (tiers.length === 1) return formatPickClock(first);
  return `${formatPickClock(first)} → ${formatPickClock(last)}`;
}

/** "Josh Allen" → "J. Allen" — a tighter name for narrow layouts (mobile
 * Rankings' frozen player column). Multi-word last names ("Ja'Marr Chase" →
 * "J. Chase", "Marvin Harrison Jr." → "M. Harrison Jr.") keep everything
 * after the first word intact. */
export function abbreviatedName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const [first, ...rest] = parts;
  return `${first[0]}. ${rest.join(' ')}`;
}

/** "First initial. Last name" for draft-board cells — but a first name that's
 * already initials (C.J., A.J., T.J.) is kept whole so it doesn't read as a
 * different player, and D/ST entries ("BAL D/ST") aren't personal names, so
 * they're left alone. Shared by the default and clean cell styles. */
export function abbreviatePlayerName(name: string, position: string): string {
  if (position === 'DEF') return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const [first, ...rest] = parts;
  if (/^([A-Z]\.){2,}$/.test(first)) return `${first} ${rest.join(' ')}`;
  return `${first[0]?.toUpperCase() ?? ''}. ${rest.join(' ')}`;
}

/** "Round.pick" label — e.g. round 5, 2nd pick of the round. Zero-padded to
 * 2 digits once a draft has 10+ teams (round 5's 2nd pick reads as "5.02",
 * not "5.2", once picks-in-round can reach double digits); below that,
 * plain "5.2" is unambiguous on its own. */
export function formatRoundPick(round: number, pickInRound: number, teamCount: number): string {
  const pad = teamCount >= 10 ? 2 : 1;
  return `${round}.${String(pickInRound).padStart(pad, '0')}`;
}
