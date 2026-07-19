import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin, supabaseAnon } from '../supabase.js';

export const authRouter = Router();

const loginSchema = z.object({
  identifier: z.string().min(1), // email or username
  password: z.string().min(1),
});

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

  let email: string | null = null;
  if (identifier.includes('@')) {
    email = identifier;
  } else {
    // Look up the profile by username (case-insensitive), then its auth email.
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('username', identifier)
      .maybeSingle();
    if (profile) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
        profile.id,
      );
      email = userData.user?.email ?? null;
    }
  }

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
