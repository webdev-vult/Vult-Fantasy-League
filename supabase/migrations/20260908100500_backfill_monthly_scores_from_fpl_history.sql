-- New FPL synchronizations retain the manager's complete official history.
-- Use it to include earlier Gameweeks in the same calendar month for managers
-- who were approved after that month began, without creating weekly scores.
do $patch_monthly_history$
declare
  v_oid oid;
  v_definition text;
  v_marker text := E'\n  with latest_official as (';
  v_monthly_sql text := $monthly$

  with latest_history as (
    select distinct on (psr.registration_id)
      psr.registration_id,
      psr.raw_record -> 'history_current' as history_rows,
      psr.imported_at
    from public.provider_score_records psr
    join public.registrations reg on reg.id = psr.registration_id
    where psr.competition_season_id = p_competition_season_id
      and psr.provider = 'approved_fpl'
      and psr.validation_status in ('valid', 'warning')
      and jsonb_typeof(psr.raw_record -> 'history_current') = 'array'
      and reg.status = 'approved'
      and reg.eligibility_status = 'eligible'
    order by psr.registration_id, psr.imported_at desc, psr.id desc
  ), history_points as (
    select
      mp.id as monthly_period_id,
      lh.registration_id,
      sum(coalesce((history_row ->> 'points')::integer, 0))::integer as reported_points,
      sum(coalesce((history_row ->> 'event_transfers_cost')::integer, 0))::integer as transfer_cost,
      max(coalesce((history_row ->> 'total_points')::integer, 0))::integer as provider_total_points,
      count(*)::integer as gameweeks_counted,
      lh.imported_at as points_reached_at,
      (array_agg((history_row ->> 'overall_rank')::bigint
        order by (history_row ->> 'event')::integer desc)
        filter (where nullif(history_row ->> 'overall_rank', '') is not null))[1] as provider_tie_rank,
      mp.status
    from latest_history lh
    cross join lateral jsonb_array_elements(lh.history_rows) history_row
    join public.monthly_periods mp
      on mp.competition_season_id = p_competition_season_id
      and (history_row ->> 'event')::integer between mp.start_round and mp.end_round
    group by mp.id, lh.registration_id, lh.imported_at, mp.status
  )
  insert into public.monthly_scores (
    monthly_period_id, registration_id, reported_points, effective_points,
    transfer_cost, provider_total_points, gameweeks_counted, is_provisional,
    revision, calculated_at, points_reached_at, provider_tie_rank
  )
  select
    hp.monthly_period_id, hp.registration_id, hp.reported_points,
    hp.reported_points, hp.transfer_cost, hp.provider_total_points,
    hp.gameweeks_counted, hp.status not in ('completed', 'locked'),
    1, now(), hp.points_reached_at, hp.provider_tie_rank
  from history_points hp
  on conflict (monthly_period_id, registration_id) do update
  set reported_points = excluded.reported_points,
      effective_points = excluded.effective_points,
      transfer_cost = excluded.transfer_cost,
      provider_total_points = excluded.provider_total_points,
      gameweeks_counted = excluded.gameweeks_counted,
      is_provisional = excluded.is_provisional,
      points_reached_at = excluded.points_reached_at,
      provider_tie_rank = excluded.provider_tie_rank,
      revision = public.monthly_scores.revision + 1,
      calculated_at = now();

  with ranked as (
    select ms.id,
      row_number() over (
        partition by ms.monthly_period_id
        order by ms.reported_points desc,
          ms.points_reached_at asc nulls last,
          ms.provider_tie_rank asc nulls last,
          ms.id asc
      )::integer as new_rank
    from public.monthly_scores ms
    join public.monthly_periods mp on mp.id = ms.monthly_period_id
    where mp.competition_season_id = p_competition_season_id
  )
  update public.monthly_scores ms
  set rank = ranked.new_rank,
      movement = case
        when ms.previous_rank is null then 0
        else ms.previous_rank - ranked.new_rank
      end
  from ranked
  where ms.id = ranked.id;
$monthly$;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'recalculate_scoreboards'
    and pg_get_function_identity_arguments(p.oid) = 'p_competition_season_id uuid';

  if v_oid is null then
    raise exception 'private.recalculate_scoreboards(uuid) was not found';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  if position(v_marker in v_definition) = 0 then
    raise exception 'Official overall calculation marker was not found';
  end if;

  v_definition := replace(v_definition, v_marker, v_monthly_sql || v_marker);

  if position('with latest_history as' in v_definition) = 0 then
    raise exception 'Monthly FPL history calculation was not installed';
  end if;

  execute v_definition;
end
$patch_monthly_history$;

comment on function private.recalculate_scoreboards(uuid) is
  'Weekly rankings enforce the eligible Gameweek cutoff; monthly rankings use complete official FPL history for the calendar month; overall rankings use the latest official cumulative FPL total.';
