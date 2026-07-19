import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Admin client using the service-role key. Bypasses Row Level Security,
 * so it must only ever be used server-side after we've authorized the caller.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/**
 * Anon client for auth flows that must run with the public key (e.g. the
 * password grant used to resolve username → session server-side).
 */
export const supabaseAnon: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/**
 * Build a client scoped to an end-user's access token. RLS policies apply,
 * so this reflects exactly what that user is allowed to see/do.
 */
export function supabaseForToken(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
