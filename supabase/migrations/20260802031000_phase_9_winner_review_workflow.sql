create or replace function public.competition_review_winner_candidate(
  p_candidate_id uuid,
  p_decision text,
  p_notes text,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_role text;
  v_candidate public.winner_candidates%rowtype;
  v_new_status text;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'competition_manager']::text[]
  );

  if p_decision not in ('approve', 'reject') then
    raise exception using message = 'Competition review decision must be approve or reject.';
  end if;
  if char_length(btrim(coalesce(p_notes, ''))) < 8 then
    raise exception using message = 'Competition review notes must contain at least 8 characters.';
  end if;

  select * into v_candidate
  from public.winner_candidates
  where id = p_candidate_id
  for update;
  if not found then
    raise exception using message = 'Winner candidate not found.';
  end if;
  if not v_candidate.is_current then
    raise exception using message = 'Only the current winner candidate can be reviewed.';
  end if;
  if v_candidate.status in ('confirmed', 'payment_pending', 'paid', 'published', 'superseded') then
    raise exception using message = 'This winner candidate can no longer enter competition review.';
  end if;

  if p_decision = 'approve' then
    if v_candidate.eligibility_status = 'ineligible' then
      raise exception using message = 'An ineligible candidate cannot be approved.';
    end if;
    if v_candidate.status not in ('provisional', 'under_review') then
      raise exception using message = 'This candidate is not awaiting competition review.';
    end if;
    v_new_status := 'competition_approved';

    update public.winner_candidates
    set status = v_new_status,
        competition_review_status = 'approved',
        competition_reviewed_by = p_requested_by,
        competition_reviewed_at = now(),
        competition_review_notes = btrim(p_notes),
        reviewed_by = p_requested_by,
        reviewed_at = now(),
        review_notes = btrim(p_notes),
        rejection_reason = null,
        publication_readiness_note = case
          when publicity_consent then 'Competition review approved; awaiting compliance approval.'
          else 'Competition review approved; winner-publicity consent is not recorded.'
        end
    where id = p_candidate_id;
  else
    if v_candidate.status not in ('provisional', 'under_review', 'competition_approved') then
      raise exception using message = 'This candidate cannot be rejected at the competition-review stage.';
    end if;
    v_new_status := 'rejected';

    update public.winner_candidates
    set status = v_new_status,
        competition_review_status = 'rejected',
        competition_reviewed_by = p_requested_by,
        competition_reviewed_at = now(),
        competition_review_notes = btrim(p_notes),
        reviewed_by = p_requested_by,
        reviewed_at = now(),
        review_notes = btrim(p_notes),
        rejection_reason = btrim(p_notes),
        publication_ready = false,
        publication_readiness_note = 'Candidate rejected during competition review.'
    where id = p_candidate_id;
  end if;

  insert into public.winner_candidate_status_history(
    candidate_id, from_status, to_status, action, actor_user_id, notes, metadata
  ) values (
    p_candidate_id, v_candidate.status, v_new_status,
    case when p_decision = 'approve' then 'competition_approved' else 'competition_rejected' end,
    p_requested_by, btrim(p_notes), jsonb_build_object('actor_role', v_admin_role)
  );

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by,
    case when p_decision = 'approve' then 'winner_competition_approved' else 'winner_competition_rejected' end,
    'winner_candidate', p_candidate_id::text,
    jsonb_build_object('previous_status', v_candidate.status, 'new_status', v_new_status, 'notes', btrim(p_notes))
  );

  return p_candidate_id;
end;
$$;

create or replace function public.compliance_review_winner_candidate(
  p_candidate_id uuid,
  p_decision text,
  p_notes text,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_role text;
  v_candidate public.winner_candidates%rowtype;
  v_new_status text;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'compliance_officer']::text[]
  );

  if p_decision not in ('approve', 'reject') then
    raise exception using message = 'Compliance review decision must be approve or reject.';
  end if;
  if char_length(btrim(coalesce(p_notes, ''))) < 8 then
    raise exception using message = 'Compliance review notes must contain at least 8 characters.';
  end if;

  select * into v_candidate
  from public.winner_candidates
  where id = p_candidate_id
  for update;
  if not found then
    raise exception using message = 'Winner candidate not found.';
  end if;
  if not v_candidate.is_current then
    raise exception using message = 'Only the current winner candidate can be reviewed.';
  end if;
  if v_candidate.competition_review_status <> 'approved'
    or v_candidate.status not in ('competition_approved', 'compliance_review')
  then
    raise exception using message = 'Competition approval is required before compliance review.';
  end if;

  if p_decision = 'approve' then
    v_new_status := 'compliance_approved';
    update public.winner_candidates
    set status = v_new_status,
        compliance_review_status = 'approved',
        compliance_reviewed_by = p_requested_by,
        compliance_reviewed_at = now(),
        compliance_review_notes = btrim(p_notes),
        rejection_reason = null,
        publication_readiness_note = case
          when publicity_consent then 'Competition and compliance approval complete; awaiting final confirmation.'
          else 'Competition and compliance approval complete; winner-publicity consent is not recorded.'
        end
    where id = p_candidate_id;
  else
    v_new_status := 'rejected';
    update public.winner_candidates
    set status = v_new_status,
        compliance_review_status = 'rejected',
        compliance_reviewed_by = p_requested_by,
        compliance_reviewed_at = now(),
        compliance_review_notes = btrim(p_notes),
        rejection_reason = btrim(p_notes),
        publication_ready = false,
        publication_readiness_note = 'Candidate rejected during compliance review.'
    where id = p_candidate_id;
  end if;

  insert into public.winner_candidate_status_history(
    candidate_id, from_status, to_status, action, actor_user_id, notes, metadata
  ) values (
    p_candidate_id, v_candidate.status, v_new_status,
    case when p_decision = 'approve' then 'compliance_approved' else 'compliance_rejected' end,
    p_requested_by, btrim(p_notes), jsonb_build_object('actor_role', v_admin_role)
  );

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by,
    case when p_decision = 'approve' then 'winner_compliance_approved' else 'winner_compliance_rejected' end,
    'winner_candidate', p_candidate_id::text,
    jsonb_build_object('previous_status', v_candidate.status, 'new_status', v_new_status, 'notes', btrim(p_notes))
  );

  return p_candidate_id;
