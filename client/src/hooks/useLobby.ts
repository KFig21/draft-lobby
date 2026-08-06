import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import type { KeeperOptionRow, LobbyRow, MemberRow, PickRow, TeamRow } from '../lib/types';

export interface LobbyState {
  lobby: LobbyRow | null;
  teams: TeamRow[];
  members: MemberRow[];
  picks: PickRow[];
  keeperOptions: KeeperOptionRow[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Loads a lobby's data and keeps it live via Supabase Realtime.
 * Any insert/update on picks, teams, or the lobby triggers a targeted refetch.
 */
export function useLobby(lobbyId: string): LobbyState {
  const [lobby, setLobby] = useState<LobbyRow | null>(null);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [picks, setPicks] = useState<PickRow[]>([]);
  const [keeperOptions, setKeeperOptions] = useState<KeeperOptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLobby = useCallback(async () => {
    const { data, error } = await supabase
      .from('lobbies')
      .select('*')
      .eq('id', lobbyId)
      .single();
    if (error) setError(error.message);
    else setLobby(data as LobbyRow);
  }, [lobbyId]);

  const fetchTeams = useCallback(async () => {
    const { data } = await supabase
      .from('teams')
      .select('*')
      .eq('lobby_id', lobbyId)
      .order('draft_position');
    if (data) setTeams(data as TeamRow[]);
  }, [lobbyId]);

  const fetchMembers = useCallback(async () => {
    const { data } = await supabase
      .from('lobby_members')
      .select('user_id, role, profiles ( username, avatar )')
      .eq('lobby_id', lobbyId);
    if (data) setMembers(data as unknown as MemberRow[]);
  }, [lobbyId]);

  const fetchPicks = useCallback(async () => {
    const { data } = await supabase
      .from('picks')
      .select('*')
      .eq('lobby_id', lobbyId)
      .order('overall');
    if (data) setPicks(data as PickRow[]);
  }, [lobbyId]);

  const fetchKeeperOptions = useCallback(async () => {
    const { data } = await supabase
      .from('keeper_options')
      .select('*')
      .eq('lobby_id', lobbyId);
    if (data) setKeeperOptions(data as KeeperOptionRow[]);
  }, [lobbyId]);

  const refetch = useCallback(() => {
    void Promise.all([
      fetchLobby(),
      fetchTeams(),
      fetchMembers(),
      fetchPicks(),
      fetchKeeperOptions(),
    ]);
  }, [fetchLobby, fetchTeams, fetchMembers, fetchPicks, fetchKeeperOptions]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchLobby(),
      fetchTeams(),
      fetchMembers(),
      fetchPicks(),
      fetchKeeperOptions(),
    ]).finally(() => setLoading(false));

    const channel = supabase
      .channel(`lobby:${lobbyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'picks', filter: `lobby_id=eq.${lobbyId}` },
        () => void fetchPicks(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `lobby_id=eq.${lobbyId}` },
        () => {
          void fetchTeams();
          // A join writes a teams row too — refetch members here so joins live-
          // update even where lobby_members realtime (migration 0039) isn't
          // available yet. The lobby_members subscription below covers the rest
          // (role changes, kicks); the overlap on joins is a cheap extra query.
          void fetchMembers();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobby_members', filter: `lobby_id=eq.${lobbyId}` },
        () => void fetchMembers(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'keeper_options', filter: `lobby_id=eq.${lobbyId}` },
        () => void fetchKeeperOptions(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobbies', filter: `id=eq.${lobbyId}` },
        () => void fetchLobby(),
      )
      // Unfiltered: a profile edit (avatar/username) can belong to any
      // member, and postgres_changes filters can't match "id in (...)".
      // profiles is public-readable anyway, so no RLS concern either way.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => void fetchMembers(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [lobbyId, fetchLobby, fetchTeams, fetchMembers, fetchPicks, fetchKeeperOptions]);

  return { lobby, teams, members, picks, keeperOptions, loading, error, refetch };
}
