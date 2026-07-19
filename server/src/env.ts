import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4100),
  CLIENT_ORIGIN: z.string().default('http://localhost:5183'),
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
