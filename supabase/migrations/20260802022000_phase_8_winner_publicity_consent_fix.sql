do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.publish_leaderboard(uuid,text,uuid,uuid,text,text,uuid)'::regprocedure
  ) into v_definition;

  if position('pc.consent_type = ''publicity''' in v_definition) = 0 then
    raise exception 'Expected Phase 8 publicity-consent predicate was not found.';
  end if;

  v_definition := replace(
    v_definition,
    'pc.consent_type = ''publicity''',
    'pc.consent_type = ''winner_publicity'''
  );

  execute v_definition;
end;
$$;

comment on function public.publish_leaderboard(uuid, text, uuid, uuid, text, text, uuid)
is 'Publishes privacy-safe leaderboard snapshots for registrations that accepted winner_publicity consent.';
