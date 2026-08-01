create index if not exists fantasy_provider_settings_created_by_idx
  on public.fantasy_provider_settings (created_by);

create index if not exists fantasy_provider_settings_updated_by_idx
  on public.fantasy_provider_settings (updated_by);

create index if not exists provider_score_records_snapshot_id_idx
  on public.provider_score_records (snapshot_id);

create index if not exists provider_sync_runs_requested_by_idx
  on public.provider_sync_runs (requested_by);
