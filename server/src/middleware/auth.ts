import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../supabase.js';

export interface AuthedRequest extends Request {
  user?: { id: string; email: string | null };
  accessToken?: string;
}

/**
 * Verifies the Supabase access token from the Authorization header and
 * attaches the authenticated user to the request. Rejects if missing/invalid.
 */
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.user = { id: data.user.id, email: data.user.email ?? null };
  req.accessToken = token;
  next();
}
