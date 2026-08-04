import {
  USERNAME_MAX_LEN,
  USERNAME_MIN_LEN,
} from '@draft-lobby/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../env.js';
import { supabaseAdmin, supabaseAnon } from '../supabase.js';

export const authRouter = Router();

/**
 * GET /api/auth/username-available?username=… — is a username free?
 * Runs with the service role so it works for the signup screen, where the
 * caller is unauthenticated and RLS would otherwise hide every profile row
 * (profiles are SELECT-able only by authenticated users). Username existence
 * is inherently revealed by any availability check, so this exposes nothing
 * sensitive — unlike emails, which we never confirm here.
 */
authRouter.get('/username-available', async (req: Request, res: Response) => {
  const username = String(req.query.username ?? '').trim();
  if (username.length < USERNAME_MIN_LEN || username.length > USERNAME_MAX_LEN) {
    res.status(400).json({ error: 'Invalid username' });
    return;
  }
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('username', username)
    .maybeSingle();
  res.json({ available: !data });
});

const loginSchema = z.object({
  identifier: z.string().min(1), // email or username
  password: z.string().min(1),
});

const forgotSchema = z.object({
  identifier: z.string().min(1), // email or username
});

/** Resolve an email-or-username identifier to its account email, or null. */
async function emailForIdentifier(identifier: string): Promise<string | null> {
  if (identifier.includes('@')) return identifier;
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('username', identifier)
    .maybeSingle();
  if (!profile) return null;
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
    profile.id,
  );
  return userData.user?.email ?? null;
}

/**
 * POST /api/auth/login — sign in with either an email or a username.
 * Username is resolved to an email server-side (via the service role), so the
 * user's email is never exposed to the client. Returns a Supabase session for
 * the client to adopt via `supabase.auth.setSession(...)`.
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter your email/username and password' });
    return;
  }
  const { identifier, password } = parsed.data;

  const email = await emailForIdentifier(identifier);

  // Generic error regardless of which part failed (no account enumeration).
  const invalid = () =>
    res.status(401).json({ error: 'Invalid credentials' });

  if (!email) return invalid();

  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) return invalid();

  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

/**
 * POST /api/auth/forgot — request a password-reset email by email OR username.
 * Always responds 200 with the same body regardless of whether an account
 * exists (no account enumeration — same stance as /login). When an account is
 * found, sends Supabase's reset email pointing at the client's /reset-password
 * route, where the recovery session is adopted and the password updated.
 */
authRouter.post('/forgot', async (req: Request, res: Response) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter your email or username' });
    return;
  }

  const email = await emailForIdentifier(parsed.data.identifier);
  if (email) {
    const base = env.APP_URL ?? env.CLIENT_ORIGIN[0];
    await supabaseAnon.auth.resetPasswordForEmail(email, {
      redirectTo: `${base}/reset-password`,
    });
  }

  // Same reply either way.
  res.json({ ok: true });
});
