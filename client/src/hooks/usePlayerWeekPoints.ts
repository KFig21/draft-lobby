import { computeFantasyPoints, type ScoringRules } from '@draft-lobby/shared';
import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { PlayerWeekStatRow } from '../lib/types';

// One player's weekly rows are immutable historical actuals — cache per session
// so re-opening a player's modal (or the deep-stats modal) is instant.
const cache = new Map<string, PlayerWeekStatRow[]>();

export interface WeekPoint {
  week: number;
  pts: number;
}

/**
 * Just the subject player's week-by-week fantasy points for one season — enough
 * to draw the inline sparkline card without the heavy whole-position fetch the
 * deep-stats modal needs for peer ranking. Scored under `scoring` (falling back
 * to Sleeper's PPR total when a week has no mapped raw line, e.g. kickers).
 */
export function usePlayerWeekPoints(
  playerId: string | null,
  position: string,
  season: number | null,
  scoring: ScoringRules,
  enabled: boolean,
): { points: WeekPoint[]; byeWeeks: number[]; loading: boolean; error: boolean } {
  const [rows, setRows] = useState<PlayerWeekStatRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled || !playerId || season == null) return;
    const key = `${season}:${playerId}`;
    const cached = cache.get(key);
    if (cached) {
      setRows(cached);
      setLoading(false);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      const { data, error: err } = await supabase
        .from('player_week_stats')
        .select('player_id, position, season, week, opp, stats, pts_ppr, pos_rank_ppr, is_bye')
        .eq('season', season)
        .eq('player_id', playerId)
        .order('week', { ascending: true });
      if (cancelled) return;
      if (err) {
        setError(true);
        setLoading(false);
        return;
      }
      const batch = (data ?? []) as unknown as PlayerWeekStatRow[];
      cache.set(key, batch);
      setRows(batch);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId, season, enabled]);

  // Points are derived (not stored) so a scoring change re-scores instantly —
  // cheap over ~18 rows. Bye rows carry no game, so drop them: each remaining
  // row is a week the player recorded, and the count doubles as games played.
  const points: WeekPoint[] = (rows ?? [])
    .filter((r) => !r.is_bye)
    .map((r) => ({
      week: r.week,
      pts:
        r.stats && Object.keys(r.stats).length > 0
          ? computeFantasyPoints(r.stats, scoring, position)
          : (r.pts_ppr ?? 0),
    }));

  // The week(s) marked as a bye — so callers can leave the bye out of a weekly
  // axis rather than drawing it as a played-nothing week.
  const byeWeeks: number[] = (rows ?? []).filter((r) => r.is_bye).map((r) => r.week);

  return { points, byeWeeks, loading, error };
}
