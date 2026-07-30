import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../supabase';

export interface Favorites {
  /** null while still loading; a Set of favorited player ids once loaded. */
  favoriteIds: Set<string> | null;
  toggleFavorite: (playerId: string) => Promise<void>;
  /** False when signed out — favoriting is per-user, so it's disabled then. */
  canFavorite: boolean;
}

/** Per-user "favorite" players — a cheat-sheet bookmark that follows the user
 * across every draft (favorite_players table, RLS-owned). Shared by the
 * Rankings page and the draft room's player pool so the same stars show up in
 * both. Optimistic: this is single-user personal data, nothing to reconcile. */
export function useFavorites(): Favorites {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [favoriteIds, setFavoriteIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!userId) {
      setFavoriteIds(new Set());
      return;
    }
    void supabase
      .from('favorite_players')
      .select('player_id')
      .eq('user_id', userId)
      .then(({ data }) => setFavoriteIds(new Set((data ?? []).map((r) => r.player_id as string))));
  }, [userId]);

  async function toggleFavorite(playerId: string) {
    if (!userId || !favoriteIds) return;
    const isFav = favoriteIds.has(playerId);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
    // NB: Supabase query builders are lazy — they only fire the request when
    // awaited (or .then'd). Must await here, not fire-and-forget with `void`,
    // or the write never actually happens and the star doesn't persist.
    if (isFav) {
      await supabase
        .from('favorite_players')
        .delete()
        .eq('user_id', userId)
        .eq('player_id', playerId);
    } else {
      await supabase.from('favorite_players').insert({ user_id: userId, player_id: playerId });
    }
  }

  return { favoriteIds, toggleFavorite, canFavorite: !!userId };
}
