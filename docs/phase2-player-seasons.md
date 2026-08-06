# Phase 2 — Season-scoped player data (`player_seasons`)

> Status: **code built, pending migration + re-import.** Phase 1 (lobby `season` column +
> My Drafts year badge & filter) shipped in migration `0040`. Phase 2's code — migration
> `0041`, importer rework, and the season-aware read path — is committed. The read path
> **falls back to the flat `players.*` columns whenever the season-scoped query errors**
> (e.g. before `0041` is applied), so the whole change is deploy-order-safe: it can ship
> before or after the migration. Outstanding: (1) run `0041` (backfills the current 2026
> snapshot — do this before any 2027 import), (2) run the updated importer to populate
> season rows going forward, (3) a later cleanup migration to drop the now-redundant flat
> columns once nothing reads them.

## 1. Goal & constraints

The app must, indefinitely:

1. **Show era-correct numbers** — a 2026 draft always shows the 2026 projection next to
   2025 actuals; a 2027 draft shows 2027 proj + 2026 actuals. Re-importing for 2027 must
   not change what a 2026 draft displays.
2. **Never mess up player identity** — a player who plays multiple seasons is one row in
   `players`; `picks.player_id` and `favorite_players.player_id` must keep pointing at the
   same stable id forever (`picks.player_id` has **no cascade**, so a changed id silently
   orphans pick history — see migration `0024`).
3. **Keep favorites forever** — a favorited player stays favorited across every season and
   every draft until the user unfavorites.
4. **Never lose actuals** — 2026's real results must survive the 2027 import (today they'd
   be overwritten the year after they land).

## 2. Current state (what exists today)

