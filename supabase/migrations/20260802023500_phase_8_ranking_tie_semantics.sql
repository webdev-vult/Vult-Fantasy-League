create or replace function private.recalculate_scoreboards(p_competition_season_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  with ranked as (
    select rs.id,
      rank() over (partition by rs.round_id order by rs.effective_points desc)::bigint as new_rank
    from public.round_scores rs
    join public.rounds r on r.id = rs.round_id
    join public.registrations reg on reg.id = rs.registration_id
    where r.competition_season_id = p_competition_season_id
      and reg.status = 'approved' and reg.eligibility_status = 'eligible'
  )
  update public.round_scores rs set round_rank = ranked.new_rank
  from ranked where rs.id = ranked.id;

  update public.monthly_scores ms set previous_rank = ms.rank
  from public.monthly_periods mp
  where mp.id = ms.monthly_period_id and mp.competition_season_id = p_competition_season_id;

  insert into public.monthly_scores (monthly_period_id, registration_id, reported_points, effective_points,
    transfer_cost, provider_total_points, gameweeks_counted, is_provisional, revision, calculated_at)
  select mp.id, rs.registration_id, sum(rs.reported_points)::integer, sum(rs.effective_points)::integer,
    sum(rs.transfer_cost)::integer, coalesce(max(rs.total_points), 0)::integer, count(*)::integer,
    bool_or(rs.is_provisional) or mp.status not in ('completed', 'locked'), 1, now()
  from public.monthly_periods mp
  join public.rounds r on r.competition_season_id = mp.competition_season_id
    and r.external_round_id between mp.start_round and mp.end_round and r.status <> 'cancelled'
  join public.round_scores rs on rs.round_id = r.id
  join public.registrations reg on reg.id = rs.registration_id
  where mp.competition_season_id = p_competition_season_id
    and reg.status = 'approved' and reg.eligibility_status = 'eligible'
  group by mp.id, rs.registration_id, mp.status
  on conflict (monthly_period_id, registration_id) do update
  set reported_points = excluded.reported_points, effective_points = excluded.effective_points,
      transfer_cost = excluded.transfer_cost, provider_total_points = excluded.provider_total_points,
      gameweeks_counted = excluded.gameweeks_counted, is_provisional = excluded.is_provisional,
      revision = public.monthly_scores.revision + 1, calculated_at = now();

  delete from public.monthly_scores ms using public.monthly_periods mp
  where mp.id = ms.monthly_period_id and mp.competition_season_id = p_competition_season_id
    and not exists (
      select 1 from public.rounds r
      join public.round_scores rs on rs.round_id = r.id
      join public.registrations reg on reg.id = rs.registration_id
      where r.competition_season_id = p_competition_season_id
        and r.external_round_id between mp.start_round and mp.end_round and r.status <> 'cancelled'
        and rs.registration_id = ms.registration_id
        and reg.status = 'approved' and reg.eligibility_status = 'eligible'
    );

  with ranked as (
    select ms.id,
      rank() over (partition by ms.monthly_period_id order by ms.effective_points desc)::integer as new_rank
    from public.monthly_scores ms
    join public.monthly_periods mp on mp.id = ms.monthly_period_id
    where mp.competition_season_id = p_competition_season_id
  )
  update public.monthly_scores ms
  set rank = ranked.new_rank,
      movement = case when ms.previous_rank is null then 0 else ms.previous_rank - ranked.new_rank end
  from ranked where ms.id = ranked.id;

  update public.season_scores set previous_rank = rank
  where competition_season_id = p_competition_season_id;

  insert into public.season_scores (competition_season_id, registration_id, reported_points, effective_points,
    transfer_cost, provider_total_points, gameweeks_counted, is_provisional, revision, calculated_at)
  select p_competition_season_id, rs.registration_id, sum(rs.reported_points)::integer,
    sum(rs.effective_points)::integer, sum(rs.transfer_cost)::integer, coalesce(max(rs.total_points), 0)::integer,
    count(*)::integer, bool_or(rs.is_provisional), 1, now()
  from public.round_scores rs
  join public.rounds r on r.id = rs.round_id
  join public.registrations reg on reg.id = rs.registration_id
  where r.competition_season_id = p_competition_season_id and r.status <> 'cancelled'
    and reg.status = 'approved' and reg.eligibility_status = 'eligible'
  group by rs.registration_id
  on conflict (competition_season_id, registration_id) do update
  set reported_points = excluded.reported_points, effective_points = excluded.effective_points,
      transfer_cost = excluded.transfer_cost, provider_total_points = excluded.provider_total_points,
      gameweeks_counted = excluded.gameweeks_counted, is_provisional = excluded.is_provisional,
      revision = public.season_scores.revision + 1, calculated_at = now();

  delete from public.season_scores ss
  where ss.competition_season_id = p_competition_season_id and not exists (
    select 1 from public.round_scores rs
    join public.rounds r on r.id = rs.round_id
    join public.registrations reg on reg.id = rs.registration_id
    where r.competition_season_id = p_competition_season_id and r.status <> 'cancelled'
      and rs.registration_id = ss.registration_id
      and reg.status = 'approved' and reg.eligibility_status = 'eligible'
  );

  with ranked as (
    select ss.id,
      rank() over (partition by ss.competition_season_id order by ss.effective_points desc)::integer as new_rank
    from public.season_scores ss where ss.competition_season_id = p_competition_season_id
  )
  update public.season_scores ss
  set rank = ranked.new_rank,
      movement = case when ss.previous_rank is null then 0 else ss.previous_rank - ranked.new_rank end
  from ranked where ss.id = ranked.id;
end;
$$;

comment on function private.recalculate_scoreboards(uuid)
is 'Calculates competition rankings by points while preserving tied ranks for Phase 9 tie-break review.';
