-- Skip-on-timeout feature: how many times this team has let its pick clock
-- expire (been skipped). Enforces the per-lobby `timeoutAllowance` setting —
-- once a team's timeouts reach the allowance, the engine auto-picks for them
-- instead of skipping again. Null allowance = unlimited skips (never capped).
-- Reset on rollback. Inert until the engine wires it in (later phase).
alter table public.teams
  add column timeouts int not null default 0;
