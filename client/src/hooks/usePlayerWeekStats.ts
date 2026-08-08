import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { PlayerRow, PlayerWeekStatRow } from '../lib/types';

const PAGE = 1000;

// Season+position datasets are immutable historical actuals, so cache them for
// the session — reopening the deep-stats modal for another RB is instant.
const cache = new Map<string, PlayerWeekStatRow[]>();

/**
 * Every player's week-by-week stats for one position in one season — the whole
 * position so the modal can rank a player against their peers per week / per
 * range. Fetched lazily (only when `enabled`), paginated, and cached.
 */
export function usePlayerWeekStats(
  position: PlayerRow['position'] | null,
  season: number | null,
  enabled: boolean,
): { rows: PlayerWeekStatRow[]; loading: boolean; error: boolean } {
  const [rows, setRows] = useState<PlayerWeekStatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled || !position || season == null) return;
    const key = `${season}:${position}`;
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
      const acc: PlayerWeekStatRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error: err } = await supabase
          .from('player_week_stats')
          .select('player_id, position, season, week, opp, stats, pts_ppr, pos_rank_ppr')
          .eq('season', season)
          .eq('position', position)
          .order('player_id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (err) {
          if (!cancelled) {
            setError(true);
            setLoading(false);
          }
          return;
        }
        const batch = (data ?? []) as unknown as PlayerWeekStatRow[];
        acc.push(...batch);
        if (batch.length < PAGE) break;
      }
      if (cancelled) return;
      cache.set(key, acc);
      setRows(acc);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [position, season, enabled]);

  return { rows, loading, error };
}
