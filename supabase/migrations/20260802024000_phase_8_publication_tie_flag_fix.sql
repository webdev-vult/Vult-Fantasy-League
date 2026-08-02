do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.publish_leaderboard(uuid,text,uuid,uuid,text,text,uuid)'::regprocedure
  ) into v_definition;

  v_definition := replace(
    v_definition,
    'count(*) OVER (PARTITION BY rs.effective_points) > 1',
    'count(*) OVER (PARTITION BY rs.effective_points) > 1'
  );

  execute v_definition;
end;
$$;
