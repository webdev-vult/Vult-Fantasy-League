drop policy if exists competitions_public_read on public.competitions;
create policy competitions_public_read
  on public.competitions
  for select
  to anon
  using (is_active = true);

drop policy if exists seasons_public_read on public.seasons;
create policy seasons_public_read
  on public.seasons
  for select
  to anon
  using (status in ('upcoming', 'active', 'completed', 'archived'));

drop policy if exists competition_seasons_public_read on public.competition_seasons;
create policy competition_seasons_public_read
  on public.competition_seasons
  for select
  to anon
  using (status in ('registration_open', 'registration_closed', 'active', 'completed', 'archived'));

drop policy if exists competition_rules_public_read on public.competition_rules;
create policy competition_rules_public_read
  on public.competition_rules
  for select
  to anon
  using (
    status = 'published'
    and exists (
      select 1
      from public.competition_seasons cs
      where cs.id = competition_rules.competition_season_id
        and cs.status in ('registration_open', 'registration_closed', 'active', 'completed', 'archived')
    )
  );

drop policy if exists prizes_public_read on public.prizes;
create policy prizes_public_read
  on public.prizes
  for select
  to anon
  using (
    is_active = true
    and exists (
      select 1
      from public.competition_seasons cs
      where cs.id = prizes.competition_season_id
        and cs.status in ('registration_open', 'registration_closed', 'active', 'completed', 'archived')
    )
  );

drop policy if exists participant_consents_admin_write on public.participant_consents;

create policy participant_consents_admin_insert
  on public.participant_consents
  for insert
  to authenticated
  with check (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']));

create policy participant_consents_admin_update
  on public.participant_consents
  for update
  to authenticated
  using (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']))
  with check (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']));

create policy participant_consents_admin_delete
  on public.participant_consents
  for delete
  to authenticated
  using (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']));
