create or replace function private.record_prize_payment_transition(
  p_payment_id uuid,
  p_from_status text,
  p_to_status text,
  p_action text,
  p_actor_user_id uuid,
  p_notes text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.prize_payment_status_history(
    payment_id, from_status, to_status, action, actor_user_id, notes, metadata
  ) values (
    p_payment_id, p_from_status, p_to_status, p_action, p_actor_user_id,
    nullif(btrim(coalesce(p_notes, '')), ''), coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.prepare_prize_payment(
  p_candidate_id uuid,
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
  v_registration public.registrations%rowtype;
  v_participant public.participants%rowtype;
  v_prize public.prizes%rowtype;
  v_verification public.registration_verifications%rowtype;
  v_payment_id uuid;
  v_amount numeric(18,2);
  v_currency text;
  v_prize_type text;
  v_payment_method text;
  v_destination_reference text;
  v_requires_destination boolean;
  v_initial_status text;
  v_destination_status text;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'finance_officer']::text[]
  );

  select * into v_candidate
  from public.winner_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception using message = 'Winner candidate not found.';
  end if;
  if not v_candidate.is_current or v_candidate.status <> 'confirmed' then
    raise exception using message = 'Only a current confirmed winner can enter payment preparation.';
  end if;
  if v_candidate.competition_review_status <> 'approved'
    or v_candidate.compliance_review_status <> 'approved'
    or v_candidate.confirmed_at is null
  then
    raise exception using message = 'Winner confirmation and both approvals are required before payment preparation.';
  end if;
  if v_candidate.prize_id is null then
    raise exception using message = 'The confirmed winner does not have an assigned prize.';
  end if;
  if exists (select 1 from public.prize_payments where winner_candidate_id = p_candidate_id) then
    raise exception using message = 'A prize settlement already exists for this winner.';
  end if;

  select * into v_registration
  from public.registrations
  where id = v_candidate.registration_id;
  select * into v_participant
  from public.participants
  where id = v_registration.participant_id;
  select * into v_prize
  from public.prizes
  where id = v_candidate.prize_id;
  select * into v_verification
  from public.registration_verifications
  where registration_id = v_registration.id;

  if v_registration.status <> 'approved' or v_registration.eligibility_status <> 'eligible' then
    raise exception using message = 'The winner registration is no longer approved and eligible.';
  end if;
  if v_participant.status <> 'active' then
    raise exception using message = 'The winner participant profile is not active.';
  end if;
  if v_prize.id is null then
    raise exception using message = 'The assigned prize was not found.';
  end if;

  v_amount := coalesce(nullif(v_candidate.prize_snapshot ->> 'amount', '')::numeric, v_prize.amount);
  v_currency := coalesce(nullif(v_candidate.prize_snapshot ->> 'currency', ''), v_prize.currency);
  v_prize_type := coalesce(nullif(v_candidate.prize_snapshot ->> 'prize_type', ''), v_prize.prize_type);
  v_payment_method := coalesce(nullif(v_candidate.prize_snapshot ->> 'payment_method', ''), v_prize.payment_method);

  v_requires_destination := v_prize_type in ('cash', 'mixed')
    and v_payment_method not in ('cash', 'non_cash', 'physical_fulfilment');

  if v_requires_destination then
    if v_verification.vult_status <> 'verified'
      or nullif(btrim(coalesce(v_verification.vult_verified_reference, '')), '') is null
    then
      raise exception using message = 'A verified Vult destination is required before payment preparation.';
    end if;
    v_destination_reference := btrim(v_verification.vult_verified_reference);
    v_initial_status := 'destination_pending';
    v_destination_status := 'pending';
  else
    v_destination_reference := null;
    v_initial_status := 'finance_review';
    v_destination_status := 'not_required';
  end if;

  insert into public.prize_payments(
    winner_candidate_id, participant_id, prize_id, competition_season_id,
    amount, currency, status, destination_reference,
    prize_type, payment_method, non_cash_description,
    destination_status, finance_review_status, reversal_status,
    reconciliation_status, payment_deadline_at,
    prize_snapshot, winner_snapshot, destination_snapshot, notes, metadata
  ) values (
    v_candidate.id, v_participant.id, v_prize.id, v_candidate.competition_season_id,
    v_amount, v_currency, v_initial_status, v_destination_reference,
    v_prize_type, v_payment_method, v_prize.non_cash_description,
    v_destination_status, 'pending', 'none',
    case when v_prize_type = 'non_cash' then 'not_required' else 'pending' end,
    v_candidate.confirmed_at + make_interval(days => v_prize.payment_deadline_days),
    jsonb_build_object(
      'id', v_prize.id,
      'code', v_prize.code,
      'name', v_prize.name,
      'frequency', v_prize.frequency,
      'position', v_prize.position,
      'amount', v_amount,
      'currency', v_currency,
      'prize_type', v_prize_type,
      'payment_method', v_payment_method,
      'payment_deadline_days', v_prize.payment_deadline_days,
      'non_cash_description', v_prize.non_cash_description
    ),
    jsonb_build_object(
      'candidate_id', v_candidate.id,
      'registration_id', v_registration.id,
      'participant_id', v_participant.id,
      'display_name', coalesce(v_candidate.display_name_snapshot, v_participant.full_name),
      'team_name', v_candidate.team_name_snapshot,
      'provider_entry_id', v_candidate.provider_entry_id_snapshot,
      'confirmed_at', v_candidate.confirmed_at
    ),
    case when v_destination_reference is null then '{}'::jsonb else jsonb_build_object(
      'reference', v_destination_reference,
      'verification_status', v_verification.vult_status,
      'verification_checked_at', v_verification.vult_checked_at
    ) end,
    'Prepared from confirmed winner and prize snapshots.',
    jsonb_build_object('prepared_by_role', v_admin_role)
  ) returning id into v_payment_id;

  update public.winner_candidates
  set status = 'payment_pending'
  where id = v_candidate.id;

  perform private.record_prize_payment_transition(
    v_payment_id, null, v_initial_status, 'payment_prepared', p_requested_by,
    'Prize settlement prepared from the confirmed winner.',
    jsonb_build_object('candidate_id', v_candidate.id, 'prize_id', v_prize.id, 'actor_role', v_admin_role)
  );

  insert into public.winner_candidate_status_history(
    candidate_id, from_status, to_status, action, actor_user_id, notes, metadata
  ) values (
    v_candidate.id, 'confirmed', 'payment_pending', 'payment_prepared', p_requested_by,
    'Prize settlement prepared and awaiting payment workflow.',
    jsonb_build_object('payment_id', v_payment_id)
  );

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by, 'prize_payment_prepared', 'prize_payment', v_payment_id::text,
    jsonb_build_object('candidate_id', v_candidate.id, 'amount', v_amount, 'currency', v_currency, 'status', v_initial_status)
  );

  return v_payment_id;
