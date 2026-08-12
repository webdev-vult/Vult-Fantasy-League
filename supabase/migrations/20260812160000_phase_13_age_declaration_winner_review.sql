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

  if v_rules.minimum_age <= 0 then
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'code', 'minimum_age',
      'status', 'not_applicable',
      'is_required', false,
      'summary', 'No minimum-age requirement applies under this rules version.',
      'details', jsonb_build_object(
        'minimum_age', v_rules.minimum_age,
        'calculated_age', v_age,
        'age_declaration_recorded', lower(coalesce(v_registration.metadata ->> 'age_eligibility_confirmed', 'false')) = 'true'
      )
    ));
  elsif v_age is not null then
    v_pass := v_age >= v_rules.minimum_age;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'code', 'minimum_age',
      'status', case when v_pass then 'pass' else 'fail' end,
      'is_required', true,
      'summary', case
        when v_pass then 'Minimum age requirement is satisfied by the recorded date of birth.'
        else 'The recorded date of birth does not satisfy the minimum age requirement.'
      end,
      'details', jsonb_build_object(
        'minimum_age', v_rules.minimum_age,
        'calculated_age', v_age,
        'verification_basis', 'date_of_birth',
        'age_declaration_recorded', lower(coalesce(v_registration.metadata ->> 'age_eligibility_confirmed', 'false')) = 'true'
      )
    ));
    v_required_failure := v_required_failure or not v_pass;
  elsif lower(coalesce(v_registration.metadata ->> 'age_eligibility_confirmed', 'false')) = 'true' then
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'code', 'minimum_age',
      'status', 'review',
      'is_required', true,
      'summary', 'The participant declared that they meet the minimum age requirement; Compliance must verify age eligibility before final winner approval.',
      'details', jsonb_build_object(
        'minimum_age', v_rules.minimum_age,
        'calculated_age', null,
        'verification_basis', 'participant_declaration',
        'age_declaration_recorded', true
      )
    ));
    v_review_required := true;
  else
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'code', 'minimum_age',
      'status', 'fail',
      'is_required', true,
      'summary', 'Minimum age eligibility cannot be established because neither a valid age declaration nor a date of birth is recorded.',
      'details', jsonb_build_object(
        'minimum_age', v_rules.minimum_age,
        'calculated_age', null,
        'verification_basis', 'missing',
        'age_declaration_recorded', false
      )
    ));
    v_required_failure := true;
  end if;

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

comment on function private.evaluate_winner_eligibility(uuid, uuid, uuid, text, uuid, boolean)
is 'Evaluates winner eligibility. A recorded DOB can satisfy or fail minimum-age rules; an accepted registration age declaration without DOB produces review_required for human Compliance review rather than automatic disqualification.';
