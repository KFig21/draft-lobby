import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { PlayerRow } from '../lib/types';

/** Loads the full player pool once (it doesn't change mid-draft). */
export function usePlayers() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Page through in 1000-row batches: PostgREST caps a single response at
    // ~1000 rows, and the pool is larger than that, so a plain select() would
    // silently drop the tail (players with the worst/undefined ADP) — which
    // then read as "player not found" in search and keeper imports.
    (async () => {
      const PAGE = 1000;
      const all: PlayerRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data } = await supabase
          .from('players')
          .select('*')
          .order('adp', { ascending: true, nullsFirst: false })
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        all.push(...(data as PlayerRow[]));
        if (data.length < PAGE) break;
      }
      if (!cancelled) {
        setPlayers(all);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { players, loading };
}
