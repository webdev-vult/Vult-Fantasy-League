alter table public.fantasy_provider_settings enable row level security;
alter table public.provider_sync_runs enable row level security;
alter table public.provider_sync_errors enable row level security;
alter table public.provider_score_records enable row level security;

grant select, insert, update, delete
  on public.fantasy_provider_settings to authenticated;
grant select, insert, update, delete
  on public.provider_sync_runs to authenticated;
grant select, insert
  on public.provider_sync_errors to authenticated;
grant select, insert
  on public.provider_score_records to authenticated;
grant usage, select
  on sequence public.provider_sync_errors_id_seq to authenticated;

create policy fantasy_provider_settings_admin_read
on public.fantasy_provider_settings for select
to authenticated
using (private.is_active_admin());

create policy fantasy_provider_settings_admin_insert
on public.fantasy_provider_settings for insert
to authenticated
with check (
  private.has_admin_role(array['super_admin', 'competition_manager'])
);

create policy fantasy_provider_settings_admin_update
on public.fantasy_provider_settings for update
to authenticated
using (
  private.has_admin_role(array['super_admin', 'competition_manager'])
)
with check (
  private.has_admin_role(array['super_admin', 'competition_manager'])
);

create policy fantasy_provider_settings_admin_delete
on public.fantasy_provider_settings for delete
to authenticated
using (private.has_admin_role(array['super_admin']));

create policy provider_sync_runs_admin_read
on public.provider_sync_runs for select
to authenticated
using (private.is_active_admin());

create policy provider_sync_runs_admin_insert
on public.provider_sync_runs for insert
to authenticated
with check (
  private.has_admin_role(array['super_admin', 'competition_manager'])
);

create policy provider_sync_runs_admin_update
on public.provider_sync_runs for update
to authenticated
using (
  private.has_admin_role(array['super_admin', 'competition_manager'])
)
with check (
  private.has_admin_role(array['super_admin', 'competition_manager'])
);

create policy provider_sync_runs_admin_delete
on public.provider_sync_runs for delete
to authenticated
using (private.has_admin_role(array['super_admin']));

create policy provider_sync_errors_admin_read
on public.provider_sync_errors for select
to authenticated
using (private.is_active_admin());

create policy provider_sync_errors_admin_insert
on public.provider_sync_errors for insert
to authenticated
with check (
  private.has_admin_role(array['super_admin', 'competition_manager'])
);

create policy provider_score_records_admin_read
on public.provider_score_records for select
to authenticated
using (private.is_active_admin());

create policy provider_score_records_admin_insert
on public.provider_score_records for insert
to authenticated
with check (
  private.has_admin_role(array['super_admin', 'competition_manager'])
);

-- Raw snapshots, normalized records and integration errors are append-only.
drop policy if exists score_snapshots_admin_update
  on public.score_snapshots;
drop policy if exists score_snapshots_admin_delete
  on public.score_snapshots;

revoke update, delete
  on public.score_snapshots from authenticated;
revoke update, delete
  on public.provider_score_records from authenticated;
revoke update, delete
  on public.provider_sync_errors from authenticated;