end;
$$;

create or replace function public.review_prize_payment_destination(
  p_payment_id uuid,
  p_decision text,
  p_destination_reference text,
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
  v_payment public.prize_payments%rowtype;
  v_candidate public.winner_candidates%rowtype;
  v_verification public.registration_verifications%rowtype;
  v_reference text;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'compliance_officer']::text[]
  );

  if p_decision not in ('approve', 'reject') then
    raise exception using message = 'Destination decision must be approve or reject.';
  end if;
  if char_length(btrim(coalesce(p_notes, ''))) < 8 then
    raise exception using message = 'Destination review notes must contain at least 8 characters.';
  end if;

  select * into v_payment
  from public.prize_payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception using message = 'Prize settlement not found.';
  end if;
  if v_payment.status <> 'destination_pending' or v_payment.destination_status = 'not_required' then
    raise exception using message = 'This settlement is not awaiting destination verification.';
  end if;

  select * into v_candidate from public.winner_candidates where id = v_payment.winner_candidate_id;
  select rv.* into v_verification
  from public.registration_verifications rv
  join public.registrations r on r.id = rv.registration_id
  where r.id = v_candidate.registration_id;

  if p_decision = 'approve' then
    v_reference := btrim(coalesce(p_destination_reference, ''));
    if v_reference = '' then
      raise exception using message = 'Destination reference is required.';
    end if;
    if v_verification.vult_status <> 'verified'
      or nullif(btrim(coalesce(v_verification.vult_verified_reference, '')), '') is null
    then
      raise exception using message = 'The participant does not have a verified Vult destination.';
    end if;
    if lower(v_reference) <> lower(btrim(v_verification.vult_verified_reference)) then
      raise exception using message = 'The destination reference does not match the verified Vult reference.';
    end if;

    update public.prize_payments
    set status = 'finance_review',
        destination_reference = v_reference,
        destination_status = 'verified',
        destination_verified_by = p_requested_by,
        destination_verified_at = now(),
        destination_verification_notes = btrim(p_notes),
        destination_snapshot = jsonb_build_object(
          'reference', v_reference,
          'verified_reference', v_verification.vult_verified_reference,
          'verified_at', now(),
          'verified_by', p_requested_by
        )
    where id = p_payment_id;

    perform private.record_prize_payment_transition(
      p_payment_id, v_payment.status, 'finance_review', 'destination_verified', p_requested_by,
      p_notes, jsonb_build_object('actor_role', v_admin_role)
    );
  else
    update public.prize_payments
    set destination_status = 'rejected',
        destination_verified_by = p_requested_by,
        destination_verified_at = now(),
        destination_verification_notes = btrim(p_notes)
    where id = p_payment_id;

    perform private.record_prize_payment_transition(
      p_payment_id, v_payment.status, v_payment.status, 'destination_rejected', p_requested_by,
      p_notes, jsonb_build_object('actor_role', v_admin_role)
    );
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by,
    case when p_decision = 'approve' then 'prize_payment_destination_verified' else 'prize_payment_destination_rejected' end,
    'prize_payment', p_payment_id::text,
    jsonb_build_object('decision', p_decision, 'actor_role', v_admin_role)
  );

  return p_payment_id;
end;
$$;

