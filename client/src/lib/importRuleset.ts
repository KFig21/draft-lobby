import type { DraftMode, DraftSetupSnapshot, LobbySettings, ScoringRules } from '@draft-lobby/shared';
import { api } from './api';
import { supabase } from '../supabase';
import type { LobbyRow } from './types';

export interface SharedRuleset {
  id: string;
  owner_id: string;
  kind: 'SCORING' | 'LEAGUE' | 'DRAFT_SETUP';
  name: string;
  payload: ScoringRules | LobbySettings | DraftSetupSnapshot;
}

/** Fetch a shared ruleset by its token id (RLS lets any signed-in user read
 * one — the id is the unguessable share token). */
export async function fetchSharedRuleset(id: string): Promise<SharedRuleset | null> {
  const { data } = await supabase
    .from('shared_rulesets')
    .select('id, owner_id, kind, name, payload')
    .eq('id', id)
    .maybeSingle();
  return (data as SharedRuleset | null) ?? null;
}

/** Copy a shared SCORING/LEAGUE ruleset into the current user's own saved
 * formats/leagues. The snapshot itself is never edited — this just clones it
 * under the importer. A DRAFT_SETUP isn't a clone-into-a-table import — it
 * materializes a lobby (see createLobbyFromSharedSetup) — so it's rejected here.
 * Returns the kind imported, or throws on failure. */
export async function importSharedRuleset(
  shared: SharedRuleset,
  userId: string,
): Promise<'SCORING' | 'LEAGUE'> {
  if (shared.kind === 'DRAFT_SETUP') {
    throw new Error('A shared draft setup is created as a lobby, not imported here');
  }
  if (shared.kind === 'SCORING') {
    const { error } = await supabase
      .from('scoring_formats')
      .insert({ user_id: userId, name: shared.name, rules: shared.payload });
    if (error) throw new Error(error.message);
    return 'SCORING';
  }
  const { error } = await supabase
    .from('league_templates')
    .insert({ user_id: userId, name: shared.name, settings: shared.payload });
  if (error) throw new Error(error.message);
  return 'LEAGUE';
}

/** Materialize a shared DRAFT_SETUP snapshot into a fresh lobby the caller
 * commissions (settings + seats + keepers). Unlike SCORING/LEAGUE — which clone
 * into a saved format/league — this creates a real staging lobby server-side.
 * Returns the new lobby. */
export async function createLobbyFromSharedSetup(
  sharedId: string,
  name: string,
  draftMode: DraftMode,
  /** Draft position of the seat the caller takes (omit → the first seat). */
  mySeat?: number,
  /** Turn every other seat into a bot (a ready-to-run solo mock). */
  fillBots = false,
): Promise<LobbyRow> {
  const res = await api<{ lobby: LobbyRow }>('/lobbies/from-shared-setup', {
    method: 'POST',
    body: { sharedId, name, draftMode, mySeat, fillBots },
  });
  return res.lobby;
}
