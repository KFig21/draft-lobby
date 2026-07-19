import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { PlayerRow } from '../lib/types';

/** Loads the full player pool once (it doesn't change mid-draft). */
export function usePlayers() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('players')
      .select('*')
      .order('adp', { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        if (!cancelled && data) setPlayers(data as PlayerRow[]);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { players, loading };
}