create or replace function public.finance_review_prize_payment(
  p_payment_id uuid,
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
  v_payment public.prize_payments%rowtype;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'finance_officer']::text[]
  );

  if p_decision not in ('approve', 'reject') then
    raise exception using message = 'Finance decision must be approve or reject.';
  end if;
  if char_length(btrim(coalesce(p_notes, ''))) < 8 then
    raise exception using message = 'Finance review notes must contain at least 8 characters.';
  end if;

  select * into v_payment
  from public.prize_payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception using message = 'Prize settlement not found.';
  end if;
  if v_payment.status <> 'finance_review' then
    raise exception using message = 'This settlement is not awaiting finance review.';
  end if;
  if v_payment.destination_status not in ('verified', 'not_required') then
    raise exception using message = 'Destination verification is required before finance approval.';
  end if;

  if p_decision = 'approve' then
    update public.prize_payments
    set status = 'approved',
        finance_review_status = 'approved',
        finance_reviewed_by = p_requested_by,
        finance_reviewed_at = now(),
        finance_review_notes = btrim(p_notes),
        approved_by = p_requested_by,
        approved_at = now(),
        cancellation_reason = null,
        cancelled_by = null,
        cancelled_at = null
    where id = p_payment_id;

    perform private.record_prize_payment_transition(
      p_payment_id, v_payment.status, 'approved', 'finance_approved', p_requested_by,
      p_notes, jsonb_build_object('actor_role', v_admin_role)
    );
  else
    update public.prize_payments
    set status = 'cancelled',
        finance_review_status = 'rejected',
        finance_reviewed_by = p_requested_by,
        finance_reviewed_at = now(),
        finance_review_notes = btrim(p_notes),
        cancelled_by = p_requested_by,
        cancelled_at = now(),
        cancellation_reason = btrim(p_notes)
    where id = p_payment_id;

    update public.winner_candidates
    set status = 'confirmed'
    where id = v_payment.winner_candidate_id and status = 'payment_pending';

    insert into public.winner_candidate_status_history(
      candidate_id, from_status, to_status, action, actor_user_id, notes, metadata
    ) values (
      v_payment.winner_candidate_id, 'payment_pending', 'confirmed', 'payment_cancelled', p_requested_by,
      btrim(p_notes), jsonb_build_object('payment_id', p_payment_id)
    );

    perform private.record_prize_payment_transition(
      p_payment_id, v_payment.status, 'cancelled', 'finance_rejected', p_requested_by,
      p_notes, jsonb_build_object('actor_role', v_admin_role)
    );
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by,
    case when p_decision = 'approve' then 'prize_payment_finance_approved' else 'prize_payment_finance_rejected' end,
    'prize_payment', p_payment_id::text,
    jsonb_build_object('decision', p_decision, 'actor_role', v_admin_role)
  );

  return p_payment_id;
end;
$$;

create or replace function public.start_prize_payment_attempt(
  p_payment_id uuid,
  p_processor text,
  p_idempotency_key text,
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
  v_payment public.prize_payments%rowtype;
  v_attempt_id uuid;
  v_attempt_number integer;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'finance_officer']::text[]
  );

  if p_processor not in ('manual', 'vult_api', 'import') then
    raise exception using message = 'Payment processor is invalid.';
  end if;
  if char_length(btrim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception using message = 'Idempotency key must contain at least 8 characters.';
  end if;
  if char_length(btrim(coalesce(p_notes, ''))) < 8 then
    raise exception using message = 'Attempt notes must contain at least 8 characters.';
  end if;

  select * into v_payment
  from public.prize_payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception using message = 'Prize settlement not found.';
  end if;
  if v_payment.status not in ('approved', 'failed', 'reversed') then
    raise exception using message = 'Only an approved, failed or reversed settlement can start a payment attempt.';
  end if;
  if v_payment.finance_review_status <> 'approved'
    or v_payment.destination_status not in ('verified', 'not_required')
  then
    raise exception using message = 'Finance approval and destination verification are required before processing.';
  end if;
  if exists (
    select 1 from public.prize_payment_attempts
    where payment_id = p_payment_id and status = 'initiated'
  ) then
    raise exception using message = 'An active payment attempt already exists.';
  end if;

  v_attempt_number := v_payment.attempt_count + 1;

  insert into public.prize_payment_attempts(
    payment_id, attempt_number, idempotency_key, processor, status,
    amount, currency, destination_reference, requested_by, notes, metadata
  ) values (
    p_payment_id, v_attempt_number, btrim(p_idempotency_key), p_processor, 'initiated',
    v_payment.amount, v_payment.currency, v_payment.destination_reference,
    p_requested_by, btrim(p_notes), jsonb_build_object('actor_role', v_admin_role)
  ) returning id into v_attempt_id;

  update public.prize_payments
  set status = 'processing',
      current_attempt_id = v_attempt_id,
      attempt_count = v_attempt_number,
      processing_started_at = now(),
      failed_at = null,
      failure_code = null,
      failure_reason = null
  where id = p_payment_id;

  perform private.record_prize_payment_transition(
    p_payment_id, v_payment.status, 'processing', 'payment_attempt_started', p_requested_by,
    p_notes, jsonb_build_object('attempt_id', v_attempt_id, 'attempt_number', v_attempt_number, 'processor', p_processor)
  );

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by, 'prize_payment_attempt_started', 'prize_payment_attempt', v_attempt_id::text,
    jsonb_build_object('payment_id', p_payment_id, 'attempt_number', v_attempt_number, 'processor', p_processor)
  );

  return v_attempt_id;
