-- Rank every competition scope by official reported points. Chips and transfer
-- costs remain recorded evidence, but they no longer change ranking points or
-- weekly prize eligibility. Tied scores use first-observed point arrival, then
-- the provider's official rank from the same observation window.

alter table public.round_scores
  add column if not exists points_reached_at timestamptz,
  add column if not exists provider_tie_rank bigint;

alter table public.monthly_scores
  add column if not exists points_reached_at timestamptz,
  add column if not exists provider_tie_rank bigint;

alter table public.season_scores
  add column if not exists points_reached_at timestamptz,
  add column if not exists provider_tie_rank bigint;

create index if not exists round_scores_points_arrival_idx
  on public.round_scores (round_id, reported_points desc, points_reached_at, provider_tie_rank);

create index if not exists monthly_scores_points_arrival_idx
  on public.monthly_scores (monthly_period_id, reported_points desc, points_reached_at, provider_tie_rank);

create index if not exists season_scores_points_arrival_idx
  on public.season_scores (competition_season_id, reported_points desc, points_reached_at, provider_tie_rank);

create index if not exists provider_score_records_point_arrival_idx
  on public.provider_score_records (registration_id, round_id, reported_points, imported_at)
  where validation_status in ('valid', 'warning');

alter table public.competition_rules
  alter column weekly_chip_policy set default 'allow_all',
  alter column include_transfer_deductions set default false,
  alter column tie_breakers set default '["points_arrival"]'::jsonb;

-- Keep draft rules aligned with the new scoring model.
update public.competition_rules
set weekly_chip_policy = 'allow_all',
    include_transfer_deductions = false,
    tie_breakers = '["points_arrival"]'::jsonb
where status = 'draft';

-- Published rules remain versioned: supersede the current version and publish
-- a new version rather than silently rewriting terms already accepted.
with current_rules as (
  select distinct on (competition_season_id) *
  from public.competition_rules
  where status = 'published'
  order by competition_season_id, version desc
), superseded as (
  update public.competition_rules cr
  set status = 'superseded'
  from current_rules src
  where cr.id = src.id
  returning src.*
), inserted as (
  insert into public.competition_rules (
    competition_season_id, version, title, status, minimum_age,
    eligible_country_codes, requires_vult_account, one_entry_per_participant,
    employees_eligible, weekly_chip_policy, include_transfer_deductions,
    repeat_weekly_winners_allowed, dispute_window_hours, tie_breakers,
    disqualification_rules, notes, effective_at, published_at, created_by
  )
  select
    competition_season_id, version + 1, title, 'published', minimum_age,
    eligible_country_codes, requires_vult_account, one_entry_per_participant,
    employees_eligible, 'allow_all', false,
    repeat_weekly_winners_allowed, dispute_window_hours,
    '["points_arrival"]'::jsonb, disqualification_rules,
    concat_ws(E'\n', nullif(notes, ''),
      'Scoring update: chips and transfer costs are recorded only. Rankings use reported points and point-arrival order.'),
    now(), now(), created_by
  from superseded
  returning competition_season_id, version
)
update public.competition_seasons cs
set rules_version = inserted.version
from inserted
where cs.id = inserted.competition_season_id;

create or replace function private.normalize_round_score_for_competition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_observed_at timestamptz;
  v_provider_rank bigint;
begin
  new.effective_points := new.reported_points;
  new.weekly_eligible := true;
  new.eligibility_note := null;

  select psr.imported_at, psr.round_rank
  into v_observed_at, v_provider_rank
  from public.provider_score_records psr
  where psr.registration_id = new.registration_id
    and psr.round_id = new.round_id
    and psr.reported_points = new.reported_points
    and psr.validation_status in ('valid', 'warning')
  order by psr.imported_at asc, psr.round_rank asc nulls last
  limit 1;

  if tg_op = 'UPDATE'
    and old.reported_points is not distinct from new.reported_points
  then
    new.points_reached_at := least(
      coalesce(old.points_reached_at, v_observed_at, clock_timestamp()),
      coalesce(v_observed_at, old.points_reached_at, clock_timestamp())
    );
    new.provider_tie_rank := coalesce(v_provider_rank, old.provider_tie_rank);
  else
    new.points_reached_at := coalesce(v_observed_at, clock_timestamp());
    new.provider_tie_rank := v_provider_rank;
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_round_score_for_competition() from public;

