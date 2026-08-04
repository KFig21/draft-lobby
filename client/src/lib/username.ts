import { api } from './api';

/**
 * Server-side username availability check. Must go through the API (service
 * role) rather than a direct Supabase query: on the signup screen the caller
 * is unauthenticated, and `profiles` is only SELECT-able by authenticated
 * users, so a direct query there returns zero rows and every name looks free.
 */
export async function isUsernameAvailable(
  username: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const { available } = await api<{ available: boolean }>(
    `/auth/username-available?username=${encodeURIComponent(username)}`,
    { signal },
  );
  return available;
}