end;
$$;

create or replace function public.complete_prize_payment_attempt(
  p_attempt_id uuid,
  p_outcome text,
  p_transaction_reference text,
  p_evidence_path text,
  p_failure_code text,
  p_failure_reason text,
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
  v_attempt public.prize_payment_attempts%rowtype;
  v_payment public.prize_payments%rowtype;
  v_candidate public.winner_candidates%rowtype;
  v_transaction_reference text;
  v_failure_reason text;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'finance_officer']::text[]
  );

  if p_outcome not in ('succeeded', 'failed') then
    raise exception using message = 'Payment outcome must be succeeded or failed.';
  end if;
  if char_length(btrim(coalesce(p_notes, ''))) < 8 then
    raise exception using message = 'Completion notes must contain at least 8 characters.';
  end if;

  select * into v_attempt
  from public.prize_payment_attempts
  where id = p_attempt_id
  for update;
  if not found then
    raise exception using message = 'Payment attempt not found.';
  end if;
  if v_attempt.status <> 'initiated' then
    raise exception using message = 'This payment attempt is already completed.';
  end if;

  select * into v_payment
  from public.prize_payments
  where id = v_attempt.payment_id
  for update;
  if v_payment.status <> 'processing' or v_payment.current_attempt_id <> p_attempt_id then
    raise exception using message = 'The settlement is not processing this attempt.';
  end if;
  select * into v_candidate from public.winner_candidates where id = v_payment.winner_candidate_id;

  if p_outcome = 'succeeded' then
    v_transaction_reference := btrim(coalesce(p_transaction_reference, ''));
    if v_transaction_reference = '' then
      raise exception using message = 'A transaction or fulfilment reference is required for success.';
    end if;

    update public.prize_payment_attempts
    set status = 'succeeded',
        transaction_reference = v_transaction_reference,
        evidence_path = nullif(btrim(coalesce(p_evidence_path, '')), ''),
        completed_at = now(),
        notes = btrim(p_notes)
    where id = p_attempt_id;

    update public.prize_payments
    set status = 'paid',
        transaction_reference = v_transaction_reference,
        evidence_path = nullif(btrim(coalesce(p_evidence_path, '')), ''),
        paid_by = p_requested_by,
        paid_at = now(),
        reconciliation_status = case when prize_type = 'non_cash' then 'not_required' else 'pending' end,
        failed_at = null,
        failure_code = null,
        failure_reason = null
    where id = v_payment.id;

    update public.winner_candidates
    set status = 'paid'
    where id = v_payment.winner_candidate_id;

    insert into public.winner_candidate_status_history(
      candidate_id, from_status, to_status, action, actor_user_id, notes, metadata
    ) values (
      v_payment.winner_candidate_id, v_candidate.status, 'paid', 'payment_completed', p_requested_by,
      btrim(p_notes), jsonb_build_object('payment_id', v_payment.id, 'attempt_id', p_attempt_id, 'transaction_reference', v_transaction_reference)
    );

    perform private.record_prize_payment_transition(
      v_payment.id, v_payment.status, 'paid', 'payment_succeeded', p_requested_by,
      p_notes, jsonb_build_object('attempt_id', p_attempt_id, 'transaction_reference', v_transaction_reference, 'actor_role', v_admin_role)
    );

    if nullif(btrim(coalesce(p_evidence_path, '')), '') is not null then
      insert into public.prize_payment_evidence(
        payment_id, attempt_id, evidence_type, storage_path, notes, uploaded_by
      ) values (
        v_payment.id, p_attempt_id,
        case when v_payment.prize_type = 'non_cash' then 'non_cash_fulfilment' else 'payment_receipt' end,
        btrim(p_evidence_path), btrim(p_notes), p_requested_by
      );
    end if;
  else
    v_failure_reason := btrim(coalesce(p_failure_reason, ''));
    if char_length(v_failure_reason) < 8 then
      raise exception using message = 'Failure reason must contain at least 8 characters.';
    end if;

    update public.prize_payment_attempts
    set status = 'failed',
        evidence_path = nullif(btrim(coalesce(p_evidence_path, '')), ''),
        failure_code = nullif(btrim(coalesce(p_failure_code, '')), ''),
        failure_reason = v_failure_reason,
        completed_at = now(),
        notes = btrim(p_notes)
    where id = p_attempt_id;

    update public.prize_payments
    set status = 'failed',
        failed_at = now(),
        failure_code = nullif(btrim(coalesce(p_failure_code, '')), ''),
        failure_reason = v_failure_reason
    where id = v_payment.id;

    perform private.record_prize_payment_transition(
      v_payment.id, v_payment.status, 'failed', 'payment_failed', p_requested_by,
      p_notes, jsonb_build_object('attempt_id', p_attempt_id, 'failure_code', p_failure_code, 'failure_reason', v_failure_reason)
    );

    if nullif(btrim(coalesce(p_evidence_path, '')), '') is not null then
      insert into public.prize_payment_evidence(
        payment_id, attempt_id, evidence_type, storage_path, notes, uploaded_by
      ) values (
        v_payment.id, p_attempt_id, 'payment_failure', btrim(p_evidence_path), v_failure_reason, p_requested_by
      );
    end if;
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by,
    case when p_outcome = 'succeeded' then 'prize_payment_succeeded' else 'prize_payment_failed' end,
    'prize_payment_attempt', p_attempt_id::text,
    jsonb_build_object('payment_id', v_payment.id, 'outcome', p_outcome, 'actor_role', v_admin_role)
  );

  return v_payment.id;
