alter table public.participants
  add column if not exists full_name_normalized text,
  add column if not exists whatsapp_phone_normalized text;

create or replace function private.set_participant_normalized_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.full_name_normalized := nullif(
    lower(regexp_replace(btrim(coalesce(new.full_name, '')), '\s+', ' ', 'g')),
    ''
  );
  new.phone_normalized := nullif(private.normalize_phone(coalesce(new.phone, '')), '');
  new.whatsapp_phone_normalized := nullif(private.normalize_phone(coalesce(new.whatsapp_phone, '')), '');
  new.email_normalized := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.vult_customer_ref_normalized := nullif(
    lower(regexp_replace(btrim(coalesce(new.vult_customer_ref, '')), '[^a-zA-Z0-9]', '', 'g')),
    ''
  );
  return new;
end;
$$;

revoke all on function private.set_participant_normalized_fields() from public;

drop trigger if exists participants_normalize_fields on public.participants;
create trigger participants_normalize_fields
before insert or update of full_name, phone, whatsapp_phone, email, vult_customer_ref
on public.participants
for each row execute function private.set_participant_normalized_fields();

update public.participants
set full_name = full_name;

create index if not exists participants_name_dob_lookup
  on public.participants (full_name_normalized, date_of_birth);
create index if not exists participants_whatsapp_lookup
  on public.participants (whatsapp_phone_normalized)
  where whatsapp_phone_normalized is not null;

