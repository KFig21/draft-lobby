import type { LobbySettings, ScoringRules } from '@draft-lobby/shared';
import { supabase } from '../supabase';

export interface SharedRuleset {
  id: string;
  owner_id: string;
  kind: 'SCORING' | 'LEAGUE';
  name: string;
  payload: ScoringRules | LobbySettings;
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

/** Copy a shared ruleset into the current user's own saved formats/leagues.
 * The snapshot itself is never edited — this just clones it under the importer.
 * Returns the kind imported, or throws on failure. */
export async function importSharedRuleset(
  shared: SharedRuleset,
  userId: string,
): Promise<'SCORING' | 'LEAGUE'> {
  if (shared.kind === 'SCORING') {
    const { error } = await supabase
      .from('scoring_formats')
      .insert({ user_id: userId, name: shared.name, rules: shared.payload });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from('league_templates')
      .insert({ user_id: userId, name: shared.name, settings: shared.payload });
    if (error) throw new Error(error.message);
  }
  return shared.kind;
}