drop trigger if exists round_scores_normalize_competition_insert on public.round_scores;
create trigger round_scores_normalize_competition_insert
before insert on public.round_scores
for each row execute function private.normalize_round_score_for_competition();

drop trigger if exists round_scores_normalize_competition_update on public.round_scores;
create trigger round_scores_normalize_competition_update
before update of reported_points, effective_points, source_provider_record_id,
  weekly_eligible, eligibility_note, transfer_cost, chip_used
on public.round_scores
for each row execute function private.normalize_round_score_for_competition();

create or replace function private.normalize_score_correction_for_competition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.corrected_effective_points := new.corrected_reported_points;
  new.corrected_weekly_eligible := true;
  return new;
end;
$$;

revoke all on function private.normalize_score_correction_for_competition() from public;

drop trigger if exists score_corrections_normalize_competition on public.score_corrections;
create trigger score_corrections_normalize_competition
before insert on public.score_corrections
for each row execute function private.normalize_score_correction_for_competition();

-- Re-store current scores under the new scoring policy and backfill point-arrival evidence.
update public.round_scores
set effective_points = reported_points,
    weekly_eligible = true,
    eligibility_note = null;

update public.round_scores rs
set rules_version = current_rule.version
from public.rounds r
join lateral (
  select cr.version
  from public.competition_rules cr
  where cr.competition_season_id = r.competition_season_id
    and cr.status = 'published'
  order by cr.version desc
  limit 1
) current_rule on true
where r.id = rs.round_id;