create table if not exists public.registration_verifications (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete cascade,
  fpl_status text not null default 'pending'
    check (fpl_status in ('pending', 'verified', 'failed', 'review_required', 'not_required')),
  fpl_verified_entry_id text,
  fpl_manager_name text,
  fpl_team_name text,
  fpl_notes text,
  fpl_checked_at timestamptz,
  fpl_checked_by uuid references public.admin_profiles(id) on delete set null,
  vult_status text not null default 'pending'
    check (vult_status in ('pending', 'verified', 'failed', 'review_required', 'not_required')),
  vult_verified_reference text,
  vult_notes text,
  vult_checked_at timestamptz,
  vult_checked_by uuid references public.admin_profiles(id) on delete set null,
  duplicate_risk text not null default 'none'
    check (duplicate_risk in ('none', 'low', 'medium', 'high')),
  duplicate_risk_reasons jsonb not null default '[]'::jsonb,
  duplicate_checked_at timestamptz,
  duplicate_checked_by uuid references public.admin_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.registration_status_history (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  from_status text,
  to_status text not null,
  from_eligibility_status text,
  to_eligibility_status text not null,
  reason text,
  changed_by uuid references public.admin_profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (from_status is null or from_status in ('pending', 'approved', 'rejected', 'suspended', 'disqualified')),
  check (to_status in ('pending', 'approved', 'rejected', 'suspended', 'disqualified')),
  check (from_eligibility_status is null or from_eligibility_status in ('pending', 'eligible', 'ineligible', 'review_required')),
  check (to_eligibility_status in ('pending', 'eligible', 'ineligible', 'review_required'))
);

create table if not exists public.registration_notes (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  author_user_id uuid references public.admin_profiles(id) on delete set null,
  note_type text not null default 'internal'
    check (note_type in ('internal', 'verification', 'compliance', 'support')),
  body text not null check (char_length(btrim(body)) between 2 and 2000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists registration_verifications_fpl_checked_by_idx
  on public.registration_verifications (fpl_checked_by);
create index if not exists registration_verifications_vult_checked_by_idx
  on public.registration_verifications (vult_checked_by);
create index if not exists registration_verifications_duplicate_checked_by_idx
  on public.registration_verifications (duplicate_checked_by);
create index if not exists registration_status_history_registration_created_idx
  on public.registration_status_history (registration_id, created_at desc);
create index if not exists registration_status_history_changed_by_idx
  on public.registration_status_history (changed_by);
create index if not exists registration_notes_registration_created_idx
  on public.registration_notes (registration_id, created_at desc);
create index if not exists registration_notes_author_user_id_idx
  on public.registration_notes (author_user_id);

create trigger registration_verifications_set_updated_at
before update on public.registration_verifications
for each row execute function public.set_updated_at();

create trigger registration_notes_set_updated_at
before update on public.registration_notes
for each row execute function public.set_updated_at();

insert into public.registration_verifications (registration_id)
select r.id
from public.registrations r
on conflict (registration_id) do nothing;

insert into public.registration_status_history (
  registration_id,
  from_status,
  to_status,
  from_eligibility_status,
  to_eligibility_status,
  reason,
  metadata
)
select
  r.id,
  null,
  r.status,
  null,
  r.eligibility_status,
  'Initial workflow state',
  jsonb_build_object('source', 'phase_6_backfill')
from public.registrations r
where not exists (
  select 1 from public.registration_status_history h where h.registration_id = r.id
);

alter table public.registration_verifications enable row level security;
alter table public.registration_status_history enable row level security;
alter table public.registration_notes enable row level security;

grant select, insert, update, delete on public.registration_verifications to authenticated;
grant select, insert on public.registration_status_history to authenticated;
grant select, insert, update, delete on public.registration_notes to authenticated;

drop policy if exists registration_verifications_admin_read on public.registration_verifications;
create policy registration_verifications_admin_read
on public.registration_verifications for select
to authenticated
using (private.is_active_admin());

drop policy if exists registration_verifications_admin_insert on public.registration_verifications;
create policy registration_verifications_admin_insert
on public.registration_verifications for insert
to authenticated
with check (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']));

drop policy if exists registration_verifications_admin_update on public.registration_verifications;
create policy registration_verifications_admin_update
on public.registration_verifications for update
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']))
with check (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']));

drop policy if exists registration_verifications_admin_delete on public.registration_verifications;
create policy registration_verifications_admin_delete
on public.registration_verifications for delete
to authenticated
using (private.has_admin_role(array['super_admin']));

drop policy if exists registration_status_history_admin_read on public.registration_status_history;
create policy registration_status_history_admin_read
on public.registration_status_history for select
to authenticated
using (private.is_active_admin());

drop policy if exists registration_status_history_admin_insert on public.registration_status_history;
create policy registration_status_history_admin_insert
on public.registration_status_history for insert
to authenticated
with check (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']));

drop policy if exists registration_notes_admin_read on public.registration_notes;
create policy registration_notes_admin_read
on public.registration_notes for select
to authenticated
using (private.is_active_admin());

drop policy if exists registration_notes_admin_insert on public.registration_notes;
create policy registration_notes_admin_insert
on public.registration_notes for insert
to authenticated
with check (
  author_user_id = (select auth.uid())
  and private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer', 'support_officer'])
);

drop policy if exists registration_notes_admin_update on public.registration_notes;
create policy registration_notes_admin_update
on public.registration_notes for update
to authenticated
using (
  author_user_id = (select auth.uid())
  or private.has_admin_role(array['super_admin', 'competition_manager'])
)
with check (
  author_user_id = (select auth.uid())
  or private.has_admin_role(array['super_admin', 'competition_manager'])
);

drop policy if exists registration_notes_admin_delete on public.registration_notes;
create policy registration_notes_admin_delete
on public.registration_notes for delete
to authenticated
using (
  author_user_id = (select auth.uid())
  or private.has_admin_role(array['super_admin', 'competition_manager'])
);

create or replace function public.refresh_registration_duplicate_risk(p_registration_id uuid)
returns table(duplicate_risk text, duplicate_risk_reasons jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_registration public.registrations%rowtype;
  v_participant public.participants%rowtype;
  v_entry public.fantasy_entries%rowtype;
  v_risk text := 'none';
  v_reasons jsonb := '[]'::jsonb;
begin
  if not private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']) then
    raise exception using message = 'You are not allowed to refresh duplicate risk.';
  end if;

  select * into v_registration
  from public.registrations
  where id = p_registration_id;

  if not found then
    raise exception using message = 'Registration not found.';
  end if;

  select * into v_participant
  from public.participants
  where id = v_registration.participant_id;

  select * into v_entry
  from public.fantasy_entries
  where registration_id = p_registration_id;

  if v_participant.whatsapp_phone_normalized is not null and exists (
    select 1
    from public.participants p
    where p.id <> v_participant.id
      and p.whatsapp_phone_normalized = v_participant.whatsapp_phone_normalized
  ) then
    v_risk := 'high';
    v_reasons := v_reasons || jsonb_build_array('WhatsApp number is shared with another participant.');
  end if;

  if v_participant.full_name_normalized is not null
    and v_participant.date_of_birth is not null
    and exists (
      select 1
      from public.participants p
      where p.id <> v_participant.id
        and p.full_name_normalized = v_participant.full_name_normalized
        and p.date_of_birth = v_participant.date_of_birth
    )
  then
    if v_risk in ('none', 'low') then v_risk := 'medium'; end if;
    v_reasons := v_reasons || jsonb_build_array('Name and date of birth match another participant.');
  end if;

  if v_entry.team_name is not null and exists (
    select 1
    from public.fantasy_entries e
    where e.id <> v_entry.id
      and e.competition_season_id = v_entry.competition_season_id
      and lower(btrim(e.team_name)) = lower(btrim(v_entry.team_name))
  ) then
    if v_risk in ('none', 'low') then v_risk := 'medium'; end if;
    v_reasons := v_reasons || jsonb_build_array('FPL team name matches another seasonal entry.');
  end if;

  if v_entry.manager_name is not null and exists (
    select 1
    from public.fantasy_entries e
    where e.id <> v_entry.id
      and e.competition_season_id = v_entry.competition_season_id
      and lower(btrim(e.manager_name)) = lower(btrim(v_entry.manager_name))
  ) then
    v_risk := 'high';
    v_reasons := v_reasons || jsonb_build_array('FPL manager name matches another seasonal entry.');
  end if;

  insert into public.registration_verifications (
    registration_id,
    duplicate_risk,
    duplicate_risk_reasons,
    duplicate_checked_at,
    duplicate_checked_by
  ) values (
    p_registration_id,
    v_risk,
    v_reasons,
    now(),
    auth.uid()
  )
  on conflict (registration_id) do update
  set duplicate_risk = excluded.duplicate_risk,
      duplicate_risk_reasons = excluded.duplicate_risk_reasons,
      duplicate_checked_at = excluded.duplicate_checked_at,
      duplicate_checked_by = excluded.duplicate_checked_by;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'registration_duplicate_risk_refreshed',
    'registration',
    p_registration_id::text,
    jsonb_build_object('duplicate_risk', v_risk, 'reasons', v_reasons)
  );

  return query select v_risk, v_reasons;
end;
$$;

revoke all on function public.refresh_registration_duplicate_risk(uuid) from public, anon;
grant execute on function public.refresh_registration_duplicate_risk(uuid) to authenticated;

create or replace function public.transition_registration_status(
  p_registration_id uuid,
  p_new_status text,
  p_reason text default null
)
returns table(registration_status text, eligibility_status text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_registration public.registrations%rowtype;
  v_verification public.registration_verifications%rowtype;
  v_requires_vult boolean := true;
  v_new_eligibility text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']) then
    raise exception using message = 'You are not allowed to change registration status.';
  end if;

  if p_new_status not in ('pending', 'approved', 'rejected', 'suspended', 'disqualified') then
    raise exception using message = 'Invalid registration status.';
  end if;

  select * into v_registration
  from public.registrations
  where id = p_registration_id
  for update;

  if not found then
    raise exception using message = 'Registration not found.';
  end if;

  if v_registration.status = p_new_status then
    raise exception using message = 'Registration already has this status.';
  end if;

  if v_registration.status = 'disqualified'
    and p_new_status <> 'disqualified'
    and not private.has_admin_role(array['super_admin'])
  then
    raise exception using message = 'Only a Super Admin can restore a disqualified registration.';
  end if;

  if p_new_status in ('rejected', 'suspended', 'disqualified') and v_reason is null then
    raise exception using message = 'A reason is required for this status change.';
  end if;

  select * into v_verification
  from public.registration_verifications
  where registration_id = p_registration_id;

  select coalesce(cr.requires_vult_account, true)
  into v_requires_vult
  from public.competition_rules cr
  where cr.competition_season_id = v_registration.competition_season_id
    and cr.version = v_registration.rules_version
  limit 1;

  if p_new_status = 'approved' then
    if v_verification.fpl_status <> 'verified' then
      raise exception using message = 'FPL verification must be completed before approval.';
    end if;

    if v_requires_vult and v_verification.vult_status <> 'verified' then
      raise exception using message = 'Vult verification must be completed before approval.';
    end if;

    if not v_requires_vult and v_verification.vult_status not in ('verified', 'not_required') then
      raise exception using message = 'Vult verification must be marked verified or not required.';
    end if;

    if v_verification.duplicate_risk = 'high'
      and not private.has_admin_role(array['super_admin'])
    then
      raise exception using message = 'High duplicate risk requires Super Admin approval.';
    end if;

    v_new_eligibility := 'eligible';
  elsif p_new_status in ('rejected', 'disqualified') then
    v_new_eligibility := 'ineligible';
  elsif p_new_status = 'suspended' then
    v_new_eligibility := 'review_required';
  else
    v_new_eligibility := 'pending';
  end if;

  update public.registrations
  set status = p_new_status,
      eligibility_status = v_new_eligibility,
      approved_at = case when p_new_status = 'approved' then now() else approved_at end,
      approved_by = case when p_new_status = 'approved' then auth.uid() else approved_by end,
      rejection_reason = case
        when p_new_status in ('rejected', 'disqualified') then v_reason
        when p_new_status in ('pending', 'approved') then null
        else rejection_reason
      end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_status_reason', v_reason,
        'last_status_changed_at', now(),
        'last_status_changed_by', auth.uid()
      )
  where id = p_registration_id;

  insert into public.registration_status_history (
    registration_id,
    from_status,
    to_status,
    from_eligibility_status,
    to_eligibility_status,
    reason,
    changed_by,
    metadata
  ) values (
    p_registration_id,
    v_registration.status,
    p_new_status,
    v_registration.eligibility_status,
    v_new_eligibility,
    v_reason,
    auth.uid(),
    jsonb_build_object('source', 'admin_workflow')
  );

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'registration_status_changed',
    'registration',
    p_registration_id::text,
    jsonb_build_object(
      'from_status', v_registration.status,
      'to_status', p_new_status,
      'from_eligibility_status', v_registration.eligibility_status,
      'to_eligibility_status', v_new_eligibility,
      'reason', v_reason
    )
  );

  return query select p_new_status, v_new_eligibility;
end;
$$;

revoke all on function public.transition_registration_status(uuid, text, text) from public, anon;
grant execute on function public.transition_registration_status(uuid, text, text) to authenticated;
