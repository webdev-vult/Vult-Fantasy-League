alter table public.round_scores
  add column if not exists source_provider_record_id uuid references public.provider_score_records(id) on delete set null,
  add column if not exists score_status text not null default 'provisional'
    check (score_status in ('provisional', 'final', 'corrected')),
  add column if not exists rules_version integer not null default 1 check (rules_version > 0),
  add column if not exists weekly_eligible boolean not null default true,
  add column if not exists eligibility_note text,
  add column if not exists promoted_at timestamptz,
  add column if not exists promoted_by uuid references public.admin_profiles(id) on delete set null,
  add column if not exists correction_count integer not null default 0 check (correction_count >= 0);

create table if not exists public.score_promotion_runs (
  id uuid primary key default gen_random_uuid(),
  competition_season_id uuid not null references public.competition_seasons(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  provider_sync_run_id uuid not null references public.provider_sync_runs(id) on delete restrict,
  status text not null default 'running'
    check (status in ('running', 'completed', 'partial', 'failed')),
  rules_version integer not null check (rules_version > 0),
  include_transfer_deductions boolean not null,
  weekly_chip_policy text not null,
  source_record_count integer not null default 0 check (source_record_count >= 0),
  promoted_record_count integer not null default 0 check (promoted_record_count >= 0),
  rejected_record_count integer not null default 0 check (rejected_record_count >= 0),
  requested_by uuid not null references public.admin_profiles(id) on delete restrict,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.score_corrections (
  id uuid primary key default gen_random_uuid(),
  round_score_id uuid not null references public.round_scores(id) on delete restrict,
  competition_season_id uuid not null references public.competition_seasons(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  previous_reported_points integer not null,
  previous_effective_points integer not null,
  previous_total_points integer not null,
  previous_transfer_cost integer not null,
  previous_chip_used text,
  previous_weekly_eligible boolean not null,
  corrected_reported_points integer not null,
  corrected_effective_points integer not null,
  corrected_total_points integer not null,
  corrected_transfer_cost integer not null,
  corrected_chip_used text,
  corrected_weekly_eligible boolean not null,
  reason text not null check (char_length(btrim(reason)) >= 8),
  requested_by uuid not null references public.admin_profiles(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_scores (
  id uuid primary key default gen_random_uuid(),
  monthly_period_id uuid not null references public.monthly_periods(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  reported_points integer not null default 0,
  effective_points integer not null default 0,
  transfer_cost integer not null default 0,
  provider_total_points integer not null default 0,
  gameweeks_counted integer not null default 0 check (gameweeks_counted >= 0),
  rank integer,
  previous_rank integer,
  movement integer not null default 0,
  is_provisional boolean not null default true,
  revision bigint not null default 1 check (revision > 0),
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (monthly_period_id, registration_id)
);

create table if not exists public.season_scores (
  id uuid primary key default gen_random_uuid(),
  competition_season_id uuid not null references public.competition_seasons(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  reported_points integer not null default 0,
  effective_points integer not null default 0,
  transfer_cost integer not null default 0,
  provider_total_points integer not null default 0,
  gameweeks_counted integer not null default 0 check (gameweeks_counted >= 0),
  rank integer,
  previous_rank integer,
  movement integer not null default 0,
  is_provisional boolean not null default true,
  revision bigint not null default 1 check (revision > 0),
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_season_id, registration_id)
);

create table if not exists public.leaderboard_publications (
  id uuid primary key default gen_random_uuid(),
  competition_season_id uuid not null references public.competition_seasons(id) on delete cascade,
  scope text not null check (scope in ('round', 'monthly', 'overall')),
  round_id uuid references public.rounds(id) on delete cascade,
  monthly_period_id uuid references public.monthly_periods(id) on delete cascade,
  title text not null,
  status text not null default 'published'
    check (status in ('published', 'withdrawn')),
  revision integer not null default 1 check (revision > 0),
  row_count integer not null default 0 check (row_count >= 0),
  is_provisional boolean not null default true,
  published_by uuid not null references public.admin_profiles(id) on delete restrict,
  published_at timestamptz not null default now(),
  withdrawn_by uuid references public.admin_profiles(id) on delete set null,
  withdrawn_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope = 'round' and round_id is not null and monthly_period_id is null)
    or (scope = 'monthly' and monthly_period_id is not null and round_id is null)
    or (scope = 'overall' and round_id is null and monthly_period_id is null)
  )
);

create table if not exists public.public_leaderboard_rows (
  id bigint generated by default as identity primary key,
  publication_id uuid not null references public.leaderboard_publications(id) on delete cascade,
  source_key text not null,
  rank integer not null check (rank > 0),
  previous_rank integer,
  movement integer not null default 0,
  display_name text not null,
  team_name text,
  points integer not null default 0,
  provider_total_points integer not null default 0,
  gameweeks_counted integer not null default 0,
  chip_used text,
  weekly_eligible boolean not null default true,
  is_tied boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (publication_id, source_key)
);

create index if not exists round_scores_source_provider_record_id_idx on public.round_scores(source_provider_record_id);
create index if not exists round_scores_promoted_by_idx on public.round_scores(promoted_by);
create index if not exists score_promotion_runs_season_round_idx on public.score_promotion_runs(competition_season_id, round_id, created_at desc);
create index if not exists score_promotion_runs_sync_run_idx on public.score_promotion_runs(provider_sync_run_id);
create index if not exists score_promotion_runs_requested_by_idx on public.score_promotion_runs(requested_by);
create index if not exists score_corrections_round_score_idx on public.score_corrections(round_score_id, created_at desc);
create index if not exists score_corrections_season_round_idx on public.score_corrections(competition_season_id, round_id, created_at desc);
create index if not exists score_corrections_registration_idx on public.score_corrections(registration_id, created_at desc);
create index if not exists score_corrections_requested_by_idx on public.score_corrections(requested_by);
create index if not exists monthly_scores_period_rank_idx on public.monthly_scores(monthly_period_id, rank);
create index if not exists monthly_scores_registration_idx on public.monthly_scores(registration_id);
create index if not exists season_scores_season_rank_idx on public.season_scores(competition_season_id, rank);
create index if not exists season_scores_registration_idx on public.season_scores(registration_id);
create index if not exists leaderboard_publications_lookup_idx on public.leaderboard_publications(competition_season_id, scope, status, published_at desc);
create index if not exists leaderboard_publications_round_id_idx on public.leaderboard_publications(round_id);
create index if not exists leaderboard_publications_monthly_period_id_idx on public.leaderboard_publications(monthly_period_id);
create index if not exists leaderboard_publications_published_by_idx on public.leaderboard_publications(published_by);
create index if not exists leaderboard_publications_withdrawn_by_idx on public.leaderboard_publications(withdrawn_by);
create index if not exists public_leaderboard_rows_publication_rank_idx on public.public_leaderboard_rows(publication_id, rank);

create trigger score_promotion_runs_set_updated_at before update on public.score_promotion_runs for each row execute function public.set_updated_at();
create trigger monthly_scores_set_updated_at before update on public.monthly_scores for each row execute function public.set_updated_at();
create trigger season_scores_set_updated_at before update on public.season_scores for each row execute function public.set_updated_at();
create trigger leaderboard_publications_set_updated_at before update on public.leaderboard_publications for each row execute function public.set_updated_at();

create or replace function private.recalculate_scoreboards(p_competition_season_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  with ranked as (
    select rs.id,
      row_number() over (partition by rs.round_id order by rs.effective_points desc, rs.total_points desc,
        rs.overall_rank asc nulls last,
        case when fe.provider_entry_id ~ '^[0-9]+$' then fe.provider_entry_id::numeric end asc nulls last,
        fe.provider_entry_id asc, reg.registered_at asc, rs.registration_id asc)::bigint as new_rank
    from public.round_scores rs
    join public.rounds r on r.id = rs.round_id
    join public.registrations reg on reg.id = rs.registration_id
    join public.fantasy_entries fe on fe.registration_id = reg.id
    where r.competition_season_id = p_competition_season_id
      and reg.status = 'approved' and reg.eligibility_status = 'eligible'
  )
  update public.round_scores rs set round_rank = ranked.new_rank from ranked where rs.id = ranked.id;

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
        and rs.registration_id = ms.registration_id and reg.status = 'approved' and reg.eligibility_status = 'eligible'
    );

  with ranked as (
    select ms.id,
      row_number() over (partition by ms.monthly_period_id order by ms.effective_points desc,
        ms.provider_total_points desc,
        case when fe.provider_entry_id ~ '^[0-9]+$' then fe.provider_entry_id::numeric end asc nulls last,
        fe.provider_entry_id asc, reg.registered_at asc, ms.registration_id asc)::integer as new_rank
    from public.monthly_scores ms
    join public.registrations reg on reg.id = ms.registration_id
    join public.fantasy_entries fe on fe.registration_id = reg.id
    join public.monthly_periods mp on mp.id = ms.monthly_period_id
    where mp.competition_season_id = p_competition_season_id
  )
  update public.monthly_scores ms
  set rank = ranked.new_rank,
      movement = case when ms.previous_rank is null then 0 else ms.previous_rank - ranked.new_rank end
  from ranked where ms.id = ranked.id;

  update public.season_scores set previous_rank = rank where competition_season_id = p_competition_season_id;

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
      and rs.registration_id = ss.registration_id and reg.status = 'approved' and reg.eligibility_status = 'eligible'
  );

  with ranked as (
    select ss.id,
      row_number() over (partition by ss.competition_season_id order by ss.effective_points desc,
        ss.provider_total_points desc,
        case when fe.provider_entry_id ~ '^[0-9]+$' then fe.provider_entry_id::numeric end asc nulls last,
        fe.provider_entry_id asc, reg.registered_at asc, ss.registration_id asc)::integer as new_rank
    from public.season_scores ss
    join public.registrations reg on reg.id = ss.registration_id
    join public.fantasy_entries fe on fe.registration_id = reg.id
    where ss.competition_season_id = p_competition_season_id
  )
  update public.season_scores ss
  set rank = ranked.new_rank,
      movement = case when ss.previous_rank is null then 0 else ss.previous_rank - ranked.new_rank end
  from ranked where ss.id = ranked.id;
end;
$$;

create or replace function public.promote_provider_scores(p_competition_season_id uuid, p_round_id uuid,
  p_provider_sync_run_id uuid, p_requested_by uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_jwt_role text := coalesce((select auth.jwt() ->> 'role'), '');
  v_admin_role text; v_round public.rounds%rowtype; v_sync_run public.provider_sync_runs%rowtype;
  v_rule public.competition_rules%rowtype; v_run_id uuid; v_source_count integer;
  v_promoted_count integer; v_rejected_count integer;
begin
  if v_jwt_role <> 'service_role' then raise exception 'Score promotion is restricted to the server service role.'; end if;
  select role into v_admin_role from public.admin_profiles where id = p_requested_by and is_active = true;
  if v_admin_role not in ('super_admin', 'competition_manager') then raise exception 'The requesting administrator cannot promote scores.'; end if;
  select * into v_round from public.rounds where id = p_round_id and competition_season_id = p_competition_season_id;
  if not found then raise exception 'Round not found.'; end if;
  if v_round.status in ('locked', 'cancelled') then raise exception 'Scores cannot be promoted into a locked or cancelled round.'; end if;
  select * into v_sync_run from public.provider_sync_runs
  where id = p_provider_sync_run_id and competition_season_id = p_competition_season_id;
  if not found then raise exception 'Provider sync run not found.'; end if;
  if v_sync_run.status not in ('succeeded', 'partial') then raise exception 'Only successful or partial provider runs can be promoted.'; end if;
  select * into v_rule from public.competition_rules
  where competition_season_id = p_competition_season_id and status = 'published'
  order by version desc limit 1;
  if not found then v_rule.version := 1; v_rule.include_transfer_deductions := true;
    v_rule.weekly_chip_policy := 'exclude_score_affecting_chips'; end if;
  select count(*) into v_source_count from public.provider_score_records
  where sync_run_id = p_provider_sync_run_id and round_id = p_round_id;
  if v_source_count = 0 then raise exception 'The selected provider run contains no records for this round.'; end if;
  insert into public.score_promotion_runs (competition_season_id, round_id, provider_sync_run_id, status,
    rules_version, include_transfer_deductions, weekly_chip_policy, source_record_count, requested_by)
  values (p_competition_season_id, p_round_id, p_provider_sync_run_id, 'running', v_rule.version,
    v_rule.include_transfer_deductions, v_rule.weekly_chip_policy, v_source_count, p_requested_by)
  returning id into v_run_id;
  insert into public.round_scores (registration_id, round_id, reported_points, effective_points, total_points,
    transfer_cost, chip_used, overall_rank, is_provisional, source_snapshot_id, source_provider_record_id,
    score_status, rules_version, weekly_eligible, eligibility_note, promoted_at, promoted_by, finalised_at)
  select psr.registration_id, p_round_id, coalesce(psr.reported_points, 0),
    coalesce(psr.reported_points, 0) - case when v_rule.include_transfer_deductions then coalesce(psr.transfer_cost, 0) else 0 end,
    coalesce(psr.total_points, 0), coalesce(psr.transfer_cost, 0), psr.chip_used, psr.overall_rank, true,
    psr.snapshot_id, psr.id, 'provisional', v_rule.version,
    not (v_rule.weekly_chip_policy = 'exclude_score_affecting_chips'
      and lower(replace(replace(coalesce(psr.chip_used, ''), '-', '_'), ' ', '_')) in ('bench_boost', 'triple_captain', 'free_hit')),
    case when v_rule.weekly_chip_policy = 'exclude_score_affecting_chips'
      and lower(replace(replace(coalesce(psr.chip_used, ''), '-', '_'), ' ', '_')) in ('bench_boost', 'triple_captain', 'free_hit')
      then 'Score-affecting chip excluded from weekly prize eligibility.' else null end,
    now(), p_requested_by, null
  from public.provider_score_records psr join public.registrations reg on reg.id = psr.registration_id
  where psr.sync_run_id = p_provider_sync_run_id and psr.round_id = p_round_id
    and psr.validation_status in ('valid', 'warning') and psr.registration_id is not null
    and reg.status = 'approved' and reg.eligibility_status = 'eligible'
  on conflict (registration_id, round_id) do update
  set reported_points = excluded.reported_points, effective_points = excluded.effective_points,
    total_points = excluded.total_points, transfer_cost = excluded.transfer_cost, chip_used = excluded.chip_used,
    overall_rank = excluded.overall_rank, is_provisional = true, source_snapshot_id = excluded.source_snapshot_id,
    source_provider_record_id = excluded.source_provider_record_id, score_status = 'provisional',
    rules_version = excluded.rules_version, weekly_eligible = excluded.weekly_eligible,
    eligibility_note = excluded.eligibility_note, promoted_at = now(), promoted_by = p_requested_by, finalised_at = null;
  get diagnostics v_promoted_count = row_count;
  v_rejected_count := v_source_count - v_promoted_count;
  perform private.recalculate_scoreboards(p_competition_season_id);
  update public.score_promotion_runs
  set status = case when v_rejected_count > 0 then 'partial' else 'completed' end,
    promoted_record_count = v_promoted_count, rejected_record_count = greatest(v_rejected_count, 0), completed_at = now()
  where id = v_run_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (p_requested_by, 'promote_provider_scores', 'score_promotion_run', v_run_id::text,
    jsonb_build_object('competition_season_id', p_competition_season_id, 'round_id', p_round_id,
      'provider_sync_run_id', p_provider_sync_run_id, 'source_record_count', v_source_count,
      'promoted_record_count', v_promoted_count, 'rejected_record_count', greatest(v_rejected_count, 0),
      'rules_version', v_rule.version));
  return v_run_id;
end;
$$;

create or replace function public.apply_round_score_correction(p_round_score_id uuid, p_reported_points integer,
  p_total_points integer, p_transfer_cost integer, p_chip_used text, p_reason text, p_requested_by uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_jwt_role text := coalesce((select auth.jwt() ->> 'role'), ''); v_admin_role text;
  v_score public.round_scores%rowtype; v_round public.rounds%rowtype; v_rule public.competition_rules%rowtype;
  v_effective integer; v_weekly_eligible boolean; v_correction_id uuid;
begin
  if v_jwt_role <> 'service_role' then raise exception 'Score correction is restricted to the server service role.'; end if;
  select role into v_admin_role from public.admin_profiles where id = p_requested_by and is_active = true;
  if v_admin_role not in ('super_admin', 'competition_manager') then raise exception 'The requesting administrator cannot correct scores.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 8 then raise exception 'A correction reason of at least 8 characters is required.'; end if;
  if p_transfer_cost < 0 then raise exception 'Transfer cost cannot be negative.'; end if;
  select * into v_score from public.round_scores where id = p_round_score_id;
  if not found then raise exception 'Round score not found.'; end if;
  select * into v_round from public.rounds where id = v_score.round_id;
  if v_round.status = 'locked' and v_admin_role <> 'super_admin' then raise exception 'Only a Super Admin can correct a locked round.'; end if;
  if v_round.status = 'cancelled' then raise exception 'Cancelled rounds cannot be corrected.'; end if;
  select * into v_rule from public.competition_rules
  where competition_season_id = v_round.competition_season_id and status = 'published'
  order by version desc limit 1;
  if not found then v_rule.version := v_score.rules_version; v_rule.include_transfer_deductions := true;
    v_rule.weekly_chip_policy := 'exclude_score_affecting_chips'; end if;
  v_effective := p_reported_points - case when v_rule.include_transfer_deductions then p_transfer_cost else 0 end;
  v_weekly_eligible := not (v_rule.weekly_chip_policy = 'exclude_score_affecting_chips'
    and lower(replace(replace(coalesce(p_chip_used, ''), '-', '_'), ' ', '_')) in ('bench_boost', 'triple_captain', 'free_hit'));
  insert into public.score_corrections (round_score_id, competition_season_id, round_id, registration_id,
    previous_reported_points, previous_effective_points, previous_total_points, previous_transfer_cost,
    previous_chip_used, previous_weekly_eligible, corrected_reported_points, corrected_effective_points,
    corrected_total_points, corrected_transfer_cost, corrected_chip_used, corrected_weekly_eligible,
    reason, requested_by, metadata)
  values (v_score.id, v_round.competition_season_id, v_score.round_id, v_score.registration_id,
    v_score.reported_points, v_score.effective_points, v_score.total_points, v_score.transfer_cost,
    v_score.chip_used, v_score.weekly_eligible, p_reported_points, v_effective, p_total_points,
    p_transfer_cost, nullif(btrim(coalesce(p_chip_used, '')), ''), v_weekly_eligible,
    btrim(p_reason), p_requested_by, jsonb_build_object('rules_version', v_rule.version))
  returning id into v_correction_id;
  update public.round_scores
  set reported_points = p_reported_points, effective_points = v_effective, total_points = p_total_points,
    transfer_cost = p_transfer_cost, chip_used = nullif(btrim(coalesce(p_chip_used, '')), ''),
    weekly_eligible = v_weekly_eligible,
    eligibility_note = case when not v_weekly_eligible then 'Score-affecting chip excluded from weekly prize eligibility.' else null end,
    score_status = 'corrected', rules_version = v_rule.version, correction_count = correction_count + 1
  where id = v_score.id;
  perform private.recalculate_scoreboards(v_round.competition_season_id);
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (p_requested_by, 'apply_score_correction', 'score_correction', v_correction_id::text,
    jsonb_build_object('round_score_id', v_score.id, 'round_id', v_score.round_id,
      'registration_id', v_score.registration_id, 'reason', btrim(p_reason)));
  return v_correction_id;
end;
$$;

create or replace function public.set_round_scores_finality(p_round_id uuid, p_final boolean, p_requested_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_jwt_role text := coalesce((select auth.jwt() ->> 'role'), ''); v_admin_role text; v_round public.rounds%rowtype;
begin
  if v_jwt_role <> 'service_role' then raise exception 'Score finalisation is restricted to the server service role.'; end if;
  select role into v_admin_role from public.admin_profiles where id = p_requested_by and is_active = true;
  if v_admin_role not in ('super_admin', 'competition_manager') then raise exception 'The requesting administrator cannot finalise scores.'; end if;
  select * into v_round from public.rounds where id = p_round_id;
  if not found then raise exception 'Round not found.'; end if;
  if v_round.status = 'locked' and not p_final then raise exception 'A locked round cannot be reopened from the score workspace.'; end if;
  if not p_final and v_admin_role <> 'super_admin' then raise exception 'Only a Super Admin can reopen final scores.'; end if;
  update public.round_scores set is_provisional = not p_final,
    score_status = case when p_final and score_status = 'corrected' then 'corrected' when p_final then 'final' else 'provisional' end,
    finalised_at = case when p_final then coalesce(finalised_at, now()) else null end
  where round_id = p_round_id;
  update public.rounds
  set status = case when p_final then case when status = 'locked' then 'locked' else 'final' end else 'awaiting_finalisation' end,
    is_final = p_final, finalised_at = case when p_final then coalesce(finalised_at, now()) else null end
  where id = p_round_id;
  perform private.recalculate_scoreboards(v_round.competition_season_id);
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (p_requested_by, case when p_final then 'finalise_round_scores' else 'reopen_round_scores' end,
    'round', p_round_id::text, jsonb_build_object('final', p_final));
end;
$$;

create or replace function public.refresh_scoreboards(p_competition_season_id uuid, p_requested_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_jwt_role text := coalesce((select auth.jwt() ->> 'role'), ''); v_admin_role text;
begin
  if v_jwt_role <> 'service_role' then raise exception 'Score refresh is restricted to the server service role.'; end if;
  select role into v_admin_role from public.admin_profiles where id = p_requested_by and is_active = true;
  if v_admin_role not in ('super_admin', 'competition_manager') then raise exception 'The requesting administrator cannot refresh scoreboards.'; end if;
  perform private.recalculate_scoreboards(p_competition_season_id);
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (p_requested_by, 'refresh_scoreboards', 'competition_season', p_competition_season_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.publish_leaderboard(p_competition_season_id uuid, p_scope text,
  p_round_id uuid, p_monthly_period_id uuid, p_title text, p_notes text, p_requested_by uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_jwt_role text := coalesce((select auth.jwt() ->> 'role'), ''); v_admin_role text;
  v_publication_id uuid; v_revision integer; v_row_count integer; v_is_provisional boolean := true;
  v_round public.rounds%rowtype; v_period public.monthly_periods%rowtype; v_season public.competition_seasons%rowtype;
begin
  if v_jwt_role <> 'service_role' then raise exception 'Leaderboard publication is restricted to the server service role.'; end if;
  select role into v_admin_role from public.admin_profiles where id = p_requested_by and is_active = true;
  if v_admin_role not in ('super_admin', 'competition_manager', 'content_manager') then raise exception 'The requesting administrator cannot publish leaderboards.'; end if;
  if p_scope not in ('round', 'monthly', 'overall') then raise exception 'Invalid leaderboard scope.'; end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null then raise exception 'A leaderboard title is required.'; end if;
  select * into v_season from public.competition_seasons where id = p_competition_season_id;
  if not found then raise exception 'Competition season not found.'; end if;
  if p_scope = 'round' then
    if p_round_id is null or p_monthly_period_id is not null then raise exception 'Round publication requires only a round.'; end if;
    select * into v_round from public.rounds where id = p_round_id and competition_season_id = p_competition_season_id;
    if not found then raise exception 'Round not found.'; end if;
    if v_round.status in ('scheduled', 'cancelled') then raise exception 'This round is not publishable.'; end if;
    if not exists (select 1 from public.round_scores where round_id = p_round_id) then raise exception 'No round scores are available.'; end if;
    v_is_provisional := v_round.status not in ('final', 'locked');
  elsif p_scope = 'monthly' then
    if p_monthly_period_id is null or p_round_id is not null then raise exception 'Monthly publication requires only a monthly period.'; end if;
    select * into v_period from public.monthly_periods where id = p_monthly_period_id and competition_season_id = p_competition_season_id;
    if not found then raise exception 'Monthly period not found.'; end if;
    if not exists (select 1 from public.monthly_scores where monthly_period_id = p_monthly_period_id) then raise exception 'No monthly scores are available.'; end if;
    v_is_provisional := v_period.status not in ('completed', 'locked');
  else
    if p_round_id is not null or p_monthly_period_id is not null then raise exception 'Overall publication does not accept a round or monthly period.'; end if;
    if not exists (select 1 from public.season_scores where competition_season_id = p_competition_season_id) then raise exception 'No season scores are available.'; end if;
    v_is_provisional := v_season.status <> 'completed';
  end if;
  perform private.recalculate_scoreboards(p_competition_season_id);
  select coalesce(max(revision), 0) + 1 into v_revision from public.leaderboard_publications
  where competition_season_id = p_competition_season_id and scope = p_scope
    and round_id is not distinct from p_round_id and monthly_period_id is not distinct from p_monthly_period_id;
  update public.leaderboard_publications set status = 'withdrawn', withdrawn_by = p_requested_by, withdrawn_at = now()
  where competition_season_id = p_competition_season_id and scope = p_scope
    and round_id is not distinct from p_round_id and monthly_period_id is not distinct from p_monthly_period_id
    and status = 'published';
  insert into public.leaderboard_publications (competition_season_id, scope, round_id, monthly_period_id,
    title, status, revision, is_provisional, published_by, notes)
  values (p_competition_season_id, p_scope, p_round_id, p_monthly_period_id, btrim(p_title),
    'published', v_revision, v_is_provisional, p_requested_by, nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_publication_id;
  if p_scope = 'round' then
    insert into public.public_leaderboard_rows (publication_id, source_key, rank, previous_rank, movement,
      display_name, team_name, points, provider_total_points, gameweeks_counted, chip_used,
      weekly_eligible, is_tied, metadata)
    select v_publication_id, pg_catalog.md5(rs.registration_id::text), coalesce(rs.round_rank, 999999)::integer,
      null, 0, coalesce(nullif(fe.manager_name, ''), nullif(fe.team_name, ''), 'Vult Manager'),
      nullif(fe.team_name, ''), rs.effective_points, rs.total_points, 1, rs.chip_used, rs.weekly_eligible,
      count(*) over (partition by rs.effective_points) > 1,
      jsonb_build_object('round_id', rs.round_id, 'score_status', rs.score_status,
        'eligibility_note', rs.eligibility_note, 'rules_version', rs.rules_version)
    from public.round_scores rs join public.registrations reg on reg.id = rs.registration_id
    join public.fantasy_entries fe on fe.registration_id = reg.id
    where rs.round_id = p_round_id and reg.status = 'approved' and reg.eligibility_status = 'eligible'
      and exists (select 1 from public.participant_consents pc where pc.registration_id = reg.id
        and pc.consent_type = 'publicity' and pc.accepted = true)
    order by rs.round_rank nulls last;
  elsif p_scope = 'monthly' then
    insert into public.public_leaderboard_rows (publication_id, source_key, rank, previous_rank, movement,
      display_name, team_name, points, provider_total_points, gameweeks_counted, weekly_eligible, is_tied, metadata)
    select v_publication_id, pg_catalog.md5(ms.registration_id::text), coalesce(ms.rank, 999999), ms.previous_rank,
      ms.movement, coalesce(nullif(fe.manager_name, ''), nullif(fe.team_name, ''), 'Vult Manager'),
      nullif(fe.team_name, ''), ms.effective_points, ms.provider_total_points, ms.gameweeks_counted, true,
      count(*) over (partition by ms.effective_points) > 1,
      jsonb_build_object('monthly_period_id', ms.monthly_period_id, 'revision', ms.revision)
    from public.monthly_scores ms join public.registrations reg on reg.id = ms.registration_id
    join public.fantasy_entries fe on fe.registration_id = reg.id
    where ms.monthly_period_id = p_monthly_period_id and reg.status = 'approved' and reg.eligibility_status = 'eligible'
      and exists (select 1 from public.participant_consents pc where pc.registration_id = reg.id
        and pc.consent_type = 'publicity' and pc.accepted = true)
    order by ms.rank nulls last;
  else
    insert into public.public_leaderboard_rows (publication_id, source_key, rank, previous_rank, movement,
      display_name, team_name, points, provider_total_points, gameweeks_counted, weekly_eligible, is_tied, metadata)
    select v_publication_id, pg_catalog.md5(ss.registration_id::text), coalesce(ss.rank, 999999), ss.previous_rank,
      ss.movement, coalesce(nullif(fe.manager_name, ''), nullif(fe.team_name, ''), 'Vult Manager'),
      nullif(fe.team_name, ''), ss.effective_points, ss.provider_total_points, ss.gameweeks_counted, true,
      count(*) over (partition by ss.effective_points) > 1,
      jsonb_build_object('competition_season_id', ss.competition_season_id, 'revision', ss.revision)
    from public.season_scores ss join public.registrations reg on reg.id = ss.registration_id
    join public.fantasy_entries fe on fe.registration_id = reg.id
    where ss.competition_season_id = p_competition_season_id and reg.status = 'approved'
      and reg.eligibility_status = 'eligible'
      and exists (select 1 from public.participant_consents pc where pc.registration_id = reg.id
        and pc.consent_type = 'publicity' and pc.accepted = true)
    order by ss.rank nulls last;
  end if;
  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then raise exception 'No publicity-consented leaderboard rows are available for publication.'; end if;
  update public.leaderboard_publications set row_count = v_row_count where id = v_publication_id;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (p_requested_by, 'publish_leaderboard', 'leaderboard_publication', v_publication_id::text,
    jsonb_build_object('scope', p_scope, 'revision', v_revision, 'row_count', v_row_count,
      'is_provisional', v_is_provisional));
  return v_publication_id;
end;
$$;

create or replace function public.withdraw_leaderboard(p_publication_id uuid, p_reason text, p_requested_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_jwt_role text := coalesce((select auth.jwt() ->> 'role'), ''); v_admin_role text;
begin
  if v_jwt_role <> 'service_role' then raise exception 'Leaderboard withdrawal is restricted to the server service role.'; end if;
  select role into v_admin_role from public.admin_profiles where id = p_requested_by and is_active = true;
  if v_admin_role not in ('super_admin', 'competition_manager', 'content_manager') then raise exception 'The requesting administrator cannot withdraw leaderboards.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 8 then raise exception 'A withdrawal reason of at least 8 characters is required.'; end if;
  update public.leaderboard_publications
  set status = 'withdrawn', withdrawn_by = p_requested_by, withdrawn_at = now(),
    notes = concat_ws(E'\n', notes, 'Withdrawal: ' || btrim(p_reason))
  where id = p_publication_id and status = 'published';
  if not found then raise exception 'Published leaderboard not found.'; end if;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (p_requested_by, 'withdraw_leaderboard', 'leaderboard_publication', p_publication_id::text,
    jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

alter table public.score_promotion_runs enable row level security;
alter table public.score_corrections enable row level security;
alter table public.monthly_scores enable row level security;
alter table public.season_scores enable row level security;
alter table public.leaderboard_publications enable row level security;
alter table public.public_leaderboard_rows enable row level security;

revoke all on public.score_promotion_runs from anon, authenticated;
revoke all on public.score_corrections from anon, authenticated;
revoke all on public.monthly_scores from anon, authenticated;
revoke all on public.season_scores from anon, authenticated;
revoke all on public.leaderboard_publications from anon, authenticated;
revoke all on public.public_leaderboard_rows from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.round_scores from authenticated;
grant select on public.round_scores to authenticated;
grant select on public.score_promotion_runs, public.score_corrections, public.monthly_scores, public.season_scores to authenticated;
grant select on public.leaderboard_publications, public.public_leaderboard_rows to anon, authenticated;
grant usage, select on sequence public.public_leaderboard_rows_id_seq to service_role;

create policy round_scores_admin_read_phase8 on public.round_scores for select to authenticated using (private.is_active_admin());
create policy score_promotion_runs_admin_read on public.score_promotion_runs for select to authenticated using (private.is_active_admin());
create policy score_corrections_admin_read on public.score_corrections for select to authenticated using (private.is_active_admin());
create policy monthly_scores_admin_read on public.monthly_scores for select to authenticated using (private.is_active_admin());
create policy season_scores_admin_read on public.season_scores for select to authenticated using (private.is_active_admin());
create policy leaderboard_publications_admin_read on public.leaderboard_publications for select to authenticated using (private.is_active_admin());
create policy leaderboard_publications_public_read on public.leaderboard_publications for select to anon, authenticated using (status = 'published');
create policy public_leaderboard_rows_admin_read on public.public_leaderboard_rows for select to authenticated using (private.is_active_admin());
create policy public_leaderboard_rows_public_read on public.public_leaderboard_rows for select to anon, authenticated
using (exists (select 1 from public.leaderboard_publications lp where lp.id = publication_id and lp.status = 'published'));

revoke all on function private.recalculate_scoreboards(uuid) from public, anon, authenticated;
revoke all on function public.promote_provider_scores(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_round_score_correction(uuid, integer, integer, integer, text, text, uuid) from public, anon, authenticated;
revoke all on function public.set_round_scores_finality(uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.refresh_scoreboards(uuid, uuid) from public, anon, authenticated;
revoke all on function public.publish_leaderboard(uuid, text, uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.withdraw_leaderboard(uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.promote_provider_scores(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.apply_round_score_correction(uuid, integer, integer, integer, text, text, uuid) to service_role;
grant execute on function public.set_round_scores_finality(uuid, boolean, uuid) to service_role;
grant execute on function public.refresh_scoreboards(uuid, uuid) to service_role;
grant execute on function public.publish_leaderboard(uuid, text, uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.withdraw_leaderboard(uuid, text, uuid) to service_role;

comment on table public.score_promotion_runs is 'Auditable provider-to-score promotion executions.';
comment on table public.score_corrections is 'Immutable before-and-after score correction history.';
comment on table public.monthly_scores is 'Calculated monthly standings by configured Gameweek range.';
comment on table public.season_scores is 'Calculated overall season standings.';
comment on table public.leaderboard_publications is 'Versioned public leaderboard publication headers.';
comment on table public.public_leaderboard_rows is 'Privacy-safe public leaderboard snapshot rows.';