create or replace function private.recalculate_scoreboards(p_competition_season_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  with ranked as (
    select rs.id,
      row_number() over (
        partition by rs.round_id
        order by rs.reported_points desc,
          rs.points_reached_at asc nulls last,
          rs.provider_tie_rank asc nulls last,
          rs.id asc
      )::bigint as new_rank
    from public.round_scores rs
    join public.rounds r on r.id = rs.round_id
    join public.registrations reg on reg.id = rs.registration_id
    where r.competition_season_id = p_competition_season_id
      and reg.status = 'approved'
      and reg.eligibility_status = 'eligible'
  )
  update public.round_scores rs
  set round_rank = ranked.new_rank
  from ranked
  where rs.id = ranked.id;

  update public.monthly_scores ms
  set previous_rank = ms.rank
  from public.monthly_periods mp
  where mp.id = ms.monthly_period_id
    and mp.competition_season_id = p_competition_season_id;

  insert into public.monthly_scores (
    monthly_period_id, registration_id, reported_points, effective_points,
    transfer_cost, provider_total_points, gameweeks_counted, is_provisional,
    revision, calculated_at, points_reached_at, provider_tie_rank
  )
  select
    mp.id, rs.registration_id,
    sum(rs.reported_points)::integer,
    sum(rs.reported_points)::integer,
    sum(rs.transfer_cost)::integer,
    coalesce(max(rs.total_points), 0)::integer,
    count(*)::integer,
    bool_or(rs.is_provisional) or mp.status not in ('completed', 'locked'),
    1, now(), max(rs.points_reached_at),
    (array_agg(coalesce(rs.overall_rank, rs.provider_tie_rank)
      order by r.external_round_id desc)
      filter (where coalesce(rs.overall_rank, rs.provider_tie_rank) is not null))[1]
  from public.monthly_periods mp
  join public.rounds r on r.competition_season_id = mp.competition_season_id
    and r.external_round_id between mp.start_round and mp.end_round
    and r.status <> 'cancelled'
  join public.round_scores rs on rs.round_id = r.id
  join public.registrations reg on reg.id = rs.registration_id
  where mp.competition_season_id = p_competition_season_id
    and reg.status = 'approved'
    and reg.eligibility_status = 'eligible'
  group by mp.id, rs.registration_id, mp.status
  on conflict (monthly_period_id, registration_id) do update
  set reported_points = excluded.reported_points,
      effective_points = excluded.reported_points,
      transfer_cost = excluded.transfer_cost,
      provider_total_points = excluded.provider_total_points,
      gameweeks_counted = excluded.gameweeks_counted,
      is_provisional = excluded.is_provisional,
      points_reached_at = excluded.points_reached_at,
      provider_tie_rank = excluded.provider_tie_rank,
      revision = public.monthly_scores.revision + 1,
      calculated_at = now();

  delete from public.monthly_scores ms
  using public.monthly_periods mp
  where mp.id = ms.monthly_period_id
    and mp.competition_season_id = p_competition_season_id
    and not exists (
      select 1
      from public.rounds r
      join public.round_scores rs on rs.round_id = r.id
      join public.registrations reg on reg.id = rs.registration_id
      where r.competition_season_id = p_competition_season_id
        and r.external_round_id between mp.start_round and mp.end_round
        and r.status <> 'cancelled'
        and rs.registration_id = ms.registration_id
        and reg.status = 'approved'
        and reg.eligibility_status = 'eligible'
    );

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

  update public.season_scores
  set previous_rank = rank
  where competition_season_id = p_competition_season_id;

  insert into public.season_scores (
    competition_season_id, registration_id, reported_points, effective_points,
    transfer_cost, provider_total_points, gameweeks_counted, is_provisional,
    revision, calculated_at, points_reached_at, provider_tie_rank
  )
  select
    p_competition_season_id, rs.registration_id,
    sum(rs.reported_points)::integer,
    sum(rs.reported_points)::integer,
    sum(rs.transfer_cost)::integer,
    coalesce(max(rs.total_points), 0)::integer,
    count(*)::integer, bool_or(rs.is_provisional), 1, now(),
    max(rs.points_reached_at),
    (array_agg(coalesce(rs.overall_rank, rs.provider_tie_rank)
      order by r.external_round_id desc)
      filter (where coalesce(rs.overall_rank, rs.provider_tie_rank) is not null))[1]
  from public.round_scores rs
  join public.rounds r on r.id = rs.round_id
  join public.registrations reg on reg.id = rs.registration_id
  where r.competition_season_id = p_competition_season_id
    and r.status <> 'cancelled'
    and reg.status = 'approved'
    and reg.eligibility_status = 'eligible'
  group by rs.registration_id
  on conflict (competition_season_id, registration_id) do update
  set reported_points = excluded.reported_points,
      effective_points = excluded.reported_points,
      transfer_cost = excluded.transfer_cost,
      provider_total_points = excluded.provider_total_points,
      gameweeks_counted = excluded.gameweeks_counted,
      is_provisional = excluded.is_provisional,
      points_reached_at = excluded.points_reached_at,
      provider_tie_rank = excluded.provider_tie_rank,
      revision = public.season_scores.revision + 1,
      calculated_at = now();

  delete from public.season_scores ss
  where ss.competition_season_id = p_competition_season_id
    and not exists (
      select 1
      from public.round_scores rs
      join public.rounds r on r.id = rs.round_id
      join public.registrations reg on reg.id = rs.registration_id
      where r.competition_season_id = p_competition_season_id
        and r.status <> 'cancelled'
        and rs.registration_id = ss.registration_id
        and reg.status = 'approved'
        and reg.eligibility_status = 'eligible'
    );

  with ranked as (
    select ss.id,
      row_number() over (
        partition by ss.competition_season_id
        order by ss.reported_points desc,
          ss.points_reached_at asc nulls last,
          ss.provider_tie_rank asc nulls last,
          ss.id asc
      )::integer as new_rank
    from public.season_scores ss
    where ss.competition_season_id = p_competition_season_id
  )
  update public.season_scores ss
  set rank = ranked.new_rank,
      movement = case
        when ss.previous_rank is null then 0
        else ss.previous_rank - ranked.new_rank
      end
  from ranked
  where ss.id = ranked.id;
end;
$$;

comment on function private.recalculate_scoreboards(uuid) is
  'Ranks by reported points, first-observed point arrival, then official provider order. Chips and transfer costs remain informational.';

create or replace function private.add_points_arrival_evidence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reached_at timestamptz;
  v_provider_rank bigint;
begin
  if new.source_round_score_id is not null then
    select points_reached_at, provider_tie_rank
    into v_reached_at, v_provider_rank
    from public.round_scores
    where id = new.source_round_score_id;
  elsif new.source_monthly_score_id is not null then
    select points_reached_at, provider_tie_rank
    into v_reached_at, v_provider_rank
    from public.monthly_scores
    where id = new.source_monthly_score_id;
  elsif new.source_season_score_id is not null then
    select points_reached_at, provider_tie_rank
    into v_reached_at, v_provider_rank
    from public.season_scores
    where id = new.source_season_score_id;
  end if;

  new.tie_break_values := coalesce(new.tie_break_values, '{}'::jsonb)
    || jsonb_build_object(
      'tie_breaker', 'points_arrival',
      'points_reached_at', v_reached_at,
      'provider_tie_rank', v_provider_rank
    );
  return new;
end;
$$;

revoke all on function private.add_points_arrival_evidence() from public;

drop trigger if exists winner_evaluations_add_points_arrival on public.winner_generation_evaluations;
create trigger winner_evaluations_add_points_arrival
before insert on public.winner_generation_evaluations
for each row execute function private.add_points_arrival_evidence();

-- Extend the existing audited winner generator without duplicating its full
-- review workflow. The replacement is guarded so schema drift fails loudly.
do $patch$
declare
  v_definition text;
  v_old_case text := $old$
      when 'earliest_fpl_verification' then ', fpl_verified_at asc nulls last'
      else null
$old$;
  v_new_case text := $new$
      when 'earliest_fpl_verification' then ', fpl_verified_at asc nulls last'
      when 'points_arrival' then ', (tie_break_values ->> ''points_reached_at'')::timestamptz asc nulls last, (tie_break_values ->> ''provider_tie_rank'')::bigint asc nulls last'
      else null
$new$;
  v_old_allowed text := $old$
      'earliest_registration',
      'earliest_fpl_verification'
    ) then
