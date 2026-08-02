revoke all on table public.fantasy_provider_settings from anon;
revoke all on table public.provider_sync_runs from anon;
revoke all on table public.provider_sync_errors from anon;
revoke all on table public.provider_score_records from anon;
revoke all on table public.score_snapshots from anon;

revoke all on table public.fantasy_provider_settings from authenticated;
revoke all on table public.provider_sync_runs from authenticated;
revoke all on table public.provider_sync_errors from authenticated;
revoke all on table public.provider_score_records from authenticated;
revoke all on table public.score_snapshots from authenticated;

-- Active administrators can read provider operations through RLS.
grant select on table public.fantasy_provider_settings to authenticated;
grant select on table public.provider_sync_runs to authenticated;
grant select on table public.provider_sync_errors to authenticated;
grant select on table public.provider_score_records to authenticated;
grant select on table public.score_snapshots to authenticated;

-- Only provider configuration is edited directly by authenticated managers.
grant insert, update on table public.fantasy_provider_settings to authenticated;

-- Provider runs, snapshots, errors and staged score records are written only by
-- the trusted service-role persistence function.
drop policy if exists fantasy_provider_settings_admin_delete
  on public.fantasy_provider_settings;
drop policy if exists provider_sync_runs_admin_insert
  on public.provider_sync_runs;
drop policy if exists provider_sync_runs_admin_update
  on public.provider_sync_runs;
drop policy if exists provider_sync_runs_admin_delete
  on public.provider_sync_runs;
drop policy if exists provider_sync_errors_admin_insert
  on public.provider_sync_errors;
drop policy if exists provider_score_records_admin_insert
  on public.provider_score_records;
drop policy if exists score_snapshots_admin_insert
  on public.score_snapshots;

revoke all on sequence public.provider_sync_errors_id_seq from anon, authenticated;
