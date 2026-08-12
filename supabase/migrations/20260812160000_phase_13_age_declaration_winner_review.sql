do $$
declare
  v_definition text;
  v_old text := $old$
  v_pass := v_age is not null and v_age >= v_rules.minimum_age;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'minimum_age', 'status', case when v_pass then 'pass' else 'fail' end,
    'is_required', true,
    'summary', case when v_pass then 'Minimum age requirement is satisfied.' else 'Minimum age requirement is not satisfied or date of birth is missing.' end,
    'details', jsonb_build_object('minimum_age', v_rules.minimum_age, 'calculated_age', v_age)
  ));
  v_required_failure := v_required_failure or not v_pass;
$old$;
  v_new text := $new$
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
$new$;
begin
  select pg_get_functiondef(
    'private.evaluate_winner_eligibility(uuid,uuid,uuid,text,uuid,boolean)'::regprocedure
  ) into v_definition;

  if position(v_old in v_definition) = 0 then
    raise exception 'Expected minimum-age eligibility block was not found. Review the current winner function before applying Phase 13 age hardening.';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end;
$$;

comment on function private.evaluate_winner_eligibility(uuid, uuid, uuid, text, uuid, boolean)
is 'Evaluates winner eligibility. A recorded DOB can satisfy or fail minimum-age rules; an accepted registration age declaration without DOB produces review_required for human Compliance review rather than automatic disqualification.';
