do $$
declare
  v_signature text;
  v_definition text;
begin
  foreach v_signature in array array[
    'private.issue_dispute_access_token(uuid)',
    'private.resolve_dispute_access(text,text)',
    'public.submit_participant_dispute(text,text,text,text,text,text,text,text)',
    'public.queue_admin_notification(uuid,uuid,uuid,text,text,text,text,timestamp with time zone,uuid)'
  ]
  loop
    select pg_get_functiondef(v_signature::regprocedure::oid) into v_definition;
    v_definition := replace(v_definition, 'gen_random_bytes(', 'extensions.gen_random_bytes(');
    v_definition := replace(v_definition, 'digest(', 'extensions.digest(');
    execute v_definition;
  end loop;
end;
$$;