end;
$$;

create or replace function public.cancel_prize_payment(
  p_payment_id uuid,
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
  v_payment public.prize_payments%rowtype;
  v_candidate_status text;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'finance_officer']::text[]
  );

  if char_length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception using message = 'Cancellation reason must contain at least 8 characters.';
  end if;

  select * into v_payment
  from public.prize_payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception using message = 'Prize settlement not found.';
  end if;
  if v_payment.status not in ('destination_pending', 'finance_review', 'approved', 'failed') then
    raise exception using message = 'This settlement cannot be cancelled in its current state.';
  end if;

  select status into v_candidate_status from public.winner_candidates where id = v_payment.winner_candidate_id;

  update public.prize_payments
  set status = 'cancelled',
      cancelled_by = p_requested_by,
      cancelled_at = now(),
      cancellation_reason = btrim(p_reason)
  where id = p_payment_id;

  if v_candidate_status = 'payment_pending' then
    update public.winner_candidates set status = 'confirmed' where id = v_payment.winner_candidate_id;
    insert into public.winner_candidate_status_history(
      candidate_id, from_status, to_status, action, actor_user_id, notes, metadata
    ) values (
      v_payment.winner_candidate_id, 'payment_pending', 'confirmed', 'payment_cancelled', p_requested_by,
      btrim(p_reason), jsonb_build_object('payment_id', p_payment_id)
    );
  end if;

  perform private.record_prize_payment_transition(
    p_payment_id, v_payment.status, 'cancelled', 'payment_cancelled', p_requested_by,
    p_reason, jsonb_build_object('actor_role', v_admin_role)
  );

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by, 'prize_payment_cancelled', 'prize_payment', p_payment_id::text,
    jsonb_build_object('previous_status', v_payment.status, 'reason', btrim(p_reason), 'actor_role', v_admin_role)
  );

  return p_payment_id;
end;
$$;

create or replace function public.reopen_prize_payment(
  p_payment_id uuid,
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
  v_payment public.prize_payments%rowtype;
  v_new_status text;
  v_candidate_status text;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin']::text[]
  );

  if char_length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception using message = 'Reopen reason must contain at least 8 characters.';
  end if;

  select * into v_payment from public.prize_payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'cancelled' then
    raise exception using message = 'Only a cancelled settlement can be reopened.';
  end if;

  v_new_status := case
    when v_payment.finance_review_status = 'approved'
      and v_payment.destination_status in ('verified', 'not_required') then 'approved'
    when v_payment.destination_status in ('verified', 'not_required') then 'finance_review'
    else 'destination_pending'
  end;

  if v_payment.finance_review_status = 'rejected' then
    update public.prize_payments set finance_review_status = 'pending' where id = p_payment_id;
  end if;

  update public.prize_payments
  set status = v_new_status,
      cancelled_by = null,
      cancelled_at = null,
      cancellation_reason = null
  where id = p_payment_id;

  select status into v_candidate_status from public.winner_candidates where id = v_payment.winner_candidate_id;
  if v_candidate_status = 'confirmed' then
    update public.winner_candidates set status = 'payment_pending' where id = v_payment.winner_candidate_id;
    insert into public.winner_candidate_status_history(
      candidate_id, from_status, to_status, action, actor_user_id, notes, metadata
    ) values (
      v_payment.winner_candidate_id, 'confirmed', 'payment_pending', 'payment_reopened', p_requested_by,
      btrim(p_reason), jsonb_build_object('payment_id', p_payment_id)
    );
  end if;

  perform private.record_prize_payment_transition(
    p_payment_id, 'cancelled', v_new_status, 'payment_reopened', p_requested_by,
    p_reason, jsonb_build_object('actor_role', v_admin_role)
  );

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by, 'prize_payment_reopened', 'prize_payment', p_payment_id::text,
    jsonb_build_object('new_status', v_new_status, 'reason', btrim(p_reason))
  );

  return p_payment_id;
end;
$$;

