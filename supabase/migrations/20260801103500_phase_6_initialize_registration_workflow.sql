create or replace function private.initialize_registration_workflow()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.registration_verifications (registration_id)
  values (new.id)
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
    jsonb_build_object('source', 'registration_created')
  );

  return new;
end;
$$;

revoke all on function private.initialize_registration_workflow() from public;

drop trigger if exists registrations_initialize_workflow on public.registrations;
create trigger registrations_initialize_workflow
after insert on public.registrations
for each row execute function private.initialize_registration_workflow();
