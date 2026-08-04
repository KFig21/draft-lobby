import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4100),
  // Comma-separated if you need more than one (e.g. a Vercel prod domain plus
  // a preview deployment), matching cors()'s array-of-origins support.
  CLIENT_ORIGIN: z
    .string()
    .default('http://localhost:5183')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  // Canonical public URL of the web app — the base for links we email to users
  // (password reset). Kept separate from CLIENT_ORIGIN (which is a *list* of
  // CORS-allowed origins) so link generation never depends on that list's
  // ordering. Falls back to the first CLIENT_ORIGIN when unset; set it
  // explicitly in production (e.g. https://draft-lobby.vercel.app). Empty
  // string is treated as unset.
  APP_URL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().url().optional(),
  ),
  SUPABASE_URL: z.string().url(),
  // Service-role key: server-only, never exposed to the client.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Anon key: used server-side only to perform the password grant for
  // username-based login (so the user's email never leaves the server).
  SUPABASE_ANON_KEY: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    '❌ Invalid server environment. Check your server/.env file:\n',
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;