create or replace function public.add_prize_payment_evidence(
  p_payment_id uuid,
  p_attempt_id uuid,
  p_evidence_type text,
  p_storage_path text,
  p_external_url text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
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
  v_evidence_id uuid;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'finance_officer', 'compliance_officer']::text[]
  );

  if not exists (select 1 from public.prize_payments where id = p_payment_id) then
    raise exception using message = 'Prize settlement not found.';
  end if;
  if p_attempt_id is not null and not exists (
    select 1 from public.prize_payment_attempts where id = p_attempt_id and payment_id = p_payment_id
  ) then
    raise exception using message = 'The payment attempt does not belong to this settlement.';
  end if;
  if nullif(btrim(coalesce(p_storage_path, '')), '') is null
    and nullif(btrim(coalesce(p_external_url, '')), '') is null
  then
    raise exception using message = 'Provide a storage path or external evidence URL.';
  end if;

  insert into public.prize_payment_evidence(
    payment_id, attempt_id, evidence_type, storage_path, external_url,
    file_name, mime_type, size_bytes, notes, uploaded_by
  ) values (
    p_payment_id, p_attempt_id, p_evidence_type,
    nullif(btrim(coalesce(p_storage_path, '')), ''),
    nullif(btrim(coalesce(p_external_url, '')), ''),
    nullif(btrim(coalesce(p_file_name, '')), ''),
    nullif(btrim(coalesce(p_mime_type, '')), ''),
    p_size_bytes,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_requested_by
  ) returning id into v_evidence_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by, 'prize_payment_evidence_added', 'prize_payment_evidence', v_evidence_id::text,
    jsonb_build_object('payment_id', p_payment_id, 'attempt_id', p_attempt_id, 'evidence_type', p_evidence_type, 'actor_role', v_admin_role)
  );

  return v_evidence_id;
end;
$$;

create or replace function public.request_prize_payment_reversal(
  p_payment_id uuid,
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
  v_payment public.prize_payments%rowtype;
  v_reversal_id uuid;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'finance_officer']::text[]
  );

  if char_length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception using message = 'Reversal reason must contain at least 8 characters.';
  end if;

  select * into v_payment from public.prize_payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'paid' then
    raise exception using message = 'Only a paid settlement can enter reversal review.';
  end if;
  if exists (
    select 1 from public.prize_payment_reversals
    where payment_id = p_payment_id and status in ('requested', 'approved', 'processing')
  ) then
    raise exception using message = 'An active reversal already exists for this settlement.';
  end if;

  insert into public.prize_payment_reversals(
    payment_id, status, reason, requested_by, metadata
  ) values (
    p_payment_id, 'requested', btrim(p_reason), p_requested_by,
    jsonb_build_object('original_transaction_reference', v_payment.transaction_reference, 'actor_role', v_admin_role)
  ) returning id into v_reversal_id;

  update public.prize_payments
  set status = 'reversal_requested', reversal_status = 'requested'
  where id = p_payment_id;

  perform private.record_prize_payment_transition(
    p_payment_id, 'paid', 'reversal_requested', 'reversal_requested', p_requested_by,
    p_reason, jsonb_build_object('reversal_id', v_reversal_id, 'actor_role', v_admin_role)
  );

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by, 'prize_payment_reversal_requested', 'prize_payment_reversal', v_reversal_id::text,
    jsonb_build_object('payment_id', p_payment_id, 'reason', btrim(p_reason))
  );

  return v_reversal_id;
end;
$$;

create or replace function public.review_prize_payment_reversal(
  p_reversal_id uuid,
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
  v_reversal public.prize_payment_reversals%rowtype;
  v_payment public.prize_payments%rowtype;
begin
  v_admin_role := private.require_service_admin(p_requested_by, array['super_admin']::text[]);

  if p_decision not in ('approve', 'reject') then
    raise exception using message = 'Reversal decision must be approve or reject.';
  end if;
  if char_length(btrim(coalesce(p_notes, ''))) < 8 then
    raise exception using message = 'Reversal review notes must contain at least 8 characters.';
  end if;

  select * into v_reversal
  from public.prize_payment_reversals
  where id = p_reversal_id
  for update;
  if not found or v_reversal.status <> 'requested' then
    raise exception using message = 'This reversal is not awaiting review.';
  end if;
  select * into v_payment from public.prize_payments where id = v_reversal.payment_id for update;
  if v_payment.status <> 'reversal_requested' then
    raise exception using message = 'The settlement is not awaiting reversal approval.';
  end if;

  if p_decision = 'approve' then
    update public.prize_payment_reversals
    set status = 'approved', reviewed_by = p_requested_by, reviewed_at = now(), review_notes = btrim(p_notes)
    where id = p_reversal_id;
    update public.prize_payments
    set status = 'reversal_approved', reversal_status = 'approved'
    where id = v_payment.id;
    perform private.record_prize_payment_transition(
      v_payment.id, v_payment.status, 'reversal_approved', 'reversal_approved', p_requested_by,
      p_notes, jsonb_build_object('reversal_id', p_reversal_id, 'actor_role', v_admin_role)
    );
  else
    update public.prize_payment_reversals
    set status = 'rejected', reviewed_by = p_requested_by, reviewed_at = now(), review_notes = btrim(p_notes)
    where id = p_reversal_id;
    update public.prize_payments
    set status = 'paid', reversal_status = 'rejected'
    where id = v_payment.id;
    perform private.record_prize_payment_transition(
      v_payment.id, v_payment.status, 'paid', 'reversal_rejected', p_requested_by,
      p_notes, jsonb_build_object('reversal_id', p_reversal_id, 'actor_role', v_admin_role)
    );
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by,
    case when p_decision = 'approve' then 'prize_payment_reversal_approved' else 'prize_payment_reversal_rejected' end,
    'prize_payment_reversal', p_reversal_id::text,
    jsonb_build_object('payment_id', v_payment.id, 'decision', p_decision)
  );

  return p_reversal_id;
