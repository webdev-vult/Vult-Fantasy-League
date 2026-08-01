-- Historical migration reconciliation.
--
-- This migration was applied directly to the connected Supabase project while
-- Phase 7 was under development, but the migration file was not committed at
-- that time. It removed the earlier authenticated 11-argument RPC before the
-- trusted server action moved to the 12-argument service-role contract.
--
-- The complete canonical function definition is applied in the immediately
-- following 20260801200121_phase_7_provider_persistence_hardening.sql migration.

drop function if exists public.persist_provider_batch(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid
);
