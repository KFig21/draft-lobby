import { supabase } from '../supabase';

// Empty in dev (Vite proxies /api to the local server — see vite.config.ts).
// In production, point this at the deployed API host (e.g. Railway), since
// the client and server are hosted separately.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

/**
 * Calls the Express API with the current user's Supabase access token attached.
 * Throws an Error carrying the server's message on non-2xx responses.
 */
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`${API_BASE}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message =
      (payload && typeof payload.error === 'string' && payload.error) ||
      `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload as T;
}
