drop policy if exists admin_profiles_select_self on public.admin_profiles;
drop policy if exists admin_profiles_manage_super_admin on public.admin_profiles;

create policy admin_profiles_admin_read
on public.admin_profiles
for select
to authenticated
using (
  (id = (select auth.uid()) and is_active = true)
  or private.has_admin_role(array['super_admin'])
);

create policy admin_profiles_admin_insert
on public.admin_profiles
for insert
to authenticated
with check (private.has_admin_role(array['super_admin']));

create policy admin_profiles_admin_update
on public.admin_profiles
for update
to authenticated
using (private.has_admin_role(array['super_admin']))
with check (private.has_admin_role(array['super_admin']));

create policy admin_profiles_admin_delete
on public.admin_profiles
for delete
to authenticated
using (private.has_admin_role(array['super_admin']));

drop policy if exists audit_logs_admin_insert on public.audit_logs;

create policy audit_logs_admin_insert
on public.audit_logs
for insert
to authenticated
with check (
  private.is_active_admin()
  and actor_user_id = (select auth.uid())
);

do $$
declare
  policy_spec record;
begin
  for policy_spec in
    select *
    from (
      values
        ('competitions', 'competitions_admin_manage', 'array[''super_admin'', ''competition_manager'']'),
        ('seasons', 'seasons_admin_manage', 'array[''super_admin'', ''competition_manager'']'),
        ('competition_seasons', 'competition_seasons_admin_manage', 'array[''super_admin'', ''competition_manager'']'),
        ('rounds', 'rounds_admin_manage', 'array[''super_admin'', ''competition_manager'']'),
        ('monthly_periods', 'monthly_periods_admin_manage', 'array[''super_admin'', ''competition_manager'']'),
        ('participants', 'participants_admin_manage', 'array[''super_admin'', ''competition_manager'', ''compliance_officer'']'),
        ('registrations', 'registrations_admin_manage', 'array[''super_admin'', ''competition_manager'', ''compliance_officer'']'),
        ('fantasy_entries', 'fantasy_entries_admin_manage', 'array[''super_admin'', ''competition_manager'', ''compliance_officer'']'),
        ('score_snapshots', 'score_snapshots_admin_manage', 'array[''super_admin'', ''competition_manager'']'),
        ('round_scores', 'round_scores_admin_manage', 'array[''super_admin'', ''competition_manager'']'),
        ('prizes', 'prizes_admin_manage', 'array[''super_admin'', ''competition_manager'', ''finance_officer'']'),
        ('winner_candidates', 'winner_candidates_admin_manage', 'array[''super_admin'', ''competition_manager'', ''compliance_officer'']'),
        ('prize_payments', 'prize_payments_admin_manage', 'array[''super_admin'', ''finance_officer'', ''compliance_officer'']')
    ) as specifications(table_name, existing_policy, roles_sql)
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_spec.existing_policy,
      policy_spec.table_name
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.has_admin_role(%s))',
      policy_spec.table_name || '_admin_insert',
      policy_spec.table_name,
      policy_spec.roles_sql
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (private.has_admin_role(%s)) with check (private.has_admin_role(%s))',
      policy_spec.table_name || '_admin_update',
      policy_spec.table_name,
      policy_spec.roles_sql,
      policy_spec.roles_sql
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.has_admin_role(%s))',
      policy_spec.table_name || '_admin_delete',
      policy_spec.table_name,
      policy_spec.roles_sql
    );
  end loop;
end;
$$;
