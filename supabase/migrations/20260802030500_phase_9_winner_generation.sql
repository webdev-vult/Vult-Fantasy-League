create or replace function private.require_service_admin(
  p_requested_by uuid,
  p_allowed_roles text[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt_role text := coalesce((select auth.jwt() ->> 'role'), '');
  v_admin_role text;
begin
  if v_jwt_role <> 'service_role' then
    raise exception using message = 'Winner operations are restricted to the server service role.';
  end if;

  select ap.role into v_admin_role
  from public.admin_profiles ap
  where ap.id = p_requested_by
    and ap.is_active = true;

  if v_admin_role is null or not (v_admin_role = any(p_allowed_roles)) then
    raise exception using message = 'The requesting administrator is not authorised for this winner operation.';
  end if;

  return v_admin_role;
end;
$$;

revoke all on function private.require_service_admin(uuid, text[]) from public, anon, authenticated;
grant execute on function private.require_service_admin(uuid, text[]) to service_role;

create or replace function private.winner_country_code(p_country text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case upper(btrim(coalesce(p_country, '')))
    when 'SIERRA LEONE' then 'SL'
    when 'SLE' then 'SL'
    when 'SL' then 'SL'
    when 'UNITED KINGDOM' then 'GB'
    when 'UK' then 'GB'
    when 'GREAT BRITAIN' then 'GB'
    when 'UNITED STATES' then 'US'
    when 'UNITED STATES OF AMERICA' then 'US'
    when 'USA' then 'US'
    else upper(btrim(coalesce(p_country, '')))
  end
$$;

revoke all on function private.winner_country_code(text) from public, anon, authenticated;
grant execute on function private.winner_country_code(text) to service_role;

create or replace function private.evaluate_winner_eligibility(
  p_registration_id uuid,
  p_competition_season_id uuid,
  p_rules_id uuid,
  p_scope text,
  p_prize_id uuid,
  p_source_weekly_eligible boolean
)
returns table (
  eligibility_status text,
  checks jsonb,
  publicity_consent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations%rowtype;
  v_participant public.participants%rowtype;
  v_verification public.registration_verifications%rowtype;
  v_entry public.fantasy_entries%rowtype;
  v_rules public.competition_rules%rowtype;
  v_publicity boolean := false;
  v_repeat_conflict boolean := false;
  v_age integer;
  v_country_code text;
  v_employee boolean := false;
  v_manual_review boolean := false;
  v_required_failure boolean := false;
  v_review_required boolean := false;
  v_checks jsonb := '[]'::jsonb;
  v_pass boolean;
begin
  select * into v_registration
  from public.registrations
  where id = p_registration_id
    and competition_season_id = p_competition_season_id;
  if not found then
    raise exception using message = 'Registration not found for winner eligibility evaluation.';
  end if;

  select * into v_participant from public.participants where id = v_registration.participant_id;
  select * into v_verification from public.registration_verifications where registration_id = v_registration.id;
  select * into v_entry from public.fantasy_entries where registration_id = v_registration.id;
  select * into v_rules from public.competition_rules where id = p_rules_id and competition_season_id = p_competition_season_id;
  if not found then
    raise exception using message = 'Published rules were not found for winner eligibility evaluation.';
  end if;

  select exists (
    select 1 from public.participant_consents pc
    where pc.registration_id = v_registration.id
      and pc.consent_type = 'winner_publicity'
      and pc.accepted = true
  ) into v_publicity;

  v_age := case
    when v_participant.date_of_birth is null then null
    else date_part('year', age(current_date, v_participant.date_of_birth))::integer
  end;
  v_country_code := private.winner_country_code(v_participant.country);
  v_employee := lower(coalesce(v_registration.metadata ->> 'is_employee', 'false')) = 'true';
  v_manual_review := jsonb_typeof(v_rules.disqualification_rules) = 'array'
    and jsonb_array_length(v_rules.disqualification_rules) > 0;

  if p_scope = 'round' and not v_rules.repeat_weekly_winners_allowed then
    select exists (
      select 1
      from public.winner_candidates wc
      join public.prizes wp on wp.id = wc.prize_id
      where wc.competition_season_id = p_competition_season_id
        and wc.registration_id = v_registration.id
        and wc.is_current = true
        and wc.status not in ('rejected', 'superseded')
        and wp.frequency = 'weekly'
        and wc.prize_id <> p_prize_id
    ) into v_repeat_conflict;
  end if;

  v_pass := v_registration.status = 'approved' and v_registration.eligibility_status = 'eligible';
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'registration_approved', 'status', case when v_pass then 'pass' else 'fail' end,
    'is_required', true,
    'summary', case when v_pass then 'Registration is approved and eligible.' else 'Registration is not approved and eligible.' end,
    'details', jsonb_build_object('registration_status', v_registration.status, 'eligibility_status', v_registration.eligibility_status)
  ));
  v_required_failure := v_required_failure or not v_pass;

  v_pass := v_participant.id is not null and v_participant.status = 'active';
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'participant_active', 'status', case when v_pass then 'pass' else 'fail' end,
    'is_required', true,
    'summary', case when v_pass then 'Participant profile is active.' else 'Participant profile is suspended or blocked.' end,
    'details', jsonb_build_object('participant_status', coalesce(v_participant.status, 'missing'))
  ));
  v_required_failure := v_required_failure or not v_pass;

  v_pass := v_verification.fpl_status = 'verified'
    and v_entry.id is not null
    and v_entry.verified_at is not null;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'fpl_verified', 'status', case when v_pass then 'pass' else 'fail' end,
    'is_required', true,
    'summary', case when v_pass then 'Fantasy entry verification is complete.' else 'Fantasy entry verification is incomplete.' end,
    'details', jsonb_build_object(
      'verification_status', coalesce(v_verification.fpl_status, 'missing'),
      'provider_entry_id', v_entry.provider_entry_id,
      'verified_at', v_entry.verified_at
    )
  ));
  v_required_failure := v_required_failure or not v_pass;

  v_pass := not v_rules.requires_vult_account
    or (v_verification.vult_status = 'verified' and nullif(btrim(coalesce(v_participant.vult_customer_ref, '')), '') is not null);
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'vult_account_verified',
    'status', case when not v_rules.requires_vult_account then 'not_applicable' when v_pass then 'pass' else 'fail' end,
    'is_required', v_rules.requires_vult_account,
    'summary', case
      when not v_rules.requires_vult_account then 'A verified Vult account is not required by this rules version.'
      when v_pass then 'Vult account verification is complete.'
      else 'A verified Vult account is required.'
    end,
    'details', jsonb_build_object('verification_status', coalesce(v_verification.vult_status, 'missing'))
  ));
  v_required_failure := v_required_failure or not v_pass;

  v_pass := v_age is not null and v_age >= v_rules.minimum_age;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'minimum_age', 'status', case when v_pass then 'pass' else 'fail' end,
    'is_required', true,
    'summary', case when v_pass then 'Minimum age requirement is satisfied.' else 'Minimum age requirement is not satisfied or date of birth is missing.' end,
    'details', jsonb_build_object('minimum_age', v_rules.minimum_age, 'calculated_age', v_age)
  ));
  v_required_failure := v_required_failure or not v_pass;

  v_pass := v_country_code = any(v_rules.eligible_country_codes);
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'eligible_country', 'status', case when v_pass then 'pass' else 'fail' end,
    'is_required', true,
    'summary', case when v_pass then 'Country eligibility requirement is satisfied.' else 'Participant country is not included in the published eligible countries.' end,
    'details', jsonb_build_object('country', v_participant.country, 'country_code', v_country_code, 'eligible_country_codes', to_jsonb(v_rules.eligible_country_codes))
  ));
  v_required_failure := v_required_failure or not v_pass;

  v_pass := v_rules.employees_eligible or not v_employee;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'employee_eligibility', 'status', case when v_pass then 'pass' else 'fail' end,
    'is_required', true,
    'summary', case when v_pass then 'Employee eligibility rule is satisfied.' else 'Employees are not eligible under the published rules.' end,
    'details', jsonb_build_object('employees_eligible', v_rules.employees_eligible, 'participant_flagged_as_employee', v_employee)
  ));
  v_required_failure := v_required_failure or not v_pass;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'duplicate_risk',
    'status', case
      when v_verification.duplicate_risk = 'high' then 'fail'
      when v_verification.duplicate_risk = 'medium' then 'review'
      else 'pass'
    end,
    'is_required', true,
    'summary', case
      when v_verification.duplicate_risk = 'high' then 'High duplicate risk blocks automatic eligibility.'
      when v_verification.duplicate_risk = 'medium' then 'Medium duplicate risk requires manual competition review.'
      else 'No blocking duplicate risk was found.'
    end,
    'details', jsonb_build_object(
      'risk', coalesce(v_verification.duplicate_risk, 'missing'),
      'reasons', coalesce(v_verification.duplicate_risk_reasons, '[]'::jsonb)
    )
  ));
  v_required_failure := v_required_failure or coalesce(v_verification.duplicate_risk, 'high') = 'high';
  v_review_required := v_review_required or v_verification.duplicate_risk = 'medium';

  v_pass := p_scope <> 'round' or p_source_weekly_eligible;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'weekly_chip_eligibility',
    'status', case when p_scope <> 'round' then 'not_applicable' when v_pass then 'pass' else 'fail' end,
    'is_required', p_scope = 'round',
    'summary', case
      when p_scope <> 'round' then 'Weekly chip eligibility applies only to Gameweek prizes.'
      when v_pass then 'The Gameweek score is eligible under the chip policy.'
      else 'The Gameweek score is excluded from weekly prizes by the chip policy.'
    end,
    'details', jsonb_build_object('weekly_eligible', p_source_weekly_eligible)
  ));
  v_required_failure := v_required_failure or not v_pass;

  v_pass := not v_repeat_conflict;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'repeat_weekly_winner',
    'status', case
      when p_scope <> 'round' or v_rules.repeat_weekly_winners_allowed then 'not_applicable'
      when v_pass then 'pass'
      else 'fail'
    end,
    'is_required', p_scope = 'round' and not v_rules.repeat_weekly_winners_allowed,
    'summary', case
      when p_scope <> 'round' then 'Repeat-winner policy applies only to weekly prizes.'
      when v_rules.repeat_weekly_winners_allowed then 'Repeat weekly winners are allowed.'
      when v_pass then 'The participant has no conflicting current weekly winner candidate.'
      else 'The participant already has a current weekly winner candidate and repeat winners are disabled.'
    end,
    'details', jsonb_build_object('repeat_weekly_winners_allowed', v_rules.repeat_weekly_winners_allowed)
  ));
  v_required_failure := v_required_failure or not v_pass;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'winner_publicity',
    'status', case when v_publicity then 'pass' else 'review' end,
    'is_required', false,
    'summary', case when v_publicity then 'Winner-publicity consent is recorded.' else 'Winner-publicity consent is not recorded; confirmation can proceed but public naming will remain blocked.' end,
    'details', jsonb_build_object('accepted', v_publicity)
  ));

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'manual_disqualification_review',
    'status', case when v_manual_review then 'review' else 'not_applicable' end,
    'is_required', false,
    'summary', case when v_manual_review then 'Published disqualification rules require manual review.' else 'No additional manual disqualification rules are configured.' end,
    'details', jsonb_build_object('rules', v_rules.disqualification_rules)
  ));
  v_review_required := v_review_required or v_manual_review;

  eligibility_status := case
    when v_required_failure then 'ineligible'
    when v_review_required then 'review_required'
    else 'eligible'
  end;
  checks := v_checks;
  publicity_consent := v_publicity;
  return next;
