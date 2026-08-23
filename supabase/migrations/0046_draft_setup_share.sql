-- ── Shareable draft SETUPS (settings + teams + keepers) ─────────────
-- Extend shared_rulesets with a third kind, 'DRAFT_SETUP', whose payload is a
-- full snapshot of a draft's setup: settings + team names/order + keeper
-- candidate lists + assigned keepers. Unlike SCORING/LEAGUE (which import into a
-- saved format/league), importing a DRAFT_SETUP materializes a brand-new staging
-- lobby for the importer (see POST /lobbies/from-shared-setup) — so a friend can
-- recreate a league, keepers and all, without re-entering them by hand.
--
-- Reuses the existing share plumbing: token-readable row + a RULESET_SHARE
-- notification pointing at it. The inline column check from 0033 is auto-named
-- shared_rulesets_kind_check.
alter table public.shared_rulesets drop constraint shared_rulesets_kind_check;
alter table public.shared_rulesets add constraint shared_rulesets_kind_check
  check (kind in ('SCORING', 'LEAGUE', 'DRAFT_SETUP'));
