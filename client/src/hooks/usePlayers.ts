import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { PlayerRow } from '../lib/types';

const PAGE = 1000;

/** One player_seasons row joined to its player's stable identity. */
interface SeasonRow {
  player_id: string;
  season: number;
  nfl_team: string | null;
  bye_week: number | null;
  injury_status: string | null;
  adp: number | null;
  proj_points: number | null;
  proj_rank: number | null;
  proj_stat_line: string | null;
  proj_stats: Record<string, number> | null;
  act_points: number | null;
  act_rank: number | null;
  act_stat_line: string | null;
  act_stats: Record<string, number> | null;
  players: { name: string; position: PlayerRow['position'] } | { name: string; position: PlayerRow['position'] }[] | null;
}

function sortByAdp(rows: PlayerRow[]): PlayerRow[] {
  return rows.sort((a, b) => (a.adp ?? Infinity) - (b.adp ?? Infinity));
}

/**
 * Assemble the season-scoped pool: projection + bio from the draft's season,
 * "last year" line from the season before. The pool is defined by the CURRENT
 * season's rows — a player with only a prior-season row (dropped from this
 * year's pool) isn't draftable, so they're excluded.
 *
 * Returns null if the query errors (e.g. player_seasons doesn't exist yet,
 * pre-migration 0041) so the caller can fall back to the flat players.* columns.
 */
async function fetchSeasonScoped(season: number): Promise<PlayerRow[] | null> {
  const byPlayer = new Map<
    string,
    { ident: { name: string; position: PlayerRow['position'] }; cur?: SeasonRow; prev?: SeasonRow }
  >();

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('player_seasons')
      .select(
        'player_id, season, nfl_team, bye_week, injury_status, adp, ' +
          'proj_points, proj_rank, proj_stat_line, proj_stats, ' +
          'act_points, act_rank, act_stat_line, act_stats, ' +
          'players!inner ( name, position )',
      )
      .in('season', [season, season - 1])
      .order('player_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return null;
    const rows = (data ?? []) as unknown as SeasonRow[];
    for (const r of rows) {
      const ident = Array.isArray(r.players) ? r.players[0] : r.players;
      if (!ident) continue;
      let e = byPlayer.get(r.player_id);
      if (!e) {
        e = { ident };
        byPlayer.set(r.player_id, e);
      }
      if (r.season === season) e.cur = r;
      else e.prev = r;
    }
    if (rows.length < PAGE) break;
  }

  const all: PlayerRow[] = [];
  for (const [id, e] of byPlayer) {
    if (!e.cur) continue; // draftable pool = players with a current-season row
    const cur = e.cur;
    const prev = e.prev;
    all.push({
      id,
      name: e.ident.name,
      position: e.ident.position,
      nfl_team: cur.nfl_team ?? '',
      bye_week: cur.bye_week,
      injury_status: cur.injury_status ?? 'ACTIVE',
      proj_points: cur.proj_points,
      proj_rank: cur.proj_rank,
      proj_stat_line: cur.proj_stat_line,
      proj_stats: cur.proj_stats,
      adp: cur.adp,
      prev_points: prev?.act_points ?? null,
      prev_rank: prev?.act_rank ?? null,
      prev_stat_line: prev?.act_stat_line ?? null,
      prev_stats: prev?.act_stats ?? null,
    });
  }
  return sortByAdp(all);
}

/** Legacy path: the flat players.* columns. Used until migration 0041 lands. */
async function fetchFlat(): Promise<PlayerRow[]> {
  const all: PlayerRow[] = [];
  // Page in 1000-row batches: PostgREST caps a single response at ~1000 rows,
  // and the pool is larger than that, so a plain select() would silently drop
  // the tail (worst/undefined ADP) — which then reads as "player not found".
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
  return all;
}

/**
 * Loads the player pool for a given fantasy season (it doesn't change mid-draft).
 * Season-scoped rows (player_seasons) are preferred; if that query errors — e.g.
 * before migration 0041 is applied — it falls back to the flat players.* columns
 * so the app keeps working regardless of deploy/migration ordering.
 *
 * @param season the draft's fantasy year; defaults to the current calendar year
 *   (used by the global Rankings page and while a lobby is still loading).
 */
export function usePlayers(season?: number) {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const targetSeason = season ?? new Date().getFullYear();
    setLoading(true);
    (async () => {
      const scoped = await fetchSeasonScoped(targetSeason);
      const all = scoped ?? (await fetchFlat());
      if (!cancelled) {
        setPlayers(all);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [season]);

  return { players, loading };
}
