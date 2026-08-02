do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.get_public_dispute_case(text,text)'::regprocedure::oid)
  into v_definition;

  v_definition := replace(
    v_definition,
    'where n.dispute_id = d.id and n.channel = ''in_app''',
    'where n.dispute_id = d.id and n.channel = ''in_app'' and n.status = ''sent'''
  );

  execute v_definition;
end;
$$;