$old$;
  v_new_allowed text := $new$
      'earliest_registration',
      'earliest_fpl_verification',
      'points_arrival'
    ) then
$new$;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'generate_winner_candidate_internal'
  limit 1;

  if v_definition is null then
    raise exception 'Winner-generation implementation was not found.';
  end if;
  if position(v_old_case in v_definition) = 0
    or position(v_old_allowed in v_definition) = 0
    or position('v_order_clause := v_order_clause || '', registration_id asc'';' in v_definition) = 0
  then
    raise exception 'Winner-generation implementation changed; points-arrival patch was not applied.';
  end if;

  v_definition := replace(v_definition, v_old_case, v_new_case);
  v_definition := replace(v_definition, v_old_allowed, v_new_allowed);
  v_definition := replace(
    v_definition,
    'v_order_clause := v_order_clause || '', registration_id asc'';',
    'v_order_clause := v_order_clause || '', source_rank asc, id asc'';'
  );
  execute v_definition;
end
$patch$;

revoke all on function public.generate_winner_candidate_internal(uuid, uuid, text, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.generate_winner_candidate_internal(uuid, uuid, text, uuid, uuid, uuid)
  to service_role;

do $$
declare
  v_season_id uuid;
begin
  for v_season_id in
    select id from public.competition_seasons
  loop
    perform private.recalculate_scoreboards(v_season_id);
  end loop;
end;
$$;

comment on column public.round_scores.points_reached_at is
  'First provider observation of the current reported Gameweek point total.';
comment on column public.round_scores.provider_tie_rank is
  'Official provider Gameweek order used only when tied points arrived in the same observation window.';
comment on column public.round_scores.transfer_cost is
  'Recorded transfer-cost evidence; never deducted from Vult competition ranking points.';
comment on column public.round_scores.chip_used is
  'Recorded chip-use evidence; never changes Vult competition ranking or prize eligibility.';
