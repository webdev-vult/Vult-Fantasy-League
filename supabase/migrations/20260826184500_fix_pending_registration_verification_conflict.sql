-- Avoid a PL/pgSQL name collision between the RPC output parameter
-- `registration_id` and registration_verifications.registration_id.
do $$
declare
  v_identity_args text :=
    'text, text, text, text, text, text, text, text, boolean, boolean, boolean, text';
  v_definition text;
  v_repaired_definition text;
begin
  select pg_get_functiondef(
    ('public.submit_public_pending_fpl_registration(' || v_identity_args || ')')::regprocedure
  )
  into v_definition;

  v_repaired_definition := replace(
    v_definition,
    'on conflict (registration_id) do update',
    'on conflict on constraint registration_verifications_registration_id_key do update'
  );

  if v_repaired_definition = v_definition then
    raise exception 'Pending registration RPC did not contain the expected conflict clause.';
  end if;

  execute v_repaired_definition;
end;
$$;

notify pgrst, 'reload schema';