end;
$$;

create or replace function public.start_prize_payment_reversal(
  p_reversal_id uuid,
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
  v_reversal public.prize_payment_reversals%rowtype;
  v_payment public.prize_payments%rowtype;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'finance_officer']::text[]
  );
  if char_length(btrim(coalesce(p_notes, ''))) < 8 then
    raise exception using message = 'Reversal processing notes must contain at least 8 characters.';
  end if;

  select * into v_reversal from public.prize_payment_reversals where id = p_reversal_id for update;
  if not found or v_reversal.status <> 'approved' then
    raise exception using message = 'Only an approved reversal can start processing.';
  end if;
  select * into v_payment from public.prize_payments where id = v_reversal.payment_id for update;
  if v_payment.status <> 'reversal_approved' then
    raise exception using message = 'The settlement is not approved for reversal processing.';
  end if;

  update public.prize_payment_reversals
  set status = 'processing', metadata = metadata || jsonb_build_object('processing_started_by', p_requested_by, 'processing_started_at', now(), 'processing_notes', btrim(p_notes))
  where id = p_reversal_id;
  update public.prize_payments
  set status = 'reversal_processing', reversal_status = 'processing'
  where id = v_payment.id;

  perform private.record_prize_payment_transition(
    v_payment.id, v_payment.status, 'reversal_processing', 'reversal_processing_started', p_requested_by,
    p_notes, jsonb_build_object('reversal_id', p_reversal_id, 'actor_role', v_admin_role)
  );

  return p_reversal_id;
end;
$$;

create or replace function public.complete_prize_payment_reversal(
  p_reversal_id uuid,
  p_outcome text,
  p_transaction_reference text,
  p_evidence_path text,
  p_failure_reason text,
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
  v_reversal public.prize_payment_reversals%rowtype;
  v_payment public.prize_payments%rowtype;
  v_candidate_status text;
  v_reference text;
  v_failure_reason text;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'finance_officer']::text[]
  );
  if p_outcome not in ('completed', 'failed') then
    raise exception using message = 'Reversal outcome must be completed or failed.';
  end if;
  if char_length(btrim(coalesce(p_notes, ''))) < 8 then
    raise exception using message = 'Reversal completion notes must contain at least 8 characters.';
  end if;

  select * into v_reversal from public.prize_payment_reversals where id = p_reversal_id for update;
  if not found or v_reversal.status <> 'processing' then
    raise exception using message = 'This reversal is not processing.';
  end if;
  select * into v_payment from public.prize_payments where id = v_reversal.payment_id for update;
  if v_payment.status <> 'reversal_processing' then
    raise exception using message = 'The settlement is not processing this reversal.';
  end if;
  select status into v_candidate_status from public.winner_candidates where id = v_payment.winner_candidate_id;

  if p_outcome = 'completed' then
    v_reference := btrim(coalesce(p_transaction_reference, ''));
    if v_reference = '' then
      raise exception using message = 'A reversal transaction reference is required.';
    end if;

    update public.prize_payment_reversals
    set status = 'completed', transaction_reference = v_reference,
        evidence_path = nullif(btrim(coalesce(p_evidence_path, '')), ''),
        completed_by = p_requested_by, completed_at = now(), failure_reason = null
    where id = p_reversal_id;
    update public.prize_payments
    set status = 'reversed', reversal_status = 'completed', reconciliation_status = 'pending'
    where id = v_payment.id;

    update public.winner_candidates set status = 'payment_pending' where id = v_payment.winner_candidate_id;
    insert into public.winner_candidate_status_history(
      candidate_id, from_status, to_status, action, actor_user_id, notes, metadata
    ) values (
      v_payment.winner_candidate_id, v_candidate_status, 'payment_pending', 'payment_reversed', p_requested_by,
      btrim(p_notes), jsonb_build_object('payment_id', v_payment.id, 'reversal_id', p_reversal_id, 'transaction_reference', v_reference)
    );

    perform private.record_prize_payment_transition(
      v_payment.id, v_payment.status, 'reversed', 'reversal_completed', p_requested_by,
      p_notes, jsonb_build_object('reversal_id', p_reversal_id, 'transaction_reference', v_reference, 'actor_role', v_admin_role)
    );

    if nullif(btrim(coalesce(p_evidence_path, '')), '') is not null then
      insert into public.prize_payment_evidence(
        payment_id, evidence_type, storage_path, notes, uploaded_by
      ) values (
        v_payment.id, 'reversal', btrim(p_evidence_path), btrim(p_notes), p_requested_by
      );
    end if;
  else
    v_failure_reason := btrim(coalesce(p_failure_reason, ''));
    if char_length(v_failure_reason) < 8 then
      raise exception using message = 'Reversal failure reason must contain at least 8 characters.';
    end if;

    update public.prize_payment_reversals
    set status = 'failed', completed_by = p_requested_by, completed_at = now(), failure_reason = v_failure_reason
    where id = p_reversal_id;
    update public.prize_payments
    set status = 'paid', reversal_status = 'failed'
    where id = v_payment.id;

    perform private.record_prize_payment_transition(
      v_payment.id, v_payment.status, 'paid', 'reversal_failed', p_requested_by,
      p_notes, jsonb_build_object('reversal_id', p_reversal_id, 'failure_reason', v_failure_reason, 'actor_role', v_admin_role)
    );
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by,
    case when p_outcome = 'completed' then 'prize_payment_reversed' else 'prize_payment_reversal_failed' end,
    'prize_payment_reversal', p_reversal_id::text,
    jsonb_build_object('payment_id', v_payment.id, 'outcome', p_outcome)
  );

  return v_payment.id;
