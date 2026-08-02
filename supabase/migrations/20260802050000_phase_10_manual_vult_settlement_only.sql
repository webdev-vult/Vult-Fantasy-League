alter table public.prize_payment_attempts
  drop constraint if exists prize_payment_attempts_processor_check;

update public.prize_payment_attempts a
set processor = case
  when p.prize_type = 'non_cash' then 'manual_fulfilment'
  else 'manual_vult'
end
from public.prize_payments p
where p.id = a.payment_id
  and a.processor not in ('manual_vult', 'manual_fulfilment');

alter table public.prize_payment_attempts
  alter column processor set default 'manual_vult',
  add constraint prize_payment_attempts_processor_check
    check (processor in ('manual_vult', 'manual_fulfilment'));

create or replace function public.record_manual_prize_payment(
  p_payment_id uuid,
  p_transaction_reference text,
  p_evidence_path text,
  p_credited_at timestamptz,
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
  v_attempt_id uuid;
  v_attempt_number integer;
  v_transaction_reference text;
  v_credit_time timestamptz;
  v_processor text;
  v_idempotency_key text;
begin
  v_admin_role := private.require_service_admin(
    p_requested_by,
    array['super_admin', 'finance_officer']::text[]
  );

  v_transaction_reference := btrim(coalesce(p_transaction_reference, ''));
  if char_length(v_transaction_reference) < 4 then
    raise exception using message = 'A valid Vult transaction or fulfilment reference is required.';
  end if;
  if char_length(btrim(coalesce(p_notes, ''))) < 8 then
    raise exception using message = 'Payment confirmation notes must contain at least 8 characters.';
  end if;

  v_credit_time := coalesce(p_credited_at, now());
  if v_credit_time > now() + interval '5 minutes' then
    raise exception using message = 'The Vult credit time cannot be in the future.';
  end if;

  select * into v_payment
  from public.prize_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception using message = 'Prize settlement not found.';
  end if;
  if v_payment.status <> 'approved' then
    raise exception using message = 'Finance approval is required before a manual Vult payment can be recorded.';
  end if;
  if v_payment.finance_review_status <> 'approved' then
    raise exception using message = 'The settlement has not received Finance approval.';
  end if;
  if v_payment.prize_type in ('cash', 'mixed') then
    if v_payment.payment_method <> 'vult_wallet' then
      raise exception using message = 'Cash and mixed prizes must be settled to the verified Vult account.';
    end if;
    if v_payment.destination_status <> 'verified'
      or nullif(btrim(coalesce(v_payment.destination_reference, '')), '') is null
    then
      raise exception using message = 'A verified Vult destination is required before recording payment.';
    end if;
    v_processor := 'manual_vult';
  else
    if v_payment.destination_status <> 'not_required' then
      raise exception using message = 'The non-cash fulfilment destination state is invalid.';
    end if;
    v_processor := 'manual_fulfilment';
  end if;

  if exists (
    select 1
    from public.prize_payment_attempts
    where payment_id = p_payment_id
      and status = 'initiated'
  ) then
    raise exception using message = 'An unfinished payment attempt already exists for this settlement.';
  end if;

  v_attempt_number := v_payment.attempt_count + 1;
  v_idempotency_key := 'manual-' || p_payment_id::text || '-' || v_attempt_number::text;

  insert into public.prize_payment_attempts(
    payment_id,
    attempt_number,
    idempotency_key,
    processor,
    status,
    amount,
    currency,
    destination_reference,
    transaction_reference,
    evidence_path,
    requested_by,
    started_at,
    completed_at,
    notes,
    metadata
  ) values (
    p_payment_id,
    v_attempt_number,
    v_idempotency_key,
    v_processor,
    'succeeded',
    v_payment.amount,
    v_payment.currency,
    v_payment.destination_reference,
    v_transaction_reference,
    nullif(btrim(coalesce(p_evidence_path, '')), ''),
    p_requested_by,
    now(),
    v_credit_time,
    btrim(p_notes),
    jsonb_build_object(
      'actor_role', v_admin_role,
      'execution_mode', 'external_manual_vult',
      'credited_in_vult_system', true,
      'recorded_after_credit_confirmation', true
    )
  ) returning id into v_attempt_id;

  update public.prize_payments
  set status = 'paid',
      current_attempt_id = v_attempt_id,
      attempt_count = v_attempt_number,
      processing_started_at = null,
      transaction_reference = v_transaction_reference,
      evidence_path = nullif(btrim(coalesce(p_evidence_path, '')), ''),
      paid_by = p_requested_by,
      paid_at = v_credit_time,
      reconciliation_status = case when prize_type = 'non_cash' then 'not_required' else 'pending' end,
      failed_at = null,
      failure_code = null,
      failure_reason = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'execution_mode', 'external_manual_vult',
        'payment_recorded_at', now(),
        'credited_in_vult_system', true
      )
  where id = p_payment_id;

  select * into v_candidate
  from public.winner_candidates
  where id = v_payment.winner_candidate_id
  for update;

  if v_candidate.status <> 'payment_pending' then
    raise exception using message = 'The winner is not awaiting payment confirmation.';
  end if;

  update public.winner_candidates
  set status = 'paid'
  where id = v_payment.winner_candidate_id;

  insert into public.winner_candidate_status_history(
    candidate_id,
    from_status,
    to_status,
    action,
    actor_user_id,
    notes,
    metadata
  ) values (
    v_payment.winner_candidate_id,
    'payment_pending',
    'paid',
    'manual_vult_payment_recorded',
    p_requested_by,
    btrim(p_notes),
    jsonb_build_object(
      'payment_id', p_payment_id,
      'attempt_id', v_attempt_id,
      'transaction_reference', v_transaction_reference,
      'credited_at', v_credit_time
    )
  );

  perform private.record_prize_payment_transition(
    p_payment_id,
    v_payment.status,
    'paid',
    'manual_vult_payment_recorded',
    p_requested_by,
    p_notes,
    jsonb_build_object(
      'attempt_id', v_attempt_id,
      'transaction_reference', v_transaction_reference,
      'credited_at', v_credit_time,
      'destination_reference', v_payment.destination_reference,
      'actor_role', v_admin_role,
      'execution_mode', 'external_manual_vult'
    )
  );

  if nullif(btrim(coalesce(p_evidence_path, '')), '') is not null then
    insert into public.prize_payment_evidence(
      payment_id,
      attempt_id,
      evidence_type,
      storage_path,
      notes,
      uploaded_by
    ) values (
      p_payment_id,
      v_attempt_id,
      case when v_payment.prize_type = 'non_cash'
        then 'non_cash_fulfilment'
        else 'payment_receipt'
      end,
      btrim(p_evidence_path),
      btrim(p_notes),
      p_requested_by
    );
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (
    p_requested_by,
    'manual_vult_payment_recorded',
    'prize_payment',
    p_payment_id::text,
    jsonb_build_object(
      'attempt_id', v_attempt_id,
      'transaction_reference', v_transaction_reference,
      'credited_at', v_credit_time,
      'destination_reference', v_payment.destination_reference,
      'amount', v_payment.amount,
      'currency', v_payment.currency,
      'actor_role', v_admin_role
    )
  );

  return p_payment_id;
end;
$$;

revoke all on function public.record_manual_prize_payment(uuid, text, text, timestamptz, text, uuid) from public;
revoke all on function public.record_manual_prize_payment(uuid, text, text, timestamptz, text, uuid) from anon;
revoke all on function public.record_manual_prize_payment(uuid, text, text, timestamptz, text, uuid) from authenticated;
grant execute on function public.record_manual_prize_payment(uuid, text, text, timestamptz, text, uuid) to service_role;

revoke execute on function public.start_prize_payment_attempt(uuid, text, text, text, uuid) from service_role;
revoke execute on function public.complete_prize_payment_attempt(uuid, text, text, text, text, text, text, uuid) from service_role;

comment on function public.record_manual_prize_payment(uuid, text, text, timestamptz, text, uuid)
is 'Records a prize only after Finance confirms the winner was credited manually in the main Vult system. This function never initiates a Vult transfer.';