end;
$$;

create or replace function public.confirm_winner_candidate(
  p_candidate_id uuid,
  p_notes text,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_role text;
  v_candidate public.winner_candidates%rowtype;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin']::text[]
  );

  if char_length(btrim(coalesce(p_notes, ''))) < 8 then
    raise exception using message = 'Confirmation notes must contain at least 8 characters.';
  end if;

  select * into v_candidate
  from public.winner_candidates
  where id = p_candidate_id
  for update;
  if not found then
    raise exception using message = 'Winner candidate not found.';
  end if;
  if not v_candidate.is_current then
    raise exception using message = 'Only the current winner candidate can be confirmed.';
  end if;
  if v_candidate.status <> 'compliance_approved'
    or v_candidate.competition_review_status <> 'approved'
    or v_candidate.compliance_review_status <> 'approved'
  then
    raise exception using message = 'Competition and compliance approval are required before confirmation.';
  end if;

  update public.winner_candidates
  set status = 'confirmed',
      confirmed_by = p_requested_by,
      confirmed_at = now(),
      publication_ready = publicity_consent,
      publication_readiness_note = case
        when publicity_consent then 'Confirmed and ready for winner-publication preparation.'
        else 'Confirmed, but public naming is blocked because winner-publicity consent is not recorded.'
      end,
      review_notes = concat_ws(E'\n', nullif(review_notes, ''), 'Confirmation: ' || btrim(p_notes))
  where id = p_candidate_id;

  insert into public.winner_candidate_status_history(
    candidate_id, from_status, to_status, action, actor_user_id, notes, metadata
  ) values (
    p_candidate_id, v_candidate.status, 'confirmed', 'confirmed', p_requested_by,
    btrim(p_notes),
    jsonb_build_object('actor_role', v_admin_role, 'publication_ready', v_candidate.publicity_consent)
  );

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by, 'winner_confirmed', 'winner_candidate', p_candidate_id::text,
    jsonb_build_object(
      'previous_status', v_candidate.status,
      'publication_ready', v_candidate.publicity_consent,
      'notes', btrim(p_notes)
    )
  );

  return p_candidate_id;
end;
$$;