end;
$$;

create or replace function public.reconcile_prize_payment(
  p_payment_id uuid,
  p_status text,
  p_external_reference text,
  p_matched_amount numeric,
  p_matched_currency text,
  p_statement_date date,
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
  v_payment public.prize_payments%rowtype;
  v_reconciliation_id uuid;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'finance_officer']::text[]
  );
  if p_status not in ('matched', 'mismatch', 'resolved') then
    raise exception using message = 'Reconciliation status is invalid.';
  end if;
  if char_length(btrim(coalesce(p_notes, ''))) < 8 then
    raise exception using message = 'Reconciliation notes must contain at least 8 characters.';
  end if;

  select * into v_payment from public.prize_payments where id = p_payment_id for update;
  if not found or v_payment.status not in ('paid', 'reversed') then
    raise exception using message = 'Only paid or reversed settlements can be reconciled.';
  end if;
  if v_payment.reconciliation_status = 'not_required' then
    raise exception using message = 'This non-cash settlement does not require reconciliation.';
  end if;
  if p_status = 'matched' then
    if p_matched_amount is null or p_matched_amount <> v_payment.amount
      or lower(btrim(coalesce(p_matched_currency, ''))) <> lower(v_payment.currency)
    then
      raise exception using message = 'Matched reconciliation must equal the settlement amount and currency.';
    end if;
  end if;
  if p_status = 'resolved' and not exists (
    select 1 from public.prize_payment_reconciliations
    where payment_id = p_payment_id and status = 'mismatch'
  ) then
    raise exception using message = 'A mismatch must exist before reconciliation can be marked resolved.';
  end if;

  insert into public.prize_payment_reconciliations(
    payment_id, status, external_reference, matched_amount, matched_currency,
    statement_date, notes, reviewed_by, metadata
  ) values (
    p_payment_id, p_status,
    nullif(btrim(coalesce(p_external_reference, '')), ''),
    p_matched_amount,
    nullif(btrim(coalesce(p_matched_currency, '')), ''),
    p_statement_date,
    btrim(p_notes),
    p_requested_by,
    jsonb_build_object('payment_status', v_payment.status, 'transaction_reference', v_payment.transaction_reference, 'actor_role', v_admin_role)
  ) returning id into v_reconciliation_id;

  update public.prize_payments
  set reconciliation_status = p_status
  where id = p_payment_id;

  perform private.record_prize_payment_transition(
    p_payment_id, v_payment.status, v_payment.status, 'payment_reconciled', p_requested_by,
    p_notes, jsonb_build_object('reconciliation_id', v_reconciliation_id, 'reconciliation_status', p_status)
  );

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by, 'prize_payment_reconciled', 'prize_payment_reconciliation', v_reconciliation_id::text,
    jsonb_build_object('payment_id', p_payment_id, 'status', p_status)
  );

  return v_reconciliation_id;
end;
$$;

revoke all on function public.prepare_prize_payment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.review_prize_payment_destination(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.finance_review_prize_payment(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.start_prize_payment_attempt(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.complete_prize_payment_attempt(uuid, text, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_prize_payment(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.reopen_prize_payment(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.add_prize_payment_evidence(uuid, uuid, text, text, text, text, text, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.request_prize_payment_reversal(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.review_prize_payment_reversal(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.start_prize_payment_reversal(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.complete_prize_payment_reversal(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.reconcile_prize_payment(uuid, text, text, numeric, text, date, text, uuid) from public, anon, authenticated;

grant execute on function public.prepare_prize_payment(uuid, uuid) to service_role;
grant execute on function public.review_prize_payment_destination(uuid, text, text, text, uuid) to service_role;
grant execute on function public.finance_review_prize_payment(uuid, text, text, uuid) to service_role;
grant execute on function public.start_prize_payment_attempt(uuid, text, text, text, uuid) to service_role;
grant execute on function public.complete_prize_payment_attempt(uuid, text, text, text, text, text, text, uuid) to service_role;
grant execute on function public.cancel_prize_payment(uuid, text, uuid) to service_role;
grant execute on function public.reopen_prize_payment(uuid, text, uuid) to service_role;
grant execute on function public.add_prize_payment_evidence(uuid, uuid, text, text, text, text, text, bigint, text, uuid) to service_role;
grant execute on function public.request_prize_payment_reversal(uuid, text, uuid) to service_role;
grant execute on function public.review_prize_payment_reversal(uuid, text, text, uuid) to service_role;
grant execute on function public.start_prize_payment_reversal(uuid, text, uuid) to service_role;
grant execute on function public.complete_prize_payment_reversal(uuid, text, text, text, text, text, uuid) to service_role;
grant execute on function public.reconcile_prize_payment(uuid, text, text, numeric, text, date, text, uuid) to service_role;