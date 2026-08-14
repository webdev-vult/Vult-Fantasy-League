-- Keep the registration verification workflow aligned with the rule version
-- accepted by each participant. A contact phone number is still collected,
-- but Vult account verification is required only when the rule says so.

create or replace function private.initialize_registration_workflow()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_requires_vult_account boolean := true;
begin
  select cr.requires_vult_account
  into v_requires_vult_account
  from public.competition_rules cr
  where cr.competition_season_id = new.competition_season_id
    and cr.version = new.rules_version
  limit 1;

  if not found then
    v_requires_vult_account := true;
  end if;

  insert into public.registration_verifications (
    registration_id,
    vult_status
  ) values (
    new.id,
    case when v_requires_vult_account then 'pending' else 'not_required' end
  )
  on conflict (registration_id) do nothing;

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
    new.id,
    null,
    new.status,
    null,
    new.eligibility_status,
    'Initial workflow state',
    auth.uid(),
    jsonb_build_object(
      'source', 'registration_created',
      'requires_vult_account', v_requires_vult_account
    )
  );

  return new;
end;
$$;

revoke all on function private.initialize_registration_workflow() from public;

update public.registration_verifications rv
set vult_status = 'not_required',
    vult_verified_reference = null,
    vult_checked_at = coalesce(rv.vult_checked_at, now()),
    updated_at = now()
from public.registrations r
join public.competition_rules cr
  on cr.competition_season_id = r.competition_season_id
 and cr.version = r.rules_version
where rv.registration_id = r.id
  and cr.requires_vult_account = false
  and rv.vult_status in ('pending', 'review_required');
