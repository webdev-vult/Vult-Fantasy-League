create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.admin_profiles(id),
  competition_season_id uuid references public.competition_seasons(id),
  report_type text not null check (report_type in ('season_summary','operations','participant_retention','prize_spending','audit_history')),
  export_format text not null default 'csv' check (export_format in ('csv')),
  filters jsonb not null default '{}'::jsonb,
  row_count integer not null default 0 check (row_count >= 0),
  created_at timestamptz not null default now()
);

alter table public.report_exports enable row level security;
revoke all on public.report_exports from anon;
revoke insert, update, delete on public.report_exports from authenticated;
grant select on public.report_exports to authenticated;

drop policy if exists report_exports_admin_read on public.report_exports;
create policy report_exports_admin_read
on public.report_exports
for select
to authenticated
using (
  private.is_active_admin()
  and (
    requested_by = (select auth.uid())
    or private.has_admin_role(array['super_admin','auditor']::text[])
  )
);

create index if not exists report_exports_created_at_idx on public.report_exports(created_at desc);
create index if not exists report_exports_requested_by_idx on public.report_exports(requested_by, created_at desc);
create index if not exists report_exports_season_idx on public.report_exports(competition_season_id, created_at desc);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor_created_idx on public.audit_logs(actor_user_id, created_at desc);
create index if not exists audit_logs_action_created_idx on public.audit_logs(action, created_at desc);
create index if not exists audit_logs_entity_created_idx on public.audit_logs(entity_type, created_at desc);
