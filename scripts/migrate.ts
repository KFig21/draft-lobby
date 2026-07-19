/**
 * Applies pending SQL migrations in supabase/migrations in filename order,
 * tracking applied ones in a `_migrations` table. Idempotent.
 *
 * Needs DATABASE_URL in server/.env — the Postgres connection string from
 * Supabase → Settings → Database → "Connection string" (URI, with password).
 *
 * Usage: npm run db:migrate
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
config({ path: join(root, 'server', '.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    'Missing DATABASE_URL in server/.env.\n' +
      'Get it from Supabase → Settings → Database → Connection string (URI).',
  );
  process.exit(1);
}

const migrationsDir = join(root, 'supabase', 'migrations');

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(
      `create table if not exists public._migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    const { rows } = await client.query<{ name: string }>(
      'select name from public._migrations',
    );
    const applied = new Set(rows.map((r) => r.name));

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      process.stdout.write(`Applying ${file}… `);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into public._migrations (name) values ($1)', [
          file,
        ]);
        await client.query('commit');
        console.log('✓');
        ran++;
      } catch (err) {
        await client.query('rollback');
        throw new Error(`${file} failed: ${(err as Error).message}`);
      }
    }
    console.log(ran === 0 ? 'Already up to date.' : `Applied ${ran} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
