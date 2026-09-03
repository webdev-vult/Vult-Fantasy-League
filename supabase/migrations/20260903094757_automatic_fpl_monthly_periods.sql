alter table public.monthly_periods
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'official_fpl_deadlines')),
  add column if not exists calendar_month date,
  add column if not exists last_synced_at timestamptz;

create unique index if not exists monthly_periods_official_calendar_month_idx
  on public.monthly_periods (competition_season_id, calendar_month)
  where calendar_month is not null;

comment on column public.monthly_periods.calendar_month is
  'First day of the Sierra Leone calendar month represented by this prize period.';
comment on column public.monthly_periods.source is
  'Whether the period was entered manually or derived from official FPL Gameweek deadlines.';

create or replace function public.sync_fpl_monthly_periods(
  p_competition_season_id uuid,
  p_events jsonb,
  p_requested_by uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_group record;
  v_period public.monthly_periods%rowtype;
  v_overlap_count integer;
  v_created integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_blocked integer := 0;
  v_range_changed boolean;
  v_period_found boolean;
  v_status text;
  v_name text;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception using message = 'Official FPL calendar sync is restricted to the server service role.';
  end if;

  if not exists (
    select 1
    from public.competition_seasons cs
    where cs.id = p_competition_season_id
      and cs.data_provider = 'approved_fpl'
  ) then
    raise exception using message = 'An approved FPL competition season is required.';
  end if;

  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 then
    raise exception using message = 'Official FPL calendar data is empty or invalid.';
  end if;

  drop table if exists pg_temp.fpl_calendar_events;
  create temporary table pg_temp.fpl_calendar_events (
    external_round_id integer primary key,
    event_name text not null,
    deadline_at timestamptz not null,
    finished boolean not null,
    data_checked boolean not null
  ) on commit drop;

  insert into pg_temp.fpl_calendar_events (
    external_round_id,
    event_name,
    deadline_at,
    finished,
    data_checked
  )
  select
    (event ->> 'id')::integer,
    coalesce(nullif(btrim(event ->> 'name'), ''), 'Gameweek ' || (event ->> 'id')),
    (event ->> 'deadline_time')::timestamptz,
    coalesce((event ->> 'finished')::boolean, false),
    coalesce((event ->> 'data_checked')::boolean, false)
  from jsonb_array_elements(p_events) event
  where event ->> 'id' ~ '^[1-9][0-9]*$'
    and nullif(event ->> 'deadline_time', '') is not null;

  if not exists (select 1 from pg_temp.fpl_calendar_events) then
    raise exception using message = 'Official FPL calendar data contains no dated Gameweeks.';
  end if;

  update public.rounds r
  set name = e.event_name,
      deadline_at = e.deadline_at,
      updated_at = now()
  from pg_temp.fpl_calendar_events e
  where r.competition_season_id = p_competition_season_id
    and r.external_round_id = e.external_round_id
    and r.status <> 'locked'
    and (r.name, r.deadline_at) is distinct from (e.event_name, e.deadline_at);

  drop table if exists pg_temp.fpl_month_groups;
  create temporary table pg_temp.fpl_month_groups on commit drop as
  select
    date_trunc('month', deadline_at at time zone 'Africa/Freetown')::date as calendar_month,
    min(external_round_id)::integer as start_round,
    max(external_round_id)::integer as end_round
  from pg_temp.fpl_calendar_events
  group by date_trunc('month', deadline_at at time zone 'Africa/Freetown')::date;

  for v_group in
    select * from pg_temp.fpl_month_groups order by calendar_month
  loop
    select count(*)
    into v_overlap_count
    from public.monthly_periods mp
    where mp.competition_season_id = p_competition_season_id
      and mp.start_round <= v_group.end_round
      and mp.end_round >= v_group.start_round
      and (mp.calendar_month is null or mp.calendar_month <> v_group.calendar_month);

    select *
    into v_period
    from public.monthly_periods mp
    where mp.competition_season_id = p_competition_season_id
      and (
        mp.calendar_month = v_group.calendar_month
        or (
          mp.calendar_month is null
          and mp.start_round <= v_group.end_round
          and mp.end_round >= v_group.start_round
        )
      )
    order by (mp.calendar_month = v_group.calendar_month) desc, mp.created_at
    limit 1;

    v_period_found := found;

    if v_period_found and v_period.calendar_month is null then
      v_overlap_count := greatest(v_overlap_count - 1, 0);
    end if;

    if v_overlap_count > 0 then
      v_blocked := v_blocked + 1;
      continue;
    end if;

    select case
      when (
        select count(*) = (v_group.end_round - v_group.start_round + 1)
          and bool_and(r.is_final and r.status in ('final', 'locked'))
        from public.rounds r
        where r.competition_season_id = p_competition_season_id
          and r.external_round_id between v_group.start_round and v_group.end_round
      )
      and not exists (
        select 1
        from public.rounds r
        where r.competition_season_id = p_competition_season_id
          and r.external_round_id between v_group.start_round and v_group.end_round
          and not exists (
            select 1 from public.round_scores rs where rs.round_id = r.id
          )
      )
      and not exists (
        select 1
        from public.rounds r
        join public.round_scores rs on rs.round_id = r.id
        where r.competition_season_id = p_competition_season_id
          and r.external_round_id between v_group.start_round and v_group.end_round
          and (rs.is_provisional or rs.score_status not in ('final', 'corrected'))
      ) then 'completed'
      when v_group.calendar_month <= date_trunc(
        'month', now() at time zone 'Africa/Freetown'
      )::date then 'active'
      else 'draft'
    end
    into v_status;

    v_name := to_char(v_group.calendar_month, 'FMMonth YYYY') || ' Prize Period';

    if not v_period_found then
      insert into public.monthly_periods (
        competition_season_id,
        name,
        description,
        start_round,
        end_round,
        status,
        source,
        calendar_month,
        last_synced_at
      ) values (
        p_competition_season_id,
        v_name,
        'Automatically generated from official FPL Gameweek deadlines in Sierra Leone time.',
        v_group.start_round,
        v_group.end_round,
        v_status,
        'official_fpl_deadlines',
        v_group.calendar_month,
        now()
      );
      v_created := v_created + 1;
      continue;
    end if;

    if v_period.status = 'locked' or exists (
      select 1
      from public.winner_candidates wc
      where wc.monthly_period_id = v_period.id
        and wc.is_current = true
    ) then
      v_blocked := v_blocked + 1;
      continue;
    end if;

    v_range_changed := (v_period.start_round, v_period.end_round)
      is distinct from (v_group.start_round, v_group.end_round);

    if v_range_changed then
      update public.leaderboard_publications lp
      set status = 'withdrawn',
          withdrawn_at = now(),
          withdrawn_by = p_requested_by,
          notes = concat_ws(
            E'\n',
            nullif(lp.notes, ''),
            'Automatically withdrawn because the official FPL monthly Gameweek range changed.'
          ),
          updated_at = now()
      where lp.monthly_period_id = v_period.id
        and lp.status = 'published';
    end if;

    update public.monthly_periods mp
    set start_round = v_group.start_round,
        end_round = v_group.end_round,
        status = v_status,
        source = 'official_fpl_deadlines',
        calendar_month = v_group.calendar_month,
        description = 'Automatically generated from official FPL Gameweek deadlines in Sierra Leone time.',
        last_synced_at = now(),
        updated_at = now()
    where mp.id = v_period.id;

    if v_range_changed
      or v_period.status <> v_status
      or v_period.source <> 'official_fpl_deadlines'
      or v_period.calendar_month is distinct from v_group.calendar_month then
      v_updated := v_updated + 1;
    else
      v_unchanged := v_unchanged + 1;
    end if;
  end loop;

  perform private.recalculate_scoreboards(p_competition_season_id);

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_requested_by,
    'sync_fpl_monthly_periods',
    'competition_season',
    p_competition_season_id::text,
    jsonb_build_object(
      'created', v_created,
      'updated', v_updated,
      'unchanged', v_unchanged,
      'blocked', v_blocked,
      'timezone', 'Africa/Freetown'
    )
  );

  return jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'blocked', v_blocked
  );
end;
$$;

revoke all on function public.sync_fpl_monthly_periods(uuid, jsonb, uuid) from public;
revoke all on function public.sync_fpl_monthly_periods(uuid, jsonb, uuid) from anon, authenticated;
grant execute on function public.sync_fpl_monthly_periods(uuid, jsonb, uuid) to service_role;