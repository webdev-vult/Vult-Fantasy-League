create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles as admin
    where admin.id = auth.uid()
      and admin.is_active = true
  );
$$;

create or replace function private.has_admin_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles as admin
    where admin.id = auth.uid()
      and admin.is_active = true
      and admin.role = any(allowed_roles)
  );
$$;

revoke all on function private.is_active_admin() from public, anon;
revoke all on function private.has_admin_role(text[]) from public, anon;
grant execute on function private.is_active_admin() to authenticated, service_role;
grant execute on function private.has_admin_role(text[]) to authenticated, service_role;

revoke all on table public.admin_profiles from anon;
revoke all on table public.audit_logs from anon;
revoke all on table public.competitions from anon;
revoke all on table public.seasons from anon;
revoke all on table public.competition_seasons from anon;
revoke all on table public.rounds from anon;
revoke all on table public.monthly_periods from anon;
revoke all on table public.participants from anon;
revoke all on table public.registrations from anon;
revoke all on table public.fantasy_entries from anon;
revoke all on table public.score_snapshots from anon;
revoke all on table public.round_scores from anon;
revoke all on table public.prizes from anon;
revoke all on table public.winner_candidates from anon;
revoke all on table public.prize_payments from anon;

grant select on table public.admin_profiles to authenticated;
grant select, insert, update, delete on table public.competitions to authenticated;
grant select, insert, update, delete on table public.seasons to authenticated;
grant select, insert, update, delete on table public.competition_seasons to authenticated;
grant select, insert, update, delete on table public.rounds to authenticated;
grant select, insert, update, delete on table public.monthly_periods to authenticated;
grant select, insert, update, delete on table public.participants to authenticated;
grant select, insert, update, delete on table public.registrations to authenticated;
grant select, insert, update, delete on table public.fantasy_entries to authenticated;
grant select, insert, update, delete on table public.score_snapshots to authenticated;
grant select, insert, update, delete on table public.round_scores to authenticated;
grant select, insert, update, delete on table public.prizes to authenticated;
grant select, insert, update, delete on table public.winner_candidates to authenticated;
grant select, insert, update, delete on table public.prize_payments to authenticated;
grant select, insert on table public.audit_logs to authenticated;
grant usage, select on sequence public.audit_logs_id_seq to authenticated;

create policy admin_profiles_select_self
on public.admin_profiles
for select
to authenticated
using (id = auth.uid() and is_active = true);

create policy admin_profiles_manage_super_admin
on public.admin_profiles
for all
to authenticated
using (private.has_admin_role(array['super_admin']))
with check (private.has_admin_role(array['super_admin']));

create policy competitions_admin_read
on public.competitions
for select
to authenticated
using (private.is_active_admin());

create policy competitions_admin_manage
on public.competitions
for all
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager']))
with check (private.has_admin_role(array['super_admin', 'competition_manager']));

create policy seasons_admin_read
on public.seasons
for select
to authenticated
using (private.is_active_admin());

create policy seasons_admin_manage
on public.seasons
for all
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager']))
with check (private.has_admin_role(array['super_admin', 'competition_manager']));

create policy competition_seasons_admin_read
on public.competition_seasons
for select
to authenticated
using (private.is_active_admin());

create policy competition_seasons_admin_manage
on public.competition_seasons
for all
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager']))
with check (private.has_admin_role(array['super_admin', 'competition_manager']));

create policy rounds_admin_read
on public.rounds
for select
to authenticated
using (private.is_active_admin());

create policy rounds_admin_manage
on public.rounds
for all
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager']))
with check (private.has_admin_role(array['super_admin', 'competition_manager']));

create policy monthly_periods_admin_read
on public.monthly_periods
for select
to authenticated
using (private.is_active_admin());

create policy monthly_periods_admin_manage
on public.monthly_periods
for all
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager']))
with check (private.has_admin_role(array['super_admin', 'competition_manager']));

create policy participants_admin_read
on public.participants
for select
to authenticated
using (private.is_active_admin());

create policy participants_admin_manage
on public.participants
for all
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']))
with check (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']));

create policy registrations_admin_read
on public.registrations
for select
to authenticated
using (private.is_active_admin());

create policy registrations_admin_manage
on public.registrations
for all
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']))
with check (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']));

create policy fantasy_entries_admin_read
on public.fantasy_entries
for select
to authenticated
using (private.is_active_admin());

create policy fantasy_entries_admin_manage
on public.fantasy_entries
for all
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']))
with check (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']));

create policy score_snapshots_admin_read
on public.score_snapshots
for select
to authenticated
using (private.is_active_admin());

create policy score_snapshots_admin_manage
on public.score_snapshots
for all
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager']))
with check (private.has_admin_role(array['super_admin', 'competition_manager']));

create policy round_scores_admin_read
on public.round_scores
for select
to authenticated
using (private.is_active_admin());

create policy round_scores_admin_manage
on public.round_scores
for all
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager']))
with check (private.has_admin_role(array['super_admin', 'competition_manager']));

create policy prizes_admin_read
on public.prizes
for select
to authenticated
using (private.is_active_admin());

create policy prizes_admin_manage
on public.prizes
for all
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager', 'finance_officer']))
with check (private.has_admin_role(array['super_admin', 'competition_manager', 'finance_officer']));

create policy winner_candidates_admin_read
on public.winner_candidates
for select
to authenticated
using (private.is_active_admin());

create policy winner_candidates_admin_manage
on public.winner_candidates
for all
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']))
with check (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']));

create policy prize_payments_admin_read
on public.prize_payments
for select
to authenticated
using (private.is_active_admin());

create policy prize_payments_admin_manage
on public.prize_payments
for all
to authenticated
using (private.has_admin_role(array['super_admin', 'finance_officer', 'compliance_officer']))
with check (private.has_admin_role(array['super_admin', 'finance_officer', 'compliance_officer']));

create policy audit_logs_admin_read
on public.audit_logs
for select
to authenticated
using (private.has_admin_role(array['super_admin', 'auditor']));

create policy audit_logs_admin_insert
on public.audit_logs
for insert
to authenticated
with check (private.is_active_admin() and actor_user_id = auth.uid());