create or replace function public.replace_winner_candidate(
  p_candidate_id uuid,
  p_reason text,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_role text;
  v_candidate public.winner_candidates%rowtype;
  v_run public.winner_generation_runs%rowtype;
  v_rules public.competition_rules%rowtype;
  v_eval public.winner_generation_evaluations%rowtype;
  v_new_candidate_id uuid;
  v_eligibility_status text;
  v_checks jsonb;
  v_publicity boolean;
  v_new_status text;
  v_found boolean := false;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'competition_manager']::text[]
  );

  if char_length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception using message = 'Replacement reason must contain at least 8 characters.';
  end if;

  select * into v_candidate
  from public.winner_candidates
  where id = p_candidate_id
  for update;
  if not found then
    raise exception using message = 'Winner candidate not found.';
  end if;
  if not v_candidate.is_current or v_candidate.status <> 'rejected' then
    raise exception using message = 'Only a current rejected candidate can be replaced.';
  end if;
  if v_candidate.generation_run_id is null or v_candidate.candidate_order is null then
    raise exception using message = 'This candidate does not have a reusable generation evaluation pool.';
  end if;

  select * into v_run from public.winner_generation_runs where id = v_candidate.generation_run_id;
  select * into v_rules
  from public.competition_rules
  where competition_season_id = v_candidate.competition_season_id
    and version = v_candidate.rules_version
  limit 1;
  if not found then
    raise exception using message = 'The rules version used for this candidate was not found.';
  end if;

  for v_eval in
    select *
    from public.winner_generation_evaluations
    where generation_run_id = v_candidate.generation_run_id
      and selection_order > v_candidate.candidate_order
      and selected_candidate_id is null
    order by selection_order
  loop
    select e.eligibility_status, e.checks, e.publicity_consent
    into v_eligibility_status, v_checks, v_publicity
    from private.evaluate_winner_eligibility(
      v_eval.registration_id,
      v_candidate.competition_season_id,
      v_rules.id,
      v_candidate.scope,
      v_candidate.prize_id,
      v_eval.weekly_eligible
    ) e;

    update public.winner_generation_evaluations
    set eligibility_status = v_eligibility_status,
        checks = v_checks,
        tie_break_values = jsonb_set(
          tie_break_values,
          '{publicity_consent}',
          to_jsonb(v_publicity),
          true
        ),
        evaluated_at = now()
    where id = v_eval.id;

    if v_eligibility_status in ('eligible', 'review_required') then
      v_eval.eligibility_status := v_eligibility_status;
      v_eval.checks := v_checks;
      v_eval.tie_break_values := jsonb_set(v_eval.tie_break_values, '{publicity_consent}', to_jsonb(v_publicity), true);
      v_found := true;
      exit;
    end if;
  end loop;

  if not v_found then
    raise exception using message = 'No additional eligible or reviewable entry remains in this generation run.';
  end if;

  update public.winner_candidates
  set is_current = false
  where id = v_candidate.id;

  v_new_status := case when v_eval.eligibility_status = 'review_required' then 'under_review' else 'provisional' end;

  insert into public.winner_candidates(
    competition_season_id, registration_id, prize_id, round_id, monthly_period_id,
    score, rank, status, rules_version, generation_run_id, scope,
    source_round_score_id, source_monthly_score_id, source_season_score_id,
    candidate_order, prize_position, eligibility_status, eligibility_summary,
    tie_break_values, publicity_consent, publication_ready, publication_readiness_note,
    replacement_for_candidate_id, display_name_snapshot, team_name_snapshot,
    provider_entry_id_snapshot, prize_snapshot, generated_at, is_current
  ) values (
    v_candidate.competition_season_id, v_eval.registration_id, v_candidate.prize_id,
    v_candidate.round_id, v_candidate.monthly_period_id,
    v_eval.score, v_eval.source_rank, v_new_status, v_candidate.rules_version,
    v_candidate.generation_run_id, v_candidate.scope,
    v_eval.source_round_score_id, v_eval.source_monthly_score_id, v_eval.source_season_score_id,
    v_eval.selection_order, v_candidate.prize_position, v_eval.eligibility_status, v_eval.checks,
    v_eval.tie_break_values, v_publicity, false,
    case when v_publicity then 'Replacement candidate awaiting competition and compliance approval.' else 'Winner-publicity consent is not recorded.' end,
    v_candidate.id, v_eval.display_name, v_eval.team_name, v_eval.provider_entry_id,
    v_candidate.prize_snapshot, now(), true
  ) returning id into v_new_candidate_id;

  update public.winner_candidates
  set replaced_by_candidate_id = v_new_candidate_id
  where id = v_candidate.id;

  update public.winner_generation_evaluations
  set selected_candidate_id = v_new_candidate_id
  where id = v_eval.id;

  insert into public.winner_candidate_checks(
    candidate_id, check_code, check_status, is_required, summary, details, evaluated_at
  )
  select
    v_new_candidate_id,
    item ->> 'code',
    item ->> 'status',
    coalesce((item ->> 'is_required')::boolean, true),
    item ->> 'summary',
    coalesce(item -> 'details', '{}'::jsonb),
    now()
  from jsonb_array_elements(v_eval.checks) item;

  insert into public.winner_candidate_status_history(
    candidate_id, from_status, to_status, action, actor_user_id, notes, metadata
  ) values
  (
    v_candidate.id, 'rejected', 'rejected', 'replacement_created', p_requested_by,
    btrim(p_reason), jsonb_build_object('replacement_candidate_id', v_new_candidate_id)
  ),
  (
    v_new_candidate_id, null, v_new_status, 'generated_as_replacement', p_requested_by,
    btrim(p_reason), jsonb_build_object('replaces_candidate_id', v_candidate.id, 'selection_order', v_eval.selection_order)
  );

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by, 'winner_candidate_replaced', 'winner_candidate', v_new_candidate_id::text,
    jsonb_build_object(
      'replaced_candidate_id', v_candidate.id,
      'generation_run_id', v_candidate.generation_run_id,
      'registration_id', v_eval.registration_id,
      'selection_order', v_eval.selection_order,
      'reason', btrim(p_reason),
      'actor_role', v_admin_role
    )
  );

  return v_new_candidate_id;
end;
$$;

revoke all on function public.competition_review_winner_candidate(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.compliance_review_winner_candidate(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.confirm_winner_candidate(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.replace_winner_candidate(uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.competition_review_winner_candidate(uuid, text, text, uuid) to service_role;
grant execute on function public.compliance_review_winner_candidate(uuid, text, text, uuid) to service_role;
grant execute on function public.confirm_winner_candidate(uuid, text, uuid) to service_role;
grant execute on function public.replace_winner_candidate(uuid, text, uuid) to service_role;