Everything about a player is **flat columns on one `players` row**, upserted each import on
`unique (name, position)` ([scripts/import-players.ts:427](../scripts/import-players.ts#L419)):

| column(s) | meaning | changes yearly? |
|---|---|---|
| `name`, `position` | identity (upsert key) | no |
| `nfl_team`, `bye_week`, `injury_status` | current bio | **yes** |
| `adp` | this season's draft ADP | **yes** |
| `proj_points`, `proj_rank`, `proj_stat_line`, `proj_stats` | **this** season's projection | **yes** |
| `prev_points`, `prev_rank`, `prev_stat_line`, `prev_stats` | **last** season's actuals | **yes** |

**How stats are stored** (relevant to the design): three parallel forms per side —
- `*_stats` **`jsonb`** = key:value counting stats keyed by `FOOTBALL_CATALOG` keys
  (`shared/src/scoring.ts`), e.g. `{ "passingYards": 4102, "passingTd": 28, "reception": 0, … }`.
  This is the real payload — [playerPoints.ts](../client/src/lib/playerPoints.ts#L19) re-scores
  it under each lobby's own rules. **Not** a flat string.
- `*_stat_line` **`text`** = pre-rendered display string, e.g. `"4,102 yd · 28 TD · 6 INT"`.
- `*_points` (numeric) + `*_rank` (int) = scalar total + positional rank; the PPR fallback,
  and the **only** form K/DEF have (Sleeper keys those differently — `toStatLine` returns null).

The bug: the importer's `SEASON = new Date().getUTCFullYear()` and the upsert **overwrites**
these columns in place. Run it in 2027 → every 2026 board retroactively shows 2027 numbers,
and 2026 actuals are gone. Identity + favorites are already safe (stable id, FK to id).

Consumers that read these columns (must all keep working):
- [client/src/hooks/usePlayers.ts](../client/src/hooks/usePlayers.ts) — `from('players').select('*')`, global.
- [client/src/lib/playerPoints.ts](../client/src/lib/playerPoints.ts) — re-scores `*_stats`.
- [client/src/components/PlayerStatBlock/PlayerStatBlock.tsx](../client/src/components/PlayerStatBlock/PlayerStatBlock.tsx) — renders proj/prev.
- [client/src/pages/Rankings/RankingsPage.tsx](../client/src/pages/Rankings/RankingsPage.tsx) — proj/prev toggle (global).
- [client/src/lib/powerRankings.ts](../client/src/lib/powerRankings.ts) + PowerRankings panel — `proj_points`.
- [server/src/draftEngine.ts:375](../server/src/draftEngine.ts#L375) — bot autodraft selects `id, position, proj_points, proj_stats, adp`.

## 3. Target schema

Split **identity** (stable) from **season data** (per-year). `players` shrinks to identity;
a new `player_seasons` holds one row per `(player, season)` carrying both the projection made
**for** that season and the actuals **of** that season.

```sql
-- players — stable identity. Upsert key (name, position) unchanged, so picks
-- and favorites keep pointing at the same id forever.
--   id, name, position
--   (optional convenience: latest_team text — most recent nfl_team, for a
--    global player search UI that isn't tied to any one draft season)

create table public.player_seasons (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players (id) on delete cascade,
  season        int  not null,                       -- e.g. 2026

  -- season-specific bio + draft prep
  nfl_team      text,
  bye_week      int,
  injury_status text not null default 'ACTIVE',
  adp           numeric,

  -- projection MADE FOR this season
  proj_points    numeric,
  proj_rank      int,
  proj_stat_line text,
  proj_stats     jsonb,

  -- what the player ACTUALLY did this season (filled after the season completes)
  act_points     numeric,
  act_rank       int,
  act_stat_line  text,
  act_stats      jsonb,

  unique (player_id, season)
);

create index player_seasons_season_idx on public.player_seasons (season);
-- Read-only reference data; no per-user rows. RLS: enable + a single
-- "authenticated can read" policy (mirror how players is exposed today).
```

**Why one row holds both proj and actuals:** "2026 projections" and "2025 stats" stop being
two different concepts. They're the same table read from two seasons:

| a draft for season N shows… | source |
|---|---|
| projection / ADP / bye / injury | `player_seasons` where `season = N` → `proj_*`, `adp`, `nfl_team`, … |
| "last year" line | `player_seasons` where `season = N-1` → `act_*` |

Next year nothing shifts or overwrites — you **add** `season = 2027` rows. A completed 2026
draft is permanently stable because seasons 2025/2026 are locked reference data.
`lobbies.season` (Phase 1) is the single field that selects which rows a board reads.

## 4. Migration & backfill (`0041_player_seasons.sql`)

Additive + backfill only — **do not** drop the flat columns yet (a later cleanup migration
does that after the read path is switched and verified, so every deploy stays reversible).

```sql
-- 1) create table player_seasons (…as above…) + index + RLS read policy

-- 2) Backfill from the current flat columns. The data in players RIGHT NOW is
--    the 2026 import: proj_* describe 2026, prev_* describe 2025. Hardcode those
--    years — this is a one-time backfill of that specific snapshot.

-- 2a) 2026 season row: projection + current bio/adp
insert into public.player_seasons
  (player_id, season, nfl_team, bye_week, injury_status, adp,
   proj_points, proj_rank, proj_stat_line, proj_stats)
select id, 2026, nfl_team, bye_week, injury_status, adp,
       proj_points, proj_rank, proj_stat_line, proj_stats
from public.players
on conflict (player_id, season) do nothing;

-- 2b) 2025 season row: last year's actuals (bio left null — never stored per-season)
insert into public.player_seasons
  (player_id, season, act_points, act_rank, act_stat_line, act_stats)
select id, 2025, prev_points, prev_rank, prev_stat_line, prev_stats
from public.players
where prev_points is not null or prev_rank is not null
     or prev_stat_line is not null or prev_stats is not null
on conflict (player_id, season) do nothing;
```

> **Apply while the 2026 data is what's in `players`.** If the 2027 import has already run,
> the hardcoded 2026/2025 no longer match the flat columns — back the snapshot up first.

## 5. Importer changes ([scripts/import-players.ts](../scripts/import-players.ts))

The script already fetches Sleeper **projections for `SEASON`** and **stats for `SEASON-1`** —
exactly the two season rows. Rework the write path (currently one upsert, line 419) into:

1. **Upsert identity** into `players` on `(name, position)`, `.select('id, name, position')`
   to get ids back; build a `name|position → id` map.
2. **Upsert two `player_seasons` rows per player** on `(player_id, season)`:
   - `season = SEASON`: `nfl_team`, `bye_week`, `injury_status`, `adp`, `proj_*` (from the
     projections feed).
   - `season = SEASON-1`: `act_*` (from the stats feed — today's `prev_*` values, renamed to
     `act_*` because in their own season row they're actuals, not "previous").

   K/DEF: `*_stats` stay null (unchanged), `*_points`/`*_rank` carry the flat PPR fallback.

Idempotent re-runs update the same season rows; other seasons are never touched. Re-running
the 2027 import writes/updates only 2027 (+ refreshes 2026 actuals as they finalize) and
leaves 2025/older frozen.

**Optional identity hardening:** add `players.external_id text unique` (Sleeper `player_id`)
and make it the upsert key instead of `(name, position)`. Survives name-spelling/suffix/trade
changes that could otherwise fork one player into two identity rows. Backfill by matching the
current pool to Sleeper once, then keep it as the key going forward.

## 6. Read path (flatten to the existing `PlayerRow`)

Keep [PlayerRow](../client/src/lib/types.ts#L163) **shape-compatible** so `PlayerStatBlock`,
`playerPoints`, `powerRankings`, etc. don't change — only the fetch/assembly does.

- **`usePlayers(season)`** — make it season-aware. Fetch `players` joined with
  `player_seasons` for `season` and `season - 1`, then assemble each `PlayerRow`:
  `proj_* + nfl_team/bye/injury/adp` from the `season` row, `prev_* ← act_*` from the
  `season - 1` row. Callers:
  - Draft board → `usePlayers(lobby.season)`.
  - Rankings (global, not lobby-scoped) → `usePlayers(currentSeason)`; a future season picker
    is a cheap add once the data is season-scoped.
- **Server bot autodraft** ([draftEngine.ts:375](../server/src/draftEngine.ts#L375)) — join
  `player_seasons` on the lobby's `season`, select `proj_points, proj_stats, adp` from it.
- **`samplePlayers.ts`** and any fixtures — update to the flattened assembly (or leave, since
  they build `PlayerRow` directly and the shape is unchanged).

Because the flatten preserves `proj_*`/`prev_*` field names, downstream scoring/display code
is untouched.

## 7. Favorites — no change

[favorite_players](../supabase/migrations/0032_player_stat_lines_favorites.sql#L16) references
`players.id` (identity), which Phase 2 never recreates. Favorites remain cross-season and
cross-draft with **zero** schema or code change. Same for `picks.player_id`.

## 8. Rollout / deploy order

The read path (`usePlayers(season)` + `choosePlayer`) falls back to the flat columns on any
season-scoped query error, so **code and migration can deploy in any order** — nothing breaks
in the gap. Recommended sequence:

1. **Deploy the code** (already committed). Until `0041` runs, both read paths fall back to
   the flat columns — identical to today's behavior.
2. **Migrate** `0041` (create + backfill) **while the flat columns still hold the 2026
   snapshot** — i.e. before any 2027 import — so the backfill's hardcoded 2026/2025 is
   correct. After this, boards automatically read season rows; for 2026 drafts the numbers
   are unchanged (backfill copied flat → season).
3. **Run the updated importer** before the 2027 draft season to populate `season = 2027`
   rows (and refresh 2026 actuals). The importer still writes the flat columns too during the
   transition, keeping the fallback valid.
4. **Later — cleanup migration** `00xx`: drop `players.{proj,prev}_*`, `adp`, and the
   per-season bio columns, remove the fallback branches, and simplify the importer to
   season-only. Separate PR, once step 2/3 are confirmed in prod. (Note: `users.ts` reads
   `players.nfl_team` for profile display — give `players` a `latest_team` column or join
   `player_seasons` at that point.)

## 9. Verification

1. `npm run --prefix shared build`; `cd server && npm run typecheck`; `npm run --prefix client build`.
2. After backfill: `select count(*) from player_seasons group by season` shows 2025 + 2026 rows;
   spot-check a QB's `proj_stats`/`act_stats` match the old `proj_stats`/`prev_stats`.
3. Open an existing 2026 draft → player cards show identical proj + last-year numbers to before.
4. Simulate 2027: insert a `season = 2027` row for a player with different `proj_points`; a new
   2027 lobby shows the 2027 projection while the 2026 draft is unchanged.
5. Favorite a player, confirm the star persists across a 2026 and a (mock) 2027 draft.
6. Bot autodraft in a running draft still picks by projection/ADP.

## 10. Open decisions

- **`external_id` now or later?** Recommended eventually; not required for correctness since
  `(name, position)` works today. Can land in its own migration whenever.
- **Actuals refresh cadence.** `act_*` for the in-progress season are unknown until it ends.
  Do we re-run the importer mid/post-season to fill 2026 actuals, or only at next year's import
  (which already pulls `SEASON-1` stats)? The latter is zero extra work and is what the current
  flow does — recommend that unless in-season actuals are wanted.
- **Rankings season picker.** Out of scope here, but trivial once data is season-scoped — worth
  a follow-up.

## 11. Out of scope

Per-player historical bio (team/bye for seasons before the backfill — we never stored it),
in-season live stat updates, and any change to `picks`/`favorite_players` (both already correct).
