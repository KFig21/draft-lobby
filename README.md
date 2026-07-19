# Draft Lobby

A fantasy football draft lobby web app (mobile + desktop): create a lobby with custom league parameters, invite your league, and run a live snake/straight draft with a shared board, timer, chat, and commissioner controls.

## Stack

- **Client** — Vite + React + TypeScript + SCSS (`client/`)
- **Server** — Express + TypeScript (`server/`) — authoritative draft logic
- **Shared** — Zod schemas + types used by both (`shared/`)
- **Database/Auth/Realtime** — Supabase (`supabase/migrations/`)

## Architecture

- Supabase handles **auth**, **storage**, and **realtime fan-out** (Postgres changes on `picks`, `lobbies`, `chat_messages`, `teams` push live updates to every client in a lobby).
- The Express server is the **authority for writes** that need business rules: lobby passwords, turn order, pick validation, commissioner powers. It uses the service-role key; clients never do.
- Clients read lobby data directly from Supabase under Row Level Security (members-only), and subscribe to realtime channels for live updates.

## Getting started

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the migration: paste `supabase/migrations/0001_init.sql` into the SQL editor (or use `supabase db push` with the CLI).
3. From **Settings → API**, grab the project URL, `anon` key, and `service_role` key.

### 2. Environment

```sh
cp server/.env.example server/.env   # fill in SUPABASE_URL + SERVICE_ROLE key
cp client/.env.example client/.env   # fill in VITE_SUPABASE_URL + ANON key
```

### 3. Install, seed, run

```sh
npm install
npm run db:seed   # imports the real player pool (ADP + Sleeper)
npm run dev       # server on :4100, client on :5183
```

## Scripts

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Run server + client concurrently          |
| `npm run build`     | Build all workspaces                      |
| `npm run typecheck` | Typecheck all workspaces                  |
| `npm run db:seed`   | Import real players (FFC ADP + Sleeper)   |

## Project layout

```
client/   Vite + React app (pages, components, SCSS)
server/   Express API (auth middleware, lobby/draft routes)
shared/   Zod schemas + types shared across client/server
supabase/ SQL migrations (schema, RLS policies, realtime)
scripts/  Dev utilities (seeding)
```
