create or replace function private.auto_verify_official_fpl_entry()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_registration public.registrations%rowtype;
  v_auto_verified boolean := false;
begin
  select * into v_registration
  from public.registrations
  where id = new.registration_id;

  v_auto_verified :=
    new.provider = 'approved_fpl'
    and new.provider_entry_id ~ '^[0-9]{1,12}$'
    and nullif(btrim(coalesce(new.manager_name, '')), '') is not null
    and nullif(btrim(coalesce(new.team_name, '')), '') is not null
    and coalesce((v_registration.metadata ->> 'fpl_entry_id_resolved_from_league')::boolean, false);

  if v_auto_verified then
    new.verified_at := coalesce(new.verified_at, now());

    insert into public.registration_verifications (
      registration_id,
      fpl_status,
      fpl_verified_entry_id,
      fpl_manager_name,
      fpl_team_name,
      fpl_notes,
      fpl_checked_at,
      fpl_checked_by
    ) values (
      new.registration_id,
      'verified',
      new.provider_entry_id,
      new.manager_name,
      new.team_name,
      'Automatically verified from the official Vult FPL mini-league during registration.',
      now(),
      null
    )
    on conflict (registration_id) do update
    set fpl_status = 'verified',
        fpl_verified_entry_id = excluded.fpl_verified_entry_id,
        fpl_manager_name = excluded.fpl_manager_name,
        fpl_team_name = excluded.fpl_team_name,
        fpl_notes = coalesce(public.registration_verifications.fpl_notes, excluded.fpl_notes),
        fpl_checked_at = excluded.fpl_checked_at,
        fpl_checked_by = null,
        updated_at = now();

    insert into public.audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) values (
      null,
      'fpl_entry_auto_verified',
      'registration',
      new.registration_id::text,
      jsonb_build_object(
        'provider', new.provider,
        'entry_id', new.provider_entry_id,
        'manager_name', new.manager_name,
        'team_name', new.team_name,
        'verification_source', 'official_vult_fpl_league'
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function private.auto_verify_official_fpl_entry() from public;

drop trigger if exists trg_auto_verify_official_fpl_entry on public.fantasy_entries;
create trigger trg_auto_verify_official_fpl_entry
before insert on public.fantasy_entries
for each row
execute function private.auto_verify_official_fpl_entry();

update public.fantasy_entries fe
set verified_at = coalesce(fe.verified_at, r.registered_at, now())
from public.registrations r,
     public.registration_verifications rv
where fe.registration_id = r.id
  and rv.registration_id = r.id
  and rv.fpl_status = 'pending'
  and fe.provider = 'approved_fpl'
  and fe.provider_entry_id ~ '^[0-9]{1,12}$'
  and nullif(btrim(coalesce(fe.manager_name, '')), '') is not null
  and nullif(btrim(coalesce(fe.team_name, '')), '') is not null
  and coalesce((r.metadata ->> 'fpl_entry_id_resolved_from_league')::boolean, false);

with eligible as (
  select
    rv.id,
    rv.registration_id,
    fe.provider_entry_id,
    fe.manager_name,
    fe.team_name,
    coalesce(fe.verified_at, r.registered_at, now()) as checked_at
  from public.registration_verifications rv
  join public.registrations r on r.id = rv.registration_id
  join public.fantasy_entries fe on fe.registration_id = r.id
  where rv.fpl_status = 'pending'
    and fe.provider = 'approved_fpl'
    and fe.provider_entry_id ~ '^[0-9]{1,12}$'
    and nullif(btrim(coalesce(fe.manager_name, '')), '') is not null
    and nullif(btrim(coalesce(fe.team_name, '')), '') is not null
    and coalesce((r.metadata ->> 'fpl_entry_id_resolved_from_league')::boolean, false)
), updated as (
  update public.registration_verifications rv
  set fpl_status = 'verified',
      fpl_verified_entry_id = e.provider_entry_id,
      fpl_manager_name = e.manager_name,
      fpl_team_name = e.team_name,
      fpl_notes = coalesce(rv.fpl_notes, 'Automatically verified from the official Vult FPL mini-league.'),
      fpl_checked_at = e.checked_at,
      fpl_checked_by = null,
      updated_at = now()
  from eligible e
  where rv.id = e.id
  returning rv.registration_id, rv.fpl_verified_entry_id, rv.fpl_manager_name, rv.fpl_team_name
)
insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
select
  null,
  'fpl_entry_auto_verified',
  'registration',
  registration_id::text,
  jsonb_build_object(
    'entry_id', fpl_verified_entry_id,
    'manager_name', fpl_manager_name,
    'team_name', fpl_team_name,
    'verification_source', 'official_vult_fpl_league',
    'backfill', true
  )
from updated;