end;
$$;

revoke all on function private.evaluate_winner_eligibility(uuid, uuid, uuid, text, uuid, boolean) from public, anon, authenticated;
grant execute on function private.evaluate_winner_eligibility(uuid, uuid, uuid, text, uuid, boolean) to service_role;

create or replace function public.generate_winner_candidate(
  p_competition_season_id uuid,
  p_prize_id uuid,
  p_scope text,
  p_round_id uuid,
  p_monthly_period_id uuid,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_role text;
  v_prize public.prizes%rowtype;
  v_rules public.competition_rules%rowtype;
  v_round public.rounds%rowtype;
  v_period public.monthly_periods%rowtype;
  v_season public.competition_seasons%rowtype;
  v_run_id uuid;
  v_candidate_id uuid;
  v_eval public.winner_generation_evaluations%rowtype;
  v_pool record;
  v_eligibility_status text;
  v_checks jsonb;
  v_publicity boolean;
  v_candidate_status text;
  v_source_count integer := 0;
  v_eligible_count integer := 0;
  v_review_count integer := 0;
  v_excluded_count integer := 0;
  v_order_clause text := 'score desc';
  v_breaker text;
  v_superseded record;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'competition_manager']::text[]
  );

  if p_scope not in ('round', 'monthly', 'overall') then
    raise exception using message = 'Winner scope is invalid.';
  end if;

  select * into v_prize
  from public.prizes
  where id = p_prize_id
    and competition_season_id = p_competition_season_id
    and is_active = true;
  if not found then
    raise exception using message = 'An active prize was not found for the selected competition season.';
  end if;

  if (p_scope = 'round' and v_prize.frequency <> 'weekly')
    or (p_scope = 'monthly' and v_prize.frequency <> 'monthly')
    or (p_scope = 'overall' and v_prize.frequency <> 'overall')
  then
    raise exception using message = 'The prize frequency does not match the selected winner scope.';
  end if;

  select * into v_rules
  from public.competition_rules
  where competition_season_id = p_competition_season_id
    and status = 'published'
  order by version desc
  limit 1;
  if not found then
    raise exception using message = 'Publish a competition rules version before generating winner candidates.';
  end if;
  if jsonb_typeof(v_rules.tie_breakers) <> 'array' or jsonb_array_length(v_rules.tie_breakers) = 0 then
    raise exception using message = 'The published rules must contain at least one supported tie-breaker.';
  end if;

  select * into v_season from public.competition_seasons where id = p_competition_season_id;
  if not found then
    raise exception using message = 'Competition season not found.';
  end if;

  if p_scope = 'round' then
    if p_round_id is null or p_monthly_period_id is not null then
      raise exception using message = 'A Gameweek is required for a weekly winner.';
    end if;
    select * into v_round from public.rounds
    where id = p_round_id and competition_season_id = p_competition_season_id;
    if not found or v_round.status not in ('final', 'locked') or not v_round.is_final then
      raise exception using message = 'Weekly winners can be generated only from a final or locked Gameweek.';
    end if;
  elsif p_scope = 'monthly' then
    if p_monthly_period_id is null or p_round_id is not null then
      raise exception using message = 'A monthly period is required for a monthly winner.';
    end if;
    select * into v_period from public.monthly_periods
    where id = p_monthly_period_id and competition_season_id = p_competition_season_id;
    if not found or v_period.status not in ('completed', 'locked') then
      raise exception using message = 'Monthly winners can be generated only from a completed or locked monthly period.';
    end if;
  else
    if p_round_id is not null or p_monthly_period_id is not null then
      raise exception using message = 'Overall winners do not use a Gameweek or monthly period.';
    end if;
    if v_season.status not in ('completed', 'archived') then
      raise exception using message = 'Overall winners can be generated only after the competition season is completed.';
    end if;
  end if;

  if exists (
    select 1 from public.winner_candidates wc
    where wc.prize_id = p_prize_id
      and wc.is_current = true
      and wc.scope = p_scope
      and wc.round_id is not distinct from p_round_id
      and wc.monthly_period_id is not distinct from p_monthly_period_id
      and wc.status in ('confirmed', 'payment_pending', 'paid', 'published')
  ) then
    raise exception using message = 'A confirmed or paid winner already exists for this prize and scope.';
  end if;

  for v_superseded in
    with changed as (
      update public.winner_candidates wc
      set is_current = false,
          status = 'superseded'
      where wc.prize_id = p_prize_id
        and wc.is_current = true
        and wc.scope = p_scope
        and wc.round_id is not distinct from p_round_id
        and wc.monthly_period_id is not distinct from p_monthly_period_id
        and wc.status not in ('confirmed', 'payment_pending', 'paid', 'published')
      returning wc.id, wc.status
    )
    select * from changed
  loop
    insert into public.winner_candidate_status_history(
      candidate_id, from_status, to_status, action, actor_user_id, notes
    ) values (
      v_superseded.id, v_superseded.status, 'superseded', 'regenerated', p_requested_by,
      'Superseded by a new winner-generation run.'
    );
  end loop;

  insert into public.winner_generation_runs(
    competition_season_id, prize_id, scope, round_id, monthly_period_id,
    rules_version, status, tie_breakers, repeat_weekly_winners_allowed,
    generated_by, metadata
  ) values (
    p_competition_season_id, p_prize_id, p_scope, p_round_id, p_monthly_period_id,
    v_rules.version, 'running', v_rules.tie_breakers, v_rules.repeat_weekly_winners_allowed,
    p_requested_by,
    jsonb_build_object(
      'prize_code', v_prize.code,
      'prize_name', v_prize.name,
      'prize_position', v_prize.position,
      'rules_id', v_rules.id,
      'rules_title', v_rules.title,
      'requested_by_role', v_admin_role
    )
  ) returning id into v_run_id;

  drop table if exists pg_temp.winner_pool;
  create temporary table pg_temp.winner_pool (
    registration_id uuid not null,
    source_round_score_id uuid,
    source_monthly_score_id uuid,
    source_season_score_id uuid,
    source_rank integer not null,
    score integer not null,
    provider_total_points integer not null,
    transfer_cost integer not null,
    gameweeks_counted integer not null,
    weekly_eligible boolean not null,
    provider_entry_id text,
    registered_at timestamptz not null,
    fpl_verified_at timestamptz,
    display_name text not null,
    team_name text
  ) on commit drop;

  if p_scope = 'round' then
    insert into pg_temp.winner_pool
    select rs.registration_id, rs.id, null, null,
      coalesce(rs.round_rank, 2147483647)::integer,
      rs.effective_points, rs.total_points, rs.transfer_cost, 1, rs.weekly_eligible,
      fe.provider_entry_id, reg.registered_at, fe.verified_at,
      coalesce(nullif(fe.manager_name, ''), par.full_name), fe.team_name
    from public.round_scores rs
    join public.registrations reg on reg.id = rs.registration_id
    join public.participants par on par.id = reg.participant_id
    join public.fantasy_entries fe on fe.registration_id = reg.id
    where rs.round_id = p_round_id
      and rs.is_provisional = false
      and rs.score_status in ('final', 'corrected');
  elsif p_scope = 'monthly' then
    insert into pg_temp.winner_pool
    select ms.registration_id, null, ms.id, null,
      coalesce(ms.rank, 2147483647),
      ms.effective_points, ms.provider_total_points, ms.transfer_cost, ms.gameweeks_counted, true,
      fe.provider_entry_id, reg.registered_at, fe.verified_at,
      coalesce(nullif(fe.manager_name, ''), par.full_name), fe.team_name
    from public.monthly_scores ms
    join public.registrations reg on reg.id = ms.registration_id
    join public.participants par on par.id = reg.participant_id
    join public.fantasy_entries fe on fe.registration_id = reg.id
    where ms.monthly_period_id = p_monthly_period_id
      and ms.is_provisional = false;
  else
    insert into pg_temp.winner_pool
    select ss.registration_id, null, null, ss.id,
      coalesce(ss.rank, 2147483647),
      ss.effective_points, ss.provider_total_points, ss.transfer_cost, ss.gameweeks_counted, true,
      fe.provider_entry_id, reg.registered_at, fe.verified_at,
      coalesce(nullif(fe.manager_name, ''), par.full_name), fe.team_name
    from public.season_scores ss
    join public.registrations reg on reg.id = ss.registration_id
    join public.participants par on par.id = reg.participant_id
    join public.fantasy_entries fe on fe.registration_id = reg.id
    where ss.competition_season_id = p_competition_season_id
      and ss.is_provisional = false;
  end if;

  select count(*) into v_source_count from pg_temp.winner_pool;
  if v_source_count = 0 then
    update public.winner_generation_runs
    set status = 'failed', completed_at = now(), error_summary = 'No final score rows were available for this scope.'
    where id = v_run_id;
    raise exception using message = 'No final score rows are available for winner generation.';
  end if;

  for v_pool in select * from pg_temp.winner_pool
  loop
    select e.eligibility_status, e.checks, e.publicity_consent
    into v_eligibility_status, v_checks, v_publicity
    from private.evaluate_winner_eligibility(
      v_pool.registration_id,
      p_competition_season_id,
      v_rules.id,
      p_scope,
      p_prize_id,
      v_pool.weekly_eligible
    ) e;

    insert into public.winner_generation_evaluations(
      generation_run_id, registration_id,
      source_round_score_id, source_monthly_score_id, source_season_score_id,
      source_rank, score, provider_total_points, transfer_cost, gameweeks_counted,
      weekly_eligible, provider_entry_id, registered_at, fpl_verified_at,
      display_name, team_name, eligibility_status, checks, tie_break_values
    ) values (
      v_run_id, v_pool.registration_id,
      v_pool.source_round_score_id, v_pool.source_monthly_score_id, v_pool.source_season_score_id,
      v_pool.source_rank, v_pool.score, v_pool.provider_total_points, v_pool.transfer_cost, v_pool.gameweeks_counted,
      v_pool.weekly_eligible, v_pool.provider_entry_id, v_pool.registered_at, v_pool.fpl_verified_at,
      v_pool.display_name, v_pool.team_name, v_eligibility_status, v_checks,
      jsonb_build_object(
        'provider_total_points', v_pool.provider_total_points,
        'transfer_cost', v_pool.transfer_cost,
        'gameweeks_counted', v_pool.gameweeks_counted,
        'provider_entry_id', v_pool.provider_entry_id,
        'registered_at', v_pool.registered_at,
        'fpl_verified_at', v_pool.fpl_verified_at,
        'publicity_consent', v_publicity
      )
    );
  end loop;

  select
    count(*) filter (where eligibility_status = 'eligible'),
    count(*) filter (where eligibility_status = 'review_required'),
    count(*) filter (where eligibility_status = 'ineligible')
  into v_eligible_count, v_review_count, v_excluded_count
  from public.winner_generation_evaluations
  where generation_run_id = v_run_id;

  for v_breaker in select value from jsonb_array_elements_text(v_rules.tie_breakers)
  loop
    v_order_clause := v_order_clause || case v_breaker
      when 'highest_provider_total_points' then ', provider_total_points desc'
      when 'lowest_transfer_cost' then ', transfer_cost asc'
      when 'most_gameweeks_counted' then ', gameweeks_counted desc'
      when 'lowest_fpl_entry_id' then ', case when provider_entry_id ~ ''^[0-9]+$'' then provider_entry_id::numeric end asc nulls last, provider_entry_id asc nulls last'
      when 'earliest_registration' then ', registered_at asc'
      when 'earliest_fpl_verification' then ', fpl_verified_at asc nulls last'
      else null
    end;

    if v_breaker not in (
      'highest_provider_total_points',
      'lowest_transfer_cost',
      'most_gameweeks_counted',
      'lowest_fpl_entry_id',
      'earliest_registration',
      'earliest_fpl_verification'
    ) then
      raise exception using message = 'Unsupported tie-breaker in the published rules: ' || v_breaker;
    end if;
  end loop;
  v_order_clause := v_order_clause || ', registration_id asc';

  execute format(
    'with ordered as (
       select id, row_number() over (order by %s)::integer as new_order
       from public.winner_generation_evaluations
       where generation_run_id = $1
         and eligibility_status in (''eligible'', ''review_required'')
     )
     update public.winner_generation_evaluations e
     set selection_order = ordered.new_order
     from ordered
     where e.id = ordered.id',
    v_order_clause
  ) using v_run_id;

  select * into v_eval
  from public.winner_generation_evaluations
  where generation_run_id = v_run_id
    and selection_order = v_prize.position;

  if not found then
    update public.winner_generation_runs
    set status = 'partial',
        source_row_count = v_source_count,
        eligible_row_count = v_eligible_count,
        review_row_count = v_review_count,
        excluded_row_count = v_excluded_count,
        generated_candidate_count = 0,
        completed_at = now(),
        error_summary = 'No eligible or reviewable entry was available for the configured prize position.'
    where id = v_run_id;

    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (
      p_requested_by, 'winner_generation_completed', 'winner_generation_run', v_run_id::text,
      jsonb_build_object('status', 'partial', 'scope', p_scope, 'prize_id', p_prize_id, 'generated_candidate_count', 0)
    );
    return v_run_id;
  end if;

  v_publicity := coalesce((v_eval.tie_break_values ->> 'publicity_consent')::boolean, false);
  v_candidate_status := case when v_eval.eligibility_status = 'review_required' then 'under_review' else 'provisional' end;

  insert into public.winner_candidates(
    competition_season_id, registration_id, prize_id, round_id, monthly_period_id,
    score, rank, status, rules_version, generation_run_id, scope,
    source_round_score_id, source_monthly_score_id, source_season_score_id,
    candidate_order, prize_position, eligibility_status, eligibility_summary,
    tie_break_values, publicity_consent, publication_ready, publication_readiness_note,
    display_name_snapshot, team_name_snapshot, provider_entry_id_snapshot,
    prize_snapshot, generated_at, is_current
  ) values (
    p_competition_season_id, v_eval.registration_id, p_prize_id, p_round_id, p_monthly_period_id,
    v_eval.score, v_eval.source_rank, v_candidate_status, v_rules.version, v_run_id, p_scope,
    v_eval.source_round_score_id, v_eval.source_monthly_score_id, v_eval.source_season_score_id,
    v_eval.selection_order, v_prize.position, v_eval.eligibility_status, v_eval.checks,
    v_eval.tie_break_values, v_publicity, false,
    case when v_publicity then 'Awaiting competition and compliance approval.' else 'Winner-publicity consent is not recorded.' end,
    v_eval.display_name, v_eval.team_name, v_eval.provider_entry_id,
    jsonb_build_object(
      'id', v_prize.id,
      'code', v_prize.code,
      'name', v_prize.name,
      'frequency', v_prize.frequency,
      'position', v_prize.position,
      'amount', v_prize.amount,
      'currency', v_prize.currency,
      'prize_type', v_prize.prize_type,
      'payment_method', v_prize.payment_method
    ),
    now(), true
  ) returning id into v_candidate_id;

  update public.winner_generation_evaluations
  set selected_candidate_id = v_candidate_id
  where id = v_eval.id;

  insert into public.winner_candidate_checks(
    candidate_id, check_code, check_status, is_required, summary, details, evaluated_at
  )
  select
    v_candidate_id,
    item ->> 'code',
    item ->> 'status',
    coalesce((item ->> 'is_required')::boolean, true),
    item ->> 'summary',
    coalesce(item -> 'details', '{}'::jsonb),
    now()
  from jsonb_array_elements(v_eval.checks) item;

  insert into public.winner_candidate_status_history(
    candidate_id, from_status, to_status, action, actor_user_id, notes, metadata
  ) values (
    v_candidate_id, null, v_candidate_status, 'generated', p_requested_by,
    'Winner candidate generated from final standings and published rules.',
    jsonb_build_object('generation_run_id', v_run_id, 'selection_order', v_eval.selection_order, 'source_rank', v_eval.source_rank)
  );

  update public.winner_generation_runs
  set status = 'completed',
      source_row_count = v_source_count,
      eligible_row_count = v_eligible_count,
      review_row_count = v_review_count,
      excluded_row_count = v_excluded_count,
      generated_candidate_count = 1,
      completed_at = now()
  where id = v_run_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by, 'winner_candidate_generated', 'winner_candidate', v_candidate_id::text,
    jsonb_build_object(
      'generation_run_id', v_run_id,
      'scope', p_scope,
      'prize_id', p_prize_id,
      'registration_id', v_eval.registration_id,
      'score', v_eval.score,
      'source_rank', v_eval.source_rank,
      'selection_order', v_eval.selection_order,
      'eligibility_status', v_eval.eligibility_status,
      'rules_version', v_rules.version
    )
  );

  return v_run_id;
end;
$$;

revoke all on function public.generate_winner_candidate(uuid, uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.generate_winner_candidate(uuid, uuid, text, uuid, uuid, uuid) to service_role